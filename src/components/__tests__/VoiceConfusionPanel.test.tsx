// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { VoiceConfusionPanel } from '../VoiceConfusionPanel.tsx';
import * as adapterModule from '../../voiceConfusion/evidenceAdapter.ts';
import * as engineModule from '../../logic/voiceConfusion/engine.ts';
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
        isTruncated: true,
        isHighTrustTruncated: true,
        isUnverifiedTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="10AK" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText(/results may be incomplete: some approved reports may be missing/)).toBeTruthy();
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
      resolvePromise({
        kind: 'available',
        reports: [],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

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
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
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
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
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

    it('enforces Decision D14: suppresses details for seed observations, and renders 200-char truncated plain text for other reports inside collapsed disclosure', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [
          // 1. Seed observation with details containing whole-number words ("twenty", "eighty-one")
          baseReport({
            id: 'rep-seed-details',
            voiced_location: '08MN',
            found_location: '20AN',
            provenance: 'seed_observation',
            status: 'approved',
            details: 'Spoken "zero-eight" acoustically confused with "twenty" over radio.'
          }),
          // 2. Community report with user free text
          baseReport({
            id: 'rep-community-details',
            voiced_location: '10AK',
            found_location: '10DD',
            provenance: 'moderator_confirmed',
            status: 'approved',
            details: 'High background noise in aisle near refrigeration unit caused acoustic misrecognition. ' + 'X'.repeat(250)
          })
        ],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

      // Render 10AK (community report with free text)
      render(<VoiceConfusionPanel currentLocation="10AK" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText(/Reported pairs/)).toBeTruthy();
      });

      // Labelled disclosure exists
      const noteSummary = screen.getByText("Reporter's note (free text, unverified)");
      expect(noteSummary).toBeTruthy();

      // Free text is truncated to 200 chars max
      const noteText = screen.getByText(/High background noise in aisle near refrigeration unit/);
      expect(noteText.textContent?.length).toBeLessThanOrEqual(200);

      cleanup();

      // Render 08MN (seed observation)
      render(<VoiceConfusionPanel currentLocation="08MN" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText(/Reported pairs/)).toBeTruthy();
      });

      // Seed observation details must NOT be rendered anywhere
      expect(screen.queryByText(/acoustically confused with "twenty"/)).toBeNull();
      expect(screen.queryByText("Reporter's note (free text, unverified)")).toBeNull();
    });
  });

  describe('5. Row Rendering: Token-by-Token Alignment, Verbal Relations, No Fake Scores', () => {
    it('renders token-by-token alignment with differing tokens highlighted and verbal "close" / "far" relations', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
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
    });

    it('strictly avoids whole-number words across all application-generated text (Invariant I6 digit-by-digit)', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
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

      // Comprehensive list of whole-number words must not appear in application text
      const wholeNumbers = [
        'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
        'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty',
        'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'ten'
      ];
      for (const num of wholeNumbers) {
        const regex = new RegExp(`\\b${num}\\b`, 'i');
        expect(text).not.toMatch(regex);
      }
    });
  });

  describe('6. Empty Tier 1+2 & Special Facility Notice', () => {
    it('displays empty Tier 1+2 notice when no close sound-alikes exist', async () => {
      // 99ZZ has no close sound-alikes in Tiers 1-2
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
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
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="CA01" debounceMs={0} />);

      await waitFor(() => {
        expect(
          screen.getByText(/Special facility codes \(Cash Office \/ Collection Point\) use 3 spoken words/)
        ).toBeTruthy();
      });
    });
  });

  describe('7. Arithmetic Pool: Lazy Computation, Pagination, and Text Filter', () => {
    it('performs arithmetic pool lazy computation: engine is not asked for the pool until the disclosure opens', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

      const suggestSpy = vi.spyOn(engineModule, 'suggestConfusions');

      render(<VoiceConfusionPanel currentLocation="21EZ" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('Close sound-alikes')).toBeTruthy();
      });

      // Initial engine call has includeArithmeticCollisions: false
      expect(suggestSpy).toHaveBeenCalledWith('21EZ', expect.objectContaining({ includeArithmeticCollisions: false }));
      expect(suggestSpy).not.toHaveBeenCalledWith('21EZ', expect.objectContaining({ includeArithmeticCollisions: true }));

      // Open the disclosure
      const poolSummary = screen.getByText('Remaining same-check codes (arithmetic pool)');
      const poolDetails = poolSummary.closest('details')!;
      poolDetails.open = true;
      fireEvent(poolDetails, new Event('toggle'));

      // Now the engine is invoked for the arithmetic pool
      expect(suggestSpy).toHaveBeenCalledWith('21EZ', expect.objectContaining({ includeArithmeticCollisions: true }));
    });

    it('paginates arithmetic pool at 50 codes per page with next and previous controls', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="21EZ" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('Close sound-alikes')).toBeTruthy();
      });

      // Open disclosure
      const poolSummary = screen.getByText('Remaining same-check codes (arithmetic pool)');
      const poolDetails = poolSummary.closest('details')!;
      poolDetails.open = true;
      fireEvent(poolDetails, new Event('toggle'));

      // Verify Page 1
      expect(screen.getByText(/Showing 1–50 of \d+ codes/)).toBeTruthy();
      expect(screen.getByText(/Page 1 of \d+/)).toBeTruthy();

      // Click Next
      const nextBtn = screen.getByRole('button', { name: /Next page/i });
      fireEvent.click(nextBtn);

      // Verify Page 2
      expect(screen.getByText(/Showing 51–100 of \d+ codes/)).toBeTruthy();
      expect(screen.getByText(/Page 2 of \d+/)).toBeTruthy();

      // Click Previous
      const prevBtn = screen.getByRole('button', { name: /Previous page/i });
      fireEvent.click(prevBtn);

      // Verify return to Page 1
      expect(screen.getByText(/Showing 1–50 of \d+ codes/)).toBeTruthy();
      expect(screen.getByText(/Page 1 of \d+/)).toBeTruthy();
    });

    it('filters arithmetic pool by text and provides a clear button', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="21EZ" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('Close sound-alikes')).toBeTruthy();
      });

      // Open disclosure
      const poolSummary = screen.getByText('Remaining same-check codes (arithmetic pool)');
      const poolDetails = poolSummary.closest('details')!;
      poolDetails.open = true;
      fireEvent(poolDetails, new Event('toggle'));

      // Type filter for '11BZ'
      const filterInput = screen.getByLabelText('Filter same-check codes');
      fireEvent.change(filterInput, { target: { value: '11BZ' } });

      // Only 11BZ matched
      expect(screen.getByText(/Showing 1–1 of 1 codes/)).toBeTruthy();
      expect(screen.getByText('11BZ')).toBeTruthy();

      // Click Clear button
      const clearBtn = screen.getByRole('button', { name: /Clear filter/i });
      fireEvent.click(clearBtn);

      // Filter cleared
      expect(screen.getByText(/Showing 1–50 of \d+ codes/)).toBeTruthy();
    });
  });

  describe('8. Disclosures Element Types and Native Pattern', () => {
    it('disclosures use native details and summary elements (real keyboard and screen-reader behaviour needs a manual check)', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="21EZ" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('Close sound-alikes')).toBeTruthy();
      });

      const poolSummaryText = screen.getByText('Remaining same-check codes (arithmetic pool)');
      const poolSummary = poolSummaryText.closest('summary')!;
      const poolDetails = poolSummaryText.closest('details')!;

      // Assert element types: native <details> and <summary> disclosure elements
      expect(poolSummary.tagName.toLowerCase()).toBe('summary');
      expect(poolDetails.tagName.toLowerCase()).toBe('details');
      expect(poolDetails.open).toBe(false);

      // In jsdom, dispatch toggle via the details element open property/event
      // (Real keyboard and screen-reader behaviour needs a manual check in a real browser)
      poolDetails.open = true;
      fireEvent(poolDetails, new Event('toggle'));
      expect(poolDetails.open).toBe(true);
      expect(screen.getByPlaceholderText(/Filter same-check codes/i)).toBeTruthy();

      // Dispatch toggle closed
      poolDetails.open = false;
      fireEvent(poolDetails, new Event('toggle'));
      expect(poolDetails.open).toBe(false);
    });

    it('shows Tier 3 collapsed count in Possible sound-alikes disclosure summary', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="10AK" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('Close sound-alikes')).toBeTruthy();
      });

      // Summary displays count of possible sound-alikes
      expect(screen.getByText(/Possible sound-alikes \(\d+\)/)).toBeTruthy();
    });
  });

  describe('9. Different-Check Section Copy & Isolation', () => {
    it('displays exact different-check explanatory copy when reports with differing check character exist', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="10AK" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText(/Reported confusions with a different check character/)).toBeTruthy();
      });

      // Open different-check disclosure
      const diffSummary = screen.getByText(/Reported confusions with a different check character/);
      fireEvent.click(diffSummary);

      // Exact explanatory copy
      expect(
        screen.getByText(
          "Reported location 10KA has check character 'BRAVO' while 10AK has 'NOVEMBER'. The discrepancy would normally be rejected by the check-character step."
        )
      ).toBeTruthy();
    });
  });

  describe('10. Model Details Disclosure: Numeric Distances Kept Strictly Inside', () => {
    it('contains no "%" or numeric decimal distances in default view, with distances visible only when "Model details" is opened', async () => {
      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockResolvedValue({
        kind: 'available',
        reports: [],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

      render(<VoiceConfusionPanel currentLocation="10AK" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('10DD')).toBeTruthy();
      });

      const panel = screen.getByRole('region', { name: /Voice Confusion Risk Analysis/i });

      // No percentage symbol
      expect(panel.textContent).not.toContain('%');

      // No score text
      expect(panel.textContent).not.toMatch(/score:\s*\d+/i);

      // In default view, numeric decimal distances (e.g. 0.40) are NOT visible
      expect(screen.queryByText(/model assessment:\s*0\.\d{2}/i)).toBeNull();

      // Open "Model details" disclosure
      const modelDetailsSummary = screen.getAllByText('Model details (model assessment, not a probability)')[0];
      const modelDetails = modelDetailsSummary.closest('details')!;
      modelDetails.open = true;
      fireEvent(modelDetails, new Event('toggle'));

      // Now the numeric distance is visible inside the disclosure
      expect(screen.getByText(/model assessment:\s*0\.\d{2}/i)).toBeTruthy();
    });
  });

  describe('11. Stale In-Flight Request Coordinator', () => {
    it('ignores late response when committed input changes while fetch is in flight', async () => {
      let resolve10AK!: (res: adapterModule.EvidenceResult) => void;
      const p10AK = new Promise<adapterModule.EvidenceResult>(resolve => {
        resolve10AK = resolve;
      });

      vi.spyOn(adapterModule, 'fetchEvidenceForLocation').mockImplementation(async (loc: string) => {
        if (loc === '10AK') {
          return p10AK;
        }
        return {
          kind: 'available',
          reports: [],
          isTruncated: false,
          isHighTrustTruncated: false,
          isUnverifiedTruncated: false
        };
      });

      const { rerender } = render(<VoiceConfusionPanel currentLocation="10AK" debounceMs={0} />);

      // While 10AK fetch is in-flight, input changes to 21EZ
      rerender(<VoiceConfusionPanel currentLocation="21EZ" debounceMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('21DK')).toBeTruthy();
      });

      // Now 10AK's delayed promise resolves with 10DD as an approved report
      resolve10AK({
        kind: 'available',
        reports: [baseReport({ voiced_location: '10AK', found_location: '10DD', status: 'approved' })],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

      await new Promise(r => setTimeout(r, 20));

      // Panel must stay on 21EZ results; 10DD from 10AK must be strictly ignored
      expect(screen.getByText('21DK')).toBeTruthy();
      expect(screen.queryByText('10DD')).toBeNull();
    });
  });
});
