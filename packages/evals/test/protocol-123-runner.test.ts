import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const scriptPath = path.resolve(repoRoot, 'scripts/protocol-123.mjs');

function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  const res = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
    killSignal: 'SIGTERM',
    env: { ...process.env, ...envOverrides },
  });
  return {
    status: res.status,
    stdout: (res.stdout || '').replace(/\r\n/g, '\n'),
    stderr: (res.stderr || '').replace(/\r\n/g, '\n'),
  };
}

describe('Protocol 123 Runner & Gates Suite (scripts/protocol-123.mjs)', () => {
  describe('CLI Command: plan', () => {
    it('outputs standard 9-phase execution graph (Phases 0-8) in full mode', () => {
      const { status, stdout } = runCli(['plan']);
      expect(status).toBe(0);
      expect(stdout).toContain('Protocol 123 Execution Graph (Mode: FULL)');
      expect(stdout).toContain('Phase 0: Pre-Flight Baseline Check');
      expect(stdout).toContain('Phase 1: Research & Diagnosis');
      expect(stdout).toContain('Phase 2: Invariants Discovery & Defensive Spec Formulation');
      expect(stdout).toContain('Phase 3: Lead Plan Review (Single Strong Reviewer)');
      expect(stdout).toContain('Phase 4: User Approval Gateway');
      expect(stdout).toContain('Phase 5: Test-Driven Execution');
      expect(stdout).toContain('Phase 6: Lead Code & Test Review (Single Strong Reviewer)');
      expect(stdout).toContain('Phase 7: Autonomous Self-Healing with Two-Strike Rule');
      expect(stdout).toContain('Phase 8: QA Guard, Evals Benchmark, Doc Sync & Final Report');
    });

    it('outputs valid JSON schema when --json is passed', () => {
      const { status, stdout } = runCli(['plan', '--json']);
      expect(status).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.protocol).toBe('123');
      expect(parsed.mode).toBe('full');
      expect(parsed.phases).toHaveLength(9);
      expect(parsed.phases[0].phase).toBe(0);
      expect(parsed.phases[8].phase).toBe(8);
    });

    it('enforces web-researcher in Phase 1 and invariants discovery before architect in Phase 2', () => {
      const { status, stdout } = runCli(['plan', '--json']);
      expect(status).toBe(0);
      const phases = JSON.parse(stdout).phases;

      const phase1 = phases.find((p: { phase: number }) => p.phase === 1);
      expect(phase1.agents).toContain('web-researcher');
      expect(phase1.agents).toContain('general-purpose');

      const phase2 = phases.find((p: { phase: number }) => p.phase === 2);
      expect(phase2.agents).toContain('test-conditions-designer');
      expect(phase2.agents).toContain('architect');
    });

    it('enforces single Lead Reviewer (code-reviewer) in Phase 3 and Phase 6', () => {
      const { status, stdout } = runCli(['plan', '--json']);
      expect(status).toBe(0);
      const phases = JSON.parse(stdout).phases;

      const phase3 = phases.find((p: { phase: number }) => p.phase === 3);
      expect(phase3.agents).toEqual(['code-reviewer']);

      const phase6 = phases.find((p: { phase: number }) => p.phase === 6);
      expect(phase6.agents).toEqual(['code-reviewer']);
    });
  });

  describe('CLI Command: prompt', () => {
    it('generates non-empty prompt for test-conditions-designer with invariants requirements', () => {
      const { status, stdout } = runCli([
        'prompt',
        'test-conditions-designer',
        '--task=Refactor CPOM primitives',
      ]);
      expect(status).toBe(0);
      expect(stdout).toContain('test-conditions-designer');
      expect(stdout).toContain('Refactor CPOM primitives');
      expect(stdout).toContain('High-Signal Invariants Discovery');
      expect(stdout).toContain('Defensive Oracle Polarity');
      expect(stdout).toContain('Architect Handoff');
    });

    it('generates non-empty prompt for code-reviewer with 5-point audit rubric', () => {
      const { status, stdout } = runCli([
        'prompt',
        'code-reviewer',
        '--task=Review fixtures reorganization',
      ]);
      expect(status).toBe(0);
      expect(stdout).toContain('Lead Reviewer');
      expect(stdout).toContain('Review fixtures reorganization');
      expect(stdout).toContain('Architecture & Plan Compliance');
      expect(stdout).toContain('TypeScript & Language Safety');
      expect(stdout).toContain('Security & Privacy');
      expect(stdout).toContain('Flake & Determinism');
      expect(stdout).toContain('Polyglot Parity');
    });

    it('generates non-empty prompt for web-researcher with dual-track investigation', () => {
      const { status, stdout } = runCli([
        'prompt',
        'web-researcher',
        '--task=Research Playwright .NET',
      ]);
      expect(status).toBe(0);
      expect(stdout).toContain('web-researcher');
      expect(stdout).toContain('Track 1: Technical Upstream Recon');
      expect(stdout).toContain('Track 2: ISTQB Standards & Syllabi Alignment');
    });

    it('supports review-arbiter and legacy prompts for backward compatibility', () => {
      const arbiter = runCli(['prompt', 'review-arbiter', '--task=Adjudicate findings']);
      expect(arbiter.status).toBe(0);
      expect(arbiter.stdout).toContain('review-arbiter');

      const req = runCli(['prompt', 'req-coverage-designer', '--task=Task']);
      expect(req.status).toBe(0);
      expect(req.stdout).toContain('req-coverage-designer');

      const neg = runCli(['prompt', 'negative-coverage-designer', '--task=Task']);
      expect(neg.status).toBe(0);
      expect(neg.stdout).toContain('negative-coverage-designer');
    });

    it('rejects unknown subagent with exit code 1 and lists available templates', () => {
      const { status, stderr } = runCli(['prompt', 'unknown-agent']);
      expect(status).toBe(1);
      expect(stderr).toContain('Unknown subagent "unknown-agent"');
      expect(stderr).toContain('test-conditions-designer');
      expect(stderr).toContain('code-reviewer');
    });
  });

  describe('CLI Command: verify-phase', () => {
    it('rejects invalid phase numbers (9, -1, non-numeric) with exit code 1', () => {
      expect(runCli(['verify-phase', '9']).status).toBe(1);
      expect(runCli(['verify-phase', '-1']).status).toBe(1);
      expect(runCli(['verify-phase', 'abc']).status).toBe(1);
      expect(runCli(['verify-phase', '']).status).toBe(1);
    });
  });

  describe('CLI Command: telemetry', () => {
    it('outputs Protocol 123 Telemetry Summary table with standard columns', () => {
      const { status, stdout } = runCli(['telemetry']);
      expect(status).toBe(0);
      expect(stdout).toContain('### Protocol 123 Telemetry Summary');
      expect(stdout).toContain('Phase 0: Pre-Flight Baseline');
      expect(stdout).toContain('Phase 1: Recon & Web Research');
      expect(stdout).toContain('Phase 2: Invariants & SDD Plan');
      expect(stdout).toContain('Phase 3: Lead Plan Review');
      expect(stdout).toContain('Phase 6: Lead Code Review');
      expect(stdout).toContain('Est. Tokens');
      expect(stdout).toContain('Est. Cost');
      expect(stdout).toContain('Duration');
      expect(stdout).toContain('100% GREEN');
    });
  });
});
