-- ============================================================================
-- Migration: Voice Confusion Reference & Shared Community Database
-- Project: Check Character by Chandra
-- Description:
--   1. Upgrades voice_confusion_reports with voiced_location and found_location terminology,
--      confirmations counter, flagging counter, and provenance tracking.
--   2. Adds unique index for (voiced_location_norm, found_location_norm) duplicate handling.
--   3. Creates voice_confusion_confirmations and voice_confusion_flags tables for abuse-safe tracking.
--   4. Creates atomic RPC functions:
--      - submit_voice_confusion_reference (idempotent, increments confirmations on duplicate)
--      - confirm_voice_confusion_observation
--      - flag_voice_confusion_observation
--   5. Updates Row Level Security (RLS) so newly submitted community observations are
--      immediately retrievable by all visitors.
--   6. Seeds the database idempotently with the four reference observations:
--      - 08MN -> 20AN (Store standard format)
--      - 16ZG -> 16JA (Store standard format, same aisle)
--      - 81ZE -> 50ER (Store standard format)
--      - 01MM -> Z01B (Store Bulk zone with special prefix Z)
BEGIN;

-- Advisory transaction lock to serialize migration execution across concurrent operators/processes
SELECT pg_advisory_xact_lock(hashtext('voice_confusion_reference_migration'));

-- 1. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Add columns to voice_confusion_reports if not already present
DO $$
BEGIN
  -- user_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_confusion_reports' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE voice_confusion_reports ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  -- voiced_location
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_confusion_reports' AND column_name = 'voiced_location'
  ) THEN
    ALTER TABLE voice_confusion_reports ADD COLUMN voiced_location TEXT;
    UPDATE voice_confusion_reports SET voiced_location = heard_location WHERE voiced_location IS NULL;
  END IF;

  -- found_location
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_confusion_reports' AND column_name = 'found_location'
  ) THEN
    ALTER TABLE voice_confusion_reports ADD COLUMN found_location TEXT;
    UPDATE voice_confusion_reports SET found_location = actual_location WHERE found_location IS NULL;
  END IF;

  -- raw_voiced_location
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_confusion_reports' AND column_name = 'raw_voiced_location'
  ) THEN
    ALTER TABLE voice_confusion_reports ADD COLUMN raw_voiced_location TEXT;
  END IF;

  -- raw_found_location
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_confusion_reports' AND column_name = 'raw_found_location'
  ) THEN
    ALTER TABLE voice_confusion_reports ADD COLUMN raw_found_location TEXT;
  END IF;

  -- confirmations_count
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_confusion_reports' AND column_name = 'confirmations_count'
  ) THEN
    ALTER TABLE voice_confusion_reports ADD COLUMN confirmations_count INT NOT NULL DEFAULT 1;
  END IF;

  -- flag_count
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_confusion_reports' AND column_name = 'flag_count'
  ) THEN
    ALTER TABLE voice_confusion_reports ADD COLUMN flag_count INT NOT NULL DEFAULT 0;
  END IF;

  -- provenance
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_confusion_reports' AND column_name = 'provenance'
  ) THEN
    ALTER TABLE voice_confusion_reports ADD COLUMN provenance TEXT NOT NULL DEFAULT 'community_submitted';
  END IF;
END $$;

-- 3. Stored Generated Columns for normalized lookups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_confusion_reports' AND column_name = 'voiced_location_norm'
  ) THEN
    ALTER TABLE voice_confusion_reports 
    ADD COLUMN voiced_location_norm TEXT GENERATED ALWAYS AS (UPPER(TRIM(COALESCE(voiced_location, heard_location)))) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_confusion_reports' AND column_name = 'found_location_norm'
  ) THEN
    ALTER TABLE voice_confusion_reports 
    ADD COLUMN found_location_norm TEXT GENERATED ALWAYS AS (UPPER(TRIM(COALESCE(found_location, actual_location)))) STORED;
  END IF;
EXCEPTION
  WHEN duplicate_column THEN
    -- Column already exists
    NULL;
END $$;

