# Check Character by Chandra

A responsive, mobile-first web application built with **React**, **TypeScript**, and **Vite** for stockroom shelf check-character calculations.

## Overview
Voice-directed picking headsets in high-volume stockrooms (such as Argos) prompt workers to read out shelf locations and verify the corresponding **check character** (which functions as a validation password). If a shelf label is missing or damaged, or if stock is located on a mezzanine level, workers can determine the correct check character using this tool.

## Key Features
- **Store Location Calculation**: Verified weighted ASCII modulo 26 algorithm mapping to NATO phonetic alphabet (ALPHA to ZULU).
- **RFC Location Calculation**: Regional Fulfilment Centre 2-digit algorithm (base 45 + weighted alphabet indices modulo 99).
- **Reverse Lookup**: Inverted index searching 67,600 store locations (00AA–99ZZ) grouped by aisle for any phonetic check character.
- **Voice Mistake Alerts**: Identifies confusable locations that share the same check character due to single-letter phonetic errors (e.g., JEWELLERY heard as ZERO) or swapped adjacent digits.
- **Voice Confusion Risk System**: Shared, persistent warehouse misrecognition reporting backed by Supabase PostgreSQL with open public submissions (no login required), automatic pending review status, duplicate prevention, public approved-only search, and an authenticated admin moderation workflow.
- **Phonetic Pronunciation & Audio**: Displays voice picking phrasing (e.g., `"ONE ZERO ALPHA KILO"`) with one-click Web Speech audio playback.
- **Recent Search History**: Persisted in local browser storage (`localStorage`) with one-click reload and deletion.
- **Independent Clean-Room Architecture**: Pure calculation logic in `src/logic/` completely decoupled from React UI components.

## Project Structure
```
check-character-by-chandra/
├── supabase/
│   └── migrations/          # PostgreSQL migrations (Base schema, Roles & RLS, Public submissions)
├── src/
│   ├── assets/              # Original branding vector assets
│   ├── components/          # Core React UI components
│   ├── hooks/               # Custom React hooks (localStorage search history)
│   ├── logic/               # Independent check-character calculation engine
│   ├── voiceConfusion/      # Voice Confusion Risk reporting system
│   │   ├── __tests__/       # Automated test suite (normalizer, validation, service, moderation)
│   │   ├── components/      # Submission form, preview modal, search, moderator portal
│   │   ├── normalizer.ts    # Case-insensitive whitespace-trimming (preserves O/0 & I/1)
│   │   ├── service.ts       # Supabase client / offline fallback data service
│   │   ├── supabaseClient.ts # Zero-trust safe client
│   │   ├── types.ts         # TypeScript interfaces
│   │   ├── validation.ts    # Configurable input validation
│   │   └── VoiceConfusionView.tsx # Feature orchestrator
│   ├── styles/              # Design tokens & mobile-first vanilla CSS
│   ├── App.tsx              # Main application orchestrator
│   └── main.tsx             # Application mount point
├── VOICE_CONFUSION_SETUP.md # Supabase setup, RLS and moderator credentials guide
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Running the Project

For detailed instructions and feature walkthroughs, see [HOW_TO_RUN.md](file:///Users/chandrakiran/.gemini/antigravity-ide/scratch/check-character-by-chandra/HOW_TO_RUN.md).

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run unit tests
npm test

# Run strict TypeScript and production build
npm run build

# Run linter
npm run lint
```

## Disclaimer
*Check Character by Chandra* is an independent educational and warehouse productivity tool. It is not affiliated with, sponsored by, or endorsed by Argos or J Sainsbury plc. No proprietary logos or trademarks are used.
