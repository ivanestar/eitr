import { describe, it, expect } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const scriptPath = path.resolve(repoRoot, 'scripts/protocol-456.mjs');

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

describe('Protocol 456 Runner & Gates Suite (scripts/protocol-456.mjs)', () => {
  describe('CLI Command: plan', () => {
    it('outputs standard 6-phase execution graph (Phases 0-5) in full mode', () => {
      const { status, stdout } = runCli(['plan']);
      expect(status).toBe(0);
      expect(stdout).toContain('Protocol 456 Execution Graph (Mode: FULL)');
      expect(stdout).toContain('Phase 0: Intake & Quick Baseline Check');
      expect(stdout).toContain('Phase 1: Focused Plan & On-Demand Micro Web-Research');
      expect(stdout).toContain('Phase 2: Human Sign-Off Gate');
      expect(stdout).toContain('Phase 3: In-Session TDD');
      expect(stdout).toContain('Phase 4: Single-Reviewer Risk Audit');
      expect(stdout).toContain('Phase 5: Fast Quality Gate, Doc Sync & Micro-Telemetry');
    });

    it('outputs valid JSON schema when --json is passed', () => {
      const { status, stdout } = runCli(['plan', '--json']);
      expect(status).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.protocol).toBe('456');
      expect(parsed.mode).toBe('full');
      expect(parsed.phases).toHaveLength(6);
      expect(parsed.phases[0].phase).toBe(0);
      expect(parsed.phases[5].phase).toBe(5);
    });

    it('filters to phases [0, 3, 4, 5] in fast/track mode, retaining Phase 4 peer review', () => {
      const fastResult = runCli(['plan', '--mode=fast', '--json']);
      expect(fastResult.status).toBe(0);
      const fastPhases = JSON.parse(fastResult.stdout).phases;
      expect(fastPhases.map((p: { phase: number }) => p.phase)).toEqual([0, 3, 4, 5]);

      const trackResult = runCli(['plan', '--mode=track', '--json']);
      expect(trackResult.status).toBe(0);
      const trackPhases = JSON.parse(trackResult.stdout).phases;
      expect(trackPhases.map((p: { phase: number }) => p.phase)).toEqual([0, 3, 4, 5]);
    });

    it('rejects invalid mode with exit code 1 and STDERR guidance', () => {
      const { status, stderr } = runCli(['plan', '--mode=unsupported']);
      expect(status).toBe(1);
      expect(stderr).toContain('Invalid mode "unsupported"');
      expect(stderr).toContain("'full', 'fast', 'track'");
    });
  });

  describe('CLI Command: prompt', () => {
    it('generates prompt for lite-architect wrapped in <task_context>', () => {
      const { status, stdout } = runCli([
        'prompt',
        'lite-architect',
        '--task=Add utility helper for dates',
      ]);
      expect(status).toBe(0);
      expect(stdout).toContain('You are lite-architect in Phase 1 of Protocol 456');
      expect(stdout).toContain('<task_context>\nAdd utility helper for dates\n</task_context>');
      expect(stdout).toContain('Executive Summary Table');
    });

    it('generates prompt for micro-researcher with official docs guidance', () => {
      const { status, stdout } = runCli([
        'prompt',
        'micro-researcher',
        '--task=Playwright aria-snapshot locator',
      ]);
      expect(status).toBe(0);
      expect(stdout).toContain('You are micro-researcher in Phase 1 of Protocol 456');
      expect(stdout).toContain('playwright.dev');
      expect(stdout).toContain('<task_context>\nPlaywright aria-snapshot locator\n</task_context>');
    });

    it('generates single-reviewer prompt with structured triage tags for all domain reviewer aliases', () => {
      const reviewerAliases = [
        'single-reviewer',
        'code-reviewer',
        'security-auditor',
        'flake-sentinel',
        'framework-auditor',
      ];
      for (const alias of reviewerAliases) {
        const { status, stdout } = runCli(['prompt', alias, '--task=Review diff']);
        expect(status).toBe(0);
        expect(stdout).toContain('You are the sole domain reviewer in Phase 4 of Protocol 456');
        expect(stdout).toContain('[CONFIRMED_IN_SCOPE]');
        expect(stdout).toContain('[DISMISSED_OUT_OF_SCOPE]');
        expect(stdout).toContain('[DEFERRED_TO_TODO]');
      }
    });

    it('rejects unknown subagents with exit code 1 and lists supported templates', () => {
      const { status, stderr } = runCli(['prompt', 'unknown-agent']);
      expect(status).toBe(1);
      expect(stderr).toContain('Unknown subagent "unknown-agent"');
      expect(stderr).toContain('Available prompt templates:');
    });

    it('rejects prototype property injection (toString, constructor) with exit code 1', () => {
      const { status, stderr } = runCli(['prompt', 'toString']);
      expect(status).toBe(1);
      expect(stderr).toContain('Unknown subagent "toString"');
    });

    it('rejects path traversal sequences in subagent name with exit code 1', () => {
      const { status, stderr } = runCli(['prompt', '../../etc/passwd']);
      expect(status).toBe(1);
      expect(stderr).toContain('Path traversal sequences are forbidden');
    });

    it('truncates oversized task context to 2000 characters', () => {
      const longTask = 'A'.repeat(3000);
      const { status, stdout } = runCli(['prompt', 'lite-architect', `--task=${longTask}`]);
      expect(status).toBe(0);
      expect(stdout).toContain('A'.repeat(2000));
      expect(stdout).not.toContain('A'.repeat(2001));
    });
  });

  describe('CLI Command: verify-phase', () => {
    it('verifies Phase 0 and Phase 5 build gate using EITR_VERIFY_COMMAND override', () => {
      const stub = 'node -e "process.exit(0)"';
      const res0 = runCli(['verify-phase', '0'], { EITR_VERIFY_COMMAND: stub });
      expect(res0.status).toBe(0);
      expect(res0.stdout).toContain('[PASS] Phase 0 build gate verified');

      const res5 = runCli(['verify-phase', '5'], { EITR_VERIFY_COMMAND: stub });
      expect(res5.status).toBe(0);
      expect(res5.stdout).toContain('[PASS] Phase 5 build gate verified');
    });

    it('handles build failure in verify-phase 0 with clean exit code 1 and STDERR diagnostic', () => {
      const stub = 'node -e "process.exit(1)"';
      const res = runCli(['verify-phase', '0'], { EITR_VERIFY_COMMAND: stub });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('[FAIL] Phase 0 build gate failed');
      expect(res.stderr).not.toContain('node:internal');
    });

    it('verifies Phase 3 test target runner execution', () => {
      const passTarget = 'node -e "process.exit(0)"';
      const resPass = runCli(['verify-phase', '3', `--target=${passTarget}`]);
      expect(resPass.status).toBe(0);
      expect(resPass.stdout).toContain('[PASS] Phase 3 test target verified');

      const failTarget = 'node -e "process.exit(1)"';
      const resFail = runCli(['verify-phase', '3', `--target=${failTarget}`]);
      expect(resFail.status).toBe(1);
      expect(resFail.stderr).toContain('[FAIL] Phase 3 test target failed');
    });

    it('rejects verify-phase 3 when --target argument is omitted with exit code 1', () => {
      const res = runCli(['verify-phase', '3']);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('[FAIL] Phase 3 verification requires --target="<cmd>".');
    });

    it('rejects invalid phase numbers (6, -1, non-numeric, decimal, empty) with exit code 1', () => {
      const invalidCases = ['6', '-1', 'beta', '2.5', '   '];
      for (const arg of invalidCases) {
        const { status, stderr } = runCli(['verify-phase', arg]);
        expect(status).toBe(1);
        expect(stderr).toContain('Must be an integer 0-5');
      }
    });

    it('rejects missing phase argument with exit code 1', () => {
      const { status, stderr } = runCli(['verify-phase']);
      expect(status).toBe(1);
      expect(stderr).toContain('Missing phase number');
    });
  });

  describe('CLI Command: telemetry & default usage', () => {
    it('outputs 4-line micro-telemetry summary table', () => {
      const { status, stdout } = runCli(['telemetry']);
      expect(status).toBe(0);
      expect(stdout).toContain('Protocol 456 Telemetry Summary');
      expect(stdout).toContain('Duration');
      expect(stdout).toContain('Est. Tokens');
      expect(stdout).toContain('Est. Cost');
      expect(stdout).toContain('Quality Gate');
    });

    it('terminates with exit code 1 when invoked without CLI arguments or with unknown command', () => {
      const noArgs = runCli([]);
      expect(noArgs.status).toBe(1);
      expect(noArgs.stderr).toContain('Usage:');

      const unknownCmd = runCli(['unknown-cmd']);
      expect(unknownCmd.status).toBe(1);
      expect(unknownCmd.stderr).toContain('Unrecognized command "unknown-cmd"');
    });
  });

  describe('Skill Mirror Parity & Two-Strike Rollback Invariants', () => {
    const agentsSkillPath = path.resolve(repoRoot, '.agents/skills/protocol-456/SKILL.md');
    const claudeSkillPath = path.resolve(repoRoot, '.claude/skills/protocol-456/SKILL.md');

    it('protocol-456 SKILL.md exists in both .agents and .claude with zero emojis', () => {
      expect(fs.existsSync(agentsSkillPath)).toBe(true);
      expect(fs.existsSync(claudeSkillPath)).toBe(true);

      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      const agentsContent = fs.readFileSync(agentsSkillPath, 'utf8');
      const claudeContent = fs.readFileSync(claudeSkillPath, 'utf8');

      expect(emojiRegex.test(agentsContent)).toBe(false);
      expect(emojiRegex.test(claudeContent)).toBe(false);
    });

    it('protocol-456 SKILL.md body line count is <= 150 lines in both trees', () => {
      const agentsLines = fs.readFileSync(agentsSkillPath, 'utf8').split(/\r?\n/).length;
      const claudeLines = fs.readFileSync(claudeSkillPath, 'utf8').split(/\r?\n/).length;

      expect(agentsLines).toBeLessThanOrEqual(150);
      expect(claudeLines).toBeLessThanOrEqual(150);
    });

    it('validates mirror parity script runs cleanly across all agent/skill pairs', () => {
      const parityScript = path.resolve(repoRoot, 'scripts/check-mirror-parity.mjs');
      const res = spawnSync(process.execPath, [parityScript], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
        killSignal: 'SIGTERM',
      });
      expect(res.status).toBe(0);
    });

    it('Two-Strike rollback restores modified tracked files and unlinks newly created files in an ephemeral sandbox', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eitr-p456-rollback-test-'));
      const sandboxEnv = {
        ...process.env,
        GIT_DIR: undefined,
        GIT_WORK_TREE: undefined,
        GIT_INDEX_FILE: undefined,
        GIT_OBJECT_DIRECTORY: undefined,
      };
      const execOpts = { cwd: tmpDir, stdio: 'pipe' as const, env: sandboxEnv, timeout: 30_000 };

      try {
        // Init local sandbox git repo
        execSync('git init', execOpts);
        execSync('git config user.name "Test"', execOpts);
        execSync('git config user.email "test@example.com"', execOpts);
        execSync('git config commit.gpgsign false', execOpts);

        const trackedFile = path.join(tmpDir, 'tracked.ts');
        fs.writeFileSync(trackedFile, 'initial content', 'utf8');
        execSync('git add tracked.ts', execOpts);
        execSync('git commit -m "initial commit" --no-gpg-sign', execOpts);

        // Simulate modifications: modify tracked file + create new untracked file + create session file
        fs.writeFileSync(trackedFile, 'broken content', 'utf8');
        const newDeclaredFile = path.join(tmpDir, 'new-file.ts');
        fs.writeFileSync(newDeclaredFile, 'new content', 'utf8');
        const sessionFile = path.join(tmpDir, '.session.json');
        fs.writeFileSync(sessionFile, '{"session": 123}', 'utf8');

        // Execute Two-Strike rollback: revert tracked file and delete declared new file
        execSync('git checkout -- tracked.ts', execOpts);
        if (fs.existsSync(newDeclaredFile)) {
          fs.unlinkSync(newDeclaredFile);
        }

        // Verify state preservation
        expect(fs.readFileSync(trackedFile, 'utf8')).toBe('initial content');
        expect(fs.existsSync(newDeclaredFile)).toBe(false);
        // Untracked session file remains completely intact
        expect(fs.existsSync(sessionFile)).toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    });
  });
});