-- 4. Unique Index on Normalised Voiced and Found Locations for Deduplication
-- MIG-01: Safe preflight check before creating unique index on existing databases
-- Preflight query for manual inspection:
--   SELECT voiced_location_norm, found_location_norm, COUNT(*)
--   FROM voice_confusion_reports
--   GROUP BY voiced_location_norm, found_location_norm
--   HAVING COUNT(*) > 1;
DO $$
DECLARE
  v_dup_count INT;
BEGIN
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT voiced_location_norm, found_location_norm
    FROM voice_confusion_reports
    GROUP BY voiced_location_norm, found_location_norm
    HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_count > 0 THEN
    RAISE WARNING 'Found % duplicate (voiced_location_norm, found_location_norm) groups in voice_confusion_reports. Unique index idx_voice_confusion_ref_unique deferred. Please resolve duplicates before applying unique constraint.', v_dup_count;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_confusion_ref_unique
    ON voice_confusion_reports (voiced_location_norm, found_location_norm);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_voice_confusion_confirmations_desc
ON voice_confusion_reports (confirmations_count DESC);

CREATE INDEX IF NOT EXISTS idx_voice_confusion_provenance
ON voice_confusion_reports (provenance);

CREATE INDEX IF NOT EXISTS idx_voice_confusion_voiced_norm
ON voice_confusion_reports (voiced_location_norm);

CREATE INDEX IF NOT EXISTS idx_voice_confusion_found_norm
ON voice_confusion_reports (found_location_norm);

-- 5. Confirmation tracking table (prevents repeated confirmation spam)
CREATE TABLE IF NOT EXISTS voice_confusion_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES voice_confusion_reports(id) ON DELETE CASCADE,
  client_hash TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_report_client_confirmation UNIQUE (report_id, client_hash)
);

CREATE INDEX IF NOT EXISTS idx_confirmations_report
ON voice_confusion_confirmations (report_id);

CREATE INDEX IF NOT EXISTS idx_confirmations_client
ON voice_confusion_confirmations (client_hash, confirmed_at);

-- 6. Flag tracking table (prevents repeated flag spam)
CREATE TABLE IF NOT EXISTS voice_confusion_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES voice_confusion_reports(id) ON DELETE CASCADE,
  client_hash TEXT NOT NULL,
  reason TEXT,
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_report_client_flag UNIQUE (report_id, client_hash)
);

CREATE INDEX IF NOT EXISTS idx_flags_report
ON voice_confusion_flags (report_id);

CREATE INDEX IF NOT EXISTS idx_flags_client
ON voice_confusion_flags (client_hash, flagged_at);

-- SEC-04: Enable Row Level Security on tracking tables and revoke direct mutations from public/anon
ALTER TABLE voice_confusion_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_confusion_flags ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON voice_confusion_confirmations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON voice_confusion_flags FROM PUBLIC, anon, authenticated;

-- 7. Update status check constraint to include community_submitted, confirmed, flagged
ALTER TABLE voice_confusion_reports DROP CONSTRAINT IF EXISTS voice_confusion_reports_status_check;
ALTER TABLE voice_confusion_reports ADD CONSTRAINT voice_confusion_reports_status_check
CHECK (status IN ('community_submitted', 'confirmed', 'flagged', 'archived', 'approved', 'rejected', 'pending'));

