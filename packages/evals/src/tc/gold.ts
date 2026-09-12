// What is true of a dataset page - the answer key the graders score an analysis against. Written by
// the page builder from the same decisions that produced the page's markup and script, so it can
// never drift from what the page does. Every field, output, rule and defect is keyed by the page's
// data-testid, which carries no meaning (f1, o1) and only maps a control id in the inventory back to
// its truth.

export type FieldRole =
  | 'quantity'
  | 'money'
  | 'date-time'
  | 'identifier'
  | 'credential'
  | 'free-text'
  | 'choice'
  | 'toggle'
  | 'search-filter'
  | 'file'
  | 'setting'
  | 'other';

export type ParameterKind =
  'text' | 'number' | 'email' | 'date' | 'select' | 'checkbox' | 'radio' | 'password' | 'other';

// What the application should accept - the domain's truth, not what the page happens to enforce.
export type Validity =
  | {
      type: 'number';
      min?: number | undefined;
      max?: number | undefined;
      integer?: boolean;
      required?: boolean;
    }
  | {
      type: 'text';
      minLength?: number | undefined;
      maxLength?: number | undefined;
      required?: boolean;
      format?: 'email' | 'json' | 'zip' | 'none' | undefined;
    }
  | { type: 'option'; options: string[] }
  | { type: 'toggle' }
  | { type: 'file'; accept: string[] };

export interface GoldLimit {
  side: 'min' | 'max';
  attribute: 'min' | 'max' | 'minlength' | 'maxlength';
  value: number;
  // Where the page states it. 'markup' limits need a boundary; 'label' ones need a boundary citing
  // the label or a question; a limit stated nowhere must never become a boundary.
  stated: 'markup' | 'label';
  // The label text that states it, for 'label'.
  excerpt?: string | undefined;
}

export interface GoldField {
  testId: string;
  key: string;
  label: string;
  meaning: string;
  role: FieldRole;
  kind: ParameterKind;
  validity: Validity;
  limits: GoldLimit[];
  required: boolean;
  // A value a person would really type, and what they see for it.
  sample: string;
  sampleOutcome: string;
  // A value the page states is not allowed, with where it says so - absent when nothing does.
  invalid?:
    | {
        sample: string;
        outcome: string;
        signal: 'html5-constraint' | 'form-label';
        excerpt: string;
      }
    | undefined;
  options?: string[] | undefined;
  // Hidden until the named field's toggle turns it on.
  revealedBy?: string | undefined;
  pii?: boolean | undefined;
}

export interface GoldOutput {
  // Absent for a result shown as plain text: nothing in the inventory stands for it.
  testId?: string | undefined;
  kind: 'readonly-field' | 'text-region' | 'copy-button' | 'download';
  label: string;
}

// The condition the reference analysis writes for an item - one a careful analyst would write.
export interface GoldText {
  description: string;
  outcome: string;
  sourceInput?: string | undefined;
  technique: 'error-guessing' | 'property' | 'metamorphic' | 'decision-table';
  relation?: string | undefined;
  followUpInput?: string | undefined;
  scenario: 'positive' | 'negative';
  negativeCategory?: string | undefined;
  layer: 'behavior' | 'rule' | 'field';
  parameters?: Record<string, string> | undefined;
}

export interface GoldMainFlow {
  inputs: Record<string, string>;
  // Tokens a correct expected result for these inputs carries (a count, a converted value).
  expectTokens: string[];
  outputs: string[];
  text: GoldText;
}

export interface GoldRule {
  id: string;
  statement: string;
  fields: string[];
  source: 'domain' | 'human';
  // A value that shows the rule, and whether the application should accept it.
  witness: { field: string; value: string; polarity: 'valid' | 'invalid' };
  text: GoldText;
}

export interface GoldDefect {
  id: string;
  kind: 'precision' | 'off-by-one' | 'stale-state' | 'missing-validation' | 'wrong-result';
  // For a judge and for a person reading the report: what is wrong and how it shows.
  description: string;
  trigger: string;
  triggerValues: Record<string, string>;
  // How a condition may name the case in words, when the trigger is not a value anyone would type.
  triggerTokens?: string[] | undefined;
  correct: string;
  wrong: string;
  // A condition catching the defect expects a result carrying these, and never states these.
  correctTokens: string[];
  wrongTokens: string[];
  text: GoldText;
}

export interface GoldPage {
  path: string;
  title: string;
  archetype: string;
  fields: GoldField[];
  outputs: GoldOutput[];
  // Controls present only as repeats of one another, each naming the one it repeats.
  duplicates: Array<{ testId: string; of: string }>;
  mainFlow: GoldMainFlow;
  rules: GoldRule[];
  defects: GoldDefect[];
  // Where the analysis should ask rather than decide: a field whose meaning suggests a limit nothing
  // states.
  ambiguities: Array<{ testId: string; question: string }>;
  // Research check ids that apply to this page.
  researchChecks: string[];
}

export interface GoldApp {
  datasetId: string;
  appName: string;
  purpose: string;
  feature: {
    name: string;
    purpose: string;
    fitsApplication: string;
    impact: 'high' | 'medium' | 'low';
    archetype: string;
  };
  pages: GoldPage[];
  frame: Array<{ testId: string; label: string; options: string[] }>;
  research: null | {
    archetype: string;
    slugs: string[];
    sources: Array<{ id: string; url: string; title: string }>;
    checks: Array<{
      id: string;
      statement: string;
      sourceIds: string[];
      appliesHere: boolean;
      // The condition that carries the check out on this page, and the seeded defect it would catch
      // when the page has one.
      text?: GoldText | undefined;
      defect?: GoldDefect['kind'] | undefined;
    }>;
  };
  notes: Array<{ note: string; supports: 'rule' | 'contradiction'; ruleId: string }>;
  api: null | { path: string; body: unknown; routes: string[] };
  appKind: 'sandbox' | 'production';
}
