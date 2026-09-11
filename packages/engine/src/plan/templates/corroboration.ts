// Template for scripts/corroboration.mjs - whether what an analysis stage concluded agrees with the
// independent records the project already holds, and a journal of every disagreement and of who
// turned out to be right.
//
// A conclusion in this pipeline usually rests on one reading: "this page works" on a screenshot the
// assistant looked at, "this page is low-risk" on its judgment. The project records other facts about
// the same page anyway - the status the server returned, what the page's own markup carries, the
// calls it made, what each role was allowed to reach. Where those agree with the conclusion it is
// well supported; where they disagree, the disagreement is itself the finding - the conclusion or the
// record is wrong, and someone should look. Two readings of one kind (the markup read twice) say
// little by agreeing, so every reading belongs to a group and a disagreement names the groups.
//
// Nothing here blocks. A disagreement goes to the assistant first and then, if it survives, to the
// person at the review. The journal records how each one was settled, so over many runs it says how
// often each kind of reading was the one that was wrong - which is the only honest way to learn how
// much each is worth.
export function renderCorroboration(): string {
  return `#!/usr/bin/env node

/**
 * Checks what an analysis stage concluded against the independent records this project already
 * holds, and journals every disagreement and how it was settled. Zero model involvement.
 *
 * Usage:
 *   node scripts/corroboration.mjs --stage=site-map
 *   node scripts/corroboration.mjs --stage=feature-map
 *   node scripts/corroboration.mjs report
 *
 * --stage prints { stage, checked, conflicts } and brings the journal up to date. Every conflict names
 * the claim, the page it is about, and what each reading says. 'report' prints, per kind of reading,
 * how often it disagreed with the others and how often it turned out to be right.
 *
 * Also imported by render-review-artifact.mjs (to show the disagreements in the review) and by
 * apply-review.mjs (to record what the person decided).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
const INVENTORY_DIR = path.join(CWD, 'artifacts', 'site-map', 'inventory');
const API_CONTRACTS_PATH = path.join(CWD, 'artifacts', 'site-map', 'api-contracts.json');
const FEATURE_MAP_PATH = path.join(CWD, 'artifacts', 'analysis', 'feature-map.json');
const JOURNAL_PATH = path.join(CWD, 'artifacts', 'analysis', 'sensor-journal.jsonl');

// Every kind of reading, and the group it belongs to. Readings in one group come from the same place
// and agreeing with each other proves little; readings from different groups are independent.
export const SENSORS = {
  server: { group: 'server', label: 'Server' },
  roles: { group: 'server', label: 'Roles' },
  page: { group: 'page', label: 'Page markup' },
  triage: { group: 'page', label: 'Markup check' },
  fields: { group: 'page', label: 'Fields' },
  record: { group: 'page', label: 'Recorded page' },
  screen: { group: 'screen', label: 'Screenshot' },
  traffic: { group: 'traffic', label: 'Traffic' },
  judgment: { group: 'assistant', label: 'Assessment' },
};

const WORKS = 'works';
const BROKEN = 'broken';
const TIER_RANK = { low: 1, medium: 2, high: 3 };
const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const INPUT_ROLES = ['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider', 'listbox', 'checkbox', 'radio', 'switch'];
const ACTION_ROLES = ['button', 'link', 'menuitem', 'tab', 'option'];

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\\uFEFF/, ''));
  } catch {
    return null;
  }
}

function sha(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function inventoryOf(routeId) {
  if (typeof routeId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(routeId)) return null;
  return loadJson(path.join(INVENTORY_DIR, routeId + '.json'));
}

function routesByPath(siteMap) {
  return siteMap && siteMap.routes && typeof siteMap.routes === 'object' ? Object.entries(siteMap.routes) : [];
}

function contractsByRoute() {
  const data = loadJson(API_CONTRACTS_PATH);
  const byRoute = new Map();
  for (const contract of data && Array.isArray(data.contracts) ? data.contracts : []) {
    for (const routeId of Array.isArray(contract.observedFromRouteIds) ? contract.observedFromRouteIds : []) {
      if (!byRoute.has(routeId)) byRoute.set(routeId, []);
      byRoute.get(routeId).push(contract);
    }
  }
  return byRoute;
}

function callName(contract) {
  const operation = contract.operation && contract.operation.name ? ' ' + contract.operation.name : '';
  return String(contract.method || '?').toUpperCase() + ' ' + (contract.pathTemplate || '?') + operation;
}

function visiblePassword(inventory) {
  const controls = inventory && Array.isArray(inventory.controls) ? inventory.controls : [];
  return controls.some(function (control) {
    return control && control.type === 'password' && control.hidden !== true;
  });
}

// ---------------------------------------------------------------------------------------------
// Site map: did the crawl see the page itself, rather than an error, a wall or a refusal?

function serverReading(route) {
  const status = route.httpStatus;
  if (!Number.isInteger(status)) return null;
  if (status >= 200 && status < 300) return { sensor: 'server', says: WORKS, detail: 'answered ' + status };
  if ([401, 403, 404, 410].indexOf(status) !== -1 || status >= 500) {
    return { sensor: 'server', says: BROKEN, detail: 'answered ' + status };
  }
  return null;
}

// The access verdict page-inventory.mjs gave the recorded page. 'stub' - the identical page at two
// addresses - says nothing either way on its own: two addresses can genuinely be one page.
function pageReading(inventory) {
  if (!inventory || !inventory.access || typeof inventory.access.state !== 'string') return null;
  const state = inventory.access.state;
  const controls = Array.isArray(inventory.controls) ? inventory.controls.length : 0;
  if (state === 'ok') return { sensor: 'page', says: WORKS, detail: controls + ' control(s), no block or bot check' };
  if (state === 'challenge') return { sensor: 'page', says: BROKEN, detail: 'a bot check, not the application' };
  if (state === 'refused') return { sensor: 'page', says: BROKEN, detail: 'a near-empty refusal page' };
  return null;
}

const TRIAGE_WORDS = {
  ready: 'the page, ready',
  empty_state: 'the page, with nothing in it yet',
  auth_wall: 'a sign-in wall',
  access_denied: 'an access-denied page',
  error_page: 'an error page',
};

// What the screenshot showed. A sign-in form on a page that carries its own password field is that
// page working, not a wall in front of it - the wall is the same form at an address that should have
// shown something else, which the page's own status and markup then disagree with.
function triageReading(route, inventory) {
  const triage = route.visualTriage;
  if (!triage || typeof triage.state !== 'string' || !(triage.state in TRIAGE_WORDS)) return null;
  const sensor = triage.source === 'heuristic' ? 'triage' : 'screen';
  let says = triage.state === 'ready' || triage.state === 'empty_state' ? WORKS : BROKEN;
  if (triage.state === 'auth_wall' && visiblePassword(inventory) && !(inventory.access && inventory.access.state === 'stub')) {
    says = WORKS;
  }
  return { sensor: sensor, says: says, detail: TRIAGE_WORDS[triage.state] };
}

function trafficReading(calls) {
  if (!calls || calls.length === 0) return null;
  const failed = calls.filter(function (contract) {
    return Number.isInteger(contract.responseStatus) && contract.responseStatus >= 500;
  });
  if (failed.length > 0) {
    return { sensor: 'traffic', says: BROKEN, detail: callName(failed[0]) + ' answered ' + failed[0].responseStatus };
  }
  return { sensor: 'traffic', says: WORKS, detail: calls.length + ' call(s), none failed' };
}

function pageStateReadings(route, inventory, calls) {
  return [serverReading(route), pageReading(inventory), triageReading(route, inventory), trafficReading(calls)].filter(Boolean);
}

function disagree(readings) {
  const values = new Set(
    readings.map(function (reading) {
      return reading.says;
    }),
  );
  return values.has(WORKS) && values.has(BROKEN);
}

function siteMapClaims() {
  const siteMap = loadJson(SITE_MAP_PATH);
  const calls = contractsByRoute();
  const claims = [];
  for (const [routePath, route] of routesByPath(siteMap)) {
    if (!route || typeof route.routeId !== 'string') continue;
    const removed = route.status === 'removed';
    const readings = removed ? [] : pageStateReadings(route, inventoryOf(route.routeId), calls.get(route.routeId));
    claims.push({
      claim: 'page-state',
      subject: { routeId: route.routeId, path: routePath },
      readings: readings,
      // What everything agrees on, once it does - a removed route is one nobody can reach.
      settled: removed ? BROKEN : readings.length > 0 && !disagree(readings) ? readings[0].says : null,
      conflict: !removed && readings.length >= 2 && disagree(readings),
      reviewedByHuman: false,
    });
  }
  return claims;
}

// ---------------------------------------------------------------------------------------------
// Feature map: how much a page matters, and whether the evidence quoted for it is on the page.

function isMutating(contract) {
  const operation = contract.operation;
  if (operation && operation.style === 'graphql') return operation.documentType === 'mutation';
  if (operation && operation.style && operation.style !== 'rest') return false;
  return MUTATING_METHODS.indexOf(String(contract.method || '').toUpperCase()) !== -1;
}

// What the independent records say a page's criticality has to be at least. A page that changes data
// or handles a password is never low; one some roles reach and others do not is a permission boundary
// and is high.
function criticalityFloor(routeId, route, inventory, calls) {
  const readings = [];
  const mutating = (calls || []).filter(isMutating);
  if (mutating.length > 0) {
    readings.push({
      sensor: 'traffic',
      says: 'medium',
      detail: 'changes data: ' + mutating.slice(0, 2).map(callName).join(', ') + (mutating.length > 2 ? ' and ' + (mutating.length - 2) + ' more' : ''),
    });
  }
  if (visiblePassword(inventory)) readings.push({ sensor: 'fields', says: 'medium', detail: 'has a password field' });
  const access = route && route.access && typeof route.access === 'object' ? Object.entries(route.access) : [];
  const reached = access.filter(function (pair) {
    return pair[1] && pair[1].reachable === true;
  });
  const refused = access.filter(function (pair) {
    return pair[1] && pair[1].reachable === false;
  });
  if (reached.length > 0 && refused.length > 0) {
    readings.push({
      sensor: 'roles',
      says: 'high',
      detail:
        'reachable as ' +
        reached.map((pair) => pair[0]).join(', ') +
        ', not as ' +
        refused.map((pair) => pair[0]).join(', '),
    });
  }
  return readings;
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\\[redacted\\]/g, '#')
    .replace(/\\d+/g, '#')
    .replace(/[^\\p{L}\\p{N}#{}\\/_-]+/gu, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function fragmentsOf(excerpt) {
  const quoted = String(excerpt).match(/["\\u201c\\u201d]([^"\\u201c\\u201d]+)["\\u201c\\u201d]/g);
  const pieces = quoted
    ? quoted.map(function (piece) {
        return piece.slice(1, -1);
      })
    : String(excerpt).split(/->|;|,|\\|/);
  const out = pieces.map(normalize).filter(function (piece) {
    return piece.length >= 3;
  });
  return out.length > 0 ? out : [normalize(excerpt)];
}

// Where on the recorded page a quote of each kind has to be found. null means this project records
// nothing to check that kind against, which is not the same as the quote being wrong.
function haystackFor(signal, routePath, route, inventory, calls) {
  const controls = inventory && Array.isArray(inventory.controls) ? inventory.controls : [];
  const texts = function (list) {
    const out = [];
    for (const control of list) {
      for (const key of ['name', 'placeholder', 'hint', 'group']) {
        if (typeof control[key] === 'string' && control[key]) out.push(control[key]);
      }
    }
    return out;
  };
  if (signal === 'heading-text') {
    if (!inventory || !Array.isArray(inventory.headings)) return null;
    return inventory.headings
      .map(function (heading) {
        return heading.text;
      })
      .concat([inventory.title || '', route && route.title ? route.title : '']);
  }
  if (signal === 'form-labels') {
    if (!inventory) return null;
    return texts(
      controls.filter(function (control) {
        return INPUT_ROLES.indexOf(control.role) !== -1 || ['input', 'select', 'textarea'].indexOf(control.tag) !== -1;
      }),
    );
  }
  if (signal === 'button-link-text') {
    if (!inventory) return null;
    return texts(
      controls.filter(function (control) {
        return ACTION_ROLES.indexOf(control.role) !== -1;
      }),
    );
  }
  if (signal === 'aria-roles') {
    if (!inventory) return null;
    const landmarks = Array.isArray(inventory.landmarks) ? inventory.landmarks : [];
    return texts(controls)
      .concat(
        controls.map(function (control) {
          return control.role + ' ' + (control.name || '');
        }),
      )
      .concat(
        landmarks.map(function (landmark) {
          return (landmark.region || '') + ' ' + (landmark.name || '');
        }),
      );
  }
  if (signal === 'route-path' || signal === 'route-convention') {
    return [routePath].concat(route && Array.isArray(route.sampleUrls) ? route.sampleUrls : []);
  }
  if (signal === 'api-resource') {
    if (!calls || calls.length === 0) return null;
    return calls.map(callName).concat(
      calls.map(function (contract) {
        return contract.pathTemplate || '';
      }),
    );
  }
  if (signal === 'api-payload-field') {
    if (!calls || calls.length === 0) return null;
    const fields = [];
    for (const contract of calls) {
      for (const source of [contract.sampleRequestPayload, contract.responseShape]) {
        if (source && typeof source === 'object') fields.push.apply(fields, Object.keys(source));
      }
    }
    return fields;
  }
  return null;
}

export function quoteFound(excerpt, haystack) {
  const items = haystack.map(normalize).filter(Boolean);
  return fragmentsOf(excerpt).some(function (fragment) {
    return items.some(function (item) {
      return item.indexOf(fragment) !== -1 || (item.length >= 3 && fragment.indexOf(item) !== -1);
    });
  });
}

function featureMapClaims() {
  const featureMap = loadJson(FEATURE_MAP_PATH);
  const siteMap = loadJson(SITE_MAP_PATH);
  const calls = contractsByRoute();
  const routeById = new Map();
  for (const [routePath, route] of routesByPath(siteMap)) {
    if (route && typeof route.routeId === 'string') routeById.set(route.routeId, { path: routePath, route: route });
  }
  const claims = [];
  const intents = featureMap && featureMap.routes && typeof featureMap.routes === 'object' ? Object.values(featureMap.routes) : [];
  for (const intent of intents) {
    if (!intent || typeof intent.routeId !== 'string' || !intent.criticality) continue;
    const found = routeById.get(intent.routeId) || { path: intent.routeId, route: null };
    const inventory = inventoryOf(intent.routeId);
    const routeCalls = calls.get(intent.routeId) || [];
    const tier = String(intent.criticality.value);
    const reviewedByHuman = intent.reviewed === true && intent.reviewedBy === 'human';
    const floor = criticalityFloor(intent.routeId, found.route, inventory, routeCalls);
    const judgment = { sensor: 'judgment', says: tier, detail: 'rated ' + tier.toUpperCase() };
    const below = floor.filter(function (reading) {
      return (TIER_RANK[tier] || 0) < TIER_RANK[reading.says];
    });
    claims.push({
      claim: 'criticality',
      subject: { routeId: intent.routeId, path: found.path },
      readings: [judgment].concat(floor),
      conflict: below.length > 0,
      dissent: below.map(function (reading) {
        return reading.sensor;
      }),
      reviewedByHuman: reviewedByHuman,
    });

    const evidence = Array.isArray(intent.criticality.evidence) ? intent.criticality.evidence : [];
    for (const item of evidence) {
      if (!item || typeof item.excerpt !== 'string') continue;
      const haystack = haystackFor(item.signal, found.path, found.route, inventory, routeCalls);
      if (haystack === null) continue;
      const onPage = quoteFound(item.excerpt, haystack);
      claims.push({
        claim: 'evidence',
        subject: { routeId: intent.routeId, path: found.path, signal: item.signal, excerpt: item.excerpt },
        readings: [
          { sensor: 'judgment', says: 'on the page', detail: item.signal + ': "' + item.excerpt + '"' },
          { sensor: 'record', says: onPage ? 'on the page' : 'not on the page', detail: onPage ? 'found on the recorded page' : 'not found on the recorded page' },
        ],
        conflict: !onPage,
        dissent: onPage ? [] : ['record'],
        reviewedByHuman: reviewedByHuman,
      });
    }
  }
  return claims;
}

// ---------------------------------------------------------------------------------------------

function subjectKey(stage, claim) {
  const subject = claim.subject;
  return [stage, claim.claim, subject.routeId, subject.signal || '', subject.excerpt ? normalize(subject.excerpt) : ''].join('|');
}

function signatureOf(readings) {
  return sha(
    readings
      .map(function (reading) {
        return reading.sensor + '=' + reading.says;
      })
      .sort()
      .join(';'),
  );
}

export function claimsFor(stage) {
  if (stage === 'site-map') return siteMapClaims();
  if (stage === 'feature-map') return featureMapClaims();
  return [];
}

function describe(claim) {
  if (claim.claim === 'page-state') {
    return (
      'The records disagree on whether the crawl saw the page itself: ' +
      claim.readings
        .map(function (reading) {
          return SENSORS[reading.sensor].label + ' - ' + reading.detail + ' (' + reading.says + ')';
        })
        .join('; ') +
      '.'
    );
  }
  if (claim.claim === 'criticality') {
    const dissent = new Set(claim.dissent || []);
    return (
      'Rated ' +
      String(claim.readings[0].says).toUpperCase() +
      ', but ' +
      claim.readings
        .filter(function (reading) {
          return dissent.has(reading.sensor);
        })
        .map(function (reading) {
          return reading.detail + ' (' + reading.says + ' at least)';
        })
        .join('; ') +
      '.'
    );
  }
  return 'Quoted as ' + claim.subject.signal + ' "' + claim.subject.excerpt + '", but the recorded page has no such text.';
}

export function conflictsFor(stage) {
  return claimsFor(stage)
    .filter(function (claim) {
      return claim.conflict;
    })
    .map(function (claim) {
      return {
        id: sha(subjectKey(stage, claim)),
        stage: stage,
        claim: claim.claim,
        subject: claim.subject,
        readings: claim.readings,
        message: describe(claim),
      };
    });
}

// ---------------------------------------------------------------------------------------------
// The journal: one line per disagreement when it is first seen, one line when it is settled.

function readJournal() {
  if (!fs.existsSync(JOURNAL_PATH)) return [];
  const events = [];
  for (const line of fs.readFileSync(JOURNAL_PATH, 'utf8').split('\\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // A torn last line from an interrupted write is skipped, never fatal.
    }
  }
  return events;
}

function append(events) {
  if (events.length === 0) return;
  fs.mkdirSync(path.dirname(JOURNAL_PATH), { recursive: true });
  fs.appendFileSync(
    JOURNAL_PATH,
    events
      .map(function (event) {
        return JSON.stringify(event);
      })
      .join('\\n') + '\\n',
    'utf8',
  );
}

function openEvents(events, stage) {
  const byId = new Map();
  for (const event of events) {
    if (event.stage !== stage) continue;
    if (event.event === 'conflict') byId.set(event.id, { conflict: event, resolved: null });
    else if (event.event === 'resolved' && byId.has(event.id)) byId.get(event.id).resolved = event;
  }
  return byId;
}

function groupOf(sensor) {
  return SENSORS[sensor] ? SENSORS[sensor].group : sensor;
}

function resolution(id, stage, by, outcome, right, wrong, note) {
  const event = {
    event: 'resolved',
    id: id,
    stage: stage,
    at: new Date().toISOString(),
    by: by,
    outcome: outcome,
    right: right,
    wrong: wrong,
  };
  if (note) event.note = note;
  return event;
}

// Who was right, once a disagreement is gone: the readings whose old answer is what everything now
// agrees on. For a rating or a quote it is simpler - the assessment changed, so the records that
// disagreed with it were right and the assessment was not.
function sidesOnceSettled(conflict, claim) {
  const readings = conflict.readings || [];
  if (conflict.claim === 'criticality' || conflict.claim === 'evidence') {
    return { right: (conflict.dissent || []).slice(), wrong: ['judgment'] };
  }
  const settled = claim ? claim.settled : null;
  if (!settled) return { right: [], wrong: [] };
  return {
    right: readings.filter((r) => r.says === settled).map((r) => r.sensor),
    wrong: readings.filter((r) => r.says !== settled).map((r) => r.sensor),
  };
}

// Brings the journal in line with what is true now: a new disagreement is opened, one that has gone
// is settled in favour of whichever readings the change agreed with, and one a person approved
// without changing anything is settled as kept. Never throws - the journal is a record kept on the
// side, and a failure to write it must not stop the stage it describes.
export function syncJournal(stage) {
  try {
    const claims = claimsFor(stage);
    const events = readJournal();
    const known = openEvents(events, stage);
    const pending = [];
    const current = new Map();
    for (const claim of claims) current.set(sha(subjectKey(stage, claim)), claim);

    for (const [id, claim] of current) {
      if (!claim.conflict) continue;
      const entry = known.get(id);
      const signature = signatureOf(claim.readings);
      // Settled and unchanged since: the person already looked at exactly this and decided.
      if (entry && entry.resolved && entry.resolved.signature === signature) continue;
      if (entry && !entry.resolved) {
        // Approved by a person with the disagreement in front of them: the assessment stands and the
        // records that argued against it were wrong this time. An approval given before the
        // disagreement existed says nothing about it, so it settles nothing.
        if (claim.reviewedByHuman && entry.conflict.reviewedWhenOpened !== true) {
          const event = resolution(id, stage, 'human', 'kept', ['judgment'], (claim.dissent || []).slice());
          event.signature = signature;
          pending.push(event);
        }
        continue;
      }
      pending.push({
        event: 'conflict',
        id: id,
        stage: stage,
        at: new Date().toISOString(),
        claim: claim.claim,
        subject: claim.subject,
        readings: claim.readings.map(function (reading) {
          return { sensor: reading.sensor, group: groupOf(reading.sensor), says: reading.says, detail: reading.detail };
        }),
        dissent: claim.dissent || [],
        signature: signature,
        reviewedWhenOpened: claim.reviewedByHuman === true,
      });
    }

    for (const [id, entry] of known) {
      if (entry.resolved) continue;
      const claim = current.get(id);
      if (claim && claim.conflict) continue;
      const sides = sidesOnceSettled(entry.conflict, claim);
      // A changed quote is a different claim, so who changed it is read off the page it was about.
      const about =
        claim ||
        claims.find(function (other) {
          return other.subject.routeId === (entry.conflict.subject || {}).routeId;
        });
      const by = about && about.reviewedByHuman && entry.conflict.reviewedWhenOpened !== true ? 'human' : 'assistant';
      pending.push(resolution(id, stage, by, 'changed', sides.right, sides.wrong));
    }
    append(pending);
    return { written: pending.length };
  } catch (err) {
    return { written: 0, warning: 'The sensor journal could not be updated: ' + (err && err.message ? err.message : String(err)) };
  }
}

// A person's own verdict on a disagreement: the readings that said the same are right, the rest are
// not. The same disagreement is not reopened until its readings change; a person who changes their
// verdict reopens it and settles it again, so both answers stay on record.
export function recordVerdict(stage, conflictId, verdict, note) {
  try {
    const entry = openEvents(readJournal(), stage).get(conflictId);
    if (!entry) return { written: 0 };
    if (entry.resolved && entry.resolved.verdict === verdict) return { written: 0 };
    const events = [];
    if (entry.resolved) events.push(Object.assign({}, entry.conflict, { at: new Date().toISOString() }));
    const readings = entry.conflict.readings || [];
    const event = resolution(
      conflictId,
      stage,
      'human',
      'verdict',
      readings.filter((r) => r.says === verdict).map((r) => r.sensor),
      readings.filter((r) => r.says !== verdict).map((r) => r.sensor),
      note,
    );
    event.verdict = verdict;
    event.signature = entry.conflict.signature;
    events.push(event);
    append(events);
    return { written: events.length };
  } catch (err) {
    return { written: 0, warning: 'The sensor journal could not be updated: ' + (err && err.message ? err.message : String(err)) };
  }
}

// The verdicts people have already given on disagreements that still stand, so a fresh rendering
// shows them where they were written.
export function recordedVerdicts(stage) {
  const verdicts = new Map();
  try {
    for (const [id, entry] of openEvents(readJournal(), stage)) {
      if (entry.resolved && entry.resolved.outcome === 'verdict') verdicts.set(id, entry.resolved.verdict);
    }
  } catch {
    // An unreadable journal shows no verdicts; the disagreements themselves still render.
  }
  return verdicts;
}

export function report() {
  const events = readJournal();
  const bySensor = {};
  const touch = function (sensor) {
    if (!bySensor[sensor]) bySensor[sensor] = { sensor: sensor, group: groupOf(sensor), disagreements: 0, right: 0, wrong: 0, open: 0 };
    return bySensor[sensor];
  };
  // Pair every conflict with the first resolution after it.
  const open = new Map();
  let total = 0;
  let settled = 0;
  for (const event of events) {
    if (event.event === 'conflict') {
      total++;
      open.set(event.id, event);
      for (const reading of event.readings || []) touch(reading.sensor).disagreements++;
    } else if (event.event === 'resolved' && open.has(event.id)) {
      settled++;
      open.delete(event.id);
      for (const sensor of event.right || []) touch(sensor).right++;
      for (const sensor of event.wrong || []) touch(sensor).wrong++;
    }
  }
  for (const event of open.values()) {
    for (const reading of event.readings || []) touch(reading.sensor).open++;
  }
  const sensors = Object.values(bySensor)
    .map(function (row) {
      const decided = row.right + row.wrong;
      row.rightRate = decided > 0 ? Math.round((row.right / decided) * 100) / 100 : null;
      return row;
    })
    .sort(function (a, b) {
      return b.disagreements - a.disagreements || a.sensor.localeCompare(b.sensor);
    });
  return {
    action: 'report',
    journal: path.relative(CWD, JOURNAL_PATH).split(path.sep).join('/'),
    disagreements: total,
    settled: settled,
    open: open.size,
    sensors: sensors,
  };
}

function argValue(name) {
  const prefix = '--' + name + '=';
  const found = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function main() {
  if (process.argv[2] === 'report') {
    process.stdout.write(JSON.stringify(report(), null, 2) + '\\n');
    return;
  }
  const stage = argValue('stage');
  if (stage !== 'site-map' && stage !== 'feature-map') {
    process.stdout.write(JSON.stringify({ ok: false, error: 'pass --stage=site-map or --stage=feature-map, or "report"' }, null, 2) + '\\n');
    process.exit(1);
  }
  const claims = claimsFor(stage);
  const conflicts = conflictsFor(stage);
  const journal = syncJournal(stage);
  process.stdout.write(
    JSON.stringify(
      {
        action: 'check',
        stage: stage,
        checked: claims.length,
        conflicts: conflicts,
        journal: journal,
        next:
          conflicts.length === 0
            ? 'Nothing disagrees - carry on.'
            : 'Look at each one before the review: correct whatever was recorded or judged wrong and run this again. What still disagrees is shown to the person in the review, both sides named.',
      },
      null,
      2,
    ) + '\\n',
  );
}

// Imported by the review scripts as a module, run by the assistant as a command.
function invokedDirectly() {
  if (!process.argv[1]) return false;
  const self = fileURLToPath(import.meta.url);
  const called = path.resolve(process.argv[1]);
  return process.platform === 'win32' ? self.toLowerCase() === called.toLowerCase() : self === called;
}

if (invokedDirectly()) main();
`;
}
