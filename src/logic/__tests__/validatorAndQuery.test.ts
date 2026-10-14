import { describe, it, expect } from 'vitest';
import { evaluateQuery } from '../index.ts';
import { validateAndClassifyInput } from '../validator.ts';

describe('Validator and Query Orchestration', () => {
  it('correctly validates and auto-detects standard store format', () => {
    const res = evaluateQuery('10AK', 'auto');
    expect(res.mode).toBe('auto');
    expect(res.hasResults).toBe(true);
    expect(res.storeResult?.checkChar).toBe('NOVEMBER');
    expect(res.rfcResult).toBeUndefined();
  });

  it('correctly provides dual Store and RFC results for 4-letter codes', () => {
    const res = evaluateQuery('ABCD', 'auto');
    expect(res.storeResult?.checkChar).toBe('ECHO');
    expect(res.rfcResult?.checkChar).toBe('SEVEN FIVE');
    expect(res.hasResults).toBe(true);
  });

  it('routes phonetic word queries to reverse lookup', () => {
    const res = evaluateQuery('ECHO', 'auto');
    expect(res.mode).toBe('reverse');
    expect(res.reverseResult).toBeDefined();
    expect(res.reverseResult?.checkChar).toBe('ECHO');
    expect(res.reverseResult?.totalMatches).toBeGreaterThan(0);
  });

  it('handles empty query gracefully', () => {
    const res = evaluateQuery('', 'auto');
    expect(res.hasResults).toBe(false);
    expect(res.guidance).toBeDefined();
  });

  it('classifies input correctly in validator', () => {
    const validStore = validateAndClassifyInput('10AK', 'auto');
    expect(validStore.isValid).toBe(true);
    expect(validStore.detectedMode).toBe('store');

    const validRfc = validateAndClassifyInput('ABCD', 'rfc');
    expect(validRfc.isValid).toBe(true);
    expect(validRfc.detectedMode).toBe('rfc');

    const invalidRfc = validateAndClassifyInput('10AK', 'rfc');
    expect(invalidRfc.isValid).toBe(false);
  });
});
