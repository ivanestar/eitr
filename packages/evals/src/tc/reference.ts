// The analysis a careful analyst writes for a dataset, built from its gold: every field read, every
// stated limit a boundary, every rule the markup does not state cited by the condition that tests
// it, the main flow on every page, the seeded defect targeted, the research used or declined. It is
// the reference solution of each task: if it does not pass the gates and score full marks, the task
// or a grader is broken, not the analyst. Mutations of it model the ways a real analysis goes wrong.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GoldField, GoldPage, GoldText, GoldLimit } from './gold.js';
import type { PreparedDataset, RouteRecord } from './project.js';

const FIELD_ROLES = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
]);
const FRAME_REGIONS = new Set(['header', 'nav', 'footer', 'aside']);

export interface InventoryControl {
  id: string;
  role: string;
  tag: string;
  type?: string;
  name?: string;
  region?: string;
  testId?: string;
  output?: boolean;
  hidden?: boolean;
  constraints?: Record<string, unknown>;
}

export function isField(control: InventoryControl): boolean {
  if (FIELD_ROLES.has(control.role)) return true;
  if (control.tag === 'select' || control.tag === 'textarea') return true;
  return control.tag === 'input' && control.role !== 'button';
}

export function inventoryOf(prepared: PreparedDataset, route: RouteRecord): InventoryControl[] {
  return JSON.parse(readFileSync(join(prepared.dir, route.inventory), 'utf8')).controls || [];
}

function boundaryValues(limit: GoldLimit, control: InventoryControl): [string, string, string] {
  if (limit.attribute === 'maxlength' || limit.attribute === 'minlength') {
    const x = (n: number) => 'x'.repeat(Math.max(0, n));
    return [x(limit.value - 1), x(limit.value), x(limit.value + 1)];
  }
  const step =
    control.constraints &&
    typeof control.constraints.step === 'string' &&
    control.constraints.step !== 'any'
      ? Number(control.constraints.step)
      : 1;
  const v = limit.value;
  return [String(v - step), String(v), String(v + step)];
}

function boundaryOf(limit: GoldLimit, control: InventoryControl) {
  const markup = limit.stated === 'markup';
  const length = limit.attribute === 'maxlength' || limit.attribute === 'minlength';
  return {
    boundary: limit.side,
    values: boundaryValues(limit, control),
    rule: markup
      ? { signal: 'html5-constraint', excerpt: limit.attribute + '=' + limit.value }
      : { signal: 'form-label', excerpt: limit.excerpt },
    acceptedOutcome: length
      ? 'the whole text is kept and used as typed'
      : 'the page takes the value and shows its result as usual',
    rejectedOutcome: length
      ? limit.attribute === 'maxlength'
        ? 'typing stops at ' + limit.value + ' characters'
        : 'the field is marked too short and nothing is sent'
      : markup
        ? 'the browser marks the field invalid and no new result appears'
        : 'the page refuses the value and shows no result',
  };
}

function parameterOf(field: GoldField, control: InventoryControl) {
  const partitions: Array<Record<string, unknown>> = [];
  if (field.kind === 'checkbox') {
    partitions.push({
      id: 'on',
      kind: 'valid',
      sampleValues: ['checked'],
      expectedOutcome: field.sampleOutcome,
    });
    partitions.push({
      id: 'off',
      kind: 'valid',
      sampleValues: ['unchecked'],
      expectedOutcome: 'it stays off and nothing it controls changes',
    });
  } else {
    partitions.push({
      id: 'typical',
      kind: 'valid',
      sampleValues: [field.sample],
      expectedOutcome: field.sampleOutcome,
    });
  }
  if (field.invalid) {
    partitions.push({
      id: 'refused',
      kind: 'invalid',
      sampleValues: [field.invalid.sample],
      expectedOutcome: field.invalid.outcome,
      rule: { signal: field.invalid.signal, excerpt: field.invalid.excerpt },
    });
  }
  const boundaries = field.limits
    .filter(() => control.type !== 'file')
    .map((l) => boundaryOf(l, control));
  const evidence =
    field.limits.length > 0
      ? field.limits.map((l) =>
          l.stated === 'markup'
            ? { signal: 'html5-constraint', excerpt: l.attribute + '=' + l.value }
            : { signal: 'form-label', excerpt: l.excerpt! },
        )
      : [
          {
            signal: control.tag === 'select' ? 'select-option-text' : 'form-label',
            excerpt: (field.options ? field.options.slice(0, 3).join(', ') : field.label).slice(
              0,
              100,
            ),
          },
        ];
  return {
    name: field.key.replace(/-/g, ' '),
    kind: field.kind,
    control: control.id,
    partitions,
    boundaries,
    evidence,
  };
}

