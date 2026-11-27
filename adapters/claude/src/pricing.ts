import { readFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * ESTIMATE ONLY. Prices are US dollars per million tokens and are CONFIG you must keep current.
 * The values below are placeholders, not a statement of what Anthropic charges: check the current
 * price list and override them with a JSON file (`CLAUDE_PRICING_FILE`, see docs/runbooks/claude-adapter.md).
 * Subscription plans are not metered per token, so for them this is a relative size, not a bill.
 */
export interface Price {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export type PriceTable = Record<string, Price>;

export const DEFAULT_PRICES: PriceTable = {
  'claude-fable-5-2': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'claude-opus-5-5': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'claude-sonnet-5-5': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-haiku-5-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

/** Used for any model not in the table. Deliberately mid-range; it is a guess, not a price. */
export const FALLBACK_PRICE: Price = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };

const PriceSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
});
const FileSchema = z.object({ models: z.record(z.string(), PriceSchema).default({}), fallback: PriceSchema.optional() });

export interface Pricing {
  priceFor(model: string): Price;
  cost(model: string, t: { input: number; output: number; cacheWrite: number; cacheRead: number }): number;
}

export function createPricing(table: PriceTable = DEFAULT_PRICES, fallback: Price = FALLBACK_PRICE): Pricing {
  const priceFor = (model: string): Price => {
    if (table[model]) return table[model]!;
    // Dated or suffixed ids, for example "claude-opus-5-5-20261001": longest known prefix wins.
    const prefix = Object.keys(table).filter((k) => model.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    return prefix ? table[prefix]! : fallback;
  };
  return {
    priceFor,
    cost(model, t) {
      const p = priceFor(model);
      return (t.input * p.input + t.output * p.output + t.cacheWrite * p.cacheWrite + t.cacheRead * p.cacheRead) / 1_000_000;
    },
  };
}

/** Loads overrides from the optional JSON file: `{ "models": { "<id>": {input,output,cacheWrite,cacheRead} }, "fallback": {...} }`. */
export function loadPricing(file?: string): Pricing {
  if (!file) return createPricing();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`invalid configuration: CLAUDE_PRICING_FILE is unreadable (${(err as Error).message.split('\n')[0]})`, { cause: err });
  }
  const parsed = FileSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`invalid configuration: CLAUDE_PRICING_FILE: ${parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
  return createPricing({ ...DEFAULT_PRICES, ...parsed.data.models }, parsed.data.fallback ?? FALLBACK_PRICE);
}
