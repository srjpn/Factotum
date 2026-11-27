import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPricing, DEFAULT_PRICES, FALLBACK_PRICE, loadPricing } from './pricing.js';

describe('pricing', () => {
  it('has the four known models and a fallback', () => {
    for (const m of ['claude-fable-5-2', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']) expect(DEFAULT_PRICES[m]).toBeDefined();
    expect(createPricing().priceFor('some-new-model')).toEqual(FALLBACK_PRICE);
  });
  it('computes per million tokens and matches dated ids by prefix', () => {
    const p = createPricing({ m: { input: 1, output: 2, cacheWrite: 3, cacheRead: 4 } });
    expect(p.cost('m', { input: 1_000_000, output: 1_000_000, cacheWrite: 1_000_000, cacheRead: 1_000_000 })).toBe(10);
    expect(p.cost('m-20261001', { input: 1_000_000, output: 0, cacheWrite: 0, cacheRead: 0 })).toBe(1);
  });
  it('loads overrides from a file and rejects a bad one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-price-'));
    const f = join(dir, 'p.json');
    writeFileSync(f, JSON.stringify({ models: { 'claude-opus-5-5': { input: 1, output: 1, cacheWrite: 1, cacheRead: 1 } }, fallback: { input: 9, output: 9, cacheWrite: 9, cacheRead: 9 } }));
    const p = loadPricing(f);
    expect(p.priceFor('claude-opus-5-5').input).toBe(1);
    expect(p.priceFor('claude-haiku-5-5')).toEqual(DEFAULT_PRICES['claude-haiku-5-5']);
    expect(p.priceFor('zzz').input).toBe(9);
    writeFileSync(f, '{"models":{"x":{"input":-1}}}');
    expect(() => loadPricing(f)).toThrow(/CLAUDE_PRICING_FILE/);
    expect(() => loadPricing(join(dir, 'missing.json'))).toThrow(/CLAUDE_PRICING_FILE/);
  });
});
