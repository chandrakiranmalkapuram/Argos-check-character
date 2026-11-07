# How to Run Check Character by Chandra

This guide provides step-by-step instructions for running the application, executing tests, building for production, and exploring all stockroom verification and voice confusion reporting features.

---

## 1. Prerequisites

Make sure you have Node.js and npm installed:
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher

Check your installed versions by running:
```bash
node -v
npm -v
```

---

## 2. Installation

From the project root directory, install all required dependencies:

```bash
npm install
```

---

## 3. Starting the Development Server

To launch the local interactive development server:

```bash
npm run dev
```

Once started, open your browser and navigate to:
```
http://localhost:5173
```

The development server supports hot module replacement (HMR), so any code changes update immediately in the browser.

---

## 4. Running the Automated Test Suite

### Default Fast Suite (~5 seconds)
Run the fast deterministic Vitest test suite (includes calculation algorithms, normalisation, validation, duplicate detection, moderation security, and a 300-sample deterministic property test across all four store location patterns):

```bash
npm test
```

### Complete Verification Suite with Heavy Census (~40 seconds)
Before milestone reports and major releases, run the full verification suite (activates the 1,000-input Monte Carlo census across Caps 2–4 and the expanded 2,000-input property test via `FULL_TEST_SUITE=1`):

```bash
npm run test:full
```

To run tests in watch mode during development:
```bash
npx vitest
```

---

## 5. Building for Production

To perform strict TypeScript type-checking and create an optimized production build:

```bash
npm run build
```

The production assets will be output to the `dist/` directory.

### Previewing the Production Build Locally
To test the built production bundle locally using Vite's preview server:

```bash
npm run preview
```

---

## 6. Running Code Quality & Linting

Run the ultra-fast Oxlint linter across all TypeScript, TSX, and CSS files:

```bash
npm run lint
```

---

## 7. How to Use the Application Features

### A. Check Character Calculator & Reverse Lookup
1. Open the application at `http://localhost:5173`.
2. Make sure the top tab is set to **Check Character Calculator**.
3. **Calculate Store Location Check Character:**
   - Type `10AK` or `J1PG`.
   - View the calculated NATO phonetic check character (e.g. `SIERRA`) and the spoken phrase (`"ONE ZERO ALPHA KILO"`).
   - Click the speaker button to hear the audio pronunciation.
4. **Calculate RFC (Regional Fulfilment Centre) Location:**
   - Type a 4-letter code like `ABCD` or `RETS`.
   - The dual result card will display both Store and RFC check characters.
5. **Reverse Lookup:**
   - Type any NATO phonetic word (e.g., `ALPHA` or `ZULU`).
   - The app instantly displays all store locations producing that check character, grouped by aisle.
6. **Voice Mistake Warnings:**
   - Enter `10AK` or `J7AZ`.
   - Scroll down to the **Stockroom Warning: Voice Confusion Risk** alert to see locations that produce the exact same check character due to acoustic confusion.
   - Click **"Search Community Voice Confusion Reports &rarr;"** to view field reports.

---

### B. Voice Confusion Risk Reporting & Public Submissions

1. Click the **Voice Confusion Risk** tab at the top of the app.
2. **Search Approved Reports (Public Visitor Access - No Sign In Required):**
   - Click the **Search Approved Reports** tab.
   - Type `J7AZ` in the search box to find:
     - **Heard:** `J7AZ` &rarr; **Actual:** `07AZ` (Reason: *Similar-sounding characters*).
   - Clear and type `07AZ`. The same report is found, verifying dual-field indexing.
   - Public visitors can search and view all approved reports freely without an account.
3. **Submit a Report (Open to Everyone — No Login Required):**
   - Click the **Submit a Report** tab.
   - Anyone can submit a report immediately without creating an account or logging in.
   - Enter Heard Location (e.g. `20BK`) and Actual Location (e.g. `20KB`).
   - Select a reason and add optional operational details.
   - Click **Preview Report**, review the details, and click **Confirm and Submit Report**.
   - A clear success confirmation informs you that the report has been received and is awaiting administrator review.
   - Every public submission automatically receives `pending` status and will only appear in public search results once approved by an administrator.
   - Protected by invisible anti-spam honeypot detection and client rate limiting.
4. **Optional Email Magic Link Sign In & "My Reports":**
   - Click **Sign In (Magic Link)** in the top right header if you wish to link submissions to an email.
   - Enter your email address (e.g. `picker@store.co.uk`) and click **Send Magic Link**.
   - In offline/demo mode, sign-in completes immediately. In live Supabase mode, an email is dispatched.
   - Click the **My Reports** tab to see your personal submissions and their moderation statuses (**Pending Review**, **Approved**, or **Rejected**) along with any moderator feedback notes.
5. **Test Duplicate Prevention:**
   - Submit the exact same heard location, actual location, and reason again.
   - The server and database layer block duplicate entries with an informative notice.
6. **Admin Moderation Portal (Protected):**
   - Switch to the **Admin Moderation** tab.
   - Access is restricted: only authorized admin and moderator accounts can view the queue or change report statuses.
   - Sign in with an authorized account (in demo mode: `admin@stockroom.test` or `moderator@stockroom.test`).
   - Review pending submissions, add optional feedback notes, and click **Approve** or **Reject**.
   - Once approved, the submission is immediately published to public search results.

---

## 8. Supabase Database Configuration & Production Persistence

The application works out-of-the-box in local demonstration mode when database credentials are not present.

