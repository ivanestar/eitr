// What an analysis is worth, scored against the dataset's gold. Every grader here is code: it reads
// the analysis and the answer key and returns a pass or a fail per item, so two people reading the
// same pair get the same verdict. The judgements code cannot make - whether a condition would
// actually catch a seeded defect, whether an expected result is right for its input - are in
// judge.ts and are scored the same way, one binary item at a time.
import type { GoldApp, GoldField, GoldPage, GoldRule, GoldValueClass } from './gold.js';
import type { PreparedDataset, RouteRecord } from './project.js';
import { inventoryOf, isField, type InventoryControl } from './reference.js';

export interface GradeItem {
  grader: string;
  page: string;
  what: string;
  passed: boolean;
  detail?: string | undefined;
  // Code got as far as it can and the rest is a judgement: the analysis states a result of its own
  // and only a reader can say whether it is the right one. It counts as failed until a judge says
  // otherwise, so a run with no judge never scores itself generously.
  deferred?: boolean | undefined;
  // What the judge is asked about, when it is.
  subject?: { conditionId: string; text: string } | undefined;
  // The judge was asked and did not answer. That is a fact about the judge, not about the analysis,
  // so the item is left out of every rate rather than counted as a failure.
  unresolved?: boolean | undefined;
}

export interface GradeResult {
  items: GradeItem[];
  byGrader: Record<string, { passed: number; total: number }>;
  // Everything a person would want to look at after a run.
  notes: string[];
}

const TEMPLATE_WORDS =
  /^(the|a|an|is|are|and|or|of|for|with|value|values|field|input|text|data|page|result|correct|correctly|properly|expected|valid|invalid)$/i;

function words(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9а-яё.,-]+/i)
    .filter(Boolean);
}

function mentions(text: string, token: string): boolean {
  if (!token) return false;
  return String(text || '')
    .toLowerCase()
    .includes(String(token).toLowerCase());
}

function liveConditions(entry: any): any[] {
  return (entry.conditions || []).filter((c: any) => c && c.cut !== true);
}

function authored(entry: any): any[] {
  return liveConditions(entry).filter((c: any) => c.origin && c.origin !== 'generated');
}

function conditionText(c: any): string {
  return [c.description, c.expectedOutcome, c.sourceInput, c.followUpInput]
    .filter(Boolean)
    .join(' \n ');
}

// What the condition itself says happens - not the steps that follow it, which belong to another
// case and whose values say nothing about this one's result.
function statedResult(c: any): string {
  return [c.description, c.expectedOutcome].filter(Boolean).join(' \n ');
}

