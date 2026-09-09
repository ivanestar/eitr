// Template for generating .scaffold/schemas/site-map.schema.json, the JSON Schema for
// artifacts/site-map/site-map.json. create-if-absent. Lives under .scaffold/ (engine-owned machinery),
// not artifacts/ - artifacts/ is reserved for the actual filled-in artifacts (site-map.json,
// business-intent.json, test-conditions.json), which are useful context on their own; a schema
// file or a type-contract .ts file is tooling, not something a human reads for context. A real,
// separate JSON Schema file (rather than
// folding the shape into the /map-site skill's own prose) lets any tooling - a lint script, an
// editor's file-association settings, ajv in a test - check site-map.json's shape mechanically,
// instead of relying on an agent remembering the contract correctly every time it writes the file.
//
// Written as a literal string (not JSON.stringify(obj, null, 2)) because JSON.stringify always
// puts every array element on its own line regardless of length, while Prettier's JSON printer
// collapses a short array onto one line when it fits under printWidth - format.test.ts requires
// every emitted inline file to already match Prettier's actual output byte-for-byte, so this is
// hand-formatted to that exact shape rather than approximated.

export function renderSiteMapSchema(): string {
  return `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "site-map.schema.json",
  "title": "Site Map",
  "description": "Deterministic route inventory produced by the /map-site skill. Routes are keyed by canonical path template (e.g. \\"/users/{id}\\"), never an array, so uniqueness is enforced by the JSON structure itself rather than a separate validation step.",
  "type": "object",
  "required": ["schemaVersion", "generatedAt", "routes"],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": {
      "type": "integer",
      "const": 2,
      "description": "Bump this on any breaking shape change. A consumer that sees a missing or unrecognized value should treat the file as absent and ask /map-site create to regenerate it, not attempt to migrate it in place."
    },
    "generatedAt": {
      "type": "string",
      "format": "date-time",
      "description": "When /map-site create originally produced this file. Never changes on a later /map-site update pass - see lastUpdatedAt for that."
    },
    "lastUpdatedAt": {
      "type": "string",
      "format": "date-time",
      "description": "When the most recent /map-site update pass ran. Absent on a file that has only ever been created, never updated."
    },
    "baseUrl": {
      "type": "string",
      "format": "uri"
    },
    "coverage": {
      "type": "object",
      "description": "Present only when the most recent crawl pass hit one of its own traversal ceilings before exhausting every discoverable link - absence means the crawl completed on its own and the route list is not known to be truncated. Written from scripts/crawl-budget.mjs report's own coverage field.",
      "required": ["boundedBy", "pagesVisited"],
      "additionalProperties": false,
      "properties": {
        "boundedBy": {
          "type": "string",
          "enum": [
            "maxDepth",
            "maxPages",
            "maxPerTemplate",
            "maxPerParent",
            "maxPerQueryBase",
            "stalled",
            "duplicateContent"
          ],
          "description": "Which traversal limit actually stopped this crawl pass. \\"stalled\\" means no new route was found for the configured gap - the crawl had stopped getting anywhere, which is a different fact from having run for a long time; a crawl still finding pages is never stopped for its duration."
        },
        "pagesVisited": {
          "type": "integer",
          "description": "Total pages actually fetched during this crawl pass."
        }
      }
    },
    "crawledAsRoles": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[a-z0-9_]+$"
      },
      "description": "Role names whose saved sessions this crawl actually ran as, e.g. [\\"admin\\", \\"customer\\"]. Absent on a crawl that used a single session (or none), which is the common case. Present only when /map-site genuinely re-crawled per role - never as a statement of intent.",
      "uniqueItems": true
    },
    "routes": {
      "type": "object",
      "description": "Keyed by canonical path template with dynamic segments collapsed (e.g. \\"/users/{id}\\" covers both /users/42 and /users/43). Serialize keys in sorted order for a deterministic diff.",
      "additionalProperties": {
        "type": "object",
        "required": [
          "routeId",
          "sampleUrls",
          "discoveredAt",
          "lastCheckedAt",
          "contentHash",
          "status"
        ],
        "additionalProperties": false,
        "properties": {
          "routeId": {
            "type": "string",
            "pattern": "^[a-zA-Z0-9_-]+$",
            "maxLength": 128,
            "description": "Stable identifier independent of the path template, so a future consumer (e.g. a Decision Journal entry) survives a URL restructure that would break a raw path-string reference."
          },
          "sampleUrls": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "minItems": 1,
            "description": "Concrete observed URLs that collapsed into this route, e.g. [\\"/users/42\\", \\"/users/43\\"]."
          },
          "title": {
            "type": "string"
          },
          "regions": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Major structural DOM regions found on this route (header, nav, main, ...)."
          },
          "components": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Page Object / widget class names discovered on this route."
          },
          "access": {
            "type": "object",
            "description": "What each crawled role actually got when it requested this route. Keys are role names from the file-level crawledAsRoles. Absent when the crawl ran as a single session - this records an observed difference between roles, never an assumption about one.",
            "additionalProperties": {
              "type": "object",
              "required": ["reachable", "outcome", "observedAt"],
              "additionalProperties": false,
              "properties": {
                "reachable": {
                  "type": "boolean",
                  "description": "Whether this role reached the route's real content, as opposed to a login wall, a forbidden page, or a 404."
                },
                "outcome": {
                  "type": "string",
                  "enum": ["ok", "redirected_to_login", "forbidden", "not_found", "error"],
                  "description": "What the request actually produced for this role. Derived from the observed HTTP status and final URL, never inferred from the role's name."
                },
                "observedAt": {
                  "type": "string",
                  "format": "date-time"
                }
              }
            }
          },
          "discoveredAt": {
            "type": "string",
            "format": "date-time",
            "description": "When this route was first found. Never changes once set."
          },
          "lastCheckedAt": {
            "type": "string",
            "format": "date-time",
            "description": "When this specific route was last actually re-fetched, by either /map-site create or /map-site update - distinct from discoveredAt (first found) and the file-level lastUpdatedAt (whole-file pass timestamp)."
          },
          "contentHash": {
            "type": "string",
            "description": "Hash of a normalized structural signal for this route - title plus sorted regions plus sorted components, NOT raw HTML (too noisy: whitespace, analytics scripts, and embedded timestamps would cause false-positive \\"changed\\" signals). /map-site update recomputes this per route and skips full re-extraction when it matches the stored value; every pass must compute it the same way for the comparison to mean anything."
          },
          "status": {
            "type": "string",
            "enum": ["active", "removed"],
            "description": "\\"removed\\" means /map-site update could no longer resolve this route (404, vanished from nav) - the entry is kept, not silently deleted, so a consumer can see route-removal history. A full /map-site create pass prunes \\"removed\\" entries when it regenerates fresh."
          },
          "redirectedFrom": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "uniqueItems": true,
            "description": "Canonical path templates that were requested and redirected here, e.g. [\\"/old-checkout\\"] on the entry for \\"/checkout\\". Absent when nothing redirected to this route, which is the common case. A route that exists only as a redirect target is reachable by a real user and invisible to a crawl that keys every page by the URL it asked for, so the destination owns the entry and the requested path is recorded here rather than becoming a route of its own."
          },
          "discoveryMethod": {
            "type": "string",
            "enum": ["navigation", "href-scan-only"],
            "description": "How this route was actually reached. \\"navigation\\" means at least one visible, interactable link to it was clicked through on a rendered page; \\"href-scan-only\\" means the sole evidence was a raw href attribute with no visible counterpart anywhere. The distinction is load-bearing: the cross-route content-hash heuristic may only flag an href-scan-only route as a likely phantom, because being reachable through real navigation is independent evidence the route exists."
          },
          "httpStatus": {
            "type": "integer",
            "minimum": 100,
            "maximum": 599,
            "description": "The navigation response status observed the first time this route was visited this pass. This is the direct, primary signal for whether a route is real: 404/410 means the server itself says the page does not exist, while 401/403 means it exists and is protected. Recording it is what makes a \\"likely-phantom-route\\" flag auditable rather than a guess - without it, that flag can only be justified by the cross-route content-hash heuristic, and only for an href-scan-only route."
          },
          "screenshot": {
            "type": "string",
            "pattern": "^artifacts/site-map/screenshots/[a-zA-Z0-9_-]+\\\\.(webp|jpg|jpeg)$",
            "maxLength": 260,
            "description": "Relative filesystem path to the initial state viewport screenshot. Named \\"<path slug>--<routeId>.<ext>\\" so a human can tell at a glance which route a screenshot belongs to, with the routeId still carrying the stable identity the pruner matches on (e.g. \\"artifacts/site-map/screenshots/login--3f9a2b7e-4c1d-4e8a-9f2b-1a7c6d5e4f3a.jpg\\")."
          },
          "visualTriage": {
            "type": "object",
            "description": "Visual triage classification for the initial route render (ISTQB Entry Criteria & Blocked status).",
            "required": ["state"],
            "additionalProperties": false,
            "properties": {
              "state": {
                "type": "string",
                "enum": ["ready", "auth_wall", "access_denied", "error_page", "empty_state"],
                "description": "Visual state classification of the route."
              },
              "blockingOverlay": {
                "type": "boolean",
                "description": "Whether a modal dialog, cookie banner, or blocking backdrop obscures the primary content."
              },
              "confidence": {
                "type": "string",
                "enum": ["high", "medium", "low"],
                "description": "Confidence of the visual state classification."
              },
              "source": {
                "type": "string",
                "enum": ["heuristic", "vision"],
                "description": "What produced this classification: \\"heuristic\\" is the cheap markup check (suspicious tokens in the URL or title, interactive-element density, an overlay covering the viewport), \\"vision\\" is a worker that read the rendered screenshot. They answer the same question with very different reliability, and a reader deciding how much to trust an empty_state needs to know which one said it."
              },
              "flags": {
                "type": "array",
                "maxItems": 10,
                "items": {
                  "type": "string",
                  "maxLength": 50,
                  "pattern": "^[a-z0-9_-]+$"
                },
                "description": "Diagnostic tags identifying visual anomalies (e.g. [\\"session_expired\\", \\"cookie_banner\\"])."
              }
            }
          }
        }
      }
    },
    "sharedWidgets": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Widget class names found recurring across 2+ routes, synthesized under components/widgets/."
    }
  }
}
`;
}
