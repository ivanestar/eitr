// Template for generating scripts/validate-site-map.mjs. create-if-absent.
// The same mechanical gate ADR 0012 Decision item 2 requires at every stage boundary ("validates
// the artifact's shape and internal consistency... with zero model involvement before an LLM or a
// human ever reviews its content"), applied to artifacts/site-map/site-map.json itself - the foundation
// every downstream consumer (shared-widget mining, scripts/orchestrate-swarm.mjs,
// /map-features' own route-intent analysis, pom-engineer) keys off. Mirrors
// feature-map-validator.ts's style and zero-dependency constraint exactly; the two scripts are
// intentionally not shared code, matching every other renderXValidator template in this project.

export function renderSiteMapValidator(): string {
  return `#!/usr/bin/env node

/**
 * Mechanical shape gate for artifacts/site-map/site-map.json.
 * Zero model involvement - pure structural checks, run by /map-site's Step 3c immediately after
 * writing the file and before any downstream consumer (shared-widget mining, the swarm dispatcher,
 * the feature map's own route-intent analysis) reads it.
 *
 * Usage:
 *   node scripts/validate-site-map.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');

const BOUNDED_BY_VALUES = new Set([
  'maxDepth',
  'maxPages',
  'maxPerTemplate',
  'maxPerParent',
  'maxPerQueryBase',
  'stalled',
  'duplicateContent',
]);
const STATUS_VALUES = new Set(['active', 'removed']);
const TRIAGE_STATE_VALUES = new Set([
  'ready',
  'auth_wall',
  'access_denied',
  'error_page',
  'empty_state',
]);
const TRIAGE_CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);
const TRIAGE_SOURCE_VALUES = new Set(['heuristic', 'vision']);
const TRIAGE_ALLOWED_KEYS = new Set([
  'state',
  'blockingOverlay',
  'confidence',
  'flags',
  'source',
]);
const DISCOVERY_METHOD_VALUES = new Set(['navigation', 'href-scan-only']);
const OVERLAY_KIND_VALUES = new Set([
  'native-dialog',
  'modal',
  'drawer',
  'popover',
  'banner',
  'toast',
  'unknown',
]);
const OVERLAY_DISMISS_METHODS = new Set([
  'native-dismiss',
  'escape',
  'close-control',
  'backdrop',
  'reload',
  'gave-up',
]);
const OVERLAY_ALLOWED_KEYS = new Set([
  'overlayId',
  'kind',
  'trigger',
  'title',
  'textExcerpt',
  'components',
  'screenshot',
  'dismissal',
]);
const ROUTE_ID_RE = /^[a-zA-Z0-9_-]+$/;
const SCREENSHOT_PATH_RE = /^artifacts\\/site-map\\/screenshots\\/[a-zA-Z0-9_-]+\\.(webp|jpg|jpeg)$/;
const FLAG_TOKEN_RE = /^[a-z0-9_-]+$/;

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    return { value: null, error: label + ' not found at ' + path.relative(CWD, filePath) };
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { value: null, error: 'failed to read ' + label + ': ' + err.message };
  }
  try {
    return { value: JSON.parse(raw), error: null };
  } catch (err) {
    return { value: null, error: label + ' is not valid JSON: ' + err.message };
  }
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validate() {
  const errors = [];
  const loaded = loadJson(SITE_MAP_PATH, 'artifacts/site-map/site-map.json');
  if (loaded.error) {
    errors.push(loaded.error);
    return { status: 'FAILED', errors };
  }
  const data = loaded.value;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push(
      'artifacts/site-map/site-map.json must contain a JSON object, found ' + JSON.stringify(data) + '.',
    );
    return { status: 'FAILED', errors };
  }

  if (data.schemaVersion !== 2) {
    errors.push(
      'schemaVersion must be exactly 2 (found ' +
        JSON.stringify(data.schemaVersion) +
        '). Treat as absent and re-run /map-site create rather than migrating in place.',
    );
  }
  if (typeof data.generatedAt !== 'string' || data.generatedAt.length === 0) {
    errors.push('generatedAt must be a non-empty string.');
  }
  if ('lastUpdatedAt' in data && (typeof data.lastUpdatedAt !== 'string' || data.lastUpdatedAt.length === 0)) {
    errors.push('lastUpdatedAt, when present, must be a non-empty string.');
  }
  if ('baseUrl' in data && typeof data.baseUrl !== 'string') {
    errors.push('baseUrl, when present, must be a string.');
  }
  if ('coverage' in data) {
    const coverage = data.coverage;
    if (!coverage || typeof coverage !== 'object') {
      errors.push('coverage, when present, must be an object.');
    } else {
      if (!BOUNDED_BY_VALUES.has(coverage.boundedBy)) {
        errors.push('coverage.boundedBy must be one of ' + [...BOUNDED_BY_VALUES].join('|') + '.');
      }
      if (typeof coverage.pagesVisited !== 'number' || !Number.isInteger(coverage.pagesVisited)) {
        errors.push('coverage.pagesVisited must be an integer.');
      }
    }
  }
  if ('sharedWidgets' in data && !isStringArray(data.sharedWidgets)) {
    errors.push('sharedWidgets, when present, must be an array of strings.');
  }

  if (!data.routes || typeof data.routes !== 'object' || Array.isArray(data.routes)) {
    errors.push('routes must be an object keyed by canonical path template.');
    return { status: errors.length === 0 ? 'PASSED' : 'FAILED', errors };
  }

  const routeIdOwners = new Map();
  for (const [key, entry] of Object.entries(data.routes)) {
    const label = 'routes["' + key + '"]';
    if (!entry || typeof entry !== 'object') {
      errors.push(label + ' must be an object.');
      continue;
    }
    if (typeof entry.routeId !== 'string' || entry.routeId.length === 0) {
      errors.push(label + '.routeId must be a non-empty string.');
    } else if (entry.routeId.length > 128 || !ROUTE_ID_RE.test(entry.routeId)) {
      errors.push(label + '.routeId must match ^[a-zA-Z0-9_-]+$ with max length 128.');
    } else {
      const owner = routeIdOwners.get(entry.routeId);
      if (owner) {
        errors.push(
          label + '.routeId "' + entry.routeId + '" is not unique - also used by ' + owner + '.',
        );
      } else {
        routeIdOwners.set(entry.routeId, label);
      }
    }
    if (!isStringArray(entry.sampleUrls) || entry.sampleUrls.length === 0) {
      errors.push(label + '.sampleUrls must be a non-empty array of strings.');
    }
    if ('title' in entry && typeof entry.title !== 'string') {
      errors.push(label + '.title, when present, must be a string.');
    }
    if ('regions' in entry && !isStringArray(entry.regions)) {
      errors.push(label + '.regions, when present, must be an array of strings.');
    }
    if ('components' in entry && !isStringArray(entry.components)) {
      errors.push(label + '.components, when present, must be an array of strings.');
    }
    if (typeof entry.discoveredAt !== 'string' || entry.discoveredAt.length === 0) {
      errors.push(label + '.discoveredAt must be a non-empty string.');
    }
    if (typeof entry.lastCheckedAt !== 'string' || entry.lastCheckedAt.length === 0) {
      errors.push(label + '.lastCheckedAt must be a non-empty string.');
    }
    if (typeof entry.contentHash !== 'string' || entry.contentHash.length === 0) {
      errors.push(label + '.contentHash must be a non-empty string.');
    }
    if (!STATUS_VALUES.has(entry.status)) {
      errors.push(label + '.status must be one of active|removed.');
    }
    if ('redirectedFrom' in entry) {
      if (!isStringArray(entry.redirectedFrom) || entry.redirectedFrom.length === 0) {
        errors.push(
          label +
            '.redirectedFrom, when present, must be a non-empty array of strings - omit it entirely when nothing redirected here.',
        );
      } else if (new Set(entry.redirectedFrom).size !== entry.redirectedFrom.length) {
        errors.push(label + '.redirectedFrom must not repeat the same path.');
      } else if (entry.redirectedFrom.includes(key)) {
        // A route listing itself as its own redirect source says nothing and hides the real one.
        errors.push(
          label + '.redirectedFrom must not contain this route own key ("' + key + '").',
        );
      }
    }
    if ('discoveryMethod' in entry && !DISCOVERY_METHOD_VALUES.has(entry.discoveryMethod)) {
      errors.push(
        label + '.discoveryMethod, when present, must be one of navigation|href-scan-only.',
      );
    }
    if ('httpStatus' in entry) {
      if (
        !Number.isInteger(entry.httpStatus) ||
        entry.httpStatus < 100 ||
        entry.httpStatus > 599
      ) {
        errors.push(label + '.httpStatus, when present, must be an integer between 100 and 599.');
      }
    }
    if ('screenshot' in entry) {
      if (typeof entry.screenshot !== 'string' || entry.screenshot.length === 0) {
        errors.push(label + '.screenshot, when present, must be a non-empty string.');
      } else if (
        entry.screenshot.length > 260 ||
        !SCREENSHOT_PATH_RE.test(entry.screenshot) ||
        entry.screenshot.includes('..') ||
        entry.screenshot.includes(String.fromCharCode(92))
      ) {
        errors.push(
          label +
            '.screenshot, when present, must be a relative path matching artifacts/site-map/screenshots/<routeId>.(webp|jpg|jpeg) without path traversal.',
        );
      }
    }
    if ('visualTriage' in entry) {
      const triage = entry.visualTriage;
      if (!triage || typeof triage !== 'object' || Array.isArray(triage)) {
        errors.push(label + '.visualTriage, when present, must be an object.');
      } else {
        const extraKeys = Object.keys(triage).filter((k) => !TRIAGE_ALLOWED_KEYS.has(k));
        if (extraKeys.length > 0) {
          errors.push(
            label +
              '.visualTriage has unrecognized properties: ' +
              extraKeys.join(', ') +
              '. Only state, blockingOverlay, confidence, flags, source are allowed.',
          );
        }
        if ('source' in triage && !TRIAGE_SOURCE_VALUES.has(triage.source)) {
          errors.push(label + '.visualTriage.source, when present, must be one of heuristic|vision.');
        }
        if (!triage.state || typeof triage.state !== 'string' || !TRIAGE_STATE_VALUES.has(triage.state)) {
          errors.push(
            label +
              '.visualTriage.state must be one of ready|auth_wall|access_denied|error_page|empty_state.',
          );
        }
        if ('blockingOverlay' in triage && typeof triage.blockingOverlay !== 'boolean') {
          errors.push(label + '.visualTriage.blockingOverlay, when present, must be a boolean.');
        }
        if ('confidence' in triage && (!triage.confidence || !TRIAGE_CONFIDENCE_VALUES.has(triage.confidence))) {
          errors.push(label + '.visualTriage.confidence, when present, must be one of high|medium|low.');
        }
        if ('flags' in triage) {
          if (!Array.isArray(triage.flags) || !triage.flags.every((item) => typeof item === 'string')) {
            errors.push(label + '.visualTriage.flags, when present, must be an array of strings.');
          } else if (
            triage.flags.length > 10 ||
            triage.flags.some((f) => f.length > 50 || !FLAG_TOKEN_RE.test(f))
          ) {
            errors.push(
              label +
                '.visualTriage.flags, when present, must contain at most 10 alphanumeric/kebab-case tokens (<=50 chars each).',
            );
          } else {
            checkPhantomEvidence(entry, triage, label, errors);
          }
        }
      }
    }
    if ('overlays' in entry) {
      checkOverlays(entry, label, errors);
    }
  }

  // An overlay the crawl opened and never closed is the failure this whole record exists to make
  // impossible: every later interaction on that page lands on a backdrop, produces no error, and
  // quietly explores nothing. So an entry that does not say what closed it, and that the closing was
  // actually re-checked, fails the file rather than being written into it. The one permitted
  // exception is an honest "gave-up", which has to travel with the route flag that tells every later
  // reader this page was only partly explored.
  function checkOverlays(entry, label, errors) {
    const overlays = entry.overlays;
    if (!Array.isArray(overlays)) {
      errors.push(label + '.overlays, when present, must be an array.');
      return;
    }
    if (overlays.length > 8) {
      errors.push(label + '.overlays must contain at most 8 entries.');
      return;
    }
    const flags =
      entry.visualTriage && Array.isArray(entry.visualTriage.flags) ? entry.visualTriage.flags : [];
    const seenIds = new Set();

    overlays.forEach((overlay, index) => {
      const overlayLabel = label + '.overlays[' + index + ']';
      if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) {
        errors.push(overlayLabel + ' must be an object.');
        return;
      }
      const extraKeys = Object.keys(overlay).filter((key) => !OVERLAY_ALLOWED_KEYS.has(key));
      if (extraKeys.length > 0) {
        errors.push(overlayLabel + ' has unrecognized properties: ' + extraKeys.join(', ') + '.');
      }
      if (typeof overlay.overlayId !== 'string' || overlay.overlayId.length === 0) {
        errors.push(overlayLabel + '.overlayId must be a non-empty string.');
      } else if (seenIds.has(overlay.overlayId)) {
        errors.push(overlayLabel + '.overlayId is duplicated on this route: ' + overlay.overlayId + '.');
      } else {
        seenIds.add(overlay.overlayId);
      }
      if (!OVERLAY_KIND_VALUES.has(overlay.kind)) {
        errors.push(
          overlayLabel + '.kind must be one of ' + [...OVERLAY_KIND_VALUES].join('|') + '.',
        );
      }
      if (typeof overlay.trigger !== 'string' || overlay.trigger.length === 0) {
        errors.push(
          overlayLabel +
            '.trigger must be a non-empty string - "auto" when it appeared on its own, otherwise what raised it.',
        );
      }
      if ('components' in overlay && !isStringArray(overlay.components)) {
        errors.push(overlayLabel + '.components, when present, must be an array of strings.');
      }
      if ('screenshot' in overlay) {
        if (
          typeof overlay.screenshot !== 'string' ||
          overlay.screenshot.length > 260 ||
          !SCREENSHOT_PATH_RE.test(overlay.screenshot) ||
          overlay.screenshot.includes('..') ||
          overlay.screenshot.includes(String.fromCharCode(92))
        ) {
          errors.push(
            overlayLabel +
              '.screenshot, when present, must be a relative artifacts/site-map/screenshots/ path without traversal.',
          );
        } else if (
          typeof entry.routeId === 'string' &&
          !overlay.screenshot.endsWith('--' + entry.routeId + path.extname(overlay.screenshot))
        ) {
          // scripts/map-site-status.mjs identifies a screenshot by whatever follows the final "--".
          // A name that ends any other way is unmatchable, so the next prune deletes it as an
          // orphan - which is how a whole pass of overlay images disappears silently.
          errors.push(
            overlayLabel +
              '.screenshot must end with "--<routeId>.<ext>" so scripts/map-site-status.mjs can match it - found ' +
              overlay.screenshot +
              '.',
          );
        }
      }
      const dismissal = overlay.dismissal;
      if (!dismissal || typeof dismissal !== 'object' || Array.isArray(dismissal)) {
        errors.push(
          overlayLabel +
            '.dismissal must be an object recording how this overlay was closed - an overlay with no recorded dismissal is one the crawl may have left open.',
        );
        return;
      }
      if (!OVERLAY_DISMISS_METHODS.has(dismissal.method)) {
        errors.push(
          overlayLabel + '.dismissal.method must be one of ' + [...OVERLAY_DISMISS_METHODS].join('|') + '.',
        );
      }
      if (typeof dismissal.verified !== 'boolean') {
        errors.push(overlayLabel + '.dismissal.verified must be a boolean.');
        return;
      }
      if (dismissal.method === 'gave-up') {
        if (dismissal.verified) {
          errors.push(overlayLabel + '.dismissal.verified must be false when method is "gave-up".');
        }
        if (!flags.includes('blocked-by-overlay')) {
          errors.push(
            overlayLabel +
              '.dismissal.method is "gave-up", so this route must carry "blocked-by-overlay" in visualTriage.flags - a page still covered by an overlay was only partly explored, and nothing else in the file says so.',
          );
        }
        return;
      }
      if (!dismissal.verified) {
        errors.push(
          overlayLabel +
            '.dismissal.verified is false with method "' +
            dismissal.method +
            '" - re-check the page after dismissing and record what is actually true, or record method "gave-up" with the blocked-by-overlay flag.',
        );
      }
    });
  }

  // "This route probably isn't real" is the one triage claim that deletes a route from a human's
  // attention, so it is the one that must carry its own evidence. Two justifications exist and no
  // third: the server itself said the page does not exist (404/410), or the cross-route
  // content-hash heuristic matched - and that heuristic is only allowed to touch a route nothing
  // ever navigated to. Live-observed failure this catches: 8 nav-reachable routes (including real
  // 401-protected ones like /basic_auth) flagged as phantom off the hash heuristic alone, with no
  // httpStatus recorded anywhere in the file.
  function checkPhantomEvidence(entry, triage, label, errors) {
    if (!triage.flags.includes('likely-phantom-route')) return;

    const status = entry.httpStatus;
    const saysNotFound = status === 404 || status === 410;

    if (status === 401 || status === 403) {
      errors.push(
        label +
          '.visualTriage.flags must not contain "likely-phantom-route" when httpStatus is ' +
          status +
          ' - that status means the route exists and is protected. Use visualTriage.state "auth_wall" (401) or "access_denied" (403) instead.',
      );
      return;
    }

    if (entry.discoveryMethod === 'navigation' && !saysNotFound) {
      errors.push(
        label +
          '.visualTriage.flags contains "likely-phantom-route" on a navigation-discovered route without a recorded httpStatus of 404/410 (found ' +
          (status === undefined ? 'no httpStatus' : String(status)) +
          '). Being reachable by clicking through the app is independent evidence the route is real; the cross-route content-hash heuristic may only downgrade an href-scan-only route.',
      );
    }
  }

  return { status: errors.length === 0 ? 'PASSED' : 'FAILED', errors };
}

const result = validate();
process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
if (result.status !== 'PASSED') process.exit(1);
`;
}
