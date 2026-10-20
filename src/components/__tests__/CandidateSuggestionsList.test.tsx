import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { CandidateSuggestionsList } from '../CandidateSuggestionsList.tsx';
import type { VoiceConfusionReport } from '../../voiceConfusion/types.ts';

describe('CandidateSuggestionsList UI Component', () => {
  const mockReports: VoiceConfusionReport[] = [
    {
      id: 'rep-001',
      user_id: null,
      voiced_location: '10AK',
      found_location: '10KA',
      raw_voiced_location: '10AK',
      raw_found_location: '10KA',
      voiced_location_norm: '10AK',
      found_location_norm: '10KA',
      heard_location: '10AK',
      actual_location: '10KA',
      heard_location_norm: '10AK',
      actual_location_norm: '10KA',
      reason: 'similar_check_character',
      details: 'Transposition mistake in aisle 10',
      status: 'confirmed',
      provenance: 'moderator_confirmed',
      confirmations_count: 5,
      flag_count: 0,
      created_at: '2026-10-19T00:00:00Z',
      updated_at: '2026-10-19T00:00:00Z'
    }
  ];

  it('renders null when currentLocation is empty', () => {
    const html = renderToString(
      <CandidateSuggestionsList
        currentLocation=""
        communityReports={mockReports}
        onSelectLocation={vi.fn()}
        onOpenVoiceConfusionReference={vi.fn()}
      />
    );
    expect(html).toBe('');
  });

  it('renders the polished UI with plain English explanation and concise intro', () => {
    const html = renderToString(
      <CandidateSuggestionsList
        currentLocation="10AK"
        communityReports={mockReports}
        onSelectLocation={vi.fn()}
        onOpenVoiceConfusionReference={vi.fn()}
      />
    );

    // 1. Verifies concise introductory paragraph
    expect(html).toContain('Possible alternatives based on community reports and character-hearing patterns.');

    // 2. Verifies title
    expect(html).toContain('Voice Confusion Reference Suggestions');

    // 3. Verifies original searched code is presented clearly
    expect(html).toContain('Searched Code:');
    expect(html).toContain('10AK');

    // 4. Verifies summary count
    expect(html).toContain('suggestion');

    // 5. Verifies candidate code is the prominent visual element
    expect(html).toContain('10KA');
    expect(html).toContain('vc-candidate-code');

    // 6. Verifies evidence badge tier
    expect(html).toContain('Community reported');

    // 7. Verifies secondary information (phonetic reading & check character)
    expect(html).toContain('Check Character:');
    expect(html).toContain('BRAVO');
    expect(html).toContain('Phonetic:');
    expect(html).toContain('ONE ZERO KILO ALPHA');

    // 8. Verifies plain English explanation
    expect(html).toContain('Colleagues verified finding stock at this shelf when 10AK was voiced (5 confirmations).');

    // 9. Verifies "Why this suggestion?" disclosure
    expect(html).toContain('Why this suggestion?');
    expect(html).toContain('vc-candidate-why-details');

    // 10. Verifies secondary action button "View in Reference Database"
    expect(html).toContain('View in Reference Database');
  });

  it('renders heuristic candidate with "Possible match" and transposition explanation', () => {
    const html = renderToString(
      <CandidateSuggestionsList
        currentLocation="20MN"
        communityReports={[]}
        onSelectLocation={vi.fn()}
        onOpenVoiceConfusionReference={vi.fn()}
      />
    );

    expect(html).toContain('20NM');
    expect(html).toContain('Possible match');
    expect(html).toContain('The last two characters may have been heard in the wrong order.');
  });
});
