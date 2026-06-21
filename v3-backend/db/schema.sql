-- AI-Native Team Diagnostic — schema for shared/team-visible results.
-- Run via: npm run migrate
-- (or paste directly into Neon's SQL editor)

CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name     TEXT NOT NULL,

  -- Step 1: flow stages where time concentrates (array of stage names)
  flow_stages   JSONB NOT NULL DEFAULT '[]',

  -- Step 2: bottleneck
  bottleneck    TEXT,
  bottleneck_why TEXT,

  -- Step 3: ratings — keyed "groupIdx-itemIdx" -> 1-5, plus the rolled-up total
  ratings       JSONB NOT NULL DEFAULT '{}',
  total_score   INTEGER NOT NULL DEFAULT 0,

  -- Step 4: operating model canvas (current + future state, 10 fields)
  canvas        JSONB NOT NULL DEFAULT '{}',

  -- Step 5: Stop/Start/Automate/Protect + final question
  ssap          JSONB NOT NULL DEFAULT '{}',
  final_answer  TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Speeds up "list everyone's results, newest first" on the team view
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions (created_at DESC);
