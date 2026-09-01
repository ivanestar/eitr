import { describe, it, expect } from 'vitest';
import { planMcpServer } from '../../engine/src/plan/templates/mcp-server.js';
import { planSharedScaffold } from '../../engine/src/plan/shared.js';

describe('MCP Test Runner Bridge (mcp__run_test, mcp__inspect_dom)', () => {
  it('AC-1 & AC-2: planMcpServer provides mcp__run_test and mcp__inspect_dom tool definitions and handlers', () => {
    const files = planMcpServer(
      'none',
      [],
      ['cursor', 'claude', 'antigravity'],
      'playwright',
      'typescript',
    );
    expect(files.length).toBeGreaterThan(0);

    const indexFile = files.find((f) => f.path === '.mcp/tms-bridge/index.js');
    expect(indexFile).toBeDefined();

    const code = (indexFile?.source as { text: string }).text;
    expect(code).toContain('mcp__run_test');
    expect(code).toContain('mcp__inspect_dom');
    expect(code).toContain('executeTestRun');
    expect(code).toContain('specPath');
    expect(code).toContain('status');
  });

  it('AC-3: planSharedScaffold emits MCP server when AI assistants are enabled even with no task tracker/TMS configured', () => {
    const files = planSharedScaffold({
      taskTracker: 'none',
      tmsProviders: [],
      aiAssistants: ['cursor', 'claude'],
      automationTool: 'playwright',
      language: 'typescript',
    });

    const mcpIndex = files.find((f) => f.path === '.mcp/tms-bridge/index.js');
    expect(mcpIndex).toBeDefined();
    expect(mcpIndex?.writePolicy).toBe('create-if-absent');
  });

  it('AC-4: Zero-Emoji compliance across generated MCP server', () => {
    const files = planMcpServer('jira', [], ['cursor'], 'playwright', 'typescript');
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    for (const file of files) {
      const text = (file.source as { text: string }).text;
      expect(emojiRegex.test(text)).toBe(false);
    }
  });
});
