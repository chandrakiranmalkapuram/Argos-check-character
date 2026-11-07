# Voice Confusion Risk — Supabase Authentication, RLS & Production Setup Guide

This document provides complete instructions for configuring **Supabase PostgreSQL persistence**, deploying all four migrations sequentially, setting up Row Level Security (RLS), configuring build environment variables on **Cloudflare Pages / Workers**, securely provisioning administrator privileges, and verifying production operation.

---

## 1. Zero-Trust Security & Role Architecture

- **Server-Authorised Roles:** User roles (`admin`, `moderator`, `user`) are stored in the protected `public.user_roles` PostgreSQL table. The browser client is **never trusted** for role claims.
- **Self-Elevation Prevention:** Row Level Security on `user_roles` strictly forbids `INSERT`, `UPDATE`, or `DELETE` operations from the client. Users cannot assign or elevate their own roles.
- **Public Report Submissions (No Login Required):** Any public visitor can submit a voice confusion location mismatch report without creating an account or logging in.
- **Immediate Community Sharing via RPC:** Migration 4 provides the `submit_voice_confusion_reference` RPC, allowing newly submitted reports to be immediately visible as unverified community observations, while moderator approval can verify or promote them.
- **Granular Public Visibility Restrictions:** Public visitors can **only query records where `status IN ('community_submitted', 'confirmed', 'approved')`**. Pending and rejected submissions cannot be queried, discovered, or inspected by anonymous visitors. Reports that receive 3 or more community flags are automatically demoted to `status = 'flagged'` and immediately hidden from public view.
- **Public Action Restrictions:** Direct table `INSERT`, `UPDATE`, and `DELETE` queries from anonymous clients are blocked by RLS. All public interactions occur through security-definer PostgreSQL functions (`submit_voice_confusion_reference`, `confirm_voice_confusion_observation`, `flag_voice_confusion_observation`) with explicit `SET search_path = public, pg_temp`.
- **Anti-Spam & Rate Limiting:** Submissions are protected by client-side honeypot field detection, minimum client identifier length checks (>= 8 characters), and database-level `client_hash` rate-limiting (max 5 submissions per 10 minutes, max 10 confirmations per 10 minutes, max 5 flags per 10 minutes).
- **Service Role Key Security:** The `SUPABASE_SERVICE_ROLE_KEY` is **strictly prohibited from frontend code and build environments**. All browser operations connect using the public anonymous key (`VITE_SUPABASE_ANON_KEY`) with PostgreSQL RLS enforcement.

---

## 2. Environment Variables & Cloudflare Build Configuration

The frontend Vite application requires two public environment variables at build time:

```bash
# Public Supabase credentials (Safe for browser bundle)
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Local Development Setup
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Populate `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with your Supabase project's API credentials.
3. Restart the Vite development server (`npm run dev`).

