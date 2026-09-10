import { describe, it } from 'vitest';

// Python, C#, Java and Cypress are frozen: their generators, templates and linters are all still
// in this repository and still work, but the CLI does not offer them, nothing generates them, and
// nobody supports them. Their tests stay here as the record of what those generators actually do -
// deleting them would make unfreezing an archaeology exercise - but they do not run, locally or in
// CI, because a suite that keeps verifying what nobody can produce spends time on nothing.
//
// Unfreezing a stack is three edits: the questionnaire choice in packages/cli/src/questionnaire,
// the pair in generate.ts's SUPPORTED list, and this file's two lines.
export const frozenDescribe = describe.skip;
export const frozenIt = it.skip;