-- 8. RPC: submit_voice_confusion_reference
-- SEC-03: Explicit search_path = public, pg_temp
-- SEC-05: Concurrency-safe atomic insert with unique_violation conflict handling
-- SEC-06: Strict server-side length, format, and reason validation
CREATE OR REPLACE FUNCTION submit_voice_confusion_reference(
  p_voiced_location TEXT,
  p_found_location TEXT,
  p_raw_voiced TEXT DEFAULT NULL,
  p_raw_found TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT 'similar_sounding',
  p_details TEXT DEFAULT NULL,
  p_client_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_norm_voiced TEXT;
  v_norm_found TEXT;
  v_existing_id UUID;
  v_existing_count INT;
  v_new_id UUID;
  v_recent_submissions INT;
  v_clean_client_hash TEXT;
  v_confirmed BOOLEAN := false;
BEGIN
  -- Normalise inputs
  v_norm_voiced := UPPER(TRIM(COALESCE(p_voiced_location, '')));
  v_norm_found := UPPER(TRIM(COALESCE(p_found_location, '')));
  v_clean_client_hash := TRIM(COALESCE(p_client_hash, ''));

  -- SEC-06: Server-side length validation (between 2 and 10 characters)
  IF LENGTH(v_norm_voiced) < 2 OR LENGTH(v_norm_voiced) > 10 OR
     LENGTH(v_norm_found) < 2 OR LENGTH(v_norm_found) > 10 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Location codes must be between 2 and 10 characters long.'
    );
  END IF;

  -- SEC-06: Permitted characters validation (A-Z, 0-9, +, -, /)
  IF v_norm_voiced !~ '^[A-Z0-9+\-/]+$' OR v_norm_found !~ '^[A-Z0-9+\-/]+$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Location codes contain invalid characters. Permitted characters: letters (A-Z), numbers (0-9), and symbols (+, -, /).'
    );
  END IF;

  -- Validate non-identical
  IF v_norm_voiced = v_norm_found THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Voiced location and found location cannot be identical.'
    );
  END IF;

  -- SEC-06: Validate details length (max 500 characters)
  IF p_details IS NOT NULL AND LENGTH(p_details) > 500 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Details must not exceed 500 characters.'
    );
  END IF;

  -- SEC-06: Validate reason against allowed options
  IF p_reason IS NOT NULL AND p_reason NOT IN ('similar_sounding', 'headset_misrecognition', 'similar_check_character', 'other') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid voice confusion reason specified.'
    );
  END IF;

  -- Rate Limiting: max 5 submissions in 10 minutes per client_hash
  IF LENGTH(v_clean_client_hash) >= 8 THEN
    SELECT COUNT(*) INTO v_recent_submissions
    FROM voice_confusion_rate_limits
    WHERE client_hash = v_clean_client_hash
      AND submitted_at > (now() - INTERVAL '10 minutes');

    IF v_recent_submissions >= 5 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Submission limit reached. Please wait a few minutes before sharing another correction.'
      );
    END IF;

    INSERT INTO voice_confusion_rate_limits (client_hash, submitted_at)
    VALUES (v_clean_client_hash, now());
  END IF;

  -- TASK 3: Database-level concurrency lock on the normalized pair.
  -- Serializes concurrent submissions for the exact same pair, guaranteeing
  -- no duplicates even if composite unique index is deferred or absent.
  PERFORM pg_advisory_xact_lock(hashtext('vc_pair:' || v_norm_voiced || '->' || v_norm_found));

  -- Check for existing entry. Deterministically select the canonical row if legacy duplicates exist.
  SELECT id, confirmations_count INTO v_existing_id, v_existing_count
  FROM voice_confusion_reports
  WHERE voiced_location_norm = v_norm_voiced AND found_location_norm = v_norm_found
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    v_confirmed := false;
    IF LENGTH(v_clean_client_hash) >= 8 THEN
      -- TASK 1: Atomic deduplication: only increment counter if this client hasn't already confirmed
      INSERT INTO voice_confusion_confirmations (report_id, client_hash)
      VALUES (v_existing_id, v_clean_client_hash)
      ON CONFLICT (report_id, client_hash) DO NOTHING
      RETURNING true INTO v_confirmed;

      IF v_confirmed IS TRUE THEN
        UPDATE voice_confusion_reports
        SET confirmations_count = confirmations_count + 1,
            updated_at = now()
        WHERE id = v_existing_id
        RETURNING confirmations_count INTO v_existing_count;

        RETURN jsonb_build_object(
          'success', true,
          'is_duplicate', true,
          'is_new_confirmation', true,
          'id', v_existing_id,
          'confirmations_count', v_existing_count,
          'message', 'Existing observation found! Your report has corroboratively confirmed this community entry (+1 confirmation).'
        );
      ELSE
        -- Duplicate submission by same client: do NOT inflate counter
        RETURN jsonb_build_object(
          'success', true,
          'is_duplicate', true,
          'is_new_confirmation', false,
          'id', v_existing_id,
          'confirmations_count', v_existing_count,
          'message', 'Existing observation found. You have already confirmed this location correction in this session.'
        );
      END IF;
    ELSE
      -- Submissions without a valid client identifier: preserve counter without inflation
      RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', true,
        'is_new_confirmation', false,
        'id', v_existing_id,
        'confirmations_count', v_existing_count,
        'message', 'Existing observation already recorded in the community database.'
      );
    END IF;
  END IF;

  -- SEC-05: Insert new community report with concurrency race-condition handling
  BEGIN
    INSERT INTO voice_confusion_reports (
      user_id,
      voiced_location,
      found_location,
      raw_voiced_location,
      raw_found_location,
      heard_location,
      actual_location,
      reason,
      details,
      status,
      provenance,
      confirmations_count,
      flag_count,
      client_hash,
      created_at,
      updated_at
    )
    VALUES (
      auth.uid(),
      v_norm_voiced,
      v_norm_found,
      COALESCE(p_raw_voiced, p_voiced_location),
      COALESCE(p_raw_found, p_found_location),
      v_norm_voiced,
      v_norm_found,
      COALESCE(p_reason, 'similar_sounding'),
      p_details,
      'community_submitted',
      'community_submitted',
      1,
      0,
      CASE WHEN LENGTH(v_clean_client_hash) >= 8 THEN v_clean_client_hash ELSE NULL END,
      now(),
      now()
    )
    RETURNING id INTO v_new_id;

    IF LENGTH(v_clean_client_hash) >= 8 THEN
      INSERT INTO voice_confusion_confirmations (report_id, client_hash)
      VALUES (v_new_id, v_clean_client_hash)
      ON CONFLICT (report_id, client_hash) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'is_duplicate', false,
      'id', v_new_id,
      'voiced_location', v_norm_voiced,
      'found_location', v_norm_found,
      'status', 'community_submitted',
      'confirmations_count', 1,
      'message', 'Location correction shared successfully! Newly submitted reports are immediately visible to all visitors as unverified community reports.'
    );
  EXCEPTION
    WHEN unique_violation THEN
      -- SEC-05: Handle concurrent insertion race gracefully if unique constraint triggered
      SELECT id, confirmations_count INTO v_existing_id, v_existing_count
      FROM voice_confusion_reports
      WHERE voiced_location_norm = v_norm_voiced AND found_location_norm = v_norm_found
      ORDER BY created_at ASC, id ASC
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        v_confirmed := false;
        IF LENGTH(v_clean_client_hash) >= 8 THEN
          INSERT INTO voice_confusion_confirmations (report_id, client_hash)
          VALUES (v_existing_id, v_clean_client_hash)
          ON CONFLICT (report_id, client_hash) DO NOTHING
          RETURNING true INTO v_confirmed;

          IF v_confirmed IS TRUE THEN
            UPDATE voice_confusion_reports
            SET confirmations_count = confirmations_count + 1,
                updated_at = now()
            WHERE id = v_existing_id
            RETURNING confirmations_count INTO v_existing_count;

            RETURN jsonb_build_object(
              'success', true,
              'is_duplicate', true,
              'is_new_confirmation', true,
              'id', v_existing_id,
              'confirmations_count', v_existing_count,
              'message', 'Existing observation found! Your report has corroboratively confirmed this community entry (+1 confirmation).'
            );
          ELSE
            RETURN jsonb_build_object(
              'success', true,
              'is_duplicate', true,
              'is_new_confirmation', false,
              'id', v_existing_id,
              'confirmations_count', v_existing_count,
              'message', 'Existing observation found. You have already confirmed this location correction in this session.'
            );
          END IF;
        ELSE
          RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', true,
            'is_new_confirmation', false,
            'id', v_existing_id,
            'confirmations_count', v_existing_count,
            'message', 'Existing observation already recorded in the community database.'
          );
        END IF;
      ELSE
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Concurrent conflict occurred. Please refresh and try again.'
        );
      END IF;
  END;