function constraintsOf(field: GoldField, control: InventoryControl, page: GoldPage) {
  const out: Array<Record<string, unknown>> = [];
  for (const limit of field.limits) {
    const noun = limit.attribute.endsWith('length') ? ' characters' : '';
    out.push({
      statement:
        (limit.side === 'max' ? 'At most ' : 'At least ') +
        limit.value +
        noun +
        (limit.stated === 'label' ? ', as the label states' : ''),
      source: 'markup',
      confidence: 'medium',
      enforcement: limit.stated === 'markup' ? 'markup' : 'unknown',
      anchors: [{ kind: 'control', ref: control.id }],
    });
  }
  if (field.required) {
    out.push({
      statement: 'Required: the page will not go on without it',
      source: 'markup',
      confidence: 'medium',
      enforcement: 'markup',
      anchors: [{ kind: 'control', ref: control.id }],
    });
  }
  for (const rule of page.rules) {
    if (rule.fields[0] !== field.testId) continue;
    out.push({
      id: rule.id,
      statement: rule.statement.slice(0, 200),
      source: rule.source,
      confidence: rule.source === 'human' ? 'high' : 'medium',
      enforcement: 'unknown',
      anchors:
        rule.source === 'human'
          ? [
              { kind: 'control', ref: control.id },
              {
                kind: 'human',
                ref: 'domainNotes:0',
                quote: 'values up to the stated amount are valid for us',
              },
            ]
          : [{ kind: 'control', ref: control.id }],
    });
  }
  return out;
}

function conditionOf(
  id: string,
  text: GoldText,
  featureId: string,
  anchors: Array<Record<string, unknown>>,
  extra: Record<string, unknown> = {},
) {
  const condition: Record<string, unknown> = {
    conditionId: id,
    parameters: text.parameters || {},
    technique: text.technique,
    description: text.description,
    expectedOutcome: text.outcome,
    scenario: text.scenario,
    verification: {},
    isSpeculative: true,
    reviewed: false,
    featureId,
    layer: text.layer,
    oracle: 'domain',
    anchors,
    origin: 'model',
    risk: { likelihood: 'medium', reason: 'a representative failure for this kind of page' },
    ...extra,
  };
  if (text.relation) condition.relation = text.relation;
  if (text.sourceInput) condition.sourceInput = text.sourceInput;
  if (text.followUpInput) condition.followUpInput = text.followUpInput;
  if (text.negativeCategory) condition.negativeCategory = text.negativeCategory;
  if (condition.technique === 'property' || condition.technique === 'metamorphic') {
    if (!condition.sourceInput) condition.sourceInput = text.description;
    if (condition.technique === 'metamorphic' && !condition.followUpInput)
      condition.followUpInput = 'the first result, entered again';
  }
  return condition;
}

