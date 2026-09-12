// Turns a dataset spec into a small web application and its answer key: one or two pages of one
// feature, a home page linking them, the site frame when the spec asks for one, the research record
// the analysis may reuse, the notes a person left, and the API the pages call.
import type { ArchetypeId, DatasetSpec } from './model.js';
import type { GoldApp, GoldPage, GoldDefect, GoldText } from './gold.js';
import {
  buildConverter,
  buildCalculator,
  buildGenerator,
  type BuildContext,
  type BuiltPage,
} from './archetypes-a.js';
import { buildFormatter, buildTemplate, buildSearchList, PRODUCTS } from './archetypes-b.js';
import { buildWizard, buildSettings, buildFileUpload, buildLogin } from './archetypes-c.js';
import { shell, esc } from './page-kit.js';

const BUILDERS: Record<ArchetypeId, (ctx: BuildContext) => BuiltPage> = {
  converter: buildConverter,
  calculator: buildCalculator,
  generator: buildGenerator,
  formatter: buildFormatter,
  'template-export': buildTemplate,
  'search-list': buildSearchList,
  wizard: buildWizard,
  settings: buildSettings,
  'file-upload': buildFileUpload,
  login: buildLogin,
};

const PATHS: Record<ArchetypeId, string> = {
  converter: '/tools/converter',
  calculator: '/tools/price-calculator',
  generator: '/tools/code-generator',
  formatter: '/tools/json-formatter',
  'template-export': '/templates/bug-report',
  'search-list': '/catalogue',
  wizard: '/signup',
  settings: '/settings',
  'file-upload': '/tools/csv-import',
  login: '/login',
};

// Pages that belong to one feature together; a second page of a feature comes from its family.
const FAMILIES: Array<{
  name: { en: string; ru: string };
  purpose: string;
  members: ArchetypeId[];
  impact: 'high' | 'medium' | 'low';
}> = [
  {
    name: { en: 'Calculators', ru: 'Калькуляторы' },
    purpose: 'Works out the numbers a tester writes into a test before running it',
    members: ['converter', 'calculator'],
    impact: 'high',
  },
  {
    name: { en: 'Data tools', ru: 'Инструменты данных' },
    purpose: 'Produces and reshapes test data',
    members: ['generator', 'formatter', 'file-upload'],
    impact: 'medium',
  },
  {
    name: { en: 'Documents', ru: 'Документы' },
    purpose: 'Fills in testing documents and exports them',
    members: ['template-export'],
    impact: 'medium',
  },
  {
    name: { en: 'Catalogue', ru: 'Каталог' },
    purpose: 'Finds products by name, category and price',
    members: ['search-list'],
    impact: 'high',
  },
  {
    name: { en: 'Account', ru: 'Аккаунт' },
    purpose: 'Signs a person up, in, and keeps their settings',
    members: ['wizard', 'login', 'settings'],
    impact: 'high',
  },
];

