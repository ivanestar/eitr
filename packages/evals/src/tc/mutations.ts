// The ways an analysis goes wrong, as changes to the reference. Each is a failure seen on a live run
// or one the rules exist to stop; each says which net should catch it - a gate, or the graders. What
// the suite measures with them is how much of that net is real: a mutation nothing catches is a hole.
import type { PreparedDataset } from './project.js';
import { inventoryOf, isField } from './reference.js';
import { gradeAnalysis } from './graders.js';

export interface MutationContext {
  prepared: PreparedDataset;
}

export interface Mutation {
  id: string;
  what: string;
  // Where it should be caught: the first gate, the second, or the graders scoring the result.
  expect: 'gate1' | 'gate2' | 'graders';
  apply(analysis: any, ctx: MutationContext): boolean;
}

function routesOf(analysis: any): Array<[string, any]> {
  return Object.entries(analysis.routes || {});
}

function featureOf(analysis: any): any {
  return Object.values(analysis.features || {})[0];
}

function firstPage(ctx: MutationContext) {
  return ctx.prepared.routes.filter((r) => r.inFeature)[0];
}

export const MUTATIONS: Mutation[] = [
  {
    id: 'template-conditions',
    what: 'the conditions the analysis wrote are one sentence with the page title swapped in',
    expect: 'gate2',
    apply(analysis, ctx) {
      let changed = false;
      for (const [routeId, entry] of routesOf(analysis)) {
        const route = ctx.prepared.routes.find((r) => r.routeId === routeId);
        for (const condition of entry.conditions || []) {
          if (condition.origin === 'generated') continue;
          condition.description =
            'Verify ' +
            (route ? route.title : 'the page') +
            ' renders valid UI components and functional controls';
          condition.expectedOutcome = 'Page renders intended layout with responsive controls';
          if (condition.sourceInput)
            condition.sourceInput = 'Navigate to the page and execute default operation';
          changed = true;
        }
      }
      return changed;
    },
  },
  {
    id: 'drop-main-flow',
    what: 'no condition says what the page does with the input it takes',
    expect: 'gate2',
    apply(analysis, ctx) {
      const route = firstPage(ctx);
      const entry = analysis.routes[route.routeId];
      const before = (entry.conditions || []).length;
      entry.conditions = (entry.conditions || []).filter(
        (c: any) =>
          !(c.origin !== 'generated' && c.scenario === 'positive' && c.layer === 'behavior'),
      );
      return entry.conditions.length < before && (entry.parameters || []).length > 0;
    },
  },
  {
    id: 'main-flow-without-output',
    what: 'the main flow never names where the page shows its result',
    expect: 'gate2',
    apply(analysis) {
      let changed = false;
      for (const [, entry] of routesOf(analysis)) {
        for (const condition of entry.conditions || []) {
          if (Array.isArray(condition.outputs) && condition.outputs.length > 0) {
            delete condition.outputs;
            if (condition.relation === 'output-matches-display')
              condition.relation = 'format-conformance';
            changed = true;
          }
        }
      }
      return changed;
    },
  },
  {
    id: 'drop-boundary',
    what: 'a limit the markup states gets no boundary',
    expect: 'gate1',
    apply(analysis) {
      for (const [, entry] of routesOf(analysis)) {
        for (const parameter of entry.parameters || []) {
          if ((parameter.boundaries || []).length > 0) {
            parameter.boundaries = [];
            return true;
          }
        }
      }
      return false;
    },
  },
  {
    id: 'invented-limit',
    what: 'a boundary stands on a limit the page never states',
    expect: 'gate1',
    apply(analysis, ctx) {
      const route = firstPage(ctx);
      const entry = analysis.routes[route.routeId];
      const controls = inventoryOf(ctx.prepared, route);
      for (const parameter of entry.parameters || []) {
        const control = controls.find((c) => c.id === parameter.control);
        if (
          !control ||
          parameter.kind !== 'number' ||
          (control.constraints && 'max' in control.constraints)
        )
          continue;
        parameter.boundaries = (parameter.boundaries || []).concat([
          {
            boundary: 'max',
            values: ['998', '999', '1000'],
            rule: { signal: 'html5-constraint', excerpt: 'max=999' },
            acceptedOutcome: 'the page takes the value and shows its result as usual',
            rejectedOutcome: 'the browser marks the field invalid and no new result appears',
          },
        ]);
        return true;
      }
      return false;
    },
  },
  {
    id: 'empty-invalid-on-optional',
    what: 'an empty value is called invalid on a field nothing says is required',
    expect: 'gate1',
    apply(analysis, ctx) {
      const route = firstPage(ctx);
      const entry = analysis.routes[route.routeId];
      const controls = inventoryOf(ctx.prepared, route);
      for (const parameter of entry.parameters || []) {
        const control = controls.find((c) => c.id === parameter.control);
        if (
          !control ||
          (control.constraints && 'required' in control.constraints) ||
          parameter.kind === 'checkbox' ||
          parameter.kind === 'select'
        )
          continue;
        parameter.partitions = (parameter.partitions || []).concat([
          {
            id: 'empty',
            kind: 'invalid',
            sampleValues: [''],
            expectedOutcome: 'a message under the field says the value is required',
            rule: {
              signal: 'form-label',
              excerpt: String(control.name || parameter.name).slice(0, 90),
            },
          },
        ]);
        return true;
      }
      return false;
    },
  },
  {
    id: 'label-as-rule',
    what: "a value is called invalid because of the field's own label, which states no rule",
    expect: 'gate1',
    apply(analysis, ctx) {
      const route = firstPage(ctx);
      const entry = analysis.routes[route.routeId];
      const controls = inventoryOf(ctx.prepared, route);
      for (const parameter of entry.parameters || []) {
        const control = controls.find((c) => c.id === parameter.control);
        const invalid = (parameter.partitions || []).find((p: any) => p.kind === 'invalid');
        if (!control || !invalid || !control.name) continue;
        invalid.rule = { signal: 'form-label', excerpt: String(control.name) };
        return true;
      }
      return false;
    },
  },
  {
    id: 'research-unused',
    what: 'the research is recorded and none of its checks becomes a condition',
    expect: 'gate2',
    apply(analysis) {
      const feature = featureOf(analysis);
      if (!feature || !feature.research || feature.research.status === 'skipped') return false;
      let changed = false;
      for (const [, entry] of routesOf(analysis)) {
        for (const condition of entry.conditions || []) {
          const before = (condition.anchors || []).length;
          condition.anchors = (condition.anchors || []).filter((a: any) => a.kind !== 'research');
          if (condition.anchors.length === 0)
            condition.anchors = [
              { kind: 'feature', ref: analysis.features ? Object.keys(analysis.features)[0] : 'f' },
            ];
          if (condition.oracle === 'research') condition.oracle = 'domain';
          if (condition.origin === 'research') condition.origin = 'model';
          if (condition.anchors.length !== before) changed = true;
        }
      }
      return changed;
    },
  },
  {
    id: 'decline-without-reason',
    what: 'research checks are declined with a reason nobody could act on',
    expect: 'gate2',
    apply(analysis) {
      const feature = featureOf(analysis);
      if (!feature || !feature.research || feature.research.status === 'skipped') return false;
      feature.research.declined = (feature.research.declined || []).map((d: any) => ({
        ...d,
        reason: 'n/a',
      }));
      return (feature.research.declined || []).length > 0;
    },
  },
  {
    id: 'rule-uncited',
    what: 'a rule the markup does not state is written down and nothing tests it',
    expect: 'gate2',
    apply(analysis) {
      const feature = featureOf(analysis);
      if (!feature) return false;
      const ids = new Set<string>();
      for (const field of feature.fields || [])
        for (const constraint of field.constraints || []) if (constraint.id) ids.add(constraint.id);
      if (ids.size === 0) return false;
      let changed = false;
      for (const [, entry] of routesOf(analysis)) {
        entry.conditions = (entry.conditions || []).filter(
          (c: any) => !(c.anchors || []).some((a: any) => a.kind === 'constraint'),
        );
        for (const parameter of entry.parameters || []) {
          for (const set of (parameter.partitions || []).concat(parameter.boundaries || [])) {
            if (Array.isArray(set.anchors))
              set.anchors = set.anchors.filter((a: any) => a.kind !== 'constraint');
          }
        }
        changed = true;
      }
      return changed;
    },
  },
  {
    id: 'export-excused-as-result-box',
    what: 'a copy or export control is excused from its check as a result box',
    expect: 'gate2',
    apply(analysis, ctx) {
      for (const route of ctx.prepared.routes.filter((r) => r.inFeature)) {
        const entry = analysis.routes[route.routeId];
        const controls = inventoryOf(ctx.prepared, route);
        const output = controls.find((c) => c.output === true);
        if (!output) continue;
        entry.conditions = (entry.conditions || []).map((c: any) => {
          if (Array.isArray(c.outputs))
            c.outputs = c.outputs.filter((id: string) => id !== output.id);
          if (Array.isArray(c.outputs) && c.outputs.length === 0) delete c.outputs;
          return c;
        });
        entry.conditions = entry.conditions.filter(
          (c: any) => c.relation !== 'output-matches-display',
        );
        entry.excluded = (entry.excluded || []).concat([
          {
            control: output.id,
            reason: 'result-output',
            note: 'Export or clipboard output control',
          },
        ]);
        return true;
      }
      return false;
    },
  },
  {
    id: 'template-field-meanings',
    what: 'every field meaning is the same sentence with the label dropped into it',
    expect: 'gate1',
    apply(analysis) {
      const feature = featureOf(analysis);
      if (!feature) return false;
      for (const field of feature.fields || [])
        field.meaning = 'Input value representing the field on the page';
      return (feature.fields || []).length > 0;
    },
  },
  {
    id: 'personal-data-sample',
    what: "a sample value is somebody's real phone number",
    expect: 'gate2',
    apply(analysis) {
      for (const [, entry] of routesOf(analysis)) {
        for (const parameter of entry.parameters || []) {
          if (parameter.kind !== 'text') continue;
          const partition = (parameter.partitions || [])[0];
          if (!partition) continue;
          partition.sampleValues = ['+7 916 348 22 91'];
          return true;
        }
      }
      return false;
    },
  },
  {
    id: 'defect-locked-in',
    what: "today's wrong result is written down as the expected one",
    expect: 'graders',
    apply(analysis, ctx) {
      for (const route of ctx.prepared.routes.filter((r) => r.inFeature)) {
        const page = ctx.prepared.gold.pages.find((p) => p.path === route.path);
        const defect = page && page.defects[0];
        if (!defect || defect.wrongTokens.length === 0) continue;
        const entry = analysis.routes[route.routeId];
        const condition = (entry.conditions || []).find(
          (c: any) => c.conditionId === 'ref-defect-' + defect.id,
        );
        if (!condition) continue;
        condition.expectedOutcome = 'the result reads ' + defect.wrongTokens[0];
        return true;
      }
      return false;
    },
  },
  {
    id: 'defect-not-targeted',
    what: 'nothing checks what this kind of page is known to get wrong',
    expect: 'graders',
    apply(analysis, ctx) {
      let changed = false;
      for (const route of ctx.prepared.routes.filter((r) => r.inFeature)) {
        const page = ctx.prepared.gold.pages.find((p) => p.path === route.path);
        if (!page || page.defects.length === 0) continue;
        const entry = analysis.routes[route.routeId];
        const before = (entry.conditions || []).length;
        const ids = new Set(page.defects.map((d) => 'ref-defect-' + d.id));
        entry.conditions = (entry.conditions || []).filter((c: any) => !ids.has(c.conditionId));
        // Research conditions restate the same checks, so they go too.
        entry.conditions = entry.conditions.filter(
          (c: any) => !String(c.conditionId).startsWith('ref-research-'),
        );
        if (entry.conditions.length < before) changed = true;
      }
      // Only a real mutation counts: where another condition already covers the defect, taking this
      // one out changes nothing to catch.
      if (!changed) return false;
      return gradeAnalysis(ctx.prepared, analysis).items.some(
        (item) => item.grader === 'defect-targeted' && !item.passed,
      );
    },
  },
  {
    id: 'valid-value-called-invalid',
    what: 'a value the domain accepts is recorded as one the page refuses',
    expect: 'graders',
    apply(analysis, ctx) {
      for (const route of ctx.prepared.routes.filter((r) => r.inFeature)) {
        const page = ctx.prepared.gold.pages.find((p) => p.path === route.path);
        const rule = page && page.rules.find((r) => r.witness.polarity === 'valid');
        if (!page || !rule) continue;
        const entry = analysis.routes[route.routeId];
        const controlId = route.controlOf[rule.witness.field];
        const parameter = (entry.parameters || []).find((p: any) => p.control === controlId);
        if (!parameter) continue;
        parameter.partitions = (parameter.partitions || []).concat([
          {
            id: 'refused-wrongly',
            kind: 'invalid',
            sampleValues: [rule.witness.value],
            expectedOutcome: 'the page refuses the value and shows no result',
            rule: { signal: 'manual', excerpt: 'the team says this value is not allowed here' },
          },
        ]);
        return true;
      }
      return false;
    },
  },
  {
    id: 'question-dropped',
    what: 'a limit nothing states is decided by the analysis instead of asked about',
    expect: 'graders',
    apply(analysis, ctx) {
      const feature = featureOf(analysis);
      const hasAmbiguity = ctx.prepared.gold.pages.some((p) => p.ambiguities.length > 0);
      if (!feature || !hasAmbiguity || (feature.questions || []).length === 0) return false;
      feature.questions = [];
      return true;
    },
  },
  {
    id: 'frame-field-as-page-field',
    what: "the site header's own field is recorded as a field of the page",
    expect: 'gate1',
    apply(analysis, ctx) {
      const routes = ctx.prepared.routes.filter((r) => r.inFeature);
      const target = routes.find((r) => r.routeId !== analysis.frameRouteId);
      if (!target || ctx.prepared.gold.frame.length === 0) return false;
      const controls = inventoryOf(ctx.prepared, target);
      const frameControl = controls.find(
        (c) => ['header', 'nav', 'footer', 'aside'].includes(c.region || '') && isField(c),
      );
      if (!frameControl) return false;
      analysis.routes[target.routeId].parameters.push({
        name: 'site language',
        kind: 'select',
        control: frameControl.id,
        partitions: [
          {
            id: 'en',
            kind: 'valid',
            sampleValues: ['EN'],
            expectedOutcome: 'the page headings read in English',
          },
        ],
        boundaries: [],
        evidence: [{ signal: 'select-option-text', excerpt: 'EN, RU, DE' }],
      });
      return true;
    },
  },
  {
    id: 'field-unaccounted',
    what: 'a field of the page is neither a parameter nor an exclusion',
    expect: 'gate1',
    apply(analysis, ctx) {
      const route = firstPage(ctx);
      const entry = analysis.routes[route.routeId];
      if ((entry.parameters || []).length < 2) return false;
      entry.parameters = entry.parameters.slice(0, -1);
      return true;
    },
  },
];
