import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSiteMapValidator } from '../src/plan/templates/site-map-validator.js';
import { renderGitignore } from '../src/plan/templates/gitignore.js';
import { planAiOperationalSkills } from '../src/plan/templates/ai-operational-skills.js';
import { planAiAgents } from '../src/plan/templates/ai-agents.js';

function wellFormedSiteMap() {
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-03T10:00:00.000Z',
    lastUpdatedAt: '2026-09-03T12:00:00.000Z',
    baseUrl: 'https://example.com',
    coverage: { boundedBy: 'maxDepth', pagesVisited: 120 },
    routes: {
      '/checkout': {
        routeId: 'route-checkout',
        sampleUrls: ['https://example.com/checkout'],
        title: 'Checkout',
        regions: ['header', 'main', 'dialog'],
        components: ['CheckoutForm'],
        discoveredAt: '2026-09-03T10:00:00.000Z',
        lastCheckedAt: '2026-09-03T12:00:00.000Z',
        contentHash: 'abc123',
        status: 'active',
      },
      '/account': {
        routeId: 'route-account',
        sampleUrls: ['https://example.com/account'],
        discoveredAt: '2026-09-03T10:00:00.000Z',
        lastCheckedAt: '2026-09-03T12:00:00.000Z',
        contentHash: 'def456',
        status: 'active',
      },
    },
    sharedWidgets: ['Navbar'],
  };
}

function minimalSiteMap() {
  return {
    schemaVersion: 2,
    generatedAt: '2026-09-03T10:00:00.000Z',
    routes: {
      '/': {
        routeId: 'route-home',
        sampleUrls: ['https://example.com/'],
        discoveredAt: '2026-09-03T10:00:00.000Z',
        lastCheckedAt: '2026-09-03T10:00:00.000Z',
        contentHash: 'root-hash',
        status: 'active',
      },
    },
  };
}

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-site-map-validator-'));
  writeFileSync(join(dir, 'validate-site-map.mjs'), renderSiteMapValidator(), 'utf8');
  mkdirSync(join(dir, 'artifacts', 'site-map'), { recursive: true });
  return dir;
}

function writeSiteMap(dir: string, data: unknown) {
  writeFileSync(
    join(dir, 'artifacts', 'site-map', 'site-map.json'),
    JSON.stringify(data, null, 2),
    'utf8',
  );
}

function run(dir: string) {
  return spawnSync('node', ['validate-site-map.mjs'], { cwd: dir, encoding: 'utf8' });
}

// "This route probably isn't real" is the one triage claim that removes a route from a human's
// attention, so the validator requires it to carry its own evidence. Live-observed regression this
// covers: 8 nav-reachable routes (including real 401-protected ones) flagged as phantom off the
// content-hash heuristic alone, with no httpStatus recorded anywhere in the file.
function siteMapWithPhantom(overrides: Record<string, unknown>) {
  const map = minimalSiteMap() as unknown as {
    routes: Record<string, Record<string, unknown>>;
  };
  map.routes['/maybe-real'] = {
    routeId: 'route-maybe-real',
    sampleUrls: ['https://example.com/maybe-real'],
    discoveredAt: '2026-09-03T10:00:00.000Z',
    lastCheckedAt: '2026-09-03T10:00:00.000Z',
    contentHash: 'shell-hash',
    status: 'active',
    visualTriage: { state: 'error_page', flags: ['likely-phantom-route'] },
    ...overrides,
  };
  return map;
}

