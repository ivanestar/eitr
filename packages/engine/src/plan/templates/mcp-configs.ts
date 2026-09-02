// Generator for multi-editor MCP configuration manifests (.mcp.json, .cursor/mcp.json, etc.).
// Per-assistant target paths are live-verified against each assistant's actual current
// project-scoped MCP convention (September 2026), not assumed from naming similarity:
//   - Antigravity CLI reads .agents/mcp_config.json (never a root .mcp.json).
//   - Claude Code reads root .mcp.json ("Project" scope, meant to be committed to source control).
//   - Cursor reads .cursor/mcp.json.
//   - Copilot is two different real surfaces: the VS Code Copilot Chat extension (.vscode/mcp.json)
//     and the standalone Copilot CLI (root .mcp.json, then .github/mcp.json - never .vscode/mcp.json).
//     Both are written so either surface works.
//   - Codex CLI reads .codex/config.toml (TOML, not JSON) under [mcp_servers.<name>] tables.
//   - Windsurf has NO project-scoped MCP mechanism at all - its config is purely global
//     (~/.codeium/windsurf/mcp_config.json, shared across every workspace on the machine), so no
//     file is written for it here; see the /map-site skill for the one-time global-install note.
//   - Aider has no MCP support as of mid-2026 (official config reference lists no MCP options,
//     MCP PRs closed unmerged) - correctly no branch for it below.
import type { FileDescriptor } from '../../types/generation-plan.js';

// Returns the env-var stanza for a single provider (task tracker or TMS). Called once per
// configured provider and merged — a project with e.g. Jira as task tracker + Xray as TMS gets
// both stanzas in the same tms-bridge env block (env vars are provider-prefixed, so no collision).
function providerEnvStanza(provider: string): Record<string, string> {
  const p = provider.toLowerCase();
  if (p === 'ado' || p === 'azure' || p === 'azure-devops') {
    return {
      AZURE_DEVOPS_ORG: '${env:AZURE_DEVOPS_ORG}',
      AZURE_DEVOPS_PROJECT: '${env:AZURE_DEVOPS_PROJECT}',
      AZURE_DEVOPS_PAT: '${env:AZURE_DEVOPS_PAT}',
      AZURE_DEVOPS_RUN_ID: '${env:AZURE_DEVOPS_RUN_ID}',
      AZURE_DEVOPS_TEST_POINT_ID: '${env:AZURE_DEVOPS_TEST_POINT_ID}',
      AZURE_DEVOPS_PLAN_ID: '${env:AZURE_DEVOPS_PLAN_ID}',
    };
  }
  if (p === 'testrail') {
    return {
      TESTRAIL_HOST: '${env:TESTRAIL_HOST}',
      TESTRAIL_USERNAME: '${env:TESTRAIL_USERNAME}',
      TESTRAIL_API_KEY: '${env:TESTRAIL_API_KEY}',
      TESTRAIL_RUN_ID: '${env:TESTRAIL_RUN_ID}',
      TESTRAIL_PROJECT_ID: '${env:TESTRAIL_PROJECT_ID}',
      TESTRAIL_SECTION_ID: '${env:TESTRAIL_SECTION_ID}',
      TESTRAIL_SUITE_ID: '${env:TESTRAIL_SUITE_ID}',
    };
  }
  if (p === 'jira') {
    return {
      JIRA_HOST: '${env:JIRA_HOST}',
      JIRA_EMAIL: '${env:JIRA_EMAIL}',
      JIRA_API_TOKEN: '${env:JIRA_API_TOKEN}',
      JIRA_PROJECT_KEY: '${env:JIRA_PROJECT_KEY}',
    };
  }
  if (p === 'xray') {
    return {
      XRAY_CLIENT_ID: '${env:XRAY_CLIENT_ID}',
      XRAY_CLIENT_SECRET: '${env:XRAY_CLIENT_SECRET}',
      XRAY_TEST_EXECUTION_KEY: '${env:XRAY_TEST_EXECUTION_KEY}',
      JIRA_HOST: '${env:JIRA_HOST}',
      JIRA_API_TOKEN: '${env:JIRA_API_TOKEN}',
      JIRA_PROJECT_KEY: '${env:JIRA_PROJECT_KEY}',
    };
  }
  if (p === 'zephyr') {
    return {
      ZEPHYR_API_TOKEN: '${env:ZEPHYR_API_TOKEN}',
      ZEPHYR_BASE_URL: '${env:ZEPHYR_BASE_URL}',
      ZEPHYR_PROJECT_KEY: '${env:ZEPHYR_PROJECT_KEY}',
      ZEPHYR_TEST_CYCLE_KEY: '${env:ZEPHYR_TEST_CYCLE_KEY}',
    };
  }
  return {};
}

interface ServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

