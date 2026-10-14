-- ============================================================================
-- Migration: Authentication, User Submissions, and Protected User Roles
-- Project: Check Character by Chandra
-- Description:
--   1. Adds user_id ownership to voice_confusion_reports.
--   2. Establishes a protected user_roles table with server-side authorization.
--   3. Configures Row Level Security (RLS) so:
--      - Public users can ONLY view approved reports.
--      - Authenticated users can view their OWN reports (any status).
--      - Authenticated users can ONLY insert pending reports owned by themselves.
--      - Only authorised administrators/moderators can view all reports and update status.
--      - Users CANNOT assign or tamper with roles.
-- ============================================================================

-- 1. Add user_id column to voice_confusion_reports if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_confusion_reports' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE voice_confusion_reports 
    ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_voice_confusion_reports_user_id
ON voice_confusion_reports (user_id);

-- 2. Protected user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'moderator')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user
ON user_roles (user_id);

-- 3. Functions for server-side role evaluation (never trust browser claims)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT (
    auth.role() = 'authenticated' AND (
      COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
      OR EXISTS (
        SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION is_moderator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT (
    auth.role() = 'authenticated' AND (
      COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '') IN ('admin', 'moderator')
      OR EXISTS (
        SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
      )
      OR EXISTS (
        SELECT 1 FROM moderators WHERE user_id = auth.uid()
      )
    )
  );
$$;

-- 4. Secure RLS on user_roles
-- Users can inspect their OWN role to determine UI visibility.
-- NO INSERT / UPDATE / DELETE policy is granted to users, preventing self-elevation.
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own roles" ON user_roles;
CREATE POLICY "Users can read own roles"
ON user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
CREATE POLICY "Admins can view all roles"
ON user_roles
FOR SELECT
TO authenticated
USING (is_admin());

-- 5. Updated Row Level Security on voice_confusion_reports
ALTER TABLE voice_confusion_reports ENABLE ROW LEVEL SECURITY;

-- 5a. Public SELECT: ONLY approved reports are visible to public visitors
DROP POLICY IF EXISTS "Public can view approved reports" ON voice_confusion_reports;
CREATE POLICY "Public can view approved reports"
ON voice_confusion_reports
FOR SELECT
TO public
USING (status = 'approved');

-- 5b. Authenticated user SELECT: Signed-in users can view their OWN reports (pending, approved, rejected)
DROP POLICY IF EXISTS "Users can view own reports" ON voice_confusion_reports;
CREATE POLICY "Users can view own reports"
ON voice_confusion_reports
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 5c. Moderator SELECT: Authorised moderators/admins can view ALL reports
DROP POLICY IF EXISTS "Moderators can view all reports" ON voice_confusion_reports;
CREATE POLICY "Moderators can view all reports"
ON voice_confusion_reports
FOR SELECT
TO authenticated
USING (is_moderator());

-- 5d. Authenticated INSERT: Signed-in users can submit reports owned by their auth.uid() with status = 'pending'
DROP POLICY IF EXISTS "Authenticated users can submit reports" ON voice_confusion_reports;
CREATE POLICY "Authenticated users can submit reports"
ON voice_confusion_reports
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id AND status = 'pending'
);

-- 5e. Moderator UPDATE: Only authorised moderators can approve or reject reports
DROP POLICY IF EXISTS "Moderators can update reports" ON voice_confusion_reports;
DROP POLICY IF EXISTS "Moderators can update report status" ON voice_confusion_reports;
CREATE POLICY "Moderators can update report status"
ON voice_confusion_reports
FOR UPDATE
TO authenticated
USING (is_moderator())
WITH CHECK (is_moderator());

-- 6. Updated submit_voice_confusion_report RPC requiring authentication
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
BEGIN
  -- Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required. Please sign in with your email to submit a report.'
    );
  END IF;

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

  -- Rate limiting check: max 5 submissions in the last 10 minutes per user/client
  SELECT COUNT(*) INTO v_recent_submissions
  FROM voice_confusion_reports
  WHERE user_id = v_user_id
    AND created_at > now() - INTERVAL '10 minutes';

  IF v_recent_submissions >= 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Submission limit reached. Please wait a few minutes before submitting another report.'
    );
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

  -- Insert report with default 'pending' status owned by the authenticated user
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
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'is_duplicate', true,
      'error', 'A report for this heard location, actual location, and reason was just submitted by another user.'
    );
END;
$$;
