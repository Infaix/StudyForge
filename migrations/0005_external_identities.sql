-- Prepare a non-destructive link between a canonical external identity and
-- an existing Study profile. Linking is performed only by a trusted server
-- flow after the external identity has been verified.
CREATE TABLE IF NOT EXISTS external_identities (
  provider TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  study_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider, external_user_id),
  UNIQUE (provider, study_user_id),
  FOREIGN KEY (study_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_external_identities_study_user
  ON external_identities(study_user_id);