function numberOf(value: string): number | null {
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function sameValue(a: string, b: string): boolean {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

// Whether a value shows the rule its witness stands for: the witness itself always does, and where
// the gold names a class, every value of that class does too.
function standsFor(witness: GoldRule['witness'], value: string): boolean {
  if (sameValue(value, witness.value)) return true;
  const stands: GoldValueClass | undefined = witness.stands;
  if (!stands) return false;
  if (stands.kind === 'number') {
    const n = numberOf(value);
    if (n === null) return false;
    if (stands.lt !== undefined && !(n < stands.lt)) return false;
    if (stands.lte !== undefined && !(n <= stands.lte)) return false;
    if (stands.gt !== undefined && !(n > stands.gt)) return false;
    if (stands.gte !== undefined && !(n >= stands.gte)) return false;
    return true;
  }
  if ((stands.not || []).some((v) => sameValue(v, value))) return false;
  try {
    return new RegExp(stands.matches, 'i').test(String(value));
  } catch {
    return false;
  }
}

// The values a condition points at by naming a partition or a boundary of a parameter.
function resolvedValues(condition: any, parameters: any[], only?: any): string[] {
  const out: string[] = [];
  const named = condition.parameters || {};
  for (const parameter of parameters) {
    if (only && parameter !== only) continue;
    const id = named[parameter.name];
    if (id === undefined) continue;
    for (const set of (parameter.partitions || []).concat(parameter.boundaries || [])) {
      if (String(set.id) !== String(id)) continue;
      for (const value of set.sampleValues || set.values || []) out.push(String(value));
    }
  }
  return out;
}

function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const match of String(text || '').matchAll(/-?\d+(?:[.,]\d+)?/g)) {
    const value = Number(match[0].replace(',', '.'));
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}

// A value is named by a text, not merely contained in it: 1 is not in 19.99, so a condition about a
// price of 19.99 does not test a rule whose witness is 1. A number is read as a number, so 30 is
// named by a text that says 30.00.
function textNames(text: string, value: string): boolean {
  const wanted = numberOf(value);
  if (wanted === null) return mentions(text, value);
  return numbersIn(text).some((found) => found === wanted);
}

// The values a condition works with: the ones it points at by naming a partition or a boundary, and
// the quoted strings, numbers and words of its own text.
function valuesUsed(condition: any, parameters: any[], only?: any): string[] {
  const out: string[] = resolvedValues(condition, parameters, only);
  const text = conditionText(condition);
  for (const match of text.matchAll(/"([^"]{0,60})"|'([^']{0,60})'/g))
    out.push(match[1] ?? match[2] ?? '');
  for (const match of text.matchAll(/-?\d+(?:[.,]\d+)?/g)) out.push(match[0]);
  for (const match of text.matchAll(/[A-Za-zА-Яа-яЁё][\w@.-]+/g)) out.push(match[0]);
  return out;
}

// Whether the domain really has a bound on this side, wherever the page states it. A page can
// enforce a limit its markup never mentions - the discount that has to be between 0 and 100 says so
// only when a value is tried - and a boundary on one of those is found, not invented.
function domainBound(field: GoldField, side: string): boolean {
  const v = field.validity;
  if (v.type === 'number') return side === 'min' ? v.min !== undefined : v.max !== undefined;
  if (v.type === 'text')
    return side === 'min' ? v.minLength !== undefined : v.maxLength !== undefined;
  return false;
}

// Whether the application should accept this value, by the gold - not by what the page does today.
export function goldAccepts(field: GoldField, value: string): boolean | null {
  const v = field.validity;
  if (v.type === 'number') {
    const n = numberOf(value);
    if (n === null) return value.trim() === '' ? !field.required : false;
    if (v.min !== undefined && n < v.min) return false;
    if (v.max !== undefined && n > v.max) return false;
    if (v.integer && !Number.isInteger(n)) return false;
    return true;
  }
  if (v.type === 'text') {
    if (value === '') return !v.required && !field.required;
    if (v.maxLength !== undefined && value.length > v.maxLength) return false;
    if (v.minLength !== undefined && value.length < v.minLength) return false;
    if (v.format === 'email') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
    if (v.format === 'json') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }
  if (v.type === 'option')
    return v.options.some((o) => o.toLowerCase() === value.trim().toLowerCase());
  if (v.type === 'toggle')
    return ['checked', 'unchecked', 'true', 'false', 'on', 'off'].includes(
      value.trim().toLowerCase(),
    );
  if (v.type === 'file') return v.accept.some((a) => value.toLowerCase().endsWith(a));
  return null;
}

interface PageContext {
  page: GoldPage;
  route: RouteRecord;
  entry: any;
  controls: InventoryControl[];
  fieldOfControl: Map<string, GoldField>;
  knownOutputs: Set<string>;
  takesInput: boolean;
}

function pageContexts(prepared: PreparedDataset, analysis: any): PageContext[] {
  const out: PageContext[] = [];
  for (const route of prepared.routes.filter((r) => r.inFeature)) {
    const page = prepared.gold.pages.find((p) => p.path === route.path);
    const entry = analysis.routes ? analysis.routes[route.routeId] : null;
    if (!page || !entry) continue;
    const controls = inventoryOf(prepared, route);
    const fieldOfControl = new Map<string, GoldField>();
    for (const field of page.fields) {
      const id = route.controlOf[field.testId];
      if (id) fieldOfControl.set(id, field);
    }
    const knownOutputs = new Set(controls.filter((c) => c.output === true).map((c) => c.id));
    for (const output of page.outputs)
      if (output.testId && route.controlOf[output.testId])
        knownOutputs.add(route.controlOf[output.testId]);
    const takesInput = page.fields.some((f) => {
      const id = route.controlOf[f.testId];
      const control = controls.find((c) => c.id === id);
      return Boolean(control && isField(control));
    });
    out.push({ page, route, entry, controls, fieldOfControl, knownOutputs, takesInput });
  }
  return out;
}

export function gradeAnalysis(prepared: PreparedDataset, analysis: any): GradeResult {
  const items: GradeItem[] = [];
  const notes: string[] = [];
  const gold: GoldApp = prepared.gold;
  const contexts = pageContexts(prepared, analysis);
  const featureAnalysis = analysis.features ? analysis.features[prepared.featureId] : null;
  const add = (grader: string, page: string, what: string, passed: boolean, detail?: string) =>
    items.push({ grader, page, what, passed, detail });

  for (const ctx of contexts) {
    const page = ctx.page.path;
    const conditions = liveConditions(ctx.entry);
    const written = authored(ctx.entry);

    // 1. The main flow: what the input produces, said by the analysis, and read where the page shows it.
    if (ctx.takesInput) {
      const flows = written.filter((c) => c.scenario === 'positive' && c.layer === 'behavior');
      add(
        'main-flow',
        page,
        'a condition says what the input produces',
        flows.length > 0,
        flows.length === 0 ? 'no positive behavior condition the analysis wrote' : undefined,
      );
      if (ctx.knownOutputs.size > 0) {
        const named = flows.some(
          (c) =>
            Array.isArray(c.outputs) && c.outputs.some((id: string) => ctx.knownOutputs.has(id)),
        );
        add('main-flow-output', page, 'the main flow names where the result appears', named);
      }
      const tokens = ctx.page.mainFlow.expectTokens;
      const carries = flows.some((c) => tokens.every((token) => textNames(statedResult(c), token)));
      // An analysis is free to work its main flow on an input of its own, and then the value it
      // states is one only a reader can check. Code decides the rest: a flow that names no value at
      // all states nothing to check.
      const withValue = flows.find((c) => /\d/.test(statedResult(c)));
      const item: GradeItem = {
        grader: 'main-flow-value',
        page,
        what: 'the main flow states the value the page should produce (' + tokens.join(', ') + ')',
        passed: carries,
      };
      if (!carries && withValue) {
        item.deferred = true;
        item.subject = {
          conditionId: String(withValue.conditionId),
          text:
            statedResult(withValue) + (withValue.sourceInput ? '\n' + withValue.sourceInput : ''),
        };
        item.detail = 'a value of its own, not the one the gold names';
      } else if (!carries) {
        item.detail = 'no value at all';
      }
      items.push(item);
    }

    // 2. Every limit the page states has a boundary, and no boundary stands on a limit that is not
    //    there at all - one the markup states, or one the domain really has and a probe can find.
    for (const [controlId, field] of ctx.fieldOfControl) {
      const parameter = (ctx.entry.parameters || []).find((p: any) => p.control === controlId);
      for (const limit of field.limits) {
        const control = ctx.controls.find((c) => c.id === controlId);
        if (control && control.type === 'file') continue;
        const has = Boolean(
          parameter &&
          (parameter.boundaries || []).some(
            (b: any) =>
              b.boundary === limit.side &&
              (b.values || []).some((v: string) =>
                limit.attribute.endsWith('length')
                  ? String(v).length === limit.value
                  : numberOf(v) === limit.value,
              ),
          ),
        );
        add(
          'limit-boundary',
          page,
          field.label + ': the ' + limit.side + ' limit of ' + limit.value + ' has a boundary',
          has,
        );
      }
      if (parameter) {
        for (const boundary of parameter.boundaries || []) {
          const real =
            field.limits.some((l) => l.side === boundary.boundary) ||
            domainBound(field, boundary.boundary);
          add(
            'limit-invented',
            page,
            field.label + ': no boundary on a limit that is not there',
            real,
            real ? undefined : 'boundary ' + boundary.boundary + ' on a field with no such limit',
          );
        }
        // 3. Nothing valid is called invalid.
        for (const partition of parameter.partitions || []) {
          if (partition.kind !== 'invalid') continue;
          for (const sample of partition.sampleValues || []) {
            const accepts = goldAccepts(field, sample);
            add(
              'false-invalid',
              page,
              field.label +
                ': "' +
                String(sample).slice(0, 20) +
                '" is not called invalid while the domain accepts it',
              accepts !== true,
              accepts === true ? 'gold accepts it' : undefined,
            );
          }
        }
      }
    }

    // 4. Rules the markup does not state: something tests them.
    for (const rule of ctx.page.rules) {
      const witnessControl = ctx.route.controlOf[rule.witness.field];
      const parameters = ctx.entry.parameters || [];
      const parameter = parameters.find((p: any) => p.control === witnessControl);
      const inPartition = Boolean(
        parameter &&
        (parameter.partitions || []).some(
          (p: any) =>
            (p.sampleValues || []).some((v: string) => standsFor(rule.witness, v)) &&
            (rule.witness.polarity === 'valid' ? p.kind === 'valid' : p.kind === 'invalid'),
        ),
      );
      const inCondition = conditions.some(
        (c) =>
          (rule.witness.polarity === 'valid'
            ? c.scenario === 'positive'
            : c.scenario === 'negative') &&
          (textNames(conditionText(c), rule.witness.value) ||
            valuesUsed(c, parameters, parameter).some((v) => standsFor(rule.witness, v))),
      );
      add(
        'rule-tested',
        page,
        'the rule "' + rule.statement.slice(0, 60) + '" is tested',
        inPartition || inCondition,
      );
    }

    // 5. The seeded defect: a condition carries its trigger and expects the right result.
    for (const defect of ctx.page.defects) {
      const triggers = (defect.triggerTokens || Object.values(defect.triggerValues)).filter(
        (v) => String(v).trim() !== '',
      );
      // A condition that would catch the defect names the case it happens in and expects the result
      // the page should give. The wording is the analyst's own, so the gold lists what may stand for
      // each; the judge in judge.ts is what decides finally.
      const targeted = conditions.some((c) => {
        // The values it works with, never the names it files them under: a partition called
        // "p_dec_empty" is the analysis's own bookkeeping and says nothing about what is tested.
        const text =
          conditionText(c) + ' ' + resolvedValues(c, ctx.entry.parameters || []).join(' ');
        const hasTrigger =
          triggers.length === 0 || triggers.some((v) => textNames(text, String(v)));
        // The result it expects is what decides, so it is looked for where a result is stated.
        const rightResult =
          defect.correctTokens.length === 0 ||
          defect.correctTokens.some(
            (token) =>
              mentions(c.expectedOutcome || '', token) || mentions(c.description || '', token),
          );
        return hasTrigger && rightResult;
      });
      add(
        'defect-targeted',
        page,
        'a condition would catch: ' + defect.description.slice(0, 70),
        targeted,
      );
      // 6. Today's wrong behaviour is never written down as the expected one.
      const lockedIn = conditions.filter(
        (c) =>
          defect.wrongTokens.some((token) => mentions(c.expectedOutcome || '', token)) &&
          !/today|currently|instead of|rather than|not a|should/i.test(c.expectedOutcome || ''),
      );
      add(
        'defect-not-locked-in',
        page,
        'the defect is not written down as the expected result',
        lockedIn.length === 0,
        lockedIn.length > 0 ? lockedIn[0].conditionId : undefined,
      );
    }

    // 7. Where nothing states a limit and the meaning suggests one, the analysis asks.
    for (const ambiguity of ctx.page.ambiguities) {
      const controlId = ctx.route.controlOf[ambiguity.testId];
      const field = ctx.fieldOfControl.get(controlId);
      const questions = (featureAnalysis && featureAnalysis.questions) || [];
      const asked = questions.some(
        (q: any) => q.about === controlId || (field && mentions(q.text, field.label)),
      );
      add(
        'question-asked',
        page,
        'a question is asked about ' + (field ? field.label : ambiguity.testId),
        asked,
      );
    }

    // 8. Sample values are test data, never anyone's.
    for (const parameter of ctx.entry.parameters || []) {
      for (const partition of parameter.partitions || []) {
        for (const sample of partition.sampleValues || []) {
          const text = String(sample);
          const email = text.match(/[\w.+-]+@([\w-]+\.[\w.-]+)/);
          const realEmail = email
            ? !/^(example\.(com|org|net)|test\.|localhost)/i.test(email[1])
            : false;
          const digits = text.replace(/[^\d]/g, '');
          const reserved = /555-?01\d\d|\+44\s?7700\s?900|4242\s?4242|4111\s?1111/.test(text);
          const longNumber =
            digits.length >= 7 &&
            !reserved &&
            parameter.kind !== 'number' &&
            parameter.kind !== 'date';
          add(
            'test-data',
            page,
            parameter.name + ': the sample is data that can never be anyone',
            !realEmail && !longNumber,
            realEmail
              ? 'email at a real domain'
              : longNumber
                ? 'a long number that is not a reserved test value'
                : undefined,
          );
        }
      }
    }

    // 9. The page's fields are all accounted for, and the review stays readable.
    const accounted = new Set<string>();
    for (const p of ctx.entry.parameters || []) if (p.control) accounted.add(p.control);
    for (const x of ctx.entry.excluded || []) if (x.control) accounted.add(x.control);
    const missed = ctx.controls.filter(
      (c) =>
        isField(c) &&
        !['header', 'nav', 'footer', 'aside'].includes(c.region || '') &&
        !accounted.has(c.id),
    );
    add(
      'fields-accounted',
      page,
      'every field of the page is a parameter or an exclusion with a reason',
      missed.length === 0,
      missed.length > 0 ? missed.map((c) => c.id).join(', ') : undefined,
    );
    const forPerson = conditions.filter((c) => c.reviewer !== 'assistant');
    add(
      'review-volume',
      page,
      'a person reviews at most 25 conditions on this page',
      forPerson.length <= 25,
      String(forPerson.length),
    );
  }

  // 10. Research: what it says to check is used or declined, and what does not apply is declined.
  if (gold.research && featureAnalysis) {
    const cited = new Set<string>();
    for (const entry of Object.values<any>(analysis.routes || {})) {
      for (const condition of entry.conditions || []) {
        for (const anchor of condition.anchors || [])
          if (anchor && anchor.kind === 'research') cited.add(anchor.ref);
      }
      for (const parameter of entry.parameters || []) {
        for (const set of (parameter.partitions || []).concat(parameter.boundaries || [])) {
          for (const anchor of set.anchors || [])
            if (anchor && anchor.kind === 'research') cited.add(anchor.ref);
        }
      }
    }
    const declined = new Set(
      ((featureAnalysis.research && featureAnalysis.research.declined) || []).map(
        (d: any) => d && d.check,
      ),
    );
    for (const check of gold.research.checks) {
      if (check.appliesHere) {
        add(
          'research-used',
          gold.pages[0].path,
          'the research check "' + check.statement.slice(0, 60) + '" is used',
          cited.has(check.id),
          declined.has(check.id) ? 'declined instead' : undefined,
        );
      } else {
        add(
          'research-declined',
          gold.pages[0].path,
          'the research check that does not apply here is declined',
          declined.has(check.id) || !cited.has(check.id),
        );
      }
    }
  }
  if (featureAnalysis) {
    const own = [featureAnalysis.purpose, featureAnalysis.fitsApplication].join(' ');
    const substantive = words(own).filter((w) => !TEMPLATE_WORDS.test(w)).length >= 8;
    add(
      'feature-purpose',
      gold.pages[0].path,
      'the feature analysis says what the feature is for',
      substantive,
    );
  } else {
    add('feature-purpose', gold.pages[0].path, 'the feature was analysed at all', false);
  }

  const byGrader: Record<string, { passed: number; total: number }> = {};
  for (const item of items) {
    const bucket = (byGrader[item.grader] ||= { passed: 0, total: 0 });
    bucket.total += 1;
    if (item.passed) bucket.passed += 1;
  }
  return { items, byGrader, notes };
}

// The graders whose failure means the analysis is not usable, as opposed to thinner than it could be.
export const CRITICAL_GRADERS = [
  'main-flow',
  'main-flow-output',
  'main-flow-value',
  'limit-boundary',
  'limit-invented',
  'false-invalid',
  // defect-targeted is deliberately not here: it matches words, and an analysis writes its own. It
  // reads "a discount greater than 100 percent is rejected" and the answer key says the trigger is
  // 150, so it calls a condition that would fail on the defect a miss. What decides is defect-judge.
  'defect-not-locked-in',
  'rule-tested',
  'research-used',
  'question-asked',
  'fields-accounted',
  'test-data',
];

export function passesCritically(result: GradeResult): boolean {
  return result.items.every((item) => !CRITICAL_GRADERS.includes(item.grader) || item.passed);
}

// What a set of graded items comes to - recomputed after a judge has settled what it settles.
export function summarize(items: GradeItem[]): {
  byGrader: Record<string, { passed: number; total: number }>;
  failures: string[];
  critical: boolean;
  unresolved: number;
} {
  const scored = items.filter((i) => i.unresolved !== true);
  const byGrader: Record<string, { passed: number; total: number }> = {};
  for (const item of scored) {
    const bucket = (byGrader[item.grader] ||= { passed: 0, total: 0 });
    bucket.total += 1;
    if (item.passed) bucket.passed += 1;
  }
  return {
    byGrader,
    failures: scored
      .filter((i) => !i.passed)
      .map((i) => i.grader + ': ' + i.what + (i.detail ? ' (' + i.detail + ')' : '')),
    critical: scored.every((item) => !CRITICAL_GRADERS.includes(item.grader) || item.passed),
    unresolved: items.length - scored.length,
  };
}
