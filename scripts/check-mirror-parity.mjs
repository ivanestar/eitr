import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Behavioral/rule parity, not byte-identical text.
//
// CLAUDE.md Section 15 requires the SAME rule/protocol/behavior on both sides
// of a Claude Code <-> Antigravity CLI agent/skill mirror pair, translated to
// each system's own native tool names and frontmatter schema - not literal
// copy-pasted text. This script therefore compares:
//   1. Frontmatter: `name` and `description` must match (after normalizing
//      native tool-name terms); other frontmatter fields may legitimately
//      exist on only one side (e.g. Claude-only `tools:`/`model:`, or an
//      Antigravity-only `subagent: true`) per an explicit exception list.
//   2. Body: split into sections on `##`/`###` markdown headers. Both files
//      must cover the same set of section titles (order-insensitive), and
//      each matched section's prose must be the same content once native
//      tool-name terms, code-fence delimiters, and whitespace are
//      normalized away - but an actual sentence/bullet present on one side
//      and absent on the other still fails, since normalization only
//      touches wording *style*, not content.
// ---------------------------------------------------------------------------

// Known-legitimate native-syntax tool-name pairs between the Claude Code tree
// (.claude/) and the Antigravity CLI mirror tree (.agents/), observed live in
// this repo's own agent/skill files. Each group's terms are canonicalized to
// the same placeholder on BOTH sides before diffing (not substituted
// one-directionally), so a bare English verb that neither tree translates
// does not read as false drift, while an actual tool-name swap (`Edit` ->
// `replace_file_content`) still collapses to the same placeholder on both
// sides. Placeholders use an `@@NAME@@` shape so they cannot be confused
// with, or silently mangled into, ordinary spacing when a file is edited.
const CANONICAL_GROUPS = [
  { canon: '@@EDIT@@', terms: ['Edit', 'replace_file_content', 'multi_replace_file_content'] },
  { canon: '@@READ@@', terms: ['Read', 'view_file'] },
  { canon: '@@WRITE@@', terms: ['Write', 'write_to_file'] },
  { canon: '@@GREP@@', terms: ['Grep', 'grep_search'] },
  { canon: '@@GLOB@@', terms: ['Glob', 'find_by_name'] },
  { canon: '@@SHELL@@', terms: ['PowerShell', 'run_terminal_cmd'] },
  { canon: '@@SUBAGENT@@', terms: ['subagent'] },
];
// "Agent" only canonicalizes when followed by " tool" (avoids collapsing the
// unrelated agent names/roles that appear throughout these files).
const AGENT_TOOL_PATTERN = [/\bAgent\b(?=\s+tool)/g, '@@SUBAGENT@@'];

function canonicalize(text) {
  let result = text;
  for (const { canon, terms } of CANONICAL_GROUPS) {
    for (const term of terms) {
      const pattern = new RegExp(`\\b${term}\\b`, 'g');
      result = result.replace(pattern, canon);
    }
  }
  result = result.replace(AGENT_TOOL_PATTERN[0], AGENT_TOOL_PATTERN[1]);
  return result;
}

function collapseWhitespace(text) {
  return text.trim().replace(/\s+/g, ' ');
}

// --- Frontmatter parsing -----------------------------------------------

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return { fields: {}, order: [], bodyStart: 0 };
  const fields = {};
  const order = [];
  for (const rawLine of m[1].split(/\r\n|\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    fields[key] = value;
    order.push(key);
  }
  return { fields, order, bodyStart: m[0].length };
}

// Frontmatter fields that are allowed to exist on only ONE side of a pair,
// because they express a system-native concept with no equivalent on the
// other system (per CLAUDE.md Section 15's "native format, not literal
// text"). Keyed by field name, not by file/anchor text.
const CLAUDE_ONLY_FRONTMATTER_FIELDS = new Set(['tools', 'model']);
const AGENTS_ONLY_FRONTMATTER_FIELDS = new Set(['subagent']);

