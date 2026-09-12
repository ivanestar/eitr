// A mixed-strength covering array over the factor model: every feasible combination of three core
// factors, and of any two factors, appears in at least one row. Greedy, in the manner of AETG: each
// new row starts from a combination still missing and fills the other factors with the levels that
// cover the most missing combinations. Deterministic for a given seed.
import { CORE_FACTORS, FACTORS, feasible, type DatasetFactors, type DatasetSpec } from './model.js';

type Assignment = Partial<Record<keyof DatasetFactors, string>>;

// mulberry32: small, seedable, good enough to break ties.
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function subsets<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [head, ...rest] = items;
  return subsets(rest, size - 1)
    .map((s) => [head, ...s])
    .concat(subsets(rest, size));
}

function keyOf(factors: Array<keyof DatasetFactors>, assignment: Assignment): string {
  return factors.map((f) => f + '=' + assignment[f]).join('|');
}

export interface CoveringResult {
  rows: DatasetFactors[];
  // How many combinations were required, and how many rows it took.
  required: number;
  uncoverable: string[];
}

export function coveringArray(seed = 20260911, candidates = 40): CoveringResult {
  const ids = FACTORS.map((f) => f.id);
  const levelsOf = new Map(FACTORS.map((f) => [f.id, f.levels as readonly string[]]));
  // The factor sets whose combinations must all appear: three-way among the core, two-way among all.
  const sets: Array<Array<keyof DatasetFactors>> = [];
  const seen = new Set<string>();
  for (const s of subsets(CORE_FACTORS, 3).concat(subsets(ids, 2))) {
    const sorted = [...s].sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
    const k = sorted.join(',');
    if (!seen.has(k)) {
      seen.add(k);
      sets.push(sorted);
    }
  }
  const setsOf = new Map<keyof DatasetFactors, Array<Array<keyof DatasetFactors>>>();
  for (const id of ids)
    setsOf.set(
      id,
      sets.filter((s) => s.includes(id)),
    );

  // Every feasible combination of every set.
  const uncovered = new Set<string>();
  for (const set of sets) {
    const expand = (i: number, partial: Assignment) => {
      if (i === set.length) {
        if (feasible(partial as Partial<DatasetFactors>)) uncovered.add(keyOf(set, partial));
        return;
      }
      for (const level of levelsOf.get(set[i])!) expand(i + 1, { ...partial, [set[i]]: level });
    };
    expand(0, {});
  }
  const required = uncovered.size;
  const random = prng(seed);
  const rows: DatasetFactors[] = [];
  const uncoverable: string[] = [];

  // New combinations a row would cover if `factor` took `level`, given what it already holds.
  const gain = (row: Assignment, factor: keyof DatasetFactors, level: string): number => {
    const trial = { ...row, [factor]: level };
    let n = 0;
    for (const set of setsOf.get(factor)!) {
      if (set.every((f) => trial[f] !== undefined) && uncovered.has(keyOf(set, trial))) n++;
    }
    return n;
  };

  while (uncovered.size > 0) {
    // Start from one missing combination - the first in a stable order, so the array is reproducible.
    const start = uncovered.values().next().value as string;
    const base: Assignment = {};
    for (const part of start.split('|')) {
      const [f, v] = part.split('=');
      base[f as keyof DatasetFactors] = v;
    }
    let best: Assignment | null = null;
    let bestGain = -1;
    for (let c = 0; c < candidates; c++) {
      const row: Assignment = { ...base };
      const order = ids.filter((f) => row[f] === undefined).sort(() => random() - 0.5);
      let ok = true;
      for (const factor of order) {
        let chosen: string | null = null;
        let chosenGain = -1;
        for (const level of levelsOf.get(factor)!) {
          const trial = { ...row, [factor]: level };
          if (!feasible(trial as Partial<DatasetFactors>)) continue;
          const g = gain(row, factor, level) + random() * 0.01;
          if (g > chosenGain) {
            chosenGain = g;
            chosen = level;
          }
        }
        if (chosen === null) {
          ok = false;
          break;
        }
        row[factor] = chosen;
      }
      if (!ok) continue;
      let total = 0;
      for (const set of sets) if (uncovered.has(keyOf(set, row))) total++;
      if (total > bestGain) {
        bestGain = total;
        best = row;
      }
    }
    if (!best || bestGain <= 0) {
      // Nothing completes this combination into a whole feasible row.
      uncoverable.push(start);
      uncovered.delete(start);
      continue;
    }
    for (const set of sets) uncovered.delete(keyOf(set, best));
    rows.push(best as DatasetFactors);
  }
  return { rows, required, uncoverable };
}

// Every combination the array was asked for, checked against the rows it produced.
export function coverageOf(rows: DatasetFactors[]): {
  strength3: number;
  strength2: number;
  missing: string[];
} {
  const ids = FACTORS.map((f) => f.id);
  const levelsOf = new Map(FACTORS.map((f) => [f.id, f.levels as readonly string[]]));
  const check = (sets: Array<Array<keyof DatasetFactors>>) => {
    let total = 0;
    let hit = 0;
    const missing: string[] = [];
    const present = new Set<string>();
    for (const set of sets) for (const row of rows) present.add(keyOf(set, row as Assignment));
    for (const set of sets) {
      const expand = (i: number, partial: Assignment) => {
        if (i === set.length) {
          if (!feasible(partial as Partial<DatasetFactors>)) return;
          total++;
          const k = keyOf(set, partial);
          if (present.has(k)) hit++;
          else missing.push(k);
          return;
        }
        for (const level of levelsOf.get(set[i])!) expand(i + 1, { ...partial, [set[i]]: level });
      };
      expand(0, {});
    }
    return { ratio: total === 0 ? 1 : hit / total, missing };
  };
  const three = check(subsets(CORE_FACTORS, 3));
  const two = check(subsets(ids, 2));
  return {
    strength3: three.ratio,
    strength2: two.ratio,
    missing: three.missing.concat(two.missing),
  };
}