END;
$$;

-- 9. RPC: confirm_voice_confusion_observation
-- SEC-02: Mandatory client identifier validation, rate-limiting, and atomic deduplication
-- SEC-03: Explicit search_path = public, pg_temp
CREATE OR REPLACE FUNCTION confirm_voice_confusion_observation(
  p_report_id UUID,
  p_client_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_count INT;
  v_clean_client_hash TEXT;
  v_recent_confirms INT;
BEGIN
  -- SEC-02: Validate client identifier
  v_clean_client_hash := TRIM(COALESCE(p_client_hash, ''));
  IF LENGTH(v_clean_client_hash) < 8 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'A valid client identifier is required to confirm an observation.'
    );
  END IF;

  -- SEC-02: Enforce rate limits (max 10 confirmations per 10 minutes per client)
  SELECT COUNT(*) INTO v_recent_confirms
  FROM voice_confusion_confirmations
  WHERE client_hash = v_clean_client_hash
    AND confirmed_at > (now() - INTERVAL '10 minutes');

  IF v_recent_confirms >= 10 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Confirmation limit reached. Please wait a few minutes before confirming another observation.'
    );
  END IF;

  -- Atomic deduplication: insert into confirmations table
  INSERT INTO voice_confusion_confirmations (report_id, client_hash)
  VALUES (p_report_id, v_clean_client_hash);

  -- Increment counter on report (SEC-02: do NOT auto-promote status; moderator verification is separate)
  UPDATE voice_confusion_reports
  SET confirmations_count = confirmations_count + 1,
      updated_at = now()
  WHERE id = p_report_id
  RETURNING confirmations_count INTO v_new_count;

  IF v_new_count IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Report not found.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'new_count', v_new_count,
    'message', 'Observation corroborated (+1 confirmation).'
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You have already confirmed this observation in this session.'
    );
