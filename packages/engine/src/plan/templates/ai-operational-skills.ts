import type { FileDescriptor } from '../../types/generation-plan.js';
import { yamlSafeScalar } from './yaml-frontmatter.js';
import { resolveStackConventions, type StackConventions } from '../stack-conventions.js';

interface SkillDefinition {
  name: string;
  description: string;
  content: string;
  /** Claude Code / Cursor / Codex CLI Agent Skills frontmatter: named argument(s), e.g. ['mode']. */
  arguments?: string[];
  /** Placeholder shown to the user for the argument(s), e.g. '[create|update]'. */
  argumentHint?: string;
  /**
   * Suppresses model-initiated auto-invocation, so this only runs when the user explicitly types
   * the slash command - the documented pattern for a workflow with real side effects (live network
   * crawl, file writes), matching Claude Code's own /commit and /deploy examples.
   */
  disableModelInvocation?: boolean;
}

// Applies uniformly to every skill regardless of assistant: absent an explicit instruction, a model
// tends to mirror whatever language recently appeared in its own context (terminal locale, a
// stray word) rather than genuinely defaulting - live-observed on a fresh /ground-zero-setup run
// that opened in Russian with no Russian anywhere in the user's own request. English is this
// project's own default; switching only on the user's own explicit signal (writing in another
// language, or asking for one) keeps that default from being silently overridden by ambient noise.
// A second, narrower instance of the same failure was found later: a chat response correctly
// switching to the user's language (as this note already allows) then bled into a PERSISTED
// artifact field (`business-intent.json`'s `reasoning`) on unrelated routes, purely because the
// chat had recently been in that language - the note below closes that gap explicitly, since
// "written artifact" alone did not stop the model from treating a free-text JSON field the same
// as a chat reply.
const LANGUAGE_DEFAULT_NOTE =
  "Default to English for every response, question, and written artifact in this skill - switch to a different language only once the user has written to you in it, or explicitly asked for it; never infer a language from anything else in the environment. This split applies within one and the same run: a CHAT response/question may follow the user's own language once they have written in it, but every free-text field written INTO a persisted artifact (business-intent.json's `reasoning`, test-conditions.json's `description`, or any other analysis/summary text you compose) stays English regardless of what language the chat itself is currently in - these files may be read by other tooling or teammates later, and switching them because the chat happened to be in another language is exactly the failure this note exists to prevent. The one explicit exception: an `evidence`/`excerpt` field that is a verbatim quote from the application's own live UI text is copied exactly as the application wrote it, in whatever language that is - never translate or paraphrase a quote, and never treat that one quoted field as license to write any OTHER field in the same non-English language.";

// Reused at every point in this pipeline where the human is asked to choose among options (not a
// free-form review/correction, which stays plain conversation - a discrete choice specifically).
// Cited by name so a future skill added to this pipeline can rely on the same convention instead of
// reinventing wording - found drifting out of sync once already (this exact sentence used to be
// paraphrased only in /map-site's Core-Purpose Confirmation step, which claimed /ground-zero-setup's
// own mode-choice question already followed it, while that question's actual wording had drifted to
// argue the opposite).
const INTERACTIVE_CHOICE_NOTE =
  'Use a structured interactive choice tool if your assistant provides one (e.g. AskUserQuestion), so the human can select an option instead of typing free text; fall back to clearly-numbered plain text with the recommended default marked only when no such tool exists.';

// Every review gateway in this pipeline renders through the same script rather than each skill
// re-specifying a block format in prose and each run re-composing it. Two live-observed failures
// this closes: a 46-route review that the assistant abbreviated as "(and similarly for the other 29
// exercises...)", asking a human to approve 29 entries they never saw; and the general risk that any
// model-composed rendering of a stored artifact is a paraphrase, so the text reviewed and the JSON
// stored can disagree with nothing to catch it.
const REVIEW_ARTIFACT_RENDER_NOTE = (kind: string): string =>
  `Render it with \`node scripts/render-review-artifact.mjs --kind=${kind}\` rather than composing the text yourself: it builds the artifact from the stored JSON (so what the human reads is exactly what was stored, never a paraphrase of it), resolves every \`routeId\` to its site-map path/title, and decides where the artifact belongs based on how big it is. When the script reports \`mode: "inline"\`, print its \`markdown\` field verbatim. When it reports \`mode: "file"\`, it has already written the full artifact to \`filePath\`: print its \`summary\` line and that path, and say plainly that the complete per-entry detail is in that file and is what the approval covers. Never abbreviate, sample, or summarize entries yourself in either mode, and never write anything of the form "and similarly for the remaining N" - an entry a human did not see is an entry they cannot approve.`;

// Found needed after a live final report narrated "CPOM architectural contract strictly followed:
// no assertions inside Page Objects, auto-waiting Web-First asserts in specs, strict scenario
// linearity (test.step), clean fixture injection" back to the user - self-referential compliance
// narration this project's own house style already bans (CLAUDE.md/AGENTS.md Section 7), but which
// had only ever been written into /map-site's own "Reporting to the User" section, not applied
// project-wide. Global now, same insertion point as the language-default note.
const NO_COMPLIANCE_NARRATION_NOTE =
  'When reporting what a step or the whole run did, describe outcomes in plain terms a non-technical reader would understand - never recite which internal rule, contract, or convention was followed (e.g. never say something like "CPOM contract strictly honored: no assertions in Page Objects, Web-First assertions used, fixture injection applied"). Adopt every convention silently in the code itself; only report real findings (what was generated, what passed or failed, what a human needs to decide), never the fact that a rule was followed.';

// Inserted once, as its own short paragraph right after the skill's H1 heading - every skill's
// content starts with `# Skill: ... (/command)\n\n`, so this lands before Purpose/Workflow content
// rather than depending on locating a specific later heading that could itself be renamed.
function withGlobalConventions(skill: SkillDefinition): SkillDefinition {
  const [heading, ...rest] = skill.content.split('\n\n');
  return {
    ...skill,
    content: `${heading}\n\n${LANGUAGE_DEFAULT_NOTE}\n\n${NO_COMPLIANCE_NARRATION_NOTE}\n\n${rest.join('\n\n')}`,
  };
}

// Renders the 'arguments'/'argument-hint' frontmatter lines for assistants on the Agent Skills
// open standard (Claude Code, Cursor, Codex CLI) when a skill declares them - empty string for a
// skill with neither, so this composes cleanly into every assistant branch below.
function argumentFrontmatter(skill: SkillDefinition): string {
  const lines: string[] = [];
  if (skill.arguments) {
    lines.push(`arguments: [${skill.arguments.join(', ')}]`);
  }
  if (skill.argumentHint) {
    // Always YAML-double-quoted: the hint's own documented example values ('[issue-number]',
    // '[create|update]') start with '[', which an unquoted YAML scalar parses as a flow sequence
    // (an array) instead of a string - exactly the "must be a string" validation error this
    // guards against.
    lines.push(`argument-hint: ${yamlSafeScalar(skill.argumentHint)}`);
  }
  return lines.length > 0 ? '\n' + lines.join('\n') : '';
}

// Neither Antigravity nor Devin Desktop has a slash-command argument-substitution mechanism -
// live-verified 2026-09-03 via the installed Antigravity CLI's own bundled documentation, and via
// Devin's own skills documentation (same open Agent Skills standard: skills are discovered and
// activated autonomously from their `description`, never invoked as `/name arg`) - both assistants
// read skills from the same shared `.agents/skills/<name>/SKILL.md` path. A skill whose shared
// `content` body talks about "the argument this skill was invoked with" (map-site's create/update
// mode selection) is therefore describing a mechanism that does not exist for either assistant -
// generalized here for any current or future skill that declares `arguments` rather than
// special-cased per skill name.
function noArgumentSkillInvocationNote(skill: SkillDefinition): string {
  if (!skill.arguments) return '';
  return `> **Note:** this assistant has no slash-command argument mechanism - skills are activated autonomously from their description, or by explicitly asking for them in chat. Wherever the text below refers to "the argument this skill was invoked with," state the mode directly instead (e.g. "run ${skill.name} in create mode").

`;
}

// Identical across every language - which CI provider is configured (if any) is read from
// `.scaffold/init.json`'s `ciCd` field (surfaced by `scripts/auth-status.mjs`), and each
// provider's actual secret-injection mechanism is genuinely different, not a lookup-table
// variation on one shared template: GitHub/GitLab both have a local CLI commonly already
// authenticated (gh/glab) so pushing secrets can be offered as one command; Jenkins' declarative
// `credentials()` binding throws a hard build error the moment it references a credential that
// does not exist yet, so nothing gets auto-wired there - only manual, one credential at a time;
// TeamCity's DSL-level password parameter type requires a token minted by the TeamCity server
// itself, which cannot be produced from outside it, so that one is manual too, but through the
// UI's own Parameters screen (typed "Password"), not a DSL edit.
const AUTH_SETUP_CI_SECTION = `## Step 5: CI - reached only when \`plan.wireCi\` is true

Whether to ask about CI at all, and whether the human agreed, were both settled by \`scripts/auth-questions.mjs\` in Steps 0-3: the question is never asked on a project generated without CI, and a "no" already ended the flow with reason \`local-only\`. Reaching this step means \`plan.wireCi\` is true and \`plan.ciProvider\` names the one provider to use. Do not re-ask either question here.

Dispatch to the one provider \`plan.ciProvider\` names, and only that one - never reuse another provider's steps, they are not interchangeable.

\`plan.pushSecrets\` carries the human's own answer to the one irreversible, outward-facing action in this flow. When it is false, go straight to the manual path each provider below describes; never push a secret on your own reading of an earlier "yes" to a different question.

### GitHub Actions
1. Confirm \`.github/workflows/playwright.yml\`'s job already has an \`env:\` block wired to \`secrets.E2E_USERNAME\`/\`secrets.E2E_PASSWORD\`/\`secrets.AUTH_TOKEN\`/\`secrets.E2E_API_TOKEN\`/\`secrets.TOTP_SECRET\` (present by default in a freshly generated project; add it once if this project predates that).
2. Check whether \`.env\` already has real values for the auth variables this app actually needs. If not, ask for them now and write them into \`.env\` - never echo a value back into chat, confirm only its presence and length (e.g. "got a value, 12 characters").
3. Run \`gh auth status\`. If authenticated and \`plan.pushSecrets\` is true -> for each filled variable, run \`gh secret set <NAME> --body "$(grep '^<NAME>=' .env | cut -d= -f2-)"\` - the value is read from \`.env\` at shell-execution time, never typed or interpolated into the command string yourself, so it never appears in anything you write or in this session's own transcript. Then run \`gh secret list\` to mechanically confirm each name now exists (never print a value). \`plan.pushSecrets\` false, or \`gh\` missing/unauthenticated -> print the exact manual path instead: repo Settings -> Secrets and variables -> Actions -> New repository secret, naming exactly which variables are needed.

### GitLab CI
1. \`.gitlab-ci.yml\`'s top-level \`variables:\` block already bakes in \`E2E_BASE_URL\` by default - nothing to do there.
2. Explain plainly: GitLab auto-injects CI/CD Variables into every job's environment with zero YAML changes, unlike GitHub - once a variable exists in project settings, \`script:\` steps just see it.
3. Run \`glab auth status\`. If \`glab\` is installed and authenticated and \`plan.pushSecrets\` is true -> for each filled variable, run \`glab variable set <NAME> "$(grep '^<NAME>=' .env | cut -d= -f2-)" --masked\` - the value is read from \`.env\` at shell-execution time, never typed or interpolated into the command string yourself, so it never appears in anything you write or in this session's own transcript. Then verify via \`glab variable list\` (names only). \`plan.pushSecrets\` false, or \`glab\` missing/unauthenticated -> manual path: Settings -> CI/CD -> Variables -> Add variable, exact names, tick both "Masked" and "Protected."

### Jenkins
Never attempt an automated push here - there is no universal, already-authenticated local CLI for Jenkins the way \`gh\`/\`glab\` exist for GitHub/GitLab, and a wrong guess breaks the whole pipeline (see below).
1. Tell the user exactly: Jenkins -> Manage Jenkins -> Credentials -> (System) -> Global credentials -> Add Credentials - one per variable actually needed, using that exact variable name as the Credential ID (e.g. \`E2E_USERNAME\`).
2. Only once a credential genuinely exists, give the exact line to paste into the generated \`Jenkinsfile\`'s \`environment {}\` block (e.g. \`E2E_USERNAME = credentials('E2E_USERNAME')\`). Never add this line yourself for a credential that does not exist yet - Jenkins' declarative \`credentials()\` binding fails the entire build immediately if the named credential is missing, unlike GitHub/GitLab where an unset secret just resolves empty.

### TeamCity
Never attempt an automated push here either - TeamCity's DSL-level \`password()\` parameter type needs a token minted by the TeamCity server itself (via its own UI), which nothing outside that server can produce; hardcoding a fake token into checked-in code would not work and must not be attempted.
1. Tell the user exactly: Project Settings -> Parameters -> Add new parameter, name prefixed \`env.\` (e.g. \`env.E2E_USERNAME\`), type set to **Password**. This alone makes it a real environment variable in every build step - no DSL/code change needed at all.

## Step 6: Final Report

Print what actually happened this run: session file(s) written (by path, not content), whether CI wiring was done or skipped and why, which secret **names** were pushed if any (never values), and the exact next action for anything left for the user to do by hand.`;

// Shared by every Playwright-native language (playwright's codegen/open commands and this
// project's own `eitr auth` wrapper all support --save-har; Cypress has no equivalent tool at all
// - see AUTH_SETUP_CYPRESS_NETWORK_OBSERVATION_BULLET below for that case). Feeds both this
// skill's own API-based-precondition support and /design-test-cases'//automate-test's 'api'-layer
// test cases downstream (see ApiContractEntry in .scaffold/schemas/api-contracts.types.ts) - a
// login call observed here is exactly as contract-grounded as one observed mid-crawl by
// /map-site's own Step 2. The TS/Playwright command above already includes --save-har; for the
// other languages below, whose own capture command does not, append it the same way.
const AUTH_SETUP_NETWORK_OBSERVATION_BULLET = `- **Also observe the login network traffic**: if the capture command above did not already include \`--save-har=.auth/login-capture.har\`, append it now. Once the browser window closes, read that HAR file (JSON) yourself: for every POST/PUT response, search its body for a field name matching \`access_token\`/\`auth_token\`/\`id_token\`/\`jwt\`/\`session_token\` (case-insensitive). When found, that call is the login contract - record ONE entry in \`artifacts/site-map/api-contracts.json\` per \`.scaffold/schemas/api-contracts.types.ts\` (\`method\`, \`pathTemplate\`, \`observedFromRouteIds: []\` since this is the login call itself rather than an in-app route, \`responseStatus\`, \`responseShape\`, \`observedAt\`). **This IS the login call, so its \`sampleRequestPayload\` is exactly the request that carried the plaintext username/password you just typed** - redact every \`password\`/\`email\`/\`username\`/\`token\`/\`secret\`-named field's value unconditionally, regardless of what it looks like, not only digit-shaped values; \`node scripts/validate-api-contracts.mjs\`'s own redaction backstop mechanically re-checks this before you finish, but do it yourself first rather than relying on the backstop to catch what you missed. Delete \`.auth/login-capture.har\` once you are done reading it - a HAR captures the raw credentials actually typed and must never be committed or left on disk (already covered by \`.auth/\`'s existing \`.gitignore\` entry, but delete it anyway rather than relying on that alone).
- If a token was actually found, tell the user plainly: the app also supports API-based login - \`apiClient.setAuthToken(<token>)\` (or your language's equivalent - see \`shared/utils/api-client.*\`) can now drive fast, UI-independent preconditions (create/modify/delete/read setup calls before a test's real assertions) instead of only the cookie-based session captured above.`;

// Cypress has no codegen/HAR equivalent (see Step 4's own opening line), so observation happens by
// temporarily wrapping the real login submission in a broad cy.intercept() instead of reading a
// recorded file - same goal (find the login contract, feed it forward), different mechanism.
const AUTH_SETUP_CYPRESS_NETWORK_OBSERVATION_BULLET = `- **Also observe the login network traffic**: before writing the final \`login\` command, temporarily add \`cy.intercept('POST', '**').as('authTraffic')\` above the login form submission and run it once with \`cy.wait('@authTraffic')\` right after; inspect the captured response body for a field name matching \`access_token\`/\`auth_token\`/\`id_token\`/\`jwt\`/\`session_token\` (case-insensitive). When found, that call is the login contract - record ONE entry in \`artifacts/site-map/api-contracts.json\` per \`.scaffold/schemas/api-contracts.types.ts\` (\`method\`, \`pathTemplate\`, \`observedFromRouteIds: []\` since this is the login call itself rather than an in-app route, \`responseStatus\`, \`responseShape\`, \`observedAt\`). **This IS the login call, so its \`sampleRequestPayload\` is exactly the request that carried the plaintext username/password you just typed** - redact every \`password\`/\`email\`/\`username\`/\`token\`/\`secret\`-named field's value unconditionally, regardless of what it looks like, not only digit-shaped values; \`node scripts/validate-api-contracts.mjs\`'s own redaction backstop mechanically re-checks this before you finish, but do it yourself first rather than relying on the backstop to catch what you missed. Remove the temporary broad intercept before finishing - it was a one-time diagnostic, not something to leave in the committed \`login\` command.
- If a token was actually found, tell the user plainly: the app also supports API-based login - \`apiClient.setAuthToken(<token>)\` can now drive fast, UI-independent preconditions (create/modify/delete/read setup calls before a test's real assertions) instead of only the cookie-based session captured above.`;

// Who actually runs the capture command: always the human, in their own terminal, never the
// assistant. An earlier version gated this on whether the assistant could execute a terminal
// command at all, which is the wrong test and was live-observed failing - essentially every
// assistant CAN execute the command, so it ran the command itself, and the browser window it
// launched never reached the user (you cannot verify a GUI window you spawn is visible on the
// human's screen - a sandboxed, remote, or display-less execution environment produces no visible
// window and no error either). A later version offered a non-blocking agent-driven path
// (`@playwright/cli`'s persistent-session model) for the case where the assistant does drive it -
// removed again: it only ever fixed the blocking half of the problem, never the actual visibility
// question, and having two paths cost a confirmation question for no real gain over just always
// printing the command. One path, no branching, no question to get wrong.
const AUTH_SETUP_CAPTURE_POLICY = `- **Always print the command and let the human run it in their own terminal - never run it yourself.** Name which role is being captured right now - one role, one command, in the order Step 3 settled, never every role's command dumped at once. This is not a fallback for when you can't execute a terminal command - you almost always can - it is the only path: you cannot verify that a browser window you launch actually reaches the human's screen, and the command blocks for the whole login, which is human-paced, not machine-paced. Wait for the human to say they're done before continuing.`;

// Identical across every language - the part of the flow that decides whether auth is even
// needed, whether a session already exists, and how many roles to capture, all computed from
// `scripts/auth-status.mjs` rather than re-derived ad hoc each time.
const AUTH_SETUP_STEPS_0_TO_3 = `## Steps 0-3: The questions, driven by \`scripts/auth-questions.mjs\`

**Do not decide what to ask, in what order, or with which options. Run the script and ask what it returns.**

\`\`\`
node scripts/auth-questions.mjs
node scripts/auth-questions.mjs --answers='{"has-login":"yes"}'
\`\`\`

Call it with no answers to get the first question. Present that question, take the human's reply, add it to the answers object under the question's own \`id\`, and call it again. Repeat until it stops returning \`ASK\`. It reads the project's real state from \`scripts/auth-status.mjs\` itself, so you never re-derive session, role or CI state by hand.

Why this is a script and not instructions: the ordering is load-bearing in ways that are easy to get subtly wrong, and getting one wrong is invisible. Whether to approve a login-capture procedure is not a question anyone has a basis to answer before it is established that their app has a login at all; the existing-session question is meaningless on a project with no session; the CI question must never be asked on a project generated without CI. Encoded once, those hold every run, on every assistant, in every model. Held as prose, they hold most of the time.

**What to do with each result:**

- \`status: "ASK"\` - present \`question.text\` and \`question.options\` in the order given, marking the one with \`recommended: true\` as the recommendation. ${INTERACTIVE_CHOICE_NOTE} Do not add options, drop them, reorder them, change what the question is asking, or merge two questions into one exchange.
  - **Language.** The script's text is English because its ids have to be stable, not because the conversation has to be. Ask in whatever language the human is using: translate \`text\` and each option's \`label\` for them, keeping the meaning, the option set and the order exactly as returned. What must never change is the \`id\` you record - those are the same in every language, which is what lets this flow be checked mechanically at all.
- \`status: "STOP"\` - the flow ends here. Say \`outcome.message\` in your own words and stop. Every stop reason is a real, supported end state, not a failed run: a project with no login, a person who declined, a session being kept as-is, a decision to stay local-only. Do not carry on to the capture steps below.
- \`status: "DONE"\` - the questions are answered and \`plan\` says what was actually decided: whether to capture, which role slugs, whether to create \`.env\` credential slots, whether to wire CI, and whether the human agreed to push secrets. Act on \`plan\`, not on your own recollection of a conversation that may have run over many turns.
- \`status: "FAILED"\` - an answer was recorded that is not one of that question's option ids. Fix the answer, do not proceed.

**The one judgment this leaves you.** When a question has \`allowsFreeText: true\` and the human writes their own answer instead of picking, read what they meant and record the matching option \`id\` - that mapping is the part a script genuinely cannot do, and it works the same whatever language they answered in, because you record an id rather than their words. \`freeTextHint\` says what the free text is for. Re-ask only when the answer genuinely fits none of the options. Never invent an option id: the script rejects one it does not know, which is the point.

**Role names are the one answer recorded as words rather than an id, and they have a real constraint.** Each becomes a session filename and an \`E2E_<ROLE>_USERNAME\` variable, and environment variable names are ASCII by definition. Record what the human actually said; when a name has no latin letters or digits in it, the script refuses that name specifically and says so. Ask that one role for a latin name and keep the original as its display label - \`plan.roleLabels\` maps each slug back to the human's own wording. Never transliterate on their behalf: there is more than one defensible romanisation for most scripts and none at all for some, so choosing one is inventing a name they did not give.

**Contradictions are the script's decision, not yours.** Answering "no roles and no login at all" after having said the app does have a login returns a \`STOP\` with reason \`contradiction\`. Do not resolve it by picking whichever answer came last - guessing there means either capturing a session nobody wants or skipping one they do.

Normalize each role name the human gives into a lowercase, filesystem-and-env-safe slug (\`Admin\` -> \`admin\`, \`Read Only\` -> \`read_only\`) - \`plan.roles\` already does exactly this, so use it rather than slugging by hand - and echo the normalized list back once so a mis-typed name is caught before it becomes a filename. Every role gets its own session (a separate storage-state file for Playwright/pytest/C#/Java, a separate \`cy.session()\` name for Cypress) - never overwrite one role's saved session with another's. A role left uncaptured is a normal end state: say so plainly, and name re-running this skill as the way to add it later.

**Then create the credential placeholders, before any capture starts,** when \`plan.envRoleStubs\` is true: run \`node scripts/env-role-stubs.mjs --roles=<plan.roles, comma-separated>\`. This appends an empty \`E2E_<ROLE>_USERNAME=\`/\`E2E_<ROLE>_PASSWORD=\` pair per role to \`.env\`, so the human has a labeled slot per role to fill in instead of variable names being invented later, differently, by whatever writes the first test that needs them. It never overwrites a variable that already has a value, never prints a value, and re-running it changes nothing - so it is safe to run again when a role is added later. The one-kind-of-user case keeps the flat \`E2E_USERNAME\`/\`E2E_PASSWORD\` names that already exist: do not pass a role list for it. Tell the human plainly that those slots are now in \`.env\` waiting for values, and that the browser login in Step 4 is separate from them - the session file authenticates the tests, these variables are what a test uses when it needs to type credentials itself.

`;