// What published practice says to check for each kind of page, each with the condition that carries
// it out and the seeded defect it would catch. Generic on purpose: the research record names the
// kind of feature, never the application.
type ResearchItem = { statement: string; defect?: GoldDefect['kind']; text: GoldText };
const pos = (
  description: string,
  outcome: string,
  layer: GoldText['layer'] = 'behavior',
): GoldText => ({ description, outcome, technique: 'error-guessing', scenario: 'positive', layer });
const neg = (description: string, outcome: string, category: string): GoldText => ({
  description,
  outcome,
  technique: 'error-guessing',
  scenario: 'negative',
  negativeCategory: category,
  layer: 'rule',
});
const RESEARCH: Record<ArchetypeId, ResearchItem[]> = {
  converter: [
    {
      statement:
        'Verify conversions against the SI conversion factors and that converting there and back returns the original amount',
      defect: 'wrong-result',
      text: {
        ...pos(
          'Converting 100 m to feet and the result back gives 100 m again',
          'the second conversion reads 100',
        ),
        technique: 'metamorphic',
        relation: 'round-trip',
        sourceInput: 'amount 100, from metres to feet',
        followUpInput: 'the feet shown, converted back to metres',
      },
    },
    {
      statement:
        'Verify negative and fractional amounts are converted, not refused, where the measure allows them',
      text: pos(
        '-12.5 metres converts to -41.01 feet rather than being refused',
        'the result reads -41.01',
      ),
    },
    {
      statement:
        'Verify results are rounded to a stated precision rather than showing binary floating point artefacts',
      defect: 'precision',
      text: pos(
        '0.3 metres converts to 0.984 feet, rounded to three decimals',
        'the result reads 0.984, with no long tail',
      ),
    },
  ],
  calculator: [
    {
      statement:
        'Verify monetary totals are rounded to two decimals and never show floating point artefacts',
      defect: 'precision',
      text: pos('3 items at 19.99 total 59.97, two decimals', 'the total reads 59.97'),
    },
    {
      statement:
        'Verify a percentage discount is limited to 0-100 and never produces a negative total',
      defect: 'missing-validation',
      text: neg(
        'A discount of 101 percent produces no negative total',
        'no negative total is shown for 101 percent',
        'invalid_input',
      ),
    },
    {
      statement: 'Verify quantity limits are enforced at the boundary and one past it',
      defect: 'off-by-one',
      text: pos(
        'The largest quantity the page states still gets a total',
        'a total is shown for the largest quantity allowed',
        'rule',
      ),
    },
  ],
  generator: [
    {
      statement: 'Verify the generator returns exactly as many items as requested',
      defect: 'off-by-one',
      text: {
        ...pos('Asking for 12 codes lists exactly 12', 'the result holds 12 codes'),
        technique: 'property',
        relation: 'count-matches-request',
        sourceInput: 'how many 12',
      },
    },
    {
      statement: 'Verify generated identifiers within a batch are unique',
      defect: 'wrong-result',
      text: {
        ...pos('No code repeats within a batch of 50', 'all 50 codes are different'),
        technique: 'property',
        relation: 'all-unique',
        sourceInput: 'how many 50',
      },
    },
    {
      statement: 'Verify the output format follows the chosen options for every item',
      text: {
        ...pos(
          'With uppercase on and prefix T, every code reads T- followed by capitals',
          'every code matches T-[A-Z0-9]{8}',
        ),
        technique: 'property',
        relation: 'format-conformance',
        sourceInput: 'how many 10, prefix T, uppercase on',
      },
    },
  ],
  formatter: [
    {
      statement:
        'Verify strict JSON syntax per RFC 8259: trailing commas and single quotes are errors',
      defect: 'missing-validation',
      text: neg(
        '{"a":1,} with a trailing comma is reported as invalid JSON',
        'the error names the unexpected } and nothing is formatted',
        'invalid_input',
      ),
    },
    {
      statement: 'Verify pretty-printing preserves every value, including numbers beyond 2^53',
      defect: 'precision',
      text: pos(
        'Formatting {"n":9007199254740993} keeps every digit',
        'the result shows 9007199254740993',
      ),
    },
    {
      statement: 'Verify an error message replaces any earlier success verdict',
      defect: 'stale-state',
      text: neg(
        'A parse error after a valid document replaces the earlier verdict',
        'only the error is shown, the earlier verdict is gone',
        'error_path',
      ),
    },
  ],
  'template-export': [
    {
      statement: 'Verify every field of the report reaches the exported document',
      defect: 'wrong-result',
      text: pos(
        'The actual result typed as Nothing happens reaches the export',
        'the export carries Actual result: Nothing happens',
      ),
    },
    {
      statement: 'Verify required fields such as the title are enforced before export',
      defect: 'missing-validation',
      text: neg(
        'A report with no title is not exported',
        'the page asks for a title and no file is produced',
        'invalid_input',
      ),
    },
    {
      statement: 'Verify the export file name is derived safely from user input',
      text: pos(
        'A bug id with a slash, A/B, exports as A_B.txt',
        'the file downloads as A_B.txt',
        'rule',
      ),
    },
  ],
  'search-list': [
    {
      statement: 'Verify search is case-insensitive and matches partial words',
      defect: 'wrong-result',
      text: pos(
        'Searching "ham" finds Hammer and Novel: The Hammer',
        'the list shows Hammer and Novel: The Hammer',
      ),
    },
    {
      statement: 'Verify the result count equals the number of listed items',
      defect: 'off-by-one',
      text: pos(
        'Category Games lists 3 products and the count says 3',
        'the count reads 3 and 3 products are listed',
      ),
    },
    {
      statement: 'Verify clearing the search restores the full list',
      defect: 'stale-state',
      text: neg(
        'Clearing the search after Drill brings back every product',
        'the count reads 12 again',
        'error_path',
      ),
    },
  ],
  wizard: [
    {
      statement: 'Verify each step validates its required fields before moving on',
      defect: 'missing-validation',
      text: neg(
        'Next with the email empty keeps the sign-up on step 1',
        'a message asks for the email and step 2 does not open',
        'invalid_input',
      ),
    },
    {
      statement: 'Verify going back keeps what was entered on earlier steps',
      defect: 'stale-state',
      text: neg(
        'Back from step 2 keeps the email user@example.com in step 1',
        'step 1 still shows user@example.com',
        'error_path',
      ),
    },
    {
      statement: 'Verify the summary reflects the plan and quantity chosen',
      defect: 'wrong-result',
      text: pos(
        'The Basic plan summary reads 12.00 per month',
        'the summary reads Basic, 12.00 per month',
      ),
    },
  ],
  settings: [
    {
      statement: 'Verify saved preferences persist across reloads and sessions',
      defect: 'wrong-result',
      text: {
        ...pos(
          'Font size 18, once saved, is still 18 after a reload',
          'after a reload the preview reads 18 px',
        ),
        technique: 'property',
        relation: 'persists-across-navigation',
        sourceInput: 'font size 18, Save, reload',
      },
    },
    {
      statement: 'Verify restoring defaults resets both the controls and what they affect',
      defect: 'stale-state',
      text: neg(
        'Restore defaults brings the preview back to 16 px',
        'the preview reads 16 px after Restore defaults',
        'error_path',
      ),
    },
    {
      statement: 'Verify slider limits are enforced at both ends',
      defect: 'off-by-one',
      text: pos(
        'The smallest font size, 12, is saved as 12',
        'the preview reads 12 px after Save',
        'rule',
      ),
    },
  ],
  'file-upload': [
    {
      statement: 'Verify only the accepted file types are imported',
      defect: 'missing-validation',
      text: neg(
        'A file named notes.txt is refused',
        'a message says only .csv files can be imported',
        'invalid_input',
      ),
    },
    {
      statement: 'Verify the header row is not counted as data',
      defect: 'off-by-one',
      text: pos('A header row and 1 data row import as 1 row', 'the summary reads 1 rows'),
    },
    {
      statement: 'Verify the chosen delimiter is used to split columns',
      defect: 'wrong-result',
      text: pos('With Semicolon chosen, x;y imports as 2 columns', 'the summary reads 2 columns'),
    },
  ],
  login: [
    {
      statement: 'Verify authentication errors do not reveal whether the account exists (OWASP)',
      defect: 'wrong-result',
      text: neg(
        'An unknown email and a known one with a wrong password get the same message',
        'both attempts show the same message',
        'permission_denied',
      ),
    },
    {
      statement: 'Verify password length rules are enforced before submission',
      defect: 'missing-validation',
      text: neg(
        'A 7-character password is refused before anything is sent',
        'a message asks for at least 8 characters',
        'boundary',
      ),
    },
    {
      statement: 'Verify an earlier error is cleared by a later successful sign-in',
      defect: 'stale-state',
      text: neg(
        'A correct sign-in after a failed one shows only the welcome',
        'the earlier error is gone',
        'error_path',
      ),
    },
  ],
};

