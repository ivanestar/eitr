// Template for scripts/render-review-artifact.mjs - renders a stage's review artifact from its own
// JSON, and decides deterministically whether it is small enough to print into the chat or big
// enough to belong in a file the human can actually read.
//
// Two problems this fixes, both live-observed. First, a 46-route run printed its review as one
// unbroken wall of text and the assistant "summarized" the tail as "(and similarly for the other 29
// exercises...)" - the human never saw 29 routes they were being asked to approve. Second, any
// summary an assistant composes from an artifact is a paraphrase, so what the human reviews and what
// the pipeline stored can silently disagree; rendering from the JSON in code makes that class of
// drift impossible.
//
// The threshold is a UX judgment, stated once here rather than left to per-run improvisation: a
// feature block is 5-6 terminal lines, so ~10 entries is where a review stops fitting on one
// screen and starts scrolling past the top of the window.
export function renderReviewArtifactRenderer(): string {
  return `#!/usr/bin/env node

/**
 * Renders a pipeline stage's review artifact deterministically from its own JSON - zero model
 * involvement, so what the human reviews is exactly what was stored.
 *
 * Usage:
 *   node scripts/render-review-artifact.mjs --kind=site-map
 *   node scripts/render-review-artifact.mjs --kind=feature-map
 *   node scripts/render-review-artifact.mjs --kind=test-conditions [--threshold=10]
 *   node scripts/render-review-artifact.mjs --kind=test-cases
 *   node scripts/render-review-artifact.mjs --kind=<kind> --discard   (after sign-off)
 *
 * Prints JSON: { kind, entryCount, threshold, mode, filePath, summary, markdown }.
 *   mode 'inline' - 'markdown' holds the whole artifact; print it as-is.
 *   mode 'file'   - the artifact was written to 'filePath'; print 'summary' and that path instead.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
// The crawl's own state, read for the list of links it refused. Absent on a project whose map was
// written by something other than a crawl, which the renderer treats as "nothing to show" rather
// than an error.
const CRAWL_BUDGET_PATH = path.join(CWD, 'artifacts', 'site-map', '.crawl-budget.json');
const APP_PROFILE_PATH = path.join(CWD, 'artifacts', 'analysis', 'app-profile.json');
const FEATURE_MAP_PATH = path.join(CWD, 'artifacts', 'analysis', 'feature-map.json');
const TEST_CONDITIONS_PATH = path.join(CWD, 'artifacts', 'analysis', 'test-conditions.json');
const INVENTORY_DIR = path.join(CWD, 'artifacts', 'site-map', 'inventory');
const TEST_CASES_PATH = path.join(CWD, 'artifacts', 'test-cases', 'test-cases.json');
const REVIEW_DIR = path.join(CWD, 'artifacts', 'review');
const DEFAULT_THRESHOLD = 10;

function argValue(name) {
  const prefix = '--' + name + '=';
  const found = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function fail(message) {
  process.stderr.write('[render-review-artifact] ' + message + '\\n');
  process.exit(1);
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// Every artifact in this pipeline keys by routeId, and a raw routeId means nothing to a human -
// resolve it to the path/title the site map already records, exactly once, here.
function buildRouteLabels(siteMap) {
  const labels = new Map();
  if (!siteMap || !siteMap.routes || typeof siteMap.routes !== 'object') return labels;
  for (const [routePath, entry] of Object.entries(siteMap.routes)) {
    if (!entry || typeof entry.routeId !== 'string') continue;
    const title = typeof entry.title === 'string' && entry.title ? entry.title : null;
    labels.set(entry.routeId, {
      path: routePath,
      title,
      label: title ? routePath + ' - ' + title : routePath,
      flags:
        entry.visualTriage && Array.isArray(entry.visualTriage.flags) ? entry.visualTriage.flags : [],
    });
  }
  return labels;
}

function labelFor(labels, routeId) {
  const found = labels.get(routeId);
  return found ? found.label : '(route ' + routeId + ' is not in the site map)';
}

function fieldValue(field) {
  return field && typeof field === 'object' && 'value' in field ? field.value : undefined;
}

function dedupedEvidence(fields) {
  const seen = new Set();
  const excerpts = [];
  for (const field of fields) {
    const entries = field && Array.isArray(field.evidence) ? field.evidence : [];
    for (const item of entries) {
      if (!item || typeof item.excerpt !== 'string') continue;
      const key = (item.signal || '') + '\\u0000' + item.excerpt;
      if (seen.has(key)) continue;
      seen.add(key);
      excerpts.push(item.excerpt);
    }
  }
  return excerpts;
}

// A constraint stores partition ids, which are internal identifiers - a human reads the partition's
// own first sample value instead ('shippingMethod="Express"', not 'shippingMethod=part_3').
function sampleFor(entry, paramName, partitionId) {
  const parameters = Array.isArray(entry.parameters) ? entry.parameters : [];
  for (const parameter of parameters) {
    if (!parameter || parameter.name !== paramName) continue;
    const partitions = Array.isArray(parameter.partitions) ? parameter.partitions : [];
    for (const partition of partitions) {
      if (!partition || partition.id !== partitionId) continue;
      const samples = Array.isArray(partition.sampleValues) ? partition.sampleValues : [];
      if (samples.length > 0) return '"' + samples[0] + '"';
      return partitionId;
    }
  }
  return partitionId;
}

// How a person recognises a control the analysis cites by id: its role and label, or where it sits
// when it has no label.
function controlLabel(control) {
  if (!control) return '';
  if (control.name) return control.role + ' "' + control.name + '"';
  return control.role + (control.hint ? ' next to "' + control.hint + '"' : ' with no label');
}

function renderTestConditions(labels, data) {
  const routes = data && data.routes && typeof data.routes === 'object' ? data.routes : {};
  const entries = Object.values(routes).filter(Boolean);
  entries.sort(function (a, b) {
    return labelFor(labels, a.routeId).localeCompare(labelFor(labels, b.routeId));
  });

  const lines = [];
  // The site frame's own fields are left out of every page on purpose, so say where they went
  // rather than let a reader conclude the language switcher is simply untested by accident.
  const shared = loadJson(path.join(INVENTORY_DIR, 'shared.json'));
  const frameFields = [];
  for (const widget of shared && Array.isArray(shared.widgets) ? shared.widgets : []) {
    for (const control of Array.isArray(widget.controls) ? widget.controls : []) {
      if (['input', 'select', 'textarea'].indexOf(control.tag) !== -1) {
        frameFields.push(widget.name + ': ' + controlLabel(control));
      }
    }
  }
  if (frameFields.length > 0) {
    lines.push('Site frame fields are not part of any page below: ' + frameFields.join('; '));
    lines.push('');
  }
  let conditionCount = 0;
  const techniqueCounts = {};
  let unsatisfiedTotal = 0;

  for (const entry of entries) {
    lines.push('**' + labelFor(labels, entry.routeId) + '**');
    const constraints = Array.isArray(entry.constraints) ? entry.constraints : [];
    if (constraints.length > 0) {
      lines.push(
        'Constraints: ' +
          constraints
            .map(function (rule) {
              return (
                rule.ifParam +
                '=' +
                sampleFor(entry, rule.ifParam, rule.ifPartition) +
                ' excludes ' +
                rule.thenParam +
                '=' +
                sampleFor(entry, rule.thenParam, rule.thenExcludesPartition)
              );
            })
            .join('; '),
      );
    }
    const conditions = Array.isArray(entry.conditions) ? entry.conditions : [];
    conditions.forEach(function (condition, index) {
      conditionCount += 1;
      const technique = condition.technique || 'unspecified';
      techniqueCounts[technique] = (techniqueCounts[technique] || 0) + 1;
      lines.push(
        '' + (index + 1) + '. ' + (condition.description || '(no description)') + '  [' + technique + ']',
      );
    });
    const unsatisfied = Array.isArray(entry.unsatisfiedPairs) ? entry.unsatisfiedPairs.length : 0;
    unsatisfiedTotal += unsatisfied;
    if (unsatisfied > 0) lines.push('Unsatisfied pairs: ' + unsatisfied);
    // A field left out is a decision a person should see and be able to overturn.
    const excluded = Array.isArray(entry.excluded) ? entry.excluded : [];
    if (excluded.length > 0) {
      const inventory = loadJson(path.join(INVENTORY_DIR, entry.routeId + '.json'));
      const byId = {};
      for (const control of inventory && Array.isArray(inventory.controls) ? inventory.controls : []) {
        byId[control.id] = control;
      }
      lines.push(
        'Fields left out: ' +
          excluded
            .map(function (item) {
              return (
                (controlLabel(byId[item.control]) || item.control) +
                ' - ' +
                item.reason +
                (item.note ? ' (' + item.note + ')' : '')
              );
            })
            .join('; '),
      );
    }
    lines.push('');
  }

  const techniqueSummary = Object.keys(techniqueCounts)
    .sort()
    .map(function (technique) {
      return techniqueCounts[technique] + ' ' + technique;
    })
    .join(', ');

  return {
    entryCount: entries.length,
    markdown: lines.join('\\n').trimEnd(),
    summary:
      conditionCount +
      ' condition(s) across ' +
      entries.length +
      ' route(s)' +
      (techniqueSummary ? ' (' + techniqueSummary + ')' : '') +
      (unsatisfiedTotal > 0 ? ', ' + unsatisfiedTotal + ' uncoverable parameter pair(s)' : ''),
  };
}


// Route ids joined the way a person reads a walk: in the order the journey visits them.
function journeyHeading(labels, journey) {
  const routeIds = Array.isArray(journey.routeIds) ? journey.routeIds : [];
  const routes = routeIds
    .map(function (routeId) {
      return labelFor(labels, routeId);
    })
    .join(' -> ');
  // What drives the test and how far it reaches are the two things a reviewer needs before reading
  // the steps - an API check and a browser walk are not corrected the same way.
  const shape =
    journey.breadth === 'e2e'
      ? 'end-to-end via ' + journey.testInterface
      : 'targeted via ' + journey.testInterface;
  return '**' + (routes || '(no route)') + '** [' + shape + ']';
}

function renderTestCases(labels, data) {
  const all =
    data && typeof data.journeys === 'object' && data.journeys !== null
      ? Object.values(data.journeys)
      : [];
  const journeys = all.filter(function (journey) {
    return journey && journey.testCase;
  });
  // Feature walks first: they are the ones a reviewer most needs to see, and they explain the
  // targeted journeys underneath them.
  journeys.sort(function (a, b) {
    if (a.breadth !== b.breadth) return a.breadth === 'e2e' ? -1 : 1;
    return journeyHeading(labels, a).localeCompare(journeyHeading(labels, b));
  });

  const lines = [];
  let stepCount = 0;
  let ungroundedSteps = 0;
  let automated = 0;

  for (const journey of journeys) {
    if (journey.reviewed === true) automated += 1;
    lines.push(journeyHeading(labels, journey));
    const testCase = journey.testCase || {};
    lines.push('Title: ' + (testCase.title || '(untitled)'));
    const preconditions = Array.isArray(testCase.preconditions) ? testCase.preconditions : [];
    if (preconditions.length > 0) lines.push('Preconditions: ' + preconditions.join(', '));
    const steps = Array.isArray(testCase.steps) ? testCase.steps : [];
    steps.forEach(function (step, index) {
      stepCount += 1;
      const ungrounded = step.api && step.api.contractGrounded === false;
      if (ungrounded) ungroundedSteps += 1;
      lines.push(
        '' +
          (index + 1) +
          '. ' +
          (step.description || '(no description)') +
          ' -> ' +
          (step.expectedResult || '(no expected result)') +
          (ungrounded ? ' [NO OBSERVED API CONTRACT]' : ''),
      );
    });
    lines.push('');
  }

  return {
    entryCount: journeys.length,
    markdown: lines.join('\\n').trimEnd(),
    summary:
      journeys.length +
      ' drafted test case(s), ' +
      stepCount +
      ' step(s) total, ' +
      automated +
      ' already automated, ' +
      (journeys.length - automated) +
      ' awaiting automation' +
      (ungroundedSteps > 0 ? ', ' + ungroundedSteps + ' step(s) with no observed API contract' : ''),
  };
}

const OPERATION_PHRASE = {
  create: 'created',
  read: 'read',
  list: 'listed',
  update: 'updated',
  delete: 'deleted',
};

// Entities are rendered as their own numbered section rather than nested under each feature: a
// relation is the one claim in this artifact a wrong answer is expensive on, and burying the same
// entity under three features would ask a person to approve it three times while showing them a
// third of its links each time.
function renderFeatureMap(labels, data) {
  const features = data && data.features && typeof data.features === 'object' ? Object.values(data.features) : [];
  const entities = data && data.entities && typeof data.entities === 'object' ? Object.values(data.entities) : [];
  const entityNameById = new Map();
  for (const entity of entities) entityNameById.set(entity.entityId, entity.name);

  features.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name));
  });
  entities.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name));
  });

  const routeIntents = data && data.routes && typeof data.routes === 'object' ? data.routes : {};

  const lines = [];

  // The application-level facts a reviewer needs in front of them while judging impact live in
  // app-profile.json - the confirmed purpose, and what each crawled role turned out to reach. They
  // are read from there rather than copied into this artifact: one fact, one home.
  const profile = loadJson(APP_PROFILE_PATH);
  const selectedPurpose = profile && profile.corePurpose ? fieldValue(profile.corePurpose.selected) : undefined;
  if (selectedPurpose) {
    lines.push('Confirmed core purpose: ' + selectedPurpose);
    lines.push('');
  }
  const roles = profile && profile.roles && typeof profile.roles === 'object' ? Object.values(profile.roles) : [];
  if (roles.length > 0) {
    lines.push('**Roles crawled**');
    for (const role of roles) {
      const purpose = fieldValue(role.purpose);
      lines.push('- ' + role.name + ': ' + (purpose === undefined ? '(no purpose recorded)' : purpose));
      const exclusive = Array.isArray(role.exclusiveRoutes) ? role.exclusiveRoutes : [];
      lines.push(
        '  Reaches on its own: ' +
          (exclusive.length > 0 ? exclusive.join(', ') : 'nothing the other crawled roles could not'),
      );
    }
    lines.push('');
  }

  lines.push('**Features**');
  features.forEach(function (feature, i) {
    lines.push(
      i + 1 + '. ' + feature.name + ' - **' + String(feature.impact).toUpperCase() + ' IMPACT**',
    );
    const routes = Array.isArray(feature.memberRouteIds) ? feature.memberRouteIds : [];
    if (routes.length === 0) {
      lines.push('   Pages: (none)');
    } else {
      // Each page with its own criticality and the sentence justifying it, rather than a bare list
      // of paths: the tier is the thing a reviewer is actually being asked to check, and checking it
      // means reading it against the page it was given for.
      lines.push('   Pages:');
      const sorted = routes.slice().sort(function (a, b) {
        return labelFor(labels, a).localeCompare(labelFor(labels, b));
      });
      for (const routeId of sorted) {
        const intent = routeIntents[routeId];
        const tier = intent && intent.criticality ? String(intent.criticality.value).toUpperCase() : null;
        const phantom = labels.get(routeId);
        const flagged = phantom && phantom.flags.indexOf('likely-phantom-route') !== -1;
        lines.push(
          '   - ' +
            labelFor(labels, routeId) +
            (tier ? ' - **' + tier + '**' : ' - no criticality recorded') +
            (flagged ? ' [possibly not a real route]' : ''),
        );
        const reasoning = intent && intent.criticality ? intent.criticality.reasoning : undefined;
        if (reasoning) lines.push('     ' + reasoning);
        const excerpts = dedupedEvidence([intent && intent.criticality]);
        if (excerpts.length > 0) {
          lines.push(
            '     Evidences: ' +
              excerpts
                .map(function (e) {
                  return '"' + e + '"';
                })
                .join(', '),
          );
        }
      }
    }
    const names = (Array.isArray(feature.entityIds) ? feature.entityIds : [])
      .map(function (entityId) {
        return entityNameById.get(entityId) || entityId;
      })
      .sort();
    lines.push('   Works with: ' + (names.length > 0 ? names.join(', ') : 'nothing this pass could tie to it'));
    if (feature.impactSourceRouteId) {
      lines.push('   Impact comes from: ' + labelFor(labels, feature.impactSourceRouteId));
    } else {
      lines.push(
        '   Impact comes from: no page carried a criticality to draw it from, so it is assumed important until you say otherwise.',
      );
    }
  });

  // A page the site map has and no feature claims will never be tested by anything downstream, and
  // nothing else in this artifact would say so.
  const claimed = new Set();
  for (const feature of features) {
    for (const routeId of Array.isArray(feature.memberRouteIds) ? feature.memberRouteIds : []) {
      claimed.add(routeId);
    }
  }
  const unclaimed = Array.from(labels.keys()).filter(function (routeId) {
    return !claimed.has(routeId);
  });
  if (unclaimed.length > 0) {
    lines.push('');
    lines.push('**Pages no feature claims**');
    lines.push('Nothing downstream will test these until they belong somewhere:');
    for (const routeId of unclaimed.sort(function (a, b) {
      return labelFor(labels, a).localeCompare(labelFor(labels, b));
    })) {
      lines.push('- ' + labelFor(labels, routeId));
    }
  }

  if (entities.length > 0) {
    lines.push('');
    lines.push('**Things this application works with**');
    entities.forEach(function (entity, i) {
      lines.push('E' + (i + 1) + '. ' + entity.name);
      const operations = Array.isArray(entity.operations) ? entity.operations : [];
      const phrases = Array.from(
        new Set(
          operations.map(function (op) {
            return OPERATION_PHRASE[op.kind] || op.kind;
          }),
        ),
      );
      const anyObserved = operations.some(function (op) {
        return op.confidence === 'observed';
      });
      lines.push(
        '   Can be: ' +
          (phrases.length > 0 ? phrases.join(', ') : 'nothing was observed happening to it') +
          (phrases.length > 0
            ? anyObserved
              ? ' (seen in real traffic)'
              : ' (guessed from page addresses, not seen happening)'
            : ''),
      );
      const transitions = entity.lifecycle && Array.isArray(entity.lifecycle.transitions)
        ? entity.lifecycle.transitions
        : [];
      if (transitions.length > 0) {
        lines.push(
          '   Lifecycle: ' +
            transitions
              .map(function (t) {
                return t.from + ' -> ' + t.to + ' (' + t.trigger + ')';
              })
              .join('; '),
        );
      }
      const relations = Array.isArray(entity.relations) ? entity.relations : [];
      for (const relation of relations) {
        const target = entityNameById.get(relation.targetEntityId) || relation.targetEntityId;
        const claim =
          relation.kind === 'references'
            ? 'Needs a ' + target + ' to already exist'
            : 'Holds ' + target + ' inside it';
        lines.push(
          '   ' +
            claim +
            ' - via the field "' +
            relation.viaField +
            '"' +
            (relation.confidence === 'observed' ? '.' : ', guessed from that name alone.'),
        );
      }
      if (relations.length === 0) {
        lines.push('   Nothing links it to anything else.');
      }
      const excerpts = dedupedEvidence([entity].concat(relations));
      if (excerpts.length > 0) {
        lines.push('   Evidences: ' + excerpts.join('; '));
      }
    });
  }

  const unreviewedRelations = entities.reduce(function (total, entity) {
    return total + (Array.isArray(entity.relations) ? entity.relations.length : 0);
  }, 0);

  const intents = Object.values(routeIntents).filter(Boolean);
  const tierCounts = {};
  for (const intent of intents) {
    const tier = intent.criticality ? String(intent.criticality.value) : 'unknown';
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
  }
  const tierSummary = ['high', 'medium', 'low', 'unknown']
    .filter(function (tier) {
      return tierCounts[tier];
    })
    .map(function (tier) {
      return tierCounts[tier] + ' ' + tier;
    })
    .join(', ');

  // A reasoning sentence repeated verbatim across routes is a category label, not an explanation of
  // any one of them - and the tier it justifies is therefore unaudited. Surfaced rather than
  // rejected: two genuinely static pages can legitimately share one honest sentence, so this is a
  // prompt for a person to look, not a gate that blocks on a guess.
  const reasoningCounts = new Map();
  for (const intent of intents) {
    const reasoning = intent.criticality ? intent.criticality.reasoning : undefined;
    if (typeof reasoning !== 'string' || reasoning.length === 0) continue;
    reasoningCounts.set(reasoning, (reasoningCounts.get(reasoning) || 0) + 1);
  }
  const routesSharingReasoning = Array.from(reasoningCounts.values())
    .filter(function (count) {
      return count > 1;
    })
    .reduce(function (sum, count) {
      return sum + count;
    }, 0);

  return {
    entryCount: features.length + entities.length + intents.length,
    markdown: lines.join('\\n'),
    summary:
      features.length +
      ' feature(s) over ' +
      intents.length +
      ' page(s)' +
      (tierSummary ? ' (' + tierSummary + ')' : '') +
      ', ' +
      entities.length +
      ' thing(s), ' +
      unreviewedRelations +
      ' link(s) between them to confirm' +
      (unclaimed.length > 0 ? ', ' + unclaimed.length + ' page(s) no feature claims' : '') +
      (routesSharingReasoning > 0
        ? ' - heads up: ' +
          routesSharingReasoning +
          ' page(s) share a reasoning sentence with another, worth checking those were actually judged per page'
        : ''),
  };
}

// The stage whose whole deliverable is a route list had no review artifact of its own, so the one
// thing a human is meant to approve at the end of a crawl was the only thing never rendered for
// them. Two halves, and the second is the point: what was kept, each with the path to its own
// screenshot, and what was refused, so a route someone recognises can be caught before every later
// stage is built on a map missing it.
function renderSiteMap(labels, data) {
  const routes =
    data && data.routes && typeof data.routes === 'object' ? Object.entries(data.routes) : [];
  routes.sort(function (a, b) {
    return String(a[0]).localeCompare(String(b[0]));
  });

  const lines = [];
  const active = routes.filter(function (entry) {
    return !entry[1] || entry[1].status !== 'removed';
  });

  lines.push('**Routes found (' + active.length + ')**');
  lines.push('');
  active.forEach(function (entry, i) {
    const routePath = entry[0];
    const route = entry[1] || {};
    const status = route.httpStatus ? ' [' + route.httpStatus + ']' : '';
    lines.push(i + 1 + '. \`' + routePath + '\`' + status + (route.title ? ' - ' + route.title : ''));
    if (route.screenshot) {
      // A relative link, so it opens straight from the artifact in any editor or file browser.
      lines.push('   Screenshot: [' + route.screenshot + '](../../' + route.screenshot + ')');
    } else {
      lines.push('   Screenshot: none captured');
    }
    const triage = route.visualTriage || {};
    if (triage.state && triage.state !== 'ready') {
      lines.push('   Looked like: ' + triage.state.split('_').join(' '));
    }
    if (route.access && typeof route.access === 'object') {
      const perRole = Object.entries(route.access).map(function (pair) {
        return pair[0] + ': ' + (pair[1] && pair[1].outcome ? pair[1].outcome.split('_').join(' ') : '?');
      });
      if (perRole.length > 0) lines.push('   Per role: ' + perRole.join('; '));
    }
    lines.push('');
  });

  const removed = routes.filter(function (entry) {
    return entry[1] && entry[1].status === 'removed';
  });
  if (removed.length > 0) {
    lines.push('**No longer resolving (' + removed.length + ')** - kept so the removal is visible');
    for (const entry of removed) lines.push('- \`' + entry[0] + '\`');
    lines.push('');
  }

  // Read straight from the crawl's own state file rather than recomputed, so what a human reviews
  // is what the crawl actually decided.
  const budget = loadJson(CRAWL_BUDGET_PATH);
  const crawled = new Set(
    active.map(function (entry) {
      return entry[0];
    }),
  );
  const groups =
    budget && Array.isArray(budget.rejected) ? groupRejections(budget.rejected, crawled) : [];
  const worthReading = groups.filter(function (group) {
    return group.reviewWorthy;
  });
  if (worthReading.length > 0) {
    lines.push('**Links the crawl refused**');
    lines.push('');
    lines.push(
      'Scan these for anything you recognise. A route you know is real appearing here means a limit ' +
        'was too strict, and the crawl should be run again with it raised.',
    );
    lines.push('');
    for (const group of worthReading) {
      lines.push('- **' + group.reason + '** (' + group.count + ')');
      for (const url of group.urls.slice(0, 25)) lines.push('  - ' + url);
      if (group.count > 25) {
        lines.push(
          '  - ...and ' +
            (group.count - 25) +
            ' more - \`node scripts/crawl-budget.mjs rejected --reason=' +
            group.reason +
            '\`',
        );
      }
    }
    lines.push('');
  }

  if (data && data.coverage) {
    lines.push(
      '**This crawl stopped early** - bounded by \`' +
        data.coverage.boundedBy +
        '\` after ' +
        data.coverage.pagesVisited +
        ' pages. The route list may be incomplete.',
    );
  }

  return {
    markdown: lines.join('\\n'),
    entryCount: active.length,
    summary:
      active.length +
      ' route(s) found' +
      (worthReading.length > 0
        ? ', ' +
          worthReading.reduce(function (sum, group) {
            return sum + group.count;
          }, 0) +
          ' refused link(s) to scan'
        : ''),
  };
}

// Same ordering rule the crawl budget itself uses: the refusals where a real route can hide come
// first. Duplicated deliberately rather than imported - these generated scripts share no runtime.
// Two filters, both about not wasting the reader's attention on links that were never lost.
//
// A URL is dropped from this list when its canonical route ended up in the map anyway: the same
// link is commonly invisible in a collapsed mobile menu on one page and perfectly visible in the
// desktop nav on another, so it gets refused several times and crawled once. Reporting it as
// "refused" is not just noise, it is wrong. Live-observed at 818 entries on a 28-route application,
// with one route listed seven times while sitting in the map.
//
// And each remaining URL appears once, however many pages linked to it.
function groupRejections(rejected, crawledPaths) {
  const inMap = crawledPaths || new Set();
  const reviewWorthy = [
    'not-visible',
    'not-found',
    'non-html-asset',
    'non-html-response',
    'max-per-parent',
    'max-per-template',
    'max-per-query-base',
    'max-pages',
    'max-depth',
    'duplicate-content-template',
    'visibility-not-reported',
  ];
  const groups = {};
  const seen = new Set();
  for (const entry of rejected) {
    if (!entry || typeof entry.reason !== 'string') continue;
    if (entry.canonicalPath && inMap.has(entry.canonicalPath)) continue;
    const key = entry.reason + '\\u0000' + entry.url;
    if (seen.has(key)) continue;
    seen.add(key);
    const group =
      groups[entry.reason] ||
      (groups[entry.reason] = {
        reason: entry.reason,
        reviewWorthy: reviewWorthy.indexOf(entry.reason) !== -1,
        count: 0,
        urls: [],
      });
    group.count += 1;
    group.urls.push(entry.url);
  }
  for (const group of Object.values(groups)) group.urls.sort();
  return Object.values(groups).sort(function (a, b) {
    if (a.reviewWorthy !== b.reviewWorthy) return a.reviewWorthy ? -1 : 1;
    return a.reason < b.reason ? -1 : 1;
  });
}

const KINDS = {
  'site-map': { source: SITE_MAP_PATH, render: renderSiteMap },
  'feature-map': { source: FEATURE_MAP_PATH, render: renderFeatureMap },
  'test-conditions': { source: TEST_CONDITIONS_PATH, render: renderTestConditions },
  'test-cases': { source: TEST_CASES_PATH, render: renderTestCases },
};

function main() {
  const kind = argValue('kind');
  if (!kind || !KINDS[kind]) {
    fail('missing or unknown --kind. Use one of: ' + Object.keys(KINDS).join(', '));
  }

  // A rendered review is a snapshot of a draft, and approving it changes the draft: sign-off sets
  // reviewed on the very entries the file describes, and corrections change their values. Nothing
  // re-renders it, so from that moment the file on disk disagrees with the artifact it came from -
  // live-observed showing "criticality (draft)" for 45 entries a human had already confirmed, with
  // the JSON written two minutes after the markdown.
  //
  // It is deleted rather than refreshed because it is a view, not a record: the JSON is the artifact
  // and this command regenerates the view at any time. Leaving both means leaving one that lies.
  if (process.argv.slice(2).indexOf('--discard') !== -1) {
    const target = path.join(REVIEW_DIR, kind + '-review.md');
    const existed = fs.existsSync(target);
    if (existed) fs.unlinkSync(target);
    process.stdout.write(
      JSON.stringify(
        {
          kind,
          discarded: existed,
          filePath: path.relative(CWD, target).split(path.sep).join('/'),
          note: 'The artifact itself is unchanged. Re-render this view at any time with the same command without --discard.',
        },
        null,
        2,
      ) + '\\n',
    );
    return;
  }

  const thresholdArg = argValue('threshold');
  const threshold =
    thresholdArg !== undefined && Number.isFinite(Number(thresholdArg))
      ? Number(thresholdArg)
      : DEFAULT_THRESHOLD;

  const config = KINDS[kind];
  const data = loadJson(config.source);
  if (data === null) {
    fail('cannot read ' + path.relative(CWD, config.source) + ' - run the stage that writes it first');
  }

  const labels = buildRouteLabels(loadJson(SITE_MAP_PATH));
  const rendered = config.render(labels, data);
  const useFile = rendered.entryCount > threshold;

  let filePath = null;
  if (useFile) {
    fs.mkdirSync(REVIEW_DIR, { recursive: true });
    const target = path.join(REVIEW_DIR, kind + '-review.md');
    const heading = '# Review: ' + kind + '\\n\\n' + rendered.summary + '\\n\\n';
    fs.writeFileSync(target, heading + rendered.markdown + '\\n', 'utf8');
    filePath = path.relative(CWD, target).split(path.sep).join('/');
  }

  process.stdout.write(
    JSON.stringify(
      {
        kind,
        entryCount: rendered.entryCount,
        threshold,
        mode: useFile ? 'file' : 'inline',
        filePath,
        summary: rendered.summary,
        markdown: useFile ? '' : rendered.markdown,
      },
      null,
      2,
    ) + '\\n',
  );
}

main();
`;
}
