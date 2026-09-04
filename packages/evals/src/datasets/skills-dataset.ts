/**
 * Golden Dataset for evaluating EITR Operational Skills against their documented workflow.
 * Not full coverage of every generated skill - protocol-123 has its own dedicated eval suite
 * (protocol-123-*.test.ts).
 */

export interface GoldenSkillCase {
  skillName:
    | '/auth-setup'
    | '/scan-and-generate-pom'
    | '/automate-ticket'
    | '/heal-test'
    | '/map-site'
    | '/bulk-rescan'
    | '/ground-zero-setup'
    | '/design-test-cases'
    | '/define-test-conditions';
  description: string;
  inputScenario: string;
  expectedWorkflow: {
    mustContainKeySteps: string[];
    contractGuarantees: string[];
    forbiddenPatterns: string[];
  };
}

export const GOLDEN_SKILLS_DATASET: GoldenSkillCase[] = [
  // 1. /auth-setup
  {
    skillName: '/auth-setup',
    description: 'Authenticates browser session and serializes credentials into auth.json',
    inputScenario: 'Run session capture for protected dashboard behind SSO login',
    expectedWorkflow: {
      mustContainKeySteps: [
        'Execution Mode Decision',
        'auth.json',
        'create-if-absent',
        'excluded from version control',
      ],
      contractGuarantees: ['Zero secrets hardcoded', 'StorageState fixture preload'],
      forbiddenPatterns: ['EITR', 'Eitr'],
    },
  },
  // 2. /scan-and-generate-pom
  {
    skillName: '/scan-and-generate-pom',
    description: 'Crawls live DOM and creates 1:1 Page Object verified against the live DOM',
    inputScenario: 'Scan checkout page (/checkout) and synthesize a live-DOM-verified Page Object',
    expectedWorkflow: {
      mustContainKeySteps: [
        'components/pages/checkout.page.ts',
        '3-Tier Locator Priority',
        'Infinite Scroll & Dynamic Feed Guard',
        'Live-DOM Liveness Verification',
      ],
      contractGuarantees: [
        'Now() suffix on snapshot getters',
        'No expect() in component',
        'Max 2 Viewport Scrolls for Feeds',
      ],
      forbiddenPatterns: ['page.waitForTimeout', 'sleep(', 'test:sanity', 'pom-sanity'],
    },
  },
  // 3. /automate-ticket
  {
    skillName: '/automate-ticket',
    description: 'Full automation workflow with Human Sign-Off Gateway and linear test synthesis',
    inputScenario: 'Automate ticket AZURE-789 (User Profile Update) from Azure DevOps',
    expectedWorkflow: {
      mustContainKeySteps: [
        'tms-validator',
        'Human Sign-Off Gateway',
        'Markdown proposal artifact',
        'await test.step',
        'tests/fixtures.ts',
        'artifacts/test-cases/test-cases.json',
      ],
      contractGuarantees: ['Zero Branching (no if/else/loops)', 'Fixture Dependency Injection'],
      forbiddenPatterns: ['new LoginPage(page)', 'try/catch around assertions'],
    },
  },
  // 4. /heal-test
  {
    skillName: '/heal-test',
    description: 'Self-healing workflow with 4-point triage and Two-Strike Rule rollback',
    inputScenario: 'Heal failing test spec tests/checkout.spec.ts after selector drift',
    expectedWorkflow: {
      mustContainKeySteps: [
        'npx playwright test tests/checkout.spec.ts',
        '4-Point Trace Triage',
        'Two-Strike Rule',
        'git checkout --',
        '[SELECTOR DRIFT]',
      ],
      contractGuarantees: [
        'Fail-Fast Real Bug Detection',
        'Maximum 2 fix attempts before rollback',
      ],
      forbiddenPatterns: ['sleep(5000) workaround', 'suppress error'],
    },
  },
  // 5. /map-site
  {
    skillName: '/map-site',
    description: 'Concurrent route crawler with URL canonicalization and shared widget extraction',
    inputScenario: 'Crawl entire web app starting at https://app.example.com/',
    expectedWorkflow: {
      mustContainKeySteps: [
        'URL Canonicalization',
        'Pagination Normalization',
        'artifacts/site-map/site-map.json',
        'frequency >= 2',
        'components/widgets/',
      ],
      contractGuarantees: [
        'Shared Primitives First',
        'Concurrency worker pool',
        'Anti-Infinite-Scroll Guard',
      ],
      forbiddenPatterns: ['infinite crawl loop', 'hardcoded routes'],
    },
  },
  // 6. /bulk-rescan
  {
    skillName: '/bulk-rescan',
    description: 'Batch Page Object locator update with 100% public method signature preservation',
    inputScenario: 'Batch rescan all Page Objects after global UI redesign',
    expectedWorkflow: {
      mustContainKeySteps: [
        'Page Object locators',
        'components/pages/',
        'preserving public method signatures',
        '3-Tier Locator Priority',
        'npm test',
      ],
      contractGuarantees: [
        'Preserve dependent tests without editing specs',
        'Live-DOM liveness verification gate',
      ],
      forbiddenPatterns: ['delete custom methods', 'break signature', 'test:sanity', 'pom-sanity'],
    },
  },
  // 7. /ground-zero-setup
  {
    skillName: '/ground-zero-setup',
    description:
      'Guided orchestrator chaining the app-analysis pipeline end-to-end with human sign-off gates per stage, or auto-pilot',
    inputScenario: 'Run the full greenfield setup for a brand-new application from scratch',
    expectedWorkflow: {
      mustContainKeySteps: [
        'Pre-Flight Confirmation',
        'pipeline-status.mjs',
        'Guided',
        'Auto-pilot',
        "reviewedBy: 'human'",
        'Human Sign-Off Gateway',
        'test-cases-drafted',
      ],
      contractGuarantees: [
        'never silently default to Auto-pilot',
        "reviewedBy: 'auto-pilot' on every entry auto-approved",
      ],
      forbiddenPatterns: ['EITR', 'Eitr'],
    },
  },
  // 8. /design-test-cases
  {
    skillName: '/design-test-cases',
    description:
      'Test Design: deterministically classifies test conditions onto a test level (e2e/api/ui-only) and drafts a TMS-shaped test case, no blocking gate',
    inputScenario: 'Design test cases from a route with reviewed test conditions',
    expectedWorkflow: {
      mustContainKeySteps: [
        'compose-journeys.mjs',
        'validate-journeys.mjs',
        'testLevel',
        'No reviewed test conditions found',
        'reviewed: false',
        'One atomic action per step',
      ],
      contractGuarantees: [
        'zero dependency on criticalityTier for test-level assignment',
        'no blocking approval pause before finishing',
        'each step carries its own concrete expected result, never a blanket result at the end',
      ],
      forbiddenPatterns: ['EITR', 'Eitr', 'BLOCKING GATE'],
    },
  },
  // 9. /define-test-conditions
  {
    skillName: '/define-test-conditions',
    description:
      'Test Analysis: defines typed test conditions (equivalence partitions, 2-way combinatorial coverage, 3-value boundary conditions) per route, gated by mechanical validation and human sign-off',
    inputScenario:
      'Define test conditions for reviewed routes in artifacts/analysis/business-intent.json',
    expectedWorkflow: {
      mustContainKeySteps: [
        'artifacts/analysis/test-conditions.json',
        'validate-test-conditions.mjs',
        'Human Sign-Off Gateway',
        'No reviewed business-intent entries found',
        'checklist-based',
      ],
      contractGuarantees: [
        'sampleValues never copied from the live page - always synthesized',
        'zero mutating DOM calls, not even trial:true',
      ],
      forbiddenPatterns: ['EITR', 'Eitr'],
    },
  },
];
