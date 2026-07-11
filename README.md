# AI-Native Team Diagnostic

An interactive, self-scoring assessment that helps teams find out how AI-native their operating model actually is — not just whether they're using AI tools, but whether the way the team works has been redesigned around them.

Three versions live in this repo, each adding one layer of capability.

🌐 **Live site:** [shayeeboy.github.io/ai-native-diagnostic](https://shayeeboy.github.io/ai-native-diagnostic/) — landing page linking all three versions.

---

## Executive Summary

**Problem.** Teams adopting AI tools rarely have a shared, structured way to
assess how "AI-native" their operating model actually is. Readiness
conversations tend to happen informally and inconsistently — one person's
"we're pretty advanced" is another's "we've barely started" — which makes it
hard to prioritize where to invest next.

**User.** A team lead or functional manager who wants a fast, structured
readiness read for their own team, and — in the v3 shared version — a
manager or leadership group who wants to compare readiness *across* teams
in one place rather than reading fragmented spreadsheet answers.

**Success metric.** Primary: completion rate — % of started assessments
that reach the generated diagnosis. Secondary: for v3, number of teams
with at least one completed, shared result — as a proxy for whether the
tool is actually being used for comparison, not just solo reflection. (No
usage data has been collected yet — this is the metric I'd instrument
first if this moved from portfolio piece to something a real team used.)

**Key trade-off decisions.**
- **Persistence added incrementally (v1 → v2 → v3), not upfront.** Each
  version only added the next layer of infrastructure once the previous
  version's limitation was clear — avoided over-building a backend before
  confirming anyone needed multi-device or team-shared results.
- **Static front end (GitHub Pages) + thin Render API + Neon, over a single
  full-stack framework.** Kept the front end as plain static pages and the
  backend as a minimal Express API — trading some flexibility for near-zero
  hosting cost and fast iteration, appropriate for a v1 still validating
  whether the shared-comparison use case matters.
- **Browser print-to-PDF instead of a generated report file.** Simpler and
  zero-maintenance, at the cost of a less polished output than a
  purpose-built PDF export.

### How it works

The three versions below show how it works, each adding one layer — from a
zero-setup static page (v1), to browser-local auto-save (v2), to a shared
Express + Neon backend for team-wide comparison (v3).

---

## v1 — `v1/index.html`

The original build. Fully interactive, scores live, generates a diagnosis report at the bottom. Nothing is saved — close the tab and it's gone.

**Use this when:** someone wants to try the tool once with zero setup, or you're sharing it widely and don't want to explain any save/restore behavior.

🔗 [shayeeboy.github.io/ai-native-diagnostic/v1/](https://shayeeboy.github.io/ai-native-diagnostic/v1/)

## v2 — `v2/index.html`

Same diagnostic, plus auto-save. Answers save to the browser's local storage as you go, and a banner offers to restore your last session if you reopen it. A name field lets you label your saved session. Saving is local to one browser on one device — no team-wide visibility.

**Use this when:** someone might fill it out over multiple sittings on the same device.

🔗 [shayeeboy.github.io/ai-native-diagnostic/v2/](https://shayeeboy.github.io/ai-native-diagnostic/v2/)

## v3 — `v3/` + `v3-backend/`

Real shared persistence. A small Express + Postgres API backs the front end so everyone on the team can see everyone's completed diagnostics — not just their own.

**Use this when:** you want the team comparison view — not just "did I finish mine," but "where does the whole team land."

🔗 [shayeeboy.github.io/ai-native-diagnostic/v3/](https://shayeeboy.github.io/ai-native-diagnostic/v3/)

**Architecture:**
- **Front end:** `v3/index.html`, served via GitHub Pages alongside v1 and v2
- **Backend:** Node.js/Express API hosted on Render (free tier)
- **Database:** Postgres via Neon (free tier, no inactivity expiry)

---

## Repo layout

```
.
├── v1/
│   └── index.html              # static, no persistence
├── v2/
│   └── index.html              # static, browser-local auto-save
├── v3/
│   └── index.html              # static front end, calls the Render API
├── v3-backend/
│   ├── server.js               # Express API (4 CRUD endpoints)
│   ├── db/
│   │   ├── schema.sql          # Postgres table definition
│   │   ├── migrate.js          # applies schema.sql to DATABASE_URL
│   │   └── pool.js             # shared Postgres connection pool
│   ├── package.json
│   ├── .env.example
│   └── README.md               # v3 backend setup and deploy instructions
├── render.yaml                 # declarative Render deploy config
└── README.md                   # this file
```

## Hosting summary

| Version | Front end | Back end | Live link |
|---|---|---|---|
| v1 | GitHub Pages | — | [/v1/](https://shayeeboy.github.io/ai-native-diagnostic/v1/) |
| v2 | GitHub Pages | — | [/v2/](https://shayeeboy.github.io/ai-native-diagnostic/v2/) |
| v3 | GitHub Pages | Render + Neon Postgres | [/v3/](https://shayeeboy.github.io/ai-native-diagnostic/v3/) |

## Architecture

The v3 request path, end to end:

```
User
 ↓
GitHub Pages Frontend
 ↓ API calls
Render Express Backend
 ↓
Neon PostgreSQL
```

(v1 and v2 are frontend-only — they stop at the GitHub Pages layer, with v2 persisting to the browser's own storage.)

### How the versions evolved

Each version adds one layer of capability — from a throwaway static page, to local persistence, to a full shared-backend team app:

| v1 — Static | v2 — Auto-save | v3 — Shared |
|:---:|:---:|:---:|
| <img src="assets/v1-architecture.svg" alt="v1 architecture: User → GitHub Pages" width="220"> | <img src="assets/v2-architecture.svg" alt="v2 architecture: User → GitHub Pages → browser localStorage" width="220"> | <img src="assets/v3-architecture.svg" alt="v3 architecture: User → GitHub Pages → Render Express API → Neon PostgreSQL" width="220"> |
| No persistence | Browser-local save | Render + Neon backend |

## What's the same across all three versions

- 5-step flow: workflow map → bottleneck → readiness scoring (5 categories, 100 points) → operating model canvas → 90-day plan
- Live score readout pinned to the top as you fill it in
- Generated diagnosis at the end: score, archetype (Legacy Operator → Fully Reconfigured), per-category breakdown, and a synthesis of your bottleneck against where your time actually goes
- "Save as PDF" via the browser print dialog
- No tracking or analytics

## Roadmap

All three versions are live and reachable from one place — and form part of my [broader portfolio](https://github.com/shayeeboy) alongside my other projects:

- [v1 — try once, nothing saved](https://shayeeboy.github.io/ai-native-diagnostic/v1/)
- [v2 — browser-local auto-save](https://shayeeboy.github.io/ai-native-diagnostic/v2/)
- [v3 — shared team persistence](https://shayeeboy.github.io/ai-native-diagnostic/v3/)

## Source & credit

Built from [`AI_Native_Team_Diagnostic.md`](AI_Native_Team_Diagnostic.md) included in this repo.

The worksheet is from **"The AI Product Operating Model: How AI-Native Companies Win"** by **Aakash Gupta** and **Rohan Varma**, published in the [Product Growth](https://www.news.aakashg.com/p/ai-product-operating-model) newsletter on Substack. All credit for the underlying framework goes to the original authors; this repo is an interactive implementation of their diagnostic.

## What I practiced

- Used Claude Code to build and iterate through 3 versions
- Practiced Git branching, commits, and GitHub publishing
- Deployed frontend with GitHub Pages
- Deployed backend API with Render
- Connected PostgreSQL using Neon
- Managed environment variables and DATABASE_URL securely

## Product Manager reflection

This project helped me understand how AI-assisted development can move a product idea from concept to working prototype, while still requiring product judgment around scope, user experience, data persistence, deployment, and security.
