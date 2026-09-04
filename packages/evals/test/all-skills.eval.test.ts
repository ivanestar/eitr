import { describe, it, expect } from 'vitest';
import { GOLDEN_SKILLS_DATASET } from '../src/datasets/skills-dataset.js';
import { gradeSkillCompliance } from '../src/graders/skills-grader.js';

describe('All 9 Operational Skills Evaluation Benchmark', () => {
  // Skill 1: /auth-setup
  it('1. Evaluates /auth-setup workflow and session serialization', () => {
    const skillCase = GOLDEN_SKILLS_DATASET.find((s) => s.skillName === '/auth-setup')!;
    const simulatedOutput = `
# Skill: Auth Setup (/auth-setup, /auth-bootstrap)
1. Execution Mode Decision: Use headed mode for interactive SSO or headless API for token endpoints.
2. Session Serialization: Store cookies and localStorage in auth.json (create-if-absent, excluded from version control).
3. Integration: Load auth.json into Playwright storageState fixture.
`;
    const grade = gradeSkillCompliance(
      simulatedOutput,
      skillCase.expectedWorkflow.mustContainKeySteps,
      skillCase.expectedWorkflow.forbiddenPatterns,
    );
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // Skill 2: /scan-and-generate-pom
  it('2. Evaluates /scan-and-generate-pom 1:1 Page Object + live-DOM liveness verification', () => {
    const skillCase = GOLDEN_SKILLS_DATASET.find((s) => s.skillName === '/scan-and-generate-pom')!;
    const simulatedOutput = `
# Skill: Scan and Generate POM (/scan-and-generate-pom)
1. Generate Page Object in components/pages/checkout.page.ts with 3-Tier Locator Priority.
2. Enforce Infinite Scroll & Dynamic Feed Guard (max 2 viewport scrolls).
3. Perform Live-DOM Liveness Verification directly against the live application.
`;
    const grade = gradeSkillCompliance(
      simulatedOutput,
      skillCase.expectedWorkflow.mustContainKeySteps,
      skillCase.expectedWorkflow.forbiddenPatterns,
    );
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // Skill 3: /automate-test
  it('3. Evaluates /automate-test Human Sign-Off Gateway and linear synthesis', () => {
    const skillCase = GOLDEN_SKILLS_DATASET.find((s) => s.skillName === '/automate-test')!;
    const simulatedOutput = `
# Skill: Automate Ticket (/automate-test)
1. Pre-validation via tms-validator.
2. Present Markdown proposal artifact for Human Sign-Off Gateway.
3. Synthesize linear spec with await test.step and tests/fixtures.ts.
4. With no ticket ID given, read artifacts/test-cases/test-cases.json for un-automated drafted test cases instead.
`;
    const grade = gradeSkillCompliance(
      simulatedOutput,
      skillCase.expectedWorkflow.mustContainKeySteps,
      skillCase.expectedWorkflow.forbiddenPatterns,
    );
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // Skill 4: /heal-test
  it('4. Evaluates /heal-test Two-Strike Rule and fail-fast triage', () => {
    const skillCase = GOLDEN_SKILLS_DATASET.find((s) => s.skillName === '/heal-test')!;
    const simulatedOutput = `
# Skill: Heal Test (/heal-test)
1. Run isolated test: npx playwright test tests/checkout.spec.ts.
2. Execute 4-Point Trace Triage. If [SELECTOR DRIFT], apply targeted fix.
3. Enforce Two-Strike Rule: on second failure run git checkout -- to rollback immediately.
`;
    const grade = gradeSkillCompliance(
      simulatedOutput,
      skillCase.expectedWorkflow.mustContainKeySteps,
      skillCase.expectedWorkflow.forbiddenPatterns,
    );
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // Skill 5: /map-site
  it('5. Evaluates /map-site URL canonicalization and shared widget extraction', () => {
    const skillCase = GOLDEN_SKILLS_DATASET.find((s) => s.skillName === '/map-site')!;
    const simulatedOutput = `
# Skill: Map Site (/map-site)
1. URL Canonicalization & Pagination Normalization: strip query parameters and hashes.
2. Write topology map to artifacts/site-map/site-map.json.
3. Extract recurring DOM patterns (frequency >= 2) into components/widgets/.
`;
    const grade = gradeSkillCompliance(
      simulatedOutput,
      skillCase.expectedWorkflow.mustContainKeySteps,
      skillCase.expectedWorkflow.forbiddenPatterns,
    );
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // Skill 6: /bulk-rescan
  it('6. Evaluates /bulk-rescan Page Object signature preservation', () => {
    const skillCase = GOLDEN_SKILLS_DATASET.find((s) => s.skillName === '/bulk-rescan')!;
    const simulatedOutput = `
# Skill: Bulk Rescan (/bulk-rescan)
1. Update Page Object locators across components/pages/.
2. Update DOM locators using 3-Tier Locator Priority while strictly preserving public method signatures.
3. Verify zero regressions via npm test.
`;
    const grade = gradeSkillCompliance(
      simulatedOutput,
      skillCase.expectedWorkflow.mustContainKeySteps,
      skillCase.expectedWorkflow.forbiddenPatterns,
    );
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // Skill 7: /ground-zero-setup
  it('7. Evaluates /ground-zero-setup pre-flight confirmation and human sign-off chaining', () => {
    const skillCase = GOLDEN_SKILLS_DATASET.find((s) => s.skillName === '/ground-zero-setup')!;
    const simulatedOutput = `
# Skill: Greenfield Guided Setup (/ground-zero-setup)
1. Pre-Flight Confirmation: run scripts/pipeline-status.mjs, present stages and cost warning, ask Guided vs Auto-pilot.
2. Guided mode: run each stage, present its own Human Sign-Off Gateway, on approval set reviewedBy: 'human'.
3. Consult scripts/pipeline-status.mjs after every stage to decide what runs next.
4. Stop honestly once the stage reaches test-cases-drafted - never chain into /automate-test automatically.
`;
    const grade = gradeSkillCompliance(
      simulatedOutput,
      skillCase.expectedWorkflow.mustContainKeySteps,
      skillCase.expectedWorkflow.forbiddenPatterns,
    );
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // Skill 8: /design-test-cases
  it('8. Evaluates /design-test-cases deterministic classification and no-blocking-gate departure', () => {
    const skillCase = GOLDEN_SKILLS_DATASET.find((s) => s.skillName === '/design-test-cases')!;
    const simulatedOutput = `
# Skill: Test Design (/design-test-cases)
1. Preconditions: if no reviewed conditions exist, refuse with "No reviewed test conditions found."
2. Run scripts/compose-journeys.mjs to deterministically assign each condition a testLevel.
3. Run scripts/validate-journeys.mjs --stage=structural. One atomic action per step, each with its own expected result drawn from the condition's description/scenario, then draft each testCase, then validate again. Bracket every literal on-screen name (button, page, checkbox, dropdown option) referenced in a step.
4. Write directly with reviewed: false and print a summary - no blocking approval pause before finishing.
`;
    const grade = gradeSkillCompliance(
      simulatedOutput,
      skillCase.expectedWorkflow.mustContainKeySteps,
      skillCase.expectedWorkflow.forbiddenPatterns,
    );
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });

  // Skill 9: /define-test-conditions
  it('9. Evaluates /define-test-conditions read-only extraction and human sign-off gate', () => {
    const skillCase = GOLDEN_SKILLS_DATASET.find((s) => s.skillName === '/define-test-conditions')!;
    const simulatedOutput = `
# Skill: Test Analysis (/define-test-conditions)
1. Preconditions: refuse with "No reviewed business-intent entries found" if none exist.
2. Extract parameters read-only, redact PII as [REDACTED], synthesize sampleValues never copied from the live page.
3. Run node scripts/validate-test-conditions.mjs, deterministically generate boundary-value + checklist-based conditions.
4. Present a Test-Conditions Review Artifact per route - Human Sign-Off Gateway before artifacts/analysis/test-conditions.json is authoritative.
`;
    const grade = gradeSkillCompliance(
      simulatedOutput,
      skillCase.expectedWorkflow.mustContainKeySteps,
      skillCase.expectedWorkflow.forbiddenPatterns,
    );
    expect(grade.passed).toBe(true);
    expect(grade.score).toBe(100);
  });
});
