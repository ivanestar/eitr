import { describe, it, expect, afterAll } from 'vitest';
import { runEvalPrompt } from '../src/eval-runner.js';
import { gradeCpomCode } from '../src/graders/cpom-grader.js';
import { gradeSpecLinearity } from '../src/graders/spec-linearity-grader.js';
import { gradeTmsValidatorOutput } from '../src/graders/tms-validator-grader.js';
import { gradeTriageOutput } from '../src/graders/triage-grader.js';
import { gradeAssertionAuditorOutput } from '../src/graders/assertion-auditor-grader.js';
import { gradeOrchestratorOutput } from '../src/graders/orchestrator-grader.js';
import { gradeSkillCompliance } from '../src/graders/skills-grader.js';
import { GOLDEN_TMS_TICKETS } from '../src/datasets/tms-tickets.js';
import { GOLDEN_COMPONENT_PROMPTS } from '../src/datasets/component-prompts.js';
import { GOLDEN_TRIAGE_TRACES } from '../src/datasets/triage-traces.js';
import { GOLDEN_ASSERTION_CASES } from '../src/datasets/assertion-cases.js';
import {
  printTokenUsageTable,
  saveBenchmarkReports,
  type EvalBenchmarkResultItem,
  type EvalBenchmarkSummary,
} from '../src/runner/report-generator.js';

import {
  renderConventionsMd,
  renderClaudeMd,
  renderAgentsMd,
} from '../../engine/src/plan/templates/ai-rules.js';

import { resolveCliModelFlags } from '../src/env-loader.js';

// Resolve any CLI model flags like --sonnet, --flash, --gpt4o
resolveCliModelFlags();

