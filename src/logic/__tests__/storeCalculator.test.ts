import { describe, it, expect } from 'vitest';
import { calculateStoreCheckChar } from '../storeCalculator.ts';

describe('Store Check Character Calculation', () => {
  it('correctly calculates verified standard store locations', () => {
    const verifiedCases: Record<string, { spokenText: string; checkChar: string }> = {
      '00AA': { spokenText: 'ZERO ZERO ALPHA ALPHA', checkChar: 'ECHO' },
      '01AK': { spokenText: 'ZERO ONE ALPHA KILO', checkChar: 'PAPA' },
      '10AK': { spokenText: 'ONE ZERO ALPHA KILO', checkChar: 'NOVEMBER' },
      '99ZZ': { spokenText: 'NINE NINE ZULU ZULU', checkChar: 'YANKEE' },
      'S1PG': { spokenText: 'SECURITY ONE PAPA GOLF', checkChar: 'X-RAY' },
      'Z99Z': { spokenText: 'NINE NINE BULK ZULU', checkChar: 'KILO' }
    };

    for (const [location, expected] of Object.entries(verifiedCases)) {
      const result = calculateStoreCheckChar(location);
      expect(result.checkChar, `checkChar for ${location}`).toBe(expected.checkChar);
      expect(result.spokenText, `spokenText for ${location}`).toBe(expected.spokenText);
      expect(result.isValid).toBe(true);
    }
  });

  it('produces different check characters for swapped digits (10AK vs 01AK)', () => {
    const result10 = calculateStoreCheckChar('10AK');
    const result01 = calculateStoreCheckChar('01AK');
    expect(result10.checkChar).toBe('NOVEMBER');
    expect(result01.checkChar).toBe('PAPA');
    expect(result10.checkChar).not.toBe(result01.checkChar);
  });

  it('correctly handles relative locations with + and - markers', () => {
    const after = calculateStoreCheckChar('10A+');
    expect(after.checkChar).toBe('VICTOR');
    expect(after.spokenText).toBe('AFTER ONE ZERO ALPHA');

    const before = calculateStoreCheckChar('10A-');
    expect(before.checkChar).toBe('BRAVO');
    expect(before.spokenText).toBe('BEFORE ONE ZERO ALPHA');
  });

  it('correctly formats and calculates special stockroom zones', () => {
    const specialCases: Record<string, { spokenText: string; checkChar: string }> = {
      'J1PG': { spokenText: 'JEWELLERY ONE PAPA GOLF', checkChar: 'ECHO' },
      'S1PG': { spokenText: 'SECURITY ONE PAPA GOLF', checkChar: 'X-RAY' },
      'L10A': { spokenText: 'ONE ZERO LINBIN ALPHA', checkChar: 'GOLF' },
      'Z10A': { spokenText: 'ONE ZERO BULK ALPHA', checkChar: 'YANKEE' },
      'CA12': { spokenText: 'CASH OFFICE ONE TWO', checkChar: 'JULIET' },
      'CP12': { spokenText: 'COLLECTION POINT ONE TWO', checkChar: 'KILO' },
      'RETS': { spokenText: 'RETURNS', checkChar: 'OSCAR' }
    };

    for (const [location, expected] of Object.entries(specialCases)) {
      const result = calculateStoreCheckChar(location);
      expect(result.checkChar, `checkChar for ${location}`).toBe(expected.checkChar);
      expect(result.spokenText, `spokenText for ${location}`).toBe(expected.spokenText);
    }
  });

  it('handles fixed system codes like DPA and SOB', () => {
    const dpa = calculateStoreCheckChar('DPA');
    expect(dpa.checkChar).toBe('VICTOR');
    expect(dpa.spokenText).toBe('DPA');

    const sob = calculateStoreCheckChar('SOB');
    expect(sob.checkChar).toBe('SIERRA');
    expect(sob.spokenText).toBe('SOB');
  });

  it('safely handles short and invalid inputs without throwing', () => {
    for (const input of ['', '1', '10', '10A']) {
      const result = calculateStoreCheckChar(input);
      if (input.length < 4) {
        expect(result.isValid).toBe(false);
        expect(result.checkChar).toBe('NULL');
      }
    }
  });
});
