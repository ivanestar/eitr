// Template for scripts/render-review-artifact.mjs — renders a stage's review artifact from its own
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
// business-intent block is 5-6 terminal lines, so ~10 entries is where a review stops fitting on one
// screen and starts scrolling past the top of the window.
export function renderReviewArtifactRenderer(): string {
  return `#!/usr/bin/env node

/**
 * Renders a pipeline stage's review artifact deterministically from its own JSON - zero model
 * involvement, so what the human reviews is exactly what was stored.
 *
 * Usage:
 *   node scripts/render-review-artifact.mjs --kind=business-intent
 *   node scripts/render-review-artifact.mjs --kind=feature-map
 *   node scripts/render-review-artifact.mjs --kind=test-conditions [--threshold=10]
 *   node scripts/render-review-artifact.mjs --kind=test-cases
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
const BUSINESS_INTENT_PATH = path.join(CWD, 'artifacts', 'analysis', 'business-intent.json');
const FEATURE_MAP_PATH = path.join(CWD, 'artifacts', 'analysis', 'feature-map.json');
const TEST_CONDITIONS_PATH = path.join(CWD, 'artifacts', 'analysis', 'test-conditions.json');
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

function renderBusinessIntent(labels, data) {
  const routes = data && data.routes && typeof data.routes === 'object' ? data.routes : {};
  const entries = Object.values(routes).filter(Boolean);
  entries.sort(function (a, b) {
    return labelFor(labels, a.routeId).localeCompare(labelFor(labels, b.routeId));
  });

  const lines = [];
  const selectedPurpose =
    data && data.corePurpose ? fieldValue(data.corePurpose.selected) : undefined;
  if (selectedPurpose) {
    lines.push('Confirmed core purpose: ' + selectedPurpose);
    lines.push('');
  }

  const roles = data && data.roles && typeof data.roles === 'object' ? Object.values(data.roles) : [];
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

  const phantom = entries.filter(function (entry) {
    const found = labels.get(entry.routeId);
    return found && found.flags.indexOf('likely-phantom-route') !== -1;
  });
  if (phantom.length > 0) {
    lines.push('**Possibly not real routes**');
    for (const entry of phantom) {
      lines.push(
        '- ' +
          labelFor(labels, entry.routeId) +
          ' - found only via a hidden DOM link, not reachable by clicking through the app.',
      );
    }
    lines.push('');
  }

  const real = entries.filter(function (entry) {
    return phantom.indexOf(entry) === -1;
  });
  real.forEach(function (entry, index) {
    lines.push('**' + (index + 1) + '. ' + labelFor(labels, entry.routeId) + '**');
    const feature = fieldValue(entry.businessFeature);
    if (feature !== undefined) lines.push('Feature: ' + feature);
    const tier = fieldValue(entry.criticalityTier);
    if (tier !== undefined) {
      lines.push('**Route criticality (draft): ' + String(tier).toUpperCase() + '**');
    }
    const reasoning = entry.criticalityTier ? entry.criticalityTier.reasoning : undefined;
    if (reasoning) lines.push('Reasoning: ' + reasoning);
    const excerpts = dedupedEvidence([entry.businessFeature, entry.criticalityTier]);
    if (excerpts.length > 0) {
      lines.push(
        'Evidences: ' +
          excerpts
            .map(function (e) {
              return '"' + e + '"';
            })
            .join(', '),
      );
    }
    lines.push('');
  });

  const tierCounts = {};
  for (const entry of entries) {
    const tier = String(fieldValue(entry.criticalityTier) || 'unknown');
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
  }

  // A reasoning sentence repeated verbatim across routes is a category label, not an explanation
  // of any one of them - and the tier it justifies is therefore unaudited. Surfaced rather than
  // rejected: two genuinely static pages can legitimately share one honest sentence, so this is a
  // prompt for the human to look, not a gate that blocks the pipeline on a guess.
  const reasoningCounts = new Map();
  for (const entry of entries) {
    const reasoning = entry.criticalityTier ? entry.criticalityTier.reasoning : undefined;
    if (typeof reasoning !== 'string' || reasoning.length === 0) continue;
    reasoningCounts.set(reasoning, (reasoningCounts.get(reasoning) || 0) + 1);
  }
  const repeatedReasonings = Array.from(reasoningCounts.values()).filter(function (count) {
    return count > 1;
  });
  const routesSharingReasoning = repeatedReasonings.reduce(function (sum, count) {
    return sum + count;
  }, 0);
  const tierSummary = ['high', 'medium', 'low', 'unknown']
    .filter(function (tier) {
      return tierCounts[tier];
    })
    .map(function (tier) {
      return tierCounts[tier] + ' ' + tier;
    })
    .join(', ');

  return {
    entryCount: entries.length,
    markdown: lines.join('\\n').trimEnd(),
    summary:
      entries.length +
      ' route(s) analysed' +
      (tierSummary ? ' (' + tierSummary + ')' : '') +
      (phantom.length > 0 ? ', ' + phantom.length + ' flagged as possibly not real' : '') +
      (routesSharingReasoning > 0
        ? ' - heads up: ' +
          routesSharingReasoning +
          ' route(s) share a reasoning sentence with another route, worth checking those tiers were actually judged per route'
        : ''),
  };
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

function renderTestConditions(labels, data) {
  const routes = data && data.routes && typeof data.routes === 'object' ? data.routes : {};
  const entries = Object.values(routes).filter(Boolean);
  entries.sort(function (a, b) {
    return labelFor(labels, a.routeId).localeCompare(labelFor(labels, b.routeId));
  });

  const lines = [];
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

function collectJourneys(routes) {
  const all = [];
  if (!routes || typeof routes !== 'object') return all;
  for (const entry of Object.values(routes)) {
    const journeys = entry && Array.isArray(entry.journeys) ? entry.journeys : [];
    for (const journey of journeys) {
      if (journey) all.push(journey);
    }
  }
  return all;
}

function renderTestCases(labels, data) {
  const journeys = collectJourneys(data && data.routes).filter(function (journey) {
    return journey.testCase;
  });
  journeys.sort(function (a, b) {
    return labelFor(labels, a.routeId).localeCompare(labelFor(labels, b.routeId));
  });

  const lines = [];
  let stepCount = 0;
  let ungroundedSteps = 0;
  let automated = 0;

  for (const journey of journeys) {
    if (journey.reviewed === true) automated += 1;
    lines.push('**' + labelFor(labels, journey.routeId) + '**');
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

  const lines = [];
  lines.push('**Features**');
  features.forEach(function (feature, i) {
    lines.push(
      i + 1 + '. ' + feature.name + ' - **' + String(feature.impact).toUpperCase() + ' IMPACT**',
    );
    const routes = Array.isArray(feature.memberRouteIds) ? feature.memberRouteIds : [];
    lines.push(
      '   Pages: ' +
        (routes.length > 0
          ? routes
              .map(function (routeId) {
                return labelFor(labels, routeId);
              })
              .join('; ')
          : '(none)'),
    );
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
        '   Impact comes from: no reviewed page to draw it from, so it is assumed important until you say otherwise.',
      );
    }
  });

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

  return {
    entryCount: features.length + entities.length,
    markdown: lines.join('\\n'),
    summary:
      features.length +
      ' feature(s), ' +
      entities.length +
      ' thing(s), ' +
      unreviewedRelations +
      ' link(s) between them to confirm',
  };
}

const KINDS = {
  'business-intent': { source: BUSINESS_INTENT_PATH, render: renderBusinessIntent },
  'feature-map': { source: FEATURE_MAP_PATH, render: renderFeatureMap },
  'test-conditions': { source: TEST_CONDITIONS_PATH, render: renderTestConditions },
  'test-cases': { source: TEST_CASES_PATH, render: renderTestCases },
};

function main() {
  const kind = argValue('kind');
  if (!kind || !KINDS[kind]) {
    fail('missing or unknown --kind. Use one of: ' + Object.keys(KINDS).join(', '));
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