const SOURCES = [
  {
    id: 's1',
    url: 'https://www.istqb.org/certifications/certified-tester-foundation-level',
    title: 'ISTQB CTFL syllabus',
  },
  { id: 's2', url: 'https://www.rfc-editor.org/rfc/rfc8259', title: 'RFC 8259 JSON' },
  {
    id: 's3',
    url: 'https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html',
    title: 'OWASP Authentication Cheat Sheet',
  },
  { id: 's4', url: 'https://www.bipm.org/en/publications/si-brochure', title: 'BIPM SI Brochure' },
  {
    id: 's5',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Constraint_validation',
    title: 'MDN Constraint validation',
  },
  {
    id: 's6',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/',
    title: 'WCAG 2.2 Understanding',
  },
];

const ARCHETYPE_NAMES: Record<ArchetypeId, { archetype: string; slugs: string[] }> = {
  converter: {
    archetype: 'unit converter',
    slugs: [
      'unit-converter',
      'unit-conversion',
      'measurement-converter',
      'converter',
      'unit-converter-calculator',
    ],
  },
  calculator: {
    archetype: 'price calculator',
    slugs: [
      'price-calculator',
      'discount-calculator',
      'calculator',
      'shopping-calculator',
      'order-total-calculator',
    ],
  },
  generator: {
    archetype: 'identifier generator',
    slugs: [
      'identifier-generator',
      'code-generator',
      'id-generator',
      'random-code-generator',
      'unique-code-generator',
    ],
  },
  formatter: {
    archetype: 'json formatter',
    slugs: [
      'json-formatter',
      'json-formatter-and-validator',
      'json-validator',
      'formatter',
      'code-formatter',
    ],
  },
  'template-export': {
    archetype: 'bug report template',
    slugs: [
      'bug-report-template',
      'document-template',
      'report-template',
      'template-export',
      'bug-report-form',
    ],
  },
  'search-list': {
    archetype: 'product search',
    slugs: [
      'product-search',
      'product-catalogue',
      'catalogue-search',
      'search-and-filter',
      'product-list',
    ],
  },
  wizard: {
    archetype: 'multi-step sign-up',
    slugs: [
      'multi-step-sign-up',
      'signup-wizard',
      'subscription-sign-up',
      'multi-step-form',
      'wizard',
    ],
  },
  settings: {
    archetype: 'user settings',
    slugs: ['user-settings', 'settings', 'preferences', 'user-preferences', 'settings-page'],
  },
  'file-upload': {
    archetype: 'csv import',
    slugs: ['csv-import', 'file-upload', 'file-import', 'csv-upload', 'data-import'],
  },
  login: {
    archetype: 'sign-in form',
    slugs: ['sign-in-form', 'login-form', 'login', 'authentication', 'sign-in'],
  },
};

