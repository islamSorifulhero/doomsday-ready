/**
 * Fewest bundles whose sizes add up to exactly `groupSize`
 * (unbounded coin change with reconstruction).
 *
 * best[n]   = fewest bundles needed to fill exactly n seats (Infinity if impossible)
 * choice[n] = the last bundle size used in that best solution
 *
 * Time O(groupSize * sizes) = at most 10,000 * 10 steps, memory O(groupSize).
 *
 * Returns [{ size, count }] sorted from the largest size to the smallest,
 * or null when no exact combination exists.
 */
function minBundles(sizes, groupSize) {
  const best = new Array(groupSize + 1).fill(Infinity);
  const choice = new Array(groupSize + 1).fill(0);
  best[0] = 0;

  for (let seats = 1; seats <= groupSize; seats++) {
    for (const size of sizes) {
      if (size <= seats && best[seats - size] + 1 < best[seats]) {
        best[seats] = best[seats - size] + 1;
        choice[seats] = size;
      }
    }
  }

  if (best[groupSize] === Infinity) return null;

  const counts = new Map();
  for (let left = groupSize; left > 0; left -= choice[left]) {
    counts.set(choice[left], (counts.get(choice[left]) || 0) + 1);
  }

  return [...counts]
    .map(([size, count]) => ({ size, count }))
    .sort((a, b) => b.size - a.size);
}

module.exports = { minBundles };
