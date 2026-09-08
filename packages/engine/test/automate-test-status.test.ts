import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderAutomateTestStatus } from '../src/plan/templates/automate-test-status.js';

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-automate-test-status-'));
  writeFileSync(join(dir, 'automate-test-status.mjs'), renderAutomateTestStatus(), 'utf8');
  return dir;
}

function writeJson(dir: string, relPath: string, data: unknown) {
  const full = join(dir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, JSON.stringify(data, null, 2), 'utf8');
}

function run(dir: string) {
  const result = spawnSync('node', ['automate-test-status.mjs'], { cwd: dir, encoding: 'utf8' });
  return JSON.parse(result.stdout);
}

function tmsBridgeServer(taskTracker: string, tmsProviders: string) {
  return {
    command: 'node',
    args: ['.mcp/tms-bridge/index.js'],
    env: {
      TASK_TRACKER: taskTracker,
      TMS_PROVIDERS: tmsProviders,
      HTTP_PROXY: '${env:HTTP_PROXY}',
      HTTPS_PROXY: '${env:HTTPS_PROXY}',
    },
  };
}

describe('scripts/automate-test-status.mjs (real execution)', () => {
  it('reports no providers and zero local drafts with nothing on disk', () => {
    const dir = setupProject();
    try {
      const output = run(dir);
      expect(output).toEqual({
        providers: [],
        providerCount: 0,
        tmsConfigured: false,
        localDraftsCount: 0,
        localDraftsExist: false,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('extracts taskTracker + tmsProviders from .mcp.json (Claude/Copilot shared path)', () => {
    const dir = setupProject();
    try {
      writeJson(dir, '.mcp.json', {
        mcpServers: { 'tms-bridge': tmsBridgeServer('jira', 'xray') },
      });
      const output = run(dir);
      expect(output.providers.sort()).toEqual(['jira', 'xray']);
      expect(output.providerCount).toBe(2);
      expect(output.tmsConfigured).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('deduplicates when taskTracker and a tmsProvider are the same value', () => {
    const dir = setupProject();
    try {
      writeJson(dir, '.mcp.json', {
        mcpServers: { 'tms-bridge': tmsBridgeServer('jira', 'jira') },
      });
      const output = run(dir);
      expect(output.providers).toEqual(['jira']);
      expect(output.providerCount).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats TASK_TRACKER "none" as no task tracker, and empty TMS_PROVIDERS as no TMS providers', () => {
    const dir = setupProject();
    try {
      writeJson(dir, '.mcp.json', {
        mcpServers: { 'tms-bridge': tmsBridgeServer('none', '') },
      });
      const output = run(dir);
      expect(output.providers).toEqual([]);
      expect(output.tmsConfigured).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to .agents/mcp_config.json when .mcp.json is absent', () => {
    const dir = setupProject();
    try {
      writeJson(dir, join('.agents', 'mcp_config.json'), {
        mcpServers: { 'tms-bridge': tmsBridgeServer('azure-devops', 'testrail') },
      });
      const output = run(dir);
      expect(output.providers.sort()).toEqual(['azure-devops', 'testrail']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to .vscode/mcp.json using its own "servers" key (not "mcpServers")', () => {
    const dir = setupProject();
    try {
      writeJson(dir, join('.vscode', 'mcp.json'), {
        servers: { 'tms-bridge': { type: 'stdio', ...tmsBridgeServer('jira', 'zephyr') } },
      });
      const output = run(dir);
      expect(output.providers.sort()).toEqual(['jira', 'zephyr']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('extracts TASK_TRACKER/TMS_PROVIDERS from .codex/config.toml', () => {
    const dir = setupProject();
    try {
      const toml = `[mcp_servers.playwright]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-playwright"]

[mcp_servers.tms-bridge]
command = "node"
args = [".mcp/tms-bridge/index.js"]
env_vars = ["HTTP_PROXY", "HTTPS_PROXY"]

[mcp_servers.tms-bridge.env]
TASK_TRACKER = "jira"
TMS_PROVIDERS = "xray,zephyr"
`;
      mkdirSync(join(dir, '.codex'), { recursive: true });
      writeFileSync(join(dir, '.codex', 'config.toml'), toml, 'utf8');
      const output = run(dir);
      expect(output.providers.sort()).toEqual(['jira', 'xray', 'zephyr']);
      expect(output.providerCount).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('extracts TASK_TRACKER/TMS_PROVIDERS from .codex/config.toml with CRLF line endings', () => {
    const dir = setupProject();
    try {
      const toml = [
        '[mcp_servers.playwright]',
        'command = "npx"',
        'args = ["-y", "@modelcontextprotocol/server-playwright"]',
        '',
        '[mcp_servers.tms-bridge]',
        'command = "node"',
        'args = [".mcp/tms-bridge/index.js"]',
        'env_vars = ["HTTP_PROXY", "HTTPS_PROXY"]',
        '',
        '[mcp_servers.tms-bridge.env]',
        'TASK_TRACKER = "jira"',
        'TMS_PROVIDERS = "xray,zephyr"',
        '',
      ].join('\r\n');
      mkdirSync(join(dir, '.codex'), { recursive: true });
      writeFileSync(join(dir, '.codex', 'config.toml'), toml, 'utf8');
      const output = run(dir);
      expect(output.providers.sort()).toEqual(['jira', 'xray', 'zephyr']);
      expect(output.providerCount).toBe(3);
      expect(output.tmsConfigured).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('counts un-automated local drafts and ignores already-reviewed journeys', () => {
    const dir = setupProject();
    try {
      writeJson(dir, join('artifacts', 'test-cases', 'test-cases.json'), {
        schemaVersion: 2,
        generatedAt: '2026-09-06T10:00:00.000Z',
        journeys: {
          j1: {
            journeyId: 'j1',
            routeIds: ['route-checkout'],
            testInterface: 'ui',
            breadth: 'targeted',
            testCase: { title: 'A' },
            reviewed: false,
          },
          j2: {
            journeyId: 'j2',
            routeIds: ['route-checkout'],
            testInterface: 'api',
            breadth: 'targeted',
            testCase: { title: 'B' },
            reviewed: true,
          },
          j3: {
            journeyId: 'j3',
            routeIds: ['route-checkout'],
            testInterface: 'ui',
            breadth: 'targeted',
            reviewed: false,
          },
          j4: {
            journeyId: 'j4',
            routeIds: ['route-checkout', 'route-account'],
            featureId: 'feature-checkout',
            testInterface: 'ui',
            breadth: 'e2e',
            testCase: { title: 'C' },
            reviewed: false,
          },
        },
      });
      const output = run(dir);
      // j1 and j4 qualify (testCase present, reviewed:false); j2 is already reviewed; j3 has no
      // testCase yet (still mid-draft) - neither counts as an un-automated draft.
      expect(output.localDraftsCount).toBe(2);
      expect(output.localDraftsExist).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports zero drafts when test-cases.json is missing or malformed', () => {
    const dir = setupProject();
    try {
      const missingOutput = run(dir);
      expect(missingOutput.localDraftsCount).toBe(0);

      mkdirSync(join(dir, 'artifacts', 'test-cases'), { recursive: true });
      writeFileSync(
        join(dir, 'artifacts', 'test-cases', 'test-cases.json'),
        'not valid json',
        'utf8',
      );
      const malformedOutput = run(dir);
      expect(malformedOutput.localDraftsCount).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
