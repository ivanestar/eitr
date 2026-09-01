// Generator for multi-editor MCP configuration manifests (.mcp.json, .cursor/mcp.json, etc.)
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

  const targetPaths = new Set<string>();

  for (const rawAssistant of assistants) {
    const assistant = rawAssistant.toLowerCase();
    if (assistant === 'antigravity') {
      targetPaths.add('.mcp.json');
    } else if (assistant === 'cursor') {
      targetPaths.add('.cursor/mcp.json');
    } else if (assistant === 'claude') {
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
