# Check Character by Chandra

A responsive stockroom location check-character calculator built with React, TypeScript, and Vite. It helps calculate and look up check characters used by voice-directed picking systems, and explore reported voice-confusion risks.

## Features

- Calculate Store check characters using the weighted ASCII modulo 26 algorithm and NATO phonetic alphabet.
- Calculate RFC (Regional Fulfilment Centre) check characters using its weighted alphabet-index algorithm.
- Automatically compare Store and RFC results for applicable four-letter codes, or select a calculation mode explicitly.
- Reverse-search the 67,600 standard Store locations (`00AA`–`99ZZ`) by NATO check-character word, grouped by aisle.
- View same-check candidate warnings and ranked voice-confusion suggestions. Candidates are algorithmic possibilities, not confirmation that a location exists.
- Search and contribute to the shared Voice Confusion Reference, with community corroboration, flagging, and protected moderation features.
- Hear spoken location phrases with browser speech synthesis and revisit recent searches saved in local browser storage.

The calculator works locally without database configuration. Shared voice-confusion data requires a Supabase project; see [VOICE_CONFUSION_SETUP.md](VOICE_CONFUSION_SETUP.md) for database, environment, and access setup.

## Quick start

Requirements: Node.js 18 or later and npm 9 or later.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (by default, `http://localhost:5173`). To configure shared Supabase persistence for local development, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in a local `.env` file. Only use the public anonymous key in the frontend; never expose a Supabase service-role key.

## Development commands

| Command | Description |
| --- | --- |
| `npm test` | Run the standard Vitest suite |
| `npm run test:full` | Run the extended verification suite |
| `npm run build` | Type-check and create the production build in `dist/` |
| `npm run lint` | Run Oxlint |
| `npm run preview` | Preview the production build locally |
| `npm run benchmark:voice` | Run the voice-confusion benchmark |
| `npm run deploy` | Deploy using the configured Wrangler setup |

## Project guide

- `src/logic/` — calculation, validation, reverse lookup, and candidate-ranking logic.
- `src/logic/voiceConfusion/` — voice-confusion grammar, phonetics, and suggestion engine.
- `src/voiceConfusion/` — reporting, search, persistence, and moderation features.
- `supabase/migrations/` — database schema, access policies, and reference data migrations.
- [HOW_TO_RUN.md](HOW_TO_RUN.md) — usage walkthrough and local/production instructions.
- [docs/voice_confusion_engine.md](docs/voice_confusion_engine.md) — engine rules, evidence handling, and model limitations.
- [VOICE_CONFUSION_SETUP.md](VOICE_CONFUSION_SETUP.md) — Supabase setup, security model, and moderator provisioning.

## Disclaimer

*Check Character by Chandra* is an independent educational and warehouse productivity tool. It is not affiliated with, sponsored by, or endorsed by Argos or J Sainsbury plc.
