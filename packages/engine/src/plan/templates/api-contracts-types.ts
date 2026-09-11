// Template for generating .scaffold/schemas/api-contracts.types.ts, the typed contract for
// artifacts/site-map/api-contracts.json. create-if-absent.
// Lives under .scaffold/ (engine-owned machinery), not artifacts/ - see site-map-schema.ts's header
// comment for why.
//
// Same "documentation-as-code, not imported at runtime" convention as the other .types.ts files -
// real mechanical enforcement comes from scripts/validate-api-contracts.mjs instead.

export function renderApiContractsTypes(): string {
  return `// Typed contract for artifacts/site-map/api-contracts.json, produced by /map-site (Step 2's live
// network observation during crawl) and /auth-setup (observing the login request/response itself).
// Reference this file when reading or writing that JSON - it is documentation-as-code, not a
// compiled/imported module: nothing in this project imports it at runtime.
// scripts/validate-api-contracts.mjs enforces its shape mechanically.
//
// A contract entry only exists because it was ACTUALLY OBSERVED on the live application - never a
// guessed endpoint. /design-test-cases and /automate-test only draft/synthesize an 'api'-layer test
// case grounded in a real entry here; when no entry matches a route's interaction, that is a real,
// disclosed gap (see JourneyEntry.testCase.steps[].api.contractGrounded in test-cases.types.ts), not
// something to fill in with an invented endpoint.

// How the application talks to its backend, from the point of view of someone watching the network
// from inside the browser. The distinction that matters here is not which protocol is fashionable
// but where the operation's identity actually lives:
//
//   'rest'    - the path is the operation. Also covers OData and JSON:API, which are path-shaped.
//   'graphql' - one endpoint for the whole API, the operation named in the request body.
//   'rpc'     - the path names a procedure rather than a resource: gRPC-Web and Connect
//               (/package.Service/Method), tRPC (/api/trpc/entity.procedure), JSON-RPC (method in
//               the body).
//   'opaque'  - something was observed and nothing about it could be read. This is a real, common
//               outcome, not a failure to try: Next.js Server Actions POST to the page's own URL
//               with an encrypted, per-build action id; Remix actions and classic form posts carry
//               no operation name at all; a gRPC-Web call with a binary protobuf body has a
//               readable path but an unreadable payload.
//
// An 'opaque' entry exists so that a call nobody could decode is recorded as exactly that, rather
// than being run through a REST-shaped reading that invents a resource out of whatever the last
// path segment happened to be. A fabricated entity costs a reviewer more than a missing one: it
// has to be recognised as false and deleted, and anything built on it tests something that does
// not exist.
export type ApiStyle = 'rest' | 'graphql' | 'rpc' | 'opaque';

export interface ObservedOperation {
  style: ApiStyle;
  // The operation's name exactly as the application spells it - a GraphQL root field
  // ('createOrder'), a gRPC-Web or Connect method ('orders.v1.OrderService/CreateOrder'), a tRPC
  // procedure ('order.create'), a JSON-RPC method. Required for 'graphql' and 'rpc'. Absent for
  // 'rest', where the path already is the name, and for 'opaque', where there is nothing to read.
  name?: string;
  // For GraphQL only: whether the document was a query or a mutation. Read off the document text,
  // never inferred from the field name.
  documentType?: 'query' | 'mutation' | 'subscription';
  // Required on 'opaque': one plain sentence saying what stopped the read (e.g. "Next.js Server
  // Action - the Next-Action id is encrypted and changes every build", "binary protobuf body").
  // Recording why keeps an unreadable call distinguishable from one nobody looked at.
  reason?: string;
}

export interface ApiContractEntry {
  // sha256(method + '|' + pathTemplate + '|' + (operation.name || '')).slice(0, 16) - stable across
  // re-observation of the same call. The operation name is part of the identity because a GraphQL
  // or JSON-RPC API serves its entire surface from one path: without it, the first call observed
  // would be the only one ever recorded for the whole API.
  contractId: string;
  method: string;
  // Canonicalized the same way site-map.json's routes are: a numeric ID/UUID/slug segment collapses
  // to a template ({id}), never one entry per concrete record. Query strings are stripped, which
  // matters beyond tidiness: tRPC puts a call's whole input in an "input" query parameter, so a
  // path kept verbatim would carry real field values into an artifact that is read as evidence.
  pathTemplate: string;
  // Absent means 'rest' - the shape every earlier version of this file assumed and the one most
  // applications still use.
  operation?: ObservedOperation;
  // Which route(s) in site-map.json this call was actually observed being made from - a login
  // request observed during /auth-setup's own capture names no routeId (auth happens before any
  // route is "current" yet); an in-app call observed during /map-site's own crawl names the route
  // whose page triggered it.
  observedFromRouteIds: string[];
  // A representative request payload. A value holding an email address, six or more digits
  // (separators between them included) or a mostly-digit id is replaced with [REDACTED], and so is
  // any field whose name is sensitive (password, token, email...).
  // Absent for a method with no body (GET/DELETE with no payload).
  sampleRequestPayload?: Record<string, unknown>;
  // The status actually returned when this call was observed - not an assumption.
  responseStatus: number;
  // Response body SHAPE only: field name -> type hint ("string (uuid)", "integer", "boolean",
  // "string (Active | Inactive)", "... or null", "[ { ... } ]" for an array of objects) - never a
  // concrete instance value. The concrete values a drafted test case actually checks live in that
  // test case's own step content, not here.
  responseShape?: Record<string, string>;
  observedAt: string;
}

export interface ApiContractsReport {
  schemaVersion: 1;
  generatedAt: string;
  contracts: ApiContractEntry[];
}
`;
}