### Cloudflare Pages / Workers Build Configuration
Because Vite embeds `VITE_*` variables into the JavaScript bundle at **compile time**, these variables must be present during the Cloudflare build process:

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** -> Select your **Check Character** project.
3. Go to **Settings** -> **Environment variables**.
4. Under **Production**, click **Add variables**:
   - `VITE_SUPABASE_URL`: `https://your-project-ref.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `your-anon-public-key`
5. Click **Save**.
6. **Trigger a New Deployment:** Navigate to the **Deployments** tab and click **Retry deployment** (or push a new commit). The build step (`npm run build`) will bake the public configuration into the static bundle.

> [!WARNING]
> Do NOT set `SUPABASE_SERVICE_ROLE_KEY` in Cloudflare build variables for this frontend project. The browser bundle only requires the public anonymous key (`VITE_SUPABASE_ANON_KEY`).

---

## 3. Database Migrations Deployment (Sequential Order)

Execute all four SQL migrations sequentially in the Supabase Dashboard **SQL Editor** or using the Supabase CLI (`supabase db push`). All migrations are strictly idempotent and safe to re-run.

### Migration 1: Base Tables, Indexes & Duplicate Constraints
File: [`supabase/migrations/20261014000000_voice_confusion_reports.sql`](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/supabase/migrations/20261014000000_voice_confusion_reports.sql)
- Creates `voice_confusion_reports` table with stored generated columns (`heard_location_norm`, `actual_location_norm`).
- Creates `idx_voice_confusion_unique_report` unique constraint for duplicate prevention.
- Creates `voice_confusion_rate_limits` table for anti-spam tracking.
- Enables initial Row Level Security (RLS).

### Migration 2: Authentication, User Roles & Enhanced RLS
File: [`supabase/migrations/20261014000001_auth_and_user_roles.sql`](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/supabase/migrations/20261014000001_auth_and_user_roles.sql)
- Adds `user_id UUID REFERENCES auth.users(id)` column to `voice_confusion_reports`.
- Creates `public.user_roles` table with `role` enum (`admin`, `moderator`, `user`).
- Creates helper functions `is_admin()` and `is_moderator()`.
- Establishes RLS policies prohibiting users from self-elevating their roles.

### Migration 3: Public Report Submissions & Pending Review Enforcement
File: [`supabase/migrations/20261014000002_allow_public_submissions.sql`](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/supabase/migrations/20261014000002_allow_public_submissions.sql)
- Updates RLS policy to allow public/anonymous report inserts with mandatory `status = 'pending'`.
- Updates `submit_voice_confusion_report` RPC to accept submissions without requiring `auth.uid()`.
- Implements `client_hash` rate limiting for unauthenticated visitors.
- Adds `is_submission_allowed()` hook for future allowlist extensibility.

### Migration 4: Shared Community Reference, Corroboration & Deduplication
File: [`supabase/migrations/20261019000000_voice_confusion_reference.sql`](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/supabase/migrations/20261019000000_voice_confusion_reference.sql)
- Adds `voiced_location`, `found_location`, `provenance`, `confirmations_count`, and `flag_count` columns.
- Creates stored generated columns `voiced_location_norm` and `found_location_norm`.
- Creates child tracking tables: `voice_confusion_confirmations` and `voice_confusion_flags` with composite primary keys `(report_id, client_hash)`.
- Deploys atomic RPCs:
  - `submit_voice_confusion_reference(...)`: Handles advisory locking, duplicate corroboration (+1 confirmation), and anti-spam.
  - `confirm_voice_confusion_observation(...)`: Allows other clients to corroborate an existing report once.
  - `flag_voice_confusion_observation(...)`: Increments flag count and automatically demotes to `status = 'flagged'` when threshold of 3 flags is reached.
- Drops redundant legacy SELECT policy (`"Public can view approved reports"`) and establishes consolidated policy:
  `status IN ('community_submitted', 'confirmed', 'approved')`.
- Seeds seven authoritative warehouse reference observations idempotently using `WHERE NOT EXISTS (...) ON CONFLICT (id) DO NOTHING`:
  1. `08MN` &rarr; `20AN` (UUID: `5eed0000-0000-4000-8000-000000000001`)
  2. `16ZG` &rarr; `16JA` (UUID: `5eed0000-0000-4000-8000-000000000002`)
  3. `81ZE` &rarr; `50ER` (UUID: `5eed0000-0000-4000-8000-000000000003`)
  4. `01MM` &rarr; `Z01B` (UUID: `5eed0000-0000-4000-8000-000000000004`)
  5. `J7AZ` &rarr; `07AZ` (UUID: `5eed0000-0000-4000-8000-000000000005`)
  6. `S1PG` &rarr; `01PG` (UUID: `5eed0000-0000-4000-8000-000000000006`)
  7. `10AK` &rarr; `10KA` (UUID: `5eed0000-0000-4000-8000-000000000007`)

---

## 4. Manual Supabase Dashboard Configuration Steps

### Step 1: Configure Redirect URLs in Supabase
1. In your [Supabase Dashboard](https://app.supabase.com), go to **Authentication -> URL Configuration**.
2. Set **Site URL** to your Cloudflare Pages domain (or `http://localhost:5173` for local development):
   ```
   https://check-character-by-chandra.pages.dev
   ```
3. Under **Redirect URLs**, add:
   ```
   http://localhost:5173/**
   https://check-character-by-chandra.pages.dev/**
   ```
4. Save changes.

### Step 2: Enable Email Provider & Magic Links
1. Go to **Authentication -> Providers -> Email**.
2. Ensure **Enable Email provider** is turned **ON**.
3. Ensure **Confirm email** is enabled (or disabled if using direct token magic links in dev).
4. Save changes.

---

## 5. Provisioning Administrators and Moderators

Administrator and moderator privileges **cannot** be granted by users through the browser. They must be provisioned via the Supabase Dashboard SQL Editor:

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

## 6. Distinguishing Demonstration Data from Genuine Community Submissions

To avoid confusion between static demonstration data and genuine warehouse submissions:

