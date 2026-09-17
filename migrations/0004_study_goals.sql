-- StudyForge D1 Schema — Study Goals
-- Additive migration: weekly study goals (overall + per-subject).
--
-- subject_id NULL  => the overall weekly goal ("study X hours per week").
-- period is a free-form TEXT now (CHECK-capped to 'weekly' only) so future goal
-- periods (daily/monthly/custom) can be introduced by widening the CHECK,
-- NOT by a destructive table rewrite.
-- target_seconds is validated at the application layer AND by the CHECK.
-- Partial unique indexes make duplicate goals structurally impossible:
--   one overall goal per user, one goal per (user, subject).

CREATE TABLE IF NOT EXISTS study_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE CASCADE,
  period TEXT NOT NULL DEFAULT 'weekly' CHECK (period IN ('weekly')),
  target_seconds INTEGER NOT NULL CHECK (target_seconds > 0),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_study_goals_user_id ON study_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_study_goals_subject_id ON study_goals(subject_id);

-- One overall weekly goal per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_study_goals_user_overall
  ON study_goals(user_id) WHERE subject_id IS NULL;

-- One goal per (user, subject).
CREATE UNIQUE INDEX IF NOT EXISTS idx_study_goals_user_subject
  ON study_goals(user_id, subject_id) WHERE subject_id IS NOT NULL;