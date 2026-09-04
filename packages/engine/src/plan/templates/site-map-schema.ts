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
      "description": "Present only when the most recent crawl pass hit its own depth/page-count ceiling before exhausting every discoverable link - absence means the crawl completed on its own and the route list is not known to be truncated.",
      "required": ["boundedBy", "pagesVisited"],
      "additionalProperties": false,
      "properties": {
        "boundedBy": {
          "type": "string",
          "enum": ["maxDepth", "maxPages"],
          "description": "Which traversal limit actually stopped this crawl pass."
        },
        "pagesVisited": {
          "type": "integer",
          "description": "Total pages actually fetched during this crawl pass."
        }
      }
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
