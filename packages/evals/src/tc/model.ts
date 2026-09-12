// The input space of /define-test-conditions, as factors a dataset varies. Every factor is something
// that changed what an analysing assistant wrote on a live run, or something the stage's rules treat
// differently - so a dataset is a point in this space, and the covering array in covering.ts picks
// the points so that every combination of `strength` factors appears in at least one of them.
//
// Adding a factor or a level is the way a newly observed failure enters the suite: if a live run
// fails in a way no combination below can reproduce, the model is missing a dimension.

export type ArchetypeId =
  | 'converter'
  | 'calculator'
  | 'generator'
  | 'formatter'
  | 'template-export'
  | 'search-list'
  | 'wizard'
  | 'settings'
  | 'file-upload'
  | 'login';

export interface Factor<T extends string = string> {
  id: keyof DatasetFactors;
  levels: readonly T[];
  // Why the factor is in the model: the behaviour it probes.
  why: string;
}

export interface DatasetFactors {
  archetype: ArchetypeId;
  // Where the field limits live: none, HTML5 min/max, HTML5 length or required, or stated in the
  // label text only ("1-1000") with nothing in the markup.
  limits: 'none' | 'markup-range' | 'markup-length' | 'label-only';
  // Where the page shows its result.
  output: 'readonly-field' | 'text-region' | 'copy-button' | 'download';
  // A defect seeded into the page's behaviour.
  defect:
    'none' | 'precision' | 'off-by-one' | 'stale-state' | 'missing-validation' | 'wrong-result';
  // A rule of the domain the markup does not state.
  rule: 'none' | 'cross-field' | 'semantic';
  // How well the fields are labelled.
  labels: 'clear' | 'placeholder-only' | 'hint-only';
  language: 'en' | 'ru';
  size: 'small' | 'large';
  repeated: 'none' | 'repeated-controls';
  frame: 'none' | 'language-switch';
  server: 'client-only' | 'api-call';
  research: 'cached-relevant' | 'cached-mixed' | 'none';
  note: 'none' | 'supporting' | 'contradicting';
  appKind: 'sandbox' | 'production';
  pages: 'one' | 'two';
  pii: 'none' | 'contact-fields';
  reveal: 'none' | 'toggle-reveals-field';
  ambiguity: 'none' | 'unstated-limit';
}

export const FACTORS: Factor[] = [
  {
    id: 'archetype',
    levels: [
      'converter',
      'calculator',
      'generator',
      'formatter',
      'template-export',
      'search-list',
      'wizard',
      'settings',
      'file-upload',
      'login',
    ],
    why: 'what the page does decides what its main flow, its outputs and its typical defects are',
  },
  {
    id: 'limits',
    levels: ['none', 'markup-range', 'markup-length', 'label-only'],
    why: 'boundaries must come from a stated limit - and never be invented where none is',
  },
  {
    id: 'output',
    levels: ['readonly-field', 'text-region', 'copy-button', 'download'],
    why: 'the main flow has to name where the result appears; export controls were excused on a live run',
  },
  {
    id: 'defect',
    levels: [
      'none',
      'precision',
      'off-by-one',
      'stale-state',
      'missing-validation',
      'wrong-result',
    ],
    why: 'a condition set is worth what it would catch; each level is a defect class seen on real pages',
  },
  {
    id: 'rule',
    levels: ['none', 'cross-field', 'semantic'],
    why: 'a rule the markup does not state is where reading the feature beats extracting its fields',
  },
  {
    id: 'labels',
    levels: ['clear', 'placeholder-only', 'hint-only'],
    why: 'template filler appeared where a label alone was all there was to read',
  },
  {
    id: 'language',
    levels: ['en', 'ru'],
    why: 'labels and messages in another language than the skill',
  },
  {
    id: 'size',
    levels: ['small', 'large'],
    why: 'a 25-field page pushed a live run into filling templates',
  },
  {
    id: 'repeated',
    levels: ['none', 'repeated-controls'],
    why: 'repeated rows and identical buttons have to be accounted for as duplicates, not skipped',
  },
  {
    id: 'frame',
    levels: ['none', 'language-switch'],
    why: 'the site frame is tested once; it became a parameter on 13 routes of a live run',
  },
  {
    id: 'server',
    levels: ['client-only', 'api-call'],
    why: 'which probes apply depends on whether the page talks to a server',
  },
  {
    id: 'research',
    levels: ['cached-relevant', 'cached-mixed', 'none'],
    why: 'research checks must be used or declined - 35 of 36 were dropped on a live run',
  },
  {
    id: 'note',
    levels: ['none', 'supporting', 'contradicting'],
    why: "a person's words outrank the markup, and a contradiction has to reach the conditions",
  },
  {
    id: 'appKind',
    levels: ['sandbox', 'production'],
    why: 'production forbids probes, so what the page enforces stays unknown',
  },
  {
    id: 'pages',
    levels: ['one', 'two'],
    why: 'a feature over several pages needs a main flow on each page that takes input',
  },
  {
    id: 'pii',
    levels: ['none', 'contact-fields'],
    why: 'sample values must be test data that can never be anyone',
  },
  {
    id: 'reveal',
    levels: ['none', 'toggle-reveals-field'],
    why: 'a field that appears only after a toggle is still a parameter',
  },
  {
    id: 'ambiguity',
    levels: ['none', 'unstated-limit'],
    why: 'where nothing states a limit and the meaning suggests one, the analysis asks instead of inventing',
  },
];

