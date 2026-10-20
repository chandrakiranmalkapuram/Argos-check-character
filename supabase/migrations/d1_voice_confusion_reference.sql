-- ============================================================================
-- Cloudflare D1 (SQLite) Schema: Voice Confusion Reference
-- Project: Check Character by Chandra
-- Note: Do NOT execute on production without explicit user approval.
-- Compatible with Cloudflare D1 Serverless SQL Database.
-- ============================================================================

CREATE TABLE IF NOT EXISTS voice_confusion_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  voiced_location TEXT NOT NULL,
  found_location TEXT NOT NULL,
  voiced_location_norm TEXT NOT NULL,
  found_location_norm TEXT NOT NULL,
  raw_voiced_location TEXT,
  raw_found_location TEXT,
  reason TEXT NOT NULL DEFAULT 'similar_sounding',
  details TEXT,
  status TEXT NOT NULL DEFAULT 'community_submitted', -- community_submitted, confirmed, flagged, archived
  provenance TEXT NOT NULL DEFAULT 'community_submitted', -- community_submitted, seed_observation, moderator_confirmed
  confirmations_count INTEGER NOT NULL DEFAULT 1,
  flag_count INTEGER NOT NULL DEFAULT 0,
  client_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_d1_vc_unique_pair
ON voice_confusion_reports (voiced_location_norm, found_location_norm);

CREATE INDEX IF NOT EXISTS idx_d1_vc_voiced
ON voice_confusion_reports (voiced_location_norm);

CREATE INDEX IF NOT EXISTS idx_d1_vc_found
ON voice_confusion_reports (found_location_norm);

CREATE INDEX IF NOT EXISTS idx_d1_vc_confirmations
ON voice_confusion_reports (confirmations_count DESC);

CREATE TABLE IF NOT EXISTS voice_confusion_confirmations (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES voice_confusion_reports(id) ON DELETE CASCADE,
  client_hash TEXT NOT NULL,
  confirmed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(report_id, client_hash)
);

CREATE TABLE IF NOT EXISTS voice_confusion_flags (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES voice_confusion_reports(id) ON DELETE CASCADE,
  client_hash TEXT NOT NULL,
  reason TEXT,
  flagged_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(report_id, client_hash)
);

CREATE TABLE IF NOT EXISTS voice_confusion_rate_limits (
  id TEXT PRIMARY KEY,
  client_hash TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Idempotent Seed Data (Requirement 3)
-- Safely handle both existing seed UUID and existing matching location pair under different UUID (F-01).
INSERT INTO voice_confusion_reports (
  id, user_id, voiced_location, found_location,
  voiced_location_norm, found_location_norm,
  raw_voiced_location, raw_found_location,
  reason, details, status, provenance, confirmations_count, flag_count
)
SELECT
  v.id, v.user_id, v.voiced_location, v.found_location,
  v.voiced_location_norm, v.found_location_norm,
  v.raw_voiced_location, v.raw_found_location,
  v.reason, v.details, v.status, v.provenance, v.confirmations_count, v.flag_count
FROM (
  SELECT
    '5eed0000-0000-4000-8000-000000000001' AS id, NULL AS user_id,
    '08MN' AS voiced_location, '20AN' AS found_location,
    '08MN' AS voiced_location_norm, '20AN' AS found_location_norm,
    '08MN' AS raw_voiced_location, '20AN' AS raw_found_location,
    'similar_sounding' AS reason,
    'Seed observation: Spoken "zero-eight" acoustically confused with "twenty" over radio, combined with nasal M/N confusion.' AS details,
    'community_submitted' AS status, 'seed_observation' AS provenance, 1 AS confirmations_count, 0 AS flag_count
  UNION ALL
  SELECT
    '5eed0000-0000-4000-8000-000000000002', NULL,
    '16ZG', '16JA', '16ZG', '16JA', '16ZG', '16JA',
    'similar_sounding',
    'Seed observation: Aisle 16 stockroom location: ZG confused with JA due to headset consonant sound compression.',
    'community_submitted', 'seed_observation', 1, 0
  UNION ALL
  SELECT
    '5eed0000-0000-4000-8000-000000000003', NULL,
    '81ZE', '50ER', '81ZE', '50ER', '81ZE', '50ER',
    'headset_misrecognition',
    'Seed observation: Spoken "eighty-one" masked as "fifty" in ambient stockroom background noise; ZE heard as ER.',
    'community_submitted', 'seed_observation', 1, 0
  UNION ALL
  SELECT
    '5eed0000-0000-4000-8000-000000000004', NULL,
    '01MM', 'Z01B', '01MM', 'Z01B', '01MM', 'Z01B',
    'other',
    'Seed observation: Headset phrased Bulk location Z01B as "ZERO ONE BULK BRAVO", which worker mistook for standard aisle 01MM ("ZERO ONE MIKE MIKE").',
    'community_submitted', 'seed_observation', 1, 0
) AS v
WHERE NOT EXISTS (
  SELECT 1 FROM voice_confusion_reports r
  WHERE r.id = v.id
     OR (
       r.voiced_location_norm = v.voiced_location_norm
       AND r.found_location_norm = v.found_location_norm
     )
)
ON CONFLICT (id) DO NOTHING;

