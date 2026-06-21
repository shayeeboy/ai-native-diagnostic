# v3 Backend — AI-Native Team Diagnostic API

A small Express + Postgres API that lets the diagnostic tool save results to a shared database, so a team can see everyone's completed diagnostics — not just their own browser's.

This is the backend half of v3. The front end is the same diagnostic HTML/JS as v1/v2, embedded in a Carrd page, calling this API instead of (or in addition to) `localStorage`. See `carrd-integration-reference.html` for the exact swap.

## Stack

- **Node.js + Express** — API server
- **Postgres** (built/tested against [Neon](https://neon.tech)'s free tier) — shared database
- **`pg`** — driver, no ORM (kept deliberately minimal for a 5-table-column app)
- **Render** — hosting, free tier, deploys straight from this repo

## Local setup

```bash
cd v3-backend
npm install
cp .env.example .env
# edit .env: paste your Neon connection string into DATABASE_URL
npm run migrate   # creates the sessions table
npm run dev        # starts the API on http://localhost:3000
```

Check it's alive:
```bash
curl http://localhost:3000/health
# {"status":"ok","db":"connected"}
```

## API reference

| Method | Path | Does |
|---|---|---|
| `GET` | `/health` | Confirms the API and DB connection are both up |
| `POST` | `/api/sessions` | Create a session (omit `id`) or update one (include `id`) |
| `GET` | `/api/sessions` | List all saved sessions, newest first — the team view |
| `GET` | `/api/sessions/:id` | Fetch one session |
| `DELETE` | `/api/sessions/:id` | Delete one session |

`POST /api/sessions` body shape (same fields as v2's local save, plus `userName`):

```json
{
  "userName": "Alex",
  "flowStages": ["Discovery", "QA"],
  "bottleneck": "Validation",
  "bnWhy": "We ship but rarely know if it worked.",
  "ratings": { "0-0": 4, "0-1": 3 },
  "totalScore": 62,
  "canvas": { "cur-inputs": "...", "fut-inputs": "..." },
  "ssap": { "ssap-stop": "...", "ssap-start": "..." },
  "finalAnswer": "Insight, not execution."
}
```

## Deploying to Render

1. Push this repo to GitHub (the whole repo, not just this folder)
2. In Render: **New → Web Service** → connect the repo
3. Set **Root Directory** to `v3-backend`
4. Build command: `npm install` · Start command: `npm start`
5. Add environment variables in the Render dashboard:
   - `DATABASE_URL` — your Neon connection string
   - `ALLOWED_ORIGINS` — your Carrd site's URL(s), comma-separated (e.g. `https://yourproject.carrd.co`)
6. Deploy. Render gives you a URL like `https://ai-native-diagnostic-api.onrender.com`
7. Run the migration once against the live database — either run `npm run migrate` locally with the same `DATABASE_URL`, or paste `db/schema.sql` into Neon's SQL editor directly

Alternatively, use the `render.yaml` in the repo root with Render's **New → Blueprint** option to provision the service declaratively — you'll still set `DATABASE_URL` and `ALLOWED_ORIGINS` by hand in the dashboard, since secrets are intentionally excluded from that file.

### Free tier behavior to know

- Render's free web service **sleeps after 15 minutes of inactivity** and takes ~30–60 seconds to wake on the next request. Fine for an internal team tool used occasionally; not built for instant response at all times.
- Neon's free Postgres has **no expiry and no inactivity pause** (unlike some alternatives) — the data itself is safe even if nobody uses the tool for a while.

## Connecting Carrd

1. In Carrd, add an **Embed → Code** element to the page where the diagnostic should appear
2. Paste in the diagnostic's HTML/CSS (from v2) plus the adapted `Store` object from `carrd-integration-reference.html`
3. Replace `API_BASE_URL` in that script with your real Render URL (or a GoDaddy CNAME pointing at it, e.g. `api.yourdomain.com`)
4. Re-deploy/republish the Carrd site

## Security notes for a team tool like this

- There's no authentication on these endpoints by design — anyone with the API URL can read all sessions and submit new ones, matching "team — everyone using this link can see each other's results." If this ever needs to be restricted to known teammates, the next step is a shared access code or simple per-user token, not a separate project — flag it and it can be added.
- `ALLOWED_ORIGINS` is the only access control in place right now — it stops random websites from calling the API via browser JS, but doesn't stop direct API calls (e.g. via curl). That's an acceptable tradeoff for an internal team tool; revisit if this ever becomes public-facing.
