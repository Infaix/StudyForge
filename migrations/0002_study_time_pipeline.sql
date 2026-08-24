-- StudyForge migration 0002: authoritative study-time pipeline
-- Fixes schema drift (columns referenced by code but missing) and adds
-- segment-level idempotency + second-precision durations for timers.

-- 1. xp_transactions.event_type was referenced by awardXpAtomically and the
--    study endpoints but never existed in 0001_init.sql.
ALTER TABLE xp_transactions ADD COLUMN event_type TEXT NOT NULL DEFAULT 'study_session';

CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_related
  ON xp_transactions(user_id, related_id);

-- 2. Extend study_sessions to support timer segments:
--    - duration_seconds: exact seconds (legacy rows keep duration in minutes)
--    - segment_id: client-generated unique id for idempotent submissions
--    - mode: stopwatch | countdown | pomodoro | custom | manual
--    - completed: session reached its natural end
--    - created_at: server-side insert time
ALTER TABLE study_sessions ADD COLUMN duration_seconds INTEGER;
ALTER TABLE study_sessions ADD COLUMN segment_id TEXT;
ALTER TABLE study_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE study_sessions ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE study_sessions ADD COLUMN created_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_study_sessions_segment_id
  ON study_sessions(segment_id) WHERE segment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_created
  ON study_sessions(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_start
  ON study_sessions(user_id, start_time);

-- 3. Server-side XP accounting state on the profile:
--    - xp_minutes_total: lifetime completed minutes already converted to XP
--      (drives the +1 XP / 30min streak-free bonus monotonically across segments)
--    - xp_carry_seconds: sub-minute remainder carried between segments so no
--      studied second is lost to rounding
ALTER TABLE user_profiles ADD COLUMN xp_minutes_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN xp_carry_seconds INTEGER NOT NULL DEFAULT 0;

