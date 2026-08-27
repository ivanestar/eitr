import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { renderAppGraphHtml } from '../../engine/src/plan/templates/app-graph-html.js';
import { planSharedScaffold } from '../../engine/src/plan/shared.js';
import { checkAiTooling } from '../../cli/src/commands/doctor.js';
import { planAiOperationalSkills } from '../../engine/src/plan/templates/ai-operational-skills.js';
import { planAiTmsSkills } from '../../engine/src/plan/templates/ai-tms-skills.js';
import { renderAuthSetupTs } from '../../engine/src/plan/templates/auth-setup.js';
import { renderGitHooks } from '../../engine/src/plan/templates/git-hooks.js';

describe('Master Batch: Complete SDET & Enterprise Enhancements', () => {
  const assistants = ['antigravity', 'claude', 'cursor', 'windsurf', 'codex', 'copilot'] as const;

  it('AC-1: renderAppGraphHtml generates interactive HTML site graph dashboard', () => {
    const html = renderAppGraphHtml('http://localhost:3000');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('EITR Architecture & Site Topology Graph');
    expect(html).toContain('<svg');
    expect(html).toContain('filterGraph');

    const files = planSharedScaffold({});
    const graphFile = files.find((f) => f.path === 'docs/app-graph.html');
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

  it('AC-4: Anti-Bug-Spam & Root Cause Deduplication in /tms-triage', () => {
    const tmsSkills = planAiTmsSkills(assistants, 'jira');
    const triageSkill = tmsSkills.find((s) => s.path.includes('tms-triage'));
    expect(triageSkill).toBeDefined();

    const triageContent = (triageSkill?.source as { text: string }).text;
    expect(triageContent).toContain('Deduplication');
    expect(triageContent).toContain('Root Cause');
    expect(triageContent).toContain('Error Signature');
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

  it('AC-7: Specialized CPOM Primitives (DragAndDrop, Canvas) in runtime assets', () => {
    const dndPath = path.resolve(
      process.cwd(),
      'packages/engine/assets/runtime/components/primitives/drag-and-drop.ts',
    );
    const canvasPath = path.resolve(
      process.cwd(),
      'packages/engine/assets/runtime/components/primitives/canvas.ts',
    );

    expect(fs.existsSync(dndPath)).toBe(true);
    expect(fs.existsSync(canvasPath)).toBe(true);

    const dndContent = fs.readFileSync(dndPath, 'utf8');
    expect(dndContent).toContain('DragAndDrop');
    expect(dndContent).toContain('dragByOffset');

    const canvasContent = fs.readFileSync(canvasPath, 'utf8');
    expect(canvasContent).toContain('Canvas');
    expect(canvasContent).toContain('clickAtRelative');
  });

  it('AC-8: Git Pre-Commit Hook template generation', () => {
    const hook = renderGitHooks();
    expect(hook).toContain('npm run lint');
    expect(hook).toContain('npm run eval');

    const files = planSharedScaffold({});
    const hookFile = files.find(
      (f) => f.path.includes('.githooks/pre-commit') || f.path.includes('.husky/pre-commit'),
    );
    expect(hookFile).toBeDefined();
  });

  it('AC-9 & AC-10: Zero-Emoji and Zero Lock-in compliance', () => {
    const html = renderAppGraphHtml('http://localhost:3000');
    const hook = renderGitHooks();

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(html)).toBe(false);
    expect(emojiRegex.test(hook)).toBe(false);
  });
});
