import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderFeatureMapEngine } from '../src/plan/templates/feature-map-engine.js';

function entityIdOf(name: string): string {
  return createHash('sha256').update(name).digest('hex').slice(0, 16);
}

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-feature-map-engine-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'derive-feature-map.mjs'), renderFeatureMapEngine(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
  mkdirSync(join(dir, 'artifacts', 'analysis'), { recursive: true });
  return dir;
}

type RouteSpec = { path: string; routeId: string; status?: string };

function writeSiteMap(dir: string, specs: RouteSpec[]) {
  const routes: Record<string, unknown> = {};
  for (const spec of specs) {
    routes[spec.path] = { routeId: spec.routeId, status: spec.status ?? 'active' };
  }
  writeFileSync(
    join(dir, 'artifacts', 'site-map', 'site-map.json'),
    JSON.stringify({ schemaVersion: 2, generatedAt: '2026-09-08T10:00:00.000Z', routes }, null, 2),
    'utf8',
  );
}

type IntentSpec = { routeId: string; feature: string; tier?: string; reviewed?: boolean };

function writeBusinessIntent(dir: string, specs: IntentSpec[]) {
  const routes: Record<string, unknown> = {};
  for (const spec of specs) {
    routes[spec.routeId] = {
      routeId: spec.routeId,
      businessFeature: {
        value: spec.feature,
        confidence: 'high',
        source: 'heading-text',
        evidence: [],
      },
      criticalityTier: {
        value: spec.tier ?? 'medium',
        confidence: 'high',
        source: 'heading-text',
        evidence: [],
      },
      sourceContentHash: 'hash',
      analyzedAt: '2026-09-08T10:00:00.000Z',
      reviewed: spec.reviewed ?? true,
      ...(spec.reviewed === false ? {} : { reviewedBy: 'human' }),
    };
  }
  writeFileSync(
    join(dir, 'artifacts', 'analysis', 'business-intent.json'),
    JSON.stringify({ schemaVersion: 1, generatedAt: '2026-09-08T10:00:00.000Z', routes }, null, 2),
    'utf8',
  );
}

function writeApiContracts(dir: string, contracts: Record<string, unknown>[]) {
  writeFileSync(
    join(dir, 'artifacts', 'site-map', 'api-contracts.json'),
    JSON.stringify(
      { schemaVersion: 1, generatedAt: '2026-09-08T10:00:00.000Z', contracts },
      null,
      2,
    ),
    'utf8',
  );
}

function contract(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    contractId: createHash('sha256')
      .update(String(overrides.method) + '|' + String(overrides.pathTemplate))
      .digest('hex')
      .slice(0, 16),
    observedFromRouteIds: [],
    responseStatus: 200,
    observedAt: '2026-09-08T10:00:00.000Z',
    ...overrides,
  };
}

