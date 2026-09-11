import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderFeatureMapValidator } from '../src/plan/templates/feature-map-validator.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-feature-map-validator-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(
    join(dir, 'scripts', 'validate-feature-map.mjs'),
    renderFeatureMapValidator(),
    'utf8',
  );
  mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'analysis'), { recursive: true });
  writeFileSync(
    join(dir, 'artifacts', 'site-map', 'site-map.json'),
    JSON.stringify({
      schemaVersion: 2,
      generatedAt: '2026-09-08T10:00:00.000Z',
      routes: { '/orders': { routeId: 'route-orders', status: 'active' } },
    }),
    'utf8',
  );
  return dir;
}

function wellFormed() {
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-08T10:00:00.000Z',
    features: {
      f0000000000000aa: {
        featureId: 'f0000000000000aa',
        name: 'Orders',
        memberRouteIds: ['route-orders'],
        entityIds: ['e0000000000000aa', 'e0000000000000bb'],
        impact: 'high',
        impactSourceRouteId: 'route-orders',
        evidence: [{ signal: 'route-convention', excerpt: '/orders -> "Orders"' }],
        reviewed: false,
      },
    },
    routes: {
      'route-orders': {
        routeId: 'route-orders',
        featureId: 'f0000000000000aa',
        criticality: {
          value: 'high',
          confidence: 'high',
          source: 'heading-text',
          reasoning:
            'This page places and confirms customer orders, so a silent failure here loses real money.',
          evidence: [{ signal: 'heading-text', excerpt: 'Place your order' }],
        },
        sourceContentHash: 'hash-orders',
        analyzedAt: '2026-09-08T10:00:00.000Z',
        reviewed: false,
      },
    },
    entities: {
      e0000000000000aa: {
        entityId: 'e0000000000000aa',
        name: 'orders',
        operations: [
          {
            kind: 'create',
            contractId: 'c0000000000000aa',
            routeIds: ['route-orders'],
            confidence: 'observed',
            evidence: [{ signal: 'api-resource', excerpt: 'POST /api/orders' }],
          },
        ],
        relations: [
          {
            kind: 'references',
            targetEntityId: 'e0000000000000bb',
            viaField: 'customerId',
            confidence: 'inferred',
            evidence: [{ signal: 'api-payload-field', excerpt: 'request field "customerId"' }],
          },
        ],
        lifecycle: {
          states: [
            { name: 'absent', initial: true, terminal: false },
            { name: 'exists', initial: false, terminal: true },
          ],
          transitions: [
            {
              from: 'absent',
              to: 'exists',
              trigger: 'create',
              confidence: 'inferred',
              evidence: [{ signal: 'api-resource', excerpt: 'a create operation was recorded' }],
            },
          ],
        },
        evidence: [{ signal: 'route-convention', excerpt: '/orders' }],
        reviewed: false,
      },
      e0000000000000bb: {
        entityId: 'e0000000000000bb',
        name: 'customers',
        operations: [],
        relations: [],
        lifecycle: { states: [], transitions: [] },
        evidence: [{ signal: 'route-convention', excerpt: '/customers' }],
        reviewed: false,
      },
    },
    sourceHash: 'deadbeef',
  };
}

function write(dir: string, data: unknown) {
  writeFileSync(
    join(dir, 'artifacts', 'analysis', 'feature-map.json'),
    JSON.stringify(data, null, 2),
    'utf8',
  );
}

function run(dir: string) {
  return spawnSync('node', ['scripts/validate-feature-map.mjs'], { cwd: dir, encoding: 'utf8' });
}

