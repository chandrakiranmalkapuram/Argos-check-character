-- ============================================================================
-- Migration: Voice Confusion Risk Reports
-- Project: Check Character by Chandra
-- Description: Persistent, moderated, duplicate-safe voice confusion reporting
-- ============================================================================

-- Ensure required extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create table for voice confusion reports
CREATE TABLE IF NOT EXISTS voice_confusion_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  heard_location TEXT NOT NULL,
  actual_location TEXT NOT NULL,
  
  -- Normalised stored columns: case-insensitive, whitespace-trimmed,
  -- preserving original characters (strictly does not convert O/0 or I/1)
  heard_location_norm TEXT GENERATED ALWAYS AS (UPPER(TRIM(heard_location))) STORED,
  actual_location_norm TEXT GENERATED ALWAYS AS (UPPER(TRIM(actual_location))) STORED,

  -- Controlled reason values
  reason TEXT NOT NULL CHECK (
    reason IN (
      'similar_sounding',
      'headset_misrecognition',
      'similar_check_character',
      'other'
    )
  ),

  -- Optional short details (max 500 chars)
  details TEXT CHECK (details IS NULL OR LENGTH(details) <= 500),

  -- Moderation status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),

  -- Private moderation fields (only visible to authorised moderators)
  moderator_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  -- Anti-spam / rate-limiting metadata (hashed, privacy-preserving)
  client_hash TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Database-level check constraint: heard and actual locations cannot be identical after normalisation
  CONSTRAINT chk_locations_not_identical CHECK (
    UPPER(TRIM(heard_location)) <> UPPER(TRIM(actual_location))
  )
);

-- 2. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_voice_confusion_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_voice_confusion_updated_at ON voice_confusion_reports;
CREATE TRIGGER trg_voice_confusion_updated_at
BEFORE UPDATE ON voice_confusion_reports
FOR EACH ROW
EXECUTE FUNCTION update_voice_confusion_timestamp();

-- 3. Database-side Unique Constraint / Index for Duplicate Detection
-- Guarantees transaction-safe prevention of duplicate reports with the same
-- normalised heard_location, actual_location and reason.
-- NOTE: Does NOT merge reports where actual_location differs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_confusion_unique_report
ON voice_confusion_reports (heard_location_norm, actual_location_norm, reason);

-- 4. Search and Status Indexes
CREATE INDEX IF NOT EXISTS idx_voice_confusion_status
ON voice_confusion_reports (status);

CREATE INDEX IF NOT EXISTS idx_voice_confusion_heard_search
ON voice_confusion_reports (heard_location_norm)
WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_voice_confusion_actual_search
ON voice_confusion_reports (actual_location_norm)
WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_voice_confusion_created_at
ON voice_confusion_reports (created_at DESC);

-- 5. Anti-Spam Submission Rate-Limiting Log
CREATE TABLE IF NOT EXISTS voice_confusion_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_hash TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_confusion_rate_limits_window
ON voice_confusion_rate_limits (client_hash, submitted_at);

