/**
 * Rank-normalize an array of numbers to [-1, 1].
 * The lowest value maps to -1, the highest to +1, evenly spaced between.
 * Empty input → []. Singleton → [0]. Ties resolved by input order.
 */
export function rankNormalize(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const out = new Array<number>(n);
  for (let k = 0; k < n; k++) {
    out[indexed[k].i] = (2 * k) / (n - 1) - 1;
  }
  return out;
}