function run(dir: string, args: string[] = []) {
  return spawnSync('node', ['scripts/derive-feature-map.mjs', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
}

function readFeatureMap(dir: string) {
  return JSON.parse(readFileSync(join(dir, 'artifacts', 'analysis', 'feature-map.json'), 'utf8'));
}

describe('scripts/derive-feature-map.mjs (real execution)', () => {
  it('fails with a named reason when there is no site map to derive from', () => {
    const dir = setupProject();
    try {
      const result = run(dir);
      expect(result.status).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors[0]).toContain('site-map.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Per-route intent is one input among several, not a precondition. A stage that refuses to run
  // without an optional upstream artifact makes that artifact impossible to remove without editing
  // this stage too, which is the failure mode this project treats as a design defect.
  it('still produces a feature map when business-intent.json is absent, and says it was coarser', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, [
        { path: '/orders', routeId: 'route-orders' },
        { path: '/orders/{id}', routeId: 'route-order-detail' },
      ]);
      const result = run(dir);
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('DRAFTED');
      expect(output.features).toBeGreaterThan(0);
      // Degrading silently would let a human read a weaker map as the best one obtainable.
      expect(output.warnings.join(' ')).toContain('No per-route intent');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports no such warning when the intent was there', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, [{ path: '/orders', routeId: 'route-orders' }]);
      writeBusinessIntent(dir, [{ routeId: 'route-orders', feature: 'Orders', tier: 'high' }]);
      const output = JSON.parse(run(dir).stdout);
      expect(output.warnings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drafts a map with no API traffic at all, from route conventions alone', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, [
        { path: '/orders', routeId: 'route-orders' },
        { path: '/orders/{id}', routeId: 'route-order-detail' },
        { path: '/about', routeId: 'route-about' },
      ]);
      writeBusinessIntent(dir, [
        { routeId: 'route-orders', feature: 'Orders', tier: 'high' },
        { routeId: 'route-order-detail', feature: 'Orders', tier: 'medium' },
        { routeId: 'route-about', feature: 'Marketing', tier: 'low' },
      ]);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('DRAFTED');

      const map = readFeatureMap(dir);
      const orders = map.entities[entityIdOf('orders')];
      expect(orders).toBeDefined();
      expect(orders.name).toBe('orders');
      // A shape seen on two routes is an entity; a one-off page is not.
      expect(map.entities[entityIdOf('about')]).toBeUndefined();
      // Nothing here was observed in traffic, so nothing claims to have been.
      expect(
        orders.operations.every((op: { confidence: string }) => op.confidence === 'inferred'),
      ).toBe(true);
      expect(orders.operations.map((op: { kind: string }) => op.kind).sort()).toEqual([
        'list',
        'read',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads a full CRUD lifecycle off observed traffic, and marks those operations observed', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, [{ path: '/orders', routeId: 'route-orders' }]);
      writeBusinessIntent(dir, [{ routeId: 'route-orders', feature: 'Orders', tier: 'high' }]);
      writeApiContracts(dir, [
        contract({
          method: 'GET',
          pathTemplate: '/api/orders',
          observedFromRouteIds: ['route-orders'],
        }),
        contract({
          method: 'POST',
          pathTemplate: '/api/orders',
          observedFromRouteIds: ['route-orders'],
        }),
        contract({
          method: 'GET',
          pathTemplate: '/api/orders/{id}',
          observedFromRouteIds: ['route-orders'],
        }),
        contract({
          method: 'PUT',
          pathTemplate: '/api/orders/{id}',
          observedFromRouteIds: ['route-orders'],
        }),
        contract({
          method: 'DELETE',
          pathTemplate: '/api/orders/{id}',
          responseStatus: 204,
          observedFromRouteIds: ['route-orders'],
        }),
      ]);
      run(dir);
      const orders = readFeatureMap(dir).entities[entityIdOf('orders')];
      expect(orders.operations.map((op: { kind: string }) => op.kind).sort()).toEqual([
        'create',
        'delete',
        'list',
        'read',
        'update',
      ]);
      expect(
        orders.operations.every((op: { confidence: string }) => op.confidence === 'observed'),
      ).toBe(true);

      const stateNames = orders.lifecycle.states.map((s: { name: string }) => s.name);
      expect(stateNames).toEqual(['absent', 'exists', 'removed']);
      expect(
        orders.lifecycle.states.find((s: { name: string }) => s.name === 'absent').initial,
      ).toBe(true);
      expect(
        orders.lifecycle.states.find((s: { name: string }) => s.name === 'removed').terminal,
      ).toBe(true);
      expect(
        orders.lifecycle.transitions.map((t: { from: string; to: string }) => t.from + '->' + t.to),
      ).toEqual(['absent->exists', 'exists->exists', 'exists->removed']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('starts a read-only entity already in existence - an absent state nothing can leave is not a lifecycle', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, [{ path: '/reports', routeId: 'route-reports' }]);
      writeBusinessIntent(dir, [{ routeId: 'route-reports', feature: 'Reporting' }]);
      writeApiContracts(dir, [
        contract({
          method: 'GET',
          pathTemplate: '/api/reports',
          observedFromRouteIds: ['route-reports'],
        }),
      ]);
      run(dir);
      const reports = readFeatureMap(dir).entities[entityIdOf('reports')];
      expect(reports.lifecycle.states).toEqual([{ name: 'exists', initial: true, terminal: true }]);
      expect(reports.lifecycle.transitions).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('infers a reference relation from an id-shaped field naming another entity', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, [
        { path: '/orders', routeId: 'route-orders' },
        { path: '/customers', routeId: 'route-customers' },
      ]);
      writeBusinessIntent(dir, [
        { routeId: 'route-orders', feature: 'Orders' },
        { routeId: 'route-customers', feature: 'Customers' },
      ]);
      writeApiContracts(dir, [
        contract({
          method: 'POST',
          pathTemplate: '/api/orders',
          observedFromRouteIds: ['route-orders'],
          sampleRequestPayload: { customerId: '[REDACTED]', note: 'gift wrap' },
        }),
        contract({
          method: 'GET',
          pathTemplate: '/api/customers',
          observedFromRouteIds: ['route-customers'],
        }),
      ]);
      run(dir);
      const map = readFeatureMap(dir);
      const orders = map.entities[entityIdOf('orders')];
      expect(orders.relations).toHaveLength(1);
      expect(orders.relations[0]).toMatchObject({
        kind: 'references',
        targetEntityId: entityIdOf('customers'),
        viaField: 'customerId',
        // A field name is a convention, never proof of a domain link.
        confidence: 'inferred',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not invent a relation from an id field naming nothing the app actually has', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, [{ path: '/orders', routeId: 'route-orders' }]);
      writeBusinessIntent(dir, [{ routeId: 'route-orders', feature: 'Orders' }]);
      writeApiContracts(dir, [
        contract({
          method: 'POST',
          pathTemplate: '/api/orders',
          observedFromRouteIds: ['route-orders'],
          sampleRequestPayload: { warehouseId: 'w-1' },
        }),
      ]);
      run(dir);
      expect(readFeatureMap(dir).entities[entityIdOf('orders')].relations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('infers containment from a nested response field named after another entity', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, [
        { path: '/orders', routeId: 'route-orders' },
        { path: '/items', routeId: 'route-items' },
      ]);
      writeBusinessIntent(dir, [
        { routeId: 'route-orders', feature: 'Orders' },
        { routeId: 'route-items', feature: 'Catalog' },
      ]);
      writeApiContracts(dir, [
        contract({
          method: 'GET',
          pathTemplate: '/api/orders/{id}',
          observedFromRouteIds: ['route-orders'],
          responseShape: { id: 'string (uuid)', items: '[ { ... } ]', total: 'integer' },
        }),
        contract({
          method: 'GET',
          pathTemplate: '/api/items',
          observedFromRouteIds: ['route-items'],
        }),
      ]);
      run(dir);
      const orders = readFeatureMap(dir).entities[entityIdOf('orders')];
      expect(orders.relations).toEqual([
        expect.objectContaining({
          kind: 'contains',
          targetEntityId: entityIdOf('items'),
          viaField: 'items',
        }),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('groups routes sharing a business-intent label into one feature, and takes the worst impact among them', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, [
        { path: '/checkout', routeId: 'route-checkout' },
        { path: '/checkout/confirm', routeId: 'route-confirm' },
      ]);
      writeBusinessIntent(dir, [
        { routeId: 'route-checkout', feature: 'Checkout', tier: 'medium' },
        { routeId: 'route-confirm', feature: 'Checkout', tier: 'high' },
      ]);
      run(dir);
      const map = readFeatureMap(dir);
      const features = Object.values(map.features) as Record<string, any>[];
      expect(features).toHaveLength(1);
      expect(features[0].memberRouteIds.sort()).toEqual(['route-checkout', 'route-confirm']);
      expect(features[0].impact).toBe('high');
      expect(features[0].impactSourceRouteId).toBe('route-confirm');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ignores an unreviewed criticality tier and falls back to high rather than laundering a draft into a fact', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, [{ path: '/help', routeId: 'route-help' }]);
      writeBusinessIntent(dir, [
        { routeId: 'route-help', feature: 'Help Centre', tier: 'low', reviewed: false },
      ]);
      run(dir);
      const feature = (Object.values(readFeatureMap(dir).features) as Record<string, any>[])[0];
      expect(feature.impact).toBe('high');
      expect(feature.impactSourceRouteId).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports an entity no mapped route reached instead of dropping it', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, [{ path: '/dashboard', routeId: 'route-dashboard' }]);
      writeBusinessIntent(dir, [{ routeId: 'route-dashboard', feature: 'Dashboard' }]);
      writeApiContracts(dir, [
        contract({ method: 'POST', pathTemplate: '/api/sessions', observedFromRouteIds: [] }),
      ]);
      const output = JSON.parse(run(dir).stdout);
      expect(output.orphanEntities).toEqual(['sessions']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('re-running', () => {
    function seed(dir: string) {
      writeSiteMap(dir, [{ path: '/orders', routeId: 'route-orders' }]);
      writeBusinessIntent(dir, [{ routeId: 'route-orders', feature: 'Orders' }]);
      writeApiContracts(dir, [
        contract({
          method: 'GET',
          pathTemplate: '/api/orders',
          observedFromRouteIds: ['route-orders'],
        }),
      ]);
    }

    it('reports UNCHANGED and leaves the file alone when no input moved', () => {
      const dir = setupProject();
      try {
        seed(dir);
        run(dir);
        const first = readFileSync(join(dir, 'artifacts', 'analysis', 'feature-map.json'), 'utf8');
        const output = JSON.parse(run(dir).stdout);
        expect(output.status).toBe('UNCHANGED');
        expect(readFileSync(join(dir, 'artifacts', 'analysis', 'feature-map.json'), 'utf8')).toBe(
          first,
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('redrafts on --force even when nothing changed', () => {
      const dir = setupProject();
      try {
        seed(dir);
        run(dir);
        expect(JSON.parse(run(dir, ['--force']).stdout).status).toBe('DRAFTED');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('keeps a human approval when the entity it covered is byte-for-byte the same', () => {
      const dir = setupProject();
      try {
        seed(dir);
        run(dir);
        const map = readFeatureMap(dir);
        map.entities[entityIdOf('orders')].reviewed = true;
        map.entities[entityIdOf('orders')].reviewedBy = 'human';
        writeFileSync(
          join(dir, 'artifacts', 'analysis', 'feature-map.json'),
          JSON.stringify(map, null, 2),
          'utf8',
        );
        run(dir, ['--force']);
        expect(readFeatureMap(dir).entities[entityIdOf('orders')].reviewed).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('drops a human approval once the entity underneath it has changed', () => {
      const dir = setupProject();
      try {
        seed(dir);
        run(dir);
        const map = readFeatureMap(dir);
        map.entities[entityIdOf('orders')].reviewed = true;
        map.entities[entityIdOf('orders')].reviewedBy = 'human';
        writeFileSync(
          join(dir, 'artifacts', 'analysis', 'feature-map.json'),
          JSON.stringify(map, null, 2),
          'utf8',
        );
        // A delete endpoint shows up on the next crawl: the lifecycle now has a state it did not
        // have when someone approved it, so the approval no longer covers what is there.
        writeApiContracts(dir, [
          contract({
            method: 'GET',
            pathTemplate: '/api/orders',
            observedFromRouteIds: ['route-orders'],
          }),
          contract({
            method: 'DELETE',
            pathTemplate: '/api/orders/{id}',
            responseStatus: 204,
            observedFromRouteIds: ['route-orders'],
          }),
        ]);
        run(dir);
        expect(readFeatureMap(dir).entities[entityIdOf('orders')].reviewed).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it('writes the artifact under artifacts/analysis, alongside the other analysis outputs', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, [{ path: '/orders', routeId: 'route-orders' }]);
      writeBusinessIntent(dir, [{ routeId: 'route-orders', feature: 'Orders' }]);
      run(dir);
      expect(existsSync(join(dir, 'artifacts', 'analysis', 'feature-map.json'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Every one of these produced fabricated entities before the transport was read: gRPC-Web gave
  // one entity per method name, tRPC turned a batched request into an entity called
  // "order.byid,customer.all", and GraphQL contributed nothing at all while its whole API
  // collapsed onto one contract.
  describe('transports other than REST', () => {
    function rpc(name: string, method = 'POST', overrides: Record<string, unknown> = {}) {
      return contract({
        method,
        pathTemplate: '/rpc/' + name.replace(/\//g, '.'),
        operation: { style: 'rpc', name },
        observedFromRouteIds: ['route-orders'],
        ...overrides,
      });
    }

    function graphql(
      name: string,
      documentType: 'query' | 'mutation',
      overrides: Record<string, unknown> = {},
    ) {
      return contract({
        method: 'POST',
        pathTemplate: '/graphql',
        operation: { style: 'graphql', name, documentType },
        observedFromRouteIds: ['route-orders'],
        ...overrides,
      });
    }

    function seedRoutes(dir: string) {
      writeSiteMap(dir, [{ path: '/orders', routeId: 'route-orders' }]);
      writeBusinessIntent(dir, [{ routeId: 'route-orders', feature: 'Ordering' }]);
    }

    it('reads a gRPC-Web service and method into one entity with real operations', () => {
      const dir = setupProject();
      try {
        seedRoutes(dir);
        writeApiContracts(dir, [
          rpc('orders.v1.OrderService/CreateOrder'),
          rpc('orders.v1.OrderService/DeleteOrder'),
          rpc('customers.v1.CustomerService/ListCustomers'),
        ]);
        expect(run(dir).status).toBe(0);
        const map = readFeatureMap(dir);
        const names = Object.values(map.entities).map((e: any) => e.name.toLowerCase());
        expect(names.sort()).toEqual(['customer', 'order']);
        const order = Object.values(map.entities).find(
          (e: any) => e.name.toLowerCase() === 'order',
        ) as any;
        // `list` also appears, contributed by the /orders route shape rather than by any contract -
        // only the observed half is what this test is about.
        expect(
          order.operations
            .filter((o: { confidence: string }) => o.confidence === 'observed')
            .map((o: { kind: string }) => o.kind)
            .sort(),
        ).toEqual(['create', 'delete']);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('keeps the entity from an RPC service name even when the method verb is unknown', () => {
      const dir = setupProject();
      try {
        seedRoutes(dir);
        writeApiContracts(dir, [rpc('orders.v1.OrderService/ReticulateOrder')]);
        run(dir);
        const order = Object.values(readFeatureMap(dir).entities).find(
          (e: any) => e.name.toLowerCase() === 'order',
        ) as any;
        expect(order).toBeDefined();
        // The service says what it is about; the method does not say what it does to it, and
        // nothing here invents an answer - so the contract contributes no observed operation, and
        // only the route shape does.
        expect(
          order.operations.filter((o: { confidence: string }) => o.confidence === 'observed'),
        ).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('splits a batched tRPC request into one operation per procedure', () => {
      const dir = setupProject();
      try {
        seedRoutes(dir);
        writeApiContracts(dir, [rpc('order.byId,customer.all', 'GET')]);
        run(dir);
        const names = Object.values(readFeatureMap(dir).entities).map((e: any) =>
          e.name.toLowerCase(),
        );
        expect(names.sort()).toEqual(['customer', 'order']);
        for (const name of names) expect(name).not.toContain(',');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('reads a GraphQL mutation root field as a verb and a noun', () => {
      const dir = setupProject();
      try {
        seedRoutes(dir);
        writeApiContracts(dir, [graphql('createOrder', 'mutation')]);
        run(dir);
        const order = Object.values(readFeatureMap(dir).entities).find(
          (e: any) => e.name.toLowerCase() === 'order',
        ) as any;
        expect(
          order.operations
            .filter((o: { confidence: string }) => o.confidence === 'observed')
            .map((o: { kind: string }) => o.kind),
        ).toEqual(['create']);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('reads a verbless GraphQL query field from its own document type, which provably does not mutate', () => {
      const dir = setupProject();
      try {
        seedRoutes(dir);
        writeApiContracts(dir, [graphql('orders', 'query'), graphql('orderById', 'query')]);
        run(dir);
        const order = Object.values(readFeatureMap(dir).entities).find(
          (e: any) => e.name.toLowerCase() === 'order' || e.name.toLowerCase() === 'orders',
        ) as any;
        expect(
          order.operations
            .filter((o: { confidence: string }) => o.confidence === 'observed')
            .map((o: { kind: string }) => o.kind)
            .sort(),
        ).toEqual(['list', 'read']);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('leaves a GraphQL mutation with an unrecognised verb unclassified rather than inventing an entity', () => {
      const dir = setupProject();
      try {
        seedRoutes(dir);
        writeApiContracts(dir, [graphql('reticulateSplines', 'mutation')]);
        const output = JSON.parse(run(dir).stdout);
        expect(output.unclassifiedOperations).toEqual(['reticulateSplines']);
        const names = Object.values(readFeatureMap(dir).entities).map((e: any) => e.name);
        expect(names).not.toContain('reticulatesplines');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('attaches a GraphQL payload relation to the entity its root field named, not to the shared path', () => {
      const dir = setupProject();
      try {
        writeSiteMap(dir, [
          { path: '/orders', routeId: 'route-orders' },
          { path: '/customers', routeId: 'route-customers' },
        ]);
        writeBusinessIntent(dir, [
          { routeId: 'route-orders', feature: 'Ordering' },
          { routeId: 'route-customers', feature: 'Customers' },
        ]);
        writeApiContracts(dir, [
          graphql('createOrder', 'mutation', {
            sampleRequestPayload: { customerId: '[REDACTED]' },
          }),
          graphql('customers', 'query'),
        ]);
        run(dir);
        const map = readFeatureMap(dir);
        const order = Object.values(map.entities).find(
          (e: any) => e.name.toLowerCase() === 'order',
        ) as any;
        expect(order.relations).toHaveLength(1);
        expect(order.relations[0].viaField).toBe('customerId');
        expect(order.relations[0].kind).toBe('references');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('records an opaque call as read-but-undecodable and lets it contribute nothing', () => {
      const dir = setupProject();
      try {
        seedRoutes(dir);
        writeApiContracts(dir, [
          contract({
            method: 'POST',
            pathTemplate: '/orders',
            operation: {
              style: 'opaque',
              reason: 'Next.js Server Action - the action id is encrypted and changes every build',
            },
            observedFromRouteIds: ['route-orders'],
          }),
        ]);
        const output = JSON.parse(run(dir).stdout);
        expect(output.opaqueContracts).toEqual(['POST /orders']);
        // /orders alone is one route, below the floor a route shape needs to become an entity, so
        // the opaque call leaves the map genuinely empty rather than inventing "orders".
        expect(Object.keys(readFeatureMap(dir).entities)).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('still treats a contract with no operation field as REST, the shape most applications use', () => {
      const dir = setupProject();
      try {
        seedRoutes(dir);
        writeApiContracts(dir, [
          contract({
            method: 'POST',
            pathTemplate: '/api/orders',
            observedFromRouteIds: ['route-orders'],
          }),
        ]);
        run(dir);
        const order = Object.values(readFeatureMap(dir).entities).find(
          (e: any) => e.name.toLowerCase() === 'orders',
        ) as any;
        expect(
          order.operations
            .filter((o: { confidence: string }) => o.confidence === 'observed')
            .map((o: { kind: string }) => o.kind),
        ).toEqual(['create']);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
