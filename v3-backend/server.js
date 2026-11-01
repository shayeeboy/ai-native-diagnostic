// AI-Native Team Diagnostic — v3 backend
// A small Express API that lets a Carrd-embedded front end save a person's
// diagnostic results and list everyone's results for the team view. Reading the
// team view needs the team access code; a single session needs its edit key.

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

// ---------- Access control ----------
// Two credentials, both checked server-side:
//  - TEAM_ACCESS_CODE (env): shared by the team; required to list everyone's
//    results. Unset → the team view is closed (fails closed, never public).
//  - per-session edit key: issued once when a session is created and kept in the
//    owner's browser; required to read, update or delete that one session. Only
//    its SHA-256 hash is stored. Rows created before keys existed can be
//    reached with the team code only.
const crypto = require('crypto');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function hasTeamCode(req) {
  const code = process.env.TEAM_ACCESS_CODE;
  const given = req.get('X-Team-Code');
  return Boolean(code && given && safeEqual(given, code));
}

function ownsSession(req, row) {
  const key = req.get('X-Session-Key');
  return Boolean(row.edit_key_hash && key && safeEqual(sha256(key), row.edit_key_hash));
}

const canAccess = (req, row) => ownsSession(req, row) || hasTeamCode(req);

// Never send the key hash back to a client.
function publicRow(row) {
  const { edit_key_hash, ...rest } = row;
  return rest;
}

// Additive schema change for the edit key, applied on boot (and in schema.sql).
// Routes that touch the column await it, so the first request after a deploy
// can't race the migration.
const schemaReady = pool
  .query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS edit_key_hash TEXT')
  .catch((err) => console.error('Schema check failed (edit_key_hash):', err.message));

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
    await schemaReady;
    let result;
    let editKey = null;
    if (id) {
      const existing = await pool.query('SELECT id, edit_key_hash FROM sessions WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Session not found.' });
      }
      if (!canAccess(req, existing.rows[0])) {
        return res.status(403).json({ error: 'Not allowed to update this session.' });
      }
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
      editKey = crypto.randomBytes(32).toString('hex');
      result = await pool.query(
        `INSERT INTO sessions
           (user_name, flow_stages, bottleneck, bottleneck_why, ratings, total_score, canvas, ssap, final_answer, edit_key_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [userName.trim(), JSON.stringify(flowStages || []), bottleneck || null, bnWhy || null,
         JSON.stringify(ratings || {}), totalScore || 0, JSON.stringify(canvas || {}),
         JSON.stringify(ssap || {}), finalAnswer || null, sha256(editKey)]
      );
    }
    const body = publicRow(result.rows[0]);
    // The edit key is returned exactly once, on create; only its hash is stored.
    res.status(id ? 200 : 201).json(editKey ? { ...body, editKey } : body);
  } catch (err) {
    console.error('POST /api/sessions failed:', err.message);
    res.status(500).json({ error: 'Could not save session.' });
  }
});

// ---------- List all sessions (the team view) ----------
// Returns everyone's saved results, newest first — only to callers with the
// team access code, and only the fields the team view shows (no free text).
app.get('/api/sessions', async (req, res) => {
  if (!hasTeamCode(req)) {
    return res.status(403).json({ error: 'Team access code required.' });
  }
  try {
    const result = await pool.query(
      `SELECT id, user_name, bottleneck, total_score, created_at, updated_at
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
    await schemaReady;
    const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    if (!canAccess(req, result.rows[0])) {
      return res.status(403).json({ error: 'Not allowed to read this session.' });
    }
    res.json(publicRow(result.rows[0]));
  } catch (err) {
    console.error('GET /api/sessions/:id failed:', err.message);
    res.status(500).json({ error: 'Could not load session.' });
  }
});

// ---------- Delete a session ----------
app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await schemaReady;
    const existing = await pool.query('SELECT id, edit_key_hash FROM sessions WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    if (!canAccess(req, existing.rows[0])) {
      return res.status(403).json({ error: 'Not allowed to delete this session.' });
    }
    const result = await pool.query('DELETE FROM sessions WHERE id = $1 RETURNING id', [req.params.id]);
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

    // Honest observability: process liveness + recent-usage/freshness derived from rows already fetched.
    // No request telemetry exists here, so latency/error-rate/throughput are intentionally omitted.
    const now = Date.now();
    const withinDays = (ts, d) => ts && (now - new Date(ts).getTime()) <= d * 864e5;
    const scored = rows.filter((r) => Number(r.total_score) > 0).length;
    const observability = {
      uptimeSeconds: Math.round(process.uptime()),
      startedAt: new Date(now - process.uptime() * 1000).toISOString(),
      activeSessions7d: rows.filter((r) => withinDays(r.updated_at, 7)).length,
      activeSessions30d: rows.filter((r) => withinDays(r.updated_at, 30)).length,
      freshnessDays: lastUpdated ? Math.floor((now - new Date(lastUpdated).getTime()) / 864e5) : null,
      completionRate: sessionCount ? Math.round((scored / sessionCount) * 100) : null,
    };

    if (sessionCount === 0) {
      return res.json({
        ...base,
        observability,
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

    res.json({ ...base, observability, teamMaturityScore, aiReadinessScore, adoptionScore, capabilityAssessment, riskIndicators, recommendations });
  } catch (err) {
    console.error('GET /api/snapshot failed:', err.message);
    res.status(500).json({ error: 'Could not build snapshot.' });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`AI-Native Diagnostic API listening on port ${PORT}`);
  });
}

module.exports = app; // for tests
