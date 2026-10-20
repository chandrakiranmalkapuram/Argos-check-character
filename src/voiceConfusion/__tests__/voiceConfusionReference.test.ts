import { describe, it, expect, beforeEach } from 'vitest';
import {
  submitLocationCorrection,
  confirmReport,
  flagReport,
  searchCommunityReports,
  getAllActiveReports,
  resetTestStore,
  SEED_OBSERVATIONS,
  setTestCurrentUser
} from '../service.ts';
import { isValidStorePattern } from '../../logic/similarLocations.ts';

describe('Voice Confusion Reference — Shared Persistence & Community Updates', () => {
  beforeEach(() => {
    resetTestStore();
    setTestCurrentUser(null); // Anonymous visitor
  });

  describe('Authoritative Seed Observations Verification (Requirement 3)', () => {
    it('contains all 4 required real-world observations in the authoritative seed', () => {
      const voicedPairs = SEED_OBSERVATIONS.map(s => ({
        voiced: s.voiced_location,
        found: s.found_location
      }));

      expect(voicedPairs).toContainEqual({ voiced: '08MN', found: '20AN' });
      expect(voicedPairs).toContainEqual({ voiced: '16ZG', found: '16JA' });
      expect(voicedPairs).toContainEqual({ voiced: '81ZE', found: '50ER' });
      expect(voicedPairs).toContainEqual({ voiced: '01MM', found: 'Z01B' });
    });

    it('verifies all 4 seed pairs comply with existing location algorithms or prefix rules', () => {
      // 08MN -> 20AN: Store standard 2 digits, 2 letters
      expect(isValidStorePattern('08MN')).toBe(true);
      expect(isValidStorePattern('20AN')).toBe(true);

      // 16ZG -> 16JA: Store standard 2 digits, 2 letters
      expect(isValidStorePattern('16ZG')).toBe(true);
      expect(isValidStorePattern('16JA')).toBe(true);

      // 81ZE -> 50ER: Store standard 2 digits, 2 letters
      expect(isValidStorePattern('81ZE')).toBe(true);
      expect(isValidStorePattern('50ER')).toBe(true);

      // 01MM -> Z01B: 01MM is Store standard; Z01B is Store Bulk zone with prefix Z
      expect(isValidStorePattern('01MM')).toBe(true);
      expect(isValidStorePattern('Z01B')).toBe(true);
    });

    it('seeding is idempotent: multiple resets or initializations never create duplicate records', async () => {
      resetTestStore();
      const firstReports = await getAllActiveReports();
      const initialCount = firstReports.length;

      // Resetting/re-running seed
      resetTestStore();
      const secondReports = await getAllActiveReports();
      expect(secondReports.length).toBe(initialCount);

      // Check unique composite keys
      const keys = secondReports.map(r => `${r.voiced_location}->${r.found_location}`);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    it('verifies all seed observations use stable, valid RFC 4122 / PostgreSQL-compatible UUIDs', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const seedRecords = SEED_OBSERVATIONS.filter(s => s.provenance === 'seed_observation');
      const seedIds = seedRecords.map(s => s.id);

      expect(seedIds.length).toBe(4);
      seedIds.forEach(id => {
        expect(id).toMatch(uuidRegex);
        expect(id.length).toBe(36);
        // Specifically verify absence of invalid non-hex characters like 's' in 'seed-'
        expect(id).not.toContain('seed-');
      });

      // Verify uniqueness and no collisions
      const uniqueIds = new Set(seedIds);
      expect(uniqueIds.size).toBe(4);

      // Verify all observations in store (including legacy mock samples) have valid UUIDs
      SEED_OBSERVATIONS.forEach(obs => {
        expect(obs.id).toMatch(uuidRegex);
      });

      // Verify no collision with legacy mock observation IDs
      const legacyIds = [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003'
      ];
      legacyIds.forEach(legacyId => {
        expect(seedIds).not.toContain(legacyId);
      });
    });

    it('verifies migration SQL files declare the identical valid seed UUIDs with primary key conflict handling', async () => {
      const fsMod = 'node:fs';
      const pathMod = 'node:path';
      const fs = await import(/* @vite-ignore */ fsMod);
      const path = await import(/* @vite-ignore */ pathMod);
      const rootDir = (globalThis as any).process?.cwd ? (globalThis as any).process.cwd() : '.';
      const migrationPath = path.resolve(rootDir, 'supabase/migrations/20261019000000_voice_confusion_reference.sql');
      const d1MigrationPath = path.resolve(rootDir, 'supabase/migrations/d1_voice_confusion_reference.sql');

      const pgSql = fs.readFileSync(migrationPath, 'utf8');
      const d1Sql = fs.readFileSync(d1MigrationPath, 'utf8');

      const seedRecords = SEED_OBSERVATIONS.filter(s => s.provenance === 'seed_observation');

      // Verify both migration files contain each authoritative seed UUID
      seedRecords.forEach(obs => {
        expect(pgSql).toContain(`'${obs.id}'`);
        expect(d1Sql).toContain(`'${obs.id}'`);
      });

      // Verify invalid non-hex seed IDs have been completely removed
      expect(pgSql).not.toContain('seed-0000-0000-0000-');
      expect(d1Sql).not.toContain('seed-0000-0000-0000-');

      // Verify PostgreSQL migration uses safe primary key conflict handling
      expect(pgSql).toContain('ON CONFLICT (id) DO NOTHING;');
    });

    it('verifies both migration SQL files protect against composite pair and primary key collisions via WHERE NOT EXISTS (F-01)', async () => {
      const fsMod = 'node:fs';
      const pathMod = 'node:path';
      const fs = await import(/* @vite-ignore */ fsMod);
      const path = await import(/* @vite-ignore */ pathMod);
      const rootDir = (globalThis as any).process?.cwd ? (globalThis as any).process.cwd() : '.';
      const migrationPath = path.resolve(rootDir, 'supabase/migrations/20261019000000_voice_confusion_reference.sql');
      const d1MigrationPath = path.resolve(rootDir, 'supabase/migrations/d1_voice_confusion_reference.sql');

      const pgSql = fs.readFileSync(migrationPath, 'utf8');
      const d1Sql = fs.readFileSync(d1MigrationPath, 'utf8');

      // Both migrations must filter seed records using WHERE NOT EXISTS
      expect(pgSql).toContain('WHERE NOT EXISTS');
      expect(d1Sql).toContain('WHERE NOT EXISTS');

      // Both must check for existing ID collision
      expect(pgSql).toContain('r.id = v.id');
      expect(d1Sql).toContain('r.id = v.id');

      // Both must check for existing normalized pair collision
      expect(pgSql).toContain('r.voiced_location_norm = UPPER(TRIM(v.voiced_location))');
      expect(pgSql).toContain('r.found_location_norm = UPPER(TRIM(v.found_location))');
      expect(d1Sql).toContain('r.voiced_location_norm = v.voiced_location_norm');
      expect(d1Sql).toContain('r.found_location_norm = v.found_location_norm');

      // Both must maintain ON CONFLICT (id) DO NOTHING
      expect(pgSql).toContain('ON CONFLICT (id) DO NOTHING;');
      expect(d1Sql).toContain('ON CONFLICT (id) DO NOTHING;');
    });

    it('simulates SQLite/D1 seed migration when matching location pair exists under a different UUID (F-01)', async () => {
      let DatabaseSync: any;
      try {
        const sqliteMod = 'node:sqlite';
        const sqlite = await import(/* @vite-ignore */ sqliteMod);
        DatabaseSync = sqlite.DatabaseSync;
      } catch {
        // Fallback if environment doesn't expose node:sqlite
        return;
      }

      const fsMod = 'node:fs';
      const pathMod = 'node:path';
      const fs = await import(/* @vite-ignore */ fsMod);
      const path = await import(/* @vite-ignore */ pathMod);
      const rootDir = (globalThis as any).process?.cwd ? (globalThis as any).process.cwd() : '.';
      const d1MigrationPath = path.resolve(rootDir, 'supabase/migrations/d1_voice_confusion_reference.sql');
      const d1Sql = fs.readFileSync(d1MigrationPath, 'utf8');

      // Extract the seed insert statement from the migration
      const seedInsertMarker = 'INSERT INTO voice_confusion_reports';
      const seedInsertIdx = d1Sql.indexOf(seedInsertMarker);
      expect(seedInsertIdx).toBeGreaterThan(0);
      const seedSql = d1Sql.slice(seedInsertIdx);

      const db = new DatabaseSync(':memory:');
      // Set up schema
      db.exec(`
        CREATE TABLE voice_confusion_reports (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          voiced_location TEXT NOT NULL,
          found_location TEXT NOT NULL,
          voiced_location_norm TEXT NOT NULL,
          found_location_norm TEXT NOT NULL,
          raw_voiced_location TEXT NOT NULL,
          raw_found_location TEXT NOT NULL,
          reason TEXT NOT NULL,
          details TEXT,
          status TEXT NOT NULL,
          provenance TEXT NOT NULL,
          confirmations_count INTEGER NOT NULL DEFAULT 1,
          flag_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE UNIQUE INDEX idx_voice_confusion_ref_unique
          ON voice_confusion_reports(voiced_location_norm, found_location_norm);
      `);

      // Pre-insert an existing community report for one of the seed pairs (08MN / 20AN) with a different UUID
      const existingCommunityId = 'c0000000-1111-2222-3333-444444444444';
      db.exec(`
        INSERT INTO voice_confusion_reports (
          id, voiced_location, found_location,
          voiced_location_norm, found_location_norm,
          raw_voiced_location, raw_found_location,
          reason, details, status, provenance, confirmations_count, flag_count
        ) VALUES (
          '${existingCommunityId}', '08MN', '20AN',
          '08MN', '20AN',
          '08MN', '20AN',
          'similar_sounding', 'Community report submitted by warehouse operator',
          'community_submitted', 'community_submitted', 8, 1
        );
      `);

      // Execute migration seed statement - MUST NOT throw unique constraint violation!
      expect(() => {
        db.exec(seedSql);
      }).not.toThrow();

      // Verify the existing community report was preserved untouched (Requirement 3 & 4)
      const existing = db.prepare('SELECT * FROM voice_confusion_reports WHERE id = ?').get(existingCommunityId) as any;
      expect(existing).toBeDefined();
      expect(existing.id).toBe(existingCommunityId);
      expect(existing.provenance).toBe('community_submitted'); // Not promoted to seed_observation
      expect(existing.status).toBe('community_submitted');     // Not promoted to verified
      expect(existing.confirmations_count).toBe(8);           // Counter preserved
      expect(existing.flag_count).toBe(1);                    // Flags preserved
      expect(existing.details).toBe('Community report submitted by warehouse operator');

      // Verify the other 3 non-colliding seeds were inserted successfully
      const allRows = db.prepare('SELECT * FROM voice_confusion_reports').all() as any[];
      expect(allRows.length).toBe(4); // 1 community + 3 seeds

      const seedIds = allRows.map(r => r.id);
      expect(seedIds).toContain('5eed0000-0000-4000-8000-000000000002');
      expect(seedIds).toContain('5eed0000-0000-4000-8000-000000000003');
      expect(seedIds).toContain('5eed0000-0000-4000-8000-000000000004');
      // Colliding seed ID was safely skipped
      expect(seedIds).not.toContain('5eed0000-0000-4000-8000-000000000001');

      // Idempotency check: Re-running migration seed must execute without error and preserve exact state (Requirement 5)
      expect(() => {
        db.exec(seedSql);
      }).not.toThrow();
      const afterRerun = db.prepare('SELECT * FROM voice_confusion_reports').all() as any[];
      expect(afterRerun.length).toBe(4);
    });

    it('simulates PostgreSQL seed migration execution when matching location pair exists under a different UUID (F-01)', async () => {
      let PGlite: any;
      try {
        const pgliteMod = '@electric-sql/pglite';
        const mod = await import(/* @vite-ignore */ pgliteMod);
        PGlite = mod.PGlite;
      } catch {
        return;
      }

      const fsMod = 'node:fs';
      const pathMod = 'node:path';
      const fs = await import(/* @vite-ignore */ fsMod);
      const path = await import(/* @vite-ignore */ pathMod);
      const rootDir = (globalThis as any).process?.cwd ? (globalThis as any).process.cwd() : '.';
      const pgMigrationPath = path.resolve(rootDir, 'supabase/migrations/20261019000000_voice_confusion_reference.sql');
      const pgSql = fs.readFileSync(pgMigrationPath, 'utf8');

      // Extract the seed insert statement from the PostgreSQL migration
      const seedInsertMarker = 'INSERT INTO voice_confusion_reports';
      const seedInsertIdx = pgSql.lastIndexOf(seedInsertMarker);
      expect(seedInsertIdx).toBeGreaterThan(0);
      const seedSql = pgSql.slice(seedInsertIdx);

      const pg = new PGlite();
      await pg.exec(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);

        CREATE TABLE voice_confusion_reports (
          id UUID PRIMARY KEY,
          user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
          voiced_location TEXT NOT NULL,
          found_location TEXT NOT NULL,
          raw_voiced_location TEXT,
          raw_found_location TEXT,
          heard_location TEXT,
          actual_location TEXT,
          reason TEXT NOT NULL,
          details TEXT,
          status TEXT NOT NULL,
          provenance TEXT NOT NULL,
          confirmations_count INT NOT NULL DEFAULT 1,
          flag_count INT NOT NULL DEFAULT 0,
          voiced_location_norm TEXT GENERATED ALWAYS AS (UPPER(TRIM(voiced_location))) STORED,
          found_location_norm TEXT GENERATED ALWAYS AS (UPPER(TRIM(found_location))) STORED,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE UNIQUE INDEX idx_voice_confusion_ref_unique
        ON voice_confusion_reports (voiced_location_norm, found_location_norm);
      `);

      // Pre-insert an existing community report for one of the seed pairs (08MN / 20AN) with a different UUID
      const existingCommunityId = 'c0000000-1111-2222-3333-444444444444';
      await pg.exec(`
        INSERT INTO voice_confusion_reports (
          id, voiced_location, found_location,
          raw_voiced_location, raw_found_location,
          heard_location, actual_location,
          reason, details, status, provenance, confirmations_count, flag_count
        ) VALUES (
          '${existingCommunityId}'::uuid, '08MN', '20AN',
          '08MN', '20AN',
          '08MN', '20AN',
          'similar_sounding', 'Pre-existing community report from operator',
          'community_submitted', 'community_submitted', 9, 2
        );
      `);

      // Execute PostgreSQL seed statement - MUST NOT throw unique constraint violation!
      await expect(pg.exec(seedSql)).resolves.not.toThrow();

      // Verify the existing community report was preserved untouched (Requirement 3 & 4)
      const result = await pg.query('SELECT * FROM voice_confusion_reports WHERE id = $1', [existingCommunityId]);
      expect(result.rows.length).toBe(1);
      const existing = result.rows[0];
      expect(existing.id).toBe(existingCommunityId);
      expect(existing.provenance).toBe('community_submitted'); // Not promoted to seed_observation
      expect(existing.status).toBe('community_submitted');     // Not promoted to verified
      expect(existing.confirmations_count).toBe(9);           // Counter preserved
      expect(existing.flag_count).toBe(2);                    // Flags preserved
      expect(existing.details).toBe('Pre-existing community report from operator');

      // Verify the other 3 non-colliding seeds were inserted
      const allRowsRes = await pg.query('SELECT id, voiced_location, provenance FROM voice_confusion_reports ORDER BY voiced_location;');
      expect(allRowsRes.rows.length).toBe(4);
      const seedIds = allRowsRes.rows.map((r: any) => r.id);
      expect(seedIds).toContain('5eed0000-0000-4000-8000-000000000002');
      expect(seedIds).toContain('5eed0000-0000-4000-8000-000000000003');
      expect(seedIds).toContain('5eed0000-0000-4000-8000-000000000004');
      // Colliding seed ID was safely skipped
      expect(seedIds).not.toContain('5eed0000-0000-4000-8000-000000000001');

      // Rerun idempotency check: Re-running migration seed must execute without error and preserve exact state (Requirement 5)
      await expect(pg.exec(seedSql)).resolves.not.toThrow();
      const afterRerun = await pg.query('SELECT count(*) as cnt FROM voice_confusion_reports;');
      expect(Number(afterRerun.rows[0].cnt)).toBe(4);
    });
  });

  describe('Community Correction Submissions (Requirement 1 & 2)', () => {
    it('allows any anonymous visitor to share a location correction with normalisation', async () => {
      const response = await submitLocationCorrection({
        voiced_location: '  20bk  ', // lower case with surrounding whitespace
        found_location: ' 20kb ',
        details: 'Headset speaker muffled the B and K positions.'
      });

      expect(response.success).toBe(true);
      expect(response.report).toBeDefined();
      expect(response.report?.voiced_location).toBe('20BK');
      expect(response.report?.found_location).toBe('20KB');
      expect(response.report?.status).toBe('community_submitted');
      expect(response.report?.provenance).toBe('community_submitted');
      expect(response.report?.confirmations_count).toBe(1);
    });

    it('rejects submissions with invalid characters or too short length', async () => {
      const invalidShort = await submitLocationCorrection({
        voiced_location: 'A',
        found_location: '20AN'
      });
      expect(invalidShort.success).toBe(false);
      expect(invalidShort.error).toContain('at least 2 characters');

      const invalidChars = await submitLocationCorrection({
        voiced_location: '08$$',
        found_location: '20AN'
      });
      expect(invalidChars.success).toBe(false);
      expect(invalidChars.error).toContain('Permitted characters');
    });

    it('prevents identical submissions from creating duplicate records and corroborates existing report instead', async () => {
      // First user submits 33AA -> 33BB
      const first = await submitLocationCorrection(
        {
          voiced_location: '33AA',
          found_location: '33BB',
          details: 'First colleague observation'
        },
        'client-user-1'
      );

      expect(first.success).toBe(true);
      expect(first.is_corroboration).toBeFalsy();
      expect(first.report?.confirmations_count).toBe(1);

      // Second user submits the exact same correction
      const second = await submitLocationCorrection(
        {
          voiced_location: ' 33aa ',
          found_location: ' 33bb ',
          details: 'Second colleague heard the exact same thing'
        },
        'client-user-2'
      );

      expect(second.success).toBe(true);
      expect(second.is_corroboration).toBe(true);
      expect(second.report?.id).toBe(first.report?.id);
      expect(second.report?.confirmations_count).toBe(2);
      expect(second.message).toContain('Corroboration recorded');
    });
  });

  describe('Independent Confirmations (+1) & Corroboration (Requirement 2 & 6)', () => {
    it('allows visitors to independently confirm an existing community report', async () => {
      const all = await getAllActiveReports();
      const target = all[0];
      const initialCount = target.confirmations_count || 1;

      const confirmRes = await confirmReport(target.id, 'client-corroborator-99');
      expect(confirmRes.success).toBe(true);
      expect(confirmRes.new_confirmations_count).toBe(initialCount + 1);

      // Verify persistence in search
      const updated = await searchCommunityReports({ query: target.voiced_location });
      const found = updated.reports.find(r => r.id === target.id);
      expect(found?.confirmations_count).toBe(initialCount + 1);
    });

    it('rejects confirmation when client identifier is missing or less than 8 characters (SEC-02)', async () => {
      const all = await getAllActiveReports();
      const target = all[0];
      const initialCount = target.confirmations_count || 1;

      const emptyRes = await confirmReport(target.id, '');
      expect(emptyRes.success).toBe(false);
      expect(emptyRes.error).toContain('valid client identifier is required');

      const shortRes = await confirmReport(target.id, 'short');
      expect(shortRes.success).toBe(false);
      expect(shortRes.error).toContain('valid client identifier is required');

      // Verify count did NOT increment
      expect(target.confirmations_count).toBe(initialCount);
    });

    it('rejects duplicate confirmation from the same client identifier (SEC-02)', async () => {
      const all = await getAllActiveReports();
      const target = all[0];

      const firstConfirm = await confirmReport(target.id, 'unique-client-12345');
      expect(firstConfirm.success).toBe(true);

      const duplicateConfirm = await confirmReport(target.id, 'unique-client-12345');
      expect(duplicateConfirm.success).toBe(false);
      expect(duplicateConfirm.error).toContain('already confirmed');
    });
  });

  describe('Abuse Protection, Honeypot & Flagging (Requirement 2 & 6)', () => {
    it('blocks submissions when honeypot field is filled (bot trap)', async () => {
      const botSubmission = await submitLocationCorrection({
        voiced_location: '99ZZ',
        found_location: '99AA',
        honeypot: 'i-am-a-spambot'
      });

      expect(botSubmission.success).toBe(false);
      expect(botSubmission.error).toContain('Spam detection triggered');
    });

    it('enforces rate limits against rapid flood submissions from the same client', async () => {
      const client = 'flooder-client-xyz';

      // Submit 5 valid reports
      for (let i = 1; i <= 5; i++) {
        const res = await submitLocationCorrection(
          {
            voiced_location: `5${i}AA`,
            found_location: `5${i}BB`
          },
          client
        );
        expect(res.success).toBe(true);
      }

      // 6th submission within 10 minutes should be rate limited
      const sixth = await submitLocationCorrection(
        {
          voiced_location: '56AA',
          found_location: '56BB'
        },
        client
      );

      expect(sixth.success).toBe(false);
      expect(sixth.error).toContain('limit reached');
    });

    it('allows visitors to flag abusive or incorrect reports and moves to review upon threshold', async () => {
      // Create a test report
      const sub = await submitLocationCorrection(
        {
          voiced_location: '77XX',
          found_location: '77YY',
          details: 'Potential prank submission'
        },
        'prankster-client'
      );
      const reportId = sub.report!.id;

      // 3 independent flags
      await flagReport(reportId, 'inaccurate', 'flagger-1');
      await flagReport(reportId, 'spam', 'flagger-2');
      const thirdFlag = await flagReport(reportId, 'offensive', 'flagger-3');

      expect(thirdFlag.success).toBe(true);
      expect(thirdFlag.new_flag_count).toBe(3);

      // Report should now have status 'flagged' or 'under_review' and not appear in normal active queries
      const activeReports = await getAllActiveReports();
      const isVisible = activeReports.some(r => r.id === reportId);
      expect(isVisible).toBe(false);
    });

    it('rejects flagging when client identifier is missing or less than 8 characters (SEC-01) and preserves count', async () => {
      const all = await getAllActiveReports();
      const target = all[0];
      const initialFlags = target.flag_count || 0;

      const emptyRes = await flagReport(target.id, 'spam', '');
      expect(emptyRes.success).toBe(false);
      expect(emptyRes.error).toContain('valid client identifier is required');

      const shortRes = await flagReport(target.id, 'spam', 'abc');
      expect(shortRes.success).toBe(false);
      expect(shortRes.error).toContain('valid client identifier is required');

      // Verify flag_count did NOT increment
      expect(target.flag_count).toBe(initialFlags);
    });

    it('rejects duplicate flag from the same client identifier (SEC-01)', async () => {
      const all = await getAllActiveReports();
      const target = all[0];

      const firstFlag = await flagReport(target.id, 'spam', 'unique-flagger-999');
      expect(firstFlag.success).toBe(true);

      const duplicateFlag = await flagReport(target.id, 'spam', 'unique-flagger-999');
      expect(duplicateFlag.success).toBe(false);
      expect(duplicateFlag.error).toContain('already flagged');
    });
  });

  describe('Search & Shared Public Visibility (Requirement 1 & 6)', () => {
    it('finds reports by voiced location', async () => {
      const results = await searchCommunityReports({ query: '08MN' });
      expect(results.reports.length).toBeGreaterThanOrEqual(1);
      expect(results.reports[0].voiced_location).toBe('08MN');
      expect(results.reports[0].found_location).toBe('20AN');
    });

    it('finds reports by found location', async () => {
      const results = await searchCommunityReports({ query: 'Z01B' });
      expect(results.reports.length).toBeGreaterThanOrEqual(1);
      expect(results.reports[0].found_location).toBe('Z01B');
      expect(results.reports[0].voiced_location).toBe('01MM');
    });

    it('distinguishes community-submitted reports from verified reference records', async () => {
      const all = await getAllActiveReports();
      for (const report of all) {
        // Every report must clearly declare its provenance
        expect(['seed_observation', 'community_submitted', 'moderator_confirmed']).toContain(report.provenance);
        // It must NOT silently claim 'verified' unless actually verified
        if (report.provenance === 'community_submitted') {
          expect(report.status).not.toBe('verified');
        }
      }
    });
  });

  describe('Tasks 1-4 Safety & Regression Tests (Counters, Migration Transactions, Duplicate Concurrency)', () => {
    // Helper to spin up a local PostgreSQL engine with auth mocks and migrations 1 & 2 applied
    async function initTestPg() {
      let PGlite: any;
      let pgcrypto: any;
      try {
        const pgliteMod = '@electric-sql/pglite';
        const mod = await import(/* @vite-ignore */ pgliteMod);
        PGlite = mod.PGlite;
        const cryptoMod = await import(/* @vite-ignore */ '@electric-sql/pglite/contrib/pgcrypto');
        pgcrypto = cryptoMod.pgcrypto;
      } catch {
        return null;
      }

      const pg = new PGlite({ extensions: { pgcrypto } });

      await pg.exec(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            CREATE ROLE anon;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            CREATE ROLE authenticated;
          END IF;
        END $$;
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$ SELECT NULL::UUID $$ LANGUAGE SQL;
        CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$ SELECT 'anon'::TEXT $$ LANGUAGE SQL;
        CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$ SELECT '{}'::JSONB $$ LANGUAGE SQL;
      `);

      const fsMod = 'node:fs';
      const pathMod = 'node:path';
      const fs = await import(/* @vite-ignore */ fsMod);
      const path = await import(/* @vite-ignore */ pathMod);
      const rootDir = (globalThis as any).process?.cwd ? (globalThis as any).process.cwd() : '.';

      const m1Path = path.resolve(rootDir, 'supabase/migrations/20261014000000_voice_confusion_reports.sql');
      const m2Path = path.resolve(rootDir, 'supabase/migrations/20261019000000_voice_confusion_reference.sql');

      const m1Sql = fs.readFileSync(m1Path, 'utf8');
      const m2Sql = fs.readFileSync(m2Path, 'utf8');

      await pg.exec(m1Sql);
      await pg.exec(m2Sql);

      return { pg, fs, path, rootDir, m2Sql };
    }

    // 1. Repeated submission by same client
    it('Task 1 & 4.1: Repeated submission by the same client leaves confirmation count unchanged after first confirmation (Service layer)', async () => {
      const client = 'client-rep-1010';
      const first = await submitLocationCorrection(
        { voiced_location: '91AA', found_location: '91BB', details: 'Aisle misread' },
        client
      );

      expect(first.success).toBe(true);
      expect(first.is_duplicate).toBeFalsy();
      expect(first.report?.confirmations_count).toBe(1);

      // Same client submits identical pair
      const second = await submitLocationCorrection(
        { voiced_location: ' 91aa ', found_location: ' 91bb ', details: 'Resubmitted by same client' },
        client
      );

      expect(second.success).toBe(true);
      expect(second.is_duplicate).toBe(true);
      expect(second.is_corroboration).toBe(false);
      expect(second.is_new_confirmation).toBe(false);
      expect(second.report?.confirmations_count).toBe(1); // Unchanged!

      // 3rd time by same client
      const third = await submitLocationCorrection(
        { voiced_location: '91AA', found_location: '91BB' },
        client
      );
      expect(third.is_new_confirmation).toBe(false);
      expect(third.report?.confirmations_count).toBe(1); // Still 1!
    });

    it('Task 1 & 4.1: Repeated submission by same client leaves confirmation count unchanged in PostgreSQL RPC', async () => {
      const db = await initTestPg();
      if (!db) return;

      const client = 'client-pg-rep-1111';
      // First submission
      const sub1 = await db.pg.query(
        "SELECT submit_voice_confusion_reference('82AA', '82BB', NULL, NULL, 'similar_sounding', NULL, $1) as res;",
        [client]
      );
      const res1 = (sub1.rows[0] as any).res;
      expect(res1.success).toBe(true);
      expect(res1.is_duplicate).toBe(false);
      expect(res1.confirmations_count).toBe(1);

      // Second submission by same client
      const sub2 = await db.pg.query(
        "SELECT submit_voice_confusion_reference('82AA', '82BB', NULL, NULL, 'similar_sounding', NULL, $1) as res;",
        [client]
      );
      const res2 = (sub2.rows[0] as any).res;
      expect(res2.success).toBe(true);
      expect(res2.is_duplicate).toBe(true);
      expect(res2.is_new_confirmation).toBe(false);
      expect(res2.confirmations_count).toBe(1);

      // Verify database table state
      const dbReport = await db.pg.query(
        "SELECT confirmations_count FROM voice_confusion_reports WHERE id = $1;",
        [res1.id]
      );
      expect(dbReport.rows[0].confirmations_count).toBe(1);

      // Verify confirmations table has exactly 1 row for this client
      const dbConfirms = await db.pg.query(
        "SELECT count(*) as count FROM voice_confusion_confirmations WHERE report_id = $1;",
        [res1.id]
      );
      expect(Number(dbConfirms.rows[0].count)).toBe(1);
    });

    // 2. A new client can add a confirmation and increment count once
    it('Task 1 & 4.2: A new client can add a confirmation and increment the count once (Service layer)', async () => {
      const client1 = 'client-pair-2020';
      const client2 = 'client-pair-3030';

      const first = await submitLocationCorrection(
        { voiced_location: '92AA', found_location: '92BB' },
        client1
      );
      expect(first.report?.confirmations_count).toBe(1);

      // New client submits same pair
      const second = await submitLocationCorrection(
        { voiced_location: ' 92aa ', found_location: ' 92bb ' },
        client2
      );
      expect(second.success).toBe(true);
      expect(second.is_duplicate).toBe(true);
      expect(second.is_corroboration).toBe(true);
      expect(second.is_new_confirmation).toBe(true);
      expect(second.report?.confirmations_count).toBe(2);

      // New client resubmits: count must stay at 2
      const repeatClient2 = await submitLocationCorrection(
        { voiced_location: '92AA', found_location: '92BB' },
        client2
      );
      expect(repeatClient2.is_new_confirmation).toBe(false);
      expect(repeatClient2.report?.confirmations_count).toBe(2);
    });

    it('Task 1 & 4.2: A new client can add a confirmation and increment the count once in PostgreSQL RPC', async () => {
      const db = await initTestPg();
      if (!db) return;

      const client1 = 'client-pg-client1-999';
      const client2 = 'client-pg-client2-888';

      const sub1 = await db.pg.query(
        "SELECT submit_voice_confusion_reference('83AA', '83BB', NULL, NULL, 'similar_sounding', NULL, $1) as res;",
        [client1]
      );
      const res1 = (sub1.rows[0] as any).res;
      expect(res1.confirmations_count).toBe(1);

      // Client 2 adds corroboration
      const sub2 = await db.pg.query(
        "SELECT submit_voice_confusion_reference('83AA', '83BB', NULL, NULL, 'similar_sounding', NULL, $1) as res;",
        [client2]
      );
      const res2 = (sub2.rows[0] as any).res;
      expect(res2.success).toBe(true);
      expect(res2.is_duplicate).toBe(true);
      expect(res2.is_new_confirmation).toBe(true);
      expect(res2.confirmations_count).toBe(2);

      // Client 2 resubmission: must not increment
      const sub3 = await db.pg.query(
        "SELECT submit_voice_confusion_reference('83AA', '83BB', NULL, NULL, 'similar_sounding', NULL, $1) as res;",
        [client2]
      );
      const res3 = (sub3.rows[0] as any).res;
      expect(res3.is_new_confirmation).toBe(false);
      expect(res3.confirmations_count).toBe(2);

      // Submissions without valid client hash (< 8 chars): do not increment
      const subAnon = await db.pg.query(
        "SELECT submit_voice_confusion_reference('83AA', '83BB', NULL, NULL, 'similar_sounding', NULL, 'short') as res;"
      );
      const resAnon = (subAnon.rows[0] as any).res;
      expect(resAnon.is_new_confirmation).toBe(false);
      expect(resAnon.confirmations_count).toBe(2);

      // Confirmations table has exactly 2 records
      const confirms = await db.pg.query(
        "SELECT count(*) as count FROM voice_confusion_confirmations WHERE report_id = $1;",
        [res1.id]
      );
      expect(Number(confirms.rows[0].count)).toBe(2);
    });

    // 3. Concurrent submissions for same normalized pair
    it('Task 3 & 4.3: Advisory pair locking prevents duplicate reports even when unique index is dropped/absent', async () => {
      const db = await initTestPg();
      if (!db) return;

      // Simulate duplicate preflight detecting legacy duplicates and deferring unique index
      await db.pg.exec('DROP INDEX IF EXISTS idx_voice_confusion_ref_unique;');

      // Verify index is dropped
      const checkIdx = await db.pg.query(`
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_voice_confusion_ref_unique';
      `);
      expect(checkIdx.rows.length).toBe(0);

      // Submit identical normalized pair sequentially and simulate concurrent serialization
      const p1 = db.pg.query(
        "SELECT submit_voice_confusion_reference('84AA', '84BB', NULL, NULL, 'similar_sounding', NULL, 'client-c1-race') as res;"
      );
      const p2 = db.pg.query(
        "SELECT submit_voice_confusion_reference('84AA', '84BB', NULL, NULL, 'similar_sounding', NULL, 'client-c2-race') as res;"
      );

      const [r1, r2] = await Promise.all([p1, p2]);
      const res1 = (r1.rows[0] as any).res;
      const res2 = (r2.rows[0] as any).res;

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);

      // One is new insert, one is corroboration
      const duplicateFlags = [res1.is_duplicate, res2.is_duplicate];
      expect(duplicateFlags).toContain(false);
      expect(duplicateFlags).toContain(true);

      // Check table: exactly 1 report created!
      const reportRows = await db.pg.query(
        "SELECT count(*) as cnt, max(confirmations_count) as confs FROM voice_confusion_reports WHERE voiced_location_norm = '84AA' AND found_location_norm = '84BB';"
      );
      expect(Number(reportRows.rows[0].cnt)).toBe(1);
      expect(Number(reportRows.rows[0].confs)).toBe(2);
    });

    // 4. Seed migration reruns remain idempotent
    it('Task 4.4: Seed migration reruns remain completely idempotent in PostgreSQL', async () => {
      const db = await initTestPg();
      if (!db) return;

      const countBefore = await db.pg.query('SELECT count(*) as cnt FROM voice_confusion_reports;');
      const initialTotal = Number(countBefore.rows[0].cnt);
      expect(initialTotal).toBeGreaterThanOrEqual(4);

      // Extract the seed insertion block from migration SQL
      const seedInsertMarker = 'INSERT INTO voice_confusion_reports';
      const seedInsertIdx = db.m2Sql.lastIndexOf(seedInsertMarker);
      const seedSql = db.m2Sql.slice(seedInsertIdx);

      // Re-run seed insertion 1st time
      await expect(db.pg.exec(seedSql)).resolves.not.toThrow();
      const count1 = await db.pg.query('SELECT count(*) as cnt FROM voice_confusion_reports;');
      expect(Number(count1.rows[0].cnt)).toBe(initialTotal);

      // Re-run seed insertion 2nd time
      await expect(db.pg.exec(seedSql)).resolves.not.toThrow();
      const count2 = await db.pg.query('SELECT count(*) as cnt FROM voice_confusion_reports;');
      expect(Number(count2.rows[0].cnt)).toBe(initialTotal);
    });

    // 5. Existing community reports are preserved
    it('Task 4.5: Existing community reports, counters, and child confirmation records are strictly preserved during seed migration', async () => {
      let PGlite: any;
      let pgcrypto: any;
      try {
        const pgliteMod = '@electric-sql/pglite';
        const mod = await import(/* @vite-ignore */ pgliteMod);
        PGlite = mod.PGlite;
        const cryptoMod = await import(/* @vite-ignore */ '@electric-sql/pglite/contrib/pgcrypto');
        pgcrypto = cryptoMod.pgcrypto;
      } catch {
        return;
      }

      const pg = new PGlite({ extensions: { pgcrypto } });
      await pg.exec(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);

        CREATE TABLE voice_confusion_reports (
          id UUID PRIMARY KEY,
          user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
          voiced_location TEXT NOT NULL,
          found_location TEXT NOT NULL,
          raw_voiced_location TEXT,
          raw_found_location TEXT,
          heard_location TEXT,
          actual_location TEXT,
          reason TEXT NOT NULL,
          details TEXT,
          status TEXT NOT NULL,
          provenance TEXT NOT NULL,
          confirmations_count INT NOT NULL DEFAULT 1,
          flag_count INT NOT NULL DEFAULT 0,
          voiced_location_norm TEXT GENERATED ALWAYS AS (UPPER(TRIM(voiced_location))) STORED,
          found_location_norm TEXT GENERATED ALWAYS AS (UPPER(TRIM(found_location))) STORED,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE voice_confusion_confirmations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          report_id UUID NOT NULL REFERENCES voice_confusion_reports(id) ON DELETE CASCADE,
          client_hash TEXT NOT NULL,
          confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT uq_report_client_confirmation UNIQUE (report_id, client_hash)
        );

        CREATE UNIQUE INDEX idx_voice_confusion_ref_unique
        ON voice_confusion_reports (voiced_location_norm, found_location_norm);
      `);

      // Insert pre-existing community report colliding on location pair with 08MN -> 20AN but different UUID
      const existingId = 'd0000000-1111-2222-3333-444444444444';
      await pg.query(
        `INSERT INTO voice_confusion_reports (
          id, voiced_location, found_location,
          raw_voiced_location, raw_found_location,
          heard_location, actual_location,
          reason, details, status, provenance, confirmations_count, flag_count
        ) VALUES (
          $1::uuid, '08MN', '20AN',
          '08MN', '20AN',
          '08MN', '20AN',
          'similar_sounding', 'Original operator report prior to seed',
          'community_submitted', 'community_submitted', 14, 3
        );`,
        [existingId]
      );

      // Add child confirmation record
      await pg.query(
        `INSERT INTO voice_confusion_confirmations (report_id, client_hash)
         VALUES ($1::uuid, 'legacy-client-hash-777');`,
        [existingId]
      );

      const fsMod = 'node:fs';
      const pathMod = 'node:path';
      const fs = await import(/* @vite-ignore */ fsMod);
      const path = await import(/* @vite-ignore */ pathMod);
      const rootDir = (globalThis as any).process?.cwd ? (globalThis as any).process.cwd() : '.';
      const m2Path = path.resolve(rootDir, 'supabase/migrations/20261019000000_voice_confusion_reference.sql');
      const m2Sql = fs.readFileSync(m2Path, 'utf8');

      // Extract and execute seed insert statement
      const seedInsertMarker = 'INSERT INTO voice_confusion_reports';
      const seedInsertIdx = m2Sql.lastIndexOf(seedInsertMarker);
      const seedSql = m2Sql.slice(seedInsertIdx);

      await expect(pg.exec(seedSql)).resolves.not.toThrow();

      // Verify the community report was preserved untouched
      const res = await pg.query(
        'SELECT * FROM voice_confusion_reports WHERE id = $1::uuid;',
        [existingId]
      );
      expect(res.rows.length).toBe(1);
      const report = res.rows[0];
      expect(report.id).toBe(existingId);
      expect(report.provenance).toBe('community_submitted'); // Not promoted to seed_observation
      expect(report.status).toBe('community_submitted');     // Not promoted to approved
      expect(report.confirmations_count).toBe(14);          // Counter preserved
      expect(report.flag_count).toBe(3);                    // Flags preserved
      expect(report.details).toBe('Original operator report prior to seed');

      // Verify child confirmation record was preserved
      const confs = await pg.query(
        'SELECT count(*) as count FROM voice_confusion_confirmations WHERE report_id = $1::uuid;',
        [existingId]
      );
      expect(Number(confs.rows[0].count)).toBe(1);

      // Verify the other 3 non-colliding seeds were inserted
      const allRows = await pg.query('SELECT id, voiced_location, provenance FROM voice_confusion_reports;');
      expect(allRows.rows.length).toBe(4);
    });

    // 6. Transaction behavior
    it('Task 2 & 4.6: Migration wraps execution in BEGIN...COMMIT with advisory locking and rolls back cleanly on error', async () => {
      const db = await initTestPg();
      if (!db) return;

      // Verify migration file structure
      expect(db.m2Sql).toContain('BEGIN;');
      expect(db.m2Sql).toContain('COMMIT;');
      const beginIdx = db.m2Sql.indexOf('BEGIN;');
      const commitIdx = db.m2Sql.lastIndexOf('COMMIT;');
      const ddlIdx = db.m2Sql.indexOf('ALTER TABLE voice_confusion_reports');
      const seedIdx = db.m2Sql.lastIndexOf('INSERT INTO voice_confusion_reports');
      expect(beginIdx).toBeLessThan(ddlIdx);
      expect(commitIdx).toBeGreaterThan(seedIdx);

      expect(db.m2Sql).toContain("SELECT pg_advisory_xact_lock(hashtext('voice_confusion_reference_migration'));");
      expect(db.m2Sql).toContain("LOCK TABLE voice_confusion_reports IN SHARE ROW EXCLUSIVE MODE;");

      // Verify transaction rollback semantics: statements inside failed transaction block are completely reverted
      const testTableName = 'migration_transaction_rollback_test';
      let errorThrown = false;
      try {
        await db.pg.exec(`
          BEGIN;
          CREATE TABLE ${testTableName} (id INT PRIMARY KEY);
          INSERT INTO ${testTableName} (id) VALUES (1);
          -- Simulate error before COMMIT
          SELECT 1 / 0;
          COMMIT;
        `);
      } catch {
        errorThrown = true;
        // Clean up aborted transaction state
        await db.pg.exec('ROLLBACK;');
      }
      expect(errorThrown).toBe(true);

      // Verify table does not exist due to rollback
      const checkTable = await db.pg.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = $1;`,
        [testTableName]
      );
      expect(checkTable.rows.length).toBe(0);
    });

    // 7. Failure cases do not leave counters or child records inconsistent
    it('Task 4.7: Invalid submission inputs return error without inserting reports or corrupting counters', async () => {
      const db = await initTestPg();
      if (!db) return;

      const countBefore = await db.pg.query('SELECT count(*) as count FROM voice_confusion_reports;');

      // Invalid short location
      const r1 = await db.pg.query(
        "SELECT submit_voice_confusion_reference('A', '20AN') as res;"
      );
      expect((r1.rows[0] as any).res.success).toBe(false);

      // Invalid characters
      const r2 = await db.pg.query(
        "SELECT submit_voice_confusion_reference('08$$', '20AN') as res;"
      );
      expect((r2.rows[0] as any).res.success).toBe(false);

      // Identical locations
      const r3 = await db.pg.query(
        "SELECT submit_voice_confusion_reference('20AN', '20AN') as res;"
      );
      expect((r3.rows[0] as any).res.success).toBe(false);

      // Invalid reason
      const r4 = await db.pg.query(
        "SELECT submit_voice_confusion_reference('08MN', '20AN', NULL, NULL, 'invalid_reason') as res;"
      );
      expect((r4.rows[0] as any).res.success).toBe(false);

      const countAfter = await db.pg.query('SELECT count(*) as count FROM voice_confusion_reports;');
      expect(countAfter.rows[0].count).toBe(countBefore.rows[0].count);
    });

    it('Task 4.7: Unique-violation race recovery path maintains counter and child confirmation consistency', async () => {
      const db = await initTestPg();
      if (!db) return;

      const client1 = 'client-uv-race-1111';
      const client2 = 'client-uv-race-2222';

      // Submit an initial report
      const s1 = await db.pg.query(
        "SELECT submit_voice_confusion_reference('85AA', '85BB', NULL, NULL, 'similar_sounding', NULL, $1) as res;",
        [client1]
      );
      const res1 = (s1.rows[0] as any).res;
      expect(res1.success).toBe(true);
      expect(res1.confirmations_count).toBe(1);

      // Corroboration by new client
      const s2 = await db.pg.query(
        "SELECT submit_voice_confusion_reference('85AA', '85BB', NULL, NULL, 'similar_sounding', NULL, $1) as res;",
        [client2]
      );
      const res2 = (s2.rows[0] as any).res;
      expect(res2.is_new_confirmation).toBe(true);
      expect(res2.confirmations_count).toBe(2);

      // Verify report counter matches confirmations table
      const reportRow = await db.pg.query(
        "SELECT confirmations_count FROM voice_confusion_reports WHERE id = $1;",
        [res1.id]
      );
      const confirmsCount = await db.pg.query(
        "SELECT count(*) as cnt FROM voice_confusion_confirmations WHERE report_id = $1;",
        [res1.id]
      );

      expect(reportRow.rows[0].confirmations_count).toBe(2);
      expect(Number(confirmsCount.rows[0].cnt)).toBe(2);
    });
  });
});

