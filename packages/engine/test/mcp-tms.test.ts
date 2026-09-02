import { describe, it, expect } from 'vitest';
import { planMcpServer } from '../src/plan/templates/mcp-server.js';
import { planMcpConfigs } from '../src/plan/templates/mcp-configs.js';
import { planAiAgents } from '../src/plan/templates/ai-agents.js';
import { planAiOperationalSkills } from '../src/plan/templates/ai-operational-skills.js';
import { planSharedScaffold } from '../src/plan/shared.js';
import { renderApiClient } from '../src/plan/templates/api-client.js';
import { renderFixtures } from '../src/plan/templates/fixtures.js';

describe('MCP TMS & AI-First Subsystem Generators', () => {
  it('returns empty array when taskTracker/tmsProviders are none or omitted', () => {
    expect(planMcpServer('none', [])).toEqual([]);
    expect(planMcpConfigs('none', [], false)).toEqual([]);
    expect(planAiAgents([])).toEqual([]);
    expect(planAiOperationalSkills([])).toEqual([]);
  });

  it('generates standalone MCP server files for azure-devops', () => {
    const files = planMcpServer('none', ['azure-devops']);
    expect(files.length).toBe(3);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('.mcp/tms-bridge/index.js');
    expect(paths).toContain('.mcp/tms-bridge/adapters.js');
    expect(paths).toContain('.mcp/tms-bridge/http.js');

    const indexFile = files.find((f) => f.path === '.mcp/tms-bridge/index.js');
    expect(indexFile?.source.text).toContain('mcp__tms__get_test_case');
    expect(indexFile?.source.text).toContain('azure-devops');
    expect(indexFile?.source.text).toContain('.tms-cache');
    expect(indexFile?.source.text).toContain('getCachedCase');
    expect(indexFile?.source.text).toContain('saveCachedCase');

    const adaptersFile = files.find((f) => f.path === '.mcp/tms-bridge/adapters.js');
    expect(adaptersFile?.source.text).toContain('parseAdoXmlSteps');
    expect(adaptersFile?.source.text).toContain('Microsoft.VSTS.TCM.Steps');
  });

  it('generates multi-editor MCP configs for testrail including Playwright MCP and proxy env vars', () => {
    const files = planMcpConfigs('none', ['testrail']);
    // 5 unique files: .agents/mcp_config.json (antigravity), .cursor/mcp.json (cursor),
    // .mcp.json (claude + copilot, shared), .vscode/mcp.json (copilot), .codex/config.toml (codex).
    // Windsurf contributes none - see the module doc comment in mcp-configs.ts for why.
    expect(files.length).toBe(5);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('.agents/mcp_config.json');
    expect(paths).toContain('.cursor/mcp.json');
    expect(paths).toContain('.mcp.json');
    expect(paths).toContain('.vscode/mcp.json');
    expect(paths).toContain('.codex/config.toml');
    expect(paths).not.toContain('.claude/mcp.json');
    expect(paths).not.toContain('.windsurf/mcp.json');
    expect(paths).not.toContain('.codex/mcp.json');

    const cursorConfig = files.find((f) => f.path === '.cursor/mcp.json');
    expect(cursorConfig?.source.text).toContain('testrail');
    expect(cursorConfig?.source.text).toContain('.mcp/tms-bridge/index.js');
    expect(cursorConfig?.source.text).toContain('@modelcontextprotocol/server-playwright');
    expect(cursorConfig?.source.text).toContain('HTTP_PROXY');
    expect(cursorConfig?.source.text).toContain('PLAYWRIGHT_DOWNLOAD_HOST');

    // Antigravity CLI reads project-scoped MCP servers from .agents/mcp_config.json, never a
    // root .mcp.json - and Claude Code reads root .mcp.json, never .claude/mcp.json. These are
    // the exact two paths real-world testing found EITR getting wrong (live-verified Sept 2026
    // against each assistant's own current docs).
    const antigravityConfig = files.find((f) => f.path === '.agents/mcp_config.json');
    expect(antigravityConfig?.source.text).toContain('@modelcontextprotocol/server-playwright');
    const claudeConfig = files.find((f) => f.path === '.mcp.json');
    expect(claudeConfig?.source.text).toContain('@modelcontextprotocol/server-playwright');

    // Codex CLI reads .codex/config.toml (TOML), not JSON - and has a native env-passthrough
    // mechanism (bare names in env_vars), not the ${env:VAR} placeholder syntax the JSON configs
    // use.
    const codexConfig = files.find((f) => f.path === '.codex/config.toml');
    expect(codexConfig?.source.text).toContain('[mcp_servers.playwright]');
    expect(codexConfig?.source.text).toContain('env_vars = ');
    expect(codexConfig?.source.text).not.toContain('${env:');
  });

  it('generates MCP configs ONLY for selected AI assistants and empty lists', () => {
    const cursorOnly = planMcpConfigs('none', ['testrail'], true, ['cursor']);
    expect(cursorOnly.map((f) => f.path)).toEqual(['.cursor/mcp.json']);

    const empty = planMcpConfigs('none', ['testrail'], true, []);
    expect(empty).toEqual([]);

    const aliases = planMcpConfigs('none', [], true, ['antigravity', 'claude', 'vscode']);
    expect(aliases.map((f) => f.path)).toEqual([
      '.agents/mcp_config.json',
      '.mcp.json',
      '.vscode/mcp.json',
    ]);

    // Windsurf contributes nothing (no project-scoped MCP mechanism exists for it); Codex CLI
    // gets its own TOML file instead of a JSON path.
    const windsurfCodex = planMcpConfigs('none', [], true, ['windsurf', 'codex']);
    expect(windsurfCodex.map((f) => f.path)).toEqual(['.codex/config.toml']);

    const unknownAssistant = planMcpConfigs('none', [], true, ['aider', 'unknown']);
    expect(unknownAssistant).toEqual([]);

    // 'copilot' writes to both real Copilot surfaces: the VS Code extension (.vscode/mcp.json)
    // and the standalone Copilot CLI (root .mcp.json) - not just one.
    const copilotOnly = planMcpConfigs('none', [], true, ['copilot']);
    expect(copilotOnly.map((f) => f.path).sort()).toEqual(['.mcp.json', '.vscode/mcp.json']);
  });

  it('generates 8 specialized SDET agents for all supported assistants (Antigravity, Claude, Cursor, Windsurf, Codex, Copilot)', () => {
    const files = planAiAgents(['antigravity', 'claude', 'cursor', 'windsurf', 'codex', 'copilot']);
    expect(files.length).toBe(48); // 8 agents * 6 assistants
    const paths = files.map((f) => f.path);

    expect(paths).toContain('.agents/agents/sdet-orchestrator/agent.md');
    expect(paths).toContain('.agents/agents/tms-validator/agent.md');
    expect(paths).toContain('.agents/agents/sdet-architect/agent.md');
    expect(paths).toContain('.agents/agents/pom-engineer/agent.md');
    expect(paths).toContain('.agents/agents/test-automator/agent.md');
    expect(paths).toContain('.agents/agents/assertion-auditor/agent.md');
    expect(paths).toContain('.agents/agents/trace-debugger/agent.md');
    expect(paths).toContain('.agents/agents/review-arbiter/agent.md');

    expect(paths).toContain('.claude/agents/sdet-orchestrator.md');
    expect(paths).toContain('.claude/agents/tms-validator.md');
    expect(paths).toContain('.cursor/skills/tms-validator/SKILL.md');
    expect(paths).toContain('.cursor/skills/pom-engineer/SKILL.md');
    expect(paths).toContain('.windsurf/rules/agent-tms-validator.md');
    expect(paths).toContain('.windsurf/rules/agent-trace-debugger.md');
    expect(paths).toContain('.codex/agents/tms-validator.toml');
    expect(paths).toContain('.github/agents/tms-validator.agent.md');

    const tmsValidator = files.find((f) => f.path === '.agents/agents/tms-validator/agent.md');
    expect(tmsValidator?.source.text).toContain('TMS Requirements Quality Validator');
    expect(tmsValidator?.source.text).toContain('Quality Scorecard');
    expect(tmsValidator?.source.text).toContain('Scenario Atomicity');
    expect(tmsValidator?.source.text).toContain('Garbage-In Garbage-Out');
    expect(tmsValidator?.source.text).toContain('Rejection Protocol');

    const claudeAgent = files.find((f) => f.path === '.claude/agents/sdet-orchestrator.md');
    expect(claudeAgent?.source.text).toContain('tools:');
    expect(claudeAgent?.source.text).toContain('Bash');

    const orchestrator = files.find((f) => f.path === '.agents/agents/sdet-orchestrator/agent.md');
    expect(orchestrator?.source.text).toContain('Mandatory Execution Quality Gate');
    expect(orchestrator?.source.text).not.toContain('test:sanity');
    expect(orchestrator?.source.text).toContain('tms-validator');

    const architect = files.find((f) => f.path === '.agents/agents/sdet-architect/agent.md');
    expect(architect?.source.text).toContain('Dependency Injection');
    expect(architect?.source.text).toContain('test.extend');
    expect(architect?.source.text).toContain('Mandatory Live-DOM Liveness Verification');

    const pomEngineer = files.find((f) => f.path === '.agents/agents/pom-engineer/agent.md');
    expect(pomEngineer?.source.text).toContain('3-Tier Locator Priority');
    expect(pomEngineer?.source.text).toContain('getByTestId');
    expect(pomEngineer?.source.text).toContain('Batch Generation from Site Map');
    expect(pomEngineer?.source.text).toContain('1:1 Strict Parity');
    expect(pomEngineer?.source.text).toContain('MANDATORY AUTONOMOUS VERIFICATION');
    expect(pomEngineer?.source.text).toContain('AUTONOMOUS DEBUGGING & TWO-STRIKE SELF-HEALING');
    expect(pomEngineer?.source.text).toContain('MANDATORY HANDOFF REPORT');
    expect(pomEngineer?.source.text).not.toContain('test:sanity');

    const automator = files.find((f) => f.path === '.agents/agents/test-automator/agent.md');
    expect(automator?.source.text).toContain('Dynamic Test Data Management');
    expect(automator?.source.text).toContain('test.step');

    const auditor = files.find((f) => f.path === '.agents/agents/assertion-auditor/agent.md');
    expect(auditor?.source.text).toContain('Anti-Fake-Green Check');
    expect(auditor?.source.text).toContain('Web-First Auto-Retrying Assertions');
    expect(auditor?.source.text).toContain('Unawaited Promise Guard');
    expect(auditor?.source.text).toContain('Dual-Layer Assertions & Network Interception');
    expect(auditor?.source.text).toContain('Mutation Analysis Protocol');
    expect(auditor?.source.text).toContain('Zero-Emoji Compliance');

    const traceDebugger = files.find((f) => f.path === '.agents/agents/trace-debugger/agent.md');
    expect(traceDebugger?.source.text).toContain('4-Point Trace Triage');
    expect(traceDebugger?.source.text).toContain('Fail-Fast Real Bug Detection');
    expect(traceDebugger?.source.text).toContain('Isolated Test Execution');
    expect(traceDebugger?.source.text).toContain('Two-Strike Rule');
    expect(traceDebugger?.source.text).toContain('[FLAKY / TIMING]');
  });

  it('generates 6 operational skills for all supported AI assistants', () => {
    const files = planAiOperationalSkills([
      'antigravity',
      'claude',
      'cursor',
      'windsurf',
      'codex',
      'copilot',
    ]);
    // 7 skills * 4 assistants with 1 file each (antigravity, claude, cursor, codex) = 28
    // + windsurf: 6 skills * 1 file + map-site split into 2 files (map-site.md, map-site-update.md) = 8
    // + copilot: 7 skills * 2 files (prompt + skill) = 14
    // = 50
    expect(files.length).toBe(50);
    const paths = files.map((f) => f.path);

    expect(paths).toContain('.agents/skills/auth-setup.md');
    expect(paths).toContain('.agents/skills/scan-and-generate-pom.md');
    expect(paths).toContain('.agents/skills/automate-ticket.md');
    expect(paths).toContain('.agents/skills/heal-test.md');
    expect(paths).toContain('.agents/skills/bulk-rescan.md');
    expect(paths).toContain('.agents/skills/map-site.md');

    expect(paths).toContain('.claude/skills/auth-setup/SKILL.md');
    expect(paths).toContain('.cursor/skills/automate-ticket/SKILL.md');
    expect(paths).toContain('.windsurf/workflows/heal-test.md');
    expect(paths).toContain('.codex/skills/bulk-rescan/SKILL.md');
    expect(paths).toContain('.github/prompts/map-site.prompt.md');
    expect(paths).toContain('.github/skills/map-site/SKILL.md');

    // Windsurf's map-site is split into two self-contained workflow files (no confirmed
    // argument-substitution mechanism for Windsurf), unlike every other assistant's single
    // map-site entry with a create|update mode argument.
    expect(paths).toContain('.windsurf/workflows/map-site.md');
    expect(paths).toContain('.windsurf/workflows/map-site-update.md');
    const windsurfCreate = files.find((f) => f.path === '.windsurf/workflows/map-site.md');
    expect(windsurfCreate?.source.text).toContain('CREATE mode');
    const windsurfUpdate = files.find((f) => f.path === '.windsurf/workflows/map-site-update.md');
    expect(windsurfUpdate?.source.text).toContain('UPDATE mode');

    const mapSkill = files.find((f) => f.path === '.agents/skills/map-site.md');
    expect(mapSkill?.source.text).toContain('docs/site-map/site-map.json');
    expect(mapSkill?.source.text).toContain('Shared Widget Mining');
    expect(mapSkill?.source.text).toContain('Fan-Out to POM Engineers');
    expect(mapSkill?.source.text).not.toContain('APP_GRAPH.md');

    // Claude Code's map-site gets the create|update argument frontmatter and
    // disable-model-invocation (real side effects: live network crawl, file writes).
    const claudeMapSkill = files.find((f) => f.path === '.claude/skills/map-site/SKILL.md');
    expect(claudeMapSkill?.source.text).toContain('arguments: [mode]');
    expect(claudeMapSkill?.source.text).toContain('argument-hint: [create|update]');
    expect(claudeMapSkill?.source.text).toContain('disable-model-invocation: true');
    // A skill without disableModelInvocation set must not get the line at all.
    const claudeHealSkill = files.find((f) => f.path === '.claude/skills/heal-test/SKILL.md');
    expect(claudeHealSkill?.source.text).not.toContain('disable-model-invocation');

    const pomSkill = files.find((f) => f.path === '.agents/skills/scan-and-generate-pom.md');
    expect(pomSkill?.source.text).not.toContain('tests/pom-sanity');
    expect(pomSkill?.source.text).toContain('Tier 1: Uniqueness');
    expect(pomSkill?.source.text).toContain('Mandatory Execution & Self-Healing Loop');
    expect(pomSkill?.source.text).toContain('Mandatory Handoff Report');

    const automateSkill = files.find((f) => f.path === '.agents/skills/automate-ticket.md');
    expect(automateSkill?.source.text).toContain('tms-validator');
    expect(automateSkill?.source.text).toContain('Human Sign-Off Gateway');
    expect(automateSkill?.source.text).toContain('tests/TC-');

    const healSkill = files.find((f) => f.path === '.agents/skills/heal-test.md');
    expect(healSkill?.source.text).toContain('Fail-Fast Real Bug Detection');
    expect(healSkill?.source.text).toContain('Isolated Execution');
    expect(healSkill?.source.text).toContain('Two-Strike Rule');
  });

  it('renders ApiClient with TDM teardown registry and dynamic helpers, and fixtures with auto-cleanup', () => {
    const apiClientText = renderApiClient();
    expect(apiClientText).toContain('registerTeardown');
    expect(apiClientText).toContain('cleanup()');
    expect(apiClientText).toContain('createUniqueId');
    expect(apiClientText).toContain('createTestEmail');

    const fixturesText = renderFixtures();
    expect(fixturesText).toContain('apiClient: async ({ request }, use)');
    expect(fixturesText).toContain('await client.cleanup()');
  });

  it('includes MCP files, AI agents, and operational skills by DEFAULT with zero options', () => {
    const files = planSharedScaffold({});
    const paths = files.map((f) => f.path);

    // Overrides seed (create-if-absent, wired into planSharedScaffold by default)
    expect(paths).toContain('overrides/README.md');
    const overridesFile = files.find((f) => f.path === 'overrides/README.md');
    expect(overridesFile?.writePolicy).toBe('create-if-absent');
    expect(overridesFile?.provenance.origin).toBe('seed');

    // MCP
    expect(paths).toContain('.agents/mcp_config.json');
    expect(paths).toContain('.cursor/mcp.json');
    expect(paths).toContain('.mcp.json');
    expect(paths).toContain('.vscode/mcp.json');
    expect(paths).toContain('.codex/config.toml');
    expect(paths).not.toContain('.claude/mcp.json');
    expect(paths).not.toContain('.windsurf/mcp.json');
    expect(paths).not.toContain('.codex/mcp.json');

    // Site map (docs/site-map/ subfolder, not the old flat docs/ paths)
    expect(paths).toContain('docs/site-map/site-map.schema.json');
    expect(paths).toContain('docs/site-map/site-map.html');
    expect(paths).not.toContain('docs/site-map.schema.json');
    expect(paths).not.toContain('docs/app-graph.html');

    // Root Context & Layer 1
    expect(paths).toContain('AGENTS.md');
    expect(paths).toContain('CLAUDE.md');
    expect(paths).toContain('.windsurfrules');
    expect(paths).toContain('.github/copilot-instructions.md');
    expect(paths).toContain('CONVENTIONS.md');
    expect(paths).not.toContain('custom-instructions.md');

    // Agents
    expect(paths).toContain('.agents/agents/sdet-orchestrator/agent.md');
    expect(paths).toContain('.agents/agents/pom-engineer/agent.md');
    expect(paths).toContain('.cursor/skills/sdet-orchestrator/SKILL.md');
    expect(paths).toContain('.claude/agents/sdet-orchestrator.md');
    expect(paths).toContain('.windsurf/rules/agent-sdet-orchestrator.md');
    expect(paths).toContain('.codex/agents/sdet-orchestrator.toml');
    expect(paths).toContain('.github/agents/sdet-orchestrator.agent.md');

    // Skills
    expect(paths).toContain('.agents/skills/auth-setup.md');
    expect(paths).toContain('.agents/skills/scan-and-generate-pom.md');
    expect(paths).toContain('.agents/skills/automate-ticket.md');
    expect(paths).toContain('.agents/skills/heal-test.md');
    expect(paths).toContain('.agents/skills/bulk-rescan.md');

    // Negative assertions: ensure NO legacy duplicate skills are emitted
    expect(paths).not.toContain('.claude/skills/framework-harmonizer/SKILL.md');
    expect(paths).not.toContain('.cursor/skills/harmonize/SKILL.md');
    expect(paths).not.toContain('.windsurf/rules/harmonize.md');
    expect(paths).not.toContain('.agents/skills/framework-harmonizer.md');
    expect(paths).not.toContain('.codex/skills/framework-harmonizer/SKILL.md');
  });

  it('includes MCP files, AI agents, and operational skills in planSharedScaffold', () => {
    const files = planSharedScaffold({
      taskTracker: 'jira',
      tmsProviders: ['zephyr'],
      aiAssistants: ['antigravity', 'cursor', 'claude'],
    });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('.mcp/tms-bridge/index.js');
    expect(paths).toContain('.agents/mcp_config.json');
    expect(paths).toContain('.cursor/mcp.json');
    expect(paths).toContain('.mcp.json');
    expect(paths).not.toContain('.claude/mcp.json');
    expect(paths).not.toContain('.windsurf/mcp.json');
    expect(paths).not.toContain('.codex/mcp.json');
    expect(paths).not.toContain('.codex/config.toml');
    expect(paths).not.toContain('.vscode/mcp.json');
    expect(paths).toContain('.agents/agents/sdet-orchestrator/agent.md');
    expect(paths).toContain('.agents/skills/auth-setup.md');
    expect(paths).toContain('.cursor/skills/test-automator/SKILL.md');
    expect(paths).toContain('.claude/agents/assertion-auditor.md');
  });

  it('generates zero AI folders and zero MCP manifests when aiAssistants is empty array', () => {
    const files = planSharedScaffold({
      aiAssistants: [],
    });
    const paths = files.map((f) => f.path);

    expect(paths).not.toContain('.mcp.json');
    expect(paths).not.toContain('.cursor/mcp.json');
    expect(paths).not.toContain('.agents/mcp_config.json');
    expect(paths).not.toContain('.vscode/mcp.json');
    expect(paths).not.toContain('.codex/config.toml');
    expect(paths).not.toContain('CLAUDE.md');
    expect(paths).not.toContain('AGENTS.md');
    expect(paths).not.toContain('.windsurfrules');
    expect(paths).not.toContain('.github/copilot-instructions.md');
    expect(paths.some((p) => p.startsWith('.agents/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('.cursor/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('.claude/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('.windsurf/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('.codex/'))).toBe(false);
  });
});
