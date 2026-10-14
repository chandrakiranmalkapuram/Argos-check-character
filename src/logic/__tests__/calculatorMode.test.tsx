import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { CalculatorInput, MODE_CONFIG } from '../../components/CalculatorInput.tsx';
import type { CheckMode } from '../types.ts';
import { performReverseLookup } from '../reverseLookup.ts';
import { validateAndClassifyInput } from '../validator.ts';
import { evaluateQuery } from '../index.ts';

describe('Calculator Input Modes and Dynamic Placeholders', () => {
  const modes: CheckMode[] = ['auto', 'store', 'rfc', 'reverse'];

  it('defines distinct placeholders for all 4 modes', () => {
    expect(MODE_CONFIG.auto.placeholder).toBe('E.G. 10AK');
    expect(MODE_CONFIG.store.placeholder).toBe('E.G. 07AZ');
    expect(MODE_CONFIG.rfc.placeholder).toBe('E.G. ABCD');
    expect(MODE_CONFIG.reverse.placeholder).toBe('E.G. NOVEMBER');

    const placeholders = [
      MODE_CONFIG.auto.placeholder,
      MODE_CONFIG.store.placeholder,
      MODE_CONFIG.rfc.placeholder,
      MODE_CONFIG.reverse.placeholder
    ];
    expect(new Set(placeholders).size).toBe(4);
  });

  it('defines the required helper text for all 4 modes', () => {
    expect(MODE_CONFIG.auto.helperText).toBe(
      'Enter a shelf location code to automatically detect the calculation type.'
    );
    expect(MODE_CONFIG.store.helperText).toBe(
      'Enter a shelf location code for Store check character calculation.'
    );
    expect(MODE_CONFIG.rfc.helperText).toBe(
      'Enter a shelf location code for RFC check character calculation.'
    );
    expect(MODE_CONFIG.reverse.helperText).toBe(
      'Enter a NATO phonetic word to find its corresponding character or supported code.'
    );
  });

  modes.forEach(mode => {
    it(`renders correct placeholder and helper text dynamically for ${mode} mode in component`, () => {
      const html = renderToString(
        <CalculatorInput
          query="10AK"
          onQueryChange={() => {}}
          activeMode={mode}
          onModeChange={() => {}}
        />
      );

      const config = MODE_CONFIG[mode];
      expect(html).toContain(`placeholder="${config.placeholder}"`);
      expect(html).toContain(config.helperText);
    });

    it(`returns corresponding helper text in validator and evaluateQuery for empty query in ${mode} mode`, () => {
      const validated = validateAndClassifyInput('', mode);
      expect(validated.guidanceMessage).toBe(MODE_CONFIG[mode].helperText);

      const evaluated = evaluateQuery('', mode);
      expect(evaluated.guidance).toBe(MODE_CONFIG[mode].helperText);
    });
  });

  it('immediately updates the rendered placeholder when changing activeMode prop (simulating tab switch)', () => {
    // 1. Auto Detect
    let html = renderToString(
      <CalculatorInput query="" onQueryChange={() => {}} activeMode="auto" onModeChange={() => {}} />
    );
    expect(html).toContain('placeholder="E.G. 10AK"');

    // 2. Switch to Store
    html = renderToString(
      <CalculatorInput query="" onQueryChange={() => {}} activeMode="store" onModeChange={() => {}} />
    );
    expect(html).toContain('placeholder="E.G. 07AZ"');

    // 3. Switch to RFC
    html = renderToString(
      <CalculatorInput query="" onQueryChange={() => {}} activeMode="rfc" onModeChange={() => {}} />
    );
    expect(html).toContain('placeholder="E.G. ABCD"');

    // 4. Switch to Reverse
    html = renderToString(
      <CalculatorInput query="" onQueryChange={() => {}} activeMode="reverse" onModeChange={() => {}} />
    );
    expect(html).toContain('placeholder="E.G. NOVEMBER"');

    // 5. Switch back to Auto Detect
    html = renderToString(
      <CalculatorInput query="" onQueryChange={() => {}} activeMode="auto" onModeChange={() => {}} />
    );
    expect(html).toContain('placeholder="E.G. 10AK"');
  });

  describe('Verification that each placeholder example is valid for its mode', () => {
    it('Auto Detect example "10AK" calculates correctly', () => {
      const evalRes = evaluateQuery('10AK', 'auto');
      expect(evalRes.hasResults).toBe(true);
      expect(evalRes.storeResult?.isValid).toBe(true);
      expect(evalRes.storeResult?.checkChar).toBe('NOVEMBER');
    });

    it('Store example "07AZ" calculates correctly in Store mode', () => {
      const evalRes = evaluateQuery('07AZ', 'store');
      expect(evalRes.hasResults).toBe(true);
      expect(evalRes.storeResult?.isValid).toBe(true);
      expect(evalRes.storeResult?.checkChar).toBe('YANKEE');
    });

    it('RFC example "ABCD" calculates correctly in RFC mode', () => {
      const evalRes = evaluateQuery('ABCD', 'rfc');
      expect(evalRes.hasResults).toBe(true);
      expect(evalRes.rfcResult?.isValid).toBe(true);
      expect(evalRes.rfcResult?.checkChar).toBe('SEVEN FIVE');
    });

    it('Reverse example "NOVEMBER" returns reverse lookup locations', () => {
      const evalRes = evaluateQuery('NOVEMBER', 'reverse');
      expect(evalRes.hasResults).toBe(true);
      expect(evalRes.reverseResult).not.toBeNull();
      expect(evalRes.reverseResult?.checkChar).toBe('NOVEMBER');
      expect(evalRes.reverseResult?.totalMatches).toBe(2600);
      expect(evalRes.reverseResult?.aisles.length).toBe(100);

      const directResult = performReverseLookup('NOVEMBER');
      expect(directResult).not.toBeNull();
      expect(directResult?.checkChar).toBe('NOVEMBER');
    });
  });
});
