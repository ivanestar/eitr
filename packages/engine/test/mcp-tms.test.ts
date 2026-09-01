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
    expect(files.length).toBe(6);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('.mcp.json');
    expect(paths).toContain('.cursor/mcp.json');
    expect(paths).toContain('.claude/mcp.json');
    expect(paths).toContain('.vscode/mcp.json');
    expect(paths).toContain('.windsurf/mcp.json');
    expect(paths).toContain('.codex/mcp.json');

    const cursorConfig = files.find((f) => f.path === '.cursor/mcp.json');
    expect(cursorConfig?.source.text).toContain('testrail');
    expect(cursorConfig?.source.text).toContain('.mcp/tms-bridge/index.js');
    expect(cursorConfig?.source.text).toContain('@modelcontextprotocol/server-playwright');
    expect(cursorConfig?.source.text).toContain('HTTP_PROXY');
    expect(cursorConfig?.source.text).toContain('PLAYWRIGHT_DOWNLOAD_HOST');
  });

  it('generates MCP configs ONLY for selected AI assistants and empty lists', () => {
    const cursorOnly = planMcpConfigs('none', ['testrail'], true, ['cursor']);
    expect(cursorOnly.map((f) => f.path)).toEqual(['.cursor/mcp.json']);

    const empty = planMcpConfigs('none', ['testrail'], true, []);
    expect(empty).toEqual([]);

    const aliases = planMcpConfigs('none', [], true, ['antigravity', 'claude', 'vscode']);
    expect(aliases.map((f) => f.path)).toEqual([
      '.mcp.json',
      '.claude/mcp.json',
      '.vscode/mcp.json',
    ]);

    const windsurfCodex = planMcpConfigs('none', [], true, ['windsurf', 'codex']);
    expect(windsurfCodex.map((f) => f.path)).toEqual(['.windsurf/mcp.json', '.codex/mcp.json']);

    const unknownAssistant = planMcpConfigs('none', [], true, ['aider', 'unknown']);
    expect(unknownAssistant).toEqual([]);
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
    expect(files.length).toBe(49); // 7 skills * 5 + (7 prompts + 7 skills for copilot)
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

    const mapSkill = files.find((f) => f.path === '.agents/skills/map-site.md');
    expect(mapSkill?.source.text).toContain('docs/site-map.json');
    expect(mapSkill?.source.text).toContain('Shared Widget Mining');
    expect(mapSkill?.source.text).toContain('Fan-Out to POM Engineers');

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
    expect(paths).toContain('.mcp.json');
    expect(paths).toContain('.cursor/mcp.json');
    expect(paths).toContain('.claude/mcp.json');
    expect(paths).toContain('.vscode/mcp.json');
    expect(paths).toContain('.windsurf/mcp.json');
    expect(paths).toContain('.codex/mcp.json');

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
    expect(paths).toContain('.mcp.json');
    expect(paths).toContain('.cursor/mcp.json');
    expect(paths).toContain('.claude/mcp.json');
    expect(paths).not.toContain('.windsurf/mcp.json');
    expect(paths).not.toContain('.codex/mcp.json');
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
    expect(paths).not.toContain('.claude/mcp.json');
    expect(paths).not.toContain('.vscode/mcp.json');
    expect(paths).not.toContain('.windsurf/mcp.json');
    expect(paths).not.toContain('.codex/mcp.json');
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
