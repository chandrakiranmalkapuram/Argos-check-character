// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../App.tsx';
import { ResultCard } from '../ResultCard.tsx';
import { calculateStoreCheckChar } from '../../logic/storeCalculator.ts';
import * as evidenceAdapter from '../../voiceConfusion/evidenceAdapter.ts';
import { VoiceConfusionPanel } from '../VoiceConfusionPanel.tsx';

vi.mock('../../voiceConfusion/service.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../../voiceConfusion/service.ts')>();
  return {
    ...actual,
    getCurrentUser: vi.fn().mockResolvedValue(null),
    onAuthStateChange: vi.fn(() => () => {})
  };
});

const availableEvidence: evidenceAdapter.EvidenceResult = {
  kind: 'available',
  reports: [],
  isTruncated: false,
  isHighTrustTruncated: false,
  isUnverifiedTruncated: false
};

describe('mobile calculator layout and disclosures', () => {
  beforeEach(() => {
    vi.spyOn(evidenceAdapter, 'fetchEvidenceForLocation').mockResolvedValue(availableEvidence);
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the input, compact result, and voice summary together in the sticky stack', async () => {
    render(<App />);

    const stack = document.querySelector('.calculator-sticky-stack');
    expect(stack).toBeTruthy();
    const stackQueries = within(stack as HTMLElement);
    const input = stackQueries.getByTestId('location-query-input');
    expect(input.getAttribute('enterkeyhint')).toBe('done');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('autocapitalize')).toBe('characters');

    expect(stackQueries.getByTestId('check-character-display').textContent).toBe('NOVEMBER');
    expect(stackQueries.getByText(/ONE ZERO ALPHA KILO/)).toBeTruthy();
    expect(await stackQueries.findByRole('button', { name: /Voice confusion: 1 close sound-alike · 14 possible · Tap to review/i })).toBeTruthy();
  });

  it('renders the result breakdown as a collapsed native details disclosure', async () => {
    const result = calculateStoreCheckChar('10AK');
    render(<ResultCard result={result} />);

    const details = screen.getByText('Show calculation').closest('details');
    expect(details).toBeTruthy();
    expect(details?.open).toBe(false);
    expect(screen.getByText('NOVEMBER')).toBeTruthy();
    expect(screen.getByText(/ONE ZERO ALPHA KILO/)).toBeTruthy();

      const summary = details?.querySelector('summary');
      expect(summary).toBeTruthy();
      expect(summary?.textContent).toContain('Show calculation');
      expect(summary?.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(summary!);
    expect(details?.open).toBe(true);
    await waitFor(() => expect(summary?.getAttribute('aria-expanded')).toBe('true'));
  });

  it('shows close and possible counts from the engine in the mobile summary', async () => {
    render(<VoiceConfusionPanel currentLocation="10AK" debounceMs={0} />);

    const summary = await screen.findByRole('button', {
      name: 'Voice confusion: 1 close sound-alike · 14 possible · Tap to review'
    });
    expect(summary.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(summary);
    expect(summary.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.vc-panel--mobile-expanded')).toBeTruthy();
  });

  it('uses the existing no-close wording when there are no close sound-alikes', async () => {
    render(<VoiceConfusionPanel currentLocation="CA01" debounceMs={0} />);

    const summary = await screen.findByRole('button', {
      name: 'Voice confusion: No close sound-alikes · 0 possible · Tap to review'
    });
    expect(summary).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector('.vc-mobile-state')?.getAttribute('aria-label')).toBe(
        'Special facility codes (Cash Office / Collection Point) use 3 spoken words and have no close 4-word standard sound-alikes under the model threshold.'
      );
    });
  });

  it('makes unavailable community evidence visible in the mobile live status', async () => {
    vi.mocked(evidenceAdapter.fetchEvidenceForLocation).mockResolvedValue({
      kind: 'unavailable',
      reason: 'database_not_configured',
      userMessage: 'community evidence unavailable'
    });
    render(<VoiceConfusionPanel currentLocation="10AK" debounceMs={0} />);

    await waitFor(() => {
      expect(document.querySelector('.vc-mobile-state')?.getAttribute('aria-label')).toBe(
        'community evidence unavailable'
      );
    });
  });

  it('shows the existing unsupported-input reason beside the summary', async () => {
    render(<VoiceConfusionPanel currentLocation="???" debounceMs={0} />);

    const summary = await screen.findByRole('button', {
      name: 'Voice confusion: Unsupported input · Tap to review'
    });
    expect(summary.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.vc-mobile-state')?.getAttribute('aria-label')).toBe(
      'Location format is not recognized as a supported Store stockroom location code.'
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Location format is not recognized as a supported Store stockroom location code.'
    );
  });
});