// The factors whose three-way combinations the suite covers; every other factor is covered in pairs.
// These are the ones a wrong combination of which produced a wrong analysis on live runs.
export const CORE_FACTORS: Array<keyof DatasetFactors> = [
  'archetype',
  'limits',
  'output',
  'defect',
  'rule',
  'labels',
];

// What each kind of page can carry. A combination outside these is not a page anyone builds, so the
// covering array never asks for it.
export const CAPABILITIES: Record<
  ArchetypeId,
  {
    limits: Array<DatasetFactors['limits']>;
    output: Array<DatasetFactors['output']>;
    defect: Array<DatasetFactors['defect']>;
    rule: Array<DatasetFactors['rule']>;
    size: Array<DatasetFactors['size']>;
    reveal: Array<DatasetFactors['reveal']>;
    pii: Array<DatasetFactors['pii']>;
  }
> = {
  converter: {
    limits: ['none', 'markup-range', 'label-only'],
    output: ['readonly-field', 'text-region', 'copy-button'],
    defect: ['none', 'precision', 'stale-state', 'wrong-result'],
    rule: ['none', 'cross-field', 'semantic'],
    size: ['small'],
    reveal: ['none', 'toggle-reveals-field'],
    pii: ['none'],
  },
  calculator: {
    limits: ['none', 'markup-range', 'label-only'],
    output: ['readonly-field', 'text-region', 'copy-button'],
    defect: ['none', 'precision', 'off-by-one', 'missing-validation', 'wrong-result'],
    rule: ['none', 'cross-field', 'semantic'],
    size: ['small'],
    reveal: ['none', 'toggle-reveals-field'],
    pii: ['none'],
  },
  generator: {
    limits: ['none', 'markup-range', 'markup-length', 'label-only'],
    output: ['readonly-field', 'text-region', 'copy-button', 'download'],
    defect: ['none', 'off-by-one', 'stale-state', 'missing-validation', 'wrong-result'],
    rule: ['none', 'cross-field', 'semantic'],
    size: ['small'],
    reveal: ['none', 'toggle-reveals-field'],
    pii: ['none'],
  },
  formatter: {
    limits: ['none', 'markup-length'],
    output: ['text-region', 'copy-button', 'download'],
    defect: ['none', 'precision', 'stale-state', 'missing-validation', 'wrong-result'],
    rule: ['none', 'semantic'],
    size: ['small'],
    reveal: ['none'],
    pii: ['none'],
  },
  'template-export': {
    limits: ['none', 'markup-length', 'label-only'],
    output: ['download', 'copy-button'],
    defect: ['none', 'stale-state', 'missing-validation', 'wrong-result'],
    rule: ['none', 'cross-field', 'semantic'],
    size: ['small', 'large'],
    reveal: ['none', 'toggle-reveals-field'],
    pii: ['none', 'contact-fields'],
  },
  'search-list': {
    limits: ['none', 'markup-length', 'markup-range'],
    output: ['text-region'],
    defect: ['none', 'off-by-one', 'stale-state', 'wrong-result'],
    rule: ['none', 'semantic'],
    size: ['small'],
    reveal: ['none', 'toggle-reveals-field'],
    pii: ['none'],
  },
  wizard: {
    limits: ['none', 'markup-length', 'markup-range', 'label-only'],
    output: ['text-region'],
    defect: ['none', 'off-by-one', 'stale-state', 'missing-validation', 'wrong-result'],
    rule: ['none', 'cross-field', 'semantic'],
    size: ['small', 'large'],
    reveal: ['none', 'toggle-reveals-field'],
    pii: ['none', 'contact-fields'],
  },
  settings: {
    limits: ['none', 'markup-range'],
    output: ['text-region'],
    defect: ['none', 'off-by-one', 'stale-state', 'wrong-result'],
    rule: ['none', 'semantic'],
    size: ['small'],
    reveal: ['none', 'toggle-reveals-field'],
    pii: ['none'],
  },
  'file-upload': {
    limits: ['none', 'label-only'],
    output: ['text-region'],
    defect: ['none', 'off-by-one', 'missing-validation', 'wrong-result'],
    rule: ['none', 'semantic'],
    size: ['small'],
    reveal: ['none'],
    pii: ['none'],
  },
  login: {
    limits: ['none', 'markup-length', 'label-only'],
    output: ['text-region'],
    defect: ['none', 'stale-state', 'missing-validation', 'wrong-result'],
    rule: ['none', 'semantic'],
    size: ['small'],
    reveal: ['none'],
    pii: ['none', 'contact-fields'],
  },
};