function diffFrontmatter(pair, claudeFm, agentsFm) {
  const diffs = [];

  const claudeName = claudeFm.fields.name;
  const agentsName = agentsFm.fields.name;
  if (claudeName !== agentsName) {
    diffs.push(`frontmatter "name": .claude="${claudeName}" vs .agents="${agentsName}"`);
  }

  const claudeDesc = claudeFm.fields.description
    ? collapseWhitespace(canonicalize(claudeFm.fields.description))
    : undefined;
  const agentsDesc = agentsFm.fields.description
    ? collapseWhitespace(canonicalize(agentsFm.fields.description))
    : undefined;
  if (claudeDesc !== agentsDesc) {
    diffs.push(
      `frontmatter "description": .claude="${claudeFm.fields.description ?? '(missing)'}" vs .agents="${agentsFm.fields.description ?? '(missing)'}"`,
    );
  }

  const allKeys = new Set([...claudeFm.order, ...agentsFm.order]);
  for (const key of allKeys) {
    if (key === 'name' || key === 'description') continue;
    const inClaude = key in claudeFm.fields;
    const inAgents = key in agentsFm.fields;
    if (inClaude && !inAgents) {
      if (!CLAUDE_ONLY_FRONTMATTER_FIELDS.has(key)) {
        diffs.push(
          `frontmatter "${key}" present in .claude only (not in the documented Claude-only exception list)`,
        );
      }
    } else if (!inClaude && inAgents) {
      if (!AGENTS_ONLY_FRONTMATTER_FIELDS.has(key)) {
        diffs.push(
          `frontmatter "${key}" present in .agents only (not in the documented Antigravity-only exception list)`,
        );
      }
    } else if (inClaude && inAgents) {
      const a = collapseWhitespace(canonicalize(claudeFm.fields[key]));
      const b = collapseWhitespace(canonicalize(agentsFm.fields[key]));
      if (a !== b) {
        diffs.push(
          `frontmatter "${key}": .claude="${claudeFm.fields[key]}" vs .agents="${agentsFm.fields[key]}"`,
        );
      }
    }
  }

  return diffs;
}

// --- Body: section splitting --------------------------------------------

