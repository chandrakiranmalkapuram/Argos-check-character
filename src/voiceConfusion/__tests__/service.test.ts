import { describe, it, expect, beforeEach } from 'vitest';
import {
  submitVoiceConfusionReport,
  searchApprovedReports,
  fetchUserReports,
  setTestCurrentUser,
  resetTestStore
} from '../service.ts';
import type { AuthUser } from '../types.ts';

describe('Voice Confusion Service Layer & Authentication Requirements', () => {
  const standardUser: AuthUser = {
    id: 'user-123',
    email: 'picker.chandra@store.co.uk',
    role: 'user',
    isModerator: false,
    isAdmin: false
  };

  const otherUser: AuthUser = {
    id: 'user-456',
    email: 'other.colleague@store.co.uk',
    role: 'user',
    isModerator: false,
    isAdmin: false
  };

  beforeEach(() => {
    resetTestStore();
  });

  describe('Unauthenticated Submissions & Access Gates', () => {
    it('strictly rejects report submissions when unauthenticated', async () => {
      setTestCurrentUser(null); // Unauthenticated visitor

      const response = await submitVoiceConfusionReport({
        heard_location: '20BK',
        actual_location: '20KB',
        reason: 'headset_misrecognition',
        details: 'Attempting submission while unauthenticated.'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Authentication required');
      expect(response.report).toBeUndefined();
    });

    it('returns empty array when unauthenticated user tries to fetch own reports', async () => {
      setTestCurrentUser(null);
      const reports = await fetchUserReports();
      expect(reports).toEqual([]);
    });
  });

  describe('Authenticated Submissions & User Ownership', () => {
    beforeEach(() => {
      setTestCurrentUser(standardUser);
    });

    it('creates a new report with status = pending and assigns user_id ownership', async () => {
      const response = await submitVoiceConfusionReport({
        heard_location: '20BK',
        actual_location: '20KB',
        reason: 'headset_misrecognition',
        details: 'Heard reversed letters in warehouse aisle.'
      });

      expect(response.success).toBe(true);
      expect(response.report).toBeDefined();
      expect(response.report?.status).toBe('pending');
      expect(response.report?.user_id).toBe(standardUser.id);
      expect(response.report?.heard_location).toBe('20BK');
      expect(response.report?.actual_location).toBe('20KB');
      expect(response.message).toContain('pending review');
    });

    it('allows a signed-in user to see their own submitted reports and moderation statuses', async () => {
      await submitVoiceConfusionReport({
        heard_location: '40BK',
        actual_location: '40KB',
        reason: 'similar_check_character',
        details: 'My test submission'
      });

      const myReports = await fetchUserReports();
      expect(myReports.length).toBeGreaterThan(0);
      const found = myReports.find(r => r.heard_location === '40BK');
      expect(found).toBeDefined();
      expect(found?.user_id).toBe(standardUser.id);
      expect(found?.status).toBe('pending');
    });

    it('does NOT expose a user pending report to other non-moderator users', async () => {
      // 1. standardUser submits a report
      await submitVoiceConfusionReport({
        heard_location: '77ZZ',
        actual_location: '77ZA',
        reason: 'other',
        details: 'Private pending note'
      });

      // 2. Switch to otherUser
      setTestCurrentUser(otherUser);
      const otherUserReports = await fetchUserReports();

      // otherUser must NOT see standardUser's report in their list
      const leaked = otherUserReports.find(r => r.heard_location === '77ZZ');
      expect(leaked).toBeUndefined();
    });

    it('detects duplicate submissions with same normalised heard, actual and reason', async () => {
      // First submission
      const res1 = await submitVoiceConfusionReport({
        heard_location: '30CP',
        actual_location: '30PC',
        reason: 'similar_check_character',
        details: 'First submission'
      });
      expect(res1.success).toBe(true);

      // Duplicate submission (different case, extra whitespace)
      const res2 = await submitVoiceConfusionReport({
        heard_location: '  30cp  ',
        actual_location: '30pc',
        reason: 'similar_check_character',
        details: 'Second attempt with same values'
      });

      expect(res2.success).toBe(false);
      expect(res2.is_duplicate).toBe(true);
      expect(res2.error).toContain('already been submitted');
    });

    it('does NOT merge or reject reports with different actual locations for the same heard location', async () => {
      const res = await submitVoiceConfusionReport({
        heard_location: 'J7AZ',
        actual_location: 'J8AZ',
        reason: 'similar_sounding',
        details: 'Different actual shelf entirely'
      });

      expect(res.success).toBe(true);
      expect(res.report?.heard_location).toBe('J7AZ');
      expect(res.report?.actual_location).toBe('J8AZ');
    });

    it('enforces rate-limiting on excessive rapid submissions from a single user', async () => {
      // Submit 5 valid distinct reports
      for (let i = 1; i <= 5; i++) {
        const res = await submitVoiceConfusionReport({
          heard_location: `0${i}AA`,
          actual_location: `0${i}BB`,
          reason: 'other'
        });
        expect(res.success).toBe(true);
      }

      // 6th attempt from the same user should be throttled
      const resBlocked = await submitVoiceConfusionReport({
        heard_location: '99AA',
        actual_location: '99BB',
        reason: 'other'
      });

      expect(resBlocked.success).toBe(false);
      expect(resBlocked.error).toContain('Submission limit reached');
    });
  });

  describe('Public Search Interface & Visitor Access (No Sign In Required)', () => {
    it('allows public visitors to search approved reports without signing in', async () => {
      setTestCurrentUser(null); // Anonymous visitor

      const result = await searchApprovedReports({ query: 'J7AZ' });
      expect(result.reports.length).toBeGreaterThan(0);
      const match = result.reports.find(r => r.heard_location === 'J7AZ');
      expect(match).toBeDefined();
      expect(match?.actual_location).toBe('07AZ');
      expect(match?.reason).toBe('similar_sounding');
    });

    it('searches and finds the same report by ACTUAL location (e.g. 07AZ)', async () => {
      setTestCurrentUser(null);

      const result = await searchApprovedReports({ query: '07AZ' });
      expect(result.reports.length).toBeGreaterThan(0);
      const match = result.reports.find(r => r.actual_location === '07AZ');
      expect(match).toBeDefined();
      expect(match?.heard_location).toBe('J7AZ');
    });

    it('strictly returns APPROVED reports only; pending submissions are NEVER visible in public search', async () => {
      // 1. Authenticated user submits a report (defaults to pending)
      setTestCurrentUser(standardUser);
      const subRes = await submitVoiceConfusionReport({
        heard_location: '90ZZ',
        actual_location: '90ZA',
        reason: 'other'
      });
      expect(subRes.success).toBe(true);
      expect(subRes.report?.status).toBe('pending');

      // 2. Anonymous public visitor searches for the code
      setTestCurrentUser(null);
      const searchResult = await searchApprovedReports({ query: '90ZZ' });

      // Must be empty because it is not yet approved
      expect(searchResult.reports).toEqual([]);
      expect(searchResult.totalCount).toBe(0);
    });
  });
});
