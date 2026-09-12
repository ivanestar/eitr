// Template for scripts/assistant-check.mjs. create-if-absent.
//
// The test conditions a person does not review one by one - limits and required fields the markup
// declares, the malformed and hostile input checklist, the generator's combinations of valid values -
// are checked by the assistant instead: kept, or cut with the reason they do not apply to this
// application. The person reviews what only the domain can confirm and keeps a veto over each page's
// assistant-checked conditions in the review file.
//
// Why a script: which conditions the assistant may decide on is a fact the generator already wrote
// (`reviewer`), and a model left to pick them would sooner or later approve a business rule in a
// person's place. Recording through here, a decision on a person's condition is refused; a cut without
// a reason is refused; nothing is decided twice.
export function renderAssistantCheck(): string {
  return `#!/usr/bin/env node

/**
 * The assistant's check of the test conditions that need no person. Zero model involvement in this
 * file: it lists, and it records what the assistant decided.
 *
 * Usage:
 *   node scripts/assistant-check.mjs list [--route=<routeId>]
 *   node scripts/assistant-check.mjs record --file=<decisions.json>
 *
 * decisions.json: { "keep": [{ "route": "<routeId>", "id": "<conditionId>" }],
 *                   "cut":  [{ "route": "<routeId>", "id": "<conditionId>", "reason": "<why it does not apply here>" }] }
 *
 * Prints { status: 'LIST', pending, pages: [...] } or { status: 'RECORDED', kept, cut, pending }, or
 * { status: 'FAILED', errors: [...] } with nothing written.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const REPORT_PATH = path.join(CWD, 'artifacts', 'analysis', 'test-conditions.json');
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
const API_CONTRACTS_PATH = path.join(CWD, 'artifacts', 'site-map', 'api-contracts.json');

function argValue(name) {
  const prefix = '--' + name + '=';
  const found = process.argv.slice(3).find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function emit(payload, code) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\\n');
  if (code) process.exit(code);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\\uFEFF/, ''));
  } catch {
    return null;
  }
}

// Undecided: the assistant's to check, not cut by anyone, not approved yet.
function undecided(condition) {
  return condition && condition.reviewer === 'assistant' && condition.cut !== true && condition.reviewed !== true;
}

function list(data) {
  const siteMap = readJson(SITE_MAP_PATH) || {};
  const pathOf = {};
  const titleOf = {};
  for (const [routePath, route] of Object.entries(siteMap.routes || {})) {
    if (!route || typeof route.routeId !== 'string') continue;
    pathOf[route.routeId] = routePath;
    titleOf[route.routeId] = route.title || '';
  }
  // Facts the relevance of a check turns on: whether the page sends anything to a server at all.
  const contracts = readJson(API_CONTRACTS_PATH);
  const callingApi = new Set();
  for (const contract of contracts && Array.isArray(contracts.contracts) ? contracts.contracts : []) {
    for (const routeId of Array.isArray(contract.observedFromRouteIds) ? contract.observedFromRouteIds : []) callingApi.add(routeId);
  }
  const only = argValue('route');
  const pages = [];
  let pending = 0;
  for (const [routeId, entry] of Object.entries(data.routes || {})) {
    if (only && routeId !== only) continue;
    const conditions = (entry && Array.isArray(entry.conditions) ? entry.conditions : []).filter(undecided);
    if (conditions.length === 0) continue;
    pending += conditions.length;
    pages.push({
      routeId: routeId,
      path: pathOf[routeId] || routeId,
      title: titleOf[routeId] || '',
      callsApi: callingApi.has(routeId),
      fields: (Array.isArray(entry.parameters) ? entry.parameters : []).map(function (p) {
        return { name: p.name, kind: p.kind, control: p.control || null };
      }),
      conditions: conditions.map(function (c) {
        return {
          id: c.conditionId,
          technique: c.technique,
          layer: c.layer,
          description: c.description,
          expectedOutcome: c.expectedOutcome,
          priority: c.priority || null,
        };
      }),
    });
  }
  emit({
    status: 'LIST',
    pending: pending,
    pages: pages,
    next:
      pending === 0
        ? 'Nothing is waiting for your check.'
        : 'For each condition decide whether it applies to this application - never whether the page passes it - and record: node scripts/assistant-check.mjs record --file=<decisions.json>. Cut only with a reason a person would accept: a SQL injection on a page that sends nothing to a server, a long value in a field whose maxlength already stops it, a combination the page treats identically.',
  });
}

function record(data) {
  const file = argValue('file');
  const decisions = file ? readJson(path.resolve(CWD, file)) : null;
  if (!decisions || typeof decisions !== 'object') emit({ status: 'FAILED', errors: ['pass --file=<decisions.json> holding { keep: [...], cut: [...] }'] }, 1);
  const errors = [];
  const byKey = new Map();
  for (const [routeId, entry] of Object.entries(data.routes || {})) {
    for (const condition of entry && Array.isArray(entry.conditions) ? entry.conditions : []) {
      if (condition && condition.conditionId) byKey.set(routeId + '|' + condition.conditionId, condition);
    }
  }
  const find = function (item, where) {
    const condition = item && byKey.get(item.route + '|' + item.id);
    if (!condition) {
      errors.push(where + ': no condition ' + (item && item.id) + ' on route ' + (item && item.route) + '.');
      return null;
    }
    if (condition.reviewer !== 'assistant') {
      errors.push(where + ': ' + item.id + ' is a person\\'s to review - it rests on a business rule or was written by the analysis.');
      return null;
    }
    if (!undecided(condition)) {
      errors.push(where + ': ' + item.id + ' is already decided - approved, or cut by someone.');
      return null;
    }
    return condition;
  };
  const keep = [];
  const cut = [];
  (Array.isArray(decisions.keep) ? decisions.keep : []).forEach(function (item, i) {
    const condition = find(item, 'keep[' + i + ']');
    if (condition) keep.push(condition);
  });
  (Array.isArray(decisions.cut) ? decisions.cut : []).forEach(function (item, i) {
    const condition = find(item, 'cut[' + i + ']');
    if (!condition) return;
    if (typeof item.reason !== 'string' || item.reason.trim().length < 10) {
      errors.push('cut[' + i + ']: say why ' + item.id + ' does not apply to this application - a person reads the reason at the review.');
      return;
    }
    cut.push({ condition: condition, reason: item.reason.trim() });
  });
  if (errors.length > 0) emit({ status: 'FAILED', errors: errors }, 1);
  for (const condition of keep) {
    condition.reviewed = true;
    condition.reviewedBy = 'assistant';
    condition.isSpeculative = false;
  }
  for (const item of cut) {
    item.condition.cut = true;
    item.condition.cutBy = 'assistant';
    item.condition.cutReason = item.reason;
    item.condition.reviewed = false;
    delete item.condition.reviewedBy;
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(data, null, 2) + '\\n', 'utf8');
  let pending = 0;
  for (const condition of byKey.values()) if (undecided(condition)) pending += 1;
  emit({
    status: 'RECORDED',
    kept: keep.length,
    cut: cut.length,
    pending: pending,
    next:
      pending > 0
        ? pending + ' condition(s) still wait for your check: run list again.'
        : 'Every condition that needs no person is checked. Render the review: node scripts/render-review-artifact.mjs --kind=test-conditions.',
  });
}

function main() {
  const command = process.argv[2];
  const data = readJson(REPORT_PATH);
  if (!data || typeof data.routes !== 'object' || data.routes === null) {
    emit({ status: 'FAILED', errors: ['artifacts/analysis/test-conditions.json is missing or has no routes - generate the test conditions first.'] }, 1);
  }
  if (command === 'list') return list(data);
  if (command === 'record') return record(data);
  emit({ status: 'FAILED', errors: ['use list or record'] }, 1);
}

main();
`;
}