function stripCodeFenceDelimiters(text) {
  return text.replace(/^\s*```.*$/gm, '');
}

function normalizeTitle(title) {
  return collapseWhitespace(canonicalize(title)).toLowerCase();
}

function splitSections(bodyText) {
  const lines = bodyText.split(/\r\n|\n/);
  const sections = [];
  let current = { title: '__PREAMBLE__', lines: [] };
  for (const line of lines) {
    const m = /^(#{2,3})\s+(.*)$/.exec(line);
    if (m) {
      sections.push(current);
      current = { title: normalizeTitle(m[2]), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections;
}

// Normalize a section's content into comparison "units" coarser than a raw
// source line, so pure word-wrap/reflow differences between the two files
// (e.g. one copy wrapping at 100 chars, the other at a different width, or
// one paragraph being reformatted into the same list) never register as
// drift on their own. A unit is either one bullet/numbered-list item (full
// text, even if it originally spanned multiple wrapped lines) or one
// blank-line-delimited paragraph - both joined into a single whitespace-
// collapsed string. An actual added/removed sentence still changes its
// unit's text (or adds/removes a whole unit), so it still shows up in the
// diff; only the line-wrap position stops mattering.
function normalizeSectionUnits(lines) {
  const joined = stripCodeFenceDelimiters(canonicalize(lines.join('\n')));
  const paragraphs = joined.split(/\r?\n\s*\r?\n/);
  const units = [];
  for (const para of paragraphs) {
    const paraLines = para
      .split(/\r\n|\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (paraLines.length === 0) continue;
    const startsList = paraLines.some((l) => /^([-*]|\d+[.)])\s+/.test(l));
    if (startsList) {
      // Group wrapped continuation lines into their owning bullet/numbered item.
      let current = null;
      for (const l of paraLines) {
        if (/^([-*]|\d+[.)])\s+/.test(l)) {
          if (current !== null) units.push(collapseWhitespace(current));
          current = l;
        } else if (current !== null) {
          current += ' ' + l;
        } else {
          current = l;
        }
      }
      if (current !== null) units.push(collapseWhitespace(current));
    } else {
      units.push(collapseWhitespace(paraLines.join(' ')));
    }
  }
  return units.filter((u) => u.length > 0);
}

// LCS-based line diff: returns { added, removed } - lines present only in
// `b` (added relative to a) and only in `a` (removed relative to b),
// computed via longest-common-subsequence so a single inserted/deleted line
// does not cascade into a false diff on every following line (the failure
// mode of pure positional index comparison).
function lcsDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const removed = [];
  const added = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      removed.push(a[i]);
      i++;
    } else {
      added.push(b[j]);
      j++;
    }
  }
  while (i < n) removed.push(a[i++]);
  while (j < m) added.push(b[j++]);
  return { added, removed };
}

// Sections that are documented, intentional one-sided content - a genuinely
// newer or system-specific nuance already reviewed as legitimate. Keyed by
// (kind, slug, normalized section title), NOT by exact anchor text, so an
// unrelated wording change elsewhere in the file never accidentally matches
// this list, and this list survives future edits to the exempted section's
// exact phrasing.
const KNOWN_LEGITIMATE_RESIDUE_SECTIONS = [
  { kind: 'agent', slug: 'core-developer', section: '2. surgical edits & fallback rules' },
  { kind: 'skill', slug: 'project-memory-keeper', section: '3. how to update memory' },
  { kind: 'skill', slug: 'project-memory-keeper', section: 'bad examples' },
  // axis-closure-matrix and sdd-plan-writer: both files were authored together in
  // one commit (608081a) with deliberately different System-native phrasing for
  // Claude-specific mechanics (the `Artifact` tool, a named `web-researcher`/
  // `researcher` subagent, a new `Agent` call) that Antigravity CLI has no
  // identically-named equivalent for - not one side lagging behind the other.
  // Reviewed 2026-08-31 (Phase E4 of the AI-agent/skill DoD closure batch):
  // forcing byte-level text sync here would violate CLAUDE.md Section 15's own
  // "native format, not literal text" rule.
  { kind: 'skill', slug: 'axis-closure-matrix', section: 'when to use' },
  {
    kind: 'skill',
    slug: 'axis-closure-matrix',
    section: 'the process (four deliverables, in order)',
  },
  {
    kind: 'skill',
    slug: 'axis-closure-matrix',
    section: 'report shape (deterministic html template)',
  },
  { kind: 'skill', slug: 'axis-closure-matrix', section: 'after publishing' },
  { kind: 'skill', slug: 'sdd-plan-writer', section: 'purpose' },
  { kind: 'skill', slug: 'sdd-plan-writer', section: 'when to use' },
  { kind: 'skill', slug: 'sdd-plan-writer', section: 'independent review handoff' },
  { kind: 'skill', slug: 'sdd-plan-writer', section: 'user approval gateway' },
];

function isKnownResidueSection(pair, sectionTitle) {
  return KNOWN_LEGITIMATE_RESIDUE_SECTIONS.some(
    (r) => r.kind === pair.kind && r.slug === pair.slug && r.section === sectionTitle,
  );
}

function diffBody(pair, claudeBody, agentsBody) {
  const claudeSections = splitSections(claudeBody);
  const agentsSections = splitSections(agentsBody);

  const claudeMap = new Map(claudeSections.map((s) => [s.title, s]));
  const agentsMap = new Map(agentsSections.map((s) => [s.title, s]));

  const realDiffs = [];
  const knownDiffs = [];

  const allTitles = new Set([...claudeMap.keys(), ...agentsMap.keys()]);
  for (const title of allTitles) {
    const inClaude = claudeMap.has(title);
    const inAgents = agentsMap.has(title);

    if (inClaude && !inAgents) {
      const msg = `section "${title}" present in .claude only`;
      if (isKnownResidueSection(pair, title)) knownDiffs.push(msg);
      else realDiffs.push(msg);
      continue;
    }
    if (!inClaude && inAgents) {
      const msg = `section "${title}" present in .agents only`;
      if (isKnownResidueSection(pair, title)) knownDiffs.push(msg);
      else realDiffs.push(msg);
      continue;
    }

    const claudeUnits = normalizeSectionUnits(claudeMap.get(title).lines);
    const agentsUnits = normalizeSectionUnits(agentsMap.get(title).lines);
    const { added, removed } = lcsDiff(claudeUnits, agentsUnits);
    if (added.length === 0 && removed.length === 0) continue;

    const bucket = isKnownResidueSection(pair, title) ? knownDiffs : realDiffs;
    for (const unit of removed) bucket.push(`section "${title}": only in .claude -> "${unit}"`);
    for (const unit of added) bucket.push(`section "${title}": only in .agents -> "${unit}"`);
  }

  return { realDiffs, knownDiffs };
}

// --- File discovery -------------------------------------------------------

function listMdFiles(dir) {
  if (!statSync(dir, { throwIfNoEntry: false })) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(...listMdFiles(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const pairs = [];

// Agents: .claude/agents/<slug>.md <-> .agents/agents/<slug>/AGENT.md
const claudeAgentsDir = path.join(repoRoot, '.claude', 'agents');
for (const file of listMdFiles(claudeAgentsDir)) {
  const slug = path.basename(file, '.md');
  pairs.push({
    slug,
    kind: 'agent',
    claudePath: file,
    agentsPath: path.join(repoRoot, '.agents', 'agents', slug, 'AGENT.md'),
  });
}

// Skills: .claude/skills/<slug>/SKILL.md <-> .agents/skills/<slug>/SKILL.md
const claudeSkillsDir = path.join(repoRoot, '.claude', 'skills');
if (statSync(claudeSkillsDir, { throwIfNoEntry: false })) {
  for (const entry of readdirSync(claudeSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const claudePath = path.join(claudeSkillsDir, slug, 'SKILL.md');
    if (!statSync(claudePath, { throwIfNoEntry: false })) continue;
    pairs.push({
      slug,
      kind: 'skill',
      claudePath,
      agentsPath: path.join(repoRoot, '.agents', 'skills', slug, 'SKILL.md'),
    });
  }
}

let realDriftCount = 0;
let knownResidueCount = 0;
const report = [];

for (const pair of pairs) {
  const claudeExists = statSync(pair.claudePath, { throwIfNoEntry: false });
  const agentsExists = statSync(pair.agentsPath, { throwIfNoEntry: false });

  if (!claudeExists || !agentsExists) {
    realDriftCount++;
    report.push(
      `[MISSING MIRROR] ${pair.kind} "${pair.slug}": ${claudeExists ? pair.agentsPath : pair.claudePath} does not exist`,
    );
    continue;
  }

  const claudeText = stripBom(readFileSync(pair.claudePath, 'utf8'));
  const agentsText = stripBom(readFileSync(pair.agentsPath, 'utf8'));

  const claudeFm = parseFrontmatter(claudeText);
  const agentsFm = parseFrontmatter(agentsText);
  const fmDiffs = diffFrontmatter(pair, claudeFm, agentsFm);

  const claudeBody = claudeText.slice(claudeFm.bodyStart);
  const agentsBody = agentsText.slice(agentsFm.bodyStart);
  const { realDiffs: bodyRealDiffs, knownDiffs: bodyKnownDiffs } = diffBody(
    pair,
    claudeBody,
    agentsBody,
  );

  knownResidueCount += bodyKnownDiffs.length;

  const allRealDiffs = [...fmDiffs, ...bodyRealDiffs];
  if (allRealDiffs.length > 0) {
    realDriftCount += allRealDiffs.length;
    report.push(`[DRIFT] ${pair.kind} "${pair.slug}" (${pair.claudePath} vs ${pair.agentsPath}):`);
    for (const d of allRealDiffs) {
      report.push(`  ${d}`);
    }
  }
}

if (realDriftCount > 0) {
  console.error(
    `[check-mirror-parity] ${realDriftCount} new drift finding(s) found across ${pairs.length} pair(s) (${knownResidueCount} known-legitimate finding(s) excluded):`,
  );
  console.error(report.join('\n'));
  process.exit(1);
} else {
  console.log(
    `[check-mirror-parity] OK - ${pairs.length} agent/skill pair(s) checked, 0 new drift (${knownResidueCount} known-legitimate finding(s) excluded).`,
  );
  process.exit(0);
}
