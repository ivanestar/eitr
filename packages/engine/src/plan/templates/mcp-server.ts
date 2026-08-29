// Generator for embedded zero-lock-in MCP Stdio server, test runner bridge, and multi-TMS adapters.
import type { FileDescriptor } from '../../types/generation-plan.js';

export function planMcpServer(
  taskTracker: string = 'none',
  tmsProviders: readonly string[] = [],
  aiAssistants?: readonly string[],
  automationTool: string = 'playwright',
  language: string = 'typescript',
): FileDescriptor[] {
  const hasTaskTracker = taskTracker && taskTracker !== 'none';
  const hasTms = hasTaskTracker || tmsProviders.length > 0;
  const hasAssistants = aiAssistants && aiAssistants.length > 0;

  if (!hasTms && !hasAssistants) {
    return [];
  }

  const isCypress = automationTool.toLowerCase().includes('cypress');
  const isPython = language === 'python';
  const isDotnet = language === 'csharp';
  const isJava = language === 'java';

  const runnerCmd = isCypress
    ? 'npx cypress run --spec'
    : isPython
      ? 'pytest'
      : isDotnet
        ? 'dotnet test'
        : isJava
          ? 'mvn test'
          : 'npx playwright test';

  const indexCode = `#!/usr/bin/env node
// Zero-lock-in embedded MCP Stdio Server for Test Automation & TMS Bridge
// Communicates over standard IO (stdio) using standard JSON-RPC 2.0 (Model Context Protocol)

import { getAdapter } from './adapters.js';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const TASK_TRACKER = process.env.TASK_TRACKER || '${taskTracker}';
const TMS_PROVIDERS = (process.env.TMS_PROVIDERS || '${tmsProviders.join(',')}')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// Deduplicated set of every provider this bridge is wired for (task tracker + every selected
// TMS). mcp__tms__* tools take an optional 'provider' argument that must be one of these;
// when exactly one provider is configured it's used automatically.
const CONFIGURED_PROVIDERS = Array.from(
  new Set([...(TASK_TRACKER && TASK_TRACKER !== 'none' ? [TASK_TRACKER] : []), ...TMS_PROVIDERS])
);
const CACHE_DIR = join(process.cwd(), '.tms-cache');

function resolveProvider(explicit) {
  if (explicit) {
    if (!CONFIGURED_PROVIDERS.includes(explicit)) {
      return { error: \`Provider "\${explicit}" is not configured. Configured providers: \${CONFIGURED_PROVIDERS.join(', ') || 'none'}\` };
    }
    return { provider: explicit };
  }
  if (CONFIGURED_PROVIDERS.length === 1) return { provider: CONFIGURED_PROVIDERS[0] };
  if (CONFIGURED_PROVIDERS.length === 0) return { error: 'No task tracker or TMS provider is configured.' };
  return { error: \`Multiple providers are configured (\${CONFIGURED_PROVIDERS.join(', ')}) — pass "provider" to disambiguate.\` };
}

// Dual-era MCP server (spec 2026-07-28): serves legacy 'initialize'-handshake clients
// (2025-11-25 and earlier) unchanged, and modern clients that declare their protocol
// version per-request via params._meta['io.modelcontextprotocol/protocolVersion'].
const SUPPORTED_PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25'];
const SERVER_INFO = { name: 'tms-bridge', version: '1.0.0' };

function logDebug(msg) {
  if (process.env.DEBUG_MCP) {
    process.stderr.write(\`[TMS-BRIDGE] \${msg}\\n\`);
  }
}

function ensureCacheDir() {
  try {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
  } catch (err) {
    logDebug(\`Failed to create cache directory: \${err.message}\`);
  }
}

// Cache files are namespaced by provider so the same case id (e.g. a short numeric TestRail id)
// can't collide with an unrelated id from a different configured provider.
function cacheFile(provider, caseId) {
  const safeId = \`\${provider}_\${String(caseId)}\`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(CACHE_DIR, \`\${safeId}.json\`);
}

function getCachedCase(provider, caseId) {
  try {
    const file = cacheFile(provider, caseId);
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf8'));
    }
  } catch (err) {
    logDebug(\`Cache read error for \${caseId}: \${err.message}\`);
  }
  return null;
}

function saveCachedCase(provider, caseId, data) {
  try {
    ensureCacheDir();
    writeFileSync(cacheFile(provider, caseId), JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    logDebug(\`Cache write error for \${caseId}: \${err.message}\`);
  }
}

function invalidateCachedCase(provider, caseId) {
  try {
    const file = cacheFile(provider, caseId);
    if (existsSync(file)) unlinkSync(file);
  } catch (err) {
    logDebug(\`Cache invalidate error for \${caseId}: \${err.message}\`);
  }
}

function executeTestRun(args) {
  const specPath = args.specPath;
  const project = args.project ? \`--project=\${args.project}\` : '';
  const headed = args.headed ? '--headed' : '';
  const timeout = args.timeoutMs || 60000;

  const cmdLine = \`${runnerCmd} \${specPath} \${project} \${headed}\`.trim();
  logDebug(\`Executing test command: \${cmdLine}\`);

  const startTime = Date.now();
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  const flag = process.platform === 'win32' ? '/c' : '-c';

  const res = spawnSync(shell, [flag, cmdLine], {
    encoding: 'utf8',
    timeout,
    maxBuffer: 10 * 1024 * 1024,
  });

  const durationMs = Date.now() - startTime;
  const isTimedOut = res.error && res.error.code === 'ETIMEDOUT';
  const exitCode = isTimedOut ? 124 : (res.status ?? (res.error ? 1 : 0));
  const status = exitCode === 0 ? 'passed' : (isTimedOut ? 'timedOut' : 'failed');

  let tracePath = null;
  try {
    const resultsDir = join(process.cwd(), 'test-results');
    if (existsSync(resultsDir)) {
      const files = readdirSync(resultsDir, { recursive: true });
      const found = files.find(f => String(f).endsWith('.zip') || String(f).endsWith('trace.zip'));
      if (found) tracePath = join('test-results', String(found));
    }
  } catch {}

  return {
    status,
    exitCode,
    durationMs,
    tracePath,
    stdout: res.stdout || '',
    stderr: res.stderr || (res.error ? res.error.message : '')
  };
}

function handleToolsList() {
  const tools = [
    {
      name: 'mcp__run_test',
      description: 'Executes an isolated test spec file and returns execution status, logs, duration, and trace path.',
      inputSchema: {
        type: 'object',
        properties: {
          specPath: { type: 'string', description: 'Relative path to test spec file (e.g. "tests/TC-1042.spec.ts")' },
          project: { type: 'string', description: 'Optional project name (e.g. "chromium")' },
          headed: { type: 'boolean', description: 'Run in headed browser mode' },
          timeoutMs: { type: 'number', description: 'Timeout in ms (default 60000)' }
        },
        required: ['specPath']
      }
    },
    {
      name: 'mcp__inspect_dom',
      description: 'Heuristic locator-naming suggester for a route (naming-convention only — does NOT open a browser or read the live DOM). Use the embedded Playwright MCP server (or the pom-engineer agent) for a real, live-DOM-verified locator.',
      inputSchema: {
        type: 'object',
        properties: {
          route: { type: 'string', description: 'Target route (e.g. "/login", "/dashboard")' },
          selector: { type: 'string', description: 'Optional sub-selector hint used to refine the suggested locator name' }
        },
        required: ['route']
      }
    }
  ];

  if (CONFIGURED_PROVIDERS.length > 0) {
    tools.push(
      {
        name: 'mcp__tms__get_test_case',
        description: 'Fetch details of a specific test case from the configured TMS.',
        inputSchema: {
          type: 'object',
          properties: {
            caseId: { type: 'string', description: 'The ID or key of the test case' }
          },
          required: ['caseId']
        }
      },
      {
        name: 'mcp__tms__get_suite_context',
        description: 'List the test cases contained in a suite/section/folder. ADO: needs planId too. TestRail: section id. Xray: Test Plan issue key. Zephyr: Test Cycle key. Not applicable to plain Jira.',
        inputSchema: {
          type: 'object',
          properties: {
            suiteId: { type: 'string', description: 'Suite / section id, Test Plan key, or Test Cycle key, depending on provider' },
            planId: { type: 'string', description: 'Azure DevOps only — the parent Test Plan id (falls back to AZURE_DEVOPS_PLAN_ID env var)' }
          },
          required: ['suiteId']
        }
      },
      {
        name: 'mcp__tms__list_test_plans',
        description: 'List test plans (Azure DevOps, Xray) or test cycles (Zephyr — the closest equivalent; TestRail test plans are also supported). Not applicable to plain Jira.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Optional JQL filter (Xray only); ignored by other providers' },
            maxResults: { type: 'number', description: 'Maximum number of results (default 25)' }
          }
        }
      },
      {
        name: 'mcp__tms__create_test_run',
        description: 'Create a new test run / test cycle to publish results into via mcp__tms__post_test_result. For Xray, this creates a Test Execution issue directly (Test Executions ARE Jira issues).',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Run / cycle / Test Execution name' },
            planId: { type: 'string', description: 'Azure DevOps only — parent Test Plan id (falls back to AZURE_DEVOPS_PLAN_ID env var)' },
            suiteId: { type: 'string', description: 'TestRail only — suite id the run covers (falls back to TESTRAIL_SUITE_ID env var)' },
            projectKey: { type: 'string', description: 'Xray/Zephyr only — project key override' }
          },
          required: ['name']
        }
      },
      {
        name: 'mcp__tms__post_test_result',
        description: 'Publish execution results, status, and failure comments back to TMS.',
        inputSchema: {
          type: 'object',
          properties: {
            caseId: { type: 'string', description: 'Test Case ID' },
            status: { type: 'string', enum: ['passed', 'failed', 'skipped', 'blocked'], description: 'Execution status' },
            comment: { type: 'string', description: 'Execution log or failure summary' },
            durationMs: { type: 'number', description: 'Execution duration in milliseconds' },
            testExecutionKey: { type: 'string', description: 'Xray Test Execution issue key (Xray only; falls back to XRAY_TEST_EXECUTION_KEY env var)' },
            testPointId: { type: 'string', description: 'Azure DevOps test point id (ADO only; falls back to AZURE_DEVOPS_TEST_POINT_ID env var)' }
          },
          required: ['caseId', 'status']
        }
      },
      {
        name: 'mcp__tms__search',
        description: 'Search or list tickets/test cases in the configured TMS (JQL for Jira/Xray, WIQL for Azure DevOps, plain-text title filter for TestRail/Zephyr).',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'JQL/WIQL query, or a plain-text filter — depends on the provider; omit to list recent items' },
            maxResults: { type: 'number', description: 'Maximum number of results (default 25)' }
          }
        }
      },
      {
        name: 'mcp__tms__create_issue',
        description: 'Create a new ticket (Jira/Xray/Azure DevOps issue) or test case (TestRail/Zephyr) in the configured TMS.',
        inputSchema: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: 'Title / summary' },
            description: { type: 'string', description: 'Plain-text description / objective' },
            issueType: { type: 'string', description: 'Jira/Xray/ADO only — e.g. "Bug", "Task", "Story" (default "Bug"). Ignored for TestRail/Zephyr, which always create a test case.' },
            projectKey: { type: 'string', description: 'Jira/Xray/Zephyr project key override (falls back to JIRA_PROJECT_KEY / ZEPHYR_PROJECT_KEY env var)' },
            sectionId: { type: 'string', description: 'TestRail section id override (falls back to TESTRAIL_SECTION_ID env var)' }
          },
          required: ['summary']
        }
      },
      {
        name: 'mcp__tms__update_issue',
        description: 'Update the summary, description, and/or status of an existing ticket/test case in the configured TMS.',
        inputSchema: {
          type: 'object',
          properties: {
            caseId: { type: 'string', description: 'Issue key / test case ID to update' },
            summary: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', description: 'Jira/Xray — must match an available workflow transition name. Azure DevOps — a valid System.State value. Ignored for TestRail/Zephyr (use mcp__tms__post_test_result for execution status instead).' }
          },
          required: ['caseId']
        }
      },
      {
        name: 'mcp__tms__delete_issue',
        description: 'Delete a ticket/test case in the configured TMS. Not available for Zephyr Scale (no public delete endpoint) or Xray Server/DC (unverified) — both return an explicit error rather than silently no-op.',
        inputSchema: {
          type: 'object',
          properties: {
            caseId: { type: 'string', description: 'Issue key / test case ID to delete' }
          },
          required: ['caseId']
        }
      }
    );
    // Every mcp__tms__* tool takes an optional 'provider' argument — required only when more
    // than one provider (task tracker + TMS selections) is configured for this bridge.
    const providerDescription =
      CONFIGURED_PROVIDERS.length > 1
        ? \`Which configured provider to target — REQUIRED since multiple are configured (\${CONFIGURED_PROVIDERS.join(', ')}).\`
        : \`Which configured provider to target (optional — defaults to the sole configured provider "\${CONFIGURED_PROVIDERS[0] || 'none'}").\`;
    for (const tool of tools) {
      if (tool.name.indexOf('mcp__tms__') === 0) {
        tool.inputSchema.properties.provider = {
          type: 'string',
          enum: CONFIGURED_PROVIDERS,
          description: providerDescription
        };
      }
    }
  }

  return { tools };
}

async function handleToolCall(name, args) {
  try {
    if (name === 'mcp__run_test') {
      const result = executeTestRun(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'mcp__inspect_dom') {
      const routeSlug = args.route.replace(/\\//g, '').replace(/[^a-zA-Z0-9_-]/g, '') || 'root';
      const selectorHint = args.selector ? args.selector.replace(/[^a-zA-Z0-9_-]/g, '') : null;
      const snapshot = {
        route: args.route,
        status: 'heuristic',
        note: 'Naming-convention suggestion only. Not derived from a live DOM read — verify against the actual page (e.g. via the playwright MCP server or the pom-engineer agent) before using in a Page Object.',
        suggestedLocators: [
          { priority: 'tier-1', locator: \`getByTestId('\${routeSlug}-container')\` },
          { priority: 'tier-2', locator: 'getByRole("main")' },
          ...(selectorHint ? [{ priority: 'tier-3', locator: \`getByLabel('\${selectorHint}')\` }] : [])
        ]
      };
      return { content: [{ type: 'text', text: JSON.stringify(snapshot, null, 2) }] };
    }
    if (name.indexOf('mcp__tms__') === 0) {
      const resolved = resolveProvider(args.provider);
      if (resolved.error) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: resolved.error }, null, 2) }], isError: true };
      }
      const provider = resolved.provider;
      const adapter = getAdapter(provider);

      if (name === 'mcp__tms__get_test_case') {
        const cached = getCachedCase(provider, args.caseId);
        if (cached) {
          logDebug(\`Serving case \${args.caseId} from local cache\`);
          return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
        }
        const data = await adapter.getTestCase(args.caseId);
        if (data && !data.error) {
          saveCachedCase(provider, args.caseId, data);
        }
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      if (name === 'mcp__tms__get_suite_context') {
        const data = await adapter.getSuiteCases(args.suiteId, args);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      if (name === 'mcp__tms__list_test_plans') {
        const data = await adapter.listTestPlans(args.query, args.maxResults);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      if (name === 'mcp__tms__create_test_run') {
        const data = await adapter.createTestRun(args);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      if (name === 'mcp__tms__post_test_result') {
        const res = await adapter.postTestResult(args);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }
      if (name === 'mcp__tms__search') {
        const data = await adapter.searchIssues(args.query, args.maxResults);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      if (name === 'mcp__tms__create_issue') {
        const data = await adapter.createIssue(args);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      if (name === 'mcp__tms__update_issue') {
        const { caseId, provider: _p, ...fields } = args;
        const data = await adapter.updateIssue(caseId, fields);
        if (data && !data.error) invalidateCachedCase(provider, caseId);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      if (name === 'mcp__tms__delete_issue') {
        const data = await adapter.deleteIssue(args.caseId);
        if (data && !data.error) invalidateCachedCase(provider, args.caseId);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    }
    throw new Error(\`Unknown tool: \${name}\`);
  } catch (err) {
    return { content: [{ type: 'text', text: \`Error: \${err.message}\` }], isError: true };
  }
}

function sendResponse(response) {
  const json = JSON.stringify(response);
  process.stdout.write(json + '\\n');
}

// Simple JSON-RPC stdio reader
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const req = JSON.parse(line);
      logDebug(\`Received: \${req.method}\`);

      const requestedVersion = req.params && req.params._meta &&
        req.params._meta['io.modelcontextprotocol/protocolVersion'];

      if (req.method === 'initialize') {
        // Legacy handshake path (protocol revisions 2025-11-25 and earlier).
        sendResponse({
          jsonrpc: '2.0',
          id: req.id,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO
          }
        });
      } else if (requestedVersion && !SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)) {
        // Modern per-request negotiation (2026-07-28+): reject unsupported versions.
        sendResponse({
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: -32022,
            message: 'Unsupported protocol version',
            data: { supported: SUPPORTED_PROTOCOL_VERSIONS, requested: requestedVersion }
          }
        });
      } else if (req.method === 'server/discover') {
        // Mandatory modern discovery RPC (spec 2026-07-28).
        sendResponse({
          jsonrpc: '2.0',
          id: req.id,
          result: {
            resultType: 'complete',
            supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
            capabilities: { tools: {} },
            _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO },
            instructions: 'Bridges Playwright test execution and TMS test-case/result operations over stdio JSON-RPC.'
          }
        });
      } else if (req.method === 'tools/list') {
        sendResponse({ jsonrpc: '2.0', id: req.id, result: handleToolsList() });
      } else if (req.method === 'tools/call') {
        const result = await handleToolCall(req.params.name, req.params.arguments || {});
        sendResponse({ jsonrpc: '2.0', id: req.id, result });
      } else if (req.id) {
        sendResponse({ jsonrpc: '2.0', id: req.id, result: {} });
      }
    } catch (e) {
      logDebug(\`Parse error: \${e.message}\`);
    }
  }
});
`;

  const adaptersCode = `// Universal Multi-TMS Adapter implementations
import { httpGet, httpPost, httpPut, httpPatch, httpDelete } from './http.js';

// Flattens an Atlassian Document Format (ADF) rich-text node (what Jira REST v3 returns for
// description/comment fields) into plain text. Falls back to the value itself if it's already
// a plain string (older API shapes), or '' if empty/absent.
function adfToPlainText(adf) {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;
  const parts = [];
  function walk(node) {
    if (!node) return;
    if (node.type === 'text') { parts.push(node.text || ''); return; }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
    }
    if (node.type === 'paragraph' || node.type === 'heading') parts.push('\\n');
  }
  walk(adf);
  return parts.join('').replace(/\\n{3,}/g, '\\n\\n').trim();
}

// Converts plain text into a minimal valid ADF document for writing back to Jira REST v3.
function plainTextToAdf(text) {
  const paragraphs = String(text || '').split(/\\n+/).filter(Boolean);
  return {
    type: 'doc',
    version: 1,
    content: paragraphs.length
      ? paragraphs.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }))
      : [{ type: 'paragraph', content: [] }]
  };
}

// Escapes a value for safe interpolation into a double-quoted GraphQL string literal
// (Xray Cloud queries below build JQL fragments via string interpolation).
function gqlEscape(str) {
  return String(str).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
}

// Generic Jira issue CRUD shared by the 'jira' and 'xray' adapters — Xray's Test/Test Execution/
// Test Plan issues ARE Jira issues, so generic field management goes through the same core Jira
// REST API v3 rather than Xray's specialized (steps/results) GraphQL surface.
function createJiraIssueCrud() {
  return {
    async searchIssues(query, maxResults) {
      const host = process.env.JIRA_HOST;
      const email = process.env.JIRA_EMAIL;
      const token = process.env.JIRA_API_TOKEN;
      if (!host || !email || !token) return { error: 'Missing Jira environment variables' };
      const authHeader = 'Basic ' + Buffer.from(\`\${email}:\${token}\`).toString('base64');
      const jql = query || 'ORDER BY created DESC';
      // GET /rest/api/3/search was removed by Atlassian (returns 410, migrate to /search/jql —
      // see https://developer.atlassian.com/changelog/#CHANGE-2046). The new endpoint only
      // returns 'id' unless 'fields' is explicitly requested, and paginates via nextPageToken
      // instead of startAt (not used here — a single page is enough for this tool's purpose).
      const url = \`\${host.replace(/\\/+$/, '')}/rest/api/3/search/jql?jql=\${encodeURIComponent(jql)}&maxResults=\${maxResults || 25}&fields=summary,status\`;
      const res = await httpGet(url, { Authorization: authHeader });
      if (res.status !== 200) return { error: \`Jira search error: \${res.status}\` };
      const results = (res.data.issues || []).map((i) => ({
        id: i.key,
        title: (i.fields && i.fields.summary) || '',
        status: (i.fields && i.fields.status && i.fields.status.name) || ''
      }));
      return { results };
    },
    async createIssue(fields) {
      const host = process.env.JIRA_HOST;
      const email = process.env.JIRA_EMAIL;
      const token = process.env.JIRA_API_TOKEN;
      const projectKey = fields.projectKey || process.env.JIRA_PROJECT_KEY;
      if (!host || !email || !token) return { error: 'Missing Jira environment variables' };
      if (!projectKey) return { error: 'Missing projectKey — pass fields.projectKey or set JIRA_PROJECT_KEY' };
      const authHeader = 'Basic ' + Buffer.from(\`\${email}:\${token}\`).toString('base64');
      const body = {
        fields: {
          project: { key: projectKey },
          summary: fields.summary || 'Untitled',
          issuetype: { name: fields.issueType || 'Bug' },
          ...(fields.description ? { description: plainTextToAdf(fields.description) } : {})
        }
      };
      const res = await httpPost(\`\${host.replace(/\\/+$/, '')}/rest/api/3/issue\`, body, { Authorization: authHeader });
      if (res.status !== 201 && res.status !== 200) return { error: \`Jira create error: \${res.status}\`, details: res.data };
      return { id: res.data.key, title: fields.summary || '' };
    },
    async updateIssue(caseId, fields) {
      const host = process.env.JIRA_HOST;
      const email = process.env.JIRA_EMAIL;
      const token = process.env.JIRA_API_TOKEN;
      if (!host || !email || !token) return { error: 'Missing Jira environment variables' };
      const authHeader = 'Basic ' + Buffer.from(\`\${email}:\${token}\`).toString('base64');
      const updateFields = {};
      if (fields.summary) updateFields.summary = fields.summary;
      if (fields.description) updateFields.description = plainTextToAdf(fields.description);
      if (Object.keys(updateFields).length === 0 && !fields.status) return { error: 'No fields to update' };
      if (Object.keys(updateFields).length > 0) {
        const res = await httpPut(\`\${host.replace(/\\/+$/, '')}/rest/api/3/issue/\${caseId}\`, { fields: updateFields }, { Authorization: authHeader });
        if (res.status !== 204) return { error: \`Jira update error: \${res.status}\` };
      }
      if (fields.status) {
        // Jira status changes go through the transitions endpoint, not a plain field PUT.
        const transRes = await httpGet(\`\${host.replace(/\\/+$/, '')}/rest/api/3/issue/\${caseId}/transitions\`, { Authorization: authHeader });
        const match = transRes.data && Array.isArray(transRes.data.transitions) &&
          transRes.data.transitions.find((t) => t.name.toLowerCase() === String(fields.status).toLowerCase());
        if (!match) return { error: \`Jira status "\${fields.status}" is not a valid transition from the current state\` };
        const transitionRes = await httpPost(\`\${host.replace(/\\/+$/, '')}/rest/api/3/issue/\${caseId}/transitions\`, { transition: { id: match.id } }, { Authorization: authHeader });
        if (transitionRes.status !== 204) return { error: \`Jira transition error: \${transitionRes.status}\` };
      }
      return { id: caseId, updated: true };
    },
    async deleteIssue(caseId) {
      const host = process.env.JIRA_HOST;
      const email = process.env.JIRA_EMAIL;
      const token = process.env.JIRA_API_TOKEN;
      if (!host || !email || !token) return { error: 'Missing Jira environment variables' };
      const authHeader = 'Basic ' + Buffer.from(\`\${email}:\${token}\`).toString('base64');
      const res = await httpDelete(\`\${host.replace(/\\/+$/, '')}/rest/api/3/issue/\${caseId}\`, { Authorization: authHeader });
      if (res.status !== 204) return { error: \`Jira delete error: \${res.status}\`, details: res.data };
      return { id: caseId, deleted: true };
    }
  };
}

function parseAdoXmlSteps(xml) {
  if (!xml || typeof xml !== 'string') return [];
  const steps = [];
  const stepRegex = /<step[^>]*>([\\s\\S]*?)<\\/step>/gi;
  let match;
  let idx = 1;
  while ((match = stepRegex.exec(xml)) !== null) {
    const rawStep = match[1];
    const pMatches = rawStep.match(/<parameterizedString[^>]*>([\\s\\S]*?)<\\/parameterizedString>/gi) || [];
    const action = (pMatches[0] || '').replace(/<[^>]+>/g, '').trim();
    const expected = (pMatches[1] || '').replace(/<[^>]+>/g, '').trim();
    steps.push({
      stepNumber: idx++,
      action: action || \`Step \${idx - 1}\`,
      expectedResult: expected || 'Action completed successfully'
    });
  }
  return steps;
}

export function getAdapter(provider) {
  const p = (provider || '').toLowerCase();
  
  if (p === 'ado' || p === 'azure' || p === 'azure-devops') {
    return {
      async getTestCase(caseId) {
        const org = process.env.AZURE_DEVOPS_ORG;
        const project = process.env.AZURE_DEVOPS_PROJECT;
        const pat = process.env.AZURE_DEVOPS_PAT;
        if (!org || !project || !pat) {
          return { error: 'Missing Azure DevOps environment variables' };
        }
        const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
        const url = \`https://dev.azure.com/\${org}/\${project}/_apis/wit/workitems/\${caseId}?$expand=all&api-version=7.0\`;
        const res = await httpGet(url, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`ADO API error: \${res.status}\` };
        const fields = res.data.fields || {};
        const steps = parseAdoXmlSteps(fields['Microsoft.VSTS.TCM.Steps']);
        return {
          id: String(res.data.id),
          title: fields['System.Title'] || '',
          description: (fields['System.Description'] || '').replace(/<[^>]+>/g, ''),
          steps,
          tags: (fields['System.Tags'] || '').split(';').map(t => t.trim()).filter(Boolean)
        };
      },
      async getSuiteCases(suiteId, extra) {
        const org = process.env.AZURE_DEVOPS_ORG;
        const project = process.env.AZURE_DEVOPS_PROJECT;
        const pat = process.env.AZURE_DEVOPS_PAT;
        const planId = (extra && extra.planId) || process.env.AZURE_DEVOPS_PLAN_ID;
        if (!org || !project || !pat) return { error: 'Missing Azure DevOps environment variables' };
        if (!planId) return { error: 'Missing planId — pass planId or set AZURE_DEVOPS_PLAN_ID' };
        const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
        const url = \`https://dev.azure.com/\${org}/\${project}/_apis/testplan/Plans/\${planId}/Suites/\${suiteId}/TestCase?api-version=7.0\`;
        const res = await httpGet(url, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`ADO suite fetch error: \${res.status}\` };
        const cases = (res.data.value || []).map((tc) => ({
          id: String(tc.workItem && tc.workItem.id),
          title: (tc.workItem && tc.workItem.name) || ''
        }));
        return { suiteId, cases };
      },
      async listTestPlans(query, maxResults) {
        const org = process.env.AZURE_DEVOPS_ORG;
        const project = process.env.AZURE_DEVOPS_PROJECT;
        const pat = process.env.AZURE_DEVOPS_PAT;
        if (!org || !project || !pat) return { error: 'Missing Azure DevOps environment variables' };
        const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
        const url = \`https://dev.azure.com/\${org}/\${project}/_apis/testplan/plans?api-version=7.0\`;
        const res = await httpGet(url, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`ADO test plans fetch error: \${res.status}\` };
        const results = (res.data.value || []).slice(0, maxResults || 25).map((p) => ({ id: String(p.id), name: p.name || '' }));
        return { results };
      },
      async createTestRun(fields) {
        const org = process.env.AZURE_DEVOPS_ORG;
        const project = process.env.AZURE_DEVOPS_PROJECT;
        const pat = process.env.AZURE_DEVOPS_PAT;
        const planId = fields.planId || process.env.AZURE_DEVOPS_PLAN_ID;
        if (!org || !project || !pat) return { error: 'Missing Azure DevOps environment variables' };
        if (!planId) return { error: 'Missing planId — pass planId or set AZURE_DEVOPS_PLAN_ID' };
        const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
        const body = { name: fields.name || 'Untitled run', plan: { id: planId }, isAutomated: true };
        const url = \`https://dev.azure.com/\${org}/\${project}/_apis/test/runs?api-version=7.0\`;
        const res = await httpPost(url, body, { Authorization: authHeader });
        if (res.status !== 200 && res.status !== 201) return { error: \`ADO create run error: \${res.status}\`, details: res.data };
        return { id: String(res.data.id), name: res.data.name || '' };
      },
      async postTestResult(args) {
        const org = process.env.AZURE_DEVOPS_ORG;
        const project = process.env.AZURE_DEVOPS_PROJECT;
        const pat = process.env.AZURE_DEVOPS_PAT;
        const runId = process.env.AZURE_DEVOPS_RUN_ID;
        if (!org || !project || !pat || !runId) {
          return { success: false, error: 'Missing Azure DevOps environment variables (AZURE_DEVOPS_ORG/PROJECT/PAT/RUN_ID)' };
        }
        const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
        const outcome = args.status === 'passed' ? 'Passed' : args.status === 'failed' ? 'Failed' : args.status === 'blocked' ? 'Blocked' : 'NotExecuted';
        const testPointId = args.testPointId || process.env.AZURE_DEVOPS_TEST_POINT_ID;
        const url = \`https://dev.azure.com/\${org}/\${project}/_apis/test/Runs/\${runId}/results?api-version=7.1\`;
        const body = [{
          testCaseTitle: args.caseId,
          ...(testPointId ? { testPoint: { id: testPointId } } : {}),
          outcome,
          comment: args.comment || '',
          durationInMs: args.durationMs || 0
        }];
        const res = await httpPost(url, body, { Authorization: authHeader });
        if (res.status !== 200 && res.status !== 201) return { success: false, error: \`Azure DevOps API error: \${res.status}\` };
        return { success: true, id: args.caseId, status: args.status };
      },
      async searchIssues(query, maxResults) {
        const org = process.env.AZURE_DEVOPS_ORG;
        const project = process.env.AZURE_DEVOPS_PROJECT;
        const pat = process.env.AZURE_DEVOPS_PAT;
        if (!org || !project || !pat) return { error: 'Missing Azure DevOps environment variables' };
        const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
        const wiql = query || \`SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.TeamProject] = '\${project}' ORDER BY [System.ChangedDate] DESC\`;
        const wiqlRes = await httpPost(\`https://dev.azure.com/\${org}/\${project}/_apis/wit/wiql?api-version=7.0\`, { query: wiql }, { Authorization: authHeader });
        if (wiqlRes.status !== 200) return { error: \`ADO WIQL error: \${wiqlRes.status}\` };
        const ids = (wiqlRes.data.workItems || []).slice(0, maxResults || 25).map((w) => w.id);
        if (ids.length === 0) return { results: [] };
        const idsRes = await httpGet(\`https://dev.azure.com/\${org}/\${project}/_apis/wit/workitems?ids=\${ids.join(',')}&api-version=7.0\`, { Authorization: authHeader });
        if (idsRes.status !== 200) return { error: \`ADO work items fetch error: \${idsRes.status}\` };
        const results = (idsRes.data.value || []).map((w) => ({
          id: String(w.id),
          title: w.fields['System.Title'] || '',
          status: w.fields['System.State'] || ''
        }));
        return { results };
      },
      async createIssue(fields) {
        const org = process.env.AZURE_DEVOPS_ORG;
        const project = process.env.AZURE_DEVOPS_PROJECT;
        const pat = process.env.AZURE_DEVOPS_PAT;
        if (!org || !project || !pat) return { error: 'Missing Azure DevOps environment variables' };
        const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
        const issueType = fields.issueType || 'Bug';
        const patch = [{ op: 'add', path: '/fields/System.Title', value: fields.summary || 'Untitled' }];
        if (fields.description) patch.push({ op: 'add', path: '/fields/System.Description', value: fields.description });
        const url = \`https://dev.azure.com/\${org}/\${project}/_apis/wit/workitems/$\${encodeURIComponent(issueType)}?api-version=7.0\`;
        const res = await httpPost(url, patch, { Authorization: authHeader, 'Content-Type': 'application/json-patch+json' });
        if (res.status !== 200 && res.status !== 201) return { error: \`ADO create error: \${res.status}\`, details: res.data };
        return { id: String(res.data.id), title: (res.data.fields && res.data.fields['System.Title']) || '' };
      },
      async updateIssue(caseId, fields) {
        const org = process.env.AZURE_DEVOPS_ORG;
        const project = process.env.AZURE_DEVOPS_PROJECT;
        const pat = process.env.AZURE_DEVOPS_PAT;
        if (!org || !project || !pat) return { error: 'Missing Azure DevOps environment variables' };
        const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
        const patch = [];
        if (fields.summary) patch.push({ op: 'add', path: '/fields/System.Title', value: fields.summary });
        if (fields.description) patch.push({ op: 'add', path: '/fields/System.Description', value: fields.description });
        if (fields.status) patch.push({ op: 'add', path: '/fields/System.State', value: fields.status });
        if (patch.length === 0) return { error: 'No fields to update' };
        const url = \`https://dev.azure.com/\${org}/\${project}/_apis/wit/workitems/\${caseId}?api-version=7.0\`;
        const res = await httpPatch(url, patch, { Authorization: authHeader, 'Content-Type': 'application/json-patch+json' });
        if (res.status !== 200) return { error: \`ADO update error: \${res.status}\`, details: res.data };
        return { id: caseId, updated: true };
      },
      async deleteIssue(caseId) {
        const org = process.env.AZURE_DEVOPS_ORG;
        const project = process.env.AZURE_DEVOPS_PROJECT;
        const pat = process.env.AZURE_DEVOPS_PAT;
        if (!org || !project || !pat) return { error: 'Missing Azure DevOps environment variables' };
        const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
        // Soft-delete by default (ADO moves it to the project Recycle Bin, recoverable for 30 days).
        const url = \`https://dev.azure.com/\${org}/\${project}/_apis/wit/workitems/\${caseId}?api-version=7.0\`;
        const res = await httpDelete(url, { Authorization: authHeader });
        if (res.status !== 200 && res.status !== 204) return { error: \`ADO delete error: \${res.status}\`, details: res.data };
        return { id: caseId, deleted: true };
      }
    };
  }

  if (p === 'testrail') {
    return {
      async getTestCase(caseId) {
        const host = process.env.TESTRAIL_HOST;
        const user = process.env.TESTRAIL_USERNAME;
        const key = process.env.TESTRAIL_API_KEY;
        if (!host || !user || !key) return { error: 'Missing TestRail environment variables' };
        const authHeader = 'Basic ' + Buffer.from(\`\${user}:\${key}\`).toString('base64');
        const cleanId = String(caseId).replace(/^C/i, '');
        const url = \`\${host.replace(/\\/+$/, '')}/index.php?/api/v2/get_case/\${cleanId}\`;
        const res = await httpGet(url, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`TestRail API error: \${res.status}\` };
        const c = res.data;
        const steps = (c.custom_steps_separated || []).map((s, i) => ({
          stepNumber: i + 1,
          action: s.content || '',
          expectedResult: s.expected || ''
        }));
        return {
          id: \`C\${c.id}\`,
          title: c.title || '',
          description: c.custom_preconds || '',
          steps,
          tags: []
        };
      },
      async getSuiteCases(suiteId) {
        const host = process.env.TESTRAIL_HOST;
        const user = process.env.TESTRAIL_USERNAME;
        const key = process.env.TESTRAIL_API_KEY;
        const projectId = process.env.TESTRAIL_PROJECT_ID;
        if (!host || !user || !key || !projectId) {
          return { error: 'Missing TestRail environment variables (TESTRAIL_HOST/USERNAME/API_KEY/PROJECT_ID)' };
        }
        const authHeader = 'Basic ' + Buffer.from(\`\${user}:\${key}\`).toString('base64');
        const url = \`\${host.replace(/\\/+$/, '')}/index.php?/api/v2/get_cases/\${projectId}&section_id=\${suiteId}\`;
        const res = await httpGet(url, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`TestRail API error: \${res.status}\` };
        const cases = Array.isArray(res.data) ? res.data : res.data.cases || [];
        return { suiteId, cases: cases.map((c) => ({ id: \`C\${c.id}\`, title: c.title || '' })) };
      },
      async listTestPlans(query, maxResults) {
        const host = process.env.TESTRAIL_HOST;
        const user = process.env.TESTRAIL_USERNAME;
        const key = process.env.TESTRAIL_API_KEY;
        const projectId = process.env.TESTRAIL_PROJECT_ID;
        if (!host || !user || !key || !projectId) {
          return { error: 'Missing TestRail environment variables (TESTRAIL_HOST/USERNAME/API_KEY/PROJECT_ID)' };
        }
        const authHeader = 'Basic ' + Buffer.from(\`\${user}:\${key}\`).toString('base64');
        const url = \`\${host.replace(/\\/+$/, '')}/index.php?/api/v2/get_plans/\${projectId}\`;
        const res = await httpGet(url, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`TestRail API error: \${res.status}\` };
        const plans = Array.isArray(res.data) ? res.data : res.data.plans || [];
        return { results: plans.slice(0, maxResults || 25).map((p) => ({ id: String(p.id), name: p.name || '' })) };
      },
      async createTestRun(fields) {
        const host = process.env.TESTRAIL_HOST;
        const user = process.env.TESTRAIL_USERNAME;
        const key = process.env.TESTRAIL_API_KEY;
        const projectId = process.env.TESTRAIL_PROJECT_ID;
        const suiteId = fields.suiteId || process.env.TESTRAIL_SUITE_ID;
        if (!host || !user || !key || !projectId) {
          return { error: 'Missing TestRail environment variables (TESTRAIL_HOST/USERNAME/API_KEY/PROJECT_ID)' };
        }
        const authHeader = 'Basic ' + Buffer.from(\`\${user}:\${key}\`).toString('base64');
        const body = { name: fields.name || 'Untitled run', include_all: true, ...(suiteId ? { suite_id: suiteId } : {}) };
        const url = \`\${host.replace(/\\/+$/, '')}/index.php?/api/v2/add_run/\${projectId}\`;
        const res = await httpPost(url, body, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`TestRail create run error: \${res.status}\`, details: res.data };
        return { id: String(res.data.id), name: res.data.name || '' };
      },
      async postTestResult(args) {
        const host = process.env.TESTRAIL_HOST;
        const user = process.env.TESTRAIL_USERNAME;
        const key = process.env.TESTRAIL_API_KEY;
        const runId = process.env.TESTRAIL_RUN_ID;
        if (!host || !user || !key || !runId) {
          return { success: false, error: 'Missing TestRail environment variables (TESTRAIL_HOST/USERNAME/API_KEY/RUN_ID)' };
        }
        const authHeader = 'Basic ' + Buffer.from(\`\${user}:\${key}\`).toString('base64');
        const cleanId = String(args.caseId).replace(/^C/i, '');
        // TestRail default status ids: 1=Passed, 2=Blocked, 3=Untested, 4=Retest, 5=Failed.
        const statusId = args.status === 'passed' ? 1 : args.status === 'blocked' ? 2 : args.status === 'failed' ? 5 : 3;
        const url = \`\${host.replace(/\\/+$/, '')}/index.php?/api/v2/add_result_for_case/\${runId}/\${cleanId}\`;
        const body = {
          status_id: statusId,
          comment: args.comment || '',
          ...(args.durationMs ? { elapsed: \`\${Math.max(1, Math.round(args.durationMs / 1000))}s\` } : {})
        };
        const res = await httpPost(url, body, { Authorization: authHeader });
        if (res.status !== 200) return { success: false, error: \`TestRail API error: \${res.status}\` };
        return { success: true, id: args.caseId, status: args.status };
      },
      async searchIssues(query, maxResults) {
        const host = process.env.TESTRAIL_HOST;
        const user = process.env.TESTRAIL_USERNAME;
        const key = process.env.TESTRAIL_API_KEY;
        const projectId = process.env.TESTRAIL_PROJECT_ID;
        if (!host || !user || !key || !projectId) {
          return { error: 'Missing TestRail environment variables (TESTRAIL_HOST/USERNAME/API_KEY/PROJECT_ID)' };
        }
        const authHeader = 'Basic ' + Buffer.from(\`\${user}:\${key}\`).toString('base64');
        const url = \`\${host.replace(/\\/+$/, '')}/index.php?/api/v2/get_cases/\${projectId}\`;
        const res = await httpGet(url, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`TestRail API error: \${res.status}\` };
        const cases = Array.isArray(res.data) ? res.data : res.data.cases || [];
        const filtered = query ? cases.filter((c) => (c.title || '').toLowerCase().includes(String(query).toLowerCase())) : cases;
        const results = filtered.slice(0, maxResults || 25).map((c) => ({ id: \`C\${c.id}\`, title: c.title || '', status: '' }));
        return { results };
      },
      async createIssue(fields) {
        const host = process.env.TESTRAIL_HOST;
        const user = process.env.TESTRAIL_USERNAME;
        const key = process.env.TESTRAIL_API_KEY;
        const sectionId = fields.sectionId || process.env.TESTRAIL_SECTION_ID;
        if (!host || !user || !key) return { error: 'Missing TestRail environment variables' };
        if (!sectionId) return { error: 'Missing sectionId — pass fields.sectionId or set TESTRAIL_SECTION_ID' };
        const authHeader = 'Basic ' + Buffer.from(\`\${user}:\${key}\`).toString('base64');
        const body = { title: fields.summary || 'Untitled', custom_preconds: fields.description || '' };
        const res = await httpPost(\`\${host.replace(/\\/+$/, '')}/index.php?/api/v2/add_case/\${sectionId}\`, body, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`TestRail create error: \${res.status}\`, details: res.data };
        return { id: \`C\${res.data.id}\`, title: res.data.title || '' };
      },
      async updateIssue(caseId, fields) {
        const host = process.env.TESTRAIL_HOST;
        const user = process.env.TESTRAIL_USERNAME;
        const key = process.env.TESTRAIL_API_KEY;
        if (!host || !user || !key) return { error: 'Missing TestRail environment variables' };
        const authHeader = 'Basic ' + Buffer.from(\`\${user}:\${key}\`).toString('base64');
        const cleanId = String(caseId).replace(/^C/i, '');
        const body = {};
        if (fields.summary) body.title = fields.summary;
        if (fields.description) body.custom_preconds = fields.description;
        if (Object.keys(body).length === 0) return { error: 'No fields to update' };
        const res = await httpPost(\`\${host.replace(/\\/+$/, '')}/index.php?/api/v2/update_case/\${cleanId}\`, body, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`TestRail update error: \${res.status}\`, details: res.data };
        return { id: caseId, updated: true };
      },
      async deleteIssue(caseId) {
        const host = process.env.TESTRAIL_HOST;
        const user = process.env.TESTRAIL_USERNAME;
        const key = process.env.TESTRAIL_API_KEY;
        if (!host || !user || !key) return { error: 'Missing TestRail environment variables' };
        const authHeader = 'Basic ' + Buffer.from(\`\${user}:\${key}\`).toString('base64');
        const cleanId = String(caseId).replace(/^C/i, '');
        const res = await httpPost(\`\${host.replace(/\\/+$/, '')}/index.php?/api/v2/delete_case/\${cleanId}\`, {}, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`TestRail delete error: \${res.status}\`, details: res.data };
        return { id: caseId, deleted: true };
      }
    };
  }

  if (p === 'jira') {
    return {
      async getTestCase(caseId) {
        const host = process.env.JIRA_HOST;
        const email = process.env.JIRA_EMAIL;
        const token = process.env.JIRA_API_TOKEN;
        if (!host || !email || !token) return { error: 'Missing Jira environment variables' };
        const authHeader = 'Basic ' + Buffer.from(\`\${email}:\${token}\`).toString('base64');
        const url = \`\${host.replace(/\\/+$/, '')}/rest/api/3/issue/\${caseId}\`;
        const res = await httpGet(url, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`Jira API error: \${res.status}\` };
        const f = res.data.fields || {};
        return {
          id: res.data.key,
          title: f.summary || '',
          description: adfToPlainText(f.description),
          steps: [],
          tags: f.labels || []
        };
      },
      async getSuiteCases(suiteId) {
        return { error: 'Plain Jira has no built-in test-suite concept — use the Xray or Zephyr provider for suite/plan queries.' };
      },
      async listTestPlans() {
        return { error: 'Plain Jira has no built-in test-plan concept — use the Xray or Zephyr provider for suite/plan queries.' };
      },
      async createTestRun() {
        return { error: 'Plain Jira has no built-in test-run concept — use the Xray or Zephyr provider.' };
      },
      async postTestResult(args) { return { success: true, id: args.caseId, status: args.status }; },
      ...createJiraIssueCrud()
    };
  }

  if (p === 'xray') {
    async function authenticateXrayCloud(clientId, clientSecret) {
      // Observed in practice taking up to ~40s to respond — well above the client's own 45s
      // default, so give it explicit headroom rather than relying on the default alone.
      const authRes = await httpPost('https://xray.cloud.getxray.app/api/v2/authenticate', { client_id: clientId, client_secret: clientSecret }, {}, 60000);
      if (authRes.status !== 200) return { error: \`Xray Cloud auth error: \${authRes.status}\` };
      const token = typeof authRes.data === 'string' ? authRes.data.replace(/"/g, '') : '';
      if (!token) return { error: 'Xray Cloud auth did not return a token' };
      return { token };
    }
    async function xrayCloudGraphql(token, query) {
      return httpPost('https://xray.cloud.getxray.app/api/v2/graphql', { query }, { Authorization: \`Bearer \${token}\` });
    }
    return {
      async getTestCase(caseId) {
        const clientId = process.env.XRAY_CLIENT_ID;
        const clientSecret = process.env.XRAY_CLIENT_SECRET;
        if (clientId && clientSecret) {
          // Xray Cloud: exchange client_id/client_secret for a bearer token, then query steps via
          // GraphQL. getTest(issueId) takes Jira's internal numeric id, not the human-readable
          // key — go through getTests(jql) instead, same as every other Xray Cloud lookup here,
          // so a caller-supplied key like "PROJ-123" actually resolves.
          const auth = await authenticateXrayCloud(clientId, clientSecret);
          if (auth.error) return { error: auth.error };
          const token = auth.token;
          const query = \`query { getTests(jql: "key = \\\\"\${gqlEscape(caseId)}\\\\"", limit: 1) { results { jira(fields: ["summary", "description", "labels"]) steps { action data result } } } }\`;
          const res = await xrayCloudGraphql(token, query);
          if (res.status !== 200) return { error: \`Xray Cloud GraphQL error: \${res.status}\` };
          const test = res.data && res.data.data && res.data.data.getTests && res.data.data.getTests.results[0];
          if (!test) return { error: 'Xray Cloud: test not found' };
          const jf = test.jira || {};
          const steps = (test.steps || []).map((s, i) => ({
            stepNumber: i + 1,
            action: s.action || '',
            expectedResult: s.result || ''
          }));
          return {
            id: String(caseId),
            title: jf.summary || '',
            description: adfToPlainText(jf.description),
            steps,
            tags: jf.labels || []
          };
        }

        // Xray Server/DC fallback: REST endpoints against the self-hosted Jira instance.
        const host = process.env.JIRA_HOST;
        const token = process.env.JIRA_API_TOKEN;
        if (!host || !token) {
          return { error: 'Missing Xray environment variables (XRAY_CLIENT_ID/XRAY_CLIENT_SECRET for Cloud, or JIRA_HOST/JIRA_API_TOKEN as a PAT for Server/DC)' };
        }
        const authHeader = \`Bearer \${token}\`;
        const issueRes = await httpGet(\`\${host.replace(/\\/+$/, '')}/rest/api/2/issue/\${caseId}\`, { Authorization: authHeader });
        if (issueRes.status !== 200) return { error: \`Xray Server/DC API error: \${issueRes.status}\` };
        const stepsRes = await httpGet(\`\${host.replace(/\\/+$/, '')}/rest/raven/2.0/api/test/\${caseId}/step\`, { Authorization: authHeader });
        const f = issueRes.data.fields || {};
        const rawSteps = Array.isArray(stepsRes.data) ? stepsRes.data : [];
        const steps = rawSteps.map((s, i) => ({
          stepNumber: i + 1,
          action: s.action || s.step || '',
          expectedResult: s.result || s.expectedResult || ''
        }));
        return {
          id: issueRes.data.key || String(caseId),
          title: f.summary || '',
          description: adfToPlainText(f.description),
          steps,
          tags: f.labels || []
        };
      },
      async getSuiteCases(suiteId) {
        const clientId = process.env.XRAY_CLIENT_ID;
        const clientSecret = process.env.XRAY_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return { error: 'Xray Server/DC Test Plan listing is not implemented — only Xray Cloud is supported for this tool.' };
        }
        const auth = await authenticateXrayCloud(clientId, clientSecret);
        if (auth.error) return { error: auth.error };
        const res = await xrayCloudGraphql(auth.token, \`query { getTestPlans(jql: "key = \\\\"\${gqlEscape(suiteId)}\\\\"", limit: 1) { results { tests(limit: 100) { results { jira(fields: ["key", "summary"]) } } } } }\`);
        const plan = res.data && res.data.data && res.data.data.getTestPlans && res.data.data.getTestPlans.results[0];
        if (!plan) return { error: \`Xray Cloud: Test Plan \${suiteId} not found\` };
        const cases = ((plan.tests && plan.tests.results) || []).map((t) => ({
          id: (t.jira && t.jira.key) || '',
          title: (t.jira && t.jira.summary) || ''
        }));
        return { suiteId, cases };
      },
      async listTestPlans(query, maxResults) {
        const clientId = process.env.XRAY_CLIENT_ID;
        const clientSecret = process.env.XRAY_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return { error: 'Xray Server/DC test-plan listing is not implemented — only Xray Cloud is supported for this tool.' };
        }
        const auth = await authenticateXrayCloud(clientId, clientSecret);
        if (auth.error) return { error: auth.error };
        const jql = gqlEscape(query || 'ORDER BY created DESC');
        const res = await xrayCloudGraphql(auth.token, \`query { getTestPlans(jql: "\${jql}", limit: \${maxResults || 25}) { results { issueId jira(fields: ["key", "summary"]) } } }\`);
        const results = (res.data && res.data.data && res.data.data.getTestPlans && res.data.data.getTestPlans.results) || [];
        return { results: results.map((p) => ({ id: (p.jira && p.jira.key) || p.issueId, name: (p.jira && p.jira.summary) || '' })) };
      },
      async createTestRun(fields) {
        // Test Executions in Xray ARE Jira issues — create one directly via the shared Jira
        // issue CRUD rather than a bespoke endpoint.
        return createJiraIssueCrud().createIssue({ ...fields, summary: fields.name || fields.summary, issueType: 'Test Execution' });
      },
      async postTestResult(args) {
        const clientId = process.env.XRAY_CLIENT_ID;
        const clientSecret = process.env.XRAY_CLIENT_SECRET;
        const executionKey = args.testExecutionKey || process.env.XRAY_TEST_EXECUTION_KEY;
        if (!clientId || !clientSecret) {
          // Xray Server/DC result publishing was not independently verified against official
          // docs (anti-bot blocked live access during research) — do not fabricate an endpoint.
          return { success: false, error: 'Xray Server/DC result publishing is not implemented — only Xray Cloud (XRAY_CLIENT_ID/XRAY_CLIENT_SECRET) is supported for postTestResult.' };
        }
        if (!executionKey) {
          return { success: false, error: 'Missing Test Execution key — pass testExecutionKey or set XRAY_TEST_EXECUTION_KEY' };
        }
        const auth = await authenticateXrayCloud(clientId, clientSecret);
        if (auth.error) return { success: false, error: auth.error };
        const token = auth.token;

        // Resolve Jira's internal numeric issue ids for the Test and the Test Execution — Xray's
        // getTestRun query takes issue ids, not issue keys.
        const testLookup = await xrayCloudGraphql(token, \`query { getTests(jql: "key = \\\\"\${gqlEscape(args.caseId)}\\\\"", limit: 1) { results { issueId } } }\`);
        const testIssueId = testLookup.data && testLookup.data.data && testLookup.data.data.getTests && testLookup.data.data.getTests.results[0] && testLookup.data.data.getTests.results[0].issueId;
        if (!testIssueId) return { success: false, error: \`Xray Cloud: could not resolve Test issue id for \${args.caseId}\` };

        const execLookup = await xrayCloudGraphql(token, \`query { getTestExecutions(jql: "key = \\\\"\${gqlEscape(executionKey)}\\\\"", limit: 1) { results { issueId } } }\`);
        const execIssueId = execLookup.data && execLookup.data.data && execLookup.data.data.getTestExecutions && execLookup.data.data.getTestExecutions.results[0] && execLookup.data.data.getTestExecutions.results[0].issueId;
        if (!execIssueId) return { success: false, error: \`Xray Cloud: could not resolve Test Execution issue id for \${executionKey}\` };

        const runLookup = await xrayCloudGraphql(token, \`query { getTestRun(testIssueId: "\${testIssueId}", testExecIssueId: "\${execIssueId}") { id } }\`);
        const testRunId = runLookup.data && runLookup.data.data && runLookup.data.data.getTestRun && runLookup.data.data.getTestRun.id;
        if (!testRunId) return { success: false, error: 'Xray Cloud: could not resolve test run id for the given Test + Test Execution pair' };

        // Default Xray status names — projects with a custom status scheme may need different values.
        const status = args.status === 'passed' ? 'PASSED' : args.status === 'failed' ? 'FAILED' : args.status === 'blocked' ? 'ABORTED' : 'TODO';
        const mutateRes = await xrayCloudGraphql(token, \`mutation { updateTestRunStatus(id: "\${testRunId}", status: "\${status}") }\`);
        if (mutateRes.status !== 200 || (mutateRes.data && mutateRes.data.errors)) {
          return { success: false, error: \`Xray Cloud: updateTestRunStatus failed (\${mutateRes.status})\` };
        }
        return { success: true, id: args.caseId, status: args.status };
      },
      ...createJiraIssueCrud()
    };
  }

  if (p === 'zephyr') {
    return {
      async getTestCase(caseId) {
        const token = process.env.ZEPHYR_API_TOKEN;
        const baseUrl = process.env.ZEPHYR_BASE_URL || 'https://api.zephyrscale.smartbear.com/v2';
        if (!token) return { error: 'Missing ZEPHYR_API_TOKEN environment variable' };
        const authHeader = \`Bearer \${token}\`;
        const caseRes = await httpGet(\`\${baseUrl.replace(/\\/+$/, '')}/testcases/\${caseId}\`, { Authorization: authHeader });
        if (caseRes.status !== 200) return { error: \`Zephyr Scale API error: \${caseRes.status}\` };
        const stepsRes = await httpGet(\`\${baseUrl.replace(/\\/+$/, '')}/testcases/\${caseId}/teststeps\`, { Authorization: authHeader });
        const rawSteps = (stepsRes.data && stepsRes.data.values) || [];
        const steps = rawSteps.map((s, i) => ({
          stepNumber: i + 1,
          action: (s.inline && s.inline.description) || '',
          expectedResult: (s.inline && s.inline.expectedResult) || ''
        }));
        return {
          id: caseRes.data.key || String(caseId),
          title: caseRes.data.name || '',
          description: caseRes.data.objective || '',
          steps,
          tags: caseRes.data.labels || []
        };
      },
      async getSuiteCases(suiteId) {
        const token = process.env.ZEPHYR_API_TOKEN;
        const baseUrl = process.env.ZEPHYR_BASE_URL || 'https://api.zephyrscale.smartbear.com/v2';
        if (!token) return { error: 'Missing ZEPHYR_API_TOKEN environment variable' };
        const authHeader = \`Bearer \${token}\`;
        // Treats suiteId as a Test Cycle key and lists the test cases linked to it via
        // executions. Best-effort: the exact query parameter name for filtering
        // /testexecutions by cycle was not independently verified against live Zephyr Scale
        // (no live access during development) — verify against a real instance before relying
        // on this in production.
        const url = \`\${baseUrl.replace(/\\/+$/, '')}/testexecutions?testCycle=\${encodeURIComponent(suiteId)}&maxResults=100\`;
        const res = await httpGet(url, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`Zephyr Scale API error: \${res.status}\` };
        const values = (res.data && res.data.values) || [];
        return { suiteId, cases: values.map((v) => ({ id: (v.testCase && v.testCase.key) || '', title: '' })) };
      },
      async listTestPlans(query, maxResults) {
        const token = process.env.ZEPHYR_API_TOKEN;
        const baseUrl = process.env.ZEPHYR_BASE_URL || 'https://api.zephyrscale.smartbear.com/v2';
        const projectKey = process.env.ZEPHYR_PROJECT_KEY;
        if (!token || !projectKey) return { error: 'Missing ZEPHYR_API_TOKEN/ZEPHYR_PROJECT_KEY environment variables' };
        const authHeader = \`Bearer \${token}\`;
        // Zephyr Scale's closest equivalent to a "test plan" is a Test Cycle.
        const url = \`\${baseUrl.replace(/\\/+$/, '')}/testcycles?projectKey=\${encodeURIComponent(projectKey)}&maxResults=\${maxResults || 25}\`;
        const res = await httpGet(url, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`Zephyr Scale API error: \${res.status}\` };
        const values = (res.data && res.data.values) || [];
        return { results: values.map((c) => ({ id: c.key, name: c.name || '' })) };
      },
      async createTestRun(fields) {
        const token = process.env.ZEPHYR_API_TOKEN;
        const baseUrl = process.env.ZEPHYR_BASE_URL || 'https://api.zephyrscale.smartbear.com/v2';
        const projectKey = fields.projectKey || process.env.ZEPHYR_PROJECT_KEY;
        if (!token || !projectKey) return { error: 'Missing ZEPHYR_API_TOKEN/ZEPHYR_PROJECT_KEY environment variables' };
        const authHeader = \`Bearer \${token}\`;
        const body = { projectKey, name: fields.name || 'Untitled cycle' };
        const res = await httpPost(\`\${baseUrl.replace(/\\/+$/, '')}/testcycles\`, body, { Authorization: authHeader });
        if (res.status !== 201 && res.status !== 200) return { error: \`Zephyr Scale create cycle error: \${res.status}\`, details: res.data };
        return { id: res.data.key, name: fields.name || '' };
      },
      async postTestResult(args) {
        const token = process.env.ZEPHYR_API_TOKEN;
        const baseUrl = process.env.ZEPHYR_BASE_URL || 'https://api.zephyrscale.smartbear.com/v2';
        const projectKey = process.env.ZEPHYR_PROJECT_KEY;
        const testCycleKey = process.env.ZEPHYR_TEST_CYCLE_KEY;
        if (!token || !projectKey || !testCycleKey) {
          return { success: false, error: 'Missing ZEPHYR_API_TOKEN/ZEPHYR_PROJECT_KEY/ZEPHYR_TEST_CYCLE_KEY environment variables' };
        }
        const statusName = args.status === 'passed' ? 'Pass' : args.status === 'failed' ? 'Fail' : args.status === 'blocked' ? 'Blocked' : 'Not Executed';
        const res = await httpPost(\`\${baseUrl.replace(/\\/+$/, '')}/testexecutions\`, {
          projectKey,
          testCaseKey: args.caseId,
          testCycleKey,
          statusName,
          comment: args.comment || ''
        }, { Authorization: \`Bearer \${token}\` });
        if (res.status !== 200 && res.status !== 201) return { success: false, error: \`Zephyr Scale API error: \${res.status}\` };
        return { success: true, id: args.caseId, status: args.status };
      },
      async searchIssues(query, maxResults) {
        const token = process.env.ZEPHYR_API_TOKEN;
        const baseUrl = process.env.ZEPHYR_BASE_URL || 'https://api.zephyrscale.smartbear.com/v2';
        const projectKey = process.env.ZEPHYR_PROJECT_KEY;
        if (!token || !projectKey) return { error: 'Missing ZEPHYR_API_TOKEN/ZEPHYR_PROJECT_KEY environment variables' };
        const authHeader = \`Bearer \${token}\`;
        const url = \`\${baseUrl.replace(/\\/+$/, '')}/testcases?projectKey=\${encodeURIComponent(projectKey)}&maxResults=\${maxResults || 25}\`;
        const res = await httpGet(url, { Authorization: authHeader });
        if (res.status !== 200) return { error: \`Zephyr Scale API error: \${res.status}\` };
        const values = (res.data && res.data.values) || [];
        const filtered = query ? values.filter((v) => (v.name || '').toLowerCase().includes(String(query).toLowerCase())) : values;
        return { results: filtered.map((v) => ({ id: v.key, title: v.name || '', status: (v.status && v.status.name) || '' })) };
      },
      async createIssue(fields) {
        const token = process.env.ZEPHYR_API_TOKEN;
        const baseUrl = process.env.ZEPHYR_BASE_URL || 'https://api.zephyrscale.smartbear.com/v2';
        const projectKey = fields.projectKey || process.env.ZEPHYR_PROJECT_KEY;
        if (!token || !projectKey) return { error: 'Missing ZEPHYR_API_TOKEN/ZEPHYR_PROJECT_KEY environment variables' };
        const authHeader = \`Bearer \${token}\`;
        const body = { projectKey, name: fields.summary || 'Untitled', objective: fields.description || '' };
        const res = await httpPost(\`\${baseUrl.replace(/\\/+$/, '')}/testcases\`, body, { Authorization: authHeader });
        if (res.status !== 201 && res.status !== 200) return { error: \`Zephyr Scale create error: \${res.status}\`, details: res.data };
        return { id: res.data.key, title: fields.summary || '' };
      },
      async updateIssue(caseId, fields) {
        const token = process.env.ZEPHYR_API_TOKEN;
        const baseUrl = process.env.ZEPHYR_BASE_URL || 'https://api.zephyrscale.smartbear.com/v2';
        if (!token) return { error: 'Missing ZEPHYR_API_TOKEN environment variable' };
        const authHeader = \`Bearer \${token}\`;
        const body = {};
        if (fields.summary) body.name = fields.summary;
        if (fields.description) body.objective = fields.description;
        if (Object.keys(body).length === 0) return { error: 'No fields to update' };
        const res = await httpPut(\`\${baseUrl.replace(/\\/+$/, '')}/testcases/\${caseId}\`, body, { Authorization: authHeader });
        if (res.status !== 200 && res.status !== 204) return { error: \`Zephyr Scale update error: \${res.status}\`, details: res.data };
        return { id: caseId, updated: true };
      },
      async deleteIssue(caseId) {
        // Not implemented: Zephyr Scale's public API does not appear to expose test-case
        // deletion — corroborated by an independent third-party Zephyr Scale MCP server
        // implementation, which also has no delete tool. Do not fabricate an endpoint.
        return { error: 'Zephyr Scale test-case deletion is not implemented — the public API does not appear to expose a delete endpoint.' };
      }
    };
  }

  // Fallback standalone / mock adapter
  return {
    async getTestCase(caseId) {
      return {
        id: String(caseId),
        title: \`Test Case \${caseId}\`,
        description: 'Mock test case description',
        steps: [
          { stepNumber: 1, action: 'Open login page', expectedResult: 'Login page displayed' },
          { stepNumber: 2, action: 'Submit valid credentials', expectedResult: 'Dashboard displayed' }
        ],
        tags: ['smoke', 'automated']
      };
    },
    async getSuiteCases(suiteId) { return { suiteId, cases: [{ id: 'MOCK-1', title: 'Mock case' }] }; },
    async listTestPlans() { return { results: [{ id: 'MOCK-PLAN-1', name: 'Mock plan' }] }; },
    async createTestRun(fields) { return { id: 'MOCK-RUN-1', name: fields.name || 'Untitled' }; },
    async postTestResult(args) { return { success: true, id: args.caseId, status: args.status }; },
    async searchIssues(query) { return { results: [{ id: 'MOCK-1', title: \`Mock result for "\${query || ''}"\`, status: 'Open' }] }; },
    async createIssue(fields) { return { id: 'MOCK-1', title: fields.summary || 'Untitled' }; },
    async updateIssue(caseId) { return { id: caseId, updated: true }; },
    async deleteIssue(caseId) { return { id: caseId, deleted: true }; }
  };
}
`;

  const httpCode = `// Universal HTTP Client for Node.js Stdio MCP Server
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

// Default timeout is deliberately generous (not the more typical 10s) because at least one real
// provider endpoint (Xray Cloud's POST /authenticate) has been observed taking ~40s to respond in
// practice — a tight timeout there produces a false "Request timeout" failure on an otherwise
// working call. Override per-call via the timeoutMs parameter where a tighter bound makes sense.
const DEFAULT_TIMEOUT_MS = 45000;

function httpRequest(method, urlStr, body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const client = u.protocol === 'https:' ? https : http;
      const dataStr = body !== undefined && body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
      const opts = {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          ...(dataStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(dataStr) } : {}),
          'User-Agent': 'TMS-Bridge/1.0',
          ...headers,
        },
        timeout: timeoutMs,
      };

      const req = client.request(opts, (res) => {
        let respBody = '';
        res.on('data', (c) => { respBody += c; });
        res.on('end', () => {
          let data = respBody;
          try { data = respBody ? JSON.parse(respBody) : null; } catch {}
          resolve({ status: res.statusCode, data });
        });
      });

      req.on('error', (err) => resolve({ status: 500, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 408, error: \`Request timeout after \${timeoutMs}ms\` }); });
      if (dataStr) req.write(dataStr);
      req.end();
    } catch (e) {
      resolve({ status: 500, error: e.message });
    }
  });
}

export function httpGet(urlStr, headers = {}, timeoutMs) { return httpRequest('GET', urlStr, null, headers, timeoutMs); }
export function httpPost(urlStr, body, headers = {}, timeoutMs) { return httpRequest('POST', urlStr, body, headers, timeoutMs); }
export function httpPut(urlStr, body, headers = {}, timeoutMs) { return httpRequest('PUT', urlStr, body, headers, timeoutMs); }
export function httpPatch(urlStr, body, headers = {}, timeoutMs) { return httpRequest('PATCH', urlStr, body, headers, timeoutMs); }
export function httpDelete(urlStr, headers = {}, timeoutMs) { return httpRequest('DELETE', urlStr, null, headers, timeoutMs); }
`;

  return [
    {
      path: 'scripts/mcp-server/index.js',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'config' },
      source: { kind: 'inline', text: indexCode },
    },
    {
      path: 'scripts/mcp-server/adapters.js',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'config' },
      source: { kind: 'inline', text: adaptersCode },
    },
    {
      path: 'scripts/mcp-server/http.js',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'config' },
      source: { kind: 'inline', text: httpCode },
    },
    {
      path: '.mcp/tms-bridge/index.js',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'config' },
      source: { kind: 'inline', text: indexCode },
    },
    {
      path: '.mcp/tms-bridge/adapters.js',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'config' },
      source: { kind: 'inline', text: adaptersCode },
    },
    {
      path: '.mcp/tms-bridge/http.js',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'config' },
      source: { kind: 'inline', text: httpCode },
    },
  ];
}
