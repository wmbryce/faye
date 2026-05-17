/**
 * Rank-normalize an array of numbers to [-1, 1].
 * The lowest value maps to -1, the highest to +1, evenly spaced between.
 * Empty input → []. Singleton → [0]. Tied values share their mid-rank so
 * input order does not bias the result.
 */
export function rankNormalize(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const out = new Array<number>(n);
  for (let k = 0; k < n; ) {
    let j = k + 1;
    while (j < n && indexed[j].v === indexed[k].v) j++;
    const midRank = (k + j - 1) / 2;
    const norm = (2 * midRank) / (n - 1) - 1;
    for (let t = k; t < j; t++) out[indexed[t].i] = norm;
    k = j;
  }
  return out;
}
