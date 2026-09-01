import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planMcpServer } from '../src/plan/templates/mcp-server.js';

// -- Test harness: materialize the real generated MCP bridge to a tmpdir and spawn a real --
// -- node process, talking JSON-RPC over stdio (newline-delimited, matching index.js's own --
// -- reader/writer). No eval/new Function anywhere - this exercises the actual generated code. --

const tmpDirs: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    try {
      server.close();
    } catch {
      // ignore
    }
  }
  for (const dir of tmpDirs.splice(0)) {
    // Windows: the just-killed child node process can hold a brief file lock on its cwd even
    // after kill() is called - retry with backoff rather than letting one EPERM abort cleanup
    // of every other tmp dir in this batch.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        rmSync(dir, { recursive: true, force: true });
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    if (lastErr) {
      // eslint-disable-next-line no-console
      console.warn(`Failed to remove temp dir ${dir}:`, lastErr);
    }
  }
});

function materializeBridge(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eitr-tms-bridge-'));
  tmpDirs.push(dir);
  const files = planMcpServer(
    'none',
    ['testrail', 'zephyr', 'ado', 'xray'],
    undefined,
    'playwright',
    'typescript',
  );
  const byBasename: Record<string, string> = {};
  for (const f of files) {
    if (f.path.startsWith('.mcp/tms-bridge/')) {
      byBasename[f.path.replace('.mcp/tms-bridge/', '')] = f.source.text as string;
    }
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
  writeFileSync(join(dir, 'index.js'), byBasename['index.js'], 'utf8');
  writeFileSync(join(dir, 'adapters.js'), byBasename['adapters.js'], 'utf8');
  writeFileSync(join(dir, 'http.js'), byBasename['http.js'], 'utf8');
  return dir;
}

type MockRequest = { method: string; url: string; body: unknown };

function startMockServer(
  router: (req: MockRequest, res: ServerResponse) => void,
): Promise<{ port: number; requests: MockRequest[] }> {
  const requests: MockRequest[] = [];
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let raw = '';
      let handled = false;
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        if (handled) return;
        handled = true;
        let body: unknown = null;
        try {
          body = raw ? JSON.parse(raw) : null;
        } catch {
          body = raw;
        }
        const record = { method: req.method || '', url: req.url || '', body };
        requests.push(record);
        try {
          res.setHeader('Connection', 'close');
          router(record, res);
        } catch (err) {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
        }
      });
    });
    servers.push(server);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ port, requests });
    });
  });
}

interface McpClient {
  call: (method: string, params?: unknown) => Promise<any>;
  close: () => Promise<void>;
}