describe('Live LLM Prompt & Agent Comprehensive Evaluation Suite', { timeout: 120_000 }, () => {
  const hasLiveApiKey = Boolean(
    process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
  );

  const activeProviderName =
    process.env.PREFERRED_EVAL_PROVIDER === 'anthropic' ||
    (!process.env.PREFERRED_EVAL_PROVIDER && process.env.ANTHROPIC_API_KEY)
      ? 'Anthropic Claude'
      : process.env.PREFERRED_EVAL_PROVIDER === 'gemini' ||
          (!process.env.PREFERRED_EVAL_PROVIDER && process.env.GEMINI_API_KEY)
        ? 'Google Gemini'
        : process.env.PREFERRED_EVAL_PROVIDER === 'openai' ||
            (!process.env.PREFERRED_EVAL_PROVIDER && process.env.OPENAI_API_KEY)
          ? 'OpenAI'
          : 'Offline Mock (No API Key set)';

  const activeModel =
    process.env.PREFERRED_EVAL_PROVIDER === 'anthropic' ||
    (!process.env.PREFERRED_EVAL_PROVIDER && process.env.ANTHROPIC_API_KEY)
      ? (process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5')
      : process.env.PREFERRED_EVAL_PROVIDER === 'gemini' ||
          (!process.env.PREFERRED_EVAL_PROVIDER && process.env.GEMINI_API_KEY)
        ? (process.env.GEMINI_MODEL ?? 'gemini-3.7-flash')
        : process.env.PREFERRED_EVAL_PROVIDER === 'openai' ||
            (!process.env.PREFERRED_EVAL_PROVIDER && process.env.OPENAI_API_KEY)
          ? (process.env.OPENAI_MODEL ?? 'gpt-4o-mini')
          : 'mock-offline';

  const sessionBenchmarkItems: EvalBenchmarkResultItem[] = [];

  afterAll(() => {
    if (sessionBenchmarkItems.length > 0) {
      const totalEvals = sessionBenchmarkItems.length;
      const passedEvals = sessionBenchmarkItems.filter((i) => i.passed).length;
      const failedEvals = totalEvals - passedEvals;
      const sumScore = sessionBenchmarkItems.reduce(
        (acc, i) => acc + (i.score10 ?? (i.score !== undefined ? i.score / 10 : 10.0)),
        0,
      );
      const averageScore10 = Number((sumScore / totalEvals).toFixed(1));

      let totalTokens = 0;
      let totalCostUsd = 0;
      for (const item of sessionBenchmarkItems) {
        totalTokens += (item.usage?.inputTokens ?? 0) + (item.usage?.outputTokens ?? 0);
        totalCostUsd += item.usage?.estimatedCostUsd ?? 0;
      }

      const summary: EvalBenchmarkSummary = {
        timestamp: new Date().toISOString(),
        totalEvals,
        passedEvals,
        failedEvals,
        averageScore10,
        model: activeModel,
        provider: activeProviderName,
        totalTokens,
        totalCostUsd: Number(totalCostUsd.toFixed(6)),
        results: sessionBenchmarkItems,
      };

      // Save reports to packages/evals/reports/
      saveBenchmarkReports(summary);

      // Print comprehensive terminal scorecard
      printTokenUsageTable(sessionBenchmarkItems, `${activeModel} (${activeProviderName})`);
    }
  });

  it('reports active Live Evaluation Provider & Target Model', () => {
    console.log(`\n[INFO] Active Live Eval Provider: ${activeProviderName} (${activeModel})`);
    if (!hasLiveApiKey) {
      console.log(
        `[INFO] To run live evaluations against real LLMs, provide one of the following environment variables:\n` +
          `       - Windows PowerShell: $env:GEMINI_API_KEY="AIza..." ; npm run eval:flash\n` +
          `       - Windows PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..." ; npm run eval:sonnet\n` +
          `       - Windows PowerShell: $env:OPENAI_API_KEY="sk-..." ; npm run eval:gpt4o\n`,
      );
    }
    expect(true).toBe(true);
  });

  // ── Eval 1: Live CPOM Component Synthesis ────────────────────────────────────
  it(
    '1. Live CPOM Component Synthesis (3-Tier Locators, Now() readers, async actions)',
    { timeout: 120_000 },
    async () => {
      const promptItem = GOLDEN_COMPONENT_PROMPTS[0]; // UserProfileCard
      const systemInstruction = renderConventionsMd('playwright', 'typescript');

      const result = await runEvalPrompt(
        `Generate the full TypeScript code for ${promptItem.name} adhering strictly to CPOM rules:\n${promptItem.userPrompt}\nOnly output the complete code block inside \`\`\`typescript ... \`\`\`.`,
        systemInstruction,
      );

      expect(result.responseCode.length).toBeGreaterThan(20);
      const grade = gradeCpomCode(result.responseCode);

      sessionBenchmarkItems.push({
        id: 'EVAL-01-CPOM-PRIMITIVE',
        name: '1. CPOM Component (UserProfileCard)',
        category: 'CPOM Architecture',
        score10: grade.score10,
        passed: grade.passed,
        details: grade.passed ? '100% compliant CPOM Component' : grade.violations.join('; '),
        usage: result.usage,
        deductions: grade.deductions,
      });

      console.log(
        `\n[EVAL 1] Score: ${grade.score10.toFixed(1)}/10 | In: ${result.usage.inputTokens.toLocaleString()}, Out: ${result.usage.outputTokens.toLocaleString()} | Cost: $${result.usage.estimatedCostUsd.toFixed(6)} USD`,
      );

      if (!grade.passed) {
        console.warn(`[WARN] CPOM Grade Violations (${result.provider}):\n`, grade.violations);
      }
      expect(grade.passed).toBe(true);
    },
  );

  // ── Eval 2: Live Complex Page Object Synthesis ───────────────────────────────
  it(
    '2. Live Complex Page Object Synthesis (CheckoutPage with Widget Composition)',
    { timeout: 120_000 },
    async () => {
      const promptItem = GOLDEN_COMPONENT_PROMPTS[1]; // CheckoutPage
      const systemInstruction = renderConventionsMd('playwright', 'typescript');

      const result = await runEvalPrompt(
        `Generate the complete TypeScript Page Object for ${promptItem.name} adhering to CPOM:\n${promptItem.userPrompt}\nOnly output the complete code block inside \`\`\`typescript ... \`\`\`.`,
        systemInstruction,
      );

      expect(result.responseCode.length).toBeGreaterThan(20);
      const grade = gradeCpomCode(result.responseCode);

      sessionBenchmarkItems.push({
        id: 'EVAL-02-COMPLEX-POM',
        name: '2. Complex Page Object (CheckoutPage)',
        category: 'CPOM Composition',
        score10: grade.score10,
        passed: grade.passed,
        details: grade.passed ? '100% compliant composed Page Object' : grade.violations.join('; '),
        usage: result.usage,
        deductions: grade.deductions,
      });

      console.log(
        `\n[EVAL 2] Score: ${grade.score10.toFixed(1)}/10 | In: ${result.usage.inputTokens.toLocaleString()}, Out: ${result.usage.outputTokens.toLocaleString()} | Cost: $${result.usage.estimatedCostUsd.toFixed(6)} USD`,
      );

      if (!grade.passed) {
        console.warn(
          `[WARN] Complex Page Object Violations (${result.provider}):\n`,
          grade.violations,
        );
      }
      expect(grade.passed).toBe(true);
    },
  );

  // ── Eval 3: Live Linear Test Spec Synthesis ──────────────────────────────────
  it(
    '3. Live Linear Test Spec Generation (TC-101: Linear AST, step demarcation, fixture DI)',
    { timeout: 120_000 },
    async () => {
      const ticket = GOLDEN_TMS_TICKETS[0];
      const systemInstruction = `${renderClaudeMd('playwright', 'typescript')}\n\n${renderAgentsMd('playwright', 'typescript')}`;

      const userPrompt = `
Automate the following test case into a Playwright test spec:
Title: ${ticket.title}
Preconditions: ${ticket.preconditions.join(', ')}
Steps:
${ticket.steps.map((s, i) => `${i + 1}. Action: ${s.action} | Expected: ${s.expectedResult}`).join('\n')}

Requirements:
- Import test from '@fixtures'
- Use Dependency Injection via test parameters: test('...', async ({ loginPage, dashboardPage }) => { ... })
- Never instantiate Page Objects via constructor (NO "new LoginPage(page)")
- Wrap every step in await test.step('Step N: ...', async () => { ... })
- Do NOT use conditional statements (if/else), loops, or try/catch
- Only output the complete code block inside \`\`\`typescript ... \`\`\`.
`;

      const result = await runEvalPrompt(userPrompt, systemInstruction);

      expect(result.responseCode.length).toBeGreaterThan(20);
      const grade = gradeSpecLinearity(result.responseCode);

      sessionBenchmarkItems.push({
        id: 'EVAL-03-LINEAR-SPEC',
        name: '3. Linear Test Spec (TC-101)',
        category: 'Linear Spec AST',
        score10: grade.score10,
        passed: grade.passed,
        details: grade.passed
          ? 'Strict linear AST with fixtures & test.step'
          : grade.violations.join('; '),
        usage: result.usage,
        deductions: grade.deductions,
      });

      console.log(
        `\n[EVAL 3] Score: ${grade.score10.toFixed(1)}/10 | In: ${result.usage.inputTokens.toLocaleString()}, Out: ${result.usage.outputTokens.toLocaleString()} | Cost: $${result.usage.estimatedCostUsd.toFixed(6)} USD`,
      );

      if (!grade.passed) {
        console.warn(`[WARN] Spec Linearity Violations (${result.provider}):\n`, grade.violations);
      }
      expect(grade.passed).toBe(true);
    },
  );

  // ── Eval 4: Live Dynamic TDM & Dual-Layer Interception ─────────────────────────
  it(
    '4. Live Dynamic TDM & Dual-Layer Interception Test Spec Synthesis',
    { timeout: 120_000 },
    async () => {
      const systemInstruction = `${renderClaudeMd('playwright', 'typescript')}\n\n${renderAgentsMd('playwright', 'typescript')}`;

      const userPrompt = `
Automate a test for creating a new customer account:
Requirements:
- Dynamic TDM: Never hardcode email or user ID. Use dynamic unique email generation.
- Dual-Layer Validation: Intercept POST /api/v1/users response and assert HTTP 201 created alongside UI success assertion.
- Linear AST with await test.step().
- Inject fixtures ({ registrationPage, page }).
- Only output the complete code block inside \`\`\`typescript ... \`\`\`.
`;

      const result = await runEvalPrompt(userPrompt, systemInstruction);

      expect(result.responseCode.length).toBeGreaterThan(20);
      const grade = gradeSpecLinearity(result.responseCode);

      sessionBenchmarkItems.push({
        id: 'EVAL-04-TDM-DUAL-LAYER',
        name: '4. Dynamic TDM & Dual-Layer Spec',
        category: 'TDM & Validation',
        score10: grade.score10,
        passed: grade.passed,
        details: grade.passed
          ? 'Dynamic data generation & dual UI+API verification'
          : grade.violations.join('; '),
        usage: result.usage,
        deductions: grade.deductions,
      });

      console.log(
        `\n[EVAL 4] Score: ${grade.score10.toFixed(1)}/10 | In: ${result.usage.inputTokens.toLocaleString()}, Out: ${result.usage.outputTokens.toLocaleString()} | Cost: $${result.usage.estimatedCostUsd.toFixed(6)} USD`,
      );

      expect(grade.passed).toBe(true);
    },
  );

  // ── Eval 5: Live TMS GIGO Quality Validation (Rejection) ─────────────────────
  it(
    '5. Live TMS GIGO Quality Validation (Monolithic 18-step Ticket -> REJECTED)',
    { timeout: 120_000 },
    async () => {
      const badTicket = GOLDEN_TMS_TICKETS[1];
      const systemInstruction = `You are tms-validator, an expert QA Requirements Engineer.
Analyze ingested TMS test cases. If steps > 10, or expected results are missing/ambiguous, reject with Status: REJECTED and output a Quality Scorecard (Score < 80%).`;

      const userPrompt = `
Audit this ticket for test automation readiness:
Title: ${badTicket.title}
Steps:
${badTicket.steps.map((s) => `- ${s.action} -> ${s.expectedResult}`).join('\n')}
`;

      const result = await runEvalPrompt(userPrompt, systemInstruction);
      const grade = gradeTmsValidatorOutput(result.responseRaw, badTicket.expectedStatus);

      sessionBenchmarkItems.push({
        id: 'EVAL-05-TMS-GIGO-REJECT',
        name: '5. TMS GIGO Rejection (TC-102)',
        category: 'GIGO Requirements',
        score10: grade.score10,
        passed: grade.passed,
        details: grade.passed
          ? 'Correctly rejected monolithic ticket with Scorecard'
          : grade.violations.join('; '),
        usage: result.usage,
        deductions: grade.deductions,
      });

      console.log(
        `\n[EVAL 5] Score: ${grade.score10.toFixed(1)}/10 | In: ${result.usage.inputTokens.toLocaleString()}, Out: ${result.usage.outputTokens.toLocaleString()} | Cost: $${result.usage.estimatedCostUsd.toFixed(6)} USD`,
      );

      expect(grade.passed).toBe(true);
      expect(grade.actualStatus).toBe('REJECTED');
    },
  );

  // ── Eval 6: Live TMS Quality Validation (Approval) ───────────────────────────
  it(
    '6. Live TMS Quality Validation (Atomic 3-step Ticket -> APPROVED)',
    { timeout: 120_000 },
    async () => {
      const goodTicket = GOLDEN_TMS_TICKETS[0];
      const systemInstruction = `You are tms-validator, an expert QA Requirements Engineer.
Analyze ingested TMS test cases. If steps <= 10 and expected results are concrete, approve with Status: APPROVED and Quality Score >= 80%.`;

      const userPrompt = `
Audit this ticket for test automation readiness:
Title: ${goodTicket.title}
Preconditions: ${goodTicket.preconditions.join(', ')}
Steps:
${goodTicket.steps.map((s, i) => `${i + 1}. Action: ${s.action} -> ${s.expectedResult}`).join('\n')}
`;

      const result = await runEvalPrompt(userPrompt, systemInstruction);
      const grade = gradeTmsValidatorOutput(result.responseRaw, 'APPROVED');

      sessionBenchmarkItems.push({
        id: 'EVAL-06-TMS-APPROVAL',
        name: '6. TMS Ticket Approval (TC-101)',
        category: 'GIGO Requirements',
        score10: grade.score10,
        passed: grade.passed,
        details: grade.passed
          ? 'Correctly approved atomic ticket with score >= 80%'
          : grade.violations.join('; '),
        usage: result.usage,
        deductions: grade.deductions,
      });

      console.log(
        `\n[EVAL 6] Score: ${grade.score10.toFixed(1)}/10 | In: ${result.usage.inputTokens.toLocaleString()}, Out: ${result.usage.outputTokens.toLocaleString()} | Cost: $${result.usage.estimatedCostUsd.toFixed(6)} USD`,
      );

      expect(grade.passed).toBe(true);
      expect(grade.actualStatus).toBe('APPROVED');
    },
  );

  // ── Eval 7: Live Trace Triage [PRODUCT BUG] ──────────────────────────────────
  it(
    '7. Live Fail-Fast Trace Triage: [PRODUCT BUG] (HTTP 500 Server Error)',
    { timeout: 120_000 },
    async () => {
      const serverErrorTrace = GOLDEN_TRIAGE_TRACES[0];
      const systemInstruction = `You are trace-debugger, an expert SDET.
Analyze test failure traces. If console/network logs show HTTP 500 or uncaught backend server errors, classify strictly as [PRODUCT BUG] and do not modify Page Objects.`;

      const userPrompt = `
Triage this failure:
Scenario: ${serverErrorTrace.scenario}
Trace: ${serverErrorTrace.errorTrace}
Console Logs: ${serverErrorTrace.consoleLogs.join('\n')}
Network Logs: ${JSON.stringify(serverErrorTrace.networkLogs)}
`;

      const result = await runEvalPrompt(userPrompt, systemInstruction);
      const grade = gradeTriageOutput(result.responseRaw, serverErrorTrace.expectedCategory);

      sessionBenchmarkItems.push({
        id: 'EVAL-07-TRIAGE-500-BUG',
        name: '7. Triage: [PRODUCT BUG] 500 Error',
        category: 'Failure Triage',
        score10: grade.score10,
        passed: grade.passed,
        details: grade.passed
          ? 'Fail-fast classification of backend defect'
          : grade.violations.join('; '),
        usage: result.usage,
        deductions: grade.deductions,
      });

      console.log(
        `\n[EVAL 7] Score: ${grade.score10.toFixed(1)}/10 | In: ${result.usage.inputTokens.toLocaleString()}, Out: ${result.usage.outputTokens.toLocaleString()} | Cost: $${result.usage.estimatedCostUsd.toFixed(6)} USD`,
      );

      expect(grade.passed).toBe(true);
      expect(grade.actualCategory).toBe('[PRODUCT BUG]');
    },
  );

  // ── Eval 8: Live Trace Triage [SELECTOR DRIFT] ────────────────────────────────
  it(
    '8. Live Fail-Fast Trace Triage: [SELECTOR DRIFT] (DOM UI Redesign)',
    { timeout: 120_000 },
    async () => {
      const driftTrace = GOLDEN_TRIAGE_TRACES[1];
      const systemInstruction = `You are trace-debugger, an expert SDET.
Analyze test failure traces. If an element selector changed or is missing due to UI redesign without backend errors, classify as [SELECTOR DRIFT] and recommend updating Page Object locators.`;

      const userPrompt = `
Triage this failure:
Scenario: ${driftTrace.scenario}
Trace: ${driftTrace.errorTrace}
Console Logs: ${driftTrace.consoleLogs.join('\n')}
`;

      const result = await runEvalPrompt(userPrompt, systemInstruction);
      const grade = gradeTriageOutput(result.responseRaw, driftTrace.expectedCategory);

      sessionBenchmarkItems.push({
        id: 'EVAL-08-TRIAGE-SELECTOR-DRIFT',
        name: '8. Triage: [SELECTOR DRIFT]',
        category: 'Failure Triage',
        score10: grade.score10,
        passed: grade.passed,
        details: grade.passed
          ? 'Correctly identified selector drift without server errors'
          : grade.violations.join('; '),
        usage: result.usage,
        deductions: grade.deductions,
      });

      console.log(
        `\n[EVAL 8] Score: ${grade.score10.toFixed(1)}/10 | In: ${result.usage.inputTokens.toLocaleString()} tokens, Output: ${result.usage.outputTokens.toLocaleString()} tokens | Est. Cost: $${result.usage.estimatedCostUsd.toFixed(6)} USD`,
      );

      const gradeCheck = gradeTriageOutput(result.responseRaw, driftTrace.expectedCategory);
      expect(gradeCheck.passed).toBe(true);
      expect(gradeCheck.actualCategory).toBe('[SELECTOR DRIFT]');
    },
  );

  // ── Eval 9: Live Trace Triage [FLAKY / TIMING] ────────────────────────────────
  it(
    '9. Live Fail-Fast Trace Triage: [FLAKY / TIMING] (Race Condition & Timing Jitter)',
    { timeout: 120_000 },
    async () => {
      const timingTrace = GOLDEN_TRIAGE_TRACES[2];
      const systemInstruction = `You are trace-debugger, an expert SDET.
Analyze test failure traces. If a test failed due to instantaneous unawaited boolean read (isVisibleNow) or timing jitter, classify as [FLAKY / TIMING] and recommend auto-retrying Web-First assertions.`;

      const userPrompt = `
Triage this failure:
Scenario: ${timingTrace.scenario}
Trace: ${timingTrace.errorTrace}
Network Logs: ${JSON.stringify(timingTrace.networkLogs)}
`;

      const result = await runEvalPrompt(userPrompt, systemInstruction);
      const grade = gradeTriageOutput(result.responseRaw, timingTrace.expectedCategory);

      sessionBenchmarkItems.push({
        id: 'EVAL-09-TRIAGE-TIMING-FLAKE',
        name: '9. Triage: [FLAKY / TIMING]',
        category: 'Failure Triage',
        score10: grade.score10,
        passed: grade.passed,
        details: grade.passed
          ? 'Correctly diagnosed timing jitter and prescribed web-first assertion'
          : grade.violations.join('; '),
        usage: result.usage,
        deductions: grade.deductions,
      });

      console.log(
        `\n[EVAL 9] Score: ${grade.score10.toFixed(1)}/10 | In: ${result.usage.inputTokens.toLocaleString()} tokens, Output: ${result.usage.outputTokens.toLocaleString()} tokens | Est. Cost: $${result.usage.estimatedCostUsd.toFixed(6)} USD`,
      );

      const gradeCheck = gradeTriageOutput(result.responseRaw, timingTrace.expectedCategory);
      expect(gradeCheck.passed).toBe(true);
      expect(gradeCheck.actualCategory).toBe('[FLAKY / TIMING]');
    },
  );

  // ── Eval 10: Live Anti-Fake-Green Assertion Audit ────────────────────────────
  it(
    '10. Live Anti-Fake-Green Assertion Audit (Unawaited Promise Detection & Healing)',
    { timeout: 120_000 },
    async () => {
      const assertionCase = GOLDEN_ASSERTION_CASES[0];
      const systemInstruction = `You are assertion-auditor, the Anti-Fake-Green SDET guardian.
Audit test assertions. If an unawaited promise (expect(locator.isVisible()).toBeTruthy()) or non-retrying boolean snapshot is detected, identify the Fake-Green risk and rewrite with Playwright auto-retrying Web-First assertions.`;

      const userPrompt = `
Audit this test code for Anti-Fake-Green violations:
${assertionCase.flawedCode}
`;

      const result = await runEvalPrompt(userPrompt, systemInstruction);
      const grade = gradeAssertionAuditorOutput(result.responseRaw);

      sessionBenchmarkItems.push({
        id: 'EVAL-10-ASSERTION-AUDITOR',
        name: '10. Anti-Fake-Green Audit',
        category: 'Assertion Safety',
        score10: grade.score10,
        passed: grade.passed,
        details: grade.passed
          ? 'Detected unawaited promise and synthesized web-first assertion'
          : grade.violations.join('; '),
        usage: result.usage,
        deductions: grade.deductions,
      });

      console.log(
        `\n[EVAL 10] Score: ${grade.score10.toFixed(1)}/10 | In: ${result.usage.inputTokens.toLocaleString()} tokens, Output: ${result.usage.outputTokens.toLocaleString()} tokens | Est. Cost: $${result.usage.estimatedCostUsd.toFixed(6)} USD`,
      );

      expect(grade.passed).toBe(true);
      expect(grade.detectedUnawaitedPromise).toBe(true);
    },
  );

  // ── Eval 11: Live SDET Orchestrator Multi-Agent Routing ──────────────────────
  it(
    '11. Live SDET Orchestrator Multi-Agent Routing & Shared Primitives First',
    { timeout: 120_000 },
    async () => {
      const systemInstruction = `You are sdet-orchestrator, the central coordinator for the automated testing lifecycle in Playwright + TypeScript projects.
Formulate orchestration plans:
1. Dispatch tickets to tms-validator for GIGO audit before synthesis.
2. Dispatch missing Page Objects to pom-engineer.
3. Present Human Sign-Off Gateway proposal artifact before spec generation.
4. Enforce Shared Primitives First for any shared widgets before Page Object workers.`;

      const userPrompt = `
Orchestrate automation for Jira ticket AZURE-505 ("User Checkout Flow") and update Page Objects for newly added cart items.
`;

      const result = await runEvalPrompt(userPrompt, systemInstruction);
      const grade = gradeOrchestratorOutput(result.responseRaw, 'automate-ticket');

      sessionBenchmarkItems.push({
        id: 'EVAL-11-ORCHESTRATOR-ROUTING',
        name: '11. Orchestrator Multi-Agent Routing',
        category: 'Swarm Orchestration',
        score10: grade.score10,
        passed: grade.passed,
        details: grade.passed
          ? 'Strict GIGO gate, routing & Shared Primitives First'
          : grade.violations.join('; '),
        usage: result.usage,
        deductions: grade.deductions,
      });

      console.log(
        `\n[EVAL 11] Score: ${grade.score10.toFixed(1)}/10 | In: ${result.usage.inputTokens.toLocaleString()} tokens, Output: ${result.usage.outputTokens.toLocaleString()} tokens | Est. Cost: $${result.usage.estimatedCostUsd.toFixed(6)} USD`,
      );

      expect(grade.passed).toBe(true);
    },
  );

  // ── Eval 12: Live Operational Skill Protocol (/heal-test & /auth-bootstrap) ───
  it(
    '12. Live Operational Skill Protocol (/heal-test Two-Strike Rule & /auth-bootstrap)',
    { timeout: 120_000 },
    async () => {
      const systemInstruction = `You are an SDET operational skills engineer.
Explain the execution protocols for /heal-test (single-spec isolation, 4-point triage, Two-Strike Rule rollback via git checkout --) and /auth-bootstrap (SSO headed vs token, session serialization into auth.json, storageState preload).
Adhere strictly to Zero-Emoji and Zero Lock-in rules.`;

      const userPrompt = `
Describe the execution protocol for /heal-test and /auth-bootstrap.
`;

      const result = await runEvalPrompt(userPrompt, systemInstruction);
      const grade = gradeSkillCompliance(
        result.responseRaw,
        ['Two-Strike Rule', 'git checkout --', 'auth.json', 'storageState'],
        ['EITR is a proprietary'],
      );

      sessionBenchmarkItems.push({
        id: 'EVAL-12-SKILLS-PROTOCOL',
        name: '12. Skills Protocol (/heal-test & /auth)',
        category: 'Operational Skills',
        score10: grade.score10,
        passed: grade.passed,
        details: grade.passed
          ? 'Two-Strike Rule rollback & session serialization compliance'
          : grade.violations.join('; '),
        usage: result.usage,
        deductions: grade.deductions,
      });

      console.log(
        `\n[EVAL 12] Score: ${grade.score10.toFixed(1)}/10 | In: ${result.usage.inputTokens.toLocaleString()} tokens, Output: ${result.usage.outputTokens.toLocaleString()} tokens | Est. Cost: $${result.usage.estimatedCostUsd.toFixed(6)} USD`,
      );

      expect(grade.passed).toBe(true);
    },
  );
});
