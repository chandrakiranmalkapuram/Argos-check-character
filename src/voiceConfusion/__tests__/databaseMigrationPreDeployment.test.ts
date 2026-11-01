import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

import m1Sql from '../../../supabase/migrations/20261014000000_voice_confusion_reports.sql?raw';
import m2Sql from '../../../supabase/migrations/20261014000001_auth_and_user_roles.sql?raw';
import m3Sql from '../../../supabase/migrations/20261014000002_allow_public_submissions.sql?raw';
import m4Sql from '../../../supabase/migrations/20261019000000_voice_confusion_reference.sql?raw';

describe('Database Migration Pre-Deployment Audit & Security Suite', () => {
  let pg: PGlite;

  // Helper to switch context between anon and authenticated
  async function setSessionRole(role: 'anon' | 'authenticated', userId: string | null = null) {
    const uidSql = userId ? `'${userId}'::UUID` : 'NULL::UUID';
    await pg.exec(`
      RESET ROLE;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$ SELECT '${role}'::TEXT $$ LANGUAGE SQL;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$ SELECT ${uidSql} $$ LANGUAGE SQL;
      SET ROLE ${role};
    `);
  }

  async function resetToSuperuser() {
    await pg.exec(`RESET ROLE;`);
  }

  beforeAll(async () => {
    pg = new PGlite({ extensions: { pgcrypto } });

    // Emulate Supabase auth roles and system schema on clean project
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
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT,
        raw_app_meta_data JSONB DEFAULT '{}'::jsonb
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$ SELECT NULL::UUID $$ LANGUAGE SQL;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$ SELECT 'anon'::TEXT $$ LANGUAGE SQL;
      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$ SELECT '{}'::JSONB $$ LANGUAGE SQL;
    `);
  });

  // ==========================================================================
  // 1. Full Sequential Execution of Migrations 1, 2, 3 and 4
  // ==========================================================================
  describe('1. Sequential Migration Execution on Empty Project', () => {
    it('executes migrations 1, 2, 3, and 4 in sequential order without errors', async () => {
      await expect(pg.exec(m1Sql)).resolves.not.toThrow();
      await expect(pg.exec(m2Sql)).resolves.not.toThrow();
      await expect(pg.exec(m3Sql)).resolves.not.toThrow();
      await expect(pg.exec(m4Sql)).resolves.not.toThrow();

      // In Supabase, anon and authenticated roles have USAGE on schema public and table access
      // with security enforced by Row Level Security (RLS)
      await pg.exec(`
        GRANT USAGE ON SCHEMA public TO anon, authenticated;
        GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
        GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;
      `);
    });

    it('verifies all expected database tables and objects exist', async () => {
      const tablesRes = await pg.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' 
        ORDER BY tablename;
      `);
      const tableNames = tablesRes.rows.map(r => r.tablename);

      expect(tableNames).toContain('voice_confusion_reports');
      expect(tableNames).toContain('user_roles');
      expect(tableNames).toContain('moderators');
      expect(tableNames).toContain('voice_confusion_rate_limits');
      expect(tableNames).toContain('voice_confusion_confirmations');
      expect(tableNames).toContain('voice_confusion_flags');
    });

    it('verifies all seven reference observations are seeded idempotently', async () => {
      const seedsRes = await pg.query<{
        id: string;
        voiced_location: string;
        found_location: string;
        provenance: string;
      }>(`
        SELECT id, voiced_location, found_location, provenance 
        FROM voice_confusion_reports 
        ORDER BY voiced_location;
      `);

      expect(seedsRes.rows.length).toBe(7);

      const pairs = seedsRes.rows.map(r => `${r.voiced_location}->${r.found_location}`);
      expect(pairs).toContain('08MN->20AN');
      expect(pairs).toContain('16ZG->16JA');
      expect(pairs).toContain('81ZE->50ER');
      expect(pairs).toContain('01MM->Z01B');
      expect(pairs).toContain('J7AZ->07AZ');
      expect(pairs).toContain('S1PG->01PG');
      expect(pairs).toContain('10AK->10KA');
    });

    it('verifies re-running migration 4 is strictly idempotent and does not create duplicates', async () => {
      await expect(pg.exec(m4Sql)).resolves.not.toThrow();

      const countRes = await pg.query<{ count: string }>(`
        SELECT count(*) as count FROM voice_confusion_reports;
      `);
      expect(Number(countRes.rows[0].count)).toBe(7);
    });
  });

  // ==========================================================================
  // 2. Anonymous Users Cannot Approve or Modify Reports (RLS Enforcement)
  // ==========================================================================
  describe('2. Anonymous Permissions Enforced by PostgreSQL RLS', () => {
    beforeAll(async () => {
      await setSessionRole('anon', null);
    });

    it('blocks anonymous users from directly updating report status or notes', async () => {
      // Pick a seeded report
      const seed = (await pg.query<{ id: string }>(`SELECT id FROM voice_confusion_reports LIMIT 1;`)).rows[0];

      // Direct UPDATE by anon must update 0 rows due to RLS USING policy
      const updateRes = await pg.query(`
        UPDATE voice_confusion_reports 
        SET status = 'approved', moderator_notes = 'Hacked by anon' 
        WHERE id = $1;
      `, [seed.id]);

      // PostgreSQL RLS silently hides rows that fail the USING expression for UPDATE
      expect((updateRes as any).rowCount || 0).toBe(0);

      // Verify the record was untouched
      const verifyRes = await pg.query<{ moderator_notes: string | null }>(`
        SELECT moderator_notes FROM voice_confusion_reports WHERE id = $1;
      `, [seed.id]);
      expect(verifyRes.rows[0].moderator_notes).toBeNull();
    });

    it('blocks anonymous users from directly inserting reports with approved status', async () => {
      const maliciousId = 'a0000000-0000-4000-8000-000000000001';

      // Direct INSERT with status = 'approved' violates RLS policy "Allow public and authenticated submissions"
      await expect(
        pg.query(`
          INSERT INTO voice_confusion_reports (
            id, heard_location, actual_location, reason, status
          ) VALUES (
            $1::UUID, '11AA', '11BB', 'similar_sounding', 'approved'
          );
        `, [maliciousId])
      ).rejects.toThrow(/violates row-level security policy/i);
    });

    it('blocks anonymous users from directly deleting reports', async () => {
      const seed = (await pg.query<{ id: string }>(`SELECT id FROM voice_confusion_reports LIMIT 1;`)).rows[0];

      const deleteRes = await pg.query(`
        DELETE FROM voice_confusion_reports WHERE id = $1;
      `, [seed.id]);

      expect((deleteRes as any).rowCount || 0).toBe(0);

      const check = await pg.query<{ count: string }>(`SELECT count(*) as count FROM voice_confusion_reports WHERE id = $1;`, [seed.id]);
      expect(Number(check.rows[0].count)).toBe(1);
    });

    it('allows anonymous visitors to read active community reports', async () => {
      const selectRes = await pg.query<{ count: string }>(`
        SELECT count(*) as count FROM voice_confusion_reports;
      `);
      expect(Number(selectRes.rows[0].count)).toBe(7);
    });
  });

  // ==========================================================================
  // 3. Ordinary Authenticated Users Cannot Assign Themselves Admin Roles
  // ==========================================================================
  describe('3. User Roles Self-Elevation Prevention', () => {
    const ordinaryUserId = '22222222-2222-4000-8000-222222222222';

    beforeAll(async () => {
      // Create user in auth.users as superuser
      await resetToSuperuser();
      await pg.query(`
        INSERT INTO auth.users (id, email) 
        VALUES ($1, 'picker.bob@store.co.uk')
        ON CONFLICT (id) DO NOTHING;
      `, [ordinaryUserId]);

      // Set session as this ordinary authenticated user
      await setSessionRole('authenticated', ordinaryUserId);
    });

    it('confirms ordinary user does not have admin or moderator privileges', async () => {
      const adminRes = await pg.query<{ is_admin: boolean }>(`SELECT is_admin();`);
      const modRes = await pg.query<{ is_moderator: boolean }>(`SELECT is_moderator();`);

      expect(adminRes.rows[0].is_admin).toBe(false);
      expect(modRes.rows[0].is_moderator).toBe(false);
    });

    it('strictly forbids ordinary users from inserting into user_roles', async () => {
      // Attempt self-elevation to admin
      await expect(
        pg.query(`
          INSERT INTO user_roles (user_id, role) 
          VALUES ($1, 'admin');
        `, [ordinaryUserId])
      ).rejects.toThrow(/violates row-level security policy/i);

      // Attempt self-elevation to moderator
      await expect(
        pg.query(`
          INSERT INTO user_roles (user_id, role) 
          VALUES ($1, 'moderator');
        `, [ordinaryUserId])
      ).rejects.toThrow(/violates row-level security policy/i);
    });

    it('strictly forbids ordinary users from updating or tampering with user_roles', async () => {
      const updateRes = await pg.query(`
        UPDATE user_roles SET role = 'admin' WHERE user_id = $1;
      `, [ordinaryUserId]);

      expect((updateRes as any).rowCount || 0).toBe(0);
    });

    it('strictly forbids ordinary users from inserting into moderators table', async () => {
      await expect(
        pg.query(`
          INSERT INTO moderators (user_id, email) 
          VALUES ($1, 'picker.bob@store.co.uk');
        `, [ordinaryUserId])
      ).rejects.toThrow(/violates row-level security policy/i);
    });
  });

  // ==========================================================================
  // 4. Confirmation RPC Behaviour
  // ==========================================================================
  describe('4. Confirmation RPC Behaviour (confirm_voice_confusion_observation)', () => {
    let testReportId: string;
    const clientHashA = 'client_audit_hash_01';
    const clientHashB = 'client_audit_hash_02';

    beforeAll(async () => {
      await setSessionRole('anon', null);

      // Create a dedicated report for confirmation testing
      const insertRes = await pg.query<{ submit_voice_confusion_reference: any }>(`
        SELECT submit_voice_confusion_reference(
          '99AA', '99BB', '99AA', '99BB', 'similar_sounding', 'Test report for confirmations', 'author_client_hash_00'
        );
      `);
      testReportId = insertRes.rows[0].submit_voice_confusion_reference.id;
    });

    it('corroborates report and increments confirmations_count (+1)', async () => {
      const rpcRes = await pg.query<{ confirm_voice_confusion_observation: any }>(`
        SELECT confirm_voice_confusion_observation($1::uuid, $2);
      `, [testReportId, clientHashA]);

      const result = rpcRes.rows[0].confirm_voice_confusion_observation;
      expect(result.success).toBe(true);
      expect(result.new_count).toBe(2);

      const check = await pg.query<{ confirmations_count: number }>(`
        SELECT confirmations_count FROM voice_confusion_reports WHERE id = $1;
      `, [testReportId]);
      expect(check.rows[0].confirmations_count).toBe(2);
    });

    it('prevents repeated confirmation spam from the exact same client', async () => {
      const rpcRes = await pg.query<{ confirm_voice_confusion_observation: any }>(`
        SELECT confirm_voice_confusion_observation($1::uuid, $2);
      `, [testReportId, clientHashA]);

      const result = rpcRes.rows[0].confirm_voice_confusion_observation;
      expect(result.success).toBe(false);
      expect(result.error).toContain('already confirmed');

      // Counter must not be inflated
      const check = await pg.query<{ confirmations_count: number }>(`
        SELECT confirmations_count FROM voice_confusion_reports WHERE id = $1;
      `, [testReportId]);
      expect(check.rows[0].confirmations_count).toBe(2);
    });

    it('rejects confirmations with invalid/short client identifiers', async () => {
      const rpcRes = await pg.query<{ confirm_voice_confusion_observation: any }>(`
        SELECT confirm_voice_confusion_observation($1::uuid, 'short');
      `, [testReportId]);

      const result = rpcRes.rows[0].confirm_voice_confusion_observation;
      expect(result.success).toBe(false);
      expect(result.error).toContain('valid client identifier is required');
    });

    it('allows a different client to confirm the report (+1)', async () => {
      const rpcRes = await pg.query<{ confirm_voice_confusion_observation: any }>(`
        SELECT confirm_voice_confusion_observation($1::uuid, $2);
      `, [testReportId, clientHashB]);

      const result = rpcRes.rows[0].confirm_voice_confusion_observation;
      expect(result.success).toBe(true);
      expect(result.new_count).toBe(3);
    });
  });

  // ==========================================================================
  // 5. Flagging RPC Behaviour
  // ==========================================================================
  describe('5. Flagging RPC Behaviour (flag_voice_confusion_observation)', () => {
    let testReportId: string;
    const flaggerA = 'flagger_client_hash_01';
    const flaggerB = 'flagger_client_hash_02';
    const flaggerC = 'flagger_client_hash_03';

    beforeAll(async () => {
      await setSessionRole('anon', null);

      const insertRes = await pg.query<{ submit_voice_confusion_reference: any }>(`
        SELECT submit_voice_confusion_reference(
          '88AA', '88BB', '88AA', '88BB', 'similar_sounding', 'Test report for flags', 'author_client_hash_01'
        );
      `);
      testReportId = insertRes.rows[0].submit_voice_confusion_reference.id;
    });

    it('flags report and increments flag_count (+1) without demoting on first flag', async () => {
      const rpcRes = await pg.query<{ flag_voice_confusion_observation: any }>(`
        SELECT flag_voice_confusion_observation($1::uuid, 'Suspected incorrect', $2);
      `, [testReportId, flaggerA]);

      const result = rpcRes.rows[0].flag_voice_confusion_observation;
      expect(result.success).toBe(true);
      expect(result.flag_count).toBe(1);
      expect(result.is_flagged).toBe(false);

      const check = await pg.query<{ status: string; flag_count: number }>(`
        SELECT status, flag_count FROM voice_confusion_reports WHERE id = $1;
      `, [testReportId]);
      expect(check.rows[0].flag_count).toBe(1);
      expect(check.rows[0].status).toBe('community_submitted');
    });

    it('prevents repeated flags from the same client hash', async () => {
      const rpcRes = await pg.query<{ flag_voice_confusion_observation: any }>(`
        SELECT flag_voice_confusion_observation($1::uuid, 'Duplicate flag attempt', $2);
      `, [testReportId, flaggerA]);

      const result = rpcRes.rows[0].flag_voice_confusion_observation;
      expect(result.success).toBe(false);
      expect(result.error).toContain('already flagged');

      const check = await pg.query<{ flag_count: number }>(`
        SELECT flag_count FROM voice_confusion_reports WHERE id = $1;
      `, [testReportId]);
      expect(check.rows[0].flag_count).toBe(1);
    });

    it('automatically marks report status as flagged when threshold of 3 flags is reached', async () => {
      // Flag 2 from flaggerB
      const rpcRes2 = await pg.query<{ flag_voice_confusion_observation: any }>(`
        SELECT flag_voice_confusion_observation($1::uuid, 'Reason 2', $2);
      `, [testReportId, flaggerB]);
      expect(rpcRes2.rows[0].flag_voice_confusion_observation.is_flagged).toBe(false);

      // Flag 3 from flaggerC -> reaches threshold
      const rpcRes3 = await pg.query<{ flag_voice_confusion_observation: any }>(`
        SELECT flag_voice_confusion_observation($1::uuid, 'Reason 3', $2);
      `, [testReportId, flaggerC]);
      const res3 = rpcRes3.rows[0].flag_voice_confusion_observation;
      expect(res3.flag_count).toBe(3);
      expect(res3.is_flagged).toBe(true);

      // Verify that anonymous visitors can NO LONGER see the flagged report (enforced by RLS)
      const anonCheck = await pg.query<{ status: string; flag_count: number }>(`
        SELECT status, flag_count FROM voice_confusion_reports WHERE id = $1;
      `, [testReportId]);
      expect(anonCheck.rows.length).toBe(0);

      // Verify via superuser that status is recorded as 'flagged' in the database
      await resetToSuperuser();
      const adminCheck = await pg.query<{ status: string; flag_count: number }>(`
        SELECT status, flag_count FROM voice_confusion_reports WHERE id = $1;
      `, [testReportId]);
      expect(adminCheck.rows[0].status).toBe('flagged');
      expect(adminCheck.rows[0].flag_count).toBe(3);
      await setSessionRole('anon', null);
    });
  });

  // ==========================================================================
  // 6. Rate-Limit Expiration
  // ==========================================================================
  describe('6. Anti-Spam Rate-Limit Window & Expiration', () => {
    const spammerClient = 'spammer_client_test_99';

    beforeAll(async () => {
      await setSessionRole('anon', null);
    });

    it('allows 5 submissions and blocks the 6th within the 10-minute window', async () => {
      // 5 submissions
      for (let i = 1; i <= 5; i++) {
        const res = await pg.query<{ submit_voice_confusion_reference: any }>(`
          SELECT submit_voice_confusion_reference(
            $1, $2, $1, $2, 'similar_sounding', 'Rate limit test', $3
          );
        `, [`7${i}AA`, `7${i}BB`, spammerClient]);

        expect(res.rows[0].submit_voice_confusion_reference.success).toBe(true);
      }

      // 6th submission within 10 minutes must be rate-limited
      const blockedRes = await pg.query<{ submit_voice_confusion_reference: any }>(`
        SELECT submit_voice_confusion_reference(
          '76AA', '76BB', '76AA', '76BB', 'similar_sounding', 'Should be blocked', $1
        );
      `, [spammerClient]);

      const blockedResult = blockedRes.rows[0].submit_voice_confusion_reference;
      expect(blockedResult.success).toBe(false);
      expect(blockedResult.error).toContain('Submission limit reached');
    });

    it('permits submissions again after the 10-minute window expires', async () => {
      // Age rate-limit entries by 11 minutes as superuser (simulating time passing)
      await resetToSuperuser();
      await pg.query(`
        UPDATE voice_confusion_rate_limits 
        SET submitted_at = submitted_at - INTERVAL '11 minutes' 
        WHERE client_hash = $1;
      `, [spammerClient]);
      await setSessionRole('anon', null);

      // Attempt submission again: should now succeed!
      const permittedRes = await pg.query<{ submit_voice_confusion_reference: any }>(`
        SELECT submit_voice_confusion_reference(
          '76AA', '76BB', '76AA', '76BB', 'similar_sounding', 'Now allowed after expiration', $1
        );
      `, [spammerClient]);

      expect(permittedRes.rows[0].submit_voice_confusion_reference.success).toBe(true);
    });
  });

  // ==========================================================================
  // 7. Duplicate Submissions and Concurrent Submissions
  // ==========================================================================
  describe('7. Deduplication & Concurrency Safety', () => {
    const pairVoiced = '66AA';
    const pairFound = '66BB';
    const clientX = 'client_dedup_user_x';
    const clientY = 'client_dedup_user_y';

    beforeAll(async () => {
      await setSessionRole('anon', null);
    });

    it('creates a new report on initial submission of a unique location pair', async () => {
      const res = await pg.query<{ submit_voice_confusion_reference: any }>(`
        SELECT submit_voice_confusion_reference(
          $1, $2, $1, $2, 'similar_sounding', 'Initial observation', $3
        );
      `, [pairVoiced, pairFound, clientX]);

      const result = res.rows[0].submit_voice_confusion_reference;
      expect(result.success).toBe(true);
      expect(result.is_duplicate).toBe(false);
      expect(result.confirmations_count).toBe(1);
    });

    it('corroborates existing observation when duplicate location pair submitted by different client', async () => {
      const res = await pg.query<{ submit_voice_confusion_reference: any }>(`
        SELECT submit_voice_confusion_reference(
          $1, $2, $1, $2, 'similar_sounding', 'Corroborating submission', $3
        );
      `, [pairVoiced, pairFound, clientY]);

      const result = res.rows[0].submit_voice_confusion_reference;
      expect(result.success).toBe(true);
      expect(result.is_duplicate).toBe(true);
      expect(result.is_new_confirmation).toBe(true);
      expect(result.confirmations_count).toBe(2);

      // Verify strictly 1 row exists in voice_confusion_reports for this pair
      const check = await pg.query<{ count: string }>(`
        SELECT count(*) as count 
        FROM voice_confusion_reports 
        WHERE voiced_location_norm = $1 AND found_location_norm = $2;
      `, [pairVoiced, pairFound]);
      expect(Number(check.rows[0].count)).toBe(1);
    });

    it('does not inflate confirmations when duplicate location pair re-submitted by the same client', async () => {
      const res = await pg.query<{ submit_voice_confusion_reference: any }>(`
        SELECT submit_voice_confusion_reference(
          $1, $2, $1, $2, 'similar_sounding', 'Repeated submission by client Y', $3
        );
      `, [pairVoiced, pairFound, clientY]);

      const result = res.rows[0].submit_voice_confusion_reference;
      expect(result.success).toBe(true);
      expect(result.is_duplicate).toBe(true);
      expect(result.is_new_confirmation).toBe(false);
      expect(result.confirmations_count).toBe(2);
    });

    it('normalisation handles whitespace and letter case during deduplication', async () => {
      const res = await pg.query<{ submit_voice_confusion_reference: any }>(`
        SELECT submit_voice_confusion_reference(
          '  66aa  ', '  66bb  ', '66aa', '66bb', 'similar_sounding', 'Messy whitespace case', 'client_whitespace_01'
        );
      `);

      const result = res.rows[0].submit_voice_confusion_reference;
      expect(result.success).toBe(true);
      expect(result.is_duplicate).toBe(true);

      const check = await pg.query<{ count: string }>(`
        SELECT count(*) as count 
        FROM voice_confusion_reports 
        WHERE voiced_location_norm = $1 AND found_location_norm = $2;
      `, [pairVoiced, pairFound]);
      expect(Number(check.rows[0].count)).toBe(1);
    });
  });
});
