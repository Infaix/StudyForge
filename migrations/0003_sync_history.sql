-- StudyForge migration 0003: cross-device sync + session history support
--
-- 1. session_id: explicit grouping key for checkpoint segments that belong to
--    one logical timer run. Previously the session could only be recovered by
--    parsing the segment_id prefix; storing it directly makes history grouping
--    and per-session queries index-friendly. Backfilled from segment_id where
--    the `{sessionId}#{counter}` convention was used.
-- 2. device_id: stable per-browser identifier so segments from different
--    devices merge by unique segmentId while still allowing "another active
--    session on this account" detection.
-- 3. Targeted indexes for the dominant access patterns (stats aggregation by
--    user+time, history grouping by user+session, subject breakdowns).

ALTER TABLE study_sessions ADD COLUMN session_id TEXT;
ALTER TABLE study_sessions ADD COLUMN device_id TEXT;

-- Backfill session_id from the segment_id convention `{session}#...`.
-- Legacy rows whose segment_id has no '#' keep session_id NULL (they group
-- by their own id in the history query fallback).
UPDATE study_sessions
SET session_id = substr(segment_id, 1, instr(segment_id, '#') - 1)
WHERE session_id IS NULL
  AND segment_id IS NOT NULL
  AND instr(segment_id, '#') > 0;

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_session
  ON study_sessions(user_id, session_id);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_subject_start
  ON study_sessions(user_id, subject_id, start_time);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_device_start
  ON study_sessions(user_id, device_id, start_time);
