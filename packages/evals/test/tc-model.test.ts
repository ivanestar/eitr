import { describe, it, expect } from 'vitest';
import { coveringArray, coverageOf, datasetSpecs, SEED_FACTORS } from '../src/tc/covering.js';
import { FACTORS, feasible } from '../src/tc/model.js';

describe('test conditions eval datasets - the input space', () => {
  const { rows, required, uncoverable } = coveringArray();

  it('covers every feasible three-way combination of the core factors and two-way of all', () => {
    const coverage = coverageOf(rows);
    expect(uncoverable).toEqual([]);
    expect(coverage.missing).toEqual([]);
    expect(coverage.strength3).toBe(1);
    expect(coverage.strength2).toBe(1);
    expect(required).toBeGreaterThan(1000);
  });

  it('builds only pages someone could build', () => {
    for (const row of rows) expect(feasible(row)).toBe(true);
    for (const seed of SEED_FACTORS) expect(feasible(seed.factors)).toBe(true);
  });

  it('draws the same datasets from the same seed, and holds a fifth of them out', () => {
    const again = coveringArray();
    expect(again.rows).toEqual(rows);
    const { specs } = datasetSpecs();
    const heldOut = specs.filter((s) => s.split === 'held-out').length;
    expect(heldOut / specs.length).toBeGreaterThan(0.15);
    expect(new Set(specs.map((s) => s.id)).size).toBe(specs.length);
  });

  it('uses every level of every factor', () => {
    for (const factor of FACTORS) {
      for (const level of factor.levels) {
        expect(rows.some((row) => row[factor.id] === level)).toBe(true);
      }
    }
  });

  it('stays within a size the suite can run', () => {
    // Printed so a change to the model shows what it costs.
    console.log('covering array rows:', rows.length, 'required combinations:', required);
    expect(rows.length).toBeGreaterThan(150);
    expect(rows.length).toBeLessThan(600);
  });
});
