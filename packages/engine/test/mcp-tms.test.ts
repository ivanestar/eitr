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
    // 6 unique files: .agents/mcp_config.json (antigravity), .cursor/mcp.json (cursor),
    // .mcp.json (claude + copilot, shared), .vscode/mcp.json (copilot), .codex/config.toml (codex),
    // .devin/mcp_config.json (devin - project-scoped MCP support since the Windsurf rebrand).
    expect(files.length).toBe(6);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('.agents/mcp_config.json');
    expect(paths).toContain('.cursor/mcp.json');
    expect(paths).toContain('.mcp.json');
    expect(paths).toContain('.vscode/mcp.json');
    expect(paths).toContain('.codex/config.toml');
    expect(paths).toContain('.devin/mcp_config.json');
    expect(paths).not.toContain('.claude/mcp.json');
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

    // VS Code's native MCP schema is structurally different from every other assistant here, not
    // just a different path: top-level "servers" (not "mcpServers"), each entry explicitly typed.
    // Reusing the "mcpServers" shape would produce a file VS Code / Copilot Chat silently never
    // reads any servers from - live-verified Sept 2026 against code.visualstudio.com's own docs.
    const vscodeConfig = files.find((f) => f.path === '.vscode/mcp.json');
    const vscodeJson = JSON.parse(vscodeConfig?.source.text ?? '{}');
    expect(vscodeJson.servers).toBeDefined();
    expect(vscodeJson.mcpServers).toBeUndefined();
    expect(vscodeJson.servers.playwright.type).toBe('stdio');
    expect(vscodeJson.servers.playwright.command).toBe('npx');
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

    // Devin Desktop gets its own project-scoped .devin/mcp_config.json; Codex CLI gets its own
    // TOML file instead of a JSON path.
    const devinCodex = planMcpConfigs('none', [], true, ['devin', 'codex']);
    expect(devinCodex.map((f) => f.path).sort()).toEqual([
      '.codex/config.toml',
      '.devin/mcp_config.json',
    ]);

    const unknownAssistant = planMcpConfigs('none', [], true, ['aider', 'unknown']);
    expect(unknownAssistant).toEqual([]);

    // 'copilot' writes to both real Copilot surfaces: the VS Code extension (.vscode/mcp.json)
    // and the standalone Copilot CLI (root .mcp.json) - not just one.
    const copilotOnly = planMcpConfigs('none', [], true, ['copilot']);
    expect(copilotOnly.map((f) => f.path).sort()).toEqual(['.mcp.json', '.vscode/mcp.json']);
  });

  it('generates 6 specialized SDET agents for all supported assistants (Antigravity, Claude, Cursor, Devin, Codex, Copilot)', () => {
    const files = planAiAgents(['antigravity', 'claude', 'cursor', 'devin', 'codex', 'copilot']);
    expect(files.length).toBe(36); // 6 agents * 6 assistants
    const paths = files.map((f) => f.path);

    expect(paths).toContain('.agents/agents/sdet-orchestrator/agent.md');
    expect(paths).toContain('.agents/agents/tms-validator/agent.md');
    expect(paths).toContain('.agents/agents/sdet-architect/agent.md');
    expect(paths).toContain('.agents/agents/pom-engineer/agent.md');
    expect(paths).toContain('.agents/agents/test-data-engineer/agent.md');
    expect(paths).toContain('.agents/agents/assertion-auditor/agent.md');

    expect(paths).toContain('.claude/agents/sdet-orchestrator.md');
    expect(paths).toContain('.claude/agents/tms-validator.md');
    expect(paths).toContain('.cursor/skills/tms-validator/SKILL.md');
    expect(paths).toContain('.cursor/skills/pom-engineer/SKILL.md');
    expect(paths).toContain('.devin/rules/agent-tms-validator.md');
    expect(paths).toContain('.devin/rules/agent-assertion-auditor.md');
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
    // ADR 0012 Stage 2 (/define-test-conditions) shipped without this Workflow Execution
    // Steps entry ever being updated - regression guard against that same gap recurring.
    expect(orchestrator?.source.text).toContain('/define-test-conditions');

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
    // Component reuse: an existing scaffolded primitive/widget must be composed, never
    // re-implemented inline - found missing (only widget reuse was covered) from a live Page
    // Object review, then found scoped too narrowly to "primitives" alone on a second review.
    expect(pomEngineer?.source.text).toContain('Component Reuse Order');
    expect(pomEngineer?.source.text).toContain('Never hand-roll an ad hoc locator');
    // Completeness: a Page Object missing real interactive elements (only generic landmarks) is a
    // real gap, not a minimal result - found in the exact same live review (a route's own
    // extracted test-condition parameter had no matching Page Object child at all).
    expect(pomEngineer?.source.text).toContain(
      'Every Known Interactive Element Must Be Represented',
    );
    expect(pomEngineer?.source.text).toContain('test-conditions.json');
    expect(pomEngineer?.source.text).not.toContain('test:sanity');

    const testDataEngineer = files.find(
      (f) => f.path === '.agents/agents/test-data-engineer/agent.md',
    );
    expect(testDataEngineer?.source.text).toContain('Structured/bulk datasets');
    expect(testDataEngineer?.source.text).toContain('fixtures/synthetic-data/');

    const auditor = files.find((f) => f.path === '.agents/agents/assertion-auditor/agent.md');
    expect(auditor?.source.text).toContain('Anti-Fake-Green Check');
    expect(auditor?.source.text).toContain('Web-First Auto-Retrying Assertions');
    expect(auditor?.source.text).toContain('Unawaited Promise Guard');
    expect(auditor?.source.text).toContain('Multi-Source Corroboration & Network Interception');
    // Extended from a fixed UI+API pair after live use kept every corroborating check capped at
    // exactly 2 layers even when a toast or a secondary list endpoint was genuinely available.
    expect(auditor?.source.text).toContain('floor, not the ceiling');
    expect(auditor?.source.text).toContain('Mutation Analysis Protocol');
    expect(auditor?.source.text).toContain('Zero-Emoji Compliance');
  });

  it('generates one file per operational skill per assistant', () => {
    const files = planAiOperationalSkills([
      'antigravity',
      'claude',
      'cursor',
      'devin',
      'codex',
      'copilot',
    ]);
    // Four assistants get 1 file per skill (claude, cursor, codex, and the merged
    // antigravity+devin pair sharing one .agents/skills/ descriptor set); copilot gets 2 (a prompt
    // and a skill). Derived from the skill set rather than hardcoded, so adding a skill does not
    // mean editing an arithmetic comment that nobody would notice going stale.
    const skillCount = files.filter((f) => f.path.startsWith('.claude/skills/')).length;
    expect(skillCount).toBeGreaterThan(0);
    expect(files.length).toBe(skillCount * 4 + skillCount * 2);
    const paths = files.map((f) => f.path);

    expect(paths).toContain('.agents/skills/map-features/SKILL.md');
    expect(paths).toContain('.claude/skills/map-features/SKILL.md');
    expect(paths).toContain('.agents/skills/auth-setup/SKILL.md');
    expect(paths).toContain('.agents/skills/scan-and-generate-pom/SKILL.md');
    expect(paths).toContain('.agents/skills/automate-test/SKILL.md');
    expect(paths).toContain('.agents/skills/heal-test/SKILL.md');
    expect(paths).toContain('.agents/skills/bulk-rescan/SKILL.md');
    expect(paths).toContain('.agents/skills/map-site/SKILL.md');

    expect(paths).toContain('.claude/skills/auth-setup/SKILL.md');
    expect(paths).toContain('.cursor/skills/automate-test/SKILL.md');
    expect(paths).toContain('.codex/skills/bulk-rescan/SKILL.md');
    expect(paths).toContain('.github/prompts/map-site.prompt.md');
    expect(paths).toContain('.github/skills/map-site/SKILL.md');

    // Devin Desktop discovers skills from the exact same shared .agents/skills/ path as
    // Antigravity (both confirmed 2026) - a single descriptor set covers both, never doubled.
    expect(paths.filter((p) => p === '.agents/skills/map-site/SKILL.md')).toHaveLength(1);

    const mapSkill = files.find((f) => f.path === '.agents/skills/map-site/SKILL.md');
    expect(mapSkill?.source.text).toContain('artifacts/site-map/site-map.json');
    expect(mapSkill?.source.text).toContain('Shared Widgets (script-driven, every pass)');
    expect(mapSkill?.source.text).toContain('node scripts/page-inventory.mjs shared');
    expect(mapSkill?.source.text).toContain('node scripts/page-inventory.mjs record');
    expect(mapSkill?.source.text).toContain('Fan-Out to POM Engineers');
    expect(mapSkill?.source.text).not.toContain('APP_GRAPH.md');

    // Mechanical Shape Gate for site-map.json runs
    // right after either create/update mode writes the file, before shared-widget mining reads it.
    expect(mapSkill?.source.text).toContain('validate-site-map.mjs');
    expect(mapSkill?.source.text).toContain('Mechanical Shape Gate');

    // Coverage Cross-Check (sitemap.xml/robots.txt, optional signal) - never a blocking gate, a
    // SKIPPED result is the normal outcome for the many sites that publish no sitemap.xml at all.
    expect(mapSkill?.source.text).toContain('check-sitemap-coverage.mjs');
    expect(mapSkill?.source.text).toContain('Coverage Cross-Check');
    expect(mapSkill?.source.text).toContain('Optional Signal');

    // map-site declares `arguments: ['mode']`, so the shared antigravity+devin rendering must
    // explain that neither assistant has a slash-command argument mechanism - live-verified
    // 2026-09-03/2026-09-06 (skills are activated autonomously from description, or requested by
    // name in chat, on both).
    expect(mapSkill?.source.text).toContain('> **Note:**');
    expect(mapSkill?.source.text).toContain('no slash-command argument mechanism');

    // Crawl bounds used to be asserted here as the concrete numbers the prose named. They are no
    // longer prose at all: scripts/crawl-budget.mjs enforces them, because a run that followed a
    // pagination chain 5441 times proved a number written in a skill is not a bound. What the skill
    // must now say is that the script owns the frontier and that its answers are obeyed.
    expect(mapSkill?.source.text).toContain('scripts/crawl-budget.mjs` owns the frontier');
    expect(mapSkill?.source.text).toContain('node scripts/crawl-budget.mjs check --url=');
    expect(mapSkill?.source.text).not.toContain('maximum crawl depth of 6 hops');
    expect(mapSkill?.source.text).not.toContain('maximum of 500 pages visited');
    // The early-warning channel: the content signature that detects a trap, and the instruction to
    // relay a warning the moment it appears rather than saving it for the summary.
    expect(mapSkill?.source.text).toContain('--content-hash');
    expect(mapSkill?.source.text).toContain('it is the trap detector');
    expect(mapSkill?.source.text).toContain('show it to the human immediately, verbatim');
    // The one guard a same-URL infinite feed can hit, since no other check ever sees such a page.
    expect(mapSkill?.source.text).toContain('node scripts/crawl-budget.mjs scroll --url=');
    expect(mapSkill?.source.text).toContain('Bad: `routeId: "users-id"`');
    expect(mapSkill?.source.text).toContain('Good: `routeId:');

    // The crawl's own deliverable is the route list, and that is what it asks a human to sign off
    // on. What each page is FOR moved to /map-features, so this skill must no longer claim it.
    expect(mapSkill?.source.text).toContain('--kind=site-map');
    expect(mapSkill?.source.text).toContain('do not reformat, reorder, or add to what it prints');
    expect(mapSkill?.source.text).toContain('What each page is FOR is not decided here');
    expect(mapSkill?.source.text).not.toContain('Business-Intent Review Artifact');
    expect(mapSkill?.source.text).not.toContain('Core-Purpose Inference');

    // No internal-mechanics narration to the end user (routine gate success is implementation
    // detail, not user-facing signal).
    expect(mapSkill?.source.text).toContain('## Reporting to the User');
    expect(mapSkill?.source.text).toContain('never name an internal script file');

    // Reuses the existing Level-2 fan-out - no bespoke dispatch mechanism.
    expect(mapSkill?.source.text).toContain('orchestrate-swarm.mjs --phase=plan');

    // Mode Resolution: deterministically resolved by scripts/map-site-status.mjs (not re-derived
    // in prose), whose noticeMessage the skill must print verbatim, never paraphrased.
    expect(mapSkill?.source.text).toContain('## Mode Resolution');
    expect(mapSkill?.source.text).toContain('node scripts/map-site-status.mjs');
    expect(mapSkill?.source.text).toContain('resolvedMode');
    expect(mapSkill?.source.text).toContain('noticeMessage');
    expect(mapSkill?.source.text).toContain('never paraphrase or shorten it');
    // The routeId-reset consequence itself is still documented in the Purpose section.
    expect(mapSkill?.source.text).toContain("every route's");
    expect(mapSkill?.source.text).toContain('identity resets too');

    // routeId generation/stability rule: generated once at first discovery, never derived from
    // the path template, and update mode never reassigns it for an already-known route.
    expect(mapSkill?.source.text).toContain('Never derive it from the path template');
    expect(mapSkill?.source.text).toContain(
      "This route's `routeId` MUST stay exactly as it already is",
    );

    // Crawl coverage/truncation signal: presence-vs-absence idiom, matching lastUpdatedAt's own.
    expect(mapSkill?.source.text).toContain('"boundedBy": "maxDepth" | "maxPages"');
    expect(mapSkill?.source.text).toContain('its absence means completeness');

    // PII/session-data guard on what the crawl records from live traffic.
    expect(mapSkill?.source.text).toContain('unredacted PII-shaped payload value');

    // The crawl's own gates render identically into every map-site-bearing generated path.
    const mapSiteBearingPaths = [
      '.agents/skills/map-site/SKILL.md',
      '.claude/skills/map-site/SKILL.md',
      '.cursor/skills/map-site/SKILL.md',
      '.codex/skills/map-site/SKILL.md',
      '.github/prompts/map-site.prompt.md',
      '.github/skills/map-site/SKILL.md',
    ];
    for (const p of mapSiteBearingPaths) {
      const f = files.find((file) => file.path === p);
      expect(f?.source.text, `${p} should exist`).toBeDefined();
      expect(f?.source.text, `${p} should reference the site-map validator`).toContain(
        'validate-site-map.mjs',
      );
      expect(f?.source.text, `${p} should not claim per-route intent any more`).not.toContain(
        'validate-business-intent.mjs',
      );
    }

    // Per-route intent moved here whole: the same read-only allowlist, the same criticality
    // checklist, the same evidence-anchored confidence rule, and the same purpose confirmation -
    // one stage, one artifact, one review.
    const featuresSkill = files.find((f) => f.path === '.agents/skills/map-features/SKILL.md');
    expect(featuresSkill?.source.text).toBeDefined();
    const prohibitionSentence =
      'Never call `.click()`, `.fill()`, `.check()`, `.selectOption()`, or any other action method';
    expect(featuresSkill?.source.text).toContain(prohibitionSentence);
    expect(featuresSkill?.source.text).toContain('sourceContentHash');
    expect(featuresSkill?.source.text).toContain('skip re-inference entirely');
    expect(featuresSkill?.source.text).toContain('payment/checkout/billing');
    expect(featuresSkill?.source.text).toContain('MAXIMUM tier found on them');
    expect(featuresSkill?.source.text).toContain('how bad is it if this route is broken');
    expect(featuresSkill?.source.text).toContain(
      'when a keyword and the actual consequence disagree',
    );
    expect(featuresSkill?.source.text).toContain('This is a definition, not the leftover bucket');
    expect(featuresSkill?.source.text).toContain('There is no level above');
    expect(featuresSkill?.source.text).toContain(
      'Confidence is computed from evidence signal strength',
    );
    expect(featuresSkill?.source.text).toContain('Criticality Re-Derivation');
    expect(featuresSkill?.source.text).toContain('mostLikelyIndex');
    expect(featuresSkill?.source.text).toContain('not a mechanism trace');
    expect(featuresSkill?.source.text).toContain('--kind=feature-map');
    expect(featuresSkill?.source.text).toContain('never shown to the human');
    expect(featuresSkill?.source.text).toContain('a label, <=40 characters');
    expect(featuresSkill?.source.text).toContain('<=100 char');
    expect(featuresSkill?.source.text).toContain('[REDACTED]');

    // Claude Code's map-site gets the create|update argument frontmatter and
    // disable-model-invocation (real side effects: live network crawl, file writes).
    const claudeMapSkill = files.find((f) => f.path === '.claude/skills/map-site/SKILL.md');
    expect(claudeMapSkill?.source.text).toContain('arguments: [mode]');
    // Must be YAML-double-quoted - an unquoted value starting with "[" parses as a flow-sequence
    // (array), not a string, which is exactly the "'argument-hint' attribute must be a string"
    // validation error a real generated project hit before this was fixed.
    expect(claudeMapSkill?.source.text).toContain('argument-hint: "[create|update]"');
    expect(claudeMapSkill?.source.text).toContain('disable-model-invocation: true');
    // A skill without disableModelInvocation set must not get the line at all.
    const claudeHealSkill = files.find((f) => f.path === '.claude/skills/heal-test/SKILL.md');
    expect(claudeHealSkill?.source.text).not.toContain('disable-model-invocation');

    const pomSkill = files.find((f) => f.path === '.agents/skills/scan-and-generate-pom/SKILL.md');
    // scan-and-generate-pom declares no `arguments`, so it must NOT get the no-argument-mechanism
    // note - only skills with real argument-based mode selection need it.
    expect(pomSkill?.source.text).not.toContain('> **Note:**');
    expect(pomSkill?.source.text).not.toContain('tests/pom-sanity');
    expect(pomSkill?.source.text).toContain('Tier 1 (Actionable Visibility');
    expect(pomSkill?.source.text).toContain('locator.click({ trial: true })');
    expect(pomSkill?.source.text).toContain('Mandatory Execution & Self-Healing Loop');
    expect(pomSkill?.source.text).toContain('Mandatory Handoff Report');

    const defineTestConditionsSkill = files.find(
      (f) => f.path === '.agents/skills/define-test-conditions/SKILL.md',
    );
    // Progressive-disclosure reveal exception: reported from live use as under-extracting
    // parameters on forms where a checkbox/select/field reveals more fields. Allowed strictly
    // bounded (one probe at a time, always reset) and never a submit-shaped button.
    expect(defineTestConditionsSkill?.source.text).toContain(
      '.check()`/`.uncheck()` on checkboxes and radio buttons',
    );
    expect(defineTestConditionsSkill?.source.text).toContain('Absolute ban, no exception, ever');
    expect(defineTestConditionsSkill?.source.text).toContain(
      'submit/create/delete/send-shaped ARIA role',
    );
    expect(defineTestConditionsSkill?.source.text).toContain('Bounded and reset');

    const automateSkill = files.find((f) => f.path === '.agents/skills/automate-test/SKILL.md');
    expect(automateSkill?.source.text).toContain('tms-validator');
    expect(automateSkill?.source.text).toContain('Human Sign-Off Gateway');
    expect(automateSkill?.source.text).toContain('tests/TC-');
    expect(automateSkill?.source.text).toContain('artifacts/test-cases/test-cases.json');
    // Content fidelity: structurally-compliant-but-semantically-empty code (correct test.step()/
    // fixture DI but an assertion unrelated to what the step claims) was reported from live use.
    expect(automateSkill?.source.text).toContain('Content fidelity is mandatory');
    expect(automateSkill?.source.text).toContain('never a content-free assertion');
    // Bracketed step text grounds the synthesized locator's accessible name - direct link from
    // /design-test-cases' bracket vocabulary to /automate-test's own locator code.
    expect(automateSkill?.source.text).toContain("locator's name, verbatim");
    // Multi-source corroboration: seven checkable assertion rules replaced the old free-form
    // "corroborate with every genuinely available signal" prose - Rule 2 is the UI+API floor
    // (now two independent channels), Rule 7 is "must be able to fail" (a mutation-testing-style
    // check), both mechanically checkable by assertion-auditor rather than left to judgment.
    expect(automateSkill?.source.text).toContain('The Assertion Rules');
    expect(automateSkill?.source.text).toContain('Two independent channels for any state change');
    expect(automateSkill?.source.text).toContain('Every assertion must be able to fail');
    expect(automateSkill?.source.text).toContain(
      'Corroboration is bounded by what the application actually provides',
    );
    // Self-referential compliance narration ("CPOM contract strictly honored: ...") was reported
    // from a live final report - global rule, checked here since automate-test's own report step
    // is exactly where it appeared.
    expect(automateSkill?.source.text).toContain('never recite which internal rule');

    const designTestCasesSkill = files.find(
      (f) => f.path === '.agents/skills/design-test-cases/SKILL.md',
    );
    expect(designTestCasesSkill?.source.text).toContain(
      'No reviewed test conditions found. Run /define-test-conditions and complete its Human Sign-Off Gateway before designing test cases.',
    );
    expect(designTestCasesSkill?.source.text).toContain('scripts/compose-journeys.mjs');
    // Deliberate departure from every earlier stage's blocking gate - never a "BLOCKING GATE"
    // phrase (used by /automate-test's own Step 4) here.
    expect(designTestCasesSkill?.source.text).not.toContain('BLOCKING GATE');
    expect(designTestCasesSkill?.source.text).toContain(
      'Do not ask for approval of the drafts themselves before finishing',
    );
    // Test-case quality: atomic per-step verification, not a blanket result at the end - raised
    // from a live-use complaint that drafted test cases read too generically.
    expect(designTestCasesSkill?.source.text).toContain('One atomic action per step');
    expect(designTestCasesSkill?.source.text).toContain('Good example');
    expect(designTestCasesSkill?.source.text).toContain('Bad example');
    // Bracketed-literal-name vocabulary: any specific on-screen name in a step must be bracketed,
    // so /automate-test can ground its locators directly in that text.
    expect(designTestCasesSkill?.source.text).toContain('Bracket every literal on-screen name');
    expect(designTestCasesSkill?.source.text).toContain('Click the [X] button');
    expect(designTestCasesSkill?.source.text).toContain('Select the [X] dropdown > [Y] option');
    expect(designTestCasesSkill?.source.text).toContain('Select the [Standard] shipping method');
    // Test-Cases Review Artifact: the drafted content itself is shown, not just a count - and the
    // optional TMS-recording question, only when a provider is configured.
    expect(designTestCasesSkill?.source.text).toContain('Test-Cases Review Artifact');
    expect(designTestCasesSkill?.source.text).toContain(
      'a stage that drafts real content and reports only a count defeats the point',
    );
    expect(designTestCasesSkill?.source.text).toContain('also recorded there as test cases');
    expect(designTestCasesSkill?.source.text).toContain(
      'gives `/automate-test` nothing to assert on',
    );

    const healSkill = files.find((f) => f.path === '.agents/skills/heal-test/SKILL.md');
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
    expect(fixturesText).toContain('apiClient: async ({ context }, use)');
    expect(fixturesText).toContain('await client.cleanup()');
  });

  it('includes MCP files, AI agents, and operational skills by DEFAULT with zero options', () => {
    const files = planSharedScaffold({});
    const paths = files.map((f) => f.path);

    // No overrides/ seed - a deliberately removed extension point, never re-added (users extend
    // the generated component library directly from their own Page Objects instead).
    expect(paths).not.toContain('overrides/README.md');

    // MCP
    expect(paths).toContain('.agents/mcp_config.json');
    expect(paths).toContain('.cursor/mcp.json');
    expect(paths).toContain('.mcp.json');
    expect(paths).toContain('.vscode/mcp.json');
    expect(paths).toContain('.codex/config.toml');
    expect(paths).toContain('.devin/mcp_config.json');
    expect(paths).not.toContain('.claude/mcp.json');
    expect(paths).not.toContain('.codex/mcp.json');

    // Site map (artifacts/site-map/ subfolder, not the old flat docs/ paths from before either
    // the .scaffold/ schema move or the docs->artifacts rename). No HTML viewer - removed
    // deliberately (maintainer decision, 2026-09-02): fetch() to a sibling local file is blocked
    // under file://, the viewer had already drifted behind the schema (no coverage/routeId/
    // business-intent.json awareness), and an AI-assistant-driven SDET has a strictly better
    // interface to the same data already (ask the assistant) - see known-gaps.md.
    expect(paths).toContain('.scaffold/schemas/site-map.schema.json');
    expect(paths).not.toContain('docs/site-map.schema.json');
    expect(paths).not.toContain('docs/app-graph.html');
    expect(paths).not.toContain('docs/site-map/site-map.html');

    // Root Context & Layer 1
    expect(paths).toContain('AGENTS.md');
    expect(paths).toContain('CLAUDE.md');
    expect(paths).toContain('.github/copilot-instructions.md');
    expect(paths).toContain('CONVENTIONS.md');
    expect(paths).not.toContain('custom-instructions.md');

    // Path/glob-scoped rule files (Cursor, Devin Desktop, Copilot path-scoped supplements)
    expect(paths).toContain('.cursor/rules/harmonize.mdc');
    expect(paths).toContain('.cursor/rules/api.mdc');
    expect(paths).toContain('.devin/rules/harmonize.md');
    expect(paths).toContain('.devin/rules/api.md');
    expect(paths).toContain('.github/instructions/harmonize.instructions.md');
    expect(paths).toContain('.github/instructions/api.instructions.md');

    // Agents
    expect(paths).toContain('.agents/agents/sdet-orchestrator/agent.md');
    expect(paths).toContain('.agents/agents/pom-engineer/agent.md');
    expect(paths).toContain('.cursor/skills/sdet-orchestrator/SKILL.md');
    expect(paths).toContain('.claude/agents/sdet-orchestrator.md');
    expect(paths).toContain('.devin/rules/agent-sdet-orchestrator.md');
    expect(paths).toContain('.codex/agents/sdet-orchestrator.toml');
    expect(paths).toContain('.github/agents/sdet-orchestrator.agent.md');

    // Skills
    expect(paths).toContain('.agents/skills/auth-setup/SKILL.md');
    expect(paths).toContain('.agents/skills/scan-and-generate-pom/SKILL.md');
    expect(paths).toContain('.agents/skills/automate-test/SKILL.md');
    expect(paths).toContain('.agents/skills/heal-test/SKILL.md');
    expect(paths).toContain('.agents/skills/bulk-rescan/SKILL.md');

    // Negative assertions: ensure NO legacy duplicate skills are emitted
    expect(paths).not.toContain('.claude/skills/framework-harmonizer/SKILL.md');
    expect(paths).not.toContain('.cursor/skills/harmonize/SKILL.md');
    expect(paths).not.toContain('.agents/skills/framework-harmonizer/SKILL.md');
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
    expect(paths).not.toContain('.codex/mcp.json');
    expect(paths).not.toContain('.codex/config.toml');
    expect(paths).not.toContain('.vscode/mcp.json');
    expect(paths).not.toContain('.devin/mcp_config.json');
    expect(paths).toContain('.agents/agents/sdet-orchestrator/agent.md');
    expect(paths).toContain('.agents/skills/auth-setup/SKILL.md');
    expect(paths).toContain('.cursor/skills/pom-engineer/SKILL.md');
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
    expect(paths).not.toContain('.github/copilot-instructions.md');
    expect(paths.some((p) => p.startsWith('.agents/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('.cursor/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('.claude/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('.devin/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('.codex/'))).toBe(false);
  });
});
