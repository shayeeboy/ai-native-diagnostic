// AI-Native Team Diagnostic — v3 backend
// A small Express API that lets a Carrd-embedded front end save a person's
// diagnostic results and list everyone's results for the team view.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db/pool');

const app = express();
app.use(express.json({ limit: '256kb' })); // diagnostic answers are small; this is a generous ceiling

// ---------- CORS ----------
// Only origins listed in ALLOWED_ORIGINS can call this API.
// Add your Carrd site's URL (and custom domain, once set up) to that env var.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow tools like curl/Postman (no origin header) and anything in the allowlist.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  }
}));

// ---------- Health check ----------
// Render (and you) can hit this to confirm the service and DB are both up.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'unreachable', message: err.message });
  }
});

// ---------- Create or update a session ----------
// The front end sends the whole answer set each time it saves (same shape
// as v2's local serializeState()). If `id` is included, this updates that
// row instead of creating a new one — lets a person resume and re-save.
app.post('/api/sessions', async (req, res) => {
  const {
    id,
    userName,
    flowStages,
    bottleneck,
    bnWhy,
    ratings,
    totalScore,
    canvas,
    ssap,
    finalAnswer
  } = req.body;

  if (!userName || typeof userName !== 'string' || !userName.trim()) {
    return res.status(400).json({ error: 'userName is required.' });
  }

  try {
    let result;
    if (id) {
      result = await pool.query(
        `UPDATE sessions SET
           user_name = $1, flow_stages = $2, bottleneck = $3, bottleneck_why = $4,
           ratings = $5, total_score = $6, canvas = $7, ssap = $8, final_answer = $9,
           updated_at = now()
         WHERE id = $10
         RETURNING *`,
        [userName.trim(), JSON.stringify(flowStages || []), bottleneck || null, bnWhy || null,
         JSON.stringify(ratings || {}), totalScore || 0, JSON.stringify(canvas || {}),
         JSON.stringify(ssap || {}), finalAnswer || null, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Session not found.' });
      }
    } else {
      result = await pool.query(
        `INSERT INTO sessions
           (user_name, flow_stages, bottleneck, bottleneck_why, ratings, total_score, canvas, ssap, final_answer)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [userName.trim(), JSON.stringify(flowStages || []), bottleneck || null, bnWhy || null,
         JSON.stringify(ratings || {}), totalScore || 0, JSON.stringify(canvas || {}),
         JSON.stringify(ssap || {}), finalAnswer || null]
      );
    }
    res.status(id ? 200 : 201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/sessions failed:', err.message);
    res.status(500).json({ error: 'Could not save session.' });
  }
});

// ---------- List all sessions (the team view) ----------
// Returns everyone's saved results, newest first. Keeps payload light —
// full free-text fields are included since the team explicitly opted into
// shared visibility, but this is the endpoint to add pagination to first
// if the team grows.
app.get('/api/sessions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_name, flow_stages, bottleneck, bottleneck_why,
              ratings, total_score, canvas, ssap, final_answer,
              created_at, updated_at
       FROM sessions
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/sessions failed:', err.message);
    res.status(500).json({ error: 'Could not load sessions.' });
  }
});

// ---------- Get one session ----------
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /api/sessions/:id failed:', err.message);
    res.status(500).json({ error: 'Could not load session.' });
  }
});

// ---------- Delete a session ----------
app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM sessions WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    res.json({ deleted: result.rows[0].id });
  } catch (err) {
    console.error('DELETE /api/sessions/:id failed:', err.message);
    res.status(500).json({ error: 'Could not delete session.' });
  }
});

// ---------- Portfolio snapshot ----------
// A machine-readable ReadinessSnapshot that aggregates every saved diagnostic
// into per-capability averages, for downstream consumers (e.g. the AI Product &
// Leadership Studio). Uses the same scoring the tool itself uses: five capability
// groups, four statements each rated 1-5 (group max 20), total 0-100. Returns an
// honest empty-state when no assessments have been recorded yet.
const CAPABILITY_GROUPS = ['Workflow', 'Team Design', 'Context', 'AI Integration', 'Throughput'];
const ITEMS_PER_GROUP = 4;
const MAX_PER_GROUP = ITEMS_PER_GROUP * 5;

app.get('/api/snapshot', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT ratings, total_score, updated_at FROM sessions');
    const sessionCount = rows.length;
    const lastUpdated = rows.reduce((mx, r) => (!mx || r.updated_at > mx ? r.updated_at : mx), null);
    const base = { productId: 'ai-native-diagnostic', sessionCount, lastUpdated, provenance: 'live:aggregate(sessions)' };

    if (sessionCount === 0) {
      return res.json({
        ...base,
        teamMaturityScore: null,
        aiReadinessScore: null,
        adoptionScore: null,
        capabilityAssessment: [],
        riskIndicators: [],
        recommendations: ['No assessments recorded yet — complete the diagnostic to populate live readiness data.'],
      });
    }

    // Per-capability average across all sessions, scaled to 0-100.
    const groupTotals = CAPABILITY_GROUPS.map(() => 0);
    for (const r of rows) {
      const ratings = typeof r.ratings === 'string' ? JSON.parse(r.ratings) : (r.ratings || {});
      CAPABILITY_GROUPS.forEach((_, gi) => {
        let sum = 0;
        for (let ii = 0; ii < ITEMS_PER_GROUP; ii++) sum += Number(ratings[`${gi}-${ii}`] || 0);
        groupTotals[gi] += (sum / MAX_PER_GROUP) * 100;
      });
    }
    const capabilityAssessment = CAPABILITY_GROUPS.map((dimension, gi) => ({
      dimension,
      score: Math.round(groupTotals[gi] / sessionCount),
    }));

    const aiReadinessScore = Math.round(rows.reduce((s, r) => s + Number(r.total_score || 0), 0) / sessionCount);
    const teamMaturityScore = Math.round(capabilityAssessment.reduce((s, c) => s + c.score, 0) / capabilityAssessment.length);
    const aiIntegration = capabilityAssessment.find((c) => c.dimension === 'AI Integration');
    const adoptionScore = aiIntegration ? aiIntegration.score : null; // AI-integration maturity as an adoption proxy

    const sev = (score) => (score < 40 ? 'high' : score < 55 ? 'medium' : 'low');
    const riskIndicators = capabilityAssessment
      .filter((c) => c.score < 55)
      .map((c) => ({ label: `${c.dimension} maturity below target`, severity: sev(c.score) }));

    const weakest = [...capabilityAssessment].sort((a, b) => a.score - b.score).slice(0, 2);
    const recommendations = weakest.map(
      (c) => `Strengthen ${c.dimension} — averaging ${c.score}/100 across ${sessionCount} assessment(s).`
    );

    res.json({ ...base, teamMaturityScore, aiReadinessScore, adoptionScore, capabilityAssessment, riskIndicators, recommendations });
  } catch (err) {
    console.error('GET /api/snapshot failed:', err.message);
    res.status(500).json({ error: 'Could not build snapshot.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI-Native Diagnostic API listening on port ${PORT}`);
});
