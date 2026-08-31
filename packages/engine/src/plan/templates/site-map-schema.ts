// Template for generating docs/site-map.schema.json, the JSON Schema for docs/site-map.json.
// create-if-absent. See decisions/0010-agent-operations-as-skills-not-cli.md for why this exists
// as a formal schema rather than the one line of prose the /map-site skill used to rely on.

export function renderSiteMapSchema(): string {
  return `${JSON.stringify(
    {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'site-map.schema.json',
      title: 'Site Map',
      description:
        'Deterministic route inventory produced by the /map-site skill. Routes are keyed by canonical path template (e.g. "/users/{id}"), never an array, so uniqueness is enforced by the JSON structure itself rather than a separate validation step.',
      type: 'object',
      required: ['schemaVersion', 'generatedAt', 'routes'],
      additionalProperties: false,
      properties: {
        schemaVersion: {
          type: 'integer',
          const: 1,
          description:
            'Bump this on any breaking shape change. A consumer that sees a missing or unrecognized value should treat the file as absent and ask /map-site to regenerate it, not attempt to migrate it in place.',
        },
        generatedAt: { type: 'string', format: 'date-time' },
        baseUrl: { type: 'string', format: 'uri' },
        routes: {
          type: 'object',
          description:
            'Keyed by canonical path template with dynamic segments collapsed (e.g. "/users/{id}" covers both /users/42 and /users/43). Serialize keys in sorted order for a deterministic diff.',
          additionalProperties: {
            type: 'object',
            required: ['routeId', 'sampleUrls', 'discoveredAt'],
            additionalProperties: false,
            properties: {
              routeId: {
                type: 'string',
                description:
                  'Stable identifier independent of the path template, so a future consumer (e.g. a Decision Journal entry) survives a URL restructure that would break a raw path-string reference.',
              },
              sampleUrls: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                description:
                  'Concrete observed URLs that collapsed into this route, e.g. ["/users/42", "/users/43"].',
              },
              title: { type: 'string' },
              regions: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Major structural DOM regions found on this route (header, nav, main, ...).',
              },
              components: {
                type: 'array',
                items: { type: 'string' },
                description: 'Page Object / widget class names discovered on this route.',
              },
              discoveredAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        sharedWidgets: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Widget class names found recurring across 2+ routes, synthesized under components/widgets/.',
        },
      },
    },
    null,
    2,
  )}\n`;
}
