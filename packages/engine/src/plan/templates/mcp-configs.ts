// Generator for multi-editor MCP configuration manifests (.mcp.json, .cursor/mcp.json, etc.)
import type { FileDescriptor } from '../../types/generation-plan.js';

export function planMcpConfigs(
  tmsProvider: string = 'none',
  includePlaywrightMcp: boolean = true,
  aiAssistants?: readonly string[],
): FileDescriptor[] {
  const hasTms = tmsProvider && tmsProvider !== 'none';
  if (!hasTms && !includePlaywrightMcp) {
    return [];
  }

  const assistants =
    aiAssistants === undefined
      ? ['antigravity', 'cursor', 'claude', 'windsurf', 'codex', 'copilot']
      : aiAssistants;

  if (!assistants || assistants.length === 0) {
    return [];
  }

  const targetPaths = new Set<string>();

  for (const rawAssistant of assistants) {
    const assistant = rawAssistant.toLowerCase();
    if (assistant === 'antigravity' || assistant === 'gemini') {
      targetPaths.add('.mcp.json');
    } else if (assistant === 'cursor') {
      targetPaths.add('.cursor/mcp.json');
    } else if (assistant === 'claude' || assistant === 'claude-code') {
      targetPaths.add('.claude/mcp.json');
    } else if (assistant === 'copilot' || assistant === 'vscode') {
      targetPaths.add('.vscode/mcp.json');
    } else if (assistant === 'windsurf') {
      targetPaths.add('.windsurf/mcp.json');
    } else if (assistant === 'codex') {
      targetPaths.add('.codex/mcp.json');
    }
  }

  if (targetPaths.size === 0) {
    return [];
  }

  const servers: Record<string, unknown> = {};

  if (includePlaywrightMcp) {
    servers['playwright'] = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-playwright'],
      env: {
        HTTP_PROXY: '${env:HTTP_PROXY}',
        HTTPS_PROXY: '${env:HTTPS_PROXY}',
        NODE_EXTRA_CA_CERTS: '${env:NODE_EXTRA_CA_CERTS}',
        PLAYWRIGHT_DOWNLOAD_HOST: '${env:PLAYWRIGHT_DOWNLOAD_HOST}',
      },
    };
  }

  if (hasTms) {
    servers['tms-bridge'] = {
      command: 'node',
      args: ['.mcp/tms-bridge/index.js'],
      env: {
        TMS_PROVIDER: tmsProvider,
        TMS_URL: '${env:TMS_URL}',
        TMS_USER: '${env:TMS_USER}',
        TMS_API_KEY: '${env:TMS_API_KEY}',
        HTTP_PROXY: '${env:HTTP_PROXY}',
        HTTPS_PROXY: '${env:HTTPS_PROXY}',
      },
    };
  }

  const mcpConfigObj = {
    mcpServers: servers,
  };

  const jsonText =
    JSON.stringify(mcpConfigObj, null, 2)
      .replace(
        /"args": \[\s+"-y",\s+"@modelcontextprotocol\/server-playwright"\s+\]/g,
        '"args": ["-y", "@modelcontextprotocol/server-playwright"]',
      )
      .replace(
        /"args": \[\s+"\.mcp\/tms-bridge\/index\.js"\s+\]/g,
        '"args": [".mcp/tms-bridge/index.js"]',
      ) + '\n';

  return Array.from(targetPaths).map((path) => ({
    path,
    writePolicy: 'create-if-absent' as const,
    provenance: { origin: 'config' as const },
    source: { kind: 'inline' as const, text: jsonText },
  }));
}
