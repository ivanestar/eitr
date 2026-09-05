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

  // The join key business-intent.json relies on - a duplicate routeId across two different path
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
    expect(content).toContain('artifacts/site-map/screenshots/<routeId>.jpg');

    // Visual triage states
    expect(content).toContain('Selective Visual Triage Gate');
    expect(content).toContain(
      'ready` | `auth_wall` | `access_denied` | `error_page` | `empty_state',
    );
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
    expect(content).toContain('artifacts/site-map/screenshots/<routeId>');
    expect(content).toContain('NEVER inline base64 image strings');
    expect(content).toContain('visualTriage.blockingOverlay');
  });
});
