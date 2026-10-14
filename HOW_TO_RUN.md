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

Run the complete Vitest test suite (includes calculation algorithms, normalisation, validation, duplicate detection, and moderation security):

```bash
npm test
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

### B. Voice Confusion Risk Reporting & Authentication

1. Click the **Voice Confusion Risk** tab at the top of the app.
2. **Search Approved Reports (Public Visitor Access - No Sign In Required):**
   - Click the **Search Approved Reports** tab.
   - Type `J7AZ` in the search box to find:
     - **Heard:** `J7AZ` &rarr; **Actual:** `07AZ` (Reason: *Similar-sounding characters*).
   - Clear and type `07AZ`. The same report is found, verifying dual-field indexing.
   - Public visitors can search and view all approved reports freely without an account.
3. **Sign In with Email Magic Link:**
   - Click **Sign In (Magic Link)** in the top right header or feature banner.
   - Enter your email address (e.g. `picker@store.co.uk`) and click **Send Magic Link**.
   - In offline/demo mode, sign-in completes immediately. In live Supabase mode, an email is dispatched.
4. **Submit a Report (Authentication Required):**
   - If not signed in, the submission tab shows a protected sign-in gate.
   - Once signed in, enter Heard Location (e.g. `20BK`) and Actual Location (e.g. `20KB`).
   - Select a reason and add optional operational details.
   - Click **Preview Report**, then **Confirm and Submit Report**.
5. **My Reports View:**
   - Click the **My Reports** tab to see all reports you have submitted.
   - Shows moderation statuses (**Pending Review**, **Approved**, or **Rejected**) and any feedback notes left by stockroom moderators.
6. **Test Duplicate Prevention:**
   - Submit the exact same heard location, actual location, and reason again.
   - The server and database layer block duplicate entries with an informative notice.
7. **Admin Moderation Portal (Protected):**
   - Switch to the **Admin Moderation** tab.
   - Sign in with an authorized account (in demo mode: `admin@stockroom.test` or `moderator@stockroom.test`).
   - Review pending submissions, add optional feedback notes, and click **Approve** or **Reject**.
   - Once approved, the submission is immediately published to public search results.

---

## 8. Supabase Database Configuration (Optional)

The application works immediately out-of-the-box in local demo mode without needing any remote server.

To connect your own shared **Supabase PostgreSQL** database:
1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Copy [`supabase/migrations/20261014000000_voice_confusion_reports.sql`](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/supabase/migrations/20261014000000_voice_confusion_reports.sql) into the Supabase SQL Editor and run it.
3. Create a `.env` file in the project root:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
4. Restart the dev server (`npm run dev`).
5. Full details on setting up live moderators are documented in [`VOICE_CONFUSION_SETUP.md`](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/VOICE_CONFUSION_SETUP.md).
