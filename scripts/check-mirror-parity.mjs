import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Known-legitimate native-syntax tool-name pairs between the Claude Code tree
// (.claude/) and the Antigravity CLI mirror tree (.agents/), observed live in
// this repo's own agent/skill files. Each group's terms are canonicalized to
// the same placeholder on BOTH sides before diffing (not substituted
// one-directionally), so a bare English verb like "Read ONLY the target
// file." that neither tree translates does not read as false drift, while an
// actual tool-name swap (`Edit` -> `replace_file_content`) still collapses to
// the same placeholder on both sides. Anything left different after this is
// real residue. Placeholders use an `@@NAME@@` shape (not bare whitespace)
// so they cannot be confused with, or silently mangled into, ordinary
// spacing when the file is edited.
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

function diffLines(claudeText, agentsText) {
  const claudeLines = canonicalize(claudeText).split(/\r\n|\n/);
  const agentsLines = canonicalize(agentsText).split(/\r\n|\n/);
  const max = Math.max(claudeLines.length, agentsLines.length);
  const diffs = [];
  for (let i = 0; i < max; i++) {
    const a = claudeLines[i] ?? '(no line)';
    const b = agentsLines[i] ?? '(no line)';
    if (a !== b) {
      diffs.push({ line: i + 1, claude: a, agents: b });
    }
  }
  return diffs;
}

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

// Pre-existing, individually reviewed residue this repo's Architect audit
// already classified as legitimate (the .agents side names an additional
// native tool alongside the substituted one, or a minor backtick-formatting
// difference) — not a substitution-table gap, and not new drift introduced
// by any batch that runs this script. Keyed by pair slug + a stable text
// anchor (a substring of the .claude side's CANONICALIZED line) rather than
// an absolute line number, so an unrelated edit that shifts line numbers
// elsewhere in the file does not turn this into a false "new drift" report,
// and a genuinely new diff that happens to land on the same line number
// still fails (the anchor text has to match, not just the position).
const KNOWN_LEGITIMATE_RESIDUE = [
  { kind: 'agent', slug: 'core-developer', claudeAnchor: 'No Full-File Overwrites' },
  {
    kind: 'skill',
    slug: 'project-memory-keeper',
    claudeAnchor: 'Use the `@@EDIT@@` tool to update the sections',
  },
  {
    kind: 'skill',
    slug: 'project-memory-keeper',
    claudeAnchor: 'Did not use `@@EDIT@@` for targeted update',
  },
];

function isKnownResidue(pair, claudeLine) {
  return KNOWN_LEGITIMATE_RESIDUE.some(
    (r) => r.kind === pair.kind && r.slug === pair.slug && claudeLine.includes(r.claudeAnchor),
  );
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

  const claudeText = readFileSync(pair.claudePath, 'utf8');
  const agentsText = readFileSync(pair.agentsPath, 'utf8');
  const diffs = diffLines(claudeText, agentsText);
  const newDiffs = diffs.filter((d) => !isKnownResidue(pair, d.claude));
  knownResidueCount += diffs.length - newDiffs.length;

  if (newDiffs.length > 0) {
    realDriftCount += newDiffs.length;
    report.push(`[DRIFT] ${pair.kind} "${pair.slug}" (${pair.claudePath} vs ${pair.agentsPath}):`);
    for (const d of newDiffs) {
      report.push(`  line ${d.line}:`);
      report.push(`    .claude (canonicalized): ${d.claude}`);
      report.push(`    .agents  (canonicalized): ${d.agents}`);
    }
  }
}

if (realDriftCount > 0) {
  console.error(
    `[check-mirror-parity] ${realDriftCount} new drift line(s) found across ${pairs.length} pair(s) (${knownResidueCount} known-legitimate line(s) excluded):`,
  );
  console.error(report.join('\n'));
  process.exit(1);
} else {
  console.log(
    `[check-mirror-parity] OK - ${pairs.length} agent/skill pair(s) checked, 0 new drift (${knownResidueCount} known-legitimate line(s) excluded).`,
  );
  process.exit(0);
}
