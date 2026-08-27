import type { FileDescriptor } from '../../types/generation-plan.js';

export function planAiTmsSkills(
  aiAssistants: readonly string[] = [
    'antigravity',
    'cursor',
    'claude',
    'windsurf',
    'codex',
    'copilot',
  ],
  tmsProvider: string = 'jira',
): FileDescriptor[] {
  const tmsSkills = [
    {
      name: 'tms-triage',
      description:
        'Performs defect triage with Anti-Bug-Spam deduplication and creates clustered tickets in TMS.',
      content: `# Skill: TMS Triage (/tms-triage)

## Purpose
Triages failed test runs and publishes structured, deduplicated bug reports to the connected Test Management System (${tmsProvider}).

## Anti-Bug-Spam & Root Cause Deduplication Workflow
1. **Batch Failure Ingestion & Error Signature Extraction:**
   - Ingest all failing test reports, execution traces, console logs, and HTTP network dumps.
   - Extract the normalized **Error Signature** for each failure:
     * HTTP status code (e.g. 500 Internal Server Error, 503 Service Unavailable).
     * Endpoint URI pattern (e.g. \`/api/v1/auth/session\`).
     * Primary exception message and top stack frame.
2. **Root Cause Clustering:**
   - Group all failed test cases sharing identical Error Signatures into a single cluster.
   - Identify the single **Primary Defect (Root Cause)** responsible for the cluster.
3. **Deduplication Check in TMS:**
   - Query TMS via \`mcp__tms__search_defects({ query: errorSignature })\` to check for existing open tickets.
   - If an open defect already exists:
     * Do NOT create a duplicate ticket.
     * Link failed test cases to the existing defect and update execution history.
4. **Primary Defect Publication:**
   - If no existing defect is found, publish **ONE Primary Bug Report** in ${tmsProvider} with:
     * Root cause summary and reproduction steps.
     * Attached traces (\`trace.zip\`), visual diff screenshots, and console logs.
     * List of all affected test cases linked as Blocked / Secondary.
5. **Report Summary:**
   - Output summary table of triaged failures, created root defects, and linked duplicates.
`,
    },
    {
      name: 'tms-sync',
      description:
        'Bi-directional synchronization between automated test suites and TMS test cases.',
      content: `# Skill: TMS Sync (/tms-sync)

## Purpose
Synchronizes test case metadata, tags, and execution results with the connected TMS (${tmsProvider}).

## Workflow
1. **Metadata & Tag Discovery:**
   - Scan test files for \`@TC-XXX\` tags matching TMS case IDs.
2. **Execution Results Ingestion:**
   - Parse test runner execution outputs (\`test-results/\`).
3. **Batch Result Publishing:**
   - Publish run statuses (PASSED, FAILED, SKIPPED) to TMS in a single batch request via \`mcp__tms__post_test_results\`.
`,
    },
    {
      name: 'tms-validate',
      description: 'GIGO quality auditor for test case specifications in TMS.',
      content: `# Skill: TMS Validate (/tms-validate)

## Purpose
Audits TMS test cases for atomicity, deterministic expected results, and test data prerequisites (GIGO protection).

## Workflow
1. **Case Retrieval:** Fetch case details via \`mcp__tms__get_test_case\`.
2. **Audit Metrics (0-100% Score):**
   - Step atomicity (<= 10 steps).
   - Verifiable expected results (no vague assertions).
   - TDM prerequisites explicit.
3. **Gate Decision:** Recommends automation if Score >= 80%, otherwise outputs structured remediation report.
`,
    },
  ];

  const descriptors: FileDescriptor[] = [];

  for (const rawAssistant of aiAssistants) {
    const assistant = rawAssistant.toLowerCase();

    if (assistant === 'gemini' || assistant === 'antigravity') {
      for (const skill of tmsSkills) {
        descriptors.push({
          path: `.gemini/skills/${skill.name}/SKILL.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${skill.description}
---

${skill.content}`,
          },
        });
      }
    } else if (assistant === 'claude' || assistant === 'claude-code') {
      for (const skill of tmsSkills) {
        descriptors.push({
          path: `.claude/skills/${skill.name}/SKILL.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${skill.description}
---

${skill.content}`,
          },
        });
      }
    } else if (assistant === 'cursor') {
      for (const skill of tmsSkills) {
        descriptors.push({
          path: `.cursor/rules/${skill.name}.mdc`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
description: ${skill.description}
globs: **/*
alwaysApply: false
---

${skill.content}`,
          },
        });
      }
    } else if (assistant === 'windsurf') {
      for (const skill of tmsSkills) {
        descriptors.push({
          path: `.windsurf/workflows/${skill.name}.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `# Workflow: ${skill.name}

${skill.content}`,
          },
        });
      }
    } else if (assistant === 'codex') {
      for (const skill of tmsSkills) {
        descriptors.push({
          path: `.codex/skills/${skill.name}/SKILL.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${skill.description}
---

${skill.content}`,
          },
        });
      }
    } else if (assistant === 'copilot') {
      for (const skill of tmsSkills) {
        descriptors.push({
          path: `.github/prompts/${skill.name}.prompt.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
description: ${skill.description}
---

${skill.content}`,
          },
        });
      }
    }
  }

  return descriptors;
}