export interface BuiltApp {
  gold: GoldApp;
  // Path -> HTML, and the JSON the pages fetch.
  files: Record<string, string>;
}

function familyOf(archetype: ArchetypeId) {
  return FAMILIES.find((f) => f.members.includes(archetype))!;
}

export function buildApp(spec: DatasetSpec): BuiltApp {
  const factors = spec.factors;
  const lang = factors.language;
  const family = familyOf(factors.archetype);
  const api = factors.server === 'api-call';
  const primary = BUILDERS[factors.archetype]({
    factors,
    lang,
    path: PATHS[factors.archetype],
    secondary: false,
    api,
  });
  const built: BuiltPage[] = [primary];
  if (factors.pages === 'two') {
    const sibling = family.members.find((m) => m !== factors.archetype) || factors.archetype;
    const path = sibling === factors.archetype ? PATHS[sibling] + '-2' : PATHS[sibling];
    const second = BUILDERS[sibling]({ factors, lang, path, secondary: true, api: false });
    if (sibling === factors.archetype) {
      second.gold.title += ' 2';
      second.title += ' 2';
      second.heading += ' 2';
    }
    built.push(second);
  }
  const pages: GoldPage[] = built.map((b) => b.gold);
  const nav = [{ path: '/', label: lang === 'ru' ? 'Главная' : 'Home' }].concat(
    pages.map((p) => ({ path: p.path, label: p.title })),
  );
  const files: Record<string, string> = {};
  const frame = factors.frame === 'language-switch';
  const configFetch =
    "fetch('/api/config.json').then(function(r){return r.json();}).catch(function(){});";
  for (const b of built) {
    const natural = ['converter', 'search-list', 'wizard'].includes(b.gold.archetype);
    const script = b.script + (api && b === primary && !natural ? '\n' + configFetch : '');
    files[b.gold.path] = shell({
      lang,
      title: b.title,
      heading: b.heading,
      intro: b.intro,
      nav,
      frame,
      body: b.body,
      script,
    });
  }
  files['/'] = shell({
    lang,
    title: lang === 'ru' ? 'Инструменты тестировщика' : 'Tester Tools',
    heading: lang === 'ru' ? 'Инструменты тестировщика' : 'Tester Tools',
    intro:
      lang === 'ru'
        ? 'Небольшие инструменты для подготовки тестов.'
        : 'Small tools for preparing tests.',
    nav,
    frame,
    body:
      '<ul>' +
      pages.map((p) => '<li><a href="' + p.path + '">' + esc(p.title) + '</a></li>').join('') +
      '</ul>',
    script: '',
  });
  let apiSpec: GoldApp['api'] = null;
  if (api) {
    const archetype = factors.archetype;
    const path =
      archetype === 'converter'
        ? '/api/rates.json'
        : archetype === 'search-list'
          ? '/api/items.json'
          : archetype === 'wizard'
            ? '/api/prices.json'
            : '/api/config.json';
    const body =
      archetype === 'converter'
        ? { m_ft: 3.28084, km_mi: 0.621371 }
        : archetype === 'search-list'
          ? PRODUCTS
          : archetype === 'wizard'
            ? { basic: 12, team: 10 }
            : { features: { export: true } };
    files[path] = JSON.stringify(body);
    apiSpec = { path, body, routes: [primary.gold.path] };
  }
  let research: GoldApp['research'] = null;
  if (factors.research !== 'none') {
    type Check = NonNullable<GoldApp['research']>['checks'][number];
    const own: Check[] = RESEARCH[factors.archetype].map((item, i) => ({
      id: 'k' + (i + 1),
      statement: item.statement,
      sourceIds: ['s1', i % 2 === 0 ? 's5' : 's6'],
      appliesHere: true,
      text: item.text,
      defect: item.defect,
    }));
    const others: Check[] =
      factors.research === 'cached-mixed'
        ? family.members
            .concat(FAMILIES.find((f) => f !== family)!.members)
            .filter((m) => m !== factors.archetype)
            .slice(0, 2)
            .map((m, i) => ({
              id: 'k' + (own.length + i + 1),
              statement: RESEARCH[m][0].statement,
              sourceIds: ['s1'],
              appliesHere: false,
            }))
        : [];
    research = {
      ...ARCHETYPE_NAMES[factors.archetype],
      sources: SOURCES,
      checks: own.concat(others),
    };
    for (const page of pages)
      page.researchChecks = page === primary.gold ? own.map((c) => c.id) : [];
  } else {
    for (const page of pages) page.researchChecks = [];
  }
  const notes: GoldApp['notes'] = [];
  const page = primary.gold;
  if (factors.note === 'supporting' && page.rules.length > 0) {
    notes.push({
      note: page.rules[0].statement + ' - that is how the business works here.',
      supports: 'rule',
      ruleId: page.rules[0].id,
    });
  } else if (factors.note === 'contradicting') {
    const limited = page.fields.find((field) => field.limits.some((l) => l.side === 'max'));
    if (limited) {
      const limit = limited.limits.find((l) => l.side === 'max')!;
      const allowed = limit.value * 2;
      notes.push({
        note:
          limited.label +
          ': values up to ' +
          allowed +
          ' are valid for us; the ' +
          limit.value +
          ' on the page is a mistake.',
        supports: 'contradiction',
        ruleId: 'rh',
      });
      page.rules.push({
        id: 'rh',
        statement:
          limited.label +
          ' accepts values up to ' +
          allowed +
          ', as the person said; the page limit of ' +
          limit.value +
          ' is a defect',
        fields: [limited.testId],
        source: 'human',
        // Anything over the page's limit and inside what the person allowed shows the same thing.
        witness: {
          field: limited.testId,
          value: String(limit.value + 1),
          polarity: 'valid',
          stands: { kind: 'number', gt: limit.value, lte: allowed },
        },
        text: {
          description:
            limited.label +
            ' of ' +
            (limit.value + 1) +
            ' is accepted, as the person said values up to ' +
            allowed +
            ' are valid',
          outcome: 'a result is produced for ' + (limit.value + 1) + '; today the page refuses it',
          technique: 'error-guessing',
          scenario: 'positive',
          layer: 'rule',
        },
      });
    }
  }
  const gold: GoldApp = {
    datasetId: spec.id,
    appName: lang === 'ru' ? 'Инструменты тестировщика' : 'Tester Tools',
    purpose: 'A collection of small web tools testers use while preparing tests',
    feature: {
      name: family.name[lang],
      purpose: family.purpose + ': ' + pages.map((p) => p.title).join(' and '),
      fitsApplication:
        'The site collects tools testers use while preparing tests; this feature is one of them, so its results become expected values in their tests',
      impact: family.impact,
      archetype: ARCHETYPE_NAMES[factors.archetype].archetype,
    },
    pages,
    frame: frame
      ? [{ testId: 'fr1', label: lang === 'ru' ? 'Язык' : 'Language', options: ['EN', 'RU', 'DE'] }]
      : [],
    research,
    notes,
    api: apiSpec,
    appKind: factors.appKind,
  };
  return { gold, files };
}