END;
$$;

-- 10. RPC: flag_voice_confusion_observation
-- SEC-01: Mandatory client identifier, atomic deduplication, increment ONLY on valid new flag
-- SEC-03: Explicit search_path = public, pg_temp
CREATE OR REPLACE FUNCTION flag_voice_confusion_observation(
  p_report_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_client_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_flags INT;
  v_is_flagged BOOLEAN := false;
  v_clean_client_hash TEXT;
  v_recent_flags INT;
BEGIN
  -- SEC-01: A missing or invalid client identifier must NEVER increment a report's flag count
  v_clean_client_hash := TRIM(COALESCE(p_client_hash, ''));
  IF LENGTH(v_clean_client_hash) < 8 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'A valid client identifier is required to flag a report.'
    );
  END IF;

  -- SEC-01: Rate limit flags (max 5 flags per 10 minutes per client)
  SELECT COUNT(*) INTO v_recent_flags
  FROM voice_confusion_flags
  WHERE client_hash = v_clean_client_hash
    AND flagged_at > (now() - INTERVAL '10 minutes');

  IF v_recent_flags >= 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Flagging limit reached. Please wait a few minutes before submitting another report flag.'
    );
  END IF;

  -- Atomic deduplication: insert into flags table
  INSERT INTO voice_confusion_flags (report_id, client_hash, reason)
  VALUES (p_report_id, v_clean_client_hash, p_reason);

  -- SEC-01: ONLY increment flag_count when the flag record is successfully inserted
  UPDATE voice_confusion_reports
  SET flag_count = flag_count + 1,
      updated_at = now(),
      status = CASE WHEN flag_count + 1 >= 3 THEN 'flagged' ELSE status END
  WHERE id = p_report_id
  RETURNING flag_count, (status = 'flagged') INTO v_new_flags, v_is_flagged;

  IF v_new_flags IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Report not found.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'flag_count', v_new_flags,
    'is_flagged', v_is_flagged,
    'message', CASE 
      WHEN v_is_flagged THEN 'Report received multiple flags and has been marked for review.' 
      ELSE 'Thank you. Report flagged for review.' 
    END
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You have already flagged this report.'
    );
END;
$$;