function renderAuthSetupContent(sc: StackConventions): string {
  if (sc.authStrategy === 'cypress') {
    return `# Skill: Auth Setup (/auth-setup, /auth-bootstrap)

## Purpose
Captures a real, working login session for testing, locally and (optionally) in CI - guided step by step, with your explicit go-ahead before anything that touches CI.

${AUTH_SETUP_STEPS_0_TO_3}## Step 4: Capture (Cypress has no external record tool - write the session command directly)

Unlike Playwright's \`codegen --save-storage\`, Cypress has no standalone tool to record a login into a portable file - session state lives inside the test run via \`cy.session()\`. Write (or update) a \`login\` custom command in \`cypress/support/commands.ts\` that fills the credentials for the role being set up into the real login form and wraps it in \`cy.session('<role>-session', () => { ... }, { validate() { ... } })\`, so Cypress restores cookies/localStorage/sessionStorage across spec files instead of logging in per test. Read those credentials from the environment, never as literals in the command: \`${sc.envAccess('E2E_USERNAME')}\`/\`${sc.envAccess('E2E_PASSWORD')}\` for the one-kind-of-user case from Step 3, or the per-role \`E2E_<ROLE>_USERNAME\`/\`E2E_<ROLE>_PASSWORD\` names \`scripts/env-role-stubs.mjs\` just created when several roles exist. Take the role parameter as an argument (\`cy.login('admin')\`) rather than writing one command per role. A \`validate()\` callback (a cookie check or an authenticated API call) is mandatory, not optional - without it a stale/expired session is silently reused.
- SSO/MFA/2FA: if \`${sc.envAccess('TOTP_SECRET')}\` is set, generate a real RFC 6238 code and fill it into the MFA prompt; otherwise the first login is manual/human-driven, then cached via \`cy.session()\` from there on.
- **Verify, never assume success**: call \`cy.login()\` once and assert a genuinely protected element or page is visible afterward - a command that runs without throwing is not proof it actually authenticated.
${AUTH_SETUP_CYPRESS_NETWORK_OBSERVATION_BULLET}

${AUTH_SETUP_CI_SECTION}
`;
  }

  if (sc.authStrategy === 'pytest') {
    return `# Skill: Auth Setup (/auth-setup, /auth-bootstrap)

## Purpose
Captures a real, working login session for testing, locally and (optionally) in CI - guided step by step, with your explicit go-ahead before anything that touches CI.

${AUTH_SETUP_STEPS_0_TO_3}## Step 4: Capture (the only step that touches a real browser)

- Resolve the login URL the same way \`eitr auth\`'s CLI does: \`${sc.envAccess('E2E_BASE_URL')}\` in \`.env\` first, then \`pyproject.toml\`'s \`base_url\`, then ask directly if neither resolves - never guess a URL.
- State plainly: "A real browser window will open at <url>. Log in there yourself - any SSO/MFA/2FA, just do it normally, that's the whole point of using a real browser and a real human. Close the window once you see you're logged in - the session saves automatically."
- **The command for this role**: \`playwright codegen --save-storage=.auth/<role>.json <url>\` (the one-kind-of-user case from Step 3 writes \`.auth/user.json\`). Never print, ask for, or repeat back the username or password itself - the human types their credentials into the browser, and no part of this flow needs you to know them.
${AUTH_SETUP_CAPTURE_POLICY}
- **Mechanically verify, never assume success**: after the command exits, confirm the output file exists, is non-empty JSON, and actually contains at least one cookie or \`origins\` entry. If not: "Doesn't look like login actually completed - no session data was captured. Try again?" - a file that merely exists is not proof of a real session.
${AUTH_SETUP_NETWORK_OBSERVATION_BULLET}
- \`fixtures/auth_setup.py\` (\`browser_context_args\` in \`conftest.py\` already preloads \`.auth/user.json\` when present) exists for CI/headless re-auth without a human - this step's own capture is the one-time, human-driven path, not a replacement for it.

${AUTH_SETUP_CI_SECTION}
`;
  }

  if (sc.authStrategy === 'csharp') {
    return `# Skill: Auth Setup (/auth-setup, /auth-bootstrap)

## Purpose
Captures a real, working login session for testing, locally and (optionally) in CI - guided step by step, with your explicit go-ahead before anything that touches CI.

${AUTH_SETUP_STEPS_0_TO_3}## Step 4: Capture (the only step that touches a real browser)

- Resolve the login URL the same way \`eitr auth\`'s CLI does: \`${sc.envAccess('E2E_BASE_URL')}\` in \`.env\` first, then \`test.runsettings\`, then ask directly if neither resolves - never guess a URL.
- State plainly: "A real browser window will open at <url>. Log in there yourself - any SSO/MFA/2FA, just do it normally, that's the whole point of using a real browser and a real human. Close the window once you see you're logged in - the session saves automatically."
- **The command for this role** - Windows: \`pwsh bin/Debug/net8.0/playwright.ps1 codegen --save-storage=.auth/<role>.json <url>\`; macOS/Linux: \`bin/Debug/net8.0/playwright.sh codegen --save-storage=.auth/<role>.json <url>\` (the one-kind-of-user case from Step 3 writes \`.auth/user.json\`). Never print, ask for, or repeat back the username or password itself - the human types their credentials into the browser, and no part of this flow needs you to know them.
${AUTH_SETUP_CAPTURE_POLICY}
- **Mechanically verify, never assume success**: after the command exits, confirm the output file exists, is non-empty JSON, and actually contains at least one cookie or \`origins\` entry. If not: "Doesn't look like login actually completed - no session data was captured. Try again?" - a file that merely exists is not proof of a real session.
${AUTH_SETUP_NETWORK_OBSERVATION_BULLET}
- Nothing preloads this automatically yet: override \`ContextOptions()\` in the \`PageTest\` base class once with \`StorageStatePath = ".auth/user.json"\` so every test picks it up.

${AUTH_SETUP_CI_SECTION}
`;
  }

  if (sc.authStrategy === 'java') {
    const isGradle = sc.buildTool === 'gradle';
    const captureCmd = isGradle
      ? '`gradle playwrightCodegen -Purl=<url> -Poutput=<output path>`'
      : '`mvn exec:java -e -Dexec.mainClass=com.microsoft.playwright.CLI -Dexec.args="codegen --save-storage=<output path> <url>"`';
    return `# Skill: Auth Setup (/auth-setup, /auth-bootstrap)

## Purpose
Captures a real, working login session for testing, locally and (optionally) in CI - guided step by step, with your explicit go-ahead before anything that touches CI.

${AUTH_SETUP_STEPS_0_TO_3}## Step 4: Capture (the only step that touches a real browser)

- Resolve the login URL the same way \`eitr auth\`'s CLI does: \`${sc.envAccess('E2E_BASE_URL')}\` in \`.env\` first, then ask directly if that's unset - never guess a URL.
- State plainly: "A real browser window will open at <url>. Log in there yourself - any SSO/MFA/2FA, just do it normally, that's the whole point of using a real browser and a real human. Close the window once you see you're logged in - the session saves automatically."
- **The command for this role**: ${captureCmd}, writing \`.auth/<role>.json\` (the one-kind-of-user case from Step 3 writes \`.auth/user.json\`). Never print, ask for, or repeat back the username or password itself - the human types their credentials into the browser, and no part of this flow needs you to know them.
${AUTH_SETUP_CAPTURE_POLICY}
- **Mechanically verify, never assume success**: after the command exits, confirm the output file exists, is non-empty JSON, and actually contains at least one cookie or \`origins\` entry. If not: "Doesn't look like login actually completed - no session data was captured. Try again?" - a file that merely exists is not proof of a real session.
${AUTH_SETUP_NETWORK_OBSERVATION_BULLET}
- Nothing preloads this automatically yet: initialize the browser context once with \`Browser.NewContextOptions().setStorageStatePath(Paths.get(".auth/user.json"))\` in the test base class or \`@BeforeEach\` so every test picks it up.

${AUTH_SETUP_CI_SECTION}
`;
  }

  // Default: TypeScript Playwright
  return `# Skill: Auth Setup (/auth-setup, /auth-bootstrap)

## Purpose
Captures a real, working login session for testing, locally and (optionally) in CI - guided step by step, with your explicit go-ahead before anything that touches CI.

${AUTH_SETUP_STEPS_0_TO_3}## Step 4: Capture (the only step that touches a real browser)

- Resolve the login URL the same way \`eitr auth\`'s CLI does: \`${sc.envAccess('E2E_BASE_URL')}\` in \`.env\` first, then \`playwright.config.ts\`'s \`baseURL\`, then ask directly if neither resolves - never guess a URL.
- State plainly: "A real browser window will open at <url>. Log in there yourself - any SSO/MFA/2FA, just do it normally, that's the whole point of using a real browser and a real human. Close the window once you see you're logged in - the session saves automatically."
- **The command for this role**, using this project's own CLI wrapper (it resolves the URL exactly as described above, writes that role's session file, and - since \`--save-har\` is included below - also records the login network traffic the next bullet needs): \`npx eitr auth --role <role> --save-har=".auth/login-capture.har"\`. The one-kind-of-user case from Step 3 drops \`--role\`: \`npx eitr auth --save-har=".auth/login-capture.har"\`, which writes \`.auth/user.json\`. Without this project's CLI installed, the direct equivalent is \`npx playwright open --save-storage=".auth/<role>.json" --save-har=".auth/login-capture.har" "<url>"\`. Never print, ask for, or repeat back the username or password itself - the human types their credentials into the browser, and no part of this flow needs you to know them.
${AUTH_SETUP_CAPTURE_POLICY}
- **Mechanically verify, never assume success**: after the command exits, confirm the output file exists, is non-empty JSON, and actually contains at least one cookie or \`origins\` entry. If not: "Doesn't look like login actually completed - no session data was captured. Try again?" - a file that merely exists is not proof of a real session.
${AUTH_SETUP_NETWORK_OBSERVATION_BULLET}
- \`fixtures/auth.setup.ts\` exists for CI/headless re-auth without a human - it already handles MFA/TOTP (via \`TOTP_SECRET\`, a real RFC 6238 code) and an API Fast-Path Token mode (via \`E2E_API_TOKEN\`/\`AUTH_TOKEN\`, for an app whose login issues a token directly) - this step's own capture is the one-time, human-driven path, not a replacement for it. Nothing preloads the captured file automatically yet: uncomment \`storageState: '.auth/user.json'\` in \`playwright.config.ts\` once so every test picks it up.

${AUTH_SETUP_CI_SECTION}
`;
}