describe('validate-site-map.mjs phantom-route evidence invariant', () => {
  it('rejects a phantom flag on a navigation-discovered route with no recorded httpStatus', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, siteMapWithPhantom({ discoveryMethod: 'navigation' }));
      const result = run(dir);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('likely-phantom-route');
      expect(result.stdout).toContain('without a recorded httpStatus of 404/410');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a phantom flag on a navigation-discovered route that recorded a real 404', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, siteMapWithPhantom({ discoveryMethod: 'navigation', httpStatus: 404 }));
      expect(run(dir).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a phantom flag on an href-scan-only route - the content-hash heuristic owns that case', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, siteMapWithPhantom({ discoveryMethod: 'href-scan-only' }));
      expect(run(dir).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a phantom flag on a 401/403 route - that status means the route exists and is protected', () => {
    for (const status of [401, 403]) {
      const dir = setupProject();
      try {
        writeSiteMap(
          dir,
          siteMapWithPhantom({ discoveryMethod: 'href-scan-only', httpStatus: status }),
        );
        const result = run(dir);
        expect(result.status).toBe(1);
        expect(result.stdout).toContain('the route exists and is protected');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('rejects an httpStatus that is not a plausible HTTP status code', () => {
    const dir = setupProject();
    try {
      const map = minimalSiteMap() as unknown as {
        routes: Record<string, Record<string, unknown>>;
      };
      map.routes['/'].httpStatus = 99;
      writeSiteMap(dir, map);
      const result = run(dir);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        'httpStatus, when present, must be an integer between 100 and 599',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a route recording a 200 with no triage flags at all', () => {
    const dir = setupProject();
    try {
      const map = minimalSiteMap() as unknown as {
        routes: Record<string, Record<string, unknown>>;
      };
      map.routes['/'].httpStatus = 200;
      writeSiteMap(dir, map);
      expect(run(dir).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// An overlay the crawl opened and walked away from makes every later click on that page land on a
// backdrop - no error, no effect, nothing explored. The file is where that becomes catchable.
function siteMapWithOverlay(overlay: Record<string, unknown>, flags?: string[]) {
  const map = minimalSiteMap() as unknown as {
    routes: Record<string, Record<string, unknown>>;
  };
  map.routes['/'].overlays = [
    {
      overlayId: 'ov-abc123-1',
      kind: 'modal',
      trigger: 'auto',
      title: 'We use cookies',
      dismissal: { method: 'escape', verified: true },
      ...overlay,
    },
  ];
  if (flags) map.routes['/'].visualTriage = { state: 'ready', flags };
  return map;
}

describe('validate-site-map.mjs overlay dismissal invariant', () => {
  it('accepts an overlay that was closed and re-checked', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, siteMapWithOverlay({}));
      expect(run(dir).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an overlay whose dismissal was never verified', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, siteMapWithOverlay({ dismissal: { method: 'escape', verified: false } }));
      const result = run(dir);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('re-check the page after dismissing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an overlay with no dismissal recorded at all', () => {
    const dir = setupProject();
    try {
      const map = siteMapWithOverlay({});
      delete (map.routes['/'].overlays as Record<string, unknown>[])[0].dismissal;
      writeSiteMap(dir, map);
      const result = run(dir);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('may have left open');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('requires a blocked-by-overlay flag when the crawl gave up on closing it', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, siteMapWithOverlay({ dismissal: { method: 'gave-up', verified: false } }));
      const result = run(dir);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('blocked-by-overlay');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a give-up that is flagged honestly on the route', () => {
    const dir = setupProject();
    try {
      writeSiteMap(
        dir,
        siteMapWithOverlay({ dismissal: { method: 'gave-up', verified: false } }, [
          'blocked-by-overlay',
        ]),
      );
      expect(run(dir).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an overlay screenshot the pruner could not match back to its route', () => {
    const dir = setupProject();
    try {
      writeSiteMap(
        dir,
        siteMapWithOverlay({
          screenshot: 'artifacts/site-map/screenshots/root--route-home--overlay-1.jpg',
        }),
      );
      const result = run(dir);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('must end with');
      expect(result.stdout).toContain('map-site-status.mjs can match it');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts the overlay screenshot name the ledger actually produces', () => {
    const dir = setupProject();
    try {
      writeSiteMap(
        dir,
        siteMapWithOverlay({
          screenshot: 'artifacts/site-map/screenshots/root-overlay-1--route-home.jpg',
        }),
      );
      expect(run(dir).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an unknown dismissal method rather than storing an invented one', () => {
    const dir = setupProject();
    try {
      writeSiteMap(
        dir,
        siteMapWithOverlay({ dismissal: { method: 'wished-it-away', verified: true } }),
      );
      const result = run(dir);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('dismissal.method must be one of');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scripts/validate-site-map.mjs (real execution)', () => {
  it('passes validation for a well-formed multi-route fixture with every optional field present', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, wellFormedSiteMap());
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Zero-Config Default Verification: the minimal shape (only the schema's required fields) must
  // pass on its own, not just the fixture with every optional field populated.
  it('passes validation for the minimal shape with every optional field absent', () => {
    const dir = setupProject();
    try {
      writeSiteMap(dir, minimalSiteMap());
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
      writeFileSync(join(dir, 'artifacts', 'site-map', 'site-map.json'), 'null', 'utf8');
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

  it('fails cleanly when the file is missing entirely', () => {
    const dir = setupProject();
    try {
      const result = run(dir);
      expect(result.status).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('not found at'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when schemaVersion is missing', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, unknown>;
      delete bad.schemaVersion;
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('schemaVersion'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when schemaVersion is the older value 1 instead of 2', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, unknown>;
      bad.schemaVersion = 1;
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('schemaVersion'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when routes is an array instead of an object', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, unknown>;
      bad.routes = [];
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('routes must be an object'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on a route entry missing routeId', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap());
      delete (bad.routes['/checkout'] as Record<string, unknown>).routeId;
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('.routeId must be a non-empty string')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The join key route intent.json relies on - a duplicate routeId across two different path
  // templates would make that join ambiguous, so this must be a mechanical failure, not a
  // theoretical concern left to prose.
  it('fails on two route entries sharing the same routeId', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap());
      (bad.routes['/account'] as Record<string, unknown>).routeId = 'route-checkout';
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('is not unique'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on an empty sampleUrls array', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap());
      (bad.routes['/checkout'] as Record<string, unknown>).sampleUrls = [];
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('.sampleUrls must be a non-empty array')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on an invalid status enum value', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap());
      (bad.routes['/checkout'] as Record<string, unknown>).status = 'deprecated';
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('.status must be one of active|removed')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on an invalid coverage.boundedBy enum value', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, unknown>;
      bad.coverage = { boundedBy: 'maxTime', pagesVisited: 10 };
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('coverage.boundedBy must be one of')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on a non-integer coverage.pagesVisited', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, unknown>;
      bad.coverage = { boundedBy: 'maxPages', pagesVisited: '10' };
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('coverage.pagesVisited must be an integer')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on sharedWidgets containing a non-string entry', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, unknown>;
      bad.sharedWidgets = ['Navbar', 42];
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('sharedWidgets, when present, must be')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-1: screenshot path validation (positive & negative battery)
  it('passes validation when a route defines a valid screenshot path (.jpg, .jpeg, .webp)', () => {
    const dir = setupProject();
    try {
      const data = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      data.routes['/checkout'].screenshot = 'artifacts/site-map/screenshots/route-checkout.jpg';
      data.routes['/account'].screenshot = 'artifacts/site-map/screenshots/route-account.webp';
      writeSiteMap(dir, data);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when screenshot contains path traversal (..)', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].screenshot = 'artifacts/site-map/screenshots/../escaped.jpg';
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.screenshot, when present, must be a relative path'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when screenshot contains Windows backslashes', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].screenshot = 'artifacts\\site-map\\screenshots\\route-checkout.jpg';
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.screenshot, when present, must be a relative path'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when screenshot is an absolute path or outside directory', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].screenshot = '/etc/passwd.jpg';
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.screenshot, when present, must be a relative path'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when screenshot is a base64 data URI', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].screenshot =
        'artifacts/site-map/screenshots/data:image/jpeg;base64,/9j/4AAQSkZJRg==.jpg';
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.screenshot, when present, must be a relative path'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when screenshot has an unsupported extension (.png, .exe)', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].screenshot = 'artifacts/site-map/screenshots/route-checkout.png';
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.screenshot, when present, must be a relative path'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when screenshot is empty string or non-string', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].screenshot = '';
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.screenshot, when present, must be a non-empty string'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-2: visualTriage validation (positive & negative battery)
  it('passes validation for full and minimal valid visualTriage objects', () => {
    const dir = setupProject();
    try {
      const data = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      data.routes['/checkout'].visualTriage = {
        state: 'auth_wall',
        blockingOverlay: true,
        confidence: 'high',
        flags: ['session_expired', 'cookie_banner'],
      };
      data.routes['/account'].visualTriage = {
        state: 'ready',
      };
      writeSiteMap(dir, data);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when visualTriage is not an object (null or array)', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].visualTriage = null;
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.visualTriage, when present, must be an object'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when visualTriage.state is invalid or missing', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].visualTriage = { state: 'broken' };
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) => e.includes('.visualTriage.state must be one of')),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when visualTriage.blockingOverlay is not a boolean', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].visualTriage = { state: 'ready', blockingOverlay: 'yes' };
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.visualTriage.blockingOverlay, when present, must be a boolean'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when visualTriage.confidence is invalid', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].visualTriage = { state: 'ready', confidence: 'ultra' };
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.visualTriage.confidence, when present, must be one of'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts visualTriage.source, which says whether a worker or a heuristic classified the page', () => {
    const dir = setupProject();
    try {
      const data = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      data.routes['/checkout'].visualTriage = { state: 'ready', source: 'vision' };
      data.routes['/account'].visualTriage = { state: 'empty_state', source: 'heuristic' };
      writeSiteMap(dir, data);
      const output = JSON.parse(run(dir).stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when visualTriage.source is not one of the two things that can produce a triage', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].visualTriage = { state: 'ready', source: 'intuition' };
      writeSiteMap(dir, bad);
      const output = JSON.parse(run(dir).stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.visualTriage.source, when present, must be one of heuristic|vision'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts redirectedFrom naming the paths that land on a route', () => {
    const dir = setupProject();
    try {
      const data = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      data.routes['/checkout'].redirectedFrom = ['/old-checkout', '/cart/finish'];
      writeSiteMap(dir, data);
      const output = JSON.parse(run(dir).stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on an empty redirectedFrom, which should simply be absent', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].redirectedFrom = [];
      writeSiteMap(dir, bad);
      const output = JSON.parse(run(dir).stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('omit it entirely'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a route claims it redirects to itself, which records nothing', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].redirectedFrom = ['/checkout'];
      writeSiteMap(dir, bad);
      const output = JSON.parse(run(dir).stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('own key'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when redirectedFrom repeats a path', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].redirectedFrom = ['/old', '/old'];
      writeSiteMap(dir, bad);
      const output = JSON.parse(run(dir).stdout);
      expect(output.status).toBe('FAILED');
      expect(output.errors.some((e: string) => e.includes('must not repeat'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // discoveryMethod decides whether the content-hash heuristic may call a route a phantom, so a
  // typo in it silently changes which routes can be flagged - the validator has always read the
  // field but never checked it.
  it('fails when discoveryMethod is not one of the two ways a route can be found', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].discoveryMethod = 'navigaton';
      writeSiteMap(dir, bad);
      const output = JSON.parse(run(dir).stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.discoveryMethod, when present, must be one of navigation|href-scan-only'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes validation when a route defines both screenshot and visualTriage simultaneously', () => {
    const dir = setupProject();
    try {
      const data = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      data.routes['/checkout'].screenshot = 'artifacts/site-map/screenshots/checkout-route.webp';
      data.routes['/checkout'].visualTriage = {
        state: 'ready',
        blockingOverlay: false,
        confidence: 'high',
        flags: ['hero-visible'],
      };
      writeSiteMap(dir, data);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('PASSED');
      expect(output.errors).toEqual([]);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when screenshot contains URL-encoded traversal (%2e%2e)', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].screenshot = 'artifacts/site-map/screenshots/%2e%2e/escaped.jpg';
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.screenshot, when present, must be a relative path'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when screenshot contains a Windows drive letter (C:/...)', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].screenshot = 'C:/artifacts/site-map/screenshots/checkout.jpg';
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.screenshot, when present, must be a relative path'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when routeId contains invalid characters or exceeds 128 characters', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].routeId = 'route/with/slashes';
      writeSiteMap(dir, bad);
      let result = run(dir);
      let output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.routeId must match ^[a-zA-Z0-9_-]+$ with max length 128.'),
        ),
      ).toBe(true);

      bad.routes['/checkout'].routeId = 'a'.repeat(129);
      writeSiteMap(dir, bad);
      result = run(dir);
      output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.routeId must match ^[a-zA-Z0-9_-]+$ with max length 128.'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when visualTriage contains unrecognized additional properties', () => {
    const dir = setupProject();
    try {
      const bad = structuredClone(wellFormedSiteMap()) as Record<string, any>;
      bad.routes['/checkout'].visualTriage = {
        state: 'ready',
        unrecognizedKey: 'malicious payload',
      };
      writeSiteMap(dir, bad);
      const result = run(dir);
      const output = JSON.parse(result.stdout);
      expect(output.status).toBe('FAILED');
      expect(
        output.errors.some((e: string) =>
          e.includes('.visualTriage has unrecognized properties: unrecognizedKey'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('crawler screenshot feature integration & prompt invariants', () => {
  it('excludes artifacts/site-map/screenshots/ from git across all stack profiles', () => {
    const pwTs = renderGitignore('playwright', 'typescript');
    const cypress = renderGitignore('cypress', 'typescript');
    const pytest = renderGitignore('pytest', 'python');
    const csharp = renderGitignore('playwright', 'csharp');
    const java = renderGitignore('playwright', 'java');

    expect(pwTs).toContain('artifacts/site-map/screenshots/');
    expect(cypress).toContain('artifacts/site-map/screenshots/');
    expect(pytest).toContain('artifacts/site-map/screenshots/');
    expect(csharp).toContain('artifacts/site-map/screenshots/');
    expect(java).toContain('artifacts/site-map/screenshots/');
  });

  it('specifies in-situ screenshot capture, bounded readiness gate, visual triage, and update self-healing in /map-site skill', () => {
    const skills = planAiOperationalSkills(['antigravity'], 'playwright', 'typescript');
    const mapSiteSkill = skills.find((s) => s.path.includes('map-site'));
    expect(mapSiteSkill).toBeDefined();
    const content = (mapSiteSkill!.source as { kind: 'inline'; text: string }).text;

    // Viewport and format
    expect(content).toContain('1280x800 viewport');
    expect(content).toContain("scale: 'css'");
    expect(content).toContain("caret: 'hide'");
    expect(content).toContain('fullPage: false');

    // Security Guard
    expect(content).toContain('Security & Context Guard: NEVER inline base64 image strings');

    // Readiness gate & safe-fail
    expect(content).toContain('max aggregate budget: 3000ms');
    expect(content).toContain('domcontentloaded');
    expect(content).toContain('Promise.allSettled');
    expect(content).toContain('document.fonts?.ready');
    expect(content).toContain(".first().waitFor({ state: 'detached', timeout: 1200 })");
    expect(content).toContain('requestAnimationFrame');
    expect(content).toContain('Safe-Fail Boundary');
    // Screenshots carry a human-readable path slug ahead of the stable routeId, so a directory
    // listing can be matched to pages by eye instead of being a wall of UUIDs.
    expect(content).toContain('artifacts/site-map/screenshots/<slug>--<routeId>.jpg');
    expect(content).toContain('Never use the slug alone');

    // Visual triage. The markup heuristics may raise a flag and observe a blocking overlay; the
    // three failure states are reached only from the HTTP status the server actually returned,
    // after a live run showed these proxies wrong six times out of eight.
    expect(content).toContain('Selective Visual Triage Gate');
    expect(content).toContain('may never set `state` to anything but `ready`');
    expect(content).toContain('no-interactive-elements');
    expect(content).toContain('may reach those three states on its own');
    expect(content).toContain('blockingOverlay');

    // Self-healing update mode
    expect(content).toContain(
      'Check self-healing: if `screenshot` is missing from the route entry OR the referenced file is absent on disk (`!fs.existsSync(path.resolve(process.cwd(), screenshot))`',
    );
  });

  it('specifies Selective Vision and forbids base64 inlining in pom-engineer agent prompt', () => {
    const agents = planAiAgents(['antigravity'], 'playwright', 'typescript');
    const pomAgent = agents.find((a) => a.path.includes('pom-engineer'));
    expect(pomAgent).toBeDefined();
    const content = (pomAgent!.source as { kind: 'inline'; text: string }).text;

    expect(content).toContain('Selective Vision & Visual Baseline Integration');
    // The file name carries the path slug as well as the routeId, so a human can tell which page a
    // screenshot shows without cross-referencing UUIDs - the agent must be told the real shape.
    expect(content).toContain('<path slug>--<routeId>');
    expect(content).toContain('NEVER inline base64 image strings');
    expect(content).toContain('visualTriage.blockingOverlay');
    // A triage the cheap markup heuristic produced is worth far less than one a worker actually
    // looked at, and the agent has to know which it is holding.
    expect(content).toContain('visualTriage.source');
    expect(content).toContain('still-rendering-at-capture');
  });
});
