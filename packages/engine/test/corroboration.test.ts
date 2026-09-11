import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderCorroboration } from '../src/plan/templates/corroboration.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-corroboration-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'corroboration.mjs'), renderCorroboration(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'site-map', 'inventory'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'analysis'), { recursive: true });
  return dir;
}

function writeJson(dir: string, relPath: string, data: unknown) {
  writeFileSync(join(dir, relPath), JSON.stringify(data, null, 2), 'utf8');
}

function run(dir: string, ...args: string[]) {
  const result = spawnSync('node', [join('scripts', 'corroboration.mjs'), ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
  return JSON.parse(result.stdout);
}

function journal(dir: string) {
  return readFileSync(join(dir, 'artifacts', 'analysis', 'sensor-journal.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

function inventory(routeId: string, extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    routeId,
    title: 'Page',
    access: { state: 'ok' },
    controls: [{ id: 'c0', role: 'button', name: 'Save', tag: 'button' }],
    headings: [{ level: 1, text: 'Order history' }],
    ...extra,
  };
}

describe('scripts/corroboration.mjs - site map', () => {
  function siteMap(routes: Record<string, unknown>) {
    return { schemaVersion: 2, generatedAt: '2026-09-10T00:00:00.000Z', routes };
  }

  it('flags a page the server says works while the screenshot shows an error', () => {
    const dir = setupProject();
    try {
      writeJson(
        dir,
        'artifacts/site-map/site-map.json',
        siteMap({
          '/reports': {
            routeId: 'r1',
            httpStatus: 200,
            visualTriage: { state: 'error_page', source: 'vision' },
          },
          '/ok': {
            routeId: 'r2',
            httpStatus: 200,
            visualTriage: { state: 'ready', source: 'vision' },
          },
        }),
      );
      writeJson(dir, 'artifacts/site-map/inventory/r1.json', inventory('r1'));
      writeJson(dir, 'artifacts/site-map/inventory/r2.json', inventory('r2'));
      const output = run(dir, '--stage=site-map');
      expect(output.checked).toBe(2);
      expect(output.conflicts).toHaveLength(1);
      expect(output.conflicts[0].subject.path).toBe('/reports');
      expect(
        output.conflicts[0].readings.map(
          (r: { sensor: string; says: string }) => r.sensor + '=' + r.says,
        ),
      ).toEqual(['server=works', 'page=works', 'screen=broken']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads a sign-in form on a page with its own password field as that page working', () => {
    const dir = setupProject();
    try {
      writeJson(
        dir,
        'artifacts/site-map/site-map.json',
        siteMap({
          '/login': {
            routeId: 'r1',
            httpStatus: 200,
            visualTriage: { state: 'auth_wall', source: 'vision' },
          },
        }),
      );
      writeJson(
        dir,
        'artifacts/site-map/inventory/r1.json',
        inventory('r1', {
          controls: [
            { id: 'c0', role: 'textbox', name: 'Password', tag: 'input', type: 'password' },
          ],
        }),
      );
      expect(run(dir, '--stage=site-map').conflicts).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a page that looks fine whose own data calls fail', () => {
    const dir = setupProject();
    try {
      writeJson(
        dir,
        'artifacts/site-map/site-map.json',
        siteMap({
          '/dashboard': {
            routeId: 'r1',
            httpStatus: 200,
            visualTriage: { state: 'ready', source: 'vision' },
          },
        }),
      );
      writeJson(dir, 'artifacts/site-map/inventory/r1.json', inventory('r1'));
      writeJson(dir, 'artifacts/site-map/api-contracts.json', {
        schemaVersion: 1,
        contracts: [
          {
            contractId: 'k1',
            method: 'GET',
            pathTemplate: '/api/stats',
            observedFromRouteIds: ['r1'],
            responseStatus: 503,
          },
        ],
      });
      const [conflict] = run(dir, '--stage=site-map').conflicts;
      expect(
        conflict.readings.find((r: { sensor: string }) => r.sensor === 'traffic'),
      ).toMatchObject({
        says: 'broken',
        detail: 'GET /api/stats answered 503',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scripts/corroboration.mjs - feature map', () => {
  function write(
    dir: string,
    tier: string,
    evidence: Array<{ signal: string; excerpt: string }>,
    extra: Record<string, unknown> = {},
  ) {
    writeJson(dir, 'artifacts/site-map/site-map.json', {
      schemaVersion: 2,
      routes: { '/orders': { routeId: 'r1', title: 'Orders', ...extra } },
    });
    writeJson(dir, 'artifacts/analysis/feature-map.json', {
      schemaVersion: 2,
      routes: {
        r1: {
          routeId: 'r1',
          featureId: 'f1',
          criticality: {
            value: tier,
            confidence: 'medium',
            source: 'heading-text',
            reasoning: 'why',
            evidence,
          },
          reviewed: false,
        },
      },
      features: {},
      entities: {},
    });
  }

  it('flags a LOW rating on a page whose traffic changes data, and never a GraphQL query', () => {
    const dir = setupProject();
    try {
      write(dir, 'low', []);
      writeJson(dir, 'artifacts/site-map/inventory/r1.json', inventory('r1'));
      writeJson(dir, 'artifacts/site-map/api-contracts.json', {
        schemaVersion: 1,
        contracts: [
          {
            contractId: 'k1',
            method: 'POST',
            pathTemplate: '/graphql',
            operation: { style: 'graphql', name: 'orders', documentType: 'query' },
            observedFromRouteIds: ['r1'],
            responseStatus: 200,
          },
        ],
      });
      expect(run(dir, '--stage=feature-map').conflicts).toEqual([]);

      writeJson(dir, 'artifacts/site-map/api-contracts.json', {
        schemaVersion: 1,
        contracts: [
          {
            contractId: 'k2',
            method: 'DELETE',
            pathTemplate: '/api/orders/{id}',
            observedFromRouteIds: ['r1'],
            responseStatus: 204,
          },
        ],
      });
      const [conflict] = run(dir, '--stage=feature-map').conflicts;
      expect(conflict.claim).toBe('criticality');
      expect(conflict.readings[1]).toMatchObject({
        sensor: 'traffic',
        detail: 'changes data: DELETE /api/orders/{id}',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('asks for HIGH where one role reaches the page and another is refused', () => {
    const dir = setupProject();
    try {
      write(dir, 'medium', [], {
        access: {
          admin: { reachable: true, outcome: 'ok', observedAt: '2026-09-10T00:00:00.000Z' },
          customer: {
            reachable: false,
            outcome: 'forbidden',
            observedAt: '2026-09-10T00:00:00.000Z',
          },
        },
      });
      writeJson(dir, 'artifacts/site-map/inventory/r1.json', inventory('r1'));
      const [conflict] = run(dir, '--stage=feature-map').conflicts;
      expect(conflict.readings[1]).toMatchObject({
        sensor: 'roles',
        says: 'high',
        detail: 'reachable as admin, not as customer',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('checks a quoted heading against the recorded page, and skips what nothing records', () => {
    const dir = setupProject();
    try {
      write(dir, 'high', [
        { signal: 'heading-text', excerpt: 'Order History' },
        { signal: 'heading-text', excerpt: 'Refund centre' },
        { signal: 'ui-form', excerpt: 'a form of some kind' },
      ]);
      writeJson(dir, 'artifacts/site-map/inventory/r1.json', inventory('r1'));
      const conflicts = run(dir, '--stage=feature-map').conflicts;
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].subject.excerpt).toBe('Refund centre');

      // An older inventory that recorded no headings cannot say a heading is missing.
      writeJson(
        dir,
        'artifacts/site-map/inventory/r1.json',
        inventory('r1', { headings: undefined }),
      );
      expect(run(dir, '--stage=feature-map').conflicts).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('journals a disagreement once, and settles it for whichever side the change agreed with', () => {
    const dir = setupProject();
    try {
      write(dir, 'low', []);
      writeJson(
        dir,
        'artifacts/site-map/inventory/r1.json',
        inventory('r1', {
          controls: [
            { id: 'c0', role: 'textbox', name: 'Password', tag: 'input', type: 'password' },
          ],
        }),
      );
      run(dir, '--stage=feature-map');
      run(dir, '--stage=feature-map');
      expect(journal(dir).filter((e) => e.event === 'conflict')).toHaveLength(1);

      // The assistant looks again and raises the rating: the record that asked for more was right.
      write(dir, 'medium', []);
      run(dir, '--stage=feature-map');
      const settled = journal(dir).find((e) => e.event === 'resolved');
      expect(settled).toMatchObject({
        by: 'assistant',
        outcome: 'changed',
        right: ['fields'],
        wrong: ['judgment'],
      });

      const report = run(dir, 'report');
      expect(report).toMatchObject({ disagreements: 1, settled: 1, open: 0 });
      expect(
        report.sensors.find((row: { sensor: string }) => row.sensor === 'fields'),
      ).toMatchObject({ right: 1, wrong: 0, rightRate: 1 });
      expect(
        report.sensors.find((row: { sensor: string }) => row.sensor === 'judgment'),
      ).toMatchObject({ right: 0, wrong: 1, rightRate: 0 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not count an approval given before the disagreement existed as settling it', () => {
    const dir = setupProject();
    try {
      write(dir, 'low', []);
      const map = JSON.parse(
        readFileSync(join(dir, 'artifacts', 'analysis', 'feature-map.json'), 'utf8'),
      );
      map.routes.r1.reviewed = true;
      map.routes.r1.reviewedBy = 'human';
      writeJson(dir, 'artifacts/analysis/feature-map.json', map);
      // A later crawl records a password field on a page a person approved before it was there.
      writeJson(
        dir,
        'artifacts/site-map/inventory/r1.json',
        inventory('r1', {
          controls: [
            { id: 'c0', role: 'textbox', name: 'Password', tag: 'input', type: 'password' },
          ],
        }),
      );
      run(dir, '--stage=feature-map');
      run(dir, '--stage=feature-map');
      expect(journal(dir).filter((e) => e.event === 'resolved')).toEqual([]);
      expect(run(dir, 'report').open).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('settles a disagreement a person approved as it is in favour of the rating, once', () => {
    const dir = setupProject();
    try {
      write(dir, 'low', []);
      writeJson(
        dir,
        'artifacts/site-map/inventory/r1.json',
        inventory('r1', {
          controls: [
            { id: 'c0', role: 'textbox', name: 'Password', tag: 'input', type: 'password' },
          ],
        }),
      );
      run(dir, '--stage=feature-map');
      const map = JSON.parse(
        readFileSync(join(dir, 'artifacts', 'analysis', 'feature-map.json'), 'utf8'),
      );
      map.routes.r1.reviewed = true;
      map.routes.r1.reviewedBy = 'human';
      writeJson(dir, 'artifacts/analysis/feature-map.json', map);
      run(dir, '--stage=feature-map');
      run(dir, '--stage=feature-map');
      const events = journal(dir);
      expect(events.filter((e) => e.event === 'conflict')).toHaveLength(1);
      expect(events.filter((e) => e.event === 'resolved')).toEqual([
        expect.objectContaining({
          by: 'human',
          outcome: 'kept',
          right: ['judgment'],
          wrong: ['fields'],
        }),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
