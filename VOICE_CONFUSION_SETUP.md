# Voice Confusion Risk — Supabase Authentication, RLS & Setup Guide

This document describes how to configure **Supabase Magic-Link Authentication**, deploy the database migrations, set up Row Level Security (RLS), and securely provision administrator/moderator privileges.

---

## 1. Zero-Trust Security & Role Architecture

- **Server-Authorised Roles:** User roles (`admin`, `moderator`, `user`) are stored in the protected `public.user_roles` PostgreSQL table. The browser client is **never trusted** for role claims.
- **Self-Elevation Prevention:** Row Level Security on `user_roles` strictly forbids `INSERT`, `UPDATE`, or `DELETE` operations from the client. Users cannot assign or elevate their own roles.
- **Public Report Submissions (No Login Required):** Any public visitor can submit a voice confusion report without creating an account or logging in.
- **Strict Pending Review Status:** Every public submission is strictly forced to `status = 'pending'` via PostgreSQL RLS `WITH CHECK (status = 'pending')`. Public visitors can never insert approved or rejected records.
- **Public Visibility Restrictions:** Public visitors can **only query records where `status = 'approved'`**. Pending and rejected submissions cannot be queried, discovered, or inspected by anonymous visitors.
- **Public Action Restrictions:** Public visitors have **no UPDATE or DELETE privileges**. They cannot approve, reject, modify statuses, or delete reports.
- **Anti-Spam & Rate Limiting:** Anonymous submissions are protected by invisible honeypot field detection in the client and database-level `client_hash` rate-limiting (max 5 submissions per 10-minute window).
- **Future Approved-User Extensibility:** Includes an extensible `is_submission_allowed()` PostgreSQL function hook, preparing the database for a future allowlist or approved-user access system without breaking schema changes.
- **Optional Ownership & Privacy:** When users choose to sign in, their reports are linked via `user_id = auth.uid()`. Signed-in users can view their own submissions and moderation statuses in "My Reports", but cannot view pending or rejected reports submitted by others.
- **Protected Moderation:** Only server-verified administrators and moderators can view the pending queue, approve reports, or reject reports with feedback notes.
- **Service Role Key Security:** The `SUPABASE_SERVICE_ROLE_KEY` is **never exposed in frontend code**. All operations execute using the public anonymous client with PostgreSQL RLS enforcement.

---

## 2. Environment Variables

Create a `.env` file in the project root:

```bash
# Public Supabase credentials (Safe for browser frontend)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> **Offline / Demo Mode:** If `VITE_SUPABASE_URL` is omitted or empty, the application automatically runs in local in-memory simulation mode, providing instant magic-link sign in, full RLS-simulation rules, and offline testing without requiring a live Supabase server.

---

## 3. Database Migrations Deployment

Run the migrations in your Supabase project in sequential order:

### Migration 1: Base Tables, Indexes & Duplicate Constraints
Run [`supabase/migrations/20261014000000_voice_confusion_reports.sql`](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/supabase/migrations/20261014000000_voice_confusion_reports.sql)
- Creates `voice_confusion_reports` table with stored generated columns (`heard_location_norm`, `actual_location_norm`).
- Creates `idx_voice_confusion_unique_report` unique constraint for duplicate prevention.
- Creates `voice_confusion_rate_limits` table for anti-spam.

### Migration 2: Authentication, User Roles & Enhanced RLS
Run [`supabase/migrations/20261014000001_auth_and_user_roles.sql`](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/supabase/migrations/20261014000001_auth_and_user_roles.sql)
- Adds `user_id UUID REFERENCES auth.users(id)` ownership column to `voice_confusion_reports`.
- Creates `user_roles` table with server-side `is_admin()` and `is_moderator()` functions.
- Configures RLS policies for public approved reading, user-owned submission reading, and moderator-only status updates.

### Migration 3: Public Report Submissions & Pending Review Enforcement
Run [`supabase/migrations/20261014000002_allow_public_submissions.sql`](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/supabase/migrations/20261014000002_allow_public_submissions.sql)
- Updates RLS policy to allow public/anonymous report inserts with mandatory `status = 'pending'`.
- Updates `submit_voice_confusion_report` RPC to accept submissions without requiring `auth.uid()`.
- Implements `client_hash` rate limiting for unauthenticated visitors.
- Adds `is_submission_allowed()` hook for future allowlist extensibility.

---

## 4. Manual Supabase Dashboard Configuration Steps

To enable magic-link authentication with your Supabase project:

### Step 1: Configure Redirect URLs in Supabase
1. In your [Supabase Dashboard](https://app.supabase.com), go to **Authentication -> URL Configuration**.
2. Set **Site URL** to:
   ```
   http://localhost:5173
   ```
3. Under **Redirect URLs**, add your local and production domains:
   ```
   http://localhost:5173/**
   https://your-production-domain.com/**
   ```
4. Save changes.

### Step 2: Enable Email Provider & Magic Links
1. Go to **Authentication -> Providers -> Email**.
2. Ensure **Enable Email provider** is turned **ON**.
3. Ensure **Confirm email** is enabled (or toggle off if using OTP direct links in dev).
4. Save changes.

---

## 5. Provisioning Administrators and Moderators (Secure Setup)

Administrator and moderator privileges **cannot** be granted by users through the browser. They must be provisioned via the Supabase Dashboard SQL Editor or CLI:

### Step 1: Have the user register via Magic Link
The user signs in once via the app using their email address (e.g. `chandra.lead@store.co.uk`) so their record is created in `auth.users`.

### Step 2: Assign the Role in PostgreSQL
Open the **SQL Editor** in your Supabase Dashboard and run:

```sql
-- Grant Administrator role
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'chandra.lead@store.co.uk'
ON CONFLICT (user_id, role) DO NOTHING;

-- OR grant Moderator role
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'moderator'
FROM auth.users
WHERE email = 'chandra.lead@store.co.uk'
ON CONFLICT (user_id, role) DO NOTHING;
```

To verify active roles:
```sql
SELECT u.email, r.role, r.assigned_at
FROM public.user_roles r
JOIN auth.users u ON u.id = r.user_id;
```

---

## 6. Testing in Offline / Demo Mode

When running locally without live Supabase credentials:
- **Standard User:** Enter any email (e.g. `picker@store.co.uk`) in the Magic Link modal to sign in as a standard user.
- **Moderator User:** Sign in with `moderator@stockroom.test` to test the Moderator Portal.
- **Administrator User:** Sign in with `admin@stockroom.test` to test the Admin Moderation Portal.