function failsWith(data: unknown, fragment: string) {
  const dir = setupProject();
  try {
    write(dir, data);
    const result = run(dir);
    const output = JSON.parse(result.stdout);
    expect(output.status).toBe('FAILED');
    expect(result.status).toBe(1);
    expect(output.errors.some((e: string) => e.includes(fragment))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('scripts/validate-feature-map.mjs (real execution)', () => {
  it('passes a well-formed map', () => {
    const dir = setupProject();
    try {
      write(dir, wellFormed());
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when the file is missing entirely - it is run straight after writing one', () => {
    const dir = setupProject();
    try {
      const result = run(dir);
      expect(JSON.parse(result.stdout).status).toBe('FAILED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a relation points at an entity that is not in the file', () => {
    const data = wellFormed() as any;
    data.entities.e0000000000000aa.relations[0].targetEntityId = 'e00000000000ffff';
    failsWith(data, 'must name an entity present in this file');
  });

  it('fails when an entity relates to itself', () => {
    const data = wellFormed() as any;
    data.entities.e0000000000000aa.relations[0].targetEntityId = 'e0000000000000aa';
    failsWith(data, 'points at its own entity');
  });

  it('fails when a feature claims a route the site map never had', () => {
    const data = wellFormed() as any;
    data.features.f0000000000000aa.memberRouteIds = ['route-ghost'];
    failsWith(data, 'is not a route in the site map');
  });

  it('fails when impactSourceRouteId is not one of the feature own member routes', () => {
    const data = wellFormed() as any;
    data.features.f0000000000000aa.memberRouteIds = ['route-orders'];
    data.features.f0000000000000aa.impactSourceRouteId = 'route-elsewhere';
    failsWith(data, 'impactSourceRouteId');
  });

  it('fails when a transition leaves from a state the entity does not have', () => {
    const data = wellFormed() as any;
    data.entities.e0000000000000aa.lifecycle.transitions[0].from = 'paid';
    failsWith(data, 'is not one of this entity');
  });

  it('fails when a lifecycle has no initial state to start from', () => {
    const data = wellFormed() as any;
    data.entities.e0000000000000aa.lifecycle.states[0].initial = false;
    failsWith(data, 'exactly one initial state');
  });

  it('fails when two states claim to be initial', () => {
    const data = wellFormed() as any;
    data.entities.e0000000000000aa.lifecycle.states[1].initial = true;
    failsWith(data, 'exactly one initial state');
  });

  it('fails when an operation claims to be observed but names no contract behind it', () => {
    const data = wellFormed() as any;
    delete data.entities.e0000000000000aa.operations[0].contractId;
    failsWith(data, 'an unattributed observation is an inference');
  });

  it('fails on a claim with no evidence at all', () => {
    const data = wellFormed() as any;
    data.entities.e0000000000000aa.relations[0].evidence = [];
    failsWith(data, 'a claim with no evidence is a guess');
  });

  it('fails on an evidence excerpt carrying an unredacted digit-shaped value', () => {
    const data = wellFormed() as any;
    data.entities.e0000000000000aa.evidence = [
      { signal: 'api-payload-field', excerpt: 'sessionId 918273645' },
    ];
    failsWith(data, 'contains an unmasked');
  });

  // The guard used to count only an unbroken run of six digits, so a number written the way people
  // write numbers passed straight into the committed map.
  it.each([
    ['a phone number with brackets and a dash', 'Call (555) 123-4567 for help'],
    ['a card number in groups', 'Card 4111 1111 1111 1111'],
    ['an email address', 'Signed in as ann@corp.example'],
  ])('fails on an evidence excerpt carrying %s', (_label, excerpt) => {
    const data = wellFormed() as any;
    data.entities.e0000000000000aa.evidence = [{ signal: 'heading-text', excerpt }];
    failsWith(data, 'contains an unmasked');
  });

  it('fails when a record key and its own id disagree', () => {
    const data = wellFormed() as any;
    data.entities.e0000000000000aa.entityId = 'e00000000000cccc';
    failsWith(data, 'must equal its own key');
  });

  it('fails when reviewed is true but nobody is named as the reviewer', () => {
    const data = wellFormed() as any;
    data.features.f0000000000000aa.reviewed = true;
    failsWith(data, 'reviewedBy must be');
  });

  it('fails when a feature is reachable from nowhere', () => {
    const data = wellFormed() as any;
    data.features.f0000000000000aa.memberRouteIds = [];
    failsWith(data, 'a feature reachable from nowhere is not one');
  });

  it('accepts an entity with an empty lifecycle - nothing was observed, and that is a fact not a defect', () => {
    const dir = setupProject();
    try {
      const data = wellFormed() as any;
      data.entities.e0000000000000aa.lifecycle = { states: [], transitions: [] };
      data.entities.e0000000000000aa.operations = [];
      write(dir, data);
      expect(JSON.parse(run(dir).stdout).status).toBe('PASSED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Per-route intent used to be its own artifact with its own validator. These are the checks that
// came with it, now applied where the routes actually live.
describe('validate-feature-map.mjs per-route intent', () => {
  it('rejects a version-1 file rather than pretending to migrate it', () => {
    const data = wellFormed() as any;
    data.schemaVersion = 1;
    failsWith(data, 'schemaVersion must be exactly 2');
  });

  it('fails when a route belongs to no feature', () => {
    const data = wellFormed() as any;
    data.routes['route-orders'].featureId = 'f-does-not-exist';
    failsWith(data, 'invisible to every stage that walks features');
  });

  it('fails when a route stores a feature name of its own', () => {
    const data = wellFormed() as any;
    data.routes['route-orders'].featureLabel = 'Orders';
    failsWith(data, 'featureLabel must not be present');
  });

  it('fails when a feature and its route disagree about which owns which', () => {
    const data = wellFormed() as any;
    data.features.f0000000000000bb = {
      featureId: 'f0000000000000bb',
      name: 'Checkout',
      memberRouteIds: ['route-orders'],
      entityIds: [],
      impact: 'low',
      evidence: [{ signal: 'route-path', excerpt: '/checkout' }],
      reviewed: false,
    };
    failsWith(data, 'points at "f0000000000000aa"');
  });

  it('fails when a criticality claims more confidence than its evidence supports', () => {
    const data = wellFormed() as any;
    data.routes['route-orders'].criticality.confidence = 'high';
    data.routes['route-orders'].criticality.source = 'route-path';
    data.routes['route-orders'].criticality.evidence = [
      { signal: 'route-path', excerpt: '/orders' },
    ];
    failsWith(data, 'only supports "low"');
  });

  it('fails when the reasoning just repeats the evidence back', () => {
    const data = wellFormed() as any;
    data.routes['route-orders'].criticality.reasoning = 'Place your order';
    failsWith(data, 'repeats its own evidence excerpt');
  });

  it('fails when a route claims review with nobody named as the reviewer', () => {
    const data = wellFormed() as any;
    data.routes['route-orders'].reviewed = true;
    failsWith(data, 'reviewedBy must be');
  });

  it('fails when a route in the file is not in the site map', () => {
    const data = wellFormed() as any;
    data.routes['route-ghost'] = {
      ...data.routes['route-orders'],
      routeId: 'route-ghost',
    };
    failsWith(data, 'not in the site map');
  });

  it('fails when the routes object is missing entirely', () => {
    const data = wellFormed() as any;
    delete data.routes;
    failsWith(data, 'routes must be an object keyed by routeId');
  });

  it('rejects the removed fourth "critical" tier', () => {
    const data = wellFormed() as any;
    data.routes['route-orders'].criticality.value = 'critical';
    failsWith(data, 'criticality.value must be "high", "medium", or "low"');
  });

  it('accepts each of the three levels', () => {
    for (const tier of ['high', 'medium', 'low']) {
      const dir = setupProject();
      try {
        const data = wellFormed() as any;
        data.routes['route-orders'].criticality.value = tier;
        data.features.f0000000000000aa.impact = tier;
        write(dir, data);
        expect(JSON.parse(run(dir).stdout).status, tier).toBe('PASSED');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('fails an empty reasoning - a tier with no explanation cannot be checked', () => {
    const data = wellFormed() as any;
    data.routes['route-orders'].criticality.reasoning = '';
    failsWith(data, 'reasoning must be a non-empty string');
  });

  it('fails an evidence entry with an unknown signal', () => {
    const data = wellFormed() as any;
    data.routes['route-orders'].criticality.evidence = [
      { signal: 'vibes', excerpt: 'it felt important' },
    ];
    failsWith(data, 'signal must be one of');
  });

  it('accepts a path-only judgement when it admits how weak it is', () => {
    const dir = setupProject();
    try {
      const data = wellFormed() as any;
      data.routes['route-orders'].criticality.confidence = 'low';
      data.routes['route-orders'].criticality.source = 'route-path';
      data.routes['route-orders'].criticality.evidence = [
        { signal: 'route-path', excerpt: '/orders' },
      ];
      write(dir, data);
      expect(JSON.parse(run(dir).stdout).status).toBe('PASSED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails a feature name long enough to be a description', () => {
    const data = wellFormed() as any;
    data.features.f0000000000000aa.name = 'A'.repeat(41);
    failsWith(data, 'it is a label, not a summary');
  });

  it('fails cleanly rather than crashing when the file is the literal JSON value null', () => {
    const dir = setupProject();
    try {
      write(dir, null);
      const result = run(dir);
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).status).toBe('FAILED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
