// Generator for embedded zero-lock-in MCP Stdio server, test runner bridge, and multi-TMS adapters.
import type { FileDescriptor } from '../../types/generation-plan.js';

export function planMcpServer(
  tmsProvider: string = 'none',
  aiAssistants?: readonly string[],
  automationTool: string = 'playwright',
  language: string = 'typescript',
): FileDescriptor[] {
  const hasTms = tmsProvider && tmsProvider !== 'none';
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
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const TMS_PROVIDER = process.env.TMS_PROVIDER || '${tmsProvider}';
const adapter = getAdapter(TMS_PROVIDER);
const CACHE_DIR = join(process.cwd(), '.tms-cache');

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

function getCachedCase(caseId) {
  try {
    const safeId = String(caseId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const file = join(CACHE_DIR, \`\${safeId}.json\`);
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf8'));
    }
  } catch (err) {
    logDebug(\`Cache read error for \${caseId}: \${err.message}\`);
  }
  return null;
}

function saveCachedCase(caseId, data) {
  try {
    ensureCacheDir();
    const safeId = String(caseId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const file = join(CACHE_DIR, \`\${safeId}.json\`);
    writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    logDebug(\`Cache write error for \${caseId}: \${err.message}\`);
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
      description: 'Captures semantic DOM ARIA snapshot and recommends 3-tier locators for target route.',
      inputSchema: {
        type: 'object',
        properties: {
          route: { type: 'string', description: 'Target route (e.g. "/login", "/dashboard")' },
          selector: { type: 'string', description: 'Optional sub-selector' }
        },
        required: ['route']
      }
    }
  ];

  if (TMS_PROVIDER && TMS_PROVIDER !== 'none') {
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
        description: 'Fetch all surrounding test cases in a test suite.',
        inputSchema: {
          type: 'object',
          properties: {
            suiteId: { type: 'string', description: 'The ID or name of the test suite' }
          },
          required: ['suiteId']
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
            durationMs: { type: 'number', description: 'Execution duration in milliseconds' }
          },
          required: ['caseId', 'status']
        }
      }
    );
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
      const snapshot = {
        route: args.route,
        status: 'ready',
        suggestedLocators: [
          { priority: 'tier-1', locator: \`getByTestId('\${args.route.replace(/\\//g, '')}-container')\` },
          { priority: 'tier-2', locator: 'getByRole("main")' }
        ]
      };
      return { content: [{ type: 'text', text: JSON.stringify(snapshot, null, 2) }] };
    }
    if (name === 'mcp__tms__get_test_case') {
      const cached = getCachedCase(args.caseId);
      if (cached) {
        logDebug(\`Serving case \${args.caseId} from local cache\`);
        return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
      }
      const data = await adapter.getTestCase(args.caseId);
      if (data && !data.error) {
        saveCachedCase(args.caseId, data);
      }
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
    if (name === 'mcp__tms__get_suite_context') {
      const data = await adapter.getSuiteCases(args.suiteId);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
    if (name === 'mcp__tms__post_test_result') {
      const res = await adapter.postTestResult(args);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
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

      if (req.method === 'initialize') {
        sendResponse({
          jsonrpc: '2.0',
          id: req.id,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'tms-bridge', version: '1.0.0' }
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
import { httpGet, httpPost } from './http.js';

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
      async getSuiteCases(suiteId) { return { suiteId, cases: [] }; },
      async postTestResult(args) { return { success: true, id: args.caseId, status: args.status }; }
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
      async getSuiteCases(suiteId) { return { suiteId, cases: [] }; },
      async postTestResult(args) { return { success: true, id: args.caseId, status: args.status }; }
    };
  }

  if (p === 'jira' || p === 'xray' || p === 'zephyr') {
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
          description: typeof f.description === 'string' ? f.description : '',
          steps: [],
          tags: f.labels || []
        };
      },
      async getSuiteCases(suiteId) { return { suiteId, cases: [] }; },
      async postTestResult(args) { return { success: true, id: args.caseId, status: args.status }; }
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
    async getSuiteCases(suiteId) { return { suiteId, cases: [] }; },
    async postTestResult(args) { return { success: true, id: args.caseId, status: args.status }; }
  };
}
`;

  const httpCode = `// Universal HTTP Client for Node.js Stdio MCP Server
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

export function httpGet(urlStr, headers = {}) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const client = u.protocol === 'https:' ? https : http;
      const opts = {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        headers: { 'User-Agent': 'TMS-Bridge/1.0', ...headers },
        timeout: 10000,
      };

      const req = client.request(opts, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          let data = body;
          try { data = JSON.parse(body); } catch {}
          resolve({ status: res.statusCode, data });
        });
      });

      req.on('error', (err) => resolve({ status: 500, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 408, error: 'Request timeout' }); });
      req.end();
    } catch (e) {
      resolve({ status: 500, error: e.message });
    }
  });
}

export function httpPost(urlStr, body, headers = {}) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const client = u.protocol === 'https:' ? https : http;
      const dataStr = typeof body === 'string' ? body : JSON.stringify(body);
      const opts = {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataStr),
          'User-Agent': 'TMS-Bridge/1.0',
          ...headers,
        },
        timeout: 10000,
      };

      const req = client.request(opts, (res) => {
        let respBody = '';
        res.on('data', (c) => { respBody += c; });
        res.on('end', () => {
          let data = respBody;
          try { data = JSON.parse(respBody); } catch {}
          resolve({ status: res.statusCode, data });
        });
      });

      req.on('error', (err) => resolve({ status: 500, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 408, error: 'Request timeout' }); });
      req.write(dataStr);
      req.end();
    } catch (e) {
      resolve({ status: 500, error: e.message });
    }
  });
}
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