// Reproductions of what went wrong on live runs, so the suite always carries the cases it exists for.
export const SEED_FACTORS: Array<{ id: string; why: string; factors: DatasetFactors }> = [
  {
    id: 'seed-guid-count-limit',
    why: 'a count field of 1-1000 in the markup got no boundary; the main flow was "input is accepted"',
    factors: base('generator', {
      limits: 'markup-range',
      output: 'copy-button',
      defect: 'none',
      rule: 'semantic',
      labels: 'clear',
    }),
  },
  {
    id: 'seed-converter-precision',
    why: '-40 C to Kelvin showed 233.14999999999998; negative temperatures were called invalid',
    factors: base('converter', {
      limits: 'none',
      output: 'readonly-field',
      defect: 'precision',
      rule: 'semantic',
      labels: 'hint-only',
    }),
  },
  {
    id: 'seed-formatter-stale-verdict',
    why: 'a JSON formatter kept "Valid JSON" beside a later parse error',
    factors: base('formatter', {
      limits: 'none',
      output: 'text-region',
      defect: 'stale-state',
      rule: 'semantic',
      labels: 'placeholder-only',
    }),
  },
  {
    id: 'seed-template-export-large',
    why: 'a 29-field template: fields filled from a template, 48 export controls excused as result boxes',
    factors: base('template-export', {
      limits: 'none',
      output: 'download',
      defect: 'wrong-result',
      rule: 'none',
      labels: 'hint-only',
      size: 'large',
      repeated: 'repeated-controls',
    }),
  },
  {
    id: 'seed-frame-language',
    why: "the header's language switcher became a parameter on 13 routes",
    factors: base('search-list', {
      limits: 'markup-length',
      output: 'text-region',
      defect: 'wrong-result',
      rule: 'semantic',
      labels: 'clear',
      frame: 'language-switch',
      pages: 'two',
    }),
  },
  {
    id: 'seed-login-contact',
    why: 'phone and email samples copied from the page; an empty value called invalid on optional fields',
    factors: base('login', {
      limits: 'markup-length',
      output: 'text-region',
      defect: 'missing-validation',
      rule: 'semantic',
      labels: 'clear',
      pii: 'contact-fields',
    }),
  },
  {
    id: 'seed-unstated-limit',
    why: 'a limit nothing states was invented into a boundary, and every condition built on it refused valid values',
    factors: base('calculator', {
      limits: 'none',
      output: 'readonly-field',
      defect: 'none',
      rule: 'semantic',
      labels: 'clear',
      ambiguity: 'unstated-limit',
    }),
  },
  {
    id: 'seed-production-no-probe',
    why: 'on production nothing may be typed into the page, so enforcement stays unknown and must say so',
    factors: base('wizard', {
      limits: 'markup-length',
      output: 'text-region',
      defect: 'missing-validation',
      rule: 'cross-field',
      labels: 'clear',
      appKind: 'production',
      size: 'large',
    }),
  },
  {
    id: 'seed-research-mixed',
    why: 'research checks for other pages of the kind were neither used nor declined',
    factors: base('file-upload', {
      limits: 'label-only',
      output: 'text-region',
      defect: 'off-by-one',
      rule: 'semantic',
      labels: 'clear',
      research: 'cached-mixed',
    }),
  },
  {
    id: 'seed-contradicting-note',
    why: "a person's words contradict the markup, and the conditions have to follow the person",
    factors: base('settings', {
      limits: 'markup-range',
      output: 'text-region',
      defect: 'off-by-one',
      rule: 'semantic',
      labels: 'clear',
      note: 'contradicting',
    }),
  },
];

function base(
  archetype: DatasetFactors['archetype'],
  core: Partial<DatasetFactors>,
): DatasetFactors {
  return {
    archetype,
    limits: 'none',
    output: 'text-region',
    defect: 'none',
    rule: 'none',
    labels: 'clear',
    language: 'en',
    size: 'small',
    repeated: 'none',
    frame: 'none',
    server: 'client-only',
    research: 'none',
    note: 'none',
    appKind: 'sandbox',
    pages: 'one',
    pii: 'none',
    reveal: 'none',
    ambiguity: 'none',
    ...core,
  };
}

export function datasetSpecs(seed = 20260911): {
  specs: DatasetSpec[];
  required: number;
  uncoverable: string[];
} {
  const { rows, required, uncoverable } = coveringArray(seed);
  const specs: DatasetSpec[] = [];
  rows.forEach((factors, i) => {
    specs.push({
      id: 'tc-' + String(i + 1).padStart(3, '0'),
      seed: seed + i,
      factors,
      origin: 'covering',
      // Every fifth dataset is held out: never read while the skill is tuned.
      split: i % 5 === 4 ? 'held-out' : 'dev',
    });
  });
  SEED_FACTORS.forEach((s, i) => {
    if (!feasible(s.factors)) throw new Error('seed dataset ' + s.id + ' is not a feasible page');
    specs.push({
      id: s.id,
      seed: seed + 10000 + i,
      factors: s.factors,
      origin: 'seed',
      split: 'dev',
    });
  });
  return { specs, required, uncoverable };
}