function buildOperationalSkills(tool: string, language: string): SkillDefinition[] {
  const sc = resolveStackConventions(tool, language);
  const isCypress = sc.automationTool === 'cypress';
  const frameworkName = sc.frameworkName;

  return [
    {
      name: 'auth-setup',
      description:
        'Captures, validates, and manages authenticated browser sessions for testing (/auth-setup, /auth-bootstrap).',
      content: renderAuthSetupContent(sc),
    },
    {
      name: 'scan-and-generate-pom',
      description:
        'Crawls a target page, synthesizes CPOM Page Objects, and verifies their liveness against the live DOM.',
      content: `# Skill: Scan and Generate POM (/scan-and-generate-pom)

## Purpose
Inspects live application DOM, extracts semantic elements, groups them into CPOM components, and validates their liveness.

## Workflow
0. **Standalone Entry Check (skip entirely when invoked as part of \`/automate-test\`'s or \`/map-site\`'s own chain - their own gates already cover this):** state in one plain sentence what this does - "Crawls this page live and generates a verified Page Object for it - the same step /automate-test and /map-site already trigger automatically when a component is missing." - then ask: **Continue, or stop here?** ${INTERACTIVE_CHOICE_NOTE} Stop on anything but an explicit yes; nothing has run yet at this point.
1. **Target Inspection & Batch Worker Mode:**
   - Single Page: Navigate to target URL using Playwright MCP or reconnaissance engine.
   - Batch Swarm Mode: If processing multiple routes, run \`node scripts/orchestrate-swarm.mjs --phase=plan\` (add \`--routes=<a,b,c>\` to scope to a specific subset) and dispatch parallel 'pom-engineer' worker subagents per its Level 2 worker list (1 route per worker) for concurrent synthesis - do not enumerate routes/workers yourself.
   - Wait for network idle and main DOM stabilization.
2. **Semantic Hierarchy Extraction & Feed Guard:**
   - Extract elements using 3-Tier Locator Priority (getByTestId -> getByRole -> getByLabel/getByText).
   - Inspect and resolve Shadow DOM boundaries and embedded iframes via \`frameLocator()\`.
   - **Infinite Scroll & Dynamic Feed Guard:**
     * When inspecting pages with infinite scroll, virtual lists, or dynamic feeds (e.g. social feeds, catalog grids, event streams), NEVER attempt to scroll to the end of the page.
     * Perform a MAXIMUM of 2 viewport scrolls to identify the repeating item structure.
     * Immediately synthesize a CPOM Collection property via \`this.list(ItemComponent, spec)\` (returning Collection<ItemComponent>) and terminate page exploration.
3. **CPOM Synthesis & Shared Widget Reuse:**
   - Consult \`artifacts/site-map/site-map.json\` and \`components/widgets/\` for existing shared widgets (e.g. Navbar, Sidebar, Dialog) and compose them via \`this.child(WidgetClass, spec)\`.
   - Generate or update Page Object class inheriting from \`BasePage\`.
   - Group related interactive controls into CPOM primitives (Button, TextInput, Select, Table, Dialog) or collections (\`this.list(ItemComponent, spec)\`).
   - Enforce Method Safety Contract (Actions return ${sc.actionReturnType}, Snapshot readers suffixed with \`${sc.stateReaderSuffix}\`).
4. **Live-DOM Liveness Verification:**
   - Verify every generated Page Object directly against the live application with Web-First assertions before treating it as complete. A raw DOM/accessibility-tree match found during extraction (Step 2) is NEVER sufficient evidence by itself that a real user can see or reach the element - an element present in the markup but hidden (\`display: none\`, off-screen, zero-size, \`opacity: 0\`, or covered by another element) MUST NOT become a CPOM property or method:
     * Tier 1 (Actionable Visibility, checked per element, not per page): (a) \`await locator.count() === 1\`; (b) \`await expect(locator).toBeVisible()\` (non-empty bounding box, not \`visibility:hidden\`/\`display:none\` - this alone does NOT catch \`opacity: 0\`); (c) \`await locator.evaluate(el => getComputedStyle(el).opacity !== '0')\`; (d) \`await locator.click({ trial: true })\` (or \`.fill({ trial: true })\` for text inputs) to run Playwright's full actionability pipeline (stable, receives pointer events i.e. not obscured, enabled) without performing the action - safe even for destructive controls. Any element failing (a)-(d) is a phantom: do not scaffold it, and remove it if an earlier pass already did.
     * Tier 2: State readers (\`valueNow()\`, \`optionsNow()\`, \`rowCountNow()\`).
     * Tier 3: Trigger conditionally-rendered UI non-destructively - not just tabs/accordions, but
       dialogs/drawers (\`Dialog\`), dropdown/select menus, tooltips/popovers, expandable "show more"
       sections, date pickers, and context/overflow menus. If \`site-map.json\` flagged this route's
       \`regions\`/\`components\` with one of these, treat it as a lead to actively trigger, not just
       confirm if already visible. Revealed content still goes through Tier 1 before becoming a
       CPOM property - never click a mutating action to reveal something.
5. **Mandatory Execution & Self-Healing Loop:**
   - Immediately perform the liveness verification via the embedded Playwright MCP tools or an equivalent live check.
   - If failures occur due to locator drift or selector mismatch:
     * Inspect error traces, perform live DOM triage, adjust locators in the Page Object, and re-verify (Two-Strike Rule).
   - If failures are due to genuine application bugs (e.g. backend 500 error, unhandled JS exception, broken UI component):
     * Do NOT modify anything to hide the bug. Explicitly document and report the real product defect.
   - Batch Swarm Mode barrier: ${sc.language === 'typescript' ? 'once every dispatched worker reports done, run `node scripts/orchestrate-swarm.mjs --phase=verify --targets=<comma-separated Page Object paths each worker was expected to produce>` to confirm every worker actually wrote its file before declaring the batch complete.' : 'once every dispatched worker reports done, confirm each target Page Object was produced before declaring the batch complete.'}
6. **Mandatory Handoff Report:**
   - Present a structured summary listing generated Page Objects, liveness verification status (pass/fail counts), and any detected real application defects.
   - PROHIBIT delivering unverified or red code to the user without explicit defect reporting.
`,
    },
    {
      name: 'automate-test',
      description:
        'End-to-end automation from a TMS ticket or a locally-drafted test case to a verified green test.',
      content: `# Skill: Automate Test (/automate-test)

## Purpose
Transforms a test case - from Jira, TestRail, Zephyr, Azure DevOps, or drafted locally by \`/design-test-cases\` - into a fully verified automated test.

## Workflow
1. **Intake (source resolution, before anything else):**
   * **Self-introduction, every time this skill runs, standalone or as Stage 5 of a chain**: state in one plain sentence what happens now, before anything else - "This writes real, running test code for your reviewed test case(s) and executes it - the step that turns a reviewed plan into a working test suite." A user reaching this stage for the first time (via \`/ground-zero-setup\` or directly) has no other way to know what this command actually does before it does it.
   * Run \`node scripts/automate-test-status.mjs\` before asking anything. Its \`providers\`/\`providerCount\`/\`tmsConfigured\` tell you which TMS/task-tracker provider(s) are actually configured (read from whichever MCP config this project generated, never guessed from which \`mcp__tms__*\` tools happen to be visible in this conversation - a project can have a provider configured but its MCP server not currently loaded, or vice versa on a stale config); its \`localDraftsCount\`/\`localDraftsExist\` tell you how many un-automated local drafts exist in \`artifacts/test-cases/test-cases.json\`. Whether the user named an explicit case/ticket ID is the one fact only the live conversation can answer - read that from the user's own message, never from this script.
   * **General principle governing every branch below**: ask a clarifying question only when at least two genuinely different sources are actually possible. When exactly one source could plausibly be meant, proceed with it directly instead of asking a question with only one real answer - a question that cannot change the outcome only adds friction.
   * **Arrived directly from \`/ground-zero-setup\`'s own chain**: skip every question below entirely - it already established there is nothing else to automate but the test cases \`/design-test-cases\` just drafted. Use them directly.
   * **An explicit case/ticket ID was named** (e.g. "automate T001", "automate AZURE-789"):
     - No TMS/task-tracker is configured: say so plainly - that ID can't be resolved without one - and ask whether the human meant a locally-drafted test instead (name how many exist, if any), or wants to configure a TMS connection first. Do not guess which one they meant.
     - Exactly one provider is configured: confirm once, briefly, naming it before fetching anything - e.g. "Take {id} for automation from {provider}?" - since a bare ID alone doesn't yet confirm intent. ${INTERACTIVE_CHOICE_NOTE}
     - More than one provider is configured: if the ID's own format already names a provider unambiguously, proceed without asking; otherwise ask which provider it belongs to. ${INTERACTIVE_CHOICE_NOTE}
     - Once the source is settled, fetch ticket details via \`mcp__tms__get_test_case({ caseId, provider })\`.
   * **No explicit ID was named:**
     - No un-automated local drafts exist (the file is missing, or every entry is already \`reviewed: true\`):
       - No TMS/task-tracker is configured either: refuse plainly - print exactly: "Nothing to automate yet. Run /design-test-cases to draft test cases locally, or name a specific TMS ticket ID." Do not proceed.
       - A TMS/task-tracker is configured: ask which test(s) to automate and from where - there is no local default to offer. ${INTERACTIVE_CHOICE_NOTE}
     - Un-automated local drafts exist:
       - No TMS/task-tracker is configured: proceed directly with every un-automated local draft - it is the only source that could possibly exist, so a question here would have only one real answer.
       - A TMS/task-tracker is configured too: ask one short question offering the local drafts as the recommended default, with a TMS ticket ID named as the alternative - e.g. "Automate the N test cases drafted locally? (or name a TMS ticket ID instead)". ${INTERACTIVE_CHOICE_NOTE}
   * For the locally-sourced path (whichever branch above led here): read \`artifacts/test-cases/test-cases.json\`, scoped to every journey with a \`testCase\` and \`reviewed: false\` unless the human named a narrower subset. Treat each selected journey's \`testCase\` (\`title\`/\`preconditions\`/\`steps\`) as this ticket's content for every step below - Steps 2-8 apply identically regardless of source, except where a step below says otherwise.
   * Mask any PII, credentials, or proprietary tokens before processing, regardless of source.
2. **TMS Quality Validation (GIGO Protection):**
   - Delegate test case to 'tms-validator' to audit atomicity (steps <= 10), expected results verifiability, and TDM prerequisites.
   - If Quality Score < 80%, halt execution and present a structured Rejection Report with remediation recommendations for the test author.
3. **Component Resolution & Gap Analysis:**
   - Consult \`artifacts/site-map/site-map.json\` and \`components/pages/\` to resolve target routes, Page Objects, and shared widgets.
   - If components are missing, trigger \`/scan-and-generate-pom\` to generate and liveness-verify the required Page Objects.
   - If a step needs a file-upload fixture (image, PDF, CSV, or a deliberately-wrong-format file for a negative case) or a bulk/structured dataset beyond \`ApiClient\`'s scalar synthetic-data helpers (\`createTestEmail()\`, \`createTestUuid()\`, etc.), delegate to \`test-data-engineer\` rather than inventing one inline.
   - If this route or step involves an unfamiliar UI library, component pattern, or ${frameworkName}/${sc.language} API you're not confident about, look up its current official documentation before synthesizing code against it in Step 5 - guessing at an unfamiliar API's actual signature or behavior is how a synthesized test ends up subtly wrong in a way that still passes. Skip this for anything already well-established from prior steps in this same run or from \`CONVENTIONS.md\`'s own documented conventions - this is for genuine unfamiliarity, not a blanket research pass on every ticket.
4. **Human Sign-Off Gateway (Proposal Artifact):**
   - **TMS-sourced ticket(s)**: present a concise Markdown automation proposal artifact per ticket - Ticket ID, Target Route, Page Objects used, Execution Plan, TDM strategy - and, when more than one ticket is being automated in the same run, a **Batch Proposal Matrix** table so they can all be approved in one reply instead of one confirmation per ticket.
   - **Locally-sourced journeys (arrived from \`/design-test-cases\`/\`/ground-zero-setup\`)**: this is always "automate everything reviewed," never a subset to negotiate case-by-case - skip the proposal-matrix format entirely and ask one direct question naming the count read from \`node scripts/automate-test-status.mjs\`, never an estimate: **"Create Page Objects and automate all <N> drafted test cases? This writes <N> spec files and runs each one."** ${INTERACTIVE_CHOICE_NOTE} A "yes" here authorizes all N, not a first batch of them - a run that stops earlier has not fulfilled this answer and must say so explicitly per Step 7's accounting rule, rather than presenting a partial batch as the completed job. When N is large enough that finishing in one session is genuinely uncertain, say that in the same question ("this is a big batch - if the session runs out before all <N> are done, re-running /automate-test picks up exactly the ones left") instead of discovering it silently halfway through.
   - BLOCKING GATE either way: wait for explicit user confirmation before synthesizing test code.
5. **Linear Test Code Synthesis (SOTA 2026):**
   - **Content fidelity is mandatory, not just structural compliance (found violated in live use - a test with correct step demarcation, fixture DI, and linear structure that still asserted nothing real).** Every step's body must perform the literal action its \`description\` names, using a real Page Object interaction (\`.selectOption()\`, \`.check()\`, \`.fill()\`, \`.click()\` on the actual child element - never a generic visibility check on an unrelated container standing in for it), and assert the literal value its \`expectedResult\` names (the actual text/value/status code mentioned - never a content-free assertion like \`toBeDefined()\` or \`toBeVisible()\` on something the step never touched). If the target Page Object has no child element for what a step needs to interact with, that is a real gap: fix it via Step 3's \`/scan-and-generate-pom\` trigger first - never paper over the gap by writing a step that quietly checks something else instead.
      - **Bad** (real code from an earlier run - structurally compliant, semantically empty): step titled \`Verify baseline workflow: enter language="en"\` whose body is only \`await expect(rootPage.primaryContainer.locator).toBeVisible()\` - never touches the language control, would pass identically if language selection were completely broken.
      - **Good**: \`await rootPage.languageSelect.selectOption('en'); await expect(rootPage.languageSelect.locator).toHaveValue('en');\` - the code does what the step says, and the assertion would actually fail if selection stopped working.
   - **Resolve every generically-described credential/PII value via the right synthesis source, never a hardcoded literal.** \`/design-test-cases\` already keeps a credential-shaped value out of the drafted step text itself, describing the field generically instead ("a valid password", "a registered email address") - this is where that generic description gets turned into an actual value, and it must never become a fresh plausible-looking literal typed inline. For a value that must match a REAL, already-provisioned account (logging in as an existing user), read it from \`.env\` (\`${sc.envAccess('E2E_USERNAME')}\`/\`${sc.envAccess('E2E_PASSWORD')}\`) - inventing one instead would simply fail to authenticate. For a value that only needs to be VALID, not any specific existing one (a new signup, a new order's email field), synthesize it via the \`${sc.fixturePattern}\`-injected API client's own TDM helpers (\`createTestPassword()\`, \`createTestEmail()\`, etc.) - never write a fresh string that merely looks like a real password/email directly in the test file. \`test-data-engineer\` is a different, narrower tool for a different job (structured/bulk datasets and file fixtures, per Step 3) - it explicitly declines single scalar values itself, so it is never the right place to route a password/email.
     - **Which variable name**: a project with one kind of user uses the flat \`${sc.envAccess('E2E_USERNAME')}\`/\`${sc.envAccess('E2E_PASSWORD')}\`; a project where \`/auth-setup\` captured named roles has per-role \`E2E_<ROLE>_USERNAME\`/\`E2E_<ROLE>_PASSWORD\` variables already sitting in \`.env\` - read the role's own pair rather than the flat one, and never invent a third naming scheme for a role that already has slots.
     - **This one is mechanically enforced**, not just written here: \`${sc.cpomLintCmd}\`'s Rule 7 fails on a credential-shaped literal typed into a credential-shaped field in a spec. There is exactly one legitimate exception - a deliberately wrong value in a rejection test is test data, not a secret - and it is declared, not assumed: annotate that line with \`// @allow-credential-literal: <reason>\` (\`#\` in Python), the same shape as Rule 6's \`@allow-mock\`. Never reach for the annotation to silence a real credential; use it only where the whole point of the value is that it must not work.
   - **Bracketed step text is the locator's name, verbatim.** When a drafted step references a bracketed literal (\`Click the [Place Order] button\`, \`Select the [Card] payment method\`), the synthesized locator targets exactly that accessible name (\`page.getByRole('button', { name: 'Place Order' })\`, or the matching Page Object child) - never a paraphrase, a different label spotted on the live page, or a role-only locator that drops the name entirely. If a bracketed name doesn't resolve to anything in the target Page Object, that's the same real gap Step 3's \`/scan-and-generate-pom\` trigger exists for - fix the Page Object, never quietly substitute a different element.
   - **The Assertion Rules (all seven, checked per step, not a general aspiration).** A test that executes the right actions and asserts nothing that could distinguish a working feature from a broken one is the single most common failure this step produces, so these are written to be mechanically checkable by \`assertion-auditor\` in Step 6 rather than left to judgment. A step is only allowed to be weaker than a rule when the application genuinely does not provide that signal - which is a fact to state in the report, never a default to fall back on quietly.
     1. **Own-action grounding.** Every assertion references a value the step's own action produced or changed. An assertion about an element the step never touched does not count as that step's assertion.
     2. **Two independent channels for any state change.** A step that creates, updates, deletes, or authenticates asserts through at least two of: rendered UI text/value, the HTTP response (status and the body fields that should reflect the submitted values, not just a 2xx), the URL, persisted storage (cookie/localStorage), and a second view or endpoint that should now reflect the change. Asserting the same fact twice through one channel is one channel, not two.
     3. **Negative space on every rejection.** A step asserting that something was refused also asserts the artifact of success that must NOT exist: no session cookie was created, no navigation happened, the record is absent from the list it would have appeared in. An error message being visible proves a message rendered, not that the operation was actually prevented.
     4. **Auth and permission boundaries are verified by direct request.** When the subject under test is a login, a logout, or an access restriction, assert that the protected resource is still refused when requested directly - navigate straight to it and check - not only that the UI showed an error. A system that renders an error banner while leaving the protected page reachable is exactly the defect this catches, and it is invisible to any UI-only check.
     5. **Named literals are asserted literally.** When a step names a concrete value - a status code, a message, a field's new value - assert that exact value. A bare visibility or definedness check never satisfies a step that named a literal.
     6. **HTTP outcomes are asserted as HTTP outcomes.** When the behavior under test is a response code or a redirect, assert the real response: \`page.goto()\` returns the main resource response, so \`const response = await page.goto(url); expect(response?.status()).toBe(404);\` is the assertion, and a click-triggered navigation uses \`page.waitForResponse()\` raced with the click. Playwright does not throw on 4xx/5xx, so an unasserted status silently passes. Asserting that a link to a status code is visible is not a test of that status code.
     7. **Every assertion must be able to fail.** For each test, be able to name in one sentence the change to the application that would make it red. When no such change exists, the test does not verify anything and must be strengthened before it is allowed to pass Step 6.
     Corroboration is bounded by what the application actually provides: never assert a signal it does not surface, and never invent an endpoint or a toast to satisfy a rule. Rule 2's channels are also where the observed API contracts in \`artifacts/site-map/api-contracts.json\` earn their keep - a login step's own contract was recorded by \`/auth-setup\`, so the response assertion for it is grounded, not guessed.
   - Synthesize strictly linear ${frameworkName} (${language}) test code with ZERO branching (\`if/else\`, loops) in \`${sc.specPath('{id}', '{feature}')}\` for both a TMS-sourced ticket (\`{id}\` is the real ticket ID) and a locally-sourced journey (\`{id}\` is \`TC-{seq}\`, a 3-digit zero-padded sequence number). For \`{seq}\`: scan the directory this spec is written into for the highest existing \`TC-NNN\` prefix from any source and use NNN+1 - never reuse a number, never restart the counter per run, and never derive it from \`journeyId\` (illegible and unnecessary once it's not doing filename duty). Carry the journey's full traceability identity as a tag instead of in the filename: add \`@journey:{first 12 characters of journeyId}\` to this test's tag/attribute list (alongside the \`@smoke\`-style tag below) so a human or another agent can still trace the file back to its source journey without a hash in the visible name.
   - Use Fixture Dependency Injection via \`${sc.fixturePattern}\` to supply Page Objects and ApiClient instances.
   - Embed metadata tags per language conventions (e.g. \`${sc.language === 'python' ? '@pytest.mark.smoke' : sc.language === 'csharp' ? '[Category("smoke")]' : sc.language === 'java' ? '@Tag("smoke")' : "{ tag: ['@smoke'] }"}\`).
   - Wrap every step in \`${sc.stepDemarcation('Step N: ...')}\` - the step's own body is exactly where content fidelity above applies.
   - Map every expected result to an auto-retrying Web-First assertion (\`${sc.assertionPattern}\`) that names the concrete expected value, never a bare truthy/definedness check.
   - For popup, dialog, or navigation triggers, use Race-Free Event Synchronization: \`${sc.asyncEventSync}\`.
   - Register cleanup teardown ${sc.language === 'python' ? 'via fixture yield or `api_client` register_teardown' : 'in teardown hooks or fixture teardown via `apiClient`'}.
   - **For a locally-sourced journey whose \`layer\` is \`'api'\`, synthesize an API-only test instead of a UI-driven one**: drive every step directly through the \`${sc.fixturePattern}\`-injected API client, with zero Page Object interaction and zero DOM assertions - each step's expected result is asserted against the actual HTTP response (status code, response body fields) instead. Use each step's own \`api\` field (\`method\`, \`path\`, \`payload\`, \`expectedStatus\`, \`expectedResponseShape\`) when \`contractGrounded: true\` to build the real request and assertion; when a step's \`api\` field is absent or \`contractGrounded: false\`, that step has no observed contract to automate against - stop and report it as a gap (re-crawl the interaction with \`/map-site\` or capture it during \`/auth-setup\`) rather than inventing request/response detail for it. Name the spec file so it reads as API-only at a glance, distinct from a UI spec - append \`-api\` to the feature segment (e.g. \`${sc.specPath('{id}', '{feature}-api')}\`).
6. **Assertion Audit & Side-Effect Verification:**
   - Audit the test with \`assertion-auditor\`, which checks the seven Assertion Rules from Step 5 one by one, plus the content-fidelity and bracket-grounding checks: flag any step whose assertion does not reference something the step's own action touched, whose locator does not match the drafted step's bracketed name, that names a literal without asserting it, that changes state through only one channel, that asserts a rejection without asserting the corresponding negative space, or whose subject is an HTTP outcome or an auth boundary and is checked through the UI alone. Every flag is fixed here, before Step 7 runs the test - a rule the auditor reported and nobody acted on is worth nothing.
   - Verify CPOM contract compliance via \`${sc.cpomLintCmd}\`.
7. **Execution & Self-Healing:**
   - Run the newly synthesized test via terminal: \`${sc.testIsolatedCmd(sc.specPath('{id}', '{feature}'))}\` (or run full suite via \`${sc.testRunCmd}\`).
   - If failure occurs, automatically trigger \`/heal-test\` under the Two-Strike Rule.
   - **TMS-sourced ticket:** publish execution results back to TMS via \`mcp__tms__post_test_result\`.
   - **Locally-sourced journey:** once the test passes, set that journey's \`reviewed: true\` and \`reviewedBy: 'human'\` in \`artifacts/test-cases/test-cases.json\` - this skill's own Step 4 confirmation already is the human sign-off; there is no TMS entry to publish results to. Also set that file's top-level \`lastUpdatedAt\` to now, the same idiom \`artifacts/site-map/site-map.json\` already uses for its own updates - this is what lets \`scripts/pipeline-status.mjs\` report Stage 5's own completion time instead of leaving it blank.
   - **Order the batch by impact, highest first, before dispatching anything.** Read each journey's route impact from \`artifacts/analysis/business-intent.json\` (\`criticalityTier.value\`) and automate \`high\` routes before \`medium\` before \`low\`. A large batch does not reliably finish in one session - live-observed stopping at 12 of 92 - and which tests exist when it stops is decided entirely by this ordering. Arbitrary order means an interrupted run leaves an arbitrary suite; impact order means it leaves the most valuable tests that fit. Within one impact tier the order does not matter, so do not invent a secondary sort.
   - **Parallel dispatch for a multi-journey batch (deterministic worker list, never an improvised one):** run \`node scripts/orchestrate-swarm.mjs --phase=plan\` and take its Level 3 \`journeys\` wave - one worker per drafted journey not yet automated, computed from \`artifacts/test-cases/test-cases.json\` itself. Dispatch those workers in parallel up to the plan's own \`maxConcurrency\`, one journey per worker, rather than walking the whole batch serially in this one conversation: each journey produces exactly one spec file, so parallel workers never write the same file, and a serial walk through a large batch is precisely what ran out of room at 12 of 92 in live use. Do not enumerate the journeys or pick a concurrency number yourself - both come from the plan output. Shared prerequisites come first: any Page Object a batch needs must exist before the journey workers that use it start (Step 3's gap analysis), and each worker still performs Steps 5-8 in full for its own journey.
   - **Batch accounting, before this step is allowed to finish:** re-run \`node scripts/automate-test-status.mjs\` and compare the un-automated count against the N the human approved in Step 4. When anything is left, that is the headline of your report, not a footnote: state the exact numbers ("automated 12 of 92 - 80 test cases are still not automated") and the exact resume command (\`/automate-test\` with no ticket ID picks up precisely those remaining ones). Never describe a partially-completed batch as done, and never let a batch end silently at whatever count the session happened to reach - a human who approved N and received a fraction of N with no accounting has no way to tell the difference between "finished" and "stopped."
8. **Post-Automation Self-Review (closed-set, bounded - exactly these 4 checks, once per test, never a broader open-ended audit):**
   - Re-read the ORIGINAL drafted \`testCase\` (title/preconditions/steps) alongside the FINAL synthesized code (post-healing, if \`/heal-test\` ran) and check exactly these 4 flags - never scan for anything beyond them:
     1. \`drafted-code-drift\`: a step's final code no longer performs the action or asserts the value its own drafted \`description\`/\`expectedResult\` names (most often introduced by \`/heal-test\` loosening something to reach green). Fix: restore the code to match the original drafted intent, then re-run the isolated test to confirm it is green for the RIGHT reason, not merely green.
     2. \`loosened-assertion\`: an assertion Step 6's \`assertion-auditor\` pass approved was subsequently weakened (a concrete-value check swapped for a bare visibility/definedness check) during self-healing. Fix: restore the stronger assertion and re-verify.
     3. \`orphaned-precondition\`: the testCase's own \`preconditions\` names a setup condition the final code never actually establishes (no \`apiClient\` seeding call, no UI setup step) - silently relying on incidental environment state instead. Fix: add the missing seeding step before the affected step, then re-run.
     4. \`dead-teardown-gap\`: a step that creates persistent state (an \`apiClient\` POST/PUT/DELETE, or a UI action creating a durable record) has no matching \`registerTeardown\`/cleanup registered. Fix: add the missing teardown registration.
   - This is a fix pass, not an annotate-only pass: apply the fix immediately when a flag is genuinely present - never invent one to seem thorough, and never skip one that genuinely applies to finish faster. Re-run only the affected isolated test after a fix, under the same Two-Strike Rule as Step 7's own healing loop: two failed fix attempts roll back to the pre-fix state (\`git checkout -- <file>\`) and report the gap plainly instead of a third attempt.
   - Report the flags actually found and fixed, or state plainly "No issues found in self-review" when none of the 4 apply - this is the last check before Step 9's Final Report, not a separate audit the human has to request.
9. **Final Report:**
   - Present the resulting test diff, execution logs, and verification status to the user.
   - For a locally-sourced batch, also state how many \`artifacts/test-cases/test-cases.json\` entries were marked \`reviewed: true\` this run.
   - **Cross-Page-Object Consolidation Pass - every run that touched more than one Page Object, including a run that stopped early.** Dispatch exactly one \`pom-engineer\` subagent for its own bounded consolidation pass over the Page Objects this run touched: it compares them against each other and against the tests that use them, extracts genuinely duplicated method-and-locator groups into shared widgets or primitives, and reports what it merged. One pass, never repeated within the same run; a run that touched exactly one Page Object has nothing to consolidate against and skips it. This runs here, at the end of this skill, in every invocation - standalone or as part of \`/ground-zero-setup\`'s chain. It used to be deferred to the chain's own End of Chain, which only fires when the whole pipeline reaches \`complete\`: a batch that stopped early therefore never got consolidated at all, which is exactly the run where duplicated Page Object code is most likely to have accumulated.
`,
    },

    {
      name: 'heal-test',
      description: 'Analyzes Playwright traces and logs to repair failing tests autonomously.',
      content: `# Skill: Heal Test (/heal-test)

## Purpose
Performs root-cause analysis on failing test executions and applies precision fixes under the Two-Strike Rule.

## Workflow
0. **Self-Introduction (every run, standalone or in-chain) and Entry Check:** state in one plain sentence what this does - "Investigates why a test is failing - network, console, DOM evidence - and applies a targeted fix, rolling back if two attempts don't get it green." - before anything else runs. Print this sentence every time, including when triggered by \`/automate-test\`'s own healing step: it is the only signal a human gets that the run just moved from writing a test to diagnosing a failing one. Then, **only when invoked directly rather than by \`/automate-test\`'s healing trigger**, ask: **Continue, or stop here?** ${INTERACTIVE_CHOICE_NOTE} Stop on anything but an explicit yes; nothing has run yet at this point. When triggered by that healing step, skip the confirmation alone - never the sentence itself.
1. **Failure Artifact Ingestion:**
   - Ingest execution failure artifacts (${isCypress ? 'screenshots, video, console logs' : '\`trace.zip\`, screenshots, video, console logs'}).
2. **4-Point Trace Triage (Fail-Fast Real Bug Detection):**
   - Check Network Waterfall (HTTP 4xx/5xx) and Console Errors first. If a server crash or unhandled runtime exception occurred, classify as **REAL PRODUCT BUG**; do NOT alter Page Objects.
   - Action Timeline, DOM Snapshots & Visual Diff: Determine if target was obscured, animated, or detached. Perform **Visual Diff & Screenshot Overlay** comparing pre-failure and post-failure frames to distinguish **Semantic Text/Icon Shift** from a broken UI render and calculate **Visual Confidence**${isCypress ? ' using screenshots and video recordings' : ' in \`trace.zip\`'}.
   - Locator State: Inspect element counts, visibility, and attachment.
3. **Classification & Targeted Fix:**
   - Selector drift -> update locator in CPOM component adhering to 3-Tier Locator Priority.
   - Timing / race condition -> add auto-retrying web-first assertion or state wait.
   - Test data collision -> switch to dynamic TDM via \`apiClient.createUniqueId()\` / \`createTestEmail()\`.
4. **Attempt 1 Fix & Isolated Execution:**
   - Apply targeted fix and execute ONLY the isolated failing test spec (e.g. \`${sc.testIsolatedCmd(sc.specPath('XXX', 'spec'))}\`).
   - If Page Objects were modified, re-verify them against the live DOM to ensure neighbor components remain healthy.
5. **Attempt 2 Refined Fix:**
   - If still failing, analyze secondary ${isCypress ? 'screenshots and logs' : 'trace'} and apply refined fix.
6. **Rollback & Escalation (Two-Strike Rule):**
   - If still failing after 2 attempts, immediately roll back all modified files: \`git checkout -- <modified_files>\`.
   - Report root cause under taxonomy: \`[FLAKY / TIMING]\`, \`[SELECTOR DRIFT]\`, or \`[PRODUCT BUG]\` with ${isCypress ? 'screenshot and log' : 'trace'} evidence.
`,
    },
    {
      name: 'bulk-rescan',
      description: 'Batch updates Page Object locators across the project when UI design changes.',
      content: `# Skill: Bulk Rescan (/bulk-rescan)

## Purpose
Performs page-level locator updates when application design system or layout changes, healing multiple dependent tests in one step.

## Workflow
0. **Explain and confirm:** state in one plain sentence what this does - "This finds every test currently broken by a UI/design change, then rewrites the affected Page Objects' locators to match the new markup and re-verifies each one against the live app." - then ask: **Continue, or stop here?** ${INTERACTIVE_CHOICE_NOTE} Stop on anything but an explicit yes; nothing has run yet at this point.
1. **Impacted Target Identification:**
   - Run the existing test suite (\`${sc.testRunCmd}\`) to identify broken components, and map each failing test back to its route.
1b. **Blast-Radius Confirmation (before touching any file):** report the actual scope Step 1 just found - the affected route count and their paths. If zero components are broken, say so plainly and stop here; there is nothing to rescan. Otherwise ask, naming the actual count: **"Update locators across these N routes now?"** ${INTERACTIVE_CHOICE_NOTE} A "no," or a request to narrow the list to specific routes, ends this run here (or restarts Step 1 scoped to the named subset) - never proceed against the full list Step 1 found without this explicit go-ahead.
2. **Parallel Worker Swarm (Fan-Out / Fan-In):**
   - Run \`node scripts/orchestrate-swarm.mjs --phase=plan --routes=<comma-separated affected route paths from Step 1>\` and dispatch parallel 'pom-engineer' worker subagents (Worker Swarm) per its Level 2 worker list for high-speed concurrent rescanning - scoping via \`--routes\` keeps this to exactly the affected, non-overlapping routes rather than the whole site.
3. **Component Locator Update:**
   - Update component locators and selectors inside Page Object classes adhering to 3-Tier Locator Priority.
   - Preserve existing public Page Object method signatures to avoid breaking test spec contracts.
4. **Component Liveness Verification & Healing:**
   - Re-verify each updated Page Object against the live DOM to guarantee 100% component liveness.
   - If any component fails verification, apply targeted locator fix under the Two-Strike Rule until Green.
5. **Business Suite Regression Confirmation:**
   - Re-run dependent business test suites (\`${sc.testRunCmd}\`) to confirm all tests pass green without modifying any test spec files.
`,
    },
    {
      name: 'map-site',
      description:
        'Crawls application routes, builds site topology map, and identifies shared reusable widgets. Two modes: create (fresh crawl) and update (incremental, content-hash-gated). Also automatically performs read-only business-intent/criticality inference (gated by mechanical validation and human sign-off) as part of every pass, and supports one further optional, explicit-request-only step: Page Object generation for mapped routes.',
      arguments: ['mode'],
      argumentHint: '[create|update]',
      disableModelInvocation: true,
      content: `# Skill: Map Site (/map-site create, /map-site update)

## Purpose
Crawls the application page graph with authenticated session, builds the complete route topology in \`artifacts/site-map/site-map.json\`, and detects recurring UI components for shared widget deduplication. Two modes, chosen by the argument this skill was invoked with:
- \`create\` (default if no argument given): full fresh crawl of every route. **If \`artifacts/site-map/site-map.json\` already exists, this discards it entirely** - every route's \`routeId\` identity resets too (only \`update\` preserves \`routeId\` - see Mode Resolution below and Step 3b), so anything keyed by \`routeId\` in a downstream artifact (e.g. \`artifacts/analysis/business-intent.json\`) becomes orphaned.
- \`update\`: incremental pass over already-known routes plus discovery of new ones - see Step 3b. **If \`artifacts/site-map/site-map.json\` does not exist yet, there is nothing to update against** - see Mode Resolution below.

Playwright browser access for this crawl comes from this project's MCP configuration (\`.mcp.json\`, \`.agents/mcp_config.json\`, \`.codex/config.toml\`, \`.devin/mcp_config.json\`, or \`.vscode/mcp.json\`, whichever your assistant reads).

## Mode Resolution
Run \`node scripts/map-site-status.mjs <create|update>\` (the argument this skill was invoked with, \`create\` if none given) before doing anything else. Its \`resolvedMode\` is the mode to actually run - never re-derive it yourself by separately checking whether the file exists. When its \`noticeMessage\` is non-null, print it to the user verbatim, exactly as the script wrote it, before proceeding - never paraphrase or shorten it, the routeId-reset warning in particular is a real, load-bearing consequence a shortened version could silently drop.

## Reporting to the User
Every mechanical gate in this skill (\`validate-site-map.mjs\`, \`validate-business-intent.mjs\`, the coverage cross-check) is implementation detail, not user-facing signal - it exists so a malformed artifact never reaches a human or a downstream skill, not to be narrated. When summarizing what this run did, describe outcomes in plain terms a non-technical reader would understand ("site crawled - 28 routes found", "business-intent analysis complete, ready for your review") - never name an internal script file or report that something "passed validation" as if that fact means something to the person reading it. If a gate actually fails, that's a real problem to surface and fix per its own step below - this rule is about routine success, not about hiding real failures.

## Workflow
0. **Self-Introduction (every run, standalone or in-chain) and Entry Check:** state in one plain sentence what this does - "Crawls your live app, builds a visual sitemap, and figures out what each page is for, for you to review." - before anything else runs. Print this sentence every time, including when invoked as part of \`/ground-zero-setup\`'s own chain: a caller's pre-flight describes the pipeline as a whole and never this stage's own specifics, so skipping it in-chain leaves a first-time user facing this skill's first question with no idea what is about to happen. Then, **only when invoked directly rather than as part of \`/ground-zero-setup\`'s chain**, ask: **Continue, or stop here?** ${INTERACTIVE_CHOICE_NOTE} Stop on anything but an explicit yes; nothing has run yet at this point. In-chain, skip that confirmation alone - the chain's own per-stage gate already covers it - never the sentence itself.
1. **Authenticated Session Loading:**
   - ${isCypress ? 'Load authenticated session via cy.session() or developer cookies.' : 'Load authenticated storage state from \`.auth/user.json\` (or fallback to \`auth.json\`).'}
   - If not authenticated, prompt engineer to execute \`/auth-setup\`.
1a. **Role Coverage (only when more than one role session actually exists):** run \`node scripts/auth-status.mjs\` and look at the session files it reports. With zero or one session, there is nothing to ask - crawl with what exists and skip the rest of this step, leaving \`crawledAsRoles\` and every route's \`access\` field out of the site map entirely. With two or more, ask once: **"You have sessions for <names>. Crawl as which of them?"** ${INTERACTIVE_CHOICE_NOTE} Offer: **(Recommended) All of them** - the only option that can show where roles actually differ; **Just one** - then which; **A subset** - then which ones.
   - Crawling as N roles means N passes over the route graph, so say plainly that it costs roughly N times a single-role crawl before the human picks, rather than after.
   - What this buys, stated plainly if asked: a route one role can open and another cannot is the only hard evidence of a permission boundary in the whole pipeline, and \`/define-test-conditions\` turns exactly that into \`permission_denied\` conditions. Without it, every role is assumed to see the same application.
1b. **Crawl Action Boundary (asked once, before any exploration starts):** a wrong guess here either wastes the run on excessive caution or performs an action the human didn't want on their live app - cheaper to ask one simple question up front than to infer it. Ask: **"What is the crawler allowed to do while exploring this app?"** ${INTERACTIVE_CHOICE_NOTE}
   - **Read-only, no interactions at all** - navigate and read only, never click/check/select/fill anything.
   - **(Recommended) Read + safe interactions** - also toggle non-destructive, reversible UI state while exploring: checkboxes, selects/dropdowns, accordions/tabs, expand/collapse - never anything that creates, submits, deletes, or sends.
   - **Full freedom within the app** - any in-app action is fair game during exploration (still never anything that leaves the app's own domain or hits a real external service).
   - **Full freedom except specific areas** - same as above, but ask the human to name which routes/features are off-limits (e.g. "the contact form", "billing").
   If the human named exceptions, echo them back as a short formatted list ("Off-limits during this crawl: <item>, <item>, ...") and get one explicit confirmation before crawling starts - do not silently proceed on a guessed interpretation of a free-text answer.
   **Record the answer** in \`artifacts/analysis/app-profile.json\`'s \`crawlBoundary\` (per \`.scaffold/schemas/app-profile.types.ts\`, \`source: 'human'\`, with any named exceptions in \`offLimits\`). That file is this project's record of facts nothing else stores; a boundary the human set once should not have to be asked again on the next pass, and a later stage deciding how far it may probe needs to know it was told "read-only" here. Create the file if it does not exist yet, and run \`node scripts/app-profile.mjs --validate\` after writing.
   **Enforcement, every route, every element, before any action**: classify what's actually on the page/element first (is it a form field, a checkbox, a submit-shaped button, part of a named off-limits area) and check that classification against this run's boundary BEFORE acting - never act first and check after. A denylisted area is skipped entirely (read its static markup only, exactly like Read-only mode); this boundary is at least as strict as, never looser than, whatever \`/define-test-conditions\`' own fixed read-only-probe policy separately allows later - if this run's answer was Read-only, no downstream stage gets a wider allowance than that for this same site.
2. **Concurrent Route Exploration & Pagination Normalization (Worker Pool):**
   - Execute parallel crawling with worker pool (\`concurrency = 4..6\`) and canonical URL normalization.
   - Automatically strip volatile pagination and cursor query parameters (\`page\`, \`offset\`, \`cursor\`, \`limit\`, \`per_page\`, and \`input\`/\`batch\` on RPC-style calls) to collapse dynamic feeds into single canonical routes and eliminate crawler loop traps.
   - Canonicalize dynamic path segments the same way: a numeric ID, UUID, or per-record slug collapses into a path template (\`/users/42\` and \`/users/43\` both become \`/users/{id}\`) instead of producing one route per record.
   - Discover internal application links within base domain origin. **Track how each link was actually found, per link, not per route**: \`nav-reachable\` when the anchor is visible and interactable (\`locator.isVisible()\`) on a page you've actually rendered - part of what a real user could click through; \`href-scan-only\` when the only evidence is a raw \`href\` attribute with no visible/clickable counterpart on any page you visited (hidden via \`display: none\`, zero-size, or never rendered at all). A route reached by at least one \`nav-reachable\` link gets \`discoveryMethod: "navigation"\`; a route reached ONLY by \`href-scan-only\` links gets \`discoveryMethod: "href-scan-only"\` - record this on the route entry in Step 3a/3b, it feeds the Generic Error-Shell Detection check below.
   - **Observe same-origin API traffic while you're already there - never make a separate pass for it.** While navigating and exploring each route, watch for XHR/fetch network calls to the same origin (\`page.on('request')\`/\`page.on('response')\` or your MCP tool's equivalent). For each genuinely distinct operation not already recorded, write one entry to \`artifacts/site-map/api-contracts.json\` (per \`.scaffold/schemas/api-contracts.types.ts\`): the method, the canonicalized path template (same numeric-ID/UUID/slug collapsing rule as route paths, **query string stripped entirely**), which \`routeId\` it was observed from, the actual response status, and the response body's SHAPE (field -> type hint, e.g. \`"id": "string (uuid)"\` - never a concrete instance value) when the response is JSON.
   - **Work out which of four shapes the call is, and record it in \`operation\`.** "One entry per distinct \`(method, path)\`" is only correct for REST. Under GraphQL the whole API is served from one path by specification, so a path-keyed entry would record the first call observed and silently discard every other call the application ever makes.
     - **\`rest\`** (also OData, JSON:API): the path names the resource. This is the default; leave \`operation\` out entirely.
     - **\`graphql\`**: a POST whose body carries \`query\`/\`operationName\`/\`variables\`, or a content type of \`application/graphql-response+json\`. Record \`operation.name\` as the **root field** of the document (\`createOrder\` in \`mutation { createOrder(...) { ... } }\`) - not the operation's label, which is free-form - and \`operation.documentType\` as \`query\`, \`mutation\` or \`subscription\`, read from the document text rather than guessed from the field name. Take \`responseShape\` from **inside** \`data.<root field>\`, never from the \`{ data, errors }\` envelope: the envelope is the same on every call and describes nothing about the entity.
     - **\`rpc\`**: the path names a procedure. Two forms, both unambiguous - \`/package.Service/Method\` (gRPC-Web, Connect) and \`/api/trpc/entity.procedure\` (tRPC). Record \`operation.name\` as that procedure name. A tRPC batch names several procedures comma-separated in one path; record the name exactly as it appears, commas and all, and the next stage splits it. JSON-RPC belongs here too, with \`operation.name\` taken from the body's \`method\` field.
     - **\`opaque\`**: something was observed and nothing about it could be read. Record it with a \`reason\` in one plain sentence. Real cases you will meet: a Next.js Server Action (POST to the page's own URL, identified only by an encrypted \`Next-Action\` header that changes every build), a Remix or React Router action and a classic form POST (no operation name exists at all), and a gRPC-Web call with a binary protobuf body (the path reads, the payload does not - record the path and the \`rpc\` style, and mark only the shape as unreadable by omitting \`responseShape\`).
   - **When you cannot tell, record \`opaque\` - never the closest-looking guess.** An entry invented from whatever the last path segment happened to be produces an entity that does not exist, a lifecycle that was never observed, and test conditions for behaviour nobody implemented. A reviewer then has to recognise all of it as false and delete it, which costs more than the missing entry would have. \`node scripts/validate-api-contracts.mjs\` reports the opaque count back to you; state it to the human as a plain limit of what is visible from a browser, not as a defect to go and fix.
   - **A tRPC call puts its whole input in an \`input\` query parameter.** Strip it, along with \`batch\`, exactly as you strip \`page\`/\`offset\`/\`cursor\`. Left in place it carries real field values - names, emails, ids - into an artifact that later stages read as evidence, and the payload redaction guard never looks at paths.
   - **Record what you found in \`app-profile.json\`'s \`apiStyle\`** (per \`.scaffold/schemas/app-profile.types.ts\`) once the pass is done: the single style if every readable call agreed, \`mixed\` if genuinely more than one, \`none-observable\` if every observed call came out opaque. Use \`source: 'observed'\`, and read the field first - a human who already answered this is not asked again. **Ask only in the one case the crawl cannot answer**: nothing readable was observed at all. Then ask once - **"I could not read this application's API traffic. Does it use REST, GraphQL, RPC, a mix, or does the server interaction not go through a readable API at all (server actions, form posts, a LiveView/Blazor-style WebSocket)?"** ${INTERACTIVE_CHOICE_NOTE} - and record the answer with \`source: 'human'\`. Never write a style you did not observe and nobody stated. Redact \`sampleRequestPayload\` before writing it: mask any digit-shaped session/PII value (6+ digit run, 8+-char majority-digit token) the same way every other evidence field in this pipeline already is, AND unconditionally redact any \`password\`/\`email\`/\`username\`/\`token\`/\`secret\`-named field's value regardless of what it looks like - a profile-update or account call can carry one of these even outside the login flow itself. \`node scripts/validate-api-contracts.mjs\`'s own redaction backstop mechanically re-checks both classes before you finish, but do it yourself first rather than relying on the backstop to catch what you missed. **This is what makes later API-level test generation contract-grounded instead of guessed** - \`/design-test-cases\`/\`/automate-test\` only draft real request/response detail for an interaction with a matching entry here; an interaction with none gets no invented endpoint. Do not go out of your way to trigger extra API calls beyond what Step 2's own exploration already causes - this is passive observation of traffic that happens anyway, not a reason to click more than the crawl already would.
   - **HTTP status is the primary, direct phantom-route signal - check it before any content heuristic, never only after the fact.** Capture the navigation response's status (\`const res = await page.goto(url); ...res.status()\`) for every route the FIRST time it's visited this pass and **record it as \`httpStatus\` on the route entry** (the schema has a field for it; \`node scripts/validate-site-map.mjs\` requires it as the evidence behind any phantom flag on a nav-reachable route, so a run that never records it cannot flag anything). What each status means is not interchangeable:
     - **404 / 410 - the server says the page does not exist.** Set \`visualTriage.state: "error_page"\` and add \`likely-phantom-route\` to \`flags\`. This one status is sufficient evidence on its own, whatever the \`discoveryMethod\` and whatever any other route's \`contentHash\` says - it needs no corroboration from a second matching route the way the content-hash heuristic below does.
     - **401 / 403 - the route exists and is protected.** This is the opposite of a phantom route: something real is behind it. Set \`visualTriage.state: "auth_wall"\` (401) or \`"access_denied"\` (403) and never add \`likely-phantom-route\`. Live-observed failure this exists to prevent: \`/basic_auth\`, \`/digest_auth\`, and \`/download_secure\` - all real, all reachable, all returning an auth challenge - were reported to the human as "possibly not real routes."
     - **Any other 4xx/5xx - the route is real but currently broken.** Set \`visualTriage.state: "error_page"\` without \`likely-phantom-route\`, and mention it in the run summary: a route that exists and is erroring is a finding worth a human's attention, not something to quietly drop from the map.
     Never let a route's empty \`<title>\`, generic fallback content, or "Not Found" body text get treated as this route's real \`title\`/evidence source when its status was >= 400 - a live-observed failure mode was a crawler reading a 404 page's own literal body text ("Not Found") as if it were legitimate page content and feeding it downstream as a real business-intent signal.
   - Extract page routes, titles, and major structural DOM regions (\`header\`, \`nav\`, \`aside\`, \`main\`, \`footer\`, \`table\`, \`dialog\`).
   - **When Step 1a selected more than one role, do one full pass per role, sequentially, and record what each role got.** Use that role's own saved session for its pass. The union of every pass is the route set; a route only one role ever reached is still a real route. Per route, per role, record \`access[<role>]\` with \`reachable\`, an \`outcome\` derived from what actually happened (\`ok\`, \`redirected_to_login\`, \`forbidden\` for 401/403, \`not_found\` for 404, \`error\` for anything else), and \`observedAt\`. Derive \`outcome\` from the observed status and final URL only - never from what the role's name suggests it should be allowed to do, which is the assumption this whole step exists to replace with evidence. Extract \`title\`/\`regions\`/\`components\`/\`contentHash\` from the pass of whichever role actually reached the route's real content; a route no role reached keeps whatever the last pass saw and its \`access\` map tells the reader why it looks empty.
   - **Always visit the origin root (\`/\`) as well, even when the start URL is a deep link.** A human commonly points the crawl at whatever page they had open - very often \`/login\`, sometimes a deep detail page - and a route graph explored only from there reaches whatever that one page happens to link to, which on a login screen is frequently nothing at all. Add the origin root to the frontier at depth 0 alongside the given start URL, unless the crawl boundary explicitly forbids it.
   - **A thin result is a finding, not a result.** When the whole pass ends with 2 or fewer routes, do not present the site map as complete: say plainly how many routes were found, name the start URL they were found from, and ask whether that URL is really the application's entry point or whether a different one (or a session for a role that can see more) would reach the rest. A live run produced a 1-2 route map from a deep-link start URL and carried it forward into every later stage as if it were the whole application.
   - Bound traversal with a maximum crawl depth of 6 hops from the start URL and a maximum of 500 pages visited, to prevent infinite loops. Limit live exploration scrolls to maximum 2 viewports. These bounds apply per role pass, not once across all of them.
   - If either bound is actually hit before the crawl naturally exhausted every discoverable link, record it - see the \`coverage\` field below. Do not silently return a partial route list as if it were complete.
   - **In-situ Viewport Screenshot Capture (Visual Baseline):**
     Immediately upon arrival at each active route (1280x800 viewport), capture an initial viewport snapshot:
     * Format & Size: \`type: 'jpeg', quality: 75\` (or \`type: 'webp', quality: 75\`), \`scale: 'css'\` (prevents Retina 4x memory explosion), \`caret: 'hide'\`, \`fullPage: false\`. Never capture unbounded full-page screenshots.
     * Security & Context Guard: NEVER inline base64 image strings into prompts, tool calls, context, docstrings, or artifacts. Save only compressed binary files (.jpg/.webp) directly to disk at \`artifacts/site-map/screenshots/<slug>--<routeId>.(webp|jpg|jpeg)\` and reference only the relative filesystem path.
     * Readiness Gate (max aggregate budget: 3000ms): wrap the capture block in an enclosing timeout ceiling (e.g. \`Promise.race([captureBlock(), timeout(3000)])\`). Await \`domcontentloaded\`; pass non-mutating CSS zeroing in the screenshot call (\`style: '*, *::before, *::after { transition: none !important; animation: none !important; }'\`); execute font readiness and loader detachment concurrently via \`Promise.allSettled([page.evaluate(() => Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 1200))])), page.locator('.spinner, [aria-busy="true"], .skeleton, .loading').first().waitFor({ state: 'detached', timeout: 1200 })]).catch(() => {})\`; flush rendering via double \`requestAnimationFrame\`.
     * Safe-Fail Boundary: wrap the entire capture routine in a non-fatal \`try/catch\` with an aggregate 3000ms ceiling. If capture fails or times out, log a warning and proceed without \`screenshot\` or \`visualTriage\` fields for that route вЂ” never fail or abort the crawl on screenshot failure.
     * Save to: \`artifacts/site-map/screenshots/<slug>--<routeId>.jpg\` (or \`.webp\`), where \`<slug>\` is this route's canonical path lowercased with every run of non-alphanumeric characters collapsed to a single \`-\` and leading/trailing \`-\` trimmed (\`/\` alone becomes \`root\`, \`/users/{id}\` becomes \`users-id\`) - the same slug rule \`scripts/orchestrate-swarm.mjs\` already uses. A bare \`<routeId>.jpg\` name is a directory of UUIDs nobody can match to a page by eye; the slug prefix is for the human, and the \`routeId\` suffix keeps the stable identity that survives a path rename and that \`node scripts/map-site-status.mjs prune-screenshots\` matches on. Never use the slug alone - two routes can slug identically, and a renamed route would orphan its own screenshot.
   - **Selective Visual Triage Gate (Heuristic Trigger):**
     Evaluate lightweight heuristics on the initial page state:
     * Check for suspicious URL/title tokens: \`login\`, \`signin\`, \`auth\`, \`forbidden\`, \`unauthorized\`, \`403\`, \`404\`, \`500\`, \`error\`, \`maintenance\`.
     * Check interactive element density: fewer than 3 interactive elements (\`button\`, \`a[href]\`, \`input\`, \`select\`, \`textarea\`) in \`<main>\` or \`<body>\`.
     * Check modal/overlay presence: high z-index overlay, backdrop, or dialog obscuring >50% of the viewport.
     * If any heuristic triggers, synthesize a \`visualTriage\` object: \`state\` (\`ready\` | \`auth_wall\` | \`access_denied\` | \`error_page\` | \`empty_state\`), optional \`blockingOverlay\` (boolean), optional \`confidence\` (\`high\` | \`medium\` | \`low\`), and optional \`flags\` (array of up to 10 alphanumeric/kebab-case tokens, <=50 chars, e.g. \`['no-interactive-elements', 'suspicious-title-403']\`). If no heuristic triggers, omit \`visualTriage\` or emit \`state: "ready"\`.
3a. **Deterministic Site Topology Synthesis (create mode):**
   - Generate \`artifacts/site-map/site-map.json\` conforming exactly to \`.scaffold/schemas/site-map.schema.json\`: an object with \`schemaVersion\` (2), \`generatedAt\`, \`baseUrl\`, and a \`routes\` object keyed by canonical path template (never an array) вЂ” each entry carrying a \`routeId\` stable across URL restructuring, \`sampleUrls\`, \`title\`, \`regions\`, \`components\`, \`discoveredAt\`, \`lastCheckedAt\` (same value as \`discoveredAt\` on first creation), \`contentHash\` (see below), \`status: "active"\`, and optionally \`screenshot\` and \`visualTriage\` when captured in Step 2. Serialize \`routes\` keys in sorted order so a re-run's diff only shows routes that actually changed.
   - \`routeId\`: generated once, at the moment a route is first discovered (by a \`create\` pass or by \`update\` finding a genuinely new route) - a fresh, globally-unique identifier (e.g. a UUID). Never derive it from the path template and never regenerate it later for the same logical route; see Step 3b for how \`update\` preserves it. Bad: \`routeId: "users-id"\` (derived from the path template \`/users/{id}\` - breaks the moment that route is renamed to \`/customers/{id}\`). Good: \`routeId: "3f9a2b7e-4c1d-4e8a-9f2b-1a7c6d5e4f3a"\` (a fresh UUID, independent of the path entirely).
   - Write \`discoveryMethod\` (\`"navigation"\` | \`"href-scan-only"\`) per Step 2's tracking onto every route entry.
   - When Step 1a ran more than one role, write the file-level \`crawledAsRoles\` (the role names actually crawled, not the ones that merely have sessions) and each route's own \`access\` map from Step 2's observations. Omit both entirely on a single-session crawl: their absence means no role distinction was observed, which is different from - and must never be written as - every role having identical access.
   - **Generic Error-Shell Detection (cross-route, mechanical, zero model involvement):** once every route in this pass has a \`contentHash\`, group routes carrying \`empty_state\` or \`no-interactive-elements\` in \`visualTriage.flags\` (from Step 2) by identical \`contentHash\`. A hash shared by >= 2 such routes is almost certainly the application's own generic empty/error shell rendered identically regardless of the requested path (a 404/blank fallback), not distinct real content - this needs no literal \`404\`/\`error\` token in the title or URL, since a generic-shell app never puts one there. For every route in that group whose \`discoveryMethod\` is \`"href-scan-only"\`, set \`visualTriage.state: "error_page"\` and add \`likely-phantom-route\` to \`visualTriage.flags\`. **Never apply this downgrade to a \`"navigation"\`-discovered route sharing the same hash** - a real, nav-reachable page can legitimately render sparse content that happens to match another page's structure, and being reachable through actual navigation is independent evidence it is a real route. This restriction is absolute and is not relaxed by the HTTP-status rule in Step 2: that rule's "whatever the discoveryMethod" clause applies only to a route whose OWN recorded \`httpStatus\` was 404/410, never to this hash heuristic. A nav-reachable route with no recorded 404/410 of its own therefore has no path to a phantom flag at all - \`node scripts/validate-site-map.mjs\` fails the file if one gets set anyway, which is exactly the live-observed regression this guards (8 nav-reachable routes flagged off the hash alone, no \`httpStatus\` recorded on a single route in the whole file).
   - If Step 2's crawl hit its own depth or page-count ceiling, set a top-level \`coverage: { "boundedBy": "maxDepth" | "maxPages", "pagesVisited": <n> }\` field so a human can tell the route list may be incomplete. Omit \`coverage\` entirely when the crawl exhausted every discoverable link on its own - its absence means completeness, the same idiom \`lastUpdatedAt\`'s absence already uses for "never updated."
   - If an existing \`artifacts/site-map/site-map.json\` is missing \`schemaVersion\` or does not parse under this schema, treat it as absent and regenerate fresh rather than attempting to migrate it in place. A from-scratch \`create\` pass prunes any \`status: "removed"\` entries from a prior file, and resets \`routeId\` for every route - it starts clean (see Mode Resolution above for the required warning before this happens).
   - \`contentHash\` is a hash (e.g. SHA-256) of the normalized structural signal for the route: \`title\` plus sorted \`regions\` plus sorted \`components\`, joined into one string - NOT raw HTML, which is too noisy (whitespace, analytics scripts, embedded timestamps cause false-positive "changed" signals). Compute it the same way every time; \`update\` mode's cheap-skip logic depends on that consistency.
3b. **Incremental Update Synthesis (update mode) - the reason this is cheaper than \`create\`:**
   - For every route already in \`artifacts/site-map/site-map.json\`: re-fetch just enough of that route's page shell to recompute \`title\`/\`regions\`/\`components\`, then recompute \`contentHash\`. This route's \`routeId\` MUST stay exactly as it already is - \`update\` never reassigns it; that stability across a URL restructure is the entire reason \`routeId\` exists separately from the path template.
     * Hash unchanged -> the route's real structure hasn't changed. Check self-healing: if \`screenshot\` is missing from the route entry OR the referenced file is absent on disk (\`!fs.existsSync(path.resolve(process.cwd(), screenshot))\`), re-capture the screenshot and triage per Step 2, setting \`screenshot\`/\`visualTriage\` accordingly. Otherwise, preserve the existing \`screenshot\` and \`visualTriage\`. Only bump \`lastCheckedAt\`; skip full component re-extraction and shared-widget re-mining for this route entirely.
     * Hash changed -> run the same full extraction \`create\` mode does for this one route (Steps 2-3a's per-route logic, including fresh screenshot and visual triage), and update \`lastCheckedAt\`/\`contentHash\`/\`discoveredAt\`-adjacent fields accordingly.
     * Route no longer resolves (404, vanished from nav) -> set \`status: "removed"\` rather than deleting the entry, so removal history is visible; do not include it in shared-widget mining.
   - Any link discovered during this pass that isn't already a known route -> add as a new entry with \`status: "active"\` and a freshly generated \`routeId\` per Step 3a's rule, same as a fresh \`create\` would.
   - Update the top-level \`coverage\` field the same way Step 3a does (set it if this pass hit a bound, omit it if this pass's crawl was exhaustive), rather than leaving a stale value from a prior run.
   - Set the file-level \`lastUpdatedAt\` to now. Leave \`generatedAt\` untouched - it's the original creation timestamp.
3c. **Mechanical Shape Gate:**
   - Run \`node scripts/validate-site-map.mjs\` immediately after writing \`artifacts/site-map/site-map.json\` (either mode). If it exits non-zero, fix the reported errors before proceeding to Step 4 - never hand off a malformed site map to shared-widget mining, the swarm dispatcher, or \`artifacts/analysis/business-intent.json\`'s Step 6, all of which key off it.
   - Then run \`node scripts/map-site-status.mjs prune-screenshots\` (either mode, every pass, right after the validator passes). Screenshots are stored per \`routeId\`, and a \`create\` pass assigns every route a brand-new \`routeId\`, so each re-crawl leaves the whole previous pass's image files on disk referenced by nothing - live-observed at 1239 files backing a 44-route map. The script deletes only files whose name matches no routeId in the site map you just wrote, and refuses to delete anything at all when that file is missing or unparseable. Mention the result in this step's summary only when it actually removed something ("cleaned up N unused screenshots from earlier crawls"); silence is the normal outcome on a first crawl.
   - If Step 2 recorded any API observations, run \`node scripts/validate-api-contracts.mjs\` too. If it reports \`FAILED\`, fix the reported errors (most commonly an unredacted PII-shaped payload value) before proceeding.
   - That script also returns a \`warnings\` array, which never fails the file. A warning about a missing \`responseShape\` is worth acting on while you are still on the page: re-observe that call and record the body's shape, since the next stage derives entity composition from exactly that nesting and can derive nothing from a contract without it. A warning about how few routes contributed an observed call is a question for the human, not something to fix silently - state the numbers it reported and ask whether this application really has that little API traffic, rather than carrying a near-empty contract file forward as if it were the full picture.
3d. **Coverage Cross-Check (Optional Signal, Read-Only):**
   - Run \`node scripts/check-sitemap-coverage.mjs\`. This looks for the target site's own published \`sitemap.xml\` (via \`robots.txt\`'s \`Sitemap:\` directive, or the conventional \`/sitemap.xml\` path) and compares it against the routes this crawl actually found - most sites don't publish a sitemap.xml at all, so \`status: "SKIPPED"\` is a normal, silent outcome, never an error to fix.
   - If it reports \`status: "CHECKED"\` with a non-empty \`gaps\` array, add one short informational note to this step's summary (not a blocking gate, not part of the Human Sign-Off Gateway below): "Coverage note: the site's sitemap.xml lists <N> route(s) this crawl didn't reach: <canonicalPath list>. Consider /map-site update or a manual look." State plainly that a listed gap can be a false positive for a per-record-slug route the crawl already templated differently (the checker mirrors this skill's numeric-ID/UUID canonicalization, not its slug judgment) - it's a prompt to double-check, not a proven miss.
4. **Shared Widget Mining (Deduplication Engine):**
   - Identify recurring component structures appearing across >= 2 \`active\` routes (exclude \`removed\` routes from this analysis).
   - Synthesize reusable widgets in \`${sc.widgetPath('<name>')}\`.
   - Update Page Objects to compose shared widgets via \`this.child(WidgetClass, spec)\` rather than duplicating code.
   - ${sc.language === 'typescript' ? 'Run `node scripts/orchestrate-swarm.mjs --phase=reindex` so `components/widgets/index.ts` picks up any newly-added widgets deterministically, without write collisions from parallel workers.' : 'Ensure any newly added widgets in components/widgets/ are registered and exported per project conventions.'}
5. **Orchestrated Fan-Out to POM Engineers (Optional on User Request):**
   - If the user explicitly requested generating Page Objects for the mapped routes:
     * ${sc.language === 'typescript' ? "Run `node scripts/orchestrate-swarm.mjs --phase=plan` (this file's own `artifacts/site-map/site-map.json` output feeds it directly) and dispatch parallel 'pom-engineer' worker subagents per its Level 2 worker list (1 route per worker) - do not enumerate routes/workers yourself." : "Dispatch parallel 'pom-engineer' worker subagents (1 route per worker) to synthesize Page Objects for each mapped route."}
     * Ensure each 'pom-engineer' synthesizes 1:1 Page Objects in \`${sc.language === 'java' ? 'src/main/java/components/pages/' : 'components/pages/'}\` AND verifies each one against the live DOM.
     * ${sc.language === 'typescript' ? 'Execute a global barrier synchronization via `node scripts/orchestrate-swarm.mjs --phase=verify --targets=<comma-separated Page Object paths each worker produced>` - confirm 100% Green component liveness across all workers before completing.' : 'Confirm 100% Green component liveness across all workers before completing.'}
6. **Business-Intent & Criticality Analysis (Automatic, Strictly Read-Only):**
   - Runs automatically for every active route, as part of both \`create\` and \`update\`, immediately after Step 4 - no separate request needed, unless the user explicitly asked to skip it (e.g. "just map the site, skip business-intent"):
     * Run \`node scripts/orchestrate-swarm.mjs --phase=plan\` (add \`--routes=<a,b,c>\` to scope to a subset) and dispatch one read-only analysis worker per \`active\` route from its Level 2 worker list - do not enumerate routes/workers yourself.
     * **Strictly read-only. Allowlist, not denylist**: each worker may ONLY use non-mutating read operations against the target route - text/attribute reads (\`.textContent()\`, \`.getAttribute()\`, accessibility-tree snapshots, \`page.title()\`) after a single navigation (a GET-equivalent read) to the route's \`sampleUrls[0]\`. Never call \`.click()\`, \`.fill()\`, \`.check()\`, \`.selectOption()\`, or any other action method - not even a \`trial: true\` dry-run - and never focus or read the live *value* of a form field (a pre-filled field may hold real session/account data). Infer intent purely from static, non-user-specific signal: page title, heading text, form field LABELS (the label text, never the field's current value), button/link visible text, and ARIA roles/names.
     * **PII/session-data guard on evidence excerpts**: every \`evidence[].excerpt\` MUST be a short (<=100 char) fragment of static label/heading/button text only, never a copied value from page content that could carry the signed-in user's real account data - mask any email, phone number, token, or numeric-ID-shaped text - a run of 6 or more consecutive digits, or an alphanumeric token of 8+ characters where digits are the majority of its characters - as \`[REDACTED]\` before writing an excerpt.
     * For a route whose \`contentHash\` in \`artifacts/site-map/site-map.json\` is unchanged since that route's \`sourceContentHash\` in an existing \`artifacts/analysis/business-intent.json\`, skip re-inference for that route entirely and keep its existing entry - mirrors \`update\` mode's own cheap-skip logic in Step 3b.
     * For every other active route, infer \`businessFeature\` (a label, <=40 characters, e.g. "Checkout", "Account Settings") and \`criticalityTier\` (\`high\`/\`medium\`/\`low\`), each wrapped as a \`Field<T>\` (\`value\`, \`confidence\`, \`source\`, \`reasoning\`, \`evidence\`) per \`.scaffold/schemas/business-intent.types.ts\`.
     * **Criticality checklist (evidence-anchored, not free inference)** - \`criticalityTier\` is the IMPACT axis: **how bad is it if this route is broken and nobody notices.** Decide it by consequence, not by vocabulary. The keyword lists below are fast paths to the answer, never the answer itself; when a keyword and the actual consequence disagree, the consequence wins.
       - **\`high\` - a failure here costs money, data, access, or trust, and cannot be undone by the user.** Ask: could a silent failure on this route take someone's money, expose or destroy data, let the wrong person in or lock the right person out, or block the application's single most important flow entirely? Fast paths: payment/checkout/billing; auth lifecycle (login, password, 2fa/mfa, account deletion); a \`form-labels\` entry naming a password field; the route sits in a \`nav\`/\`header\` region; the path or heading matches a core flow (dashboard, account, profile, orders, create/new/edit-*).
       - **\`medium\` - a failure here blocks or corrupts real work, but the user can see it happened and route around it.** This is a definition, not the leftover bucket - a route belongs here on its own evidence, because it changes state or drives a real task while a failure stays visible and recoverable: search and filtering, sorting, secondary settings, tools and utilities, list/detail views, anything that submits a non-destructive form. If you find yourself putting a route here only because it matched neither of the other two, stop and decide which of the two questions it actually answers.
       - **\`low\` - a failure here is visible and costs nothing but the look of it.** Static or informational content with no state to change and no form to submit: about, terms, privacy, help/FAQ, marketing copy, a page whose whole job is to render text and links correctly.
       - **Mixed routes take the MAXIMUM tier found on them**, never an average or the majority - a low-value settings page carrying one account-deletion button is \`high\`, because that is what breaks worst.
       - **Draft quality matters even though a human reviews this.** Every tier the draft gets wrong is a correction someone has to make by hand, and the point of this stage is to leave a person deciding the genuinely ambiguous cases rather than fixing the obvious ones. Do not spread tiers evenly for the look of a balanced distribution, and do not default a whole crawl to \`medium\` because deciding is work.
       - **Do not reach for a level above \`high\`.** There were four levels once, with payment/auth sitting in their own \`critical\` tier above a generic \`high\`. It was removed because nothing anywhere behaved differently for it - the deterministic consumer gates on "not medium and not low", and both tiers drew the same condition volume - so the distinction cost real inference effort and review attention and bought nothing. Three levels is also the scale risk-based testing conventionally uses for this axis.
     * **Confidence is computed from evidence signal strength, never chosen freely**: \`confidence\` is \`high\` when any evidence entry's \`signal\` is \`heading-text\`, \`aria-roles\`, or \`manual\`; \`medium\` when the strongest signal present is \`form-labels\` or \`button-link-text\`; \`low\` when only \`route-path\` evidence exists. \`scripts/validate-business-intent.mjs\` mechanically checks this - do not guess a value the evidence doesn't support.
     * **A \`reasoning\` string may never be reused verbatim across routes.** Before writing one, check whether the exact same sentence already explains a different route this pass; if it does, it is not an explanation of THIS route, it is a category label wearing one - and the tier it justifies is therefore unaudited. Live-observed: six different routes carried the identical "Manages identity verification and credential lifecycle, representing a critical security and access gateway for the application", which tells a human nothing about any of the six. Name what is actually on this route instead. This is the same rule the evidence-excerpt guard below already applies to \`evidence[].excerpt\`, extended to the field a human actually reads at sign-off.
     * **\`criticalityTier.reasoning\` must read like an explanation for a human, not a mechanism trace**: one plain-language sentence naming the concrete functionality or content actually found on the route, and why that matters for this kind of application (e.g. "This route lets a user permanently delete their account, which the system treats as critical because an irreversible destructive action needs the highest test priority.") - never reference the checklist or confidence rule by name ("matches medium checklist", "per the criticality rubric", "matches critical checklist criteria") and never restate the evidence excerpt verbatim; the validator rejects a \`reasoning\` that exactly equals its own evidence excerpt. \`businessFeature.reasoning\` follows the same non-empty, not-a-restatement rule but can be terser - the label is usually self-evident from its own evidence.
     * Every inference MUST carry at least one \`evidence\` entry naming the literal signal and text excerpt it came from; never emit a value with no evidence.
     * **Never reuse the same generic, whole-site text as evidence across multiple routes.** A live-observed failure mode: an app-wide, identical \`<title>\` (e.g. every route sharing one static \`<title>The App</title>\`) got copied as \`evidence[].excerpt\` on route after route, producing a wall of routes with the literal same "evidence" and the same templated \`reasoning\` - that is not evidence for THIS route, it is evidence for the whole site and proves nothing route-specific. Before writing an excerpt, check whether the exact same \`(signal, excerpt)\` pair already appears as evidence on a different route processed this same pass; if so, it is disqualified as evidence here too - find this route's own distinguishing signal instead (its own heading, its own form labels, its own nav position) or, if genuinely none exists beyond the shared site-wide title, that itself is real signal the route is likely low-value/generic - reflect that honestly in a lower \`criticalityTier\` and a \`confidence\` no higher than what \`route-path\`-only evidence supports, rather than dressing it up with a borrowed site-wide quote.
     * Write the result to \`artifacts/analysis/business-intent.json\` conforming to \`BusinessIntentReport\` (\`schemaVersion: 1\`, keyed by \`routeId\`), with every new/changed entry's \`reviewed\` set to \`false\`.
     * **Self-verification pass (before Core-Purpose Inference, zero new tooling)**: for every entry just drafted or changed, re-check its \`criticalityTier.value\` against the checklist above - does the cited evidence actually match the claimed bucket's criteria? If not, downgrade it to the tier the evidence genuinely supports before writing the file. This is a checklist-conformance check, not a substitute for the Human Sign-Off Gateway below, which stays mandatory and unchanged - it exists to catch the most obvious rubric mismatches before a human has to.
     * **Core-Purpose Inference (app-level, once per crawl, after every route has been drafted above)**: synthesize one plausible one-sentence description of the application's primary purpose per genuinely distinct interpretation the evidence actually supports, weighing the whole crawl rather than any single page - never invent a candidate with no evidence entry behind it.
       - **"Home route" means the canonical \`/\` route in \`artifacts/site-map/site-map.json\`, and nothing else.** It does NOT mean whichever URL this crawl happened to start from: a human commonly points the crawl at a deep link (\`/login\` is the usual one, since it may be the only page reachable without a session), and treating that as the home page infers the purpose of the whole application from its sign-in form. Live-observed doing exactly that - a crawl started at \`/login\` proposed "secure user authentication and protected session access management" as the purpose of a site whose 40+ other routes were a testing-practice sandbox. When \`/\` is genuinely absent from the site map, say so and weigh every route equally instead of promoting a substitute.
       - **Weigh the corpus, not one page**: the strongest signal is what the route set as a whole is for - recurring themes across route paths, headings, and nav labels, and what the largest group of routes has in common. A single route's heading only outweighs that when it is genuinely the application's own index page.
       - **Use the captured screenshots as a second, optional channel before settling on candidates**: read \`artifacts/site-map/screenshots/<routeId>.(jpg|webp)\` for the home route and for a spread of the most-linked routes, and check whether what is visibly rendered matches what the DOM-derived headings and labels suggested. Screenshots confirm or refute; they never invent a candidate on their own. When a screenshot genuinely contradicts the DOM reading, say which one you went with and why in the candidate's \`reasoning\` rather than quietly averaging the two. **Distinctness test, applied before writing any candidate down**: two candidates are the same interpretation, not two, if choosing between them would never change a route's criticality in the Criticality Re-Derivation step below - reword one as a test ("does this route directly deliver X?") and check whether the other candidate would ever answer that question differently for any route on the site; if not, they are one interpretation, not two, no matter how differently worded. If the evidence only genuinely supports one interpretation, write exactly one candidate - a single well-evidenced candidate is a stronger result than padding the count with reworded restatements of the same reading, and the human can still describe it differently in their own words at confirmation time regardless. Only write 2-4 candidates when the evidence is actually ambiguous between distinct interpretations that would answer the distinctness test above differently. Mark the index of the candidate the evidence most strongly supports as \`mostLikelyIndex\` (always \`0\` when there is only one candidate). Write \`corePurpose.candidates\` and \`corePurpose.mostLikelyIndex\` to \`artifacts/analysis/business-intent.json\` per \`.scaffold/schemas/business-intent.types.ts\`'s \`CorePurpose\` shape, \`reviewed: false\`.
     * **Application-Kind Confirmation (asked together with Core-Purpose Confirmation below, one exchange, not two)**: what an application IS FOR and what KIND of thing it is are different facts, and only the second one can tell a practice sandbox apart from the real system it imitates - which decides whether an auth route is a genuine credential surface or an exhibit. Read \`artifacts/analysis/app-profile.json\`'s \`applicationKind\` first (via \`node scripts/app-profile.mjs\`): when a human already answered this, do not ask again. Otherwise ask once, alongside the purpose question: **"Is this the real production application, or a sandbox/demo, an internal tool, or a staging copy?"** ${INTERACTIVE_CHOICE_NOTE} Write the answer to \`applicationKind\` with \`source: 'human'\`. If the human skips it, record nothing rather than guessing - an absent value simply means later stages fall back to reading the confirmed purpose text, which is exactly what they do today.
     * **Core-Purpose Confirmation (a separate, lightweight exchange, before the Human Sign-Off Gateway below)**: present the candidates in conversation with the most-likely one marked as the recommended default, and ask the human to pick one or describe the application's purpose in their own words if none fit well. ${INTERACTIVE_CHOICE_NOTE} Interpret the human's answer into \`corePurpose.selected\` (a \`Field<string>\`): picking an offered candidate carries that candidate's own evidence forward with \`source\` matching its strongest evidence signal; free text gets \`source: 'manual'\` and one \`evidence\` entry quoting the human's own words (still subject to the same <=100 char / PII-guard rule as every other evidence excerpt). Set \`corePurpose.reviewed: true\` and \`reviewedBy: 'human'\`.
     * **Role-Purpose Confirmation (only when \`crawledAsRoles\` is present, straight after Core-Purpose Confirmation)**: for each crawled role, compute its \`exclusiveRoutes\` - the routes it reached that at least one other crawled role did not - and draft a one-sentence \`purpose\` for the role FROM THAT EVIDENCE, never from the role's name (a role called "admin" that turns out to reach nothing others cannot is exactly the finding worth surfacing, and naming it "administrative access" would bury it). Present one short block per role: its name, its purpose draft, and the routes that distinguish it, then ask the human to confirm each or describe the role in their own words. ${INTERACTIVE_CHOICE_NOTE} Write the result into \`business-intent.json\`'s \`roles\` per \`.scaffold/schemas/business-intent.types.ts\`, with \`reviewed: true\`/\`reviewedBy: 'human'\` once confirmed. A role whose \`exclusiveRoutes\` is empty gets that stated plainly in its draft ("reached nothing the other crawled roles could not") rather than an invented distinction.
     * **Criticality Re-Derivation (using the now-confirmed purpose and roles, before the Mechanical Gate)**: re-examine every route's \`criticalityTier\` against two more criteria alongside the checklist above. (a) Does this route's functionality directly deliver \`corePurpose.selected.value\`? If the checklist alone placed a route at \`medium\` or \`low\` and it genuinely delivers the confirmed core purpose, raise it to \`high\` - never automatically to \`critical\`, which stays reserved for its own payment/auth/destructive-action criteria regardless of purpose alignment. (b) Is this route reachable by some roles and not others? A real permission boundary makes the route at least \`high\`, because a broken boundary exposes one role's functionality to another. When either raises a tier, rewrite that entry's \`reasoning\` to say so in plain language (e.g. "Only the admin role reached this route; the customer role was redirected to login, so a broken check here would expose administrative functionality.").
       - **(c) The one case where a confirmed fact LOWERS a tier: a demo/practice application.** The criticality checklist fires on keywords (\`login\`, \`password\`, \`2fa\`, \`secure\`, ...) because on a real application those almost always mark a genuine security surface. Two things can establish that this application is not one, in this order of authority: \`artifacts/analysis/app-profile.json\`'s \`applicationKind\` is \`sandbox-demo\` (a human answered this directly - read it via \`node scripts/app-profile.mjs\`), or, absent that, the confirmed \`corePurpose.selected.value\` explicitly describes the app as a sandbox, practice, demo, playground, training, tutorial, example, or kata application. On such an application those routes are usually exhibits of the pattern rather than a real credential surface - live-observed: a UI-automation practice sandbox got six auth routes at the top tier for "credential lifecycle", all with the identical reasoning, when nothing real was behind any of them. Only when the human's own confirmed answer says so, drop such a route from \`high\` to \`medium\` - never to \`low\`, and only when ALL of these hold: the route reached \`high\` through the auth-lifecycle keyword branch alone; no real user data, payment, or irreversible action is actually behind it; and the route is not the application's own real sign-in (a sandbox still has one real login protecting the rest, and that one stays \`high\`). A payment/checkout/billing keyword match never moves, purpose notwithstanding. When this fires, say so plainly in the \`reasoning\` ("this is a demonstration of an auth pattern in a practice sandbox, not a real credential surface") so the human can overturn it at sign-off - which is the whole point of surfacing it rather than silently keeping either tier.
       - **Nothing else lowers a tier.** Absent an explicitly-confirmed demo/practice application, keyword-driven \`high\` stands: over-testing a route that turned out to be a demo costs some wasted test volume, under-testing a real credential surface costs an incident, and those are not the same mistake.
     * **Contradiction Sweep (mandatory whenever the human corrected or added anything above - a confirmation is not just recorded, it is applied):** a human's answer at Core-Purpose or Role-Purpose Confirmation frequently invalidates inferences drafted BEFORE it, since those were drafted without it. Before the Mechanical Gate, re-read every entry drafted this pass against what the human just confirmed and fix what no longer holds - do not leave a stale inference standing simply because the human's correction arrived later than the entry did. Specifically: a \`businessFeature\` or \`criticalityTier\` \`reasoning\` that argues from a purpose the human replaced is rewritten against the confirmed one; a route whose tier was justified by the old reading is re-scored under the new one; a role purpose the human rewrote propagates to every route whose reasoning cited that role. Report what the sweep actually changed as part of the review artifact's own summary ("your correction to the core purpose re-scored 3 routes"), so the human sees their answer take effect rather than having to trust that it did. When nothing needed changing, say that plainly too - it is a real outcome, not a skipped step.
   - **Mechanical Gate (zero model involvement):** run \`node scripts/validate-business-intent.mjs\` and stop if it reports \`FAILED\` - fix the reported shape errors and re-run before proceeding. Do not present unvalidated output to the human.
   - **Human Sign-Off Gateway:** present the Business-Intent Review Artifact. ${REVIEW_ARTIFACT_RENDER_NOTE('business-intent')} The script owns the artifact's shape entirely - the confirmed-core-purpose recap line, the separate **Possibly not real routes** section for anything flagged \`likely-phantom-route\`, the stable per-route numbering, the bold uppercase criticality line, and the one consolidated \`Evidences:\` line per route - so do not reformat, reorder, or add to what it prints. \`confidence\` is deliberately absent from it: that is an internal, mechanically-checked signal, never shown to the human.
     Around the rendered artifact, state in your own words: this file is NOT authoritative until a human has reviewed it - no other skill or agent should treat an entry with \`reviewed: false\` as ground truth. Then close with a short correction hint naming the route numbers, not full paths: \`You can correct multiple routes at once by tier, e.g. "high: 1, 4, 5-8, 15; critical: 2-3, 9" - list numbers/ranges per tier; anything unlisted keeps its current draft value.\` This is a convenience, not the only way to reply - plain prose ("route 5 should be critical") works too; interpret either. Once the human actually approves an entry (individually, via the shorthand, or by approving the whole artifact as-is) in conversation, set that entry's \`reviewed\` to \`true\` and \`reviewedBy\` to \`'human'\` in \`artifacts/analysis/business-intent.json\` before continuing - never set \`reviewed: true\` without also setting \`reviewedBy\`.
   - **Next step:** run \`node scripts/pipeline-status.mjs\` and follow its \`nextCommand\` - do not hardcode what runs next here, since new pipeline stages can be added later without this skill needing to change.

`,
    },
    {
      name: 'map-features',
      description:
        'Domain Analysis: groups reviewed routes into features, derives the application entities, their operations, their lifecycles and the links between them into artifacts/analysis/feature-map.json, gated by mechanical validation and human sign-off.',
      disableModelInvocation: true,
      content: `# Skill: Domain Analysis (/map-features)

## Purpose
Turns a map of pages into a map of what the application is actually made of. Consumes \`artifacts/analysis/business-intent.json\` (reviewed labels and impact), \`artifacts/site-map/site-map.json\` (route shapes), and \`artifacts/site-map/api-contracts.json\` (traffic observed during the crawl), and writes \`artifacts/analysis/feature-map.json\` per \`.scaffold/schemas/feature-map.types.ts\`.

Why this stage exists: every artifact before it is keyed by route, so the application's navigation is the backbone of the whole test model. That describes how the system is organised rather than what a person does with it, and it cannot express the fact most test design depends on - that a thing created on one screen has to turn up on another. A feature spans routes; an entity has a lifecycle; a link between two entities is a precondition. None of those are expressible one page at a time.

Everything derived here is a hypothesis. A REST resource is not a domain entity, and a path that looks like one proves nothing on its own - which is why the deterministic pass marks anything read off a name or a path shape as \`inferred\`, and why nothing downstream may treat this file as ground truth until the Human Sign-Off Gateway below has run.

This skill reads live markup and writes an analysis artifact - the same risk profile as \`/map-site\` - so it should never run from autonomous model judgment, only an explicit user command. See \`/define-test-conditions\`' own Purpose section for what that guarantee is actually worth per assistant.

## Workflow
0. **Self-Introduction (every run, standalone or in-chain) and Entry Check:** state in one plain sentence what this does - "Groups your reviewed pages into features, works out the things your app deals with and how they connect, for you to review." - before anything else runs. Print this sentence every time, including when invoked as part of \`/ground-zero-setup\`'s own chain: a caller's pre-flight describes the pipeline as a whole and never this stage's own specifics, so skipping it in-chain leaves a first-time user facing this skill's first question with no idea what is about to happen. Then, **only when invoked directly rather than as part of \`/ground-zero-setup\`'s chain**, ask: **Continue, or stop here?** ${INTERACTIVE_CHOICE_NOTE} Stop on anything but an explicit yes; nothing has run yet at this point. In-chain, skip that confirmation alone - the chain's own per-stage gate already covers it - never the sentence itself.
1. **Preconditions:**
   * At least one route in \`artifacts/analysis/business-intent.json\` with \`reviewed: true\`. If none exist, refuse and print exactly: "No reviewed business-intent entries found. Run /map-site Step 6 and complete its Human Sign-Off Gateway before mapping features." Do not proceed.
2. **Deterministic Derivation (zero model involvement):**
   * Run \`node scripts/derive-feature-map.mjs\`. It groups \`(method, pathTemplate)\` pairs into resources and their operations, reads each entity's lifecycle off which operations exist, infers \`references\` links from id-shaped field names and \`contains\` links from nested response bodies, promotes a recurring route shape to an entity, clusters routes into features by their reviewed \`businessFeature\` label, and sets each feature's impact to the worst tier among its own reviewed member routes. A re-run reports \`UNCHANGED\` and leaves the file alone when no input moved.
   * Its \`orphanEntities\` list names anything no mapped route reached - typically a call made outside any page (a login endpoint), or a path that only looked like a resource. Carry it into Step 4's questions rather than dropping it.
   * It also reports \`opaqueContracts\` (calls that said outright they could not be decoded) and \`unclassifiedOperations\` (an operation name whose effect could not be read - an unrecognised mutation verb, most often). Both are the honest ceiling on what this application's API can tell you, and both are worth one plain sentence to the human at sign-off: a thin feature map with five opaque calls behind it is a different situation from a thin one with none, and only the first is explained by the application's own architecture. Never fill either of them in by hand from what the name looks like it probably means.
3. **UI Corroboration (read-only, second source - never a substitute for the first):**
   * The API and the UI must back each other up here rather than being used separately: traffic says what the system does, markup says where a person can do it, and a claim only one of them supports is exactly the claim a human should look at hardest.
   * For each feature's member routes, read (never act on) the forms present and where their \`action\`/submit handler points, and the navigation links between member routes. Same allowlist as \`/map-site\` Step 6: text, labels, attributes, ARIA roles and names, after a single navigation. Never click, submit, fill, or read a field's live value.
   * Where a form's submit target matches an entity's own observed \`create\`/\`update\` contract, add that route to the operation's \`routeIds\` and an \`evidence\` entry with signal \`ui-form\`. Where a member route links to another member route, record it as \`ui-navigation\` evidence on the feature. Never invent an operation the UI merely hints at - a form with no matching contract is a question for Step 4, not a new operation.
   * Apply the same PII guard every other evidence excerpt in this pipeline uses: at most 100 characters, and mask any run of 6+ consecutive digits or any 8+-character majority-digit token as \`[REDACTED]\`.
4. **Questions Only a Person Can Answer (one exchange, not a quiz):**
   * Three things are not derivable from any artifact, and guessing them wrong is expensive: whether two entities are genuinely related or their paths merely looked alike, which cycles the business actually cares about, and what rules govern a transition ("an order cannot be refunded before it is paid"). Ask about these, and nothing else.
   * **Lead with the draft, never with a blank page.** A person often does not know the answer cold, and the draft exists so they correct something rather than author it. Ask in the form "we think an order needs a customer to exist first, because the create call carries \`customerId\` - is that right?", never "what are your entity relationships?".
   * Read \`node scripts/app-profile.mjs\`'s \`domainNotes\` first and never re-ask something a person already answered. Append whatever they say now as a new \`domainNote\` (\`statedDuring: '/map-features'\`), then run \`node scripts/app-profile.mjs --validate\`.
   * A rule a person states about a transition becomes a \`LifecycleTransition\` carrying an \`evidence\` entry whose \`signal\` is \`human\`, quoting their own words. Its \`confidence\` stays \`inferred\` unless traffic actually showed that transition happening: someone telling you a rule is not the same as having seen it hold, and \`observed\` in this file means exactly one thing.
   * Skipping is a normal answer. Proceed either way.
5. **Contradiction Sweep (mandatory whenever the human corrected or added anything in Step 4):** an answer given now frequently invalidates something derived before it. Before the Mechanical Gate, re-read every feature and entity against what was just confirmed and fix what no longer holds: a relation the human rejected is removed rather than left with a caveat, an entity they renamed re-keys (its \`entityId\` is a hash of its name, so a rename is a deliberate re-identification), a feature they split becomes two, and any \`impact\` whose source route changed is recomputed. Report what the sweep actually changed ("your answer about refunds removed 2 links and split Billing into two features"), and say plainly when nothing needed changing - that is a real outcome, not a skipped step.
6. **Mechanical Gate (zero model involvement):**
   * Run \`node scripts/validate-feature-map.mjs\`. If it reports \`FAILED\`, fix the reported errors and re-run before proceeding. Do not present unvalidated output to the human. It checks the things a malformed map would break silently rather than loudly: a link pointing at an entity that does not exist, a feature claiming a route the site map never had, a transition leaving from a state the entity does not have, and an operation claiming it was observed without naming the contract behind it.
7. **Human Sign-Off Gateway:**
   * Present the Feature-Map Review Artifact. ${REVIEW_ARTIFACT_RENDER_NOTE('feature-map')} The script owns the shape entirely - numbered features with their impact and pages, then a separate numbered section for the things the application works with, each with what can happen to it, its lifecycle, and every link a person has to confirm. Do not reformat, reorder, or add to what it prints.
   * Around it, state in your own words: this file is NOT authoritative until reviewed, and the links between entities are the part worth reading carefully, because a wrong one becomes a precondition every test built on it inherits. Say which claims came from real traffic and which from a name alone - the artifact marks this per line, and it is the single most useful thing a reviewer can act on.
   * Close with a short correction hint naming the numbers, not full names: \`Correct several at once, e.g. "drop the link on E1; E2 is really called invoices; features 2 and 3 are one feature" - anything unmentioned keeps its drafted value.\`
   * Once the human approves a feature or an entity (individually, by number, or the whole artifact as-is), set that record's \`reviewed\` to \`true\` and \`reviewedBy\` to \`'human'\` before continuing - never \`reviewed: true\` without \`reviewedBy\`. Every feature and every entity needs approving: the next stage treats a half-reviewed map as unreviewed, because a link nobody confirmed is exactly what it would build preconditions from.
8. **Next step:** run \`node scripts/pipeline-status.mjs\` and follow its \`nextCommand\` - do not hardcode what runs next here, since new pipeline stages can be added later without this skill needing to change.
`,
    },
    {
      name: 'define-test-conditions',
      description:
        'Test Analysis: defines typed test conditions (parameter equivalence partitions, 2-way combinatorial coverage, 3-value boundary conditions) per route from artifacts/analysis/business-intent.json, gated by mechanical validation and human sign-off.',
      disableModelInvocation: true,
      content: `# Skill: Test Analysis (/define-test-conditions)

## Purpose
Second stage of the app-analysis pipeline, run after \`/map-site\`'s automatic business-intent analysis (Step 6) - defines and prioritizes test conditions from the test basis. Consumes \`artifacts/analysis/business-intent.json\` and \`artifacts/site-map/site-map.json\`, defines typed test conditions per route - equivalence-partitioned parameters, 2-way combinatorial coverage, 3-value boundary conditions - into \`artifacts/analysis/test-conditions.json\` per \`.scaffold/schemas/test-conditions.types.ts\`, gated by a mechanical validator and a Human Sign-Off Gateway before any downstream stage may treat it as ground truth. This skill performs live DOM reads (plus a narrow, bounded, always-reset set of non-submitting probes - see Step 2) and writes an analysis artifact - at least the same risk profile as \`/map-site\`, if not slightly more given the probing exception - so it should never run from autonomous model judgment, only an explicit user command. Only Claude Code, Cursor, and Codex have a frontmatter mechanism for this at all (\`disable-model-invocation: true\`, present in this skill's own frontmatter on those three) - and even there treat it as a strong hint, not a guarantee: this exact field has open, live 2026 reliability bugs on more than one of them (ignored in some configurations, or requiring extra assistant-specific config this project doesn't generate). Devin Desktop, Copilot, and Antigravity have no such mechanism whatsoever - every skill there can be triggered by the model's own judgment based on its description alone, with no way to distinguish that from an explicit user ask. On every assistant, honoring "explicit command only" here is the model's own responsibility, not something the tooling reliably enforces.

## Workflow
0. **Self-Introduction (every run, standalone or in-chain) and Entry Check:** state in one plain sentence what this does - "Reads your reviewed site map and infers test conditions - positive and negative scenarios - for each page, for you to review." - before anything else runs. Print this sentence every time, including when invoked as part of \`/ground-zero-setup\`'s own chain: a caller's pre-flight describes the pipeline as a whole and never this stage's own specifics, so skipping it in-chain leaves a first-time user facing this skill's first question with no idea what is about to happen. Then, **only when invoked directly rather than as part of \`/ground-zero-setup\`'s chain**, ask: **Continue, or stop here?** ${INTERACTIVE_CHOICE_NOTE} Stop on anything but an explicit yes; nothing has run yet at this point. In-chain, skip that confirmation alone - the chain's own per-stage gate already covers it - never the sentence itself.
1. **Preconditions:**
   * Default scope: every route in \`artifacts/analysis/business-intent.json\` with \`reviewed: true\`. If none exist, refuse and print exactly: "No reviewed business-intent entries found. Run /map-site Step 6 and complete its Human Sign-Off Gateway before defining test conditions." Do not proceed.
1b. **Domain Knowledge Check (one optional question, easy to skip):** ask once, before drafting anything: **"Any business rules, past incidents, or edge cases you already know about that this app's test conditions should specifically cover? (optional - skip if nothing comes to mind)"** ${INTERACTIVE_CHOICE_NOTE} Before asking, read \`node scripts/app-profile.mjs\`'s \`domainNotes\`: when a person already told this project something, lead with it ("you mentioned refunds run as a nightly batch - anything else?") rather than asking from scratch, and never re-ask for something already recorded. Whatever the human says now gets appended there as a new \`domainNote\` (\`statedDuring: '/define-test-conditions'\`) before Step 2 runs, then \`node scripts/app-profile.mjs --validate\`. A skip or "no" is a completely normal answer - proceed to Step 2 either way, and record nothing. This is the one stage in the whole pipeline where a real functional/business-logic defect gets caught before code exists (see Step 2's own architectural-invariant investigation below) - a UI crawl alone cannot infer something like "refunds are processed by a nightly batch job," so a domain expert naming it here directly feeds Step 2's investigation instead of being missed entirely. It is also the input most expensive to lose: it exists only because a person happened to say it, so it is written down rather than left to survive as whatever conditions it happened to produce this run. Anything the human names becomes an additional architectural-invariant condition in Step 2, folded into that same investigation rather than a separate bolt-on list, cited with an \`evidence\` entry whose \`signal\` is \`'manual'\` quoting the human's own words.
1c. **Test-Type Scope (stated, not assumed):** read \`testTypes\` from \`node scripts/app-profile.mjs\`. Absent means the default - **functional only** - which is what this stage generates today: equivalence partitions, boundary values, combinatorial vectors, and architectural invariants are all functional-behaviour conditions. Say which types are in scope in one line before drafting, so "nothing here checks accessibility or performance" is a visible decision rather than something a reader discovers months later and mistakes for an oversight. Only generate conditions for a type whose entry has \`inScope: true\`; a type nobody has enabled contributes nothing and costs nothing.
   - **Adding a type later is one entry, not a pipeline change.** A new test type needs exactly two things: an id in \`testTypes\`, and a rule stating what it contributes here - what it inspects on a route and what condition it produces. Nothing in this stage or downstream branches on a closed list of type names, so a type can be introduced or switched off without touching the stages themselves. Keep it that way: never hardcode a type id into a condition-generation step.
2. **Parameter & Partition Extraction (Read-Only, With One Narrow Reveal Exception):**
   * Compute the target route set: Step 1's default, or the routes named by an explicit \`--routes=<a,b,c>\` argument intersected with \`reviewed:true\` entries.
   * Run \`node scripts/orchestrate-swarm.mjs --phase=plan --routes=<the computed comma-separated routeId list>\` and dispatch one read-only worker per route from its Level 2 worker list - do not enumerate routes/workers yourself. The dispatcher itself has no knowledge of \`business-intent.json\`'s \`reviewed\` flag; this skill computes the reviewed-route subset itself before invoking it.
   * **Allowlist, not denylist, one narrow exception to \`/map-site\` Step 6's posture.** Read-only for attribute/text inspection stays identical to \`/map-site\` Step 6: element tag name, the \`type\` attribute, associated \`<label>\` text, HTML5 constraint attributes (\`required\`/\`min\`/\`max\`/\`maxlength\`/\`minlength\`/\`pattern\`/\`step\`), \`<select>\` option text, and static ARIA relationship attributes (\`aria-controls\`, \`aria-expanded\`) already present on initial page load. Never read or write the \`value\`, \`checked\`, or \`selected\` attribute of any element the worker did not itself just set (a pre-filled field may hold real session/account data) - the exception below controls the field, it never reads what was already there.
     - **The one allowed action class, added after live use under-extracted parameters (progressive-disclosure forms where a checkbox, radio, dropdown, or filled field reveals more fields the read-only pass could never see):** \`.check()\`/\`.uncheck()\` on checkboxes and radio buttons, \`.selectOption()\` on \`<select>\` elements, and \`.fill()\` on text/textarea inputs with a synthesized, illustrative value (never a real one) are allowed, specifically to observe what newly appears - never to explore an app's behavior for its own sake.
     - **Absolute ban, no exception, ever:** \`.click()\` on a \`<button>\`, an \`input[type=submit]\`/\`input[type=button]\`, or anything carrying a submit/create/delete/send-shaped ARIA role or accessible name. Buttons are what actually mutate or persist state; checkboxes/radios/selects/fields toggled without ever reaching a submit action are what this exception exists for, and that boundary is exactly the button/non-button line, not a judgment call to make per app. Never a \`trial: true\` dry-run on a forbidden action either - that still exercises real event handlers on some components.
     - **Bounded and reset**: probe one optional-reveal control at a time - toggle/select/fill it, read whatever newly appeared under the same attribute-only allowlist above, then reset it (\`.uncheck()\`, select back to its original option, clear the fill) before probing the next one. Never combine multiple togglings at once - that's both unbounded in combination count and makes it unclear which toggle revealed what.
     - **Disclosed, not hidden, residual risk**: on most applications, none of this reaches the backend before an actual submit action - but a minority of apps do wire individual field changes to a live autosave or telemetry call. This is a deliberate, informed trade-off for parameter-extraction completeness, not an oversight; if a route is known to autosave on every keystroke, skip the fill-based probe for it and rely on static markup alone.
   * **PII/session-data guard**, identical thresholds to \`/map-site\` Step 6's rule, applied to every \`evidence[].excerpt\` AND every \`EquivalencePartition.sampleValues[]\` entry: mask any run of 6+ consecutive digits or any 8+-character token where digits are the majority as \`[REDACTED]\`. Treat a \`<select>\`'s option-text list as live-data-sourced (not static markup) whenever its options are not a small closed enum an evidence excerpt can name individually (e.g. "choose your saved address") - redact the same way. \`scripts/generate-test-conditions.mjs\` also applies this same redaction mechanically as a backstop before writing output, regardless of what this step wrote.
   * \`sampleValues\` MUST be synthesized illustrative examples (e.g. \`"user@example.com"\`, \`""\`, \`"123"\`) - never copied from any attribute, placeholder, or content observed on the live page.
   * Infer \`parameters[]\` (per \`Parameter\`'s shape in \`.scaffold/schemas/test-conditions.types.ts\` - \`kind\` from the closed \`ParameterKind\` set, \`partitions[]\` each with >=1 \`evidence\` entry, \`boundaries[]\` only for numeric/length-constrained fields with >=1 \`'valid'\`-kind partition already present) and \`constraints[]\` (only a directly-visible static ARIA relationship - never inferred from behavior you didn't observe).
   * **Route-level invariant conditions (\`technique: 'architectural-invariant'\`) are where this skill's actual judgment lives - everything in Step 4 is deterministic pairwise/boundary/checklist generation, so this is the only place a genuine functional/business-logic defect gets a chance to be found before code exists. Treat it accordingly: this is not a template to fill in, it is an investigation.** Before writing a single condition, read this route's \`businessFeature.value\`, \`criticalityTier.value\` + \`.reasoning\`, and the confirmed \`corePurpose.selected.value\` from \`artifacts/analysis/business-intent.json\` - the condition set for a "Checkout" route and a "Reset Password" route must not read like the same fill-in-the-blank exercise with different nouns swapped in.
     - **Required thinking sequence per route (internal reasoning, not itself written to the artifact):** (1) What does this feature actually DO, concretely, in terms of state it reads or changes? (2) What would a user, a malicious actor, or simple bad timing plausibly do that this feature's own logic - not just its input fields - would need to defend against? (3) What does this specific application kind (e-commerce, auth, content, dashboard, etc., inferred from \`corePurpose\`) imply about what "wrong" looks like here that a generic web app wouldn't share? (4) Which of the 9 negative categories below does each hypothesis actually belong to, if any - never force a hypothesis into a category it doesn't fit, and never manufacture a condition just to fill a category that genuinely doesn't apply to this route.
     - **Self-questioning heuristics - actually ask these, don't skip to an answer:** If this route accepts a file, what happens with a wrong-but-plausible format (e.g. an .mp3 renamed to .jpg, a genuinely-corrupt file of the right extension)? If this route writes something to persistent storage, what happens if that write is interrupted or repeated? If this route depends on another feature's data (a cart before checkout, a session before a dashboard), what happens when that dependency is missing or stale? If two users or two tabs could plausibly act on the same resource at once, what does this route do about it? What is the single worst real-world consequence of this specific route breaking (data loss, money lost, PII exposed, account takeover), and does at least one condition target exactly that?
     - **Scale depth to \`criticalityTier\`, never to a fixed count**: \`high\` routes get as many genuinely distinct, evidence-grounded conditions as the feature's actual complexity supports (commonly 4-8+ for a route with real business logic - never padded with reworded duplicates just to hit a number); \`medium\` routes get a focused 2-4 covering the most plausible failure modes; \`low\` routes get 1-2, or legitimately zero if the route is purely static/informational with no state or logic to violate - zero is a correct answer for a route with nothing to investigate, not a failure to fill a quota.
     - Each condition still has \`technique: 'architectural-invariant'\`, \`scenario: 'negative'\`, a valid \`negativeCategory\`, \`parameters: {}\`, \`isSpeculative: true\`, \`reviewed: false\`, an empty \`verification: {}\`, and a \`description\` naming the concrete business consequence, not a restated category label.
       - **Bad** (the exact anti-pattern this rule exists to prevent - generic, category-shaped, ignores what the route actually does): \`Verify unauthenticated access is redirected to login\` applied identically to a checkout route, a profile-settings route, and a public marketing page.
       - **Good** (grounded in this route's own \`businessFeature\`/\`corePurpose\`, names the actual consequence): for a checkout route whose \`corePurpose\` is an e-commerce storefront - \`Verify that submitting payment twice in rapid succession (double-click / network retry) does not create two separate orders or charge the customer twice\` (\`concurrent_conflict\`); for an account-deletion route flagged \`high\` - \`Verify that a partially-completed account deletion (interrupted mid-request) leaves the account in a consistent state rather than a half-deleted record inaccessible to both the user and support\` (\`data_integrity\`).
     - **Self-verification pass (before Mechanical Gate 1, one bounded pass over this route's own drafted conditions - zero new tooling, mirrors \`/map-site\` Step 6's own \`criticalityTier\` self-check)**: re-read every \`architectural-invariant\` condition just drafted for this route and check each one, once, against these three questions - fix or drop a condition that fails any of them, never wave one through. (1) **Genericness**: strip this route's own noun (the page name, the business feature) out of the description - does it still read as a plausible condition for a completely different route (a marketing page, an unrelated settings screen)? If yes, it is the "Bad" anti-pattern above and must be rewritten to name this route's actual consequence, or dropped if no route-specific version exists. (2) **Consequence, not category**: does the description name a concrete outcome (data loss, a duplicate charge, an exposed record, a stuck state) rather than restating its own \`negativeCategory\` in prose ("permission is denied", "input is invalid")? (3) **Groundedness**: does the condition trace to something actually established for this route - its \`businessFeature\`, its \`criticalityTier.reasoning\`, the confirmed \`corePurpose\`, an \`access\` map entry, or a human-named domain rule from Step 1b - rather than a plausible-sounding hypothesis invented from the category list alone? This is a checklist-conformance check, not a substitute for the Human Sign-Off Gateway below, which stays mandatory and unchanged - it exists to catch the most obvious instances of the exact anti-pattern this step's own instructions already name, before a human has to.
      - **Negative categories semantic guidance:**
        - \`missing_precondition\`: access without required prior state, missing session, unauthenticated access to restricted routes.
        - \`permission_denied\`: insufficient role/privilege, cross-tenant resource access, or exceeded resource quotas and throttling limits. **When \`artifacts/site-map/site-map.json\` carries an \`access\` map for this route, that is observed evidence, not speculation: a route one crawled role reached and another did not gets a \`permission_denied\` condition naming both roles and the concrete consequence of the boundary failing (e.g. "Verify a customer-role session cannot open /admin/users, which the admin role reaches - a failure here exposes every user record to any signed-in customer"), and its \`isSpeculative\` is \`false\` because a real observation backs it. Read the confirmed role purposes in \`business-intent.json\`'s \`roles\` to name the consequence in the application's own terms rather than generically. A route every crawled role reached identically needs no \`permission_denied\` condition at all - inventing one there is exactly the generic filler this stage bans.**
        - \`concurrent_conflict\`: simultaneous mutations, double-click submissions, optimistic locking collisions.
        - \`state_violation\`: illegal lifecycle transitions (e.g. refunding an unpaid invoice), submitting while already submitting.
        - \`external_failure\`: 3rd-party dependency outage, HTTP 429 rate limiting, network timeouts, or client-side offline states.
        - \`data_integrity\`: ensuring partial failures do not corrupt data or leave orphaned records; form drafts remain intact.
        - \`error_path\`: user-initiated cancellation or abort flows resetting view without corrupting state.
        - \`invalid_input\` and \`boundary\`: payload and length edge cases not already captured by field partitions - including format-confusion cases (a wrong-but-plausible file type/extension) when this route accepts uploads.
   * Write \`artifacts/analysis/test-conditions.json\` (\`schemaVersion: 1\`) with these drafted \`architectural-invariant\` conditions in \`conditions[]\` and \`unsatisfiedPairs: []\` left empty for every new/changed entry.
3. **Mechanical Gate 1 (parameters shape, zero model involvement):**
   * Run \`node scripts/validate-test-conditions.mjs --stage=parameters\`. If it reports \`FAILED\`, fix the reported errors and re-run before proceeding to Step 4. Do not present unvalidated output to the human.
4. **Deterministic Condition Generation (zero model involvement):**
   * Run \`node scripts/generate-test-conditions.mjs\`. For every route whose \`parameters\`/\`constraints\` changed since the last run (tracked via \`sourceParamsHash\`), this deterministically computes 2-way combinatorial coverage plus 3-value boundary conditions and writes them into \`conditions[]\`, recording any parameter-pair the constraint set made impossible to cover into \`unsatisfiedPairs[]\` rather than failing. A route with fewer than 2 parameters has nothing to pair, so it falls back to one condition per partition instead (\`technique: 'equivalence-partition'\`) - never silently zero conditions just because pairwise had nothing to combine. It also probes a closed, deterministic checklist of well-known malformed-format/injection-class values per parameter kind (\`technique: 'checklist-based'\`) - complementary to boundary-value, not a replacement for it - scaled to the route's \`artifacts/analysis/business-intent.json\` criticality: full checklist on \`high\` routes or when criticality is unknown, skipped on \`medium\`/\`low\` routes to avoid drowning low-value pages in noise. Every condition also gets a \`description\` (one plain sentence, e.g. \`Verify the page accepts language="en" (positive)\`) and a \`scenario\` (\`positive\`/\`negative\`), both synthesized deterministically from the vector's own resolved partition sample values or literal boundary/checklist probe - zero model involvement, same as everything else in this step - so what a human reviews at sign-off is never invented. Every generated condition gets \`isSpeculative: true\`, \`reviewed: false\`, an empty \`verification\` contract.
   * **The two flow-oriented techniques come from the feature map, and only from there.** When \`artifacts/analysis/feature-map.json\` holds a reviewed entity with a lifecycle, the same script also writes \`state-transition\` conditions (one per defined transition, plus one per state-and-trigger pair the lifecycle leaves undefined - "refunding an unpaid invoice" is exactly that shape, and the invalid half is dropped on medium/low-impact routes for the same reason the checklist is) and one \`use-case\` condition per entity whose life actually goes somewhere, naming the whole main flow. They are attached to the feature's own first member route rather than repeated on every page it touches. A project with no reviewed feature map gets neither, and that is the correct outcome, not a gap: both techniques need a model of what an entity's life looks like, and no amount of per-page analysis produces one.
   * **Component-level (unit) testing is out of scope here and always will be.** Those tests belong to the application's own codebase, where the code is; nothing in this project can see it. Say so plainly if a human asks why no unit conditions appear, rather than treating it as something still to come.
5. **Mechanical Gate 2 (full shape, zero model involvement):**
   * Run \`node scripts/validate-test-conditions.mjs\` (no flag). If it reports \`FAILED\`, fix the reported errors and re-run before proceeding to Step 6. Do not present unvalidated output to the human.
6. **Human Sign-Off Gateway:**
   * Present the Test-Conditions Review Artifact. ${REVIEW_ARTIFACT_RENDER_NOTE('test-conditions')} The script owns the shape - per-route heading, the \`Constraints:\` line when a route has any (with partition ids already resolved to their own sample values), every condition on its own numbered line with its technique, and the \`Unsatisfied pairs:\` count when it is above zero. Never substitute a statistics dump (\`Parameter: ... Technique: ... Conditions: <count>\`) for the conditions themselves: a count is not a condition, and a human cannot approve or correct what they cannot see. Note for context when explaining constraints: this is the only cross-field dependency this stage tracks (within one route's own parameters); it does not model a route depending on another route or feature (e.g. an auth prerequisite, data seeded elsewhere) at all yet. State explicitly: this file is NOT authoritative until a human has reviewed it, and every condition's \`verification\` contract is an empty stub a human must fill in. **Defensive Oracle Polarity**: when specifying \`verification\` contracts (\`ui\`, \`state\`, \`network\`), assert system defense, graceful error feedback, and state preservation вЂ” NEVER assert unhandled defects, server crashes, or unhandled 5xx codes (any \`verification.network.status >= 500\` will fail mechanical validation). Any \`unsatisfiedPairs\` entries mean the constraint set made full 2-way coverage impossible for that route - a human should confirm whether that's expected (mutually exclusive fields) or a sign the extracted constraints themselves are wrong. Once the human actually approves a condition in conversation (individually, by route, or the whole artifact as-is), set that condition's \`reviewed\` to \`true\` and \`reviewedBy\` to \`'human'\` in \`artifacts/analysis/test-conditions.json\` before continuing - never set \`reviewed: true\` without also setting \`reviewedBy\`.
`,
    },
    {
      name: 'design-test-cases',
      description:
        'Test Design: bridges test-conditions.json to a drafted, TMS-shaped test case: deterministically decides how each condition should be driven (ui or api), how far each test reaches (targeted or a walk across a feature), then drafts one test case per journey. No blocking Human Sign-Off Gateway - writes the draft, reviewable anytime.',
      disableModelInvocation: true,
      content: `# Skill: Test Design (/design-test-cases)

## Purpose
Elaborates Stage 3's test conditions into test cases. Consumes \`artifacts/analysis/test-conditions.json\`'s reviewed conditions and answers three separate questions about each journey deterministically - which interface drives it (\`ui\` or \`api\`), how far it reaches (\`targeted\`, or \`e2e\` for a walk across a feature's own routes), and what the test object is (\`integration\` or \`system\`) - then drafts one test case per journey. A journey that walks a feature is built from \`artifacts/analysis/feature-map.json\`'s reviewed features; a feature nobody has approved contributes nothing, and neither does any other model-derived signal. Unlike every earlier stage in this pipeline, this skill does NOT pause for a blocking Human Sign-Off Gateway - it writes the draft and moves on, since the draft is cheap to review and correct at any later point rather than needing to be right before the pipeline can proceed.

## Workflow
0. **Self-Introduction (every run, standalone or in-chain) and Entry Check:** state in one plain sentence what this does - "Turns your reviewed test conditions into concrete, readable test cases, for you to review." - before anything else runs. Print this sentence every time, including when invoked as part of \`/ground-zero-setup\`'s own chain: a caller's pre-flight describes the pipeline as a whole and never this stage's own specifics, so skipping it in-chain leaves a first-time user facing this skill's first question with no idea what is about to happen. Then, **only when invoked directly rather than as part of \`/ground-zero-setup\`'s chain**, ask: **Continue, or stop here?** ${INTERACTIVE_CHOICE_NOTE} Stop on anything but an explicit yes; nothing has run yet at this point. In-chain, skip that confirmation alone - the chain's own per-stage gate already covers it - never the sentence itself.
1. **Preconditions:**
   * Default scope: every route in \`artifacts/analysis/test-conditions.json\` with at least one \`reviewed: true\` condition. If none exist, refuse and print exactly: "No reviewed test conditions found. Run /define-test-conditions and complete its Human Sign-Off Gateway before designing test cases." Do not proceed.
2. **Deterministic Classification (zero model involvement):**
   * Run \`node scripts/compose-journeys.mjs\`. It builds one journey per reviewed feature spanning two or more routes that each have a happy path - the walk proving that what one screen creates turns up on the next - then one journey per route per interface for every condition those walks did not take. Interface is decided per condition: \`ui\` for a probe a client-side HTML5 constraint would block before it ever reaches the network, and for a route's own happy path; \`api\` for everything else, and \`api\` even for the happy path when the route's feature is low-impact and a real contract exists - low impact means the cheapest interface that can check it, never no test at all. See \`scripts/compose-journeys.mjs\`'s own header comment for the exact rules. Writes \`artifacts/test-cases/test-cases.json\`.
   * **Acceptance is not one of the things this decides.** Whether a journey is what someone would sign the feature off on is a statement about a stakeholder, not about breadth or interface, and nothing here can observe it. If a person says so in conversation, record it on that journey's \`acceptanceCriterion\` with their own words; otherwise leave it absent.
3. **Mechanical Gate 1 (structural shape, zero model involvement):**
   * Run \`node scripts/validate-journeys.mjs --stage=structural\`. If it reports \`FAILED\`, fix the reported errors and re-run before proceeding to Step 4. Do not present unvalidated output to the human.
4. **Test-Case Drafting:**
   * For every journey with no \`testCase\` yet, read its \`conditionAssignments\` (resolving each \`conditionId\` back to the actual condition and parameters in \`test-conditions.json\`) and draft a \`testCase\`: a title, preconditions, and ordered steps with expected results.
   * **Title format, always**: \`[<businessFeature.value>]: Verify <what this case actually verifies, one concrete clause>\` - the feature name in square brackets first, then \`Verify\` naming the real behavior under test, never a generic filler clause like "Interactive verification on [<path>]" that just restates the route instead of saying what's being checked. Bad: \`[Data Tables]: Interactive verification on [/tables]\` (says nothing about what's verified). Good: \`[Data Tables]: Verify column sorting reorders rows correctly\`.
    * **One atomic action per step, each with its own concrete expected result - never a step that bundles multiple actions behind one blanket result at the end.** This is not a style preference: \`/automate-test\` wraps each drafted step in its own step block (\`${sc.stepDemarcation('Step N: ...')}\`), so a step with no verifiable expected result gives it nothing to assert on, and a step bundling several actions forces one step block to silently cover several unrelated behaviors. Lean on each condition's own \`description\` and \`scenario\` fields (already written by Stage 3) as the step's source material rather than inventing new prose: a \`scenario: 'positive'\` condition's expected result states the concrete success signal (a specific confirmation message, a field's new displayed value, a status code) - a \`scenario: 'negative'\` condition's expected result states the concrete rejection/handling signal (a specific validation message, a disabled control, an error status code) following **Defensive Oracle Polarity** (asserting system defense, rejection, and state preservation, never a crash or unhandled defect) - never a vague blanket result like "works correctly" or "is handled" that could not tell a passing run from a subtly broken one. When a condition defines a \`negativeCategory\`, align the expected result with its category:
      - \`invalid_input\` / \`boundary\`: field displays inline validation message, submission blocked.
      - \`missing_precondition\` / \`permission_denied\`: redirect to login or display forbidden alert (401/403), resource state unmodified.
      - \`concurrent_conflict\`: conflict notification displayed, stale update rejected (409), initial state intact.
      - \`state_violation\`: illegal operation blocked, duplicate request deduplicated.
      - \`external_failure\`: graceful degradation banner displayed, offline retry prompt available.
      - \`data_integrity\`: error alert displayed, unsaved form draft preserved without corruption.
      - \`error_path\`: cancellation completes cleanly, view restored without side effects.
   * **Bracket every literal on-screen name.** Any specific, literal name a step references - a button's or link's visible label, a page/screen name, a checkbox/radio/dropdown option's label, a field's label, a toast/notification's message, a table/list's name - goes in square brackets, using a fixed small vocabulary of action verbs so every step reads the same way no matter who or what wrote it:
     - \`Click the [X] button\` / \`Click the [X] link\`
     - \`Navigate to the [X] page\`
     - \`Check the [X] checkbox\` / \`Uncheck the [X] checkbox\`
     - \`Select the [X] radio button\`
     - \`Select the [X] dropdown > [Y] option\`
     - \`Fill the [X] field with <value>\`
     - \`Verify the [X] toast/notification appears\`
     - \`Verify the [X] table/list contains [Y]\`
     This is not cosmetic: \`/automate-test\`'s Step 5 grounds its locators directly in this bracketed text (\`getByRole(..., { name: '<bracketed text>' })\` / \`getByText('<bracketed text>')\`), so an unbracketed or paraphrased name breaks that handoff rather than merely reading less consistently. Bracket only names that actually appear as literal text/labels on screen - never bracket a synthesized value you're inventing to fill a field (an email, a quantity number), and never bracket a generic noun with no literal on-screen counterpart.
   * **Never spell out a credential-shaped or personally-identifying \`<value>\` in a step's own text** - the underlying condition's \`parameters\` names which field a value belongs to; when that field's \`kind\` (per \`.scaffold/schemas/test-conditions.types.ts\`'s \`ParameterKind\`) is \`password\`, or an \`email\`/\`text\` field whose parameter name or label plausibly holds an account identifier, describe the value generically instead of quoting it literally - \`Fill the [Password] field with a valid password\` / \`Fill the [Email] field with a registered email address\`, never \`Fill the [Password] field with SuperSecretPassword!\`. \`/automate-test\`'s own Step 5 resolves the actual literal value at code-synthesis time (from \`.env\`'s captured credentials, or a freshly synthesized one via \`test-data-engineer\`/\`ApiClient\`'s TDM helpers) - this stage's job is describing WHAT gets filled, not the literal secret that fills it. Every other parameter kind (a quantity, a date, a plain non-account text field) keeps concrete illustrative values exactly as the examples below already show - this rule is scoped to credentials/PII, not test data in general.
   * Describe every \`'api'\`-level step generically ("call the project's API client with...") rather than naming a language-specific class - actual code generation is \`/automate-test\`'s job, not this skill's.
   * **For a journey whose \`layer\` is \`'api'\`, ground each step in an ACTUALLY OBSERVED entry from \`artifacts/site-map/api-contracts.json\`** (per \`.scaffold/schemas/api-contracts.types.ts\`) rather than inventing an endpoint: match the condition's own route/action against a contract entry whose \`observedFromRouteIds\` includes this journey's \`routeId\` (or, for a login-adjacent condition, an entry with an empty \`observedFromRouteIds\`). When a match exists, populate that step's \`api\` field (\`method\`, \`path\` from the contract's \`pathTemplate\`, \`payload\` derived from the condition's own parameters - never the contract's redacted sample values, \`expectedStatus\` from the contract's \`responseStatus\` for the success case or the condition's own expected status for a negative one, \`expectedResponseShape\` from the contract's \`responseShape\`) and set \`contractGrounded: true\`. Name the real method and path in the step's own description text so it stays truthful to what was actually observed (e.g. "Call the API client's POST /api/cart/items endpoint with the item payload -> Response status is 201 and the returned item id matches"). When NO contract entry matches, still draft the step from the condition as best-effort prose, set \`contractGrounded: false\`, and surface it plainly in Step 6's review artifact as a disclosed gap ("no observed API contract - crawl this route's interaction again with /map-site, or capture it during /auth-setup, before automating") rather than silently guessing an endpoint.
   * **Good example** (atomic steps, each with a concrete expected result and bracketed literal names, drawn from the conditions' own \`description\`/\`scenario\`):
     \`\`\`
     Title: [Checkout]: Verify a standard-shipping order is accepted and an over-limit quantity is rejected
     Preconditions: ["User is authenticated", "Cart contains at least 1 eligible item"]
     Steps:
     1. Select the [Standard] shipping method -> Selected shipping method is [Standard] and the order summary's shipping line updates to match.
     2. Select the [Card] payment method -> Selected payment method is [Card] and the card-specific fields become visible.
     3. Fill the [Quantity] field with 5 (within the valid 1-10 range) -> [Quantity] field shows 5, no validation error is shown.
     4. Click the [Place Order] button -> Order confirmation page shows a confirmation number and the message "Order confirmed", cart is cleared.
     5. Fill the [Quantity] field with 11 (one above the max boundary of 10) -> [Quantity] field shows the validation message "Maximum quantity is 10" and the [Place Order] button stays disabled.
     \`\`\`
   * **Bad example** (the exact anti-pattern this rule exists to prevent - real text from an earlier version of this artifact):
     \`\`\`
     Title: [Checkout]: Verify checkout succeeds with valid data
     Steps:
     1. Submit the checkout form with valid data -> Order confirmed
     \`\`\`
     This collapses navigation, three separate field selections, and submission into one step, never states which concrete values were used, and gives \`/automate-test\` nothing to assert on beyond the page not crashing - a subtly wrong shipping method or an unconfirmed quantity would still "pass."
   * Write the result into that journey's \`testCase\` field, leaving \`reviewed: false\`.
5. **Mechanical Gate 2 (full shape, zero model involvement):**
   * Run \`node scripts/validate-journeys.mjs\` (no flag). If it reports \`FAILED\`, fix the reported errors and re-run before finishing.
6. **Test-Cases Review Artifact (informational, never blocking):**
   * Present every newly-drafted \`testCase\`. ${REVIEW_ARTIFACT_RENDER_NOTE('test-cases')} The script owns the shape - per-journey heading, \`Title:\`, \`Preconditions:\`, every step numbered as \`<n>. <description> -> <expectedResult>\`, and a \` [NO OBSERVED API CONTRACT]\` marker on any step whose \`api.contractGrounded\` is \`false\`. That marker is a disclosed gap the human should see and can close by re-crawling that route with /map-site or /auth-setup - when the artifact contains any, name that plainly alongside it rather than letting it pass as ordinary formatting. This is what a human actually reviews: a stage that drafts real content and reports only a count defeats the point of drafting it.
   * Run \`node scripts/pipeline-status.mjs\` and print its \`roadmap\` field so the human sees Stage 4 marked done and Stage 5 (\`/automate-test\`) next.
   * If at least one TMS/task-tracker provider is configured (the \`mcp__tms__*\` tools are present in this conversation), ask one short, easily-skippable question naming it: "<Provider> is configured - want these also recorded there as test cases?" ${INTERACTIVE_CHOICE_NOTE} A "no," or no answer at all, is a completely normal outcome here - never re-ask automatically on a later run just because it went unanswered once. If the user answers yes, record the drafted test cases into the configured TMS via \`mcp__tms__create_issue({ summary: testCase.title, description: formatSteps(testCase), issueType: 'Test' })\`.
   * Do not ask for approval of the drafts themselves before finishing: this stage's draft is deliberately reviewable-later, not gate-blocking, a departure specific to this stage only - every earlier stage in this pipeline keeps its own blocking Human Sign-Off Gateway unchanged. Showing the drafts is not the same as gating on them.
`,
    },
    {
      name: 'ground-zero-setup',
      description:
        'Guided orchestrator for a brand-new application: runs the currently-built app-analysis pipeline (/map-site create, then /define-test-conditions, then /design-test-cases) end-to-end, pausing for human sign-off after each stage by default (except /design-test-cases, which has no blocking gate of its own), or fully unattended in auto-pilot mode.',
      disableModelInvocation: true,
      content: `# Skill: Greenfield Guided Setup (/ground-zero-setup)

## Purpose
A thin orchestrator for a brand-new application, not a new analysis engine of its own: it sequences the full app-analysis-and-automation pipeline (\`/auth-setup\` when the project needs it, then \`/map-site create\` including its automatic Step 6 business-intent inference, then \`/define-test-conditions\`, then \`/design-test-cases\`, then \`/automate-test\`) end to end - from nothing to verified working automated tests, after one single invocation - so a user does not have to remember which command follows which or separately trigger the final stage themselves. It adds zero duplicated crawling, inference, generation, or code-synthesis logic; every actual decision about what stage comes next is read from \`scripts/pipeline-status.mjs\`, never hardcoded here, so a future pipeline stage only ever requires extending that one script, not rewriting this skill's own sequencing. \`/automate-test\` is a normal in-chain stage like the three before it, not a special case this orchestrator refuses to reach - but code is never written without its own human decision point: \`/automate-test\`'s own Human Sign-Off Gateway (its Step 4, a BLOCKING GATE before any test code is synthesized) still applies exactly as that skill defines it and is never bypassed, in Guided mode or Auto-pilot.

## Workflow
1. **Pre-Flight Confirmation (mandatory, before anything runs):**
   * Run \`node scripts/pipeline-status.mjs\` first and resume from whatever stage it reports - never restart a pipeline that is already partway done.
   * Print its \`preFlightNotice\` field to the human VERBATIM, before asking anything else - do not paraphrase, shorten, summarize, or skip any part of it. This field already contains the roadmap, the cost warning, and the human-gates disclosure, authored once in the script itself rather than composed fresh by the model each run, specifically so none of it can be silently dropped by the model's own judgment on a given pass. **Do not add anything explaining what \`/automate-test\` (Stage 5) is or how it relates to the rest of the chain here** - a user on their very first run has no context for that yet and doesn't need it prematurely; the roadmap already names it as a stage, and \`/automate-test\` introduces itself in one sentence when the chain actually reaches it (see its own Step 1).
   * **Mode choice**, asked at the same point, with a clearly-marked recommended default:
     - **Guided (Recommended):** pause at every stage's Human Sign-Off Gateway, exactly as described above.
     - **Auto-pilot:** skip every pause for LOCAL artifact review only and proceed straight through every analysis/drafting stage, using the model's own judgment, on the user's own explicit pre-authorization given right here. Still writes \`reviewed: true\` on every new/changed entry, but as \`reviewedBy: 'auto-pilot'\` rather than \`'human'\`, so a later audit can always tell which entries a human actually looked at. This pre-authorization still does NOT extend to \`/automate-test\`'s own Human Sign-Off Gateway (see Step 3/4) - that gate is a decision about writing and executing real code, not local artifact review, and stays a hard stop in both modes. Still produces the same deterministic Final Report described below.
   * ${INTERACTIVE_CHOICE_NOTE} If the user's response does not clearly select a mode, ask again rather than guessing, and never silently default to Auto-pilot - Guided is the only safe default to fall back to.
1b. **Authentication Pre-Stage (deterministic, runs before Stage 1 - the crawl needs a session, not the other way round):**
   * Run \`node scripts/auth-status.mjs\` and branch on what it actually reports - never re-derive session state by looking at \`.auth/\` yourself, and never ask a question the script already answered.
     - \`nextStep: "capture-needed"\` (no session file at all): the crawl would only ever see the signed-out surface of the app, so run \`/auth-setup\` in full first, exactly as that skill defines it, then continue to Stage 1. The one exception is an app with no login at all - \`/auth-setup\`'s own Step 0 asks that first and exits immediately when the answer is no, which is the correct outcome here too, not something to pre-empt.
     - \`nextStep: "roles-incomplete"\` (sessions exist, but \`rolesMissingSession\` is non-empty - a role was declared in \`.env\` and never captured): name the missing roles and ask once whether to capture them now before crawling. ${INTERACTIVE_CHOICE_NOTE} A "no" is a perfectly normal answer - continue with the sessions that exist and say plainly that routes only that role can reach will be missing from the map.
     - \`nextStep: "session-exists"\` (everything declared is captured): skip \`/auth-setup\` entirely. Say in one line which sessions are being used ("using the saved admin and customer sessions") - a skipped stage should still be visible, not silent.
   * This is the whole gate: a deterministic check with three outcomes, not a judgment call about whether auth "seems" set up. \`/auth-setup\` stays an independent skill that a human can run on its own at any time; this step only decides whether the chain needs to invoke it.
2. **Stage Loop (Guided mode; repeats once per pipeline stage, now including Stage 5):**
   * Run the stage by invoking its own skill exactly as documented there (\`/map-site create\` first, then \`/map-features\`, then \`/define-test-conditions\`, then \`/design-test-cases\`, then \`/automate-test\`) - never reimplement, shortcut, or paraphrase any of that skill's own steps.
   * Present that stage's own existing Human Sign-Off Gateway (or, for \`/design-test-cases\`, its Test-Cases Review Artifact; for \`/automate-test\`, its own Step 4 Proposal Artifact) exactly as its own skill defines it, preceded by the current \`roadmap\` from \`pipeline-status.mjs\` so the human always sees stage position alongside the content - this skill does not invent a different review format or shorten the one that already exists.
   * **\`/automate-test\` (Stage 5) is handled entirely by its own skill, not by this step's merged gate below:** its Step 4 Human Sign-Off Gateway is already the human decision point for writing code - do not additionally ask this skill's own merged question before or after it. Once \`/automate-test\` finishes a batch (tests passing, \`reviewed: true\` set), go straight to End of Chain below.
   * **Single merged gate, one question instead of two (every stage except \`/automate-test\`, per the exception above):** run \`node scripts/pipeline-status.mjs\` to read the current \`nextCommand\`, then ask ONE question that combines approving this stage's own output with deciding what happens next - never a separate "approve?" exchange followed by a separate "continue?" exchange for what is a single human decision. ${INTERACTIVE_CHOICE_NOTE} Offer: **"(Recommended) Approve and continue to \`<nextCommand>\`"**, "Approve and pause here" (the project is left in a valid, resumable state; resume later via \`nextCommand\` directly or by re-invoking \`/ground-zero-setup\`, which always resumes from whatever \`pipeline-status.mjs\` currently reports rather than restarting), "Reject with comments", "Stop for now". \`/design-test-cases\` has no approval half (per its own Step 6, no blocking gate) - for it, ask only the continue-or-pause half of this same merged question. If the human's single reply already combines corrections to specific entries with a continue/pause signal (e.g. "route 5 should be critical, and yes continue"), act on both parts of that one message - never ask a separate follow-up purely to re-confirm intent the human already stated.
     - **Approve and continue:** follow that stage's own instruction to set \`reviewed: true\` and \`reviewedBy: 'human'\` on every entry just approved, then proceed directly to \`nextCommand\` with no further question.
     - **Approve and pause / Stop for now:** set \`reviewed: true\`/\`reviewedBy: 'human'\` (approve cases only) and stop here - see the resumability note above.
     - **Reject with comments:** apply the requested edits to the affected entries, then re-present the updated review artifact and ask again - this is a loop, not a one-shot gate, and repeats until the human approves.
3. **Auto-pilot mode:**
   * Skip step 2's merged gate for LOCAL artifact review only (Stages 1-4) - run each stage, then instead of pausing, autonomously approve every new/changed entry from that stage by setting \`reviewed: true\` and \`reviewedBy: 'auto-pilot'\` on it (for \`/design-test-cases\`, still present its Test-Cases Review Artifact and TMS-recording question exactly as that skill defines them - "skip the gate" governs approval, not whether informational content is shown), then immediately continue to the next stage per \`pipeline-status.mjs\`'s \`nextCommand\`, without asking at each stage.
   * **Stage 5 is different even in Auto-pilot:** once \`nextCommand\` is \`/automate-test\`, invoke it the same as Guided mode would - Auto-pilot's own local-artifact-review pre-authorization does NOT extend to \`/automate-test\`'s Step 4 Human Sign-Off Gateway, which stays a hard blocking stop before any code is synthesized, in both modes, no exception. This is the one point in the whole pipeline where a real, consequential decision (writing and running code) still needs the human, deliberately - see Purpose.
   * The blanket pre-authorization given at the Pre-Flight Confirmation screen covers only this: proceeding through this pipeline's own local file writes for Stages 1-4. It does NOT extend to any action with a real external side effect - the Test-Cases Review Artifact's own TMS-recording question (if asked) still requires its own explicit answer even in auto-pilot, and neither does it extend to \`/automate-test\`'s own gate per the bullet above.
4. **End of Chain (reached once the stage is \`test-closure\`):**
   * This is never a silent stop - the human already knows the pipeline ends here from the Pre-Flight roadmap; End of Chain is where that gets confirmed, not a surprise dead end.
   * Do not run a Cross-Page-Object Consolidation Pass here: \`/automate-test\` now runs its own at the end of every invocation, including one that stopped early. Running it again here would repeat a pass that already happened.
   * Print the current \`roadmap\` and \`routeCoverage\` from \`pipeline-status.mjs\` so the human sees exactly how much of the pipeline is done and how many routes reached each stage.
   * **Then run \`node scripts/coverage-status.mjs\` and present its result - this is the closing question the pipeline exists to answer.** It checks, from the artifacts alone, whether every high/medium-impact route has an automated test, whether every drafted test case was actually automated, whether every route with approved conditions got a test case, whether every endpoint seen in real traffic has an API-level test, and whether every route was classified at all. Print its \`summary\` line, and for each unmet criterion print the question and the specific items it names - never just the count, since a count sends someone hunting for which ones. It is a report, not a gate: a team can knowingly ship with a gap, and the point is only that they cannot ship without seeing it.
   * State the automation count from that same \`routeCoverage\` explicitly - how many drafted test cases exist and how many are actually automated - rather than asserting completion in prose. When those two numbers differ for any reason (the human chose "Stop for now", \`/automate-test\`'s own gate is unanswered, or its batch ended before finishing), say so plainly with both numbers and name the exact resume command. Never report a pipeline as finished on the strength of having reached this step.
5. **Final Report (every run, both modes, before finishing):**
   * Print a deterministic summary: which stage(s) actually ran this session; which files were written or changed (e.g. \`artifacts/site-map/site-map.json\`, \`artifacts/analysis/business-intent.json\`, \`artifacts/analysis/feature-map.json\`, \`artifacts/analysis/test-conditions.json\`, \`artifacts/test-cases/test-cases.json\`, and the synthesized test file(s) if \`/automate-test\` ran); each mechanical gate's result (PASSED/FAILED) for every gate that ran; how many entries were approved this session and by whom (\`reviewedBy: 'human'\` vs \`'auto-pilot'\` counts, if both occurred); \`pipeline-status.mjs\`'s \`stageTimings\` (per-stage wall-clock time, derived from each artifact's own timestamp - not a guess) and \`routeCoverage\` (routes mapped/reviewed/automated, and any flagged \`likelyPhantomRoutes\`); and the current \`pipeline-status.mjs\` stage plus its \`nextCommand\`, so the user always knows exactly what to do next without re-reading this skill.
   * Do not attempt to report token or cost usage here - that telemetry is not available to a skill's own instructions from inside a session. If the user wants that, point them at their assistant's own session-level reporting instead (for example Claude Code's \`/cost\` or \`/context\`).
`,
    },
  ];
}

