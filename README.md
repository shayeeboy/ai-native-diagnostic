# AI-Native Team Diagnostic

An interactive, self-scoring assessment that turns the original AI-Native Team Diagnostic worksheet into a tool teams can fill out, score live, and get a generated readiness diagnosis from.

Three versions live in this repo, each a different point on the "how much persistence do you need" spectrum.

---

## v1 — `v1/index.html`

The original build. Fully interactive, scores live, generates the diagnosis report at the bottom. Nothing is saved anywhere — close the tab and it's gone.

**Use this when:** someone wants to try the tool once, with zero setup, or you're sharing it widely and don't want to explain any save/restore behavior.

## v2 — `v2/index.html`

Same diagnostic, plus auto-save to the browser's local storage. A banner offers to restore your last session if you reopen the file. Saving is local to one browser on one device — no team-wide visibility.

**Use this when:** someone might fill it out over multiple sittings on the same device.

## v3 — `v3/index.html` + `v3-backend/`

Real shared persistence: a small Express + Postgres API (see `v3-backend/README.md`) backs `v3/index.html`, so everyone on the team can see everyone's completed diagnostics in one place. The front end is a plain static page hosted on GitHub Pages, exactly like v1/v2 — it just calls the API instead of `localStorage`, and adds a team view listing everyone's results.

**Use this when:** you want the team comparison view — not just "did I finish mine," but "where does the whole team land."

**Architecture:**
- **Front end:** static `v3/index.html` on GitHub Pages — set `API_BASE_URL` near the top of its `<script>` to your Render URL
- **Backend:** Node.js/Express API, hosted on Render, free tier
- **Database:** Postgres via Neon, free tier, no inactivity expiry
- **CORS:** the front end's origin (e.g. `https://yourusername.github.io`) must be listed in the backend's `ALLOWED_ORIGINS`

> A Carrd-embedded variant is still possible — see `v3-backend/carrd-integration-reference.html` — but GitHub Pages keeps all three versions hosted the same way.

Full setup and deploy steps are in `v3-backend/README.md`.

---

## Repo layout

```
.
├── v1/
│   └── index.html              # static, no persistence
├── v2/
│   └── index.html              # static, browser-local auto-save
├── v3/
│   └── index.html              # static, shared persistence via the API below
├── v3-backend/
│   ├── server.js                # Express API
│   ├── db/
│   │   ├── schema.sql            # Postgres table definition
│   │   ├── migrate.js            # applies schema.sql to DATABASE_URL
│   │   └── pool.js               # shared Postgres connection pool
│   ├── carrd-integration-reference.html  # how to wire Carrd's embed to this API
│   ├── package.json
│   ├── .env.example
│   └── README.md                 # v3-specific setup and deploy instructions
├── render.yaml                  # declarative Render deploy config for v3-backend
└── README.md                    # this file
```

## Hosting summary

| Version | Hosted on | Link type |
|---|---|---|
| v1 | GitHub Pages | `https://yourusername.github.io/ai-native-diagnostic/v1/` |
| v2 | GitHub Pages | `https://yourusername.github.io/ai-native-diagnostic/v2/` |
| v3 frontend | GitHub Pages | `https://yourusername.github.io/ai-native-diagnostic/v3/` |
| v3 backend | Render | `https://ai-native-diagnostic-api.onrender.com` (or a GoDaddy-CNAMEd custom domain) |

All three front ends are static files on GitHub Pages; v3's backend runs on Render. GoDaddy, if used, is **domain registrar and DNS only** — it hosts no application code, and can optionally point friendly subdomains at GitHub Pages / Render.

## What's the same across all three

- 5-step flow: workflow map → bottleneck → readiness scoring (5 categories, 100 points) → operating model canvas → 90-day plan
- Live score readout pinned to the top as you fill it in
- Generated diagnosis at the end: score, archetype (e.g. "Legacy Operator" → "Fully Reconfigured"), category breakdown, and a synthesis of your bottleneck against where your time actually goes
- "Save as PDF" via the browser's print dialog

## Source

`AI_Native_Team_Diagnostic.md` — the original worksheet this tool was built from.
