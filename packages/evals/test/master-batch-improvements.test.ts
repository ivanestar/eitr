import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { renderSiteMapHtml } from '../../engine/src/plan/templates/site-map-html.js';
import { planSharedScaffold } from '../../engine/src/plan/shared.js';
import { checkAiTooling } from '../../cli/src/commands/doctor.js';
import { planAiOperationalSkills } from '../../engine/src/plan/templates/ai-operational-skills.js';
import { planAiAgents } from '../../engine/src/plan/templates/ai-agents.js';
import { renderAuthSetupTs } from '../../engine/src/plan/templates/auth-setup.js';
import { renderGitHooks } from '../../engine/src/plan/templates/git-hooks.js';

describe('Master Batch: Complete SDET & Enterprise Enhancements', () => {
  const assistants = ['antigravity', 'claude', 'cursor', 'windsurf', 'codex', 'copilot'] as const;

  it('AC-1: renderSiteMapHtml generates a real site-map.json-driven viewer, not a static dashboard', () => {
    const html = renderSiteMapHtml('http://localhost:3000');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Site Map');
    expect(html).toContain("fetch('./site-map.json')");
    expect(html).toContain('filterRows');

    const files = planSharedScaffold({});
    const graphFile = files.find((f) => f.path === 'docs/site-map/site-map.html');
    expect(graphFile).toBeDefined();
    expect(graphFile?.writePolicy).toBe('create-if-absent');
  });

  it('AC-2: eitr doctor --ai diagnostic check function is available', async () => {
    expect(typeof checkAiTooling).toBe('function');
    const results = await checkAiTooling();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some(
        (r) => r.name.includes('Claude') || r.name.includes('Cursor') || r.name.includes('MCP'),
      ),
    ).toBe(true);
  });

  it('AC-3: MFA/SSO & API-Token Auth Bypass in /auth-setup and auth.setup.ts', () => {
    const skills = planAiOperationalSkills(assistants, 'playwright', 'typescript');
    const authSkill = skills.find((s) => s.path.includes('auth-setup'));
    expect(authSkill).toBeDefined();

    const skillContent = (authSkill?.source as { text: string }).text;
    expect(skillContent).toContain('MFA');
    expect(skillContent).toContain('TOTP');
    expect(skillContent).toContain('API Fast-Path Token');

    const authSetupCode = renderAuthSetupTs({
      baseUrl: 'http://localhost:3000',
      storageStatePath: '.auth/user.json',
    });
    expect(authSetupCode).toContain('TOTP_SECRET');
  });

  it('AC-5: Batch Proposal Matrix in /automate-ticket', () => {
    const skills = planAiOperationalSkills(assistants, 'playwright', 'typescript');
    const automateSkill = skills.find((s) => s.path.includes('automate-ticket'));
    expect(automateSkill).toBeDefined();

    const automateContent = (automateSkill?.source as { text: string }).text;
    expect(automateContent).toContain('Batch Proposal Matrix');
    expect(automateContent).toContain('1-Click Batch Approval');
  });

  it('AC-6: Parallel Worker Swarm in /bulk-rescan', () => {
    const skills = planAiOperationalSkills(assistants, 'playwright', 'typescript');
    const rescanSkill = skills.find((s) => s.path.includes('bulk-rescan'));
    expect(rescanSkill).toBeDefined();

    const rescanContent = (rescanSkill?.source as { text: string }).text;
    expect(rescanContent).toContain('Worker Swarm');
    expect(rescanContent).toContain('Fan-Out / Fan-In');
  });

  it('AC-7: Specialized CPOM Primitives (DragAndDrop, Canvas) are taught patterns, not pre-generated files', () => {
    // Situational primitives (Slider, DragAndDrop, Canvas) are deliberately NOT unconditionally
    // scaffolded (docs/architecture/known-gaps.md-adjacent decision, 2026-08-31) - most target
    // apps never touch one. pom-engineer synthesizes the compliant file on demand instead.
    const dndPath = path.resolve(
      process.cwd(),
      'packages/engine/assets/runtime/components/primitives/drag-and-drop.ts',
    );
    const canvasPath = path.resolve(
      process.cwd(),
      'packages/engine/assets/runtime/components/primitives/canvas.ts',
    );
    expect(fs.existsSync(dndPath)).toBe(false);
    expect(fs.existsSync(canvasPath)).toBe(false);

    const files = planSharedScaffold({ language: 'typescript', automationTool: 'playwright' });
    expect(files.map((f) => f.path)).not.toContain('components/primitives/drag-and-drop.ts');
    expect(files.map((f) => f.path)).not.toContain('components/primitives/canvas.ts');

    const architectPrompt = planAiAgents(assistants, 'playwright', 'typescript')
      .map((f) => (f.source as { text: string }).text)
      .join('\n');
    expect(architectPrompt).toContain('DragAndDrop');
    expect(architectPrompt).toContain('dragByOffset');
    expect(architectPrompt).toContain('clickAtRelative');
  });

  it('AC-8: Git Pre-Commit Hook template generation', () => {
    // TS/Playwright hook must use real scripts that exist in the generated package.json
    const hook = renderGitHooks('typescript', 'playwright');
    expect(hook).toContain('npm run lint:cpom');
    expect(hook).toContain('npm run lint:eslint');
    expect(hook).toContain('npm test');
    // Must NOT emit EITR-internal script names that are absent from generated projects
    expect(hook).not.toContain('npm run eval');
    expect(hook).not.toContain('npm run lint\n');

    // Python hook must use native commands
    const pyHook = renderGitHooks('python', 'playwright');
    expect(pyHook).toContain('pytest');
    expect(pyHook).not.toContain('npm run eval');

    // Java+Maven hook must use mvn
    const javaHook = renderGitHooks('java', 'playwright-maven');
    expect(javaHook).toContain('mvn test -q');
    expect(javaHook).not.toContain('npm run eval');

    const files = planSharedScaffold({});
    const hookFile = files.find(
      (f) => f.path.includes('.githooks/pre-commit') || f.path.includes('.husky/pre-commit'),
    );
    expect(hookFile).toBeDefined();
  });

  it('AC-9 & AC-10: Zero-Emoji and Zero Lock-in compliance', () => {
    const html = renderSiteMapHtml('http://localhost:3000');
    const hook = renderGitHooks();

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(html)).toBe(false);
    expect(emojiRegex.test(hook)).toBe(false);
  });
});