-- 11. Security Grants
GRANT EXECUTE ON FUNCTION submit_voice_confusion_reference(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_voice_confusion_observation(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION flag_voice_confusion_observation(UUID, TEXT, TEXT) TO anon, authenticated;

-- 12. Row Level Security Policies for Shared Community Reference
ALTER TABLE voice_confusion_reports ENABLE ROW LEVEL SECURITY;

-- Allow public visitors to read active community reports
DROP POLICY IF EXISTS "Public can view active community reports" ON voice_confusion_reports;
CREATE POLICY "Public can view active community reports"
ON voice_confusion_reports
FOR SELECT
TO public
USING (status IN ('community_submitted', 'confirmed', 'approved'));

-- 12. Idempotent Seed Data Insertion (Requirement 3)
-- Treat these four observations as user-reported observations, not universally verified rules.
-- Lock voice_confusion_reports in SHARE ROW EXCLUSIVE mode during seed insertion
-- to guarantee no concurrent write races during WHERE NOT EXISTS evaluation
LOCK TABLE voice_confusion_reports IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO voice_confusion_reports (
  id,
  user_id,
  voiced_location,
  found_location,
  raw_voiced_location,
  raw_found_location,
  heard_location,
  actual_location,
  reason,
  details,
  status,
  provenance,
  confirmations_count,
  flag_count,
  created_at,
  updated_at
)
SELECT
  v.id,
  v.user_id,
  v.voiced_location,
  v.found_location,
  v.raw_voiced_location,
  v.raw_found_location,
  v.heard_location,
  v.actual_location,
  v.reason,
  v.details,
  v.status,
  v.provenance,
  v.confirmations_count,
  v.flag_count,
  v.created_at,
  v.updated_at
FROM (
  VALUES
    (
      '5eed0000-0000-4000-8000-000000000001'::uuid,
      NULL::uuid,
      '08MN',
      '20AN',
      '08MN',
      '20AN',
      '08MN',
      '20AN',
      'similar_sounding',
      'Seed observation: Spoken "zero-eight" acoustically confused with "twenty" over radio, combined with nasal M/N confusion.',
      'community_submitted',
      'seed_observation',
      1,
      0,
      '2026-10-18T08:00:00Z'::timestamptz,
      '2026-10-18T08:00:00Z'::timestamptz
    ),
    (
      '5eed0000-0000-4000-8000-000000000002'::uuid,
      NULL::uuid,
      '16ZG',
      '16JA',
      '16ZG',
      '16JA',
      '16ZG',
      '16JA',
      'similar_sounding',
      'Seed observation: Aisle 16 stockroom location: ZG confused with JA due to headset consonant sound compression.',
      'community_submitted',
      'seed_observation',
      1,
      0,
      '2026-10-18T08:30:00Z'::timestamptz,
      '2026-10-18T08:30:00Z'::timestamptz
    ),
    (
      '5eed0000-0000-4000-8000-000000000003'::uuid,
      NULL::uuid,
      '81ZE',
      '50ER',
      '81ZE',
      '50ER',
      '81ZE',
      '50ER',
      'headset_misrecognition',
      'Seed observation: Spoken "eighty-one" masked as "fifty" in ambient stockroom background noise; ZE heard as ER.',
      'community_submitted',
      'seed_observation',
      1,
      0,
      '2026-10-18T09:00:00Z'::timestamptz,
      '2026-10-18T09:00:00Z'::timestamptz
    ),
    (
      '5eed0000-0000-4000-8000-000000000004'::uuid,
      NULL::uuid,
      '01MM',
      'Z01B',
      '01MM',
      'Z01B',
      '01MM',
      'Z01B',
      'other',
      'Seed observation: Headset phrased Bulk location Z01B as "ZERO ONE BULK BRAVO", which worker mistook for standard aisle 01MM ("ZERO ONE MIKE MIKE").',
      'community_submitted',
      'seed_observation',
      1,
      0,
      '2026-10-18T09:30:00Z'::timestamptz,
      '2026-10-18T09:30:00Z'::timestamptz
    )
) AS v(
  id,
  user_id,
  voiced_location,
  found_location,
  raw_voiced_location,
  raw_found_location,
  heard_location,
  actual_location,
  reason,
  details,
  status,
  provenance,
  confirmations_count,
  flag_count,
  created_at,
  updated_at
)
WHERE NOT EXISTS (
  SELECT 1 FROM voice_confusion_reports r
  WHERE r.id = v.id
     OR (
       r.voiced_location_norm = UPPER(TRIM(v.voiced_location))
       AND r.found_location_norm = UPPER(TRIM(v.found_location))
     )
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