// Codex CLI reads MCP servers from .codex/config.toml (TOML) under [mcp_servers.<name>] tables -
// a fundamentally different format from the JSON configs every other assistant here reads, not
// just a different path. Unlike the ${env:VAR} placeholder convention the JSON configs use, Codex
// has a native env-passthrough mechanism: a bare variable NAME in a server's env_vars array is
// read from Codex's own process environment at runtime. Literal, generation-time-computed values
// (e.g. TASK_TRACKER) go into a nested [mcp_servers.<name>.env] table instead - so this walks each
// server's already-built `env` object and splits ${env:NAME} placeholders (-> env_vars) from
// literal values (-> the .env sub-table), rather than re-deriving server config from scratch.
function serializeServersAsToml(servers: Record<string, ServerConfig>): string {
  const blocks: string[] = [];
  for (const [name, config] of Object.entries(servers)) {
    const lines: string[] = [`[mcp_servers.${name}]`];
    lines.push(`command = ${JSON.stringify(config.command)}`);
    lines.push(`args = [${config.args.map((a) => JSON.stringify(a)).join(', ')}]`);

    const envVars: string[] = [];
    const literalEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(config.env ?? {})) {
      const placeholder = /^\$\{env:([A-Z0-9_]+)\}$/.exec(value);
      if (placeholder) {
        envVars.push(placeholder[1]);
      } else {
        literalEnv[key] = value;
      }
    }

    if (envVars.length > 0) {
      lines.push(`env_vars = [${envVars.map((v) => JSON.stringify(v)).join(', ')}]`);
    }

    let block = lines.join('\n');

    if (Object.keys(literalEnv).length > 0) {
      const envLines = [`[mcp_servers.${name}.env]`];
      for (const [key, value] of Object.entries(literalEnv)) {
        envLines.push(`${key} = ${JSON.stringify(value)}`);
      }
      block += '\n\n' + envLines.join('\n');
    }

    blocks.push(block);
  }
  return blocks.join('\n\n') + '\n';
}

export function planMcpConfigs(
  taskTracker: string = 'none',
  tmsProviders: readonly string[] = [],
  includePlaywrightMcp: boolean = true,
  aiAssistants?: readonly string[],
): FileDescriptor[] {
  const hasTaskTracker = taskTracker && taskTracker !== 'none';
  const configuredProviders = Array.from(
    new Set([...(hasTaskTracker ? [taskTracker] : []), ...tmsProviders]),
  );
  const hasTms = configuredProviders.length > 0;
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

  const jsonTargetPaths = new Set<string>();
  let needsCodexToml = false;

  for (const rawAssistant of assistants) {
    const assistant = rawAssistant.toLowerCase();
    if (assistant === 'antigravity') {
      jsonTargetPaths.add('.agents/mcp_config.json');
    } else if (assistant === 'cursor') {
      jsonTargetPaths.add('.cursor/mcp.json');
    } else if (assistant === 'claude') {
      jsonTargetPaths.add('.mcp.json');
    } else if (assistant === 'copilot') {
      jsonTargetPaths.add('.vscode/mcp.json');
      jsonTargetPaths.add('.mcp.json');
    } else if (assistant === 'vscode') {
      jsonTargetPaths.add('.vscode/mcp.json');
    } else if (assistant === 'codex') {
      needsCodexToml = true;
    }
    // windsurf: intentionally no file - see the module doc comment above.
  }

  if (jsonTargetPaths.size === 0 && !needsCodexToml) {
    return [];
  }

  const servers: Record<string, ServerConfig> = {};

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
    const providerEnv: Record<string, string> = {};
    for (const provider of configuredProviders) {
      Object.assign(providerEnv, providerEnvStanza(provider));
    }

    servers['tms-bridge'] = {
      command: 'node',
      args: ['.mcp/tms-bridge/index.js'],
      env: {
        TASK_TRACKER: hasTaskTracker ? taskTracker : 'none',
        TMS_PROVIDERS: tmsProviders.join(','),
        ...providerEnv,
        HTTP_PROXY: '${env:HTTP_PROXY}',
        HTTPS_PROXY: '${env:HTTPS_PROXY}',
      },
    };
  }

  const descriptors: FileDescriptor[] = [];

  if (jsonTargetPaths.size > 0) {
    const mcpConfigObj = { mcpServers: servers };
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

    for (const path of jsonTargetPaths) {
      descriptors.push({
        path,
        writePolicy: 'create-if-absent' as const,
        provenance: { origin: 'config' as const },
        source: { kind: 'inline' as const, text: jsonText },
      });
    }
  }

  if (needsCodexToml) {
    descriptors.push({
      path: '.codex/config.toml',
      writePolicy: 'create-if-absent' as const,
      provenance: { origin: 'config' as const },
      source: { kind: 'inline' as const, text: serializeServersAsToml(servers) },
    });
  }

  return descriptors;
}