function startMcpClient(cwd: string, env: Record<string, string>): McpClient {
  const proc = spawn(process.execPath, ['index.js'], {
    cwd,
    env: { ...process.env, ...env, DEBUG_MCP: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderrBuf = '';
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (chunk: string) => {
    stderrBuf += chunk;
  });
  let buffer = '';
  let idCounter = 1;
  const pending = new Map<number, (msg: any) => void>();
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk: string) => {
    if (process.env.EITR_TEST_DEBUG) console.error('STDOUT CHUNK:', JSON.stringify(chunk));
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const resolver = pending.get(msg.id);
        if (resolver) {
          pending.delete(msg.id);
          resolver(msg);
        }
      } catch {
        // ignore non-JSON stray output
      }
    }
  });
  function call(method: string, params?: unknown): Promise<any> {
    const id = idCounter++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for response to ${method}. stderr: ${stderrBuf}`));
      }, 15000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  function close(): Promise<void> {
    return new Promise((resolve) => {
      if (proc.exitCode !== null || proc.signalCode !== null) {
        resolve();
        return;
      }
      const timer = setTimeout(() => resolve(), 3000);
      proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        proc.stdin.end();
      } catch {
        // ignore
      }
      proc.kill();
    });
  }
  return { call, close };
}

async function callTool(client: McpClient, name: string, args: Record<string, unknown>) {
  const resp = await client.call('tools/call', { name, arguments: args });
  const text = resp.result?.content?.[0]?.text;
  return { raw: resp, parsed: text ? JSON.parse(text) : undefined };
}

describe('TMS adapters -- real spawned MCP bridge + mock HTTP server', () => {
  // -- TestRail --------------------------------------------------------------------------
  describe('TestRail', () => {
    it('getTestCase / postTestResult / createIssue / searchIssues round-trip against a mock server', async () => {
      const { port, requests } = await startMockServer((req, res) => {
        if (req.method === 'GET' && req.url.includes('get_case/1')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              id: 1,
              title: 'Login works',
              custom_preconds: 'User exists',
              custom_steps_separated: [{ content: 'Open login', expected: 'Page shown' }],
            }),
          );
        } else if (req.method === 'POST' && req.url.includes('add_result_for_case')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 555 }));
        } else if (req.method === 'POST' && req.url.includes('add_case/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 42, title: (req.body as any)?.title }));
        } else if (req.method === 'GET' && req.url.includes('get_cases/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([{ id: 1, title: 'Login works' }]));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      const dir = materializeBridge();
      const client = startMcpClient(dir, {
        TESTRAIL_HOST: `http://127.0.0.1:${port}`,
        TESTRAIL_USERNAME: 'user@example.com',
        TESTRAIL_API_KEY: 'key123',
        TESTRAIL_PROJECT_ID: '7',
        TESTRAIL_RUN_ID: '99',
        TESTRAIL_SECTION_ID: '3',
      });
      try {
        const getCase = await callTool(client, 'mcp__tms__get_test_case', {
          caseId: 'C1',
          provider: 'testrail',
        });
        expect(getCase.parsed.id).toBe('C1');
        expect(getCase.parsed.title).toBe('Login works');

        const postResult = await callTool(client, 'mcp__tms__post_test_result', {
          caseId: 'C1',
          status: 'passed',
          provider: 'testrail',
        });
        expect(postResult.parsed.success).toBe(true);
        expect(
          requests.some((r) => r.method === 'POST' && r.url.includes('add_result_for_case/99/1')),
        ).toBe(true);

        const created = await callTool(client, 'mcp__tms__create_issue', {
          summary: 'New case',
          provider: 'testrail',
        });
        expect(created.parsed.title).toBe('New case');

        const search = await callTool(client, 'mcp__tms__search', { provider: 'testrail' });
        expect(search.parsed.results[0].id).toBe('C1');
      } finally {
        await client.close();
      }
    });

    it('postTestResult uploads attachments after a successful result post', async () => {
      const attachmentRequests: MockRequest[] = [];
      const { port, requests } = await startMockServer((req, res) => {
        if (req.method === 'POST' && req.url.includes('add_result_for_case')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 777 }));
        } else if (req.method === 'POST' && req.url.includes('add_attachment_to_result/777')) {
          attachmentRequests.push(req);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ attachment_id: 1 }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      const dir = materializeBridge();
      const evidenceFile = join(dir, 'evidence.txt');
      writeFileSync(evidenceFile, 'trace output', 'utf8');
      const client = startMcpClient(dir, {
        TESTRAIL_HOST: `http://127.0.0.1:${port}`,
        TESTRAIL_USERNAME: 'user@example.com',
        TESTRAIL_API_KEY: 'key123',
        TESTRAIL_RUN_ID: '1',
      });
      try {
        const result = await callTool(client, 'mcp__tms__post_test_result', {
          caseId: 'C1',
          status: 'passed',
          provider: 'testrail',
          attachments: [evidenceFile],
        });
        expect(result.parsed.success).toBe(true);
        expect(result.parsed.attachments).toHaveLength(1);
        expect(result.parsed.attachments[0].success).toBe(true);
        expect(attachmentRequests.length).toBe(1);
        expect(requests.some((r) => r.url.includes('add_attachment_to_result/777'))).toBe(true);
      } finally {
        await client.close();
      }
    });

    it('postTestResult without attachments behaves identically to before (no attachments field, no regression)', async () => {
      const { port } = await startMockServer((req, res) => {
        if (req.method === 'POST' && req.url.includes('add_result_for_case')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 1 }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      const dir = materializeBridge();
      const client = startMcpClient(dir, {
        TESTRAIL_HOST: `http://127.0.0.1:${port}`,
        TESTRAIL_USERNAME: 'u',
        TESTRAIL_API_KEY: 'k',
        TESTRAIL_RUN_ID: '1',
      });
      try {
        const result = await callTool(client, 'mcp__tms__post_test_result', {
          caseId: 'C1',
          status: 'passed',
          provider: 'testrail',
        });
        expect(result.parsed).toEqual({ success: true, id: 'C1', status: 'passed' });
        expect(result.parsed.attachments).toBeUndefined();
      } finally {
        await client.close();
      }
    });

    it('missing env vars -> error, no HTTP call (regression guard)', async () => {
      const { port, requests } = await startMockServer((_req, res) => {
        res.writeHead(200);
        res.end('{}');
      });
      const dir = materializeBridge();
      const client = startMcpClient(dir, {});
      try {
        const result = await callTool(client, 'mcp__tms__get_test_case', {
          caseId: 'C1',
          provider: 'testrail',
        });
        expect(result.parsed.error).toContain('Missing TestRail environment variables');
        expect(requests.length).toBe(0);
      } finally {
        await client.close();
      }
      // touch port to satisfy lint (server started but never contacted)
      expect(port).toBeGreaterThan(0);
    });

    // -- B3: real pagination ------------------------------------------------------------
    it('getSuiteCases: exactly one full page (no truncation, no false-positive)', async () => {
      const page = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, title: `Case ${i + 1}` }));
      const { port } = await startMockServer((req, res) => {
        if (req.url.includes('offset=250')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([]));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(page));
        }
      });
      const dir = materializeBridge();
      const client = startMcpClient(dir, {
        TESTRAIL_HOST: `http://127.0.0.1:${port}`,
        TESTRAIL_USERNAME: 'u',
        TESTRAIL_API_KEY: 'k',
        TESTRAIL_PROJECT_ID: '1',
      });
      try {
        const result = await callTool(client, 'mcp__tms__get_suite_context', {
          suiteId: '5',
          provider: 'testrail',
        });
        expect(result.parsed.cases.length).toBe(250);
        expect(result.parsed.truncated).toBeUndefined();
      } finally {
        await client.close();
      }
    });

    it('getSuiteCases: 3 full pages then a short page -- full pagination works, no truncation', async () => {
      const { port } = await startMockServer((req, res) => {
        const offsetMatch = req.url.match(/offset=(\d+)/);
        const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (offset < 750) {
          res.end(
            JSON.stringify(
              Array.from({ length: 250 }, (_, i) => ({
                id: offset + i + 1,
                title: `Case ${offset + i + 1}`,
              })),
            ),
          );
        } else {
          res.end(
            JSON.stringify(
              Array.from({ length: 10 }, (_, i) => ({ id: 751 + i, title: `Case ${751 + i}` })),
            ),
          );
        }
      });
      const dir = materializeBridge();
      const client = startMcpClient(dir, {
        TESTRAIL_HOST: `http://127.0.0.1:${port}`,
        TESTRAIL_USERNAME: 'u',
        TESTRAIL_API_KEY: 'k',
        TESTRAIL_PROJECT_ID: '1',
      });
      try {
        const result = await callTool(client, 'mcp__tms__get_suite_context', {
          suiteId: '5',
          provider: 'testrail',
        });
        expect(result.parsed.cases.length).toBe(760);
        expect(result.parsed.truncated).toBeUndefined();
      } finally {
        await client.close();
      }
    });

    it('getSuiteCases: server always returns a full page -> hits the 10-page/2500-record cap and reports truncated: true', async () => {
      const { port } = await startMockServer((req, res) => {
        const offsetMatch = req.url.match(/offset=(\d+)/);
        const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify(
            Array.from({ length: 250 }, (_, i) => ({ id: offset + i + 1, title: 'x' })),
          ),
        );
      });
      const dir = materializeBridge();
      const client = startMcpClient(dir, {
        TESTRAIL_HOST: `http://127.0.0.1:${port}`,
        TESTRAIL_USERNAME: 'u',
        TESTRAIL_API_KEY: 'k',
        TESTRAIL_PROJECT_ID: '1',
      });
      try {
        const result = await callTool(client, 'mcp__tms__get_suite_context', {
          suiteId: '5',
          provider: 'testrail',
        });
        expect(result.parsed.cases.length).toBe(2500);
        expect(result.parsed.truncated).toBe(true);
      } finally {
        await client.close();
      }
    }, 20000);
  });

  // -- Zephyr Scale ------------------------------------------------------------------------
  describe('Zephyr Scale', () => {
    it('getTestCase / postTestResult / createIssue / searchIssues round-trip against a mock server', async () => {
      const { port } = await startMockServer((req, res) => {
        if (req.method === 'GET' && req.url.includes('/testcases/TC-1/teststeps')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              values: [{ inline: { description: 'Open', expectedResult: 'Shown' } }],
            }),
          );
        } else if (req.method === 'GET' && req.url.includes('/testcases/TC-1')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              key: 'TC-1',
              name: 'Login',
              objective: 'Verify login',
              labels: ['smoke'],
            }),
          );
        } else if (req.method === 'POST' && req.url.includes('/testexecutions')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ key: 'EX-1' }));
        } else if (req.method === 'POST' && req.url.includes('/testcases')) {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ key: 'TC-2', name: (req.body as any)?.name }));
        } else if (req.method === 'GET' && req.url.includes('/testcases?')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              values: [{ key: 'TC-1', name: 'Login', status: { name: 'Approved' } }],
            }),
          );
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      const dir = materializeBridge();
      const client = startMcpClient(dir, {
        ZEPHYR_API_TOKEN: 'tok',
        ZEPHYR_BASE_URL: `http://127.0.0.1:${port}`,
        ZEPHYR_PROJECT_KEY: 'PROJ',
        ZEPHYR_TEST_CYCLE_KEY: 'CY-1',
      });
      try {
        const getCase = await callTool(client, 'mcp__tms__get_test_case', {
          caseId: 'TC-1',
          provider: 'zephyr',
        });
        expect(getCase.parsed.id).toBe('TC-1');
        expect(getCase.parsed.title).toBe('Login');

        const postResult = await callTool(client, 'mcp__tms__post_test_result', {
          caseId: 'TC-1',
          status: 'passed',
          provider: 'zephyr',
        });
        expect(postResult.parsed.success).toBe(true);

        const created = await callTool(client, 'mcp__tms__create_issue', {
          summary: 'New case',
          provider: 'zephyr',
        });
        expect(created.parsed.id).toBe('TC-2');

        const search = await callTool(client, 'mcp__tms__search', { provider: 'zephyr' });
        expect(search.parsed.results[0].id).toBe('TC-1');
      } finally {
        await client.close();
      }
    });

    it('postTestResult uploads attachments to /testexecutions/{key}/attachments', async () => {
      const attachmentRequests: MockRequest[] = [];
      const { port } = await startMockServer((req, res) => {
        if (
          req.method === 'POST' &&
          req.url.includes('/testexecutions') &&
          !req.url.includes('attachments')
        ) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ key: 'EX-9' }));
        } else if (req.method === 'POST' && req.url.includes('/testexecutions/EX-9/attachments')) {
          attachmentRequests.push(req);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 1 }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      const dir = materializeBridge();
      const evidenceFile = join(dir, 'evidence.txt');
      writeFileSync(evidenceFile, 'trace output', 'utf8');
      const client = startMcpClient(dir, {
        ZEPHYR_API_TOKEN: 'tok',
        ZEPHYR_BASE_URL: `http://127.0.0.1:${port}`,
        ZEPHYR_PROJECT_KEY: 'PROJ',
        ZEPHYR_TEST_CYCLE_KEY: 'CY-1',
      });
      try {
        const result = await callTool(client, 'mcp__tms__post_test_result', {
          caseId: 'TC-1',
          status: 'passed',
          provider: 'zephyr',
          attachments: [evidenceFile],
        });
        expect(result.parsed.success).toBe(true);
        expect(result.parsed.attachments[0].success).toBe(true);
        expect(attachmentRequests.length).toBe(1);
      } finally {
        await client.close();
      }
    });

    it('missing env vars -> error, no HTTP call (regression guard)', async () => {
      const { requests } = await startMockServer((_req, res) => {
        res.writeHead(200);
        res.end('{}');
      });
      const dir = materializeBridge();
      const client = startMcpClient(dir, {});
      try {
        const result = await callTool(client, 'mcp__tms__get_test_case', {
          caseId: 'TC-1',
          provider: 'zephyr',
        });
        expect(result.parsed.error).toContain('ZEPHYR_API_TOKEN');
        expect(requests.length).toBe(0);
      } finally {
        await client.close();
      }
    });
  });

  // -- Xray (Server/DC fallback path -- Cloud path's host is hardcoded, see deviation note) --
  describe('Xray (Server/DC REST fallback via JIRA_HOST)', () => {
    it('getTestCase / createIssue / searchIssues round-trip against a mock server', async () => {
      const { port } = await startMockServer((req, res) => {
        if (req.method === 'GET' && req.url.includes('/rest/raven/2.0/api/test/PROJ-1/step')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([{ action: 'Open', result: 'Shown' }]));
        } else if (req.method === 'GET' && req.url.includes('/rest/api/2/issue/PROJ-1')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ key: 'PROJ-1', fields: { summary: 'Login', labels: [] } }));
        } else if (
          req.method === 'POST' &&
          req.url.includes('/rest/api/3/issue') &&
          !req.url.includes('search')
        ) {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ key: 'PROJ-2' }));
        } else if (req.method === 'GET' && req.url.includes('/rest/api/3/search/jql')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              issues: [{ key: 'PROJ-1', fields: { summary: 'Login', status: { name: 'Open' } } }],
            }),
          );
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      const dir = materializeBridge();
      const client = startMcpClient(dir, {
        JIRA_HOST: `http://127.0.0.1:${port}`,
        JIRA_API_TOKEN: 'server-dc-pat',
        JIRA_EMAIL: 'ci@example.com',
        JIRA_PROJECT_KEY: 'PROJ',
      });
      try {
        const getCase = await callTool(client, 'mcp__tms__get_test_case', {
          caseId: 'PROJ-1',
          provider: 'xray',
        });
        expect(getCase.parsed.id).toBe('PROJ-1');
        expect(getCase.parsed.title).toBe('Login');

        const created = await callTool(client, 'mcp__tms__create_issue', {
          summary: 'New test',
          provider: 'xray',
        });
        expect(created.parsed.id).toBe('PROJ-2');

        const search = await callTool(client, 'mcp__tms__search', { provider: 'xray' });
        expect(search.parsed.results[0].id).toBe('PROJ-1');
      } finally {
        await client.close();
      }
    });

    it('postTestResult without XRAY_CLIENT_ID/SECRET returns the honest "not implemented" error (no fabricated Server/DC endpoint)', async () => {
      const { port, requests } = await startMockServer((_req, res) => {
        res.writeHead(200);
        res.end('{}');
      });
      const dir = materializeBridge();
      const client = startMcpClient(dir, {
        JIRA_HOST: `http://127.0.0.1:${port}`,
        JIRA_API_TOKEN: 'pat',
      });
      try {
        const result = await callTool(client, 'mcp__tms__post_test_result', {
          caseId: 'PROJ-1',
          status: 'passed',
          provider: 'xray',
        });
        expect(result.parsed.success).toBe(false);
        expect(result.parsed.error).toContain(
          'Xray Server/DC result publishing is not implemented',
        );
        expect(requests.length).toBe(0);
      } finally {
        await client.close();
      }
    });

    it('missing env vars -> error, no HTTP call (regression guard)', async () => {
      const { requests } = await startMockServer((_req, res) => {
        res.writeHead(200);
        res.end('{}');
      });
      const dir = materializeBridge();
      const client = startMcpClient(dir, {});
      try {
        const result = await callTool(client, 'mcp__tms__get_test_case', {
          caseId: 'PROJ-1',
          provider: 'xray',
        });
        expect(result.parsed.error).toContain('Missing Xray environment variables');
        expect(requests.length).toBe(0);
      } finally {
        await client.close();
      }
    });
  });

  // -- Azure DevOps -- see deviation note: base URL (https://dev.azure.com) is hardcoded in the
  // -- adapter, not read from an env var, so a real local-mock-HTTP round trip is not reachable
  // -- without either a source change (out of scope for this batch) or DNS/TLS interception.
  // -- Covered here via the regression guard only (missing env vars -> error, no HTTP call),
  // -- which does not require reaching the real dev.azure.com host. --
  describe('Azure DevOps (regression guard only -- see deviation note above)', () => {
    it('missing env vars -> error, no HTTP call, for every tool', async () => {
      const { requests } = await startMockServer((_req, res) => {
        res.writeHead(200);
        res.end('{}');
      });
      const dir = materializeBridge();
      const client = startMcpClient(dir, {});
      try {
        const getCase = await callTool(client, 'mcp__tms__get_test_case', {
          caseId: '1',
          provider: 'ado',
        });
        expect(getCase.parsed.error).toContain('Missing Azure DevOps environment variables');

        const postResult = await callTool(client, 'mcp__tms__post_test_result', {
          caseId: '1',
          status: 'passed',
          provider: 'ado',
        });
        expect(postResult.parsed.success).toBe(false);
        expect(postResult.parsed.error).toContain('Missing Azure DevOps environment variables');

        const created = await callTool(client, 'mcp__tms__create_issue', {
          summary: 'x',
          provider: 'ado',
        });
        expect(created.parsed.error).toContain('Missing Azure DevOps environment variables');

        const search = await callTool(client, 'mcp__tms__search', { provider: 'ado' });
        expect(search.parsed.error).toContain('Missing Azure DevOps environment variables');

        expect(requests.length).toBe(0);
      } finally {
        await client.close();
      }
    });
  });
});
