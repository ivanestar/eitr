import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planMcpServer } from '../src/plan/templates/mcp-server.js';

// -- System-level test of the MCP bridge's protocol layer (handshake / discovery / tools/list /
// -- tools/call envelope shape), NOT the TMS adapter logic (see tms-adapters.test.ts for that).
// -- Materializes the real generated index.js/adapters.js/http.js to a real tmpdir and spawns a
// -- real node process, talking JSON-RPC over stdio. No eval/new Function anywhere.

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
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
  const dir = mkdtempSync(join(tmpdir(), 'eitr-mcp-protocol-'));
  tmpDirs.push(dir);
  // aiAssistants non-empty so planMcpServer emits the bridge files even with no TMS provider
  // configured (mcp__inspect_dom and mcp__run_test don't require any TMS/env setup).
  const files = planMcpServer('none', [], ['claude'], 'playwright', 'typescript');
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

interface McpClient {
  call: (method: string, params?: unknown) => Promise<any>;
  close: () => Promise<void>;
}

function startMcpClient(cwd: string): McpClient {
  const proc = spawn(process.execPath, ['index.js'], {
    cwd,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  let idCounter = 1;
  const pending = new Map<number, (msg: any) => void>();
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk: string) => {
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
        // ignore stray non-JSON output
      }
    }
  });
  function call(method: string, params?: unknown): Promise<any> {
    const id = idCounter++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for response to ${method}`));
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

describe('MCP bridge protocol layer (real spawned process, real stdio JSON-RPC)', () => {
  it('newline-delimited JSON-RPC framing is confirmed by the generated index.js source (no Content-Length headers)', () => {
    const files = planMcpServer('none', [], ['claude'], 'playwright', 'typescript');
    const indexFile = files.find((f) => f.path === '.mcp/tms-bridge/index.js');
    expect(indexFile).toBeDefined();
    const text = indexFile?.source.text as string;
    expect(text).toContain("buffer.split('\\n')");
    expect(text).toContain("process.stdout.write(json + '\\n')");
    expect(text).not.toContain('Content-Length');
  });

  it('initialize (legacy handshake) returns protocolVersion', async () => {
    const dir = materializeBridge();
    const client = startMcpClient(dir);
    try {
      const resp = await client.call('initialize', {});
      expect(resp.result.protocolVersion).toBe('2025-11-25');
      expect(resp.result.serverInfo).toEqual({ name: 'tms-bridge', version: '1.0.0' });
      expect(resp.result.capabilities).toEqual({ tools: {} });
    } finally {
      await client.close();
    }
  });

  it('server/discover returns resultType: complete', async () => {
    const dir = materializeBridge();
    const client = startMcpClient(dir);
    try {
      const resp = await client.call('server/discover', {});
      expect(resp.result.resultType).toBe('complete');
      expect(resp.result.supportedVersions).toContain('2026-07-28');
    } finally {
      await client.close();
    }
  });

  it('tools/list returns resultType: complete plus CacheableResult (ttlMs, cacheScope)', async () => {
    const dir = materializeBridge();
    const client = startMcpClient(dir);
    try {
      const resp = await client.call('tools/list', {});
      expect(resp.result.resultType).toBe('complete');
      expect(resp.result.ttlMs).toBe(60000);
      expect(resp.result.cacheScope).toBe('session');
      expect(Array.isArray(resp.result.tools)).toBe(true);
      expect(resp.result.tools.some((t: any) => t.name === 'mcp__inspect_dom')).toBe(true);
    } finally {
      await client.close();
    }
  });

  it('tools/call also carries resultType: complete on its result envelope', async () => {
    const dir = materializeBridge();
    const client = startMcpClient(dir);
    try {
      const resp = await client.call('tools/call', {
        name: 'mcp__inspect_dom',
        arguments: { route: '/login' },
      });
      expect(resp.result.resultType).toBe('complete');
    } finally {
      await client.close();
    }
  });

  it('tools/call for mcp__inspect_dom (no live TMS/env setup needed) returns a valid heuristic locator payload', async () => {
    const dir = materializeBridge();
    const client = startMcpClient(dir);
    try {
      const resp = await client.call('tools/call', {
        name: 'mcp__inspect_dom',
        arguments: { route: '/login', selector: 'submit' },
      });
      const text = resp.result.content[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.route).toBe('/login');
      expect(parsed.status).toBe('heuristic');
      expect(Array.isArray(parsed.suggestedLocators)).toBe(true);
      expect(parsed.suggestedLocators.length).toBeGreaterThan(0);
      expect(parsed.suggestedLocators[0].locator).toContain('getByTestId');
    } finally {
      await client.close();
    }
  });

  it('per-request _meta.clientCapabilities/_meta.clientInfo are read tolerantly (absence does not break protocolVersion negotiation)', async () => {
    const dir = materializeBridge();
    const client = startMcpClient(dir);
    try {
      const resp = await client.call('tools/list', {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          clientCapabilities: { sampling: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });
      expect(resp.result.resultType).toBe('complete');
      expect(resp.error).toBeUndefined();
    } finally {
      await client.close();
    }
  });

  it('unsupported protocol version is rejected with the documented -32022 error code', async () => {
    const dir = materializeBridge();
    const client = startMcpClient(dir);
    try {
      const resp = await client.call('tools/list', {
        _meta: { 'io.modelcontextprotocol/protocolVersion': '1999-01-01' },
      });
      expect(resp.error.code).toBe(-32022);
    } finally {
      await client.close();
    }
  });

  it('unrecognized JSON-RPC method returns a -32601 error instead of a silent empty result', async () => {
    const dir = materializeBridge();
    const client = startMcpClient(dir);
    try {
      const resp = await client.call('totally/unknown/method', {});
      expect(resp.error).toBeDefined();
      expect(resp.error.code).toBe(-32601);
      expect(resp.error.message).toContain('totally/unknown/method');
    } finally {
      await client.close();
    }
  });

  it('mcp__run_test rejects a specPath carrying shell metacharacters instead of executing them (command-injection guard)', async () => {
    const dir = materializeBridge();
    const client = startMcpClient(dir);
    try {
      const resp = await client.call('tools/call', {
        name: 'mcp__run_test',
        arguments: {
          specPath: `x.spec.ts; node -e "require('fs').writeFileSync('injected.txt','x')"`,
        },
      });
      const parsed = JSON.parse(resp.result.content[0].text);
      expect(parsed.status).toBe('failed');
      expect(parsed.stderr).toContain('SecurityError');
      expect(existsSync(join(dir, 'injected.txt'))).toBe(false);
    } finally {
      await client.close();
    }
  });

  it('mcp__run_test rejects a project name carrying shell metacharacters the same way', async () => {
    const dir = materializeBridge();
    const client = startMcpClient(dir);
    try {
      const resp = await client.call('tools/call', {
        name: 'mcp__run_test',
        arguments: { specPath: 'tests/smoke.spec.ts', project: '$(node -e "1")' },
      });
      const parsed = JSON.parse(resp.result.content[0].text);
      expect(parsed.status).toBe('failed');
      expect(parsed.stderr).toContain('SecurityError');
    } finally {
      await client.close();
    }
  });

  it('mcp__run_test rejects a specPath/project that looks like a runner CLI flag (leading "-"), even though every character in it is individually whitelisted (CWE-88 argument injection guard)', async () => {
    const dir = materializeBridge();
    const client = startMcpClient(dir);
    try {
      // '--updateSnapshot' and '-h' pass the plain character-class whitelist (letters/digits/./_/-)
      // but must still be rejected: as a bare positional argv token they'd be interpreted by the
      // downstream runner as a flag, not a file path, letting a request silently alter runner
      // behavior (e.g. skip tests) while the tool still reports a definite status.
      const respSpec = await client.call('tools/call', {
        name: 'mcp__run_test',
        arguments: { specPath: '--updateSnapshot' },
      });
      const parsedSpec = JSON.parse(respSpec.result.content[0].text);
      expect(parsedSpec.status).toBe('failed');
      expect(parsedSpec.stderr).toContain('SecurityError');

      const respProject = await client.call('tools/call', {
        name: 'mcp__run_test',
        arguments: { specPath: 'tests/smoke.spec.ts', project: '-h' },
      });
      const parsedProject = JSON.parse(respProject.result.content[0].text);
      expect(parsedProject.status).toBe('failed');
      expect(parsedProject.stderr).toContain('SecurityError');
    } finally {
      await client.close();
    }
  });
});
