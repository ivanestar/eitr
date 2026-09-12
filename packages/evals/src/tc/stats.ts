// Numbers with error bars. Two things make a naive percentage misleading here: a run is a sample of
// a much larger space of datasets, and the items of one dataset are not independent of each other -
// a page the analysis misread fails several of them at once. So a rate over items is reported with a
// confidence interval clustered by dataset, and a rate over datasets with a Wilson interval.
export interface Interval {
  value: number;
  low: number;
  high: number;
  n: number;
}

export function wilson(passed: number, total: number, z = 1.96): Interval {
  if (total === 0) return { value: 0, low: 0, high: 0, n: 0 };
  const p = passed / total;
  const denominator = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return {
    value: p,
    low: Math.max(0, (centre - spread) / denominator),
    high: Math.min(1, (centre + spread) / denominator),
    n: total,
  };
}

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Resampling whole datasets, not single items: items within a dataset rise and fall together.
export function clusteredRate(
  clusters: Array<{ passed: number; total: number }>,
  samples = 2000,
  seed = 7,
): Interval {
  const totals = clusters.reduce((sum, c) => sum + c.total, 0);
  const passed = clusters.reduce((sum, c) => sum + c.passed, 0);
  if (clusters.length === 0 || totals === 0) return { value: 0, low: 0, high: 0, n: 0 };
  const random = prng(seed);
  const rates: number[] = [];
  for (let i = 0; i < samples; i++) {
    let p = 0;
    let t = 0;
    for (let k = 0; k < clusters.length; k++) {
      const pick = clusters[Math.floor(random() * clusters.length)];
      p += pick.passed;
      t += pick.total;
    }
    if (t > 0) rates.push(p / t);
  }
  rates.sort((a, b) => a - b);
  return {
    value: passed / totals,
    low: rates[Math.floor(rates.length * 0.025)] ?? 0,
    high: rates[Math.floor(rates.length * 0.975)] ?? 1,
    n: totals,
  };
}

// The share of tasks an agent gets right every time out of k tries, as tau-bench defines it: the
// probability that k independently drawn trials of the same task all pass.
export function passHatK(
  trialsPerTask: Array<{ passed: number; total: number }>,
  k: number,
): number {
  if (trialsPerTask.length === 0) return 0;
  let sum = 0;
  for (const task of trialsPerTask) {
    const { passed: c, total: n } = task;
    if (n < k) {
      sum += c === n ? 1 : 0;
      continue;
    }
    sum += choose(c, k) / choose(n, k);
  }
  return sum / trialsPerTask.length;
}

function choose(n: number, k: number): number {
  if (k > n || k < 0) return 0;
  let out = 1;
  for (let i = 0; i < k; i++) out = (out * (n - i)) / (i + 1);
  return out;
}

export function percent(interval: Interval): string {
  return (
    (interval.value * 100).toFixed(1) +
    '% (' +
    (interval.low * 100).toFixed(1) +
    '-' +
    (interval.high * 100).toFixed(1) +
    '%, n=' +
    interval.n +
    ')'
  );
}
