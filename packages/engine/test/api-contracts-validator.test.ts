import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderApiContractsValidator } from '../src/plan/templates/api-contracts-validator.js';

function wellFormedContracts() {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-06T10:00:00.000Z',
    contracts: [
      {
        contractId: 'a1b2c3d4e5f6a7b8',
        method: 'POST',
        pathTemplate: '/api/login',
        observedFromRouteIds: [],
        sampleRequestPayload: { username: '[REDACTED]', password: '[REDACTED]' },
        responseStatus: 200,
        responseShape: { accessToken: 'string', expiresIn: 'integer' },
        observedAt: '2026-09-06T10:00:01.000Z',
      },
      {
        contractId: 'b2c3d4e5f6a7b8c9',
        method: 'GET',
        pathTemplate: '/api/cart/{id}',
        observedFromRouteIds: ['route-cart'],
        responseStatus: 200,
        responseShape: { id: 'string (uuid)', items: '[ { ... } ]' },
        observedAt: '2026-09-06T10:00:02.000Z',
      },
    ],
  };
}

function minimalContracts() {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-06T10:00:00.000Z',
    contracts: [
      {
        contractId: 'a1b2c3d4e5f6a7b8',
        method: 'GET',
        pathTemplate: '/api/health',
        observedFromRouteIds: [],
        responseStatus: 200,
        observedAt: '2026-09-06T10:00:00.000Z',
      },
    ],
  };
}

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-api-contracts-validator-'));
  writeFileSync(join(dir, 'validate-api-contracts.mjs'), renderApiContractsValidator(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
  return dir;
}

function writeContracts(dir: string, data: unknown) {
  writeFileSync(
    join(dir, 'artifacts', 'site-map', 'api-contracts.json'),
    JSON.stringify(data, null, 2),
    'utf8',
  );
}

// Only the fields computeObservationCoverage actually reads - routeId and status.
function writeSiteMap(dir: string, activeRouteCount: number, _observedRouteIds: string[]) {
  const routes: Record<string, unknown> = {};
  for (let i = 0; i < activeRouteCount; i += 1) {
    routes['/r' + i] = { routeId: 'route-' + i, status: 'active' };
  }
  writeFileSync(
    join(dir, 'artifacts', 'site-map', 'site-map.json'),
    JSON.stringify({ schemaVersion: 2, generatedAt: '2026-09-06T10:00:00.000Z', routes }, null, 2),
    'utf8',
  );
}

function run(dir: string) {
  return spawnSync('node', ['validate-api-contracts.mjs'], { cwd: dir, encoding: 'utf8' });
}

describe('scripts/validate-api-contracts.mjs (real execution)', () => {
  it('passes and notes a skip when the file does not exist - not every app has recordable API traffic', () => {
    const dir = setupProject();
    try {
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.note).toContain('No api-contracts.json found');
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes validation for a well-formed multi-contract fixture with every optional field present', () => {
    const dir = setupProject();
    try {
      writeContracts(dir, wellFormedContracts());
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes validation for the minimal shape with every optional field absent', () => {
    const dir = setupProject();
    try {
      writeContracts(dir, minimalContracts());
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails cleanly (not a crash) when the file content is the literal JSON value null', () => {
    const dir = setupProject();
    try {
      writeFileSync(join(dir, 'artifacts', 'site-map', 'api-contracts.json'), 'null', 'utf8');
      const result = run(dir);
      expect(result.status).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('must contain a JSON object'))).toBe(
        true,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when schemaVersion is not exactly 1', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedContracts()) as Record<string, unknown>;
      bad.schemaVersion = 2;
      writeContracts(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('schemaVersion'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when contracts is not an array', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedContracts()) as Record<string, unknown>;
      bad.contracts = {};
      writeContracts(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('contracts must be an array'))).toBe(
        true,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on a contract entry missing contractId', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedContracts());
      delete (bad.contracts[0] as Record<string, unknown>).contractId;
      writeContracts(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('.contractId must be'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on two contract entries sharing the same contractId', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedContracts());
      (bad.contracts[1] as Record<string, unknown>).contractId = bad.contracts[0].contractId;
      writeContracts(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('is a duplicate'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when responseStatus is not a number', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedContracts()) as Record<string, unknown>;
      (bad.contracts as Record<string, unknown>[])[0].responseStatus = '200';
      writeContracts(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('.responseStatus must be a number')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when responseShape carries a concrete value instead of a type-hint string', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedContracts()) as Record<string, any>;
      bad.contracts[0].responseShape = { accessToken: 12345 };
      writeContracts(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('must be a type-hint string'))).toBe(
        true,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Regression coverage for the PII-redaction backstop's two independent guards.
  it('fails when sampleRequestPayload carries an unredacted 6+ digit run', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedContracts()) as Record<string, any>;
      bad.contracts[0].sampleRequestPayload = { sessionId: '123456789' };
      writeContracts(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('unredacted PII/session-data value')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when sampleRequestPayload carries a plaintext password under a sensitive key name, even though the value is not digit-shaped', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedContracts()) as Record<string, any>;
      bad.contracts[0].sampleRequestPayload = { username: 'alice', password: 'hunter2' };
      writeContracts(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('unredacted PII/session-data value')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when sampleRequestPayload carries an email address under a sensitive key name', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedContracts()) as Record<string, any>;
      bad.contracts[0].sampleRequestPayload = { email: 'alice@example.com' };
      writeContracts(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when every sensitive field in sampleRequestPayload is already masked as [REDACTED]', () => {
    const dir = setupProject();
    try {
      const data = structuredClone(wellFormedContracts()) as Record<string, any>;
      data.contracts[0].sampleRequestPayload = { username: 'alice', password: '[REDACTED]' };
      writeContracts(dir, data);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('observation-quality warnings (never fatal)', () => {
    it('warns, without failing, on a 2xx contract that recorded no responseShape', () => {
      const dir = setupProject();
      try {
        writeContracts(dir, minimalContracts());
        const result = run(dir);
        const output = JSON.parse(result.stdout);
        expect(output.status).toBe('PASSED');
        expect(result.status).toBe(0);
        expect(output.warnings.some((w: string) => w.includes('has no responseShape'))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('does not warn about a missing responseShape on a 204, which carries no body by definition', () => {
      const dir = setupProject();
      try {
        const data = structuredClone(minimalContracts()) as Record<string, any>;
        data.contracts[0].method = 'DELETE';
        data.contracts[0].responseStatus = 204;
        writeContracts(dir, data);
        const result = run(dir);
        const output = JSON.parse(result.stdout);
        expect(output.status).toBe('PASSED');
        expect(output.warnings).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('warns on an empty responseShape object, which reads the same as one never looked at', () => {
      const dir = setupProject();
      try {
        const data = structuredClone(minimalContracts()) as Record<string, any>;
        data.contracts[0].responseShape = {};
        writeContracts(dir, data);
        const result = run(dir);
        const output = JSON.parse(result.stdout);
        expect(output.status).toBe('PASSED');
        expect(output.warnings.some((w: string) => w.includes('empty responseShape'))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('warns when almost no active route contributed an observed call - the 1-contract-per-62-routes case', () => {
      const dir = setupProject();
      try {
        writeSiteMap(dir, 62, ['route-0']);
        const data = structuredClone(minimalContracts()) as Record<string, any>;
        data.contracts[0].observedFromRouteIds = ['route-0'];
        data.contracts[0].responseShape = { status: 'string' };
        writeContracts(dir, data);
        const result = run(dir);
        const output = JSON.parse(result.stdout);
        expect(output.status).toBe('PASSED');
        expect(result.status).toBe(0);
        expect(output.observationCoverage).toEqual({
          activeRoutes: 62,
          routesWithObservedCalls: 1,
        });
        expect(
          output.warnings.some((w: string) => w.includes('contributed an observed API call')),
        ).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('stays silent on a small site, where the ratio cannot mean anything yet', () => {
      const dir = setupProject();
      try {
        writeSiteMap(dir, 4, []);
        const data = structuredClone(minimalContracts()) as Record<string, any>;
        data.contracts[0].responseShape = { status: 'string' };
        writeContracts(dir, data);
        const result = run(dir);
        const output = JSON.parse(result.stdout);
        expect(output.observationCoverage).toEqual({ activeRoutes: 4, routesWithObservedCalls: 0 });
        expect(output.warnings).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('stays silent when observation is healthy across a large site', () => {
      const dir = setupProject();
      try {
        writeSiteMap(
          dir,
          20,
          Array.from({ length: 12 }, (_, i) => 'route-' + i),
        );
        const data = structuredClone(minimalContracts()) as Record<string, any>;
        data.contracts[0].responseShape = { status: 'string' };
        data.contracts[0].observedFromRouteIds = Array.from({ length: 12 }, (_, i) => 'route-' + i);
        writeContracts(dir, data);
        const result = run(dir);
        const output = JSON.parse(result.stdout);
        expect(output.warnings).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('reports no observationCoverage at all when there is no site map to count against', () => {
      const dir = setupProject();
      try {
        writeContracts(dir, wellFormedContracts());
        const result = run(dir);
        const output = JSON.parse(result.stdout);
        expect(output.observationCoverage).toBeNull();
        expect(output.warnings).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