| Data Type | Provenance Flag | Badge in UI | Description |
| :--- | :--- | :--- | :--- |
| **Reference Seed** | `seed_observation` | 📚 `Reference Seed` | Authoritative stockroom reference observations loaded during Migration 4. |
| **Demonstration Sample** | `demo_sample` | 🧪 `Demo Sample` | In-memory mock data used **only** when Supabase credentials are missing or during offline testing. Never written to Supabase. |
| **Corroborated Community Report** | `community_submitted` | ✅ `Corroborated Community Report` | Live user submission with 2 or more confirmations from different warehouse workers. |
| **Unverified Community Report** | `community_submitted` | 👥 `Community Report (Unverified)` | Live user submission awaiting secondary corroboration or moderator review. |

### Connection Status Banner
- **🟢 Live Database Active:** Confirms that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present and the frontend is connected to your Supabase PostgreSQL database. Reports submitted in this mode are permanently stored in PostgreSQL.
- **🔶 Demonstration Mode (Database Offline):** Displayed when build variables are missing. Submissions are strictly rejected with an explicit error message explaining that permanent persistence is unconfigured.

---

## 7. Production Verification Checklist

Follow these steps to verify your production deployment:

1. **Verify Connection Banner:** Open the deployed site and navigate to the **Voice Confusion Risk** tab. Confirm the banner displays `🟢 Live Database Active: Connected to shared community reference database.`
2. **Verify Seed Data Search:**
   - In **Search Approved Reports**, search for `J7AZ`.
   - Confirm it appears with **Voiced:** `J7AZ` &rarr; **Found:** `07AZ` and badge 📚 `Reference Seed`.
   - Search for `S1PG` (`01PG`) and `10AK` (`10KA`).
3. **Verify Public Submission:**
   - In **Submit a Report**, enter a new unseeded location pair (e.g. `98ZZ` &rarr; `89ZZ`).
   - Click **Preview Report** &rarr; **Confirm and Submit Report**.
   - Confirm success message: `"Location correction shared successfully! Newly submitted reports are immediately visible to all visitors as unverified community reports."`
4. **Verify Duplicate Corroboration:**
   - Submit the same pair (`98ZZ` &rarr; `89ZZ`) from the same browser.
   - Confirm notice: `"Existing observation found. You have already confirmed this location correction in this session."`
5. **Verify Security Defenses:**
   - Attempting to submit without valid locations is blocked client-side and in the database RPC.
   - Submitting 6 reports in under 10 minutes triggers: `"Submission limit reached. Please wait a few minutes before sharing another correction."`

---

## 8. Tier 1 Elevation Predicate & Free-Text Disclosure Rules (Decisions D11 & D14)

### Tier 1 Elevation Predicate (Decision D11)
A candidate is elevated to **Tier 1 (Reported sound-alike)** if and only if **ALL** of the following conditions are satisfied:
1. **Provenance:** Provenance is **not** `'seed_observation'` (reference seeds never elevate candidates).
2. **Reason:** Reason is strictly acoustic: either `'similar_sounding'` or `'headset_misrecognition'`. Reasons `'similar_check_character'` and `'other'` reflect layout or collision issues and do not elevate ranking.
3. **Status Whitelist/Blacklist:** Status is **not** `'flagged'`, `'rejected'`, `'archived'`, or `'pending'`.
4. **Trust Level:**
   - Either `status` is `'approved'` or `'confirmed'`;
   - **OR** `provenance` is `'moderator_confirmed'` with `status = 'community_submitted'`.

> [!NOTE]
> In the current PostgreSQL schema and service code, only reports with `status` `'approved'` or `'confirmed'` can elevate a candidate in production. The `provenance = 'moderator_confirmed'` branch exists for future extensibility when moderation workflows directly mutate the provenance column. Today, nothing in the migrations, database RPCs, or service layer sets `provenance = 'moderator_confirmed'`.

Disallowed statuses (`flagged`, `'rejected'`, `'archived'`, `'pending'`) with `moderator_confirmed` provenance do **not** elevate.

### Free-Text Details Handling (Decision D14)
- **Seed Observations:** The `details` field is suppressed entirely for provenance `'seed_observation'` (seed observations contain numbers and notes from the reference specification).
- **Community Reports:** For all other reports, `details` is rendered as plain text limited to 200 characters inside a collapsed `<details>` disclosure labelled:
  `"Reporter's note (free text, unverified)"`.
- Application-generated text strictly obeys Invariant I6 (digit-by-digit spoken words); user-supplied free text is exempt but isolated within this disclosure.


