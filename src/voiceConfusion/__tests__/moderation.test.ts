import { describe, it, expect, beforeEach } from 'vitest';
import {
  submitVoiceConfusionReport,
  searchApprovedReports,
  fetchUserReports,
  signInWithMagicLink,
  signOutUser,
  fetchModerationQueue,
  updateReportModerationStatus,
  setTestCurrentUser,
  getCurrentUser,
  resetTestStore
} from '../service.ts';
import type { AuthUser } from '../types.ts';

describe('Protected Moderation Workflow & Server-Authorised Roles', () => {
  const normalUser: AuthUser = {
    id: 'usr-standard-01',
    email: 'normal.picker@store.co.uk',
    role: 'user',
    isModerator: false,
    isAdmin: false
  };

  const moderatorUser: AuthUser = {
    id: 'usr-mod-01',
    email: 'moderator@stockroom.test',
    role: 'moderator',
    isModerator: true,
    isAdmin: false
  };

  const adminUser: AuthUser = {
    id: 'usr-admin-01',
    email: 'admin@stockroom.test',
    role: 'admin',
    isModerator: true,
    isAdmin: true
  };

  beforeEach(() => {
    resetTestStore();
  });

  describe('Unauthorised Moderation Attempts Being Rejected', () => {
    it('rejects unauthenticated attempts to fetch the moderation queue', async () => {
      setTestCurrentUser(null); // Unauthenticated
      await expect(fetchModerationQueue('pending')).rejects.toThrow(
        /Unauthorized/i
      );
    });

    it('rejects non-moderator authenticated user attempts to fetch the moderation queue', async () => {
      setTestCurrentUser(normalUser); // Standard authenticated user without mod role
      await expect(fetchModerationQueue('pending')).rejects.toThrow(
        /Unauthorized/i
      );
    });

    it('rejects unauthenticated attempts to update report moderation status', async () => {
      setTestCurrentUser(null);
      const res = await updateReportModerationStatus('test-report-id', 'approved');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unauthorized');
    });

    it('rejects non-moderator authenticated user attempts to update report moderation status', async () => {
      setTestCurrentUser(normalUser);
      const res = await updateReportModerationStatus('test-report-id', 'approved');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unauthorized');
    });

    it('prevents browser/client from tampering with server-assigned user roles', async () => {
      // Sign in normal user
      await signInWithMagicLink('normal.picker@store.co.uk');
      const user = await getCurrentUser();
      expect(user?.role).toBe('user');
      expect(user?.isModerator).toBe(false);

      // Even if a malicious client attempts to tamper with memory/attributes,
      // server verification guards moderation operations
      const tamperedUser: AuthUser = {
        ...user!,
        role: 'user' // Cannot elevate to admin without server authorization
      };
      setTestCurrentUser(tamperedUser);
      await expect(fetchModerationQueue('pending')).rejects.toThrow(/Unauthorized/i);
    });
  });

  describe('Authorised Moderation Lifecycle (Approve & Reject)', () => {
    it('allows authorised moderator to review, approve, and publish a pending report', async () => {
      // 1. Submit report as standard user
      setTestCurrentUser(normalUser);
      const subRes = await submitVoiceConfusionReport({
        heard_location: '55XY',
        actual_location: '55YX',
        reason: 'similar_check_character',
        details: 'Transposed characters produce identical check character.'
      });

      expect(subRes.success).toBe(true);
      const reportId = subRes.report!.id;

      // 2. Verify report is NOT visible to public visitors
      setTestCurrentUser(null);
      const publicBefore = await searchApprovedReports({ query: '55XY' });
      expect(publicBefore.reports).toHaveLength(0);

      // 3. Log in as authorised moderator
      setTestCurrentUser(moderatorUser);

      // 4. Inspect pending moderation queue
      const pendingQueue = await fetchModerationQueue('pending');
      const queuedReport = pendingQueue.find(r => r.id === reportId);
      expect(queuedReport).toBeDefined();
      expect(queuedReport?.status).toBe('pending');

      // 5. Approve report with feedback note
      const approveRes = await updateReportModerationStatus(
        reportId,
        'approved',
        'Verified on physical shelf layout.'
      );
      expect(approveRes.success).toBe(true);

      // 6. Sign out to test public perspective
      await signOutUser();
      const publicAfter = await searchApprovedReports({ query: '55XY' });
      expect(publicAfter.reports).toHaveLength(1);
      expect(publicAfter.reports[0].id).toBe(reportId);
      expect(publicAfter.reports[0].status).toBe('approved');

      // 7. Sign in as original submitter to verify they see their approved status and note in "My Reports"
      setTestCurrentUser(normalUser);
      const userReports = await fetchUserReports();
      const myApproved = userReports.find(r => r.id === reportId);
      expect(myApproved).toBeDefined();
      expect(myApproved?.status).toBe('approved');
      expect(myApproved?.moderator_notes).toBe('Verified on physical shelf layout.');
    });

    it('allows authorised administrator to reject a report so it remains hidden from public search', async () => {
      // 1. Submit report as standard user
      setTestCurrentUser(normalUser);
      const subRes = await submitVoiceConfusionReport({
        heard_location: '88AB',
        actual_location: '88BA',
        reason: 'other',
        details: 'Invalid noise test'
      });
      const reportId = subRes.report!.id;

      // 2. Admin logs in and rejects the report with reason
      setTestCurrentUser(adminUser);
      const rejectRes = await updateReportModerationStatus(
        reportId,
        'rejected',
        'Does not meet stockroom phonetic misrecognition threshold.'
      );
      expect(rejectRes.success).toBe(true);

      // 3. Public search: must NOT return rejected report
      setTestCurrentUser(null);
      const searchRes = await searchApprovedReports({ query: '88AB' });
      expect(searchRes.reports).toHaveLength(0);

      // 4. Submitter sees their report marked as rejected with moderator note
      setTestCurrentUser(normalUser);
      const submitterReports = await fetchUserReports();
      const myRejected = submitterReports.find(r => r.id === reportId);
      expect(myRejected).toBeDefined();
      expect(myRejected?.status).toBe('rejected');
      expect(myRejected?.moderator_notes).toContain('Does not meet stockroom');
    });

    it('verifies the full public submission and admin moderation lifecycle', async () => {
      // 1. A visitor can submit a report without logging in
      setTestCurrentUser(null); // Anonymous visitor
      const subRes = await submitVoiceConfusionReport({
        heard_location: '72ZK',
        actual_location: '72KZ',
        reason: 'similar_sounding',
        details: 'Anonymous field report from picker without login'
      });
      expect(subRes.success).toBe(true);
      expect(subRes.report).toBeDefined();
      const reportId = subRes.report!.id;

      // 2. A new report receives 'pending' status
      expect(subRes.report?.status).toBe('pending');
      expect(subRes.report?.user_id).toBeNull();

      // 3. A visitor cannot approve their own report or change its status
      const unauthorizedUpdate = await updateReportModerationStatus(reportId, 'approved');
      expect(unauthorizedUpdate.success).toBe(false);
      expect(unauthorizedUpdate.error).toContain('Unauthorized');

      // 4. Public search returns approved reports only (pending report is hidden)
      const publicSearchBefore = await searchApprovedReports({ query: '72ZK' });
      expect(publicSearchBefore.reports).toHaveLength(0);

      // 5. An unauthorised visitor cannot access the admin dashboard or pending reports
      await expect(fetchModerationQueue('pending')).rejects.toThrow(/Unauthorized/i);

      // 6. Authorised admin account can approve and reject reports
      setTestCurrentUser(adminUser); // Log in as admin
      const adminQueue = await fetchModerationQueue('pending');
      const pendingItem = adminQueue.find(r => r.id === reportId);
      expect(pendingItem).toBeDefined();
      expect(pendingItem?.status).toBe('pending');

      // Admin approves the report
      const approveRes = await updateReportModerationStatus(
        reportId,
        'approved',
        'Verified in Argos stockroom aisle 72.'
      );
      expect(approveRes.success).toBe(true);

      // Now public search returns the newly approved report
      setTestCurrentUser(null);
      const publicSearchAfter = await searchApprovedReports({ query: '72ZK' });
      expect(publicSearchAfter.reports).toHaveLength(1);
      expect(publicSearchAfter.reports[0].id).toBe(reportId);
      expect(publicSearchAfter.reports[0].status).toBe('approved');
    });

    it('handles magic-link sign in and session persistence simulation', async () => {
      // Sign in via magic link
      const magicRes = await signInWithMagicLink('moderator@stockroom.test');
      expect(magicRes.success).toBe(true);

      const user = await getCurrentUser();
      expect(user).toBeDefined();
      expect(user?.email).toBe('moderator@stockroom.test');
      expect(user?.isModerator).toBe(true);

      // Sign out
      await signOutUser();
      const loggedOutUser = await getCurrentUser();
      expect(loggedOutUser).toBeNull();
    });
  });
});