-- 6. Moderators Table for Server-Side Authorisation
CREATE TABLE IF NOT EXISTS moderators (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helper function to check if the current user is an authorised moderator
CREATE OR REPLACE FUNCTION is_moderator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT (
    auth.role() = 'authenticated' AND (
      COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'moderator'
      OR EXISTS (SELECT 1 FROM moderators WHERE user_id = auth.uid())
    )
  );
$$;

-- 7. Row Level Security (RLS)
ALTER TABLE voice_confusion_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_confusion_rate_limits ENABLE ROW LEVEL SECURITY;

-- Reports RLS Policies:
-- 7a. Public/Anonymous SELECT: ONLY approved reports are visible.
-- Pending and rejected reports are NEVER visible to unauthenticated users.
DROP POLICY IF EXISTS "Public can view approved reports" ON voice_confusion_reports;
CREATE POLICY "Public can view approved reports"
ON voice_confusion_reports
FOR SELECT
TO public
USING (status = 'approved');

-- 7b. Moderator SELECT: Authorised moderators can view all reports (pending, approved, rejected)
DROP POLICY IF EXISTS "Moderators can view all reports" ON voice_confusion_reports;
CREATE POLICY "Moderators can view all reports"
ON voice_confusion_reports
FOR SELECT
TO authenticated
USING (is_moderator());

-- 7c. Moderator UPDATE: Authorised moderators can approve/reject and add notes
DROP POLICY IF EXISTS "Moderators can update reports" ON voice_confusion_reports;
CREATE POLICY "Moderators can update reports"
ON voice_confusion_reports
FOR UPDATE
TO authenticated
USING (is_moderator())
WITH CHECK (is_moderator());

-- Moderators table policy: only moderators can view the moderators list
DROP POLICY IF EXISTS "Moderators can view moderators list" ON moderators;
CREATE POLICY "Moderators can view moderators list"
ON moderators
FOR SELECT
TO authenticated
USING (is_moderator());

-- 8. Validated Server-Side Submission RPC Function
-- This function handles:
--   - Normalisation and validation
--   - Non-identical location check
--   - Anti-spam rate limiting (e.g. max 5 submissions per 10 minutes per client)
--   - Safe duplicate detection with clear message (no private metadata leaks)
--   - Strict enforcement that status is ALWAYS 'pending'
CREATE OR REPLACE FUNCTION submit_voice_confusion_report(
  p_heard_location TEXT,
  p_actual_location TEXT,
  p_reason TEXT,
  p_details TEXT DEFAULT NULL,
  p_client_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_heard_norm TEXT;
  v_actual_norm TEXT;
  v_existing_status TEXT;
  v_recent_submissions INT;
  v_new_id UUID;
  v_clean_details TEXT;
BEGIN
  -- Trim and normalise
  v_heard_norm := UPPER(TRIM(p_heard_location));
  v_actual_norm := UPPER(TRIM(p_actual_location));
  v_clean_details := NULLIF(TRIM(COALESCE(p_details, '')), '');

  -- Validate required fields
  IF v_heard_norm IS NULL OR v_heard_norm = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Heard location is required.');
  END IF;

  IF v_actual_norm IS NULL OR v_actual_norm = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Actual location is required.');
  END IF;

  IF p_reason NOT IN ('similar_sounding', 'headset_misrecognition', 'similar_check_character', 'other') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid reason provided.');
  END IF;

  -- Validate location length (2-10 chars for stockroom formats)
  IF LENGTH(v_heard_norm) < 2 OR LENGTH(v_heard_norm) > 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Heard location must be between 2 and 10 characters.');
  END IF;

  IF LENGTH(v_actual_norm) < 2 OR LENGTH(v_actual_norm) > 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Actual location must be between 2 and 10 characters.');
  END IF;

  -- Validate location characters: permitted alphanumeric and warehouse zone symbols (+, -, /)
  IF NOT (v_heard_norm ~ '^[A-Z0-9+\-/]{2,10}$') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Heard location contains invalid characters.');
  END IF;

  IF NOT (v_actual_norm ~ '^[A-Z0-9+\-/]{2,10}$') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Actual location contains invalid characters.');
  END IF;

  -- Validate non-identical
  IF v_heard_norm = v_actual_norm THEN
    RETURN jsonb_build_object('success', false, 'error', 'Heard location and actual location cannot be identical.');
  END IF;

  -- Validate details length
  IF v_clean_details IS NOT NULL AND LENGTH(v_clean_details) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Details must not exceed 500 characters.');
  END IF;

  -- Rate limiting check: max 5 submissions in the last 10 minutes per client hash
  IF p_client_hash IS NOT NULL AND p_client_hash <> '' THEN
    SELECT COUNT(*) INTO v_recent_submissions
    FROM voice_confusion_rate_limits
    WHERE client_hash = p_client_hash
      AND submitted_at > now() - INTERVAL '10 minutes';

    IF v_recent_submissions >= 5 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Submission limit reached. Please wait a few minutes before submitting another report.'
      );
    END IF;

    -- Record submission attempt
    INSERT INTO voice_confusion_rate_limits (client_hash)
    VALUES (p_client_hash);
  END IF;

  -- Duplicate detection: Check if an identical report already exists
  SELECT status INTO v_existing_status
  FROM voice_confusion_reports
  WHERE heard_location_norm = v_heard_norm
    AND actual_location_norm = v_actual_norm
    AND reason = p_reason
  LIMIT 1;

  IF v_existing_status IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'is_duplicate', true,
      'error', 'A report for this heard location, actual location, and reason has already been submitted and is currently ' || v_existing_status || '.'
    );
  END IF;

  -- Insert report with default 'pending' status
  INSERT INTO voice_confusion_reports (
    heard_location,
    actual_location,
    reason,
    details,
    status,
    client_hash
  )
  VALUES (
    v_heard_norm,
    v_actual_norm,
    p_reason,
    v_clean_details,
    'pending',
    p_client_hash
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_new_id,
    'heard_location', v_heard_norm,
    'actual_location', v_actual_norm,
    'reason', p_reason,
    'status', 'pending',
    'message', 'Report submitted successfully. Your report is currently pending review and is not yet verified.'
  );

EXCEPTION
  -- Handle concurrent race condition caught by UNIQUE constraint
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'is_duplicate', true,
      'error', 'A report for this heard location, actual location, and reason was just submitted by another user.'
    );
END;
$$;
