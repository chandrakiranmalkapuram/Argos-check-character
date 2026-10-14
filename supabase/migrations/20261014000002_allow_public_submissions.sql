-- ============================================================================
-- Migration: Allow Public Report Submissions Without Login
-- Project: Check Character by Chandra
-- Description:
--   1. Opens Voice Confusion Risk report submissions to all visitors without login.
--   2. Enforces that all public submissions automatically receive 'pending' status.
--   3. Restricts public search results to 'approved' reports only (pending reports are never public).
--   4. Grants admin/moderator-only privileges for reviewing, approving, and rejecting reports.
--   5. Applies client_hash rate limiting and anti-spam controls for anonymous submissions.
--   6. Introduces extensible is_submission_allowed() hook for future allowlist access.
-- ============================================================================

-- 1. Extensible submission authorization hook (prepared for future approved-user access)
-- Currently returns TRUE for all callers (open submissions).
-- Future allowlist systems can replace this function without schema changes.
CREATE OR REPLACE FUNCTION is_submission_allowed(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT TRUE;
$$;

-- 2. Update Row Level Security on voice_confusion_reports for INSERT
ALTER TABLE voice_confusion_reports ENABLE ROW LEVEL SECURITY;

-- Remove previous authenticated-only submission policy
DROP POLICY IF EXISTS "Authenticated users can submit reports" ON voice_confusion_reports;
DROP POLICY IF EXISTS "Allow public and authenticated submissions" ON voice_confusion_reports;

-- New INSERT policy:
-- Allows both anonymous and authenticated users to insert reports under strict conditions:
-- - status MUST be 'pending' (public users CANNOT set status to 'approved' or 'rejected')
-- - user_id must match auth.uid() if authenticated, or be NULL for anonymous submissions
-- - submission must pass is_submission_allowed()
CREATE POLICY "Allow public and authenticated submissions"
ON voice_confusion_reports
FOR INSERT
TO public
WITH CHECK (
  status = 'pending'
  AND is_submission_allowed(auth.uid())
  AND (
    (auth.role() = 'authenticated' AND user_id = auth.uid())
    OR
    (auth.role() <> 'authenticated' AND user_id IS NULL)
    OR
    (user_id IS NULL)
  )
);

-- Ensure public SELECT remains strictly restricted to approved reports
DROP POLICY IF EXISTS "Public can view approved reports" ON voice_confusion_reports;
CREATE POLICY "Public can view approved reports"
ON voice_confusion_reports
FOR SELECT
TO public
USING (status = 'approved');

-- Authenticated users can view their own reports (any status)
DROP POLICY IF EXISTS "Users can view own reports" ON voice_confusion_reports;
CREATE POLICY "Users can view own reports"
ON voice_confusion_reports
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Only authorised moderators/admins can view all reports (including pending and rejected)
DROP POLICY IF EXISTS "Moderators can view all reports" ON voice_confusion_reports;
CREATE POLICY "Moderators can view all reports"
ON voice_confusion_reports
FOR SELECT
TO authenticated
USING (is_moderator());

-- Only authorised moderators/admins can UPDATE reports (approve, reject, add moderator_notes)
-- Public/anonymous users have NO UPDATE policy and cannot change statuses.
DROP POLICY IF EXISTS "Moderators can update report status" ON voice_confusion_reports;
CREATE POLICY "Moderators can update report status"
ON voice_confusion_reports
FOR UPDATE
TO authenticated
USING (is_moderator())
WITH CHECK (is_moderator());

-- 3. Updated submit_voice_confusion_report RPC
-- Allows both public visitors and signed-in pickers to submit reports safely.
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
  v_user_id UUID;
  v_heard_norm TEXT;
  v_actual_norm TEXT;
  v_existing_status TEXT;
  v_recent_submissions INT;
  v_new_id UUID;
  v_clean_details TEXT;
  v_client_hash TEXT;
BEGIN
  -- 1. Check extensible submission permission
  v_user_id := auth.uid();
  IF NOT is_submission_allowed(v_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Submissions are currently restricted. Please contact your stockroom administrator.'
    );
  END IF;

  -- 2. Trim and normalise location codes
  v_heard_norm := UPPER(TRIM(p_heard_location));
  v_actual_norm := UPPER(TRIM(p_actual_location));
  v_clean_details := NULLIF(TRIM(COALESCE(p_details, '')), '');
  v_client_hash := NULLIF(TRIM(COALESCE(p_client_hash, '')), '');

  -- 3. Validate required fields
  IF v_heard_norm IS NULL OR v_heard_norm = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Heard location is required.');
  END IF;

  IF v_actual_norm IS NULL OR v_actual_norm = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Actual location is required.');
  END IF;

  IF p_reason NOT IN ('similar_sounding', 'headset_misrecognition', 'similar_check_character', 'other') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid reason provided.');
  END IF;

  -- 4. Validate location length (2-10 chars for stockroom formats)
  IF LENGTH(v_heard_norm) < 2 OR LENGTH(v_heard_norm) > 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Heard location must be between 2 and 10 characters.');
  END IF;

  IF LENGTH(v_actual_norm) < 2 OR LENGTH(v_actual_norm) > 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Actual location must be between 2 and 10 characters.');
  END IF;

  -- 5. Validate location characters: permitted alphanumeric and warehouse zone symbols (+, -, /)
  IF NOT (v_heard_norm ~ '^[A-Z0-9+\-/]{2,10}$') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Heard location contains invalid characters.');
  END IF;

  IF NOT (v_actual_norm ~ '^[A-Z0-9+\-/]{2,10}$') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Actual location contains invalid characters.');
  END IF;

  -- 6. Validate non-identical
  IF v_heard_norm = v_actual_norm THEN
    RETURN jsonb_build_object('success', false, 'error', 'Heard location and actual location cannot be identical.');
  END IF;

  -- 7. Validate details length
  IF v_clean_details IS NOT NULL AND LENGTH(v_clean_details) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Details must not exceed 500 characters.');
  END IF;

  -- 8. Anti-spam / Rate-limiting: Max 5 submissions in the last 10 minutes
  -- For authenticated users: rate limit by user_id
  -- For public/anonymous users: rate limit by client_hash
  IF v_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_recent_submissions
    FROM voice_confusion_reports
    WHERE user_id = v_user_id
      AND created_at > now() - INTERVAL '10 minutes';
  ELSIF v_client_hash IS NOT NULL THEN
    SELECT COUNT(*) INTO v_recent_submissions
    FROM voice_confusion_reports
    WHERE client_hash = v_client_hash
      AND created_at > now() - INTERVAL '10 minutes';
  ELSE
    v_recent_submissions := 0;
  END IF;

  IF v_recent_submissions >= 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Submission limit reached. Please wait a few minutes before submitting another report.'
    );
  END IF;

  -- 9. Duplicate detection: Check if an identical report already exists
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

  -- 10. Insert report with strict 'pending' status
  -- user_id is assigned if authenticated, or NULL for anonymous public visitor
  INSERT INTO voice_confusion_reports (
    user_id,
    heard_location,
    actual_location,
    reason,
    details,
    status,
    client_hash
  )
  VALUES (
    v_user_id,
    v_heard_norm,
    v_actual_norm,
    p_reason,
    v_clean_details,
    'pending',
    v_client_hash
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_new_id,
    'heard_location', v_heard_norm,
    'actual_location', v_actual_norm,
    'reason', p_reason,
    'status', 'pending',
    'message', 'Report submitted successfully. Your report is currently pending admin review and will appear in public search results once approved.'
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'is_duplicate', true,
      'error', 'A report for this heard location, actual location, and reason was just submitted by another user.'
    );
END;
$$;