To enable shared production persistence with **Supabase PostgreSQL**:
1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Execute all four migrations in sequential order in the Supabase SQL Editor:
   - **Migration 1:** [`supabase/migrations/20261014000000_voice_confusion_reports.sql`](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/supabase/migrations/20261014000000_voice_confusion_reports.sql) (Base tables, normalisation & duplicate index)
   - **Migration 2:** [`supabase/migrations/20261014000001_auth_and_user_roles.sql`](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/supabase/migrations/20261014000001_auth_and_user_roles.sql) (User roles & initial RLS)
   - **Migration 3:** [`supabase/migrations/20261014000002_allow_public_submissions.sql`](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/supabase/migrations/20261014000002_allow_public_submissions.sql) (Public submissions & pending review status)
   - **Migration 4:** [`supabase/migrations/20261019000000_voice_confusion_reference.sql`](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/supabase/migrations/20261019000000_voice_confusion_reference.sql) (Shared community reference, deduplication advisory locks, corroboration/flagging RPCs, clean public SELECT policy, and 7 authoritative reference observations including `J7AZ->07AZ`, `S1PG->01PG`, `10AK->10KA`)
3. **Frontend Build Variables:**
   Create `.env` locally or configure Cloudflare Pages build environment variables:
   ```bash
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
   *Note: In Cloudflare Pages, add these under **Settings** -> **Environment variables** (Production), then trigger a redeploy so Vite bakes them into the static bundle.*
4. **Distinguishing Demonstration vs Live Data:**
   - When connected to Supabase, the community search header displays `🟢 Live Database Active`.
   - Authoritative seed data carries the 📚 `Reference Seed` badge.
   - Genuine user contributions carry ✅ `Corroborated Community Report` (2+ confirmations) or 👥 `Community Report (Unverified)` (1 confirmation).
   - In-memory mock data (used only when unconfigured) carries 🧪 `Demo Sample` and is never written to Supabase.
5. **Provisioning Administrators:**
   Admins and moderators are provisioned server-side via SQL in `public.user_roles`. Detailed instructions and verification checklists are in [`VOICE_CONFUSION_SETUP.md`](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/VOICE_CONFUSION_SETUP.md).

---

## 9. Voice Confusion Suggestion Engine: Tier Conventions & Model Limitations

### Tier Caps and Conventions
The suggestion engine ranks same-check candidate locations into three risk tiers based on acoustic phonetic similarity:
- **Tier 1 (Reported & Confirmed):** Pairs with verified community corroboration (`approved` or `confirmed` status, or `moderator_confirmed` provenance) and an acoustic reason (`similar_sounding` or `headset_misrecognition`).
  - Non-acoustic reports (`similar_check_character` or `other`) appear in `reportedPairs` badged as *"Reported (layout / check-character), does not affect ranking"* and never elevate candidate tiers.
  - Submitter-selected reasons are inherently subjective; restricting Tier 1 elevation to acoustic reasons acts as a deliberate fail-safe.
  - Note that `seed_observation` provenance displays only as a "Reference example" and never elevates a tier.
- **Tier 2 (Model-Similar):** Pairs where **all differing tokens** are model-similar (within the near threshold `0.55`) and the total count of differing tokens satisfies `differingTokens <= MAX_DIFFERING_TOKENS_TIER2` (configured to **2**).
- **Tier 3 (Possible Confusion):** Pairs with **exactly one far token** (token distance `> 0.55`) and at most `MAX_DIFFERING_TOKENS_TIER3` total differing tokens (configured to **2**). An optional far-token distance ceiling (`maxFarTokenDistanceTier3`, default off) can further bound the maximum distance of that far token.

> [!NOTE]
> **Convention Rationale:** The tier caps (`MAX_DIFFERING_TOKENS_TIER2 = 2` and `MAX_DIFFERING_TOKENS_TIER3 = 2`) are established as conventions under the hypothesis of **independent token errors** (i.e. single or double acoustic confusions are substantially more plausible than 3 or 4 simultaneous independent token misrecognitions). The known reference pairs cannot discriminate between caps 2, 3, or 4 because all known target pairs have at most 2 differing tokens. These caps should be revisited and tuned when large-scale operational warehouse telemetry becomes available.

### Model Limitations & Alignment Parameters
1. **Multi-Token Outliers:**
   - `08MN / 20AN` (3 far tokens) and `81ZE / 50ER` (4 far tokens) never appear in the phonetic tiers (Tier 2 or Tier 3) at any cap. They surface strictly through `reportedPairs` (badged as "Reference example") or in the collapsed arithmetic collision pool when `includeArithmeticCollisions: true`.
2. **Multiple Far Tokens:**
   - `21EZ / 11BZ` (2 far tokens) and `10AK / 10HL` (2 far tokens) have more than 1 far token, so they do not meet Tier 3 criteria (which requires exactly 1 far token). They appear only in the collapsed arithmetic collision pool.
3. **Phonetic Gap Cost (Decision D12):**
   - Token gap cost is maintained at `0.90`. At this setting, gapped alignment equals fixed-position alignment for all tested pairs, but is **not mathematically identical** for all equal-length codes: gapped alignment can be cheaper in rare cases where two substitutions cost more than two gap penalties. For example, comparing aisles 13 vs 39 with identical letters (`13AA` vs `39AA`): fixed-position alignment yields `ONE/THREE` (0.97) + `THREE/NINE` (1.00) = `1.97`, whereas gapped alignment yields `2 × 0.90 = 1.80` (aligning `THREE/THREE` at 0 cost with an insertion and a deletion). Gapped alignment is primarily relevant for unequal token lengths (such as 3-token Cash Office codes vs 4-token standard codes). Lowering the gap cost does not surface the shift seeds because they differ by 3–4 tokens.
4. **Pure Acoustic vs. Human Errors:**
   - Not all reported confusions are acoustic. For example, shelf mispicks or digit transpositions may occur due to physical stock misplacement or reading errors rather than headset misrecognition.


