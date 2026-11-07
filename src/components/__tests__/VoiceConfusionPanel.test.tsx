// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { VoiceConfusionPanel } from '../VoiceConfusionPanel.tsx';
import * as adapterModule from '../../voiceConfusion/evidenceAdapter.ts';
import type { VoiceConfusionReport } from '../../voiceConfusion/types.ts';

describe('Milestone 6: VoiceConfusionPanel Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const baseReport = (overrides?: Partial<VoiceConfusionReport>): VoiceConfusionReport => {
    const voiced = overrides?.voiced_location ?? '10AK';
    const found = overrides?.found_location ?? '10DD';
    return {
      id: 'rep-panel-01',
      user_id: null,
      voiced_location: voiced,
      found_location: found,
      voiced_location_norm: overrides?.voiced_location_norm ?? voiced,
      found_location_norm: overrides?.found_location_norm ?? found,
      reason: 'similar_sounding',
      status: 'approved',
      provenance: 'moderator_confirmed',
      confirmations_count: 3,
      flag_count: 0,
      created_at: '2026-11-01T12:00:00Z',
      updated_at: '2026-11-01T12:00:00Z',
      ...overrides
    };
  };

  describe('1. Input Debounce & Unsupported / Invalid Input State', () => {
    it('renders null when input is empty', () => {
      const { container } = render(<VoiceConfusionPanel currentLocation="" debounceMs={0} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders engine unsupported message for > 4 character input (over-4-characters message)', async () => {
      render(<VoiceConfusionPanel currentLocation="10AKX" debounceMs={0} />);

      await waitFor(() => {
        expect(
          screen.getByText("Input has more than 4 characters; the calculator used the first four ('10AK'). Suggestions are only shown for exact 4-character codes.")
        ).toBeTruthy();
      });

      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText('Voice Confusion Risk Analysis')).toBeTruthy();
    });

    it('renders engine unsupported message for non-grammar input (???)', async () => {
      render(<VoiceConfusionPanel currentLocation="???" debounceMs={0} />);

      await waitFor(() => {
        expect(
          screen.getByText('Location format is not recognized as a supported Store stockroom location code.')
        ).toBeTruthy();
      });
    });
  });

  describe('2. Evidence Unavailable, Loading, and Truncated States', () => {
    it('displays "community evidence unavailable" (never "no reports") when evidence fetch fails or persistence is unconfigured', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'unavailable',
        reason: 'database_not_configured',
        userMessage: 'community evidence unavailable'
      });

      render(<VoiceConfusionPanel currentLocation="10AK" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('community evidence unavailable')).toBeTruthy();
      });

      // Must NEVER display "no reports"
      expect(screen.queryByText(/no reports/i)).toBeNull();

      // NATO phonetic results still display immediately
      expect(screen.getByText(/Acoustic sound-alikes sharing check character/i)).toBeTruthy();
      expect(screen.getAllByText('NOVEMBER').length).toBeGreaterThan(0);
    });

    it('displays "results may be incomplete" when database evidence is truncated', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [baseReport()],
        isTruncated: true
      });

      render(<VoiceConfusionPanel currentLocation="10AK" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('results may be incomplete')).toBeTruthy();
      });
    });

    it('shows loading indicator while evidence fetch is in-flight, with phonetic sound-alikes visible immediately', async () => {
      let resolvePromise!: (val: adapterModule.EvidenceResult) => void;
      const fetchPromise = new Promise<adapterModule.EvidenceResult>(resolve => {
        resolvePromise = resolve;
      });
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockReturnValue(fetchPromise);

      render(<VoiceConfusionPanel currentLocation="10AK" debounceMs={0} />);

      // NATO phonetic results are immediately visible while fetch is in-flight
      await waitFor(() => {
        expect(screen.getByText('10DD')).toBeTruthy();
      });
      expect(screen.getByText(/Acoustic sound-alikes sharing check character/i)).toBeTruthy();

      // Loading badge is visible
      expect(screen.getByText(/Loading community evidence/i)).toBeTruthy();

      // Resolve the evidence fetch
      resolvePromise({ kind: 'available', reports: [], isTruncated: false });

      await waitFor(() => {
        expect(screen.queryByText(/Loading community evidence/i)).toBeNull();
      });
    });
  });

  describe('3. Invariant I2 Same-Check Gate: 10KA and 01AK Absence End-to-End', () => {
    it('ensures 10KA and 01AK NEVER appear in candidate sound-alikes for 10AK, and isolates 10KA in different-check disclosure', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [
          baseReport({
            voiced_location: '10AK',
            found_location: '10KA',
            voiced_location_norm: '10AK',
            found_location_norm: '10KA',
            reason: 'similar_check_character',
            status: 'confirmed'
          })
        ],
        isTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="10AK" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('Close sound-alikes')).toBeTruthy();
      });

      // 1. Verify 10DD (check character NOVEMBER) is present as a close sound-alike
      expect(screen.getByText('10DD')).toBeTruthy();

      // 2. Verify 10KA and 01AK are NOT in close sound-alikes or possible matches
      const candidateCodeElements = screen.getAllByLabelText(/Candidate location/);
      const candidateCodes = candidateCodeElements.map(el => el.textContent?.trim());
      expect(candidateCodes).not.toContain('10KA');
      expect(candidateCodes).not.toContain('01AK');

      // 3. Verify 10KA appears ONLY in the isolated different-check section
      const diffSection = screen.getByText(/Reported confusions with a different check character/);
      expect(diffSection).toBeTruthy();
      expect(screen.getAllByText(/Check: BRAVO \(different check character\)/).length).toBeGreaterThan(0);
    });
  });

  describe('4. Section (a): Reported Pairs with Labels and Badges', () => {
    it('displays J7AZ with 07AZ in Reported pairs with reason label, status, and badges', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [
          baseReport({
            voiced_location: 'J7AZ',
            found_location: '07AZ',
            voiced_location_norm: 'J7AZ',
            found_location_norm: '07AZ',
            reason: 'similar_sounding',
            status: 'approved',
            provenance: 'moderator_confirmed',
            confirmations_count: 4
          })
        ],
        isTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="J7AZ" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText(/Reported pairs/)).toBeTruthy();
      });

      // Reported counterpart 07AZ in Section (a)
      expect(screen.getAllByLabelText('Reported location 07AZ').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Reference example').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Similar sounding').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Check character: YANKEE \(same check character\)/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/possible code, not verified to exist in your store/).length).toBeGreaterThan(0);
    });
  });

  describe('5. Row Rendering: Token-by-Token Alignment, Verbal Relations, No Fake Scores', () => {
    it('renders token-by-token alignment with differing tokens highlighted and verbal "close" / "far" relations', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="10AK" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('10DD')).toBeTruthy();
      });

      // Check character arithmetic fact
      expect(screen.getAllByText(/Check character: NOVEMBER \(same check character\)/).length).toBeGreaterThan(0);

      // Existence badge
      expect(screen.getAllByText('possible code, not verified to exist in your store').length).toBeGreaterThan(0);

      // Alignment table rows: Searched, Candidate, Relation
      expect(screen.getAllByRole('rowheader', { name: 'Searched:' }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('rowheader', { name: 'Candidate:' }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('rowheader', { name: 'Relation:' }).length).toBeGreaterThan(0);

      // Verbal relations: identical and close (ALPHA vs DELTA and KILO vs DELTA are <= 0.55)
      expect(screen.getAllByText('identical').length).toBeGreaterThan(0);
      expect(screen.getAllByText('close').length).toBeGreaterThan(0);

      // Model details disclosure exists with exact required label
      const modelDetailsSummaries = screen.getAllByText('Model details (model assessment, not a probability)');
      expect(modelDetailsSummaries.length).toBeGreaterThan(0);

      // No percentages or arbitrary scores in rendered text by default
      const panel = screen.getByRole('region', { name: /Voice Confusion Risk Analysis/i });
      expect(panel.textContent).not.toContain('%');
      expect(panel.textContent).not.toMatch(/\d+%/);
      expect(panel.textContent).not.toMatch(/score:\s*\d+/i);
    });

    it('strictly avoids whole-number words for aisles across rendered text (Invariant I6 digit-by-digit)', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="10AK" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('10DD')).toBeTruthy();
      });

      const panel = screen.getByRole('region', { name: /Voice Confusion Risk Analysis/i });
      const text = panel.textContent || '';

      // Spoken words must be digit-by-digit: 'ONE' 'ZERO' (never whole-number aisle word 'TEN')
      expect(text).toContain('ONE');
      expect(text).toContain('ZERO');
      expect(text).not.toContain('TEN ALPHA KILO');
      expect(text).not.toContain('AISLE TEN');
    });
  });

  describe('6. Empty Tier 1+2 & Special Facility Notice', () => {
    it('displays empty Tier 1+2 notice when no close sound-alikes exist', async () => {
      // 99ZZ has no close sound-alikes in Tiers 1-2
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="99ZZ" debounceMs={0} />);

      await waitFor(() => {
        expect(
          screen.getByText('No same-check-character code is phonetically close enough under the current model. This does not mean none exists.')
        ).toBeTruthy();
      });
    });

    it('displays distinct special facility notice for Cash Office or Collection Point inputs', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="CA01" debounceMs={0} />);

      await waitFor(() => {
        expect(
          screen.getByText(/Special facility codes \(Cash Office \/ Collection Point\) use 3 spoken words/)
        ).toBeTruthy();
      });
    });
  });

  describe('7. Arithmetic Pool: 21EZ with 11BZ Visible ONLY in Arithmetic Pool', () => {
    it('shows 11BZ for input 21EZ ONLY when arithmetic pool disclosure is opened, never in Tiers 1-3', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="21EZ" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('Close sound-alikes')).toBeTruthy();
      });

      // 1. In Tiers 1-3 (Close sound-alikes), 11BZ is NOT visible
      expect(screen.queryByText('11BZ')).toBeNull();

      // 2. Open the arithmetic pool disclosure
      const poolSummary = screen.getByText('All same-check codes (arithmetic pool)');
      expect(poolSummary).toBeTruthy();
      fireEvent.click(poolSummary);

      // 3. Filter for 11BZ in the arithmetic pool filter input
      const filterInput = screen.getByLabelText('Filter same-check codes');
      fireEvent.change(filterInput, { target: { value: '11BZ' } });

      // 4. Now 11BZ is visible inside the arithmetic pool!
      expect(screen.getByText('11BZ')).toBeTruthy();
      expect(screen.getAllByText(/Check character: UNIFORM \(same check character\)/).length).toBeGreaterThan(0);
      expect(screen.getByText('Arithmetic pool')).toBeTruthy();
    });
  });

  describe('8. Disclosures Keyboard Operability and aria-expanded State', () => {
    it('disclosures are keyboard-operable with Space and Enter and reflect aria-expanded state', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="21EZ" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('Close sound-alikes')).toBeTruthy();
      });

      const poolSummary = screen.getByRole('button', { name: /All same-check codes/i });
      expect(poolSummary.getAttribute('aria-expanded')).toBe('false');

      // Operate with Enter key to expand
      fireEvent.keyDown(poolSummary, { key: 'Enter', code: 'Enter' });
      expect(poolSummary.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByPlaceholderText(/Filter same-check codes/i)).toBeTruthy();

      // Operate with Space key to collapse
      fireEvent.keyDown(poolSummary, { key: ' ', code: 'Space' });
      expect(poolSummary.getAttribute('aria-expanded')).toBe('false');
    });
  });
});
