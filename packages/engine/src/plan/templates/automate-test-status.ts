// Template for scripts/automate-test-status.mjs — deterministic Intake fact-gathering for
// /automate-test's Step 1. Per the project's own rule (any multi-step guided flow needs a
// deterministic stage-dispatch script, not prose telling the model how to figure out what's next),
// this script answers the two facts Step 1 used to compute by re-reading files itself every time:
// which TMS/task-tracker provider(s) are actually configured (read from whichever MCP config file
// this project generated - the tms-bridge server's own env carries TASK_TRACKER/TMS_PROVIDERS,
// written once at generation time by mcp-configs.ts), and how many un-automated local test-case
// drafts exist in artifacts/test-cases/test-cases.json. Whether the user named an explicit
// case/ticket ID in their own message stays something only the live conversation can answer - this
// script never guesses that part, it only ever supplies the facts a script actually can compute.
export function renderAutomateTestStatus(): string {
  return `#!/usr/bin/env node

/**
 * Computes /automate-test's Step 1 Intake facts from real project state on disk - zero model
 * involvement, safe to run at any time.
 *
 * Usage:
 *   node scripts/automate-test-status.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const JOURNEYS_PATH = path.join(CWD, 'artifacts', 'test-cases', 'test-cases.json');

// Every JSON-based MCP config this project can generate shares the same "mcpServers" shape (or
// "servers" for the VS Code / Copilot-extension surface) with a tms-bridge entry carrying
// TASK_TRACKER/TMS_PROVIDERS in its own env - checked in a fixed order, first match wins, since a
// project with more than one assistant configured writes the identical tms-bridge stanza into each.
const JSON_MCP_CANDIDATES = [
  { file: '.mcp.json', serversKey: 'mcpServers' },
  { file: path.join('.agents', 'mcp_config.json'), serversKey: 'mcpServers' },
  { file: path.join('.cursor', 'mcp.json'), serversKey: 'mcpServers' },
  { file: path.join('.devin', 'mcp_config.json'), serversKey: 'mcpServers' },
  { file: path.join('.vscode', 'mcp.json'), serversKey: 'servers' },
];

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function extractTmsFromServersObject(serversObj) {
  if (!serversObj || typeof serversObj !== 'object') return null;
  const entry = serversObj['tms-bridge'];
  const env = entry && typeof entry === 'object' ? entry.env : null;
  if (!env || typeof env !== 'object') return null;
  const taskTracker =
    typeof env.TASK_TRACKER === 'string' && env.TASK_TRACKER !== 'none' ? env.TASK_TRACKER : null;
  const tmsProviders =
    typeof env.TMS_PROVIDERS === 'string' && env.TMS_PROVIDERS.length > 0
      ? env.TMS_PROVIDERS.split(',').filter(Boolean)
      : [];
  return { taskTracker, tmsProviders };
}

// Codex CLI's .codex/config.toml is TOML, not JSON, per mcp-configs.ts's own generation - a
// minimal, format-specific extractor rather than a new TOML-parsing dependency, since the shape
// this project ever writes is fixed and simple (a [mcp_servers.tms-bridge.env] table with two
// known keys).
function extractTmsFromCodexToml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8').replace(/\\r\\n/g, '\\n');
  } catch {
    return null;
  }
  const sectionMatch = content.match(/\\[mcp_servers\\.tms-bridge\\.env\\]\\n([\\s\\S]*?)(?:\\n\\[|$)/);
  if (!sectionMatch) return null;
  const section = sectionMatch[1];
  const taskTrackerMatch = section.match(/^TASK_TRACKER\\s*=\\s*"([^"]*)"/m);
  const tmsProvidersMatch = section.match(/^TMS_PROVIDERS\\s*=\\s*"([^"]*)"/m);
  const taskTracker =
    taskTrackerMatch && taskTrackerMatch[1] !== 'none' && taskTrackerMatch[1] !== ''
      ? taskTrackerMatch[1]
      : null;
  const tmsProviders =
    tmsProvidersMatch && tmsProvidersMatch[1] ? tmsProvidersMatch[1].split(',').filter(Boolean) : [];
  return { taskTracker, tmsProviders };
}

function findTmsConfig() {
  for (const candidate of JSON_MCP_CANDIDATES) {
    const data = loadJson(path.join(CWD, candidate.file));
    const extracted = data ? extractTmsFromServersObject(data[candidate.serversKey]) : null;
    if (extracted) return extracted;
  }
  const codexExtracted = extractTmsFromCodexToml(path.join(CWD, '.codex', 'config.toml'));
  if (codexExtracted) return codexExtracted;
  return { taskTracker: null, tmsProviders: [] };
}

function countLocalDrafts(journeysData) {
  if (!journeysData || typeof journeysData.routes !== 'object') return 0;
  let count = 0;
  for (const routeEntry of Object.values(journeysData.routes)) {
    if (!routeEntry || !Array.isArray(routeEntry.journeys)) continue;
    for (const journey of routeEntry.journeys) {
      if (journey && journey.testCase && journey.reviewed !== true) count++;
    }
  }
  return count;
}

function main() {
  const { taskTracker, tmsProviders } = findTmsConfig();
  const providers = [...new Set([...(taskTracker ? [taskTracker] : []), ...tmsProviders])];

  const journeysData = loadJson(JOURNEYS_PATH);
  const localDraftsCount = countLocalDrafts(journeysData);

  const result = {
    providers,
    providerCount: providers.length,
    tmsConfigured: providers.length > 0,
    localDraftsCount,
    localDraftsExist: localDraftsCount > 0,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
}

main();
`;
}
