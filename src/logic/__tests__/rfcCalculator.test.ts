import { describe, it, expect } from 'vitest';
import { calculateRfcCheckChar, isRfcCandidate } from '../rfcCalculator.ts';

describe('RFC Check Character Calculation', () => {
  it('correctly calculates verified RFC test cases', () => {
    const verifiedCases: Record<string, { spokenText: string; checkChar: string }> = {
      'AAAA': { spokenText: 'ALPHA ALPHA ALPHA ALPHA', checkChar: 'FOUR FIVE' },
      'ABCD': { spokenText: 'ALPHA BRAVO CHARLIE DELTA', checkChar: 'SEVEN FIVE' },
      'RETS': { spokenText: 'ROMEO ECHO TANGO SIERRA', checkChar: 'FOUR EIGHT' },
      'ZZZZ': { spokenText: 'ZULU ZULU ZULU ZULU', checkChar: 'ZERO ONE' }
    };

    for (const [location, expected] of Object.entries(verifiedCases)) {
      const result = calculateRfcCheckChar(location);
      expect(result.checkChar, `checkChar for ${location}`).toBe(expected.checkChar);
      expect(result.spokenText, `spokenText for ${location}`).toBe(expected.spokenText);
      expect(result.isValid).toBe(true);
    }
  });

  it('identifies RFC candidates correctly', () => {
    expect(isRfcCandidate('ABCD')).toBe(true);
    expect(isRfcCandidate('abcd')).toBe(true);
    expect(isRfcCandidate('10AK')).toBe(false);
    expect(isRfcCandidate('S1PG')).toBe(false);
  });

  it('rejects non-alphabetical inputs for RFC mode gracefully', () => {
    const result = calculateRfcCheckChar('10AK');
    expect(result.isValid).toBe(false);
    expect(result.checkChar).toBe('N/A');
    expect(result.errorMessage).toBeDefined();
  });

  it('handles empty or short inputs gracefully', () => {
    const result = calculateRfcCheckChar('ABC');
    expect(result.isValid).toBe(false);
    expect(result.checkChar).toBe('NULL');
  });
});
