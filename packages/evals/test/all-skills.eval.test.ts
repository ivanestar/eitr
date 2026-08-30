import { describe, it, expect } from 'vitest';
import { GOLDEN_SKILLS_DATASET } from '../src/datasets/skills-dataset.js';
import { gradeSkillCompliance } from '../src/graders/skills-grader.js';

describe('All 6 Operational Skills Evaluation Benchmark', () => {
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

  // Skill 3: /automate-ticket
  it('3. Evaluates /automate-ticket Human Sign-Off Gateway and linear synthesis', () => {
    const skillCase = GOLDEN_SKILLS_DATASET.find((s) => s.skillName === '/automate-ticket')!;
    const simulatedOutput = `
# Skill: Automate Ticket (/automate-ticket)
1. Pre-validation via tms-validator.
2. Present Markdown proposal artifact for Human Sign-Off Gateway.
3. Synthesize linear spec with await test.step and tests/fixtures.ts.
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
2. Write topology map to docs/site-map.json and Mermaid graph to docs/APP_GRAPH.md.
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
});