export function referenceAnalysis(prepared: PreparedDataset): Record<string, any> {
  const { gold, featureId } = prepared;
  const now = new Date().toISOString();
  const featureRoutes = prepared.routes.filter((r) => r.inFeature);
  const frameRouteId = gold.frame.length > 0 ? featureRoutes[0].routeId : undefined;
  const fields: Array<Record<string, unknown>> = [];
  const routes: Record<string, any> = {};
  const research = gold.research;
  const usedChecks = new Set<string>();

  featureRoutes.forEach((route, pageIndex) => {
    const page = gold.pages.find((p) => p.path === route.path)!;
    const controls = inventoryOf(prepared, route);
    const byTestId = new Map(controls.filter((c) => c.testId).map((c) => [c.testId as string, c]));
    const isFrameRoute = route.routeId === frameRouteId;
    const parameters: Array<Record<string, unknown>> = [];
    const excluded: Array<Record<string, unknown>> = [];
    const conditions: Array<Record<string, unknown>> = [];
    const ctrl = (testId: string) => route.controlOf[testId];
    const duplicateOf = new Map(page.duplicates.map((d) => [d.testId, d.of]));
    const outputIds = new Set(page.outputs.map((o) => o.testId).filter(Boolean) as string[]);
    for (const control of controls) {
      if (!isField(control)) continue;
      const frame = FRAME_REGIONS.has(control.region || '');
      if (frame && !isFrameRoute) continue;
      const testId = control.testId || '';
      if (frame) {
        parameters.push({
          name: 'site language',
          kind: 'select',
          control: control.id,
          partitions: [
            {
              id: 'en',
              kind: 'valid',
              sampleValues: ['EN'],
              expectedOutcome: 'the page headings read in English',
            },
            {
              id: 'ru',
              kind: 'valid',
              sampleValues: ['RU'],
              expectedOutcome: 'the page headings switch to Russian',
            },
          ],
          boundaries: [],
          evidence: [{ signal: 'select-option-text', excerpt: 'EN, RU, DE' }],
        });
        fields.push({
          routeId: route.routeId,
          control: control.id,
          meaning:
            'Which language the whole site is shown in; it belongs to the site header, not to this page',
          role: 'setting',
          confidence: 'low',
          constraints: [],
        });
        continue;
      }
      if (duplicateOf.has(testId)) {
        excluded.push({
          control: control.id,
          reason: 'duplicate',
          note: 'a second copy of the same field, same as ' + ctrl(duplicateOf.get(testId)!),
        });
        continue;
      }
      if (outputIds.has(testId)) {
        excluded.push({
          control: control.id,
          reason: 'result-output',
          note: 'where the page shows its result',
        });
        fields.push({
          routeId: route.routeId,
          control: control.id,
          meaning: 'The result the page computes, shown here to read, never typed into',
          role: 'other',
          confidence: 'low',
          constraints: [],
        });
        continue;
      }
      const field = page.fields.find((f) => f.testId === testId);
      if (!field)
        throw new Error(
          prepared.spec.id +
            ': ' +
            route.path +
            ' carries field ' +
            control.id +
            ' (' +
            testId +
            ') the gold does not describe',
        );
      parameters.push(parameterOf(field, control));
      fields.push({
        routeId: route.routeId,
        control: control.id,
        meaning: field.meaning,
        role: field.role,
        confidence: 'low',
        constraints: constraintsOf(field, control, page),
      });
    }

    // Only what the inventory records as an output: a control it does not know as one cannot be
    // named in outputs, and a condition naming it would be refused.
    const knownOutputs = new Set(controls.filter((c) => c.output === true).map((c) => c.id));
    for (const testId of outputIds) if (ctrl(testId)) knownOutputs.add(ctrl(testId));
    const mainOutputs = page.mainFlow.outputs.map(ctrl).filter((id) => id && knownOutputs.has(id));
    const firstInput = page.fields.find((f) => ctrl(f.testId) && isField(byTestId.get(f.testId)!));
    const inputAnchor = firstInput ? [{ kind: 'control', ref: ctrl(firstInput.testId) }] : [];
    const main = conditionOf(
      'ref-main-' + pageIndex,
      page.mainFlow.text,
      featureId,
      inputAnchor,
      mainOutputs.length > 0 ? { outputs: mainOutputs } : {},
    );
    conditions.push(main);
    // A copy or download control the main flow does not read from gets its own check.
    for (const output of page.outputs) {
      if (!output.testId || (output.kind !== 'copy-button' && output.kind !== 'download')) continue;
      const id = ctrl(output.testId);
      if (!id || !knownOutputs.has(id) || mainOutputs.includes(id)) continue;
      conditions.push(
        conditionOf(
          'ref-output-' + output.testId,
          {
            description: output.label + ' hands over exactly the result the page shows',
            outcome:
              'what ' +
              output.label +
              ' delivers is character for character the result on the page',
            technique: 'property',
            relation: 'output-matches-display',
            sourceInput: page.mainFlow.text.sourceInput || page.mainFlow.text.description,
            scenario: 'positive',
            layer: 'behavior',
          },
          featureId,
          [{ kind: 'control', ref: id }],
          { outputs: [id] },
        ),
      );
    }
    for (const rule of page.rules) {
      const anchors: Array<Record<string, unknown>> = [
        { kind: 'constraint', ref: rule.id },
        { kind: 'control', ref: ctrl(rule.witness.field) || inputAnchor[0]?.ref },
      ];
      const extra: Record<string, unknown> = {};
      if (rule.source === 'human') {
        anchors.push({
          kind: 'human',
          ref: 'domainNotes:0',
          quote: 'values up to the stated amount are valid for us',
        });
        extra.oracle = 'human';
        extra.origin = 'human';
      }
      conditions.push(conditionOf('ref-rule-' + rule.id, rule.text, featureId, anchors, extra));
    }
    for (const defect of page.defects) {
      const check = research?.checks.find(
        (c) => c.appliesHere && c.defect === defect.kind && page.researchChecks.includes(c.id),
      );
      const anchors: Array<Record<string, unknown>> = inputAnchor.slice();
      const extra: Record<string, unknown> = {};
      if (check) {
        anchors.push(
          { kind: 'research', ref: check.id },
          { kind: 'research', ref: check.sourceIds[0] },
        );
        extra.origin = 'research';
        extra.oracle = 'research';
        usedChecks.add(check.id);
      }
      conditions.push(
        conditionOf('ref-defect-' + defect.id, defect.text, featureId, anchors, extra),
      );
    }
    for (const checkId of page.researchChecks) {
      if (usedChecks.has(checkId)) continue;
      const check = research!.checks.find((c) => c.id === checkId)!;
      conditions.push(
        conditionOf(
          'ref-research-' + checkId,
          check.text!,
          featureId,
          inputAnchor.concat([
            { kind: 'research', ref: check.id },
            { kind: 'research', ref: check.sourceIds[0] },
          ]),
          {
            origin: 'research',
            oracle: 'research',
          },
        ),
      );
      usedChecks.add(checkId);
    }
    for (const field of page.fields) {
      const upload = field.limits.find((l) => l.stated === 'label') && field.role === 'file';
      if (upload) {
        conditions.push(
          conditionOf(
            'ref-file-size',
            {
              description: 'A file just over the 1 MB the label states is refused',
              outcome: 'a message says the file is larger than 1 MB and nothing is imported',
              technique: 'error-guessing',
              scenario: 'negative',
              negativeCategory: 'boundary',
              layer: 'rule',
            },
            featureId,
            [{ kind: 'control', ref: ctrl(field.testId) }],
          ),
        );
      }
    }
    if (isFrameRoute) {
      const frameControl = controls.find((c) => c.testId === 'fr1');
      if (frameControl) {
        conditions.push(
          conditionOf(
            'ref-frame-language',
            {
              description: 'Choosing RU in the header keeps the site in Russian on the next page',
              outcome:
                'after moving to another page the headings are still in Russian and the switcher reads RU',
              technique: 'property',
              relation: 'persists-across-navigation',
              sourceInput: 'site language RU, then open the home page',
              scenario: 'positive',
              layer: 'behavior',
            },
            featureId,
            [{ kind: 'control', ref: frameControl.id }],
            { layer: 'frame' },
          ),
        );
      }
    }
    routes[route.routeId] = {
      routeId: route.routeId,
      parameters,
      excluded,
      constraints: [],
      conditions,
      unsatisfiedPairs: [],
      sourceContentHash: route.contentHash,
      sourceParamsHash: '',
      analyzedAt: now,
    };
  });

  const questions = gold.pages.flatMap((page) => {
    const route = featureRoutes.find((r) => r.path === page.path)!;
    return page.ambiguities.map((a) => ({ text: a.question, about: route.controlOf[a.testId] }));
  });
  const researchSummary = research
    ? {
        status: 'cached',
        archetype: research.archetype,
        file: 'artifacts/analysis/research/' + research.slugs[0] + '.json',
        declined: research.checks
          .filter((c) => !c.appliesHere)
          .map((c) => ({
            check: c.id,
            reason: 'it is about another kind of page, and this feature has none of them',
          })),
      }
    : {
        status: 'skipped',
        archetype: gold.feature.archetype,
        reason: 'no web access in this evaluation run',
      };
  return {
    schemaVersion: 3,
    generatedAt: now,
    basis: { mode: 'live-app', sources: ['http://127.0.0.1:' + prepared.port] },
    ...(frameRouteId ? { frameRouteId } : {}),
    features: {
      [featureId]: {
        featureId,
        purpose: gold.feature.purpose,
        fitsApplication: gold.feature.fitsApplication,
        archetype: gold.feature.archetype,
        confidence: 'medium',
        anchors: [{ kind: 'feature', ref: featureId }],
        fields,
        dependencies: gold.api
          ? [
              {
                on: 'the ' + gold.api.path + ' endpoint',
                kind: 'external',
                why: 'the page loads what it computes with from there; if the call fails the page falls back to built-in values',
              },
            ]
          : [],
        questions,
        research: researchSummary,
        analyzedAt: now,
      },
    },
    routes,
  };
}