export function planAiOperationalSkills(
  aiAssistants?: readonly string[],
  automationTool: string = 'playwright',
  language: string = 'typescript',
): FileDescriptor[] {
  const assistants =
    aiAssistants === undefined
      ? ['antigravity', 'cursor', 'claude', 'devin', 'codex', 'copilot']
      : aiAssistants;

  if (!assistants || assistants.length === 0) {
    return [];
  }

  const descriptors: FileDescriptor[] = [];
  const skills = buildOperationalSkills(automationTool, language).map(withGlobalConventions);
  // Antigravity and Devin Desktop both discover skills from the exact same shared
  // .agents/skills/<name>/SKILL.md path (Devin's own skills docs name this path directly) - a
  // single guard flag stops the identical descriptor set from being emitted twice when both are
  // selected together, rather than tracking per-assistant duplication ad hoc.
  let agentsSkillsEmitted = false;

  for (const rawAssistant of assistants) {
    const assistant = rawAssistant.toLowerCase();

    if ((assistant === 'antigravity' || assistant === 'devin') && !agentsSkillsEmitted) {
      agentsSkillsEmitted = true;
      for (const skill of skills) {
        descriptors.push({
          // Folder-per-skill with a SKILL.md file, not a flat <name>.md file - live-verified
          // 2026-09-03 against the exact installed Antigravity CLI's own bundled documentation
          // (`agy --print`, its built-in `agy-customizations` skill): "A skill cannot be a single
          // standalone file placed directly in .agents/skills/. It must be placed inside its own
          // subfolder and named SKILL.md." A flat file is silently never discovered at all - not
          // a parsing error, just invisible - which is a stricter failure than the YAML-escaping
          // bug already fixed for this same block (that fix was necessary but not sufficient).
          path: `.agents/skills/${skill.name}/SKILL.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${yamlSafeScalar(skill.description)}
---

${noArgumentSkillInvocationNote(skill)}${skill.content}`,
          },
        });
      }
    } else if (assistant === 'claude') {
      for (const skill of skills) {
        descriptors.push({
          path: `.claude/skills/${skill.name}/SKILL.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${yamlSafeScalar(skill.description)}${argumentFrontmatter(skill)}${skill.disableModelInvocation ? '\ndisable-model-invocation: true' : ''}
---

${skill.content}`,
          },
        });
      }
    } else if (assistant === 'cursor') {
      for (const skill of skills) {
        descriptors.push({
          path: `.cursor/skills/${skill.name}/SKILL.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${yamlSafeScalar(skill.description)}${argumentFrontmatter(skill)}
disable-model-invocation: true
---

${skill.content}`,
          },
        });
      }
    } else if (assistant === 'codex') {
      for (const skill of skills) {
        descriptors.push({
          path: `.codex/skills/${skill.name}/SKILL.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${yamlSafeScalar(skill.description)}${argumentFrontmatter(skill)}${skill.disableModelInvocation ? '\ndisable-model-invocation: true' : ''}
---

${skill.content}`,
          },
        });
      }
    } else if (assistant === 'copilot') {
      for (const skill of skills) {
        descriptors.push({
          path: `.github/prompts/${skill.name}.prompt.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
description: ${yamlSafeScalar(skill.description)}
---

${skill.content}`,
          },
        });
        descriptors.push({
          path: `.github/skills/${skill.name}/SKILL.md`,
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: {
            kind: 'inline',
            text: `---
name: ${skill.name}
description: ${yamlSafeScalar(skill.description)}
---

${skill.content}`,
          },
        });
      }
    }
  }

  return descriptors;
}