// Whether some page could carry these levels together. With no archetype chosen yet, it is
// feasible when any archetype supports it - a combination no kind of page can hold is not one the
// suite can ask for.
export function feasible(partial: Partial<DatasetFactors>): boolean {
  const archetype = partial.archetype;
  if (!archetype) {
    return (Object.keys(CAPABILITIES) as ArchetypeId[]).some((a) =>
      feasible({ ...partial, archetype: a }),
    );
  }
  const can = CAPABILITIES[archetype];
  for (const key of Object.keys(can) as Array<keyof typeof can>) {
    const value = partial[key as keyof DatasetFactors] as string | undefined;
    if (value !== undefined && !(can[key] as string[]).includes(value)) return false;
  }
  // A limit stated nowhere cannot be what a person asked about when the page states one.
  if (
    partial.ambiguity === 'unstated-limit' &&
    partial.limits !== undefined &&
    partial.limits !== 'none'
  )
    return false;
  // A precision defect needs a number the page computes; a length limit says nothing of one.
  if (partial.defect === 'precision' && partial.limits === 'markup-length') return false;
  // On production nothing is probed, so a note contradicting the markup is still asked about, never
  // observed: fine. A contradicting note needs a limit to contradict.
  if (partial.note === 'contradicting' && partial.limits === 'none') return false;
  // The two rules above, met through the limit neither names.
  if (partial.note === 'contradicting' && partial.ambiguity === 'unstated-limit') return false;
  return true;
}

export interface DatasetSpec {
  id: string;
  seed: number;
  factors: DatasetFactors;
  // 'covering' rows come from the covering array; 'seed' rows reproduce a failure seen on a live run.
  origin: 'covering' | 'seed';
  // A held-out dataset is never looked at while the skill is tuned, so its score is not a score of
  // the tuning itself.
  split: 'dev' | 'held-out';
}
