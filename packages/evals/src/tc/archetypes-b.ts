// Page builders, part two: pages that take text and give it back reshaped or filtered - a JSON
// formatter, a bug report template that exports a file, and a searchable product list.
import type { GoldPage, GoldDefect, GoldRule, GoldLimit } from './gold.js';
import {
  type FieldDef,
  type Text,
  renderField,
  goldField,
  SET_RESULT,
  copyButton,
  downloadButton,
  esc,
  t,
} from './page-kit.js';
import type { BuildContext, BuiltPage } from './archetypes-a.js';

const L = (en: string, ru: string): Text => ({ en, ru });

// ---------------------------------------------------------------------------------------------
// JSON formatter

export function buildFormatter(ctx: BuildContext): BuiltPage {
  const f = ctx.factors;
  const lang = ctx.lang;
  const labels = ctx.secondary ? 'clear' : f.labels;
  const defect = ctx.secondary ? 'none' : f.defect;
  const rule = ctx.secondary ? 'none' : f.rule;
  const lengthLimit: GoldLimit[] =
    !ctx.secondary && f.limits === 'markup-length'
      ? [{ side: 'max', attribute: 'maxlength', value: 5000, stated: 'markup' }]
      : [];
  const fields: FieldDef[] = [
    {
      key: 'json',
      testId: 'f1',
      label: L('JSON text', 'Текст JSON'),
      meaning: 'The JSON document to format or check, pasted from an API response or a config file',
      role: 'free-text',
      kind: 'text',
      control: 'textarea',
      validity: {
        type: 'text',
        format: 'json',
        maxLength: lengthLimit.length > 0 ? 5000 : undefined,
      },
      limits: lengthLimit,
      sample: '{"b":2,"a":[1,2]}',
      sampleOutcome: 'the formatted document appears below with "Valid JSON" above it',
    },
    {
      key: 'indent',
      testId: 'f2',
      label: L('Indent', 'Отступ'),
      meaning: 'How many spaces each nesting level of the result is indented by',
      role: 'setting',
      kind: 'select',
      control: 'select',
      options: [L('2 spaces', '2 пробела'), L('4 spaces', '4 пробела')],
      validity: {
        type: 'option',
        options: [t(L('2 spaces', '2 пробела'), lang), t(L('4 spaces', '4 пробела'), lang)],
      },
      sample: t(L('2 spaces', '2 пробела'), lang),
      sampleOutcome: 'each nesting level of the result is indented by 2 spaces',
    },
    {
      key: 'sort',
      testId: 'f3',
      label: L('Sort keys', 'Сортировать ключи'),
      meaning:
        'Whether object keys come out in alphabetical order instead of the order they were written in',
      role: 'setting',
      kind: 'checkbox',
      control: 'checkbox',
      validity: { type: 'toggle' },
      sample: 'checked',
      sampleOutcome: 'the keys of every object come out alphabetically',
    },
  ];
  const valid = lang === 'ru' ? 'JSON корректен' : 'Valid JSON';
  const invalid = lang === 'ru' ? 'Ошибка JSON' : 'Invalid JSON';
  const output = f.output;
  const body =
    fields.map((d) => renderField(d, labels, lang)).join('\n') +
    '\n<button type="button" data-testid="b1" id="format">' +
    (lang === 'ru' ? 'Форматировать' : 'Format') +
    '</button> <button type="button" data-testid="b2" id="validate">' +
    (lang === 'ru' ? 'Проверить' : 'Validate') +
    '</button>\n<div class="message" data-testid="o8"></div>\n<div class="result" data-testid="o1"></div>' +
    (output === 'copy-button' ? copyButton('o2', lang, '[data-testid="o1"]') : '') +
    (output === 'download'
      ? downloadButton(
          'o3',
          lang,
          "var b=new Blob([document.querySelector('[data-testid=o1]').textContent],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='formatted.json';a.click();",
        )
      : '');
  const script = `
function q(id){return document.querySelector('[data-testid="'+id+'"]');}
function msg(t){${defect === 'stale-state' ? "q('o8').textContent=(q('o8').textContent&&t.indexOf('" + invalid + "')===0?q('o8').textContent+' ':'')+t;" : "q('o8').textContent=t;"}}
function tokens(s){var out=[],i=0;while(i<s.length){var c=s[i];if(/\\s/.test(c)){i++;continue;}if(c==='"'){var j=i+1;while(j<s.length&&s[j]!=='"'){if(s[j]==='\\\\')j++;j++;}out.push(s.slice(i,j+1));i=j+1;continue;}if('{}[]:,'.indexOf(c)>=0){out.push(c);i++;continue;}var k=i;while(k<s.length&&!/[\\s{}\\[\\]:,]/.test(s[k]))k++;out.push(s.slice(i,k));i=k;}return out;}
function pretty(s,ind){var t=tokens(s),out='',lvl=0,pad=function(n){return '\\n'+new Array(n*ind+1).join(' ');};for(var i=0;i<t.length;i++){var x=t[i];if(x==='{'||x==='['){if(t[i+1]==='}'||t[i+1]===']'){out+=x+t[i+1];i++;continue;}lvl++;out+=x+pad(lvl);}else if(x==='}'||x===']'){lvl--;out+=pad(lvl)+x;}else if(x===','){out+=','+pad(lvl);}else if(x===':'){out+=': ';}else out+=x;}return out;}
function sortKeys(v){if(Array.isArray(v))return v.map(sortKeys);if(v&&typeof v==='object'){var o={};Object.keys(v).sort().forEach(function(k){o[k]=sortKeys(v[k]);});return o;}return v;}
function parse(s){${defect === 'missing-validation' ? "s=s.replace(/,\\s*([}\\]])/g,'$1');" : ''}return JSON.parse(s);}
function format(){
  var raw=q('f1').value,ind=q('f2').selectedIndex===1?4:2,v;
  try{v=parse(raw);}catch(e){${defect === 'stale-state' ? '' : "q('o1').textContent='';"}msg('${invalid}: '+e.message);return false;}
  var text=q('f3').checked${defect === 'wrong-result' ? '||true' : ''}?JSON.stringify(sortKeys(v),null,ind):${defect === 'precision' ? 'JSON.stringify(v,null,ind)' : 'pretty(raw,ind)'};
  q('o1').textContent=text;msg('${valid}');return true;
}
document.getElementById('format').addEventListener('click',format);
document.getElementById('validate').addEventListener('click',function(){var raw=q('f1').value;try{parse(raw);msg('${valid}');}catch(e){msg('${invalid}: '+e.message);}});
`;
  const defects: GoldDefect[] = [];
  if (defect === 'stale-state') {
    defects.push({
      id: 'd1',
      kind: 'stale-state',
      description:
        'After a valid document is formatted, a broken one leaves "Valid JSON" and the old result on screen beside the error',
      trigger: 'format {"a":1}, then format {"a":}',
      triggerValues: { f1: '{"a":}' },
      correct: 'only the error is shown',
      wrong: '"' + valid + '" stays beside the error',
      correctTokens: [invalid],
      wrongTokens: [],
      text: {
        description:
          'After {"a":1} is formatted, formatting {"a":} drops the earlier "' +
          valid +
          '" and its result',
        outcome: 'only "' + invalid + ': ..." is shown and the result area is empty',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'error_path',
        layer: 'behavior',
      },
    });
  } else if (defect === 'precision') {
    defects.push({
      id: 'd1',
      kind: 'precision',
      description:
        'A number beyond 2^53 is rewritten: 12345678901234567890 comes out as 12345678901234567000',
      trigger: 'format {"id":12345678901234567890}',
      triggerValues: { f1: '{"id":12345678901234567890}' },
      correct: '12345678901234567890',
      wrong: '12345678901234567000',
      correctTokens: ['12345678901234567890'],
      wrongTokens: ['12345678901234567000'],
      text: {
        description: 'Formatting {"id":12345678901234567890} keeps every digit of the id',
        outcome: 'the result shows "id": 12345678901234567890 unchanged',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    });
  } else if (defect === 'missing-validation') {
    defects.push({
      id: 'd1',
      kind: 'missing-validation',
      description: 'A trailing comma is accepted: {"a":1,} is reported valid and formatted',
      trigger: 'validate {"a":1,}',
      triggerValues: { f1: '{"a":1,}' },
      correct: 'reported invalid',
      wrong: 'reported valid',
      correctTokens: [invalid],
      wrongTokens: [],
      text: {
        description: '{"a":1,} with a trailing comma is reported as invalid JSON',
        outcome: '"' + invalid + '" names the unexpected }',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'invalid_input',
        layer: 'rule',
      },
    });
  } else if (defect === 'wrong-result') {
    defects.push({
      id: 'd1',
      kind: 'wrong-result',
      description:
        'Keys are sorted even with Sort keys off: {"b":2,"a":1} comes out with "a" first',
      trigger: 'format {"b":2,"a":1} with Sort keys off',
      triggerValues: { f1: '{"b":2,"a":1}', f3: 'unchecked' },
      correct: '"b" first',
      wrong: '"a" first',
      correctTokens: ['"b"'],
      wrongTokens: [],
      text: {
        description: 'With Sort keys off, {"b":2,"a":1} keeps "b" before "a"',
        outcome: 'the result lists "b": 2 on the line before "a": 1',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    });
  }
  const rules: GoldRule[] = [];
  if (rule === 'semantic') {
    rules.push({
      id: 'r1',
      statement: 'Only strict JSON is accepted: single quotes and unquoted keys are errors',
      fields: ['f1'],
      source: 'domain',
      witness: { field: 'f1', value: "{'a': 1}", polarity: 'invalid' },
      text: {
        description: "{'a': 1} in single quotes is reported as invalid JSON",
        outcome: '"' + invalid + '" appears and nothing is formatted',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'invalid_input',
        layer: 'rule',
      },
    });
  }
  const outputs: GoldPage['outputs'] = [{ kind: 'text-region', label: 'Result' }];
  if (output === 'copy-button')
    outputs.push({ testId: 'o2', kind: 'copy-button', label: 'Copy result' });
  if (output === 'download') outputs.push({ testId: 'o3', kind: 'download', label: 'Download' });
  const gold: GoldPage = {
    path: ctx.path,
    title: lang === 'ru' ? 'Форматирование JSON' : 'JSON Formatter',
    archetype: 'formatter',
    fields: fields.map((d) => goldField(d, lang)),
    outputs,
    duplicates: [],
    mainFlow: {
      inputs: { f1: '{"b":2,"a":[1,2]}', f2: t(L('2 spaces', '2 пробела'), lang) },
      expectTokens: ['"b"'],
      outputs: output === 'copy-button' ? ['o2'] : output === 'download' ? ['o3'] : [],
      text: {
        description:
          'Formatting {"b":2,"a":[1,2]} with 2 spaces lays it out over 7 lines, keys in their original order',
        outcome:
          'the result shows "b": 2 first, then "a" with 1 and 2 on lines of their own, under "' +
          valid +
          '"',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    },
    rules,
    defects,
    ambiguities: [],
    researchChecks: ['formatter'],
  };
  return {
    gold,
    body,
    script,
    title: gold.title,
    heading: gold.title,
    intro: lang === 'ru' ? 'Форматирует и проверяет JSON.' : 'Formats and validates JSON.',
  };
}

// ---------------------------------------------------------------------------------------------
// Bug report template with an export

export function buildTemplate(ctx: BuildContext): BuiltPage {
  const f = ctx.factors;
  const lang = ctx.lang;
  const labels = ctx.secondary ? 'clear' : f.labels;
  const defect = ctx.secondary ? 'none' : f.defect;
  const rule = ctx.secondary ? 'none' : f.rule;
  const titleLimits: GoldLimit[] =
    !ctx.secondary && f.limits === 'markup-length'
      ? [{ side: 'max', attribute: 'maxlength', value: 80, stated: 'markup' }]
      : !ctx.secondary && f.limits === 'label-only'
        ? [
            {
              side: 'max',
              attribute: 'maxlength',
              value: 80,
              stated: 'label',
              excerpt: lang === 'ru' ? '(до 80 символов)' : '(max 80 characters)',
            },
          ]
        : [];
  const required = !ctx.secondary && f.limits === 'markup-length';
  const severities = [
    L('Critical', 'Критичный'),
    L('Major', 'Серьёзный'),
    L('Minor', 'Незначительный'),
  ];
  const fields: FieldDef[] = [
    {
      key: 'bug-id',
      testId: 'f1',
      label: L('Bug ID', 'ID бага'),
      meaning: 'The id the report is filed under; the exported file is named after it',
      role: 'identifier',
      kind: 'text',
      control: 'input',
      validity: { type: 'text' },
      sample: 'BUG-101',
      sampleOutcome: 'the exported file is named BUG-101.txt',
    },
    {
      key: 'title',
      testId: 'f2',
      label: L('Title', 'Заголовок'),
      meaning: 'The one-line summary a developer reads first',
      role: 'free-text',
      kind: 'text',
      control: 'input',
      validity: { type: 'text', maxLength: titleLimits.length > 0 ? 80 : undefined, required },
      limits: titleLimits,
      required,
      sample: 'Login button does nothing',
      sampleOutcome: 'the export opens with the title Login button does nothing',
      invalid: required
        ? {
            sample: '',
            outcome: 'the export is refused until a title is typed',
            signal: 'html5-constraint',
            excerpt: 'required',
          }
        : undefined,
    },
    {
      key: 'severity',
      testId: 'f3',
      label: L('Severity', 'Серьёзность'),
      meaning: 'How badly the defect hurts the product',
      role: 'choice',
      kind: 'select',
      control: 'select',
      options: severities,
      validity: { type: 'option', options: severities.map((s) => t(s, lang)) },
      sample: t(severities[1], lang),
      sampleOutcome: 'the export lists severity ' + t(severities[1], lang),
    },
    {
      key: 'steps',
      testId: 'f4',
      label: L('Steps to reproduce', 'Шаги воспроизведения'),
      meaning: 'What to do to see the defect, one step per line',
      role: 'free-text',
      kind: 'text',
      control: 'textarea',
      validity: { type: 'text' },
      sample: 'Open the login page',
      sampleOutcome: 'the export lists Open the login page under the steps',
    },
    {
      key: 'expected result',
      testId: 'f5',
      label: L('Expected result', 'Ожидаемый результат'),
      meaning: 'What the product should have done',
      role: 'free-text',
      kind: 'text',
      control: 'textarea',
      validity: { type: 'text' },
      sample: 'The dashboard opens',
      sampleOutcome: 'the export shows The dashboard opens as the expected result',
    },
    {
      key: 'actual result',
      testId: 'f6',
      label: L('Actual result', 'Фактический результат'),
      meaning: 'What the product actually did',
      role: 'free-text',
      kind: 'text',
      control: 'textarea',
      validity: { type: 'text' },
      sample: 'Nothing happens',
      sampleOutcome: 'the export shows Nothing happens as the actual result',
    },
  ];
  if (!ctx.secondary && f.pii === 'contact-fields') {
    fields.push({
      key: 'reporter-email',
      testId: 'f7',
      label: L('Reporter email', 'Email автора'),
      meaning: 'Where questions about the report go',
      role: 'identifier',
      kind: 'email',
      control: 'input',
      type: 'email',
      validity: { type: 'text', format: 'email' },
      sample: 'reporter@example.com',
      sampleOutcome: 'the export names reporter@example.com as the contact',
      pii: true,
    });
    fields.push({
      key: 'reporter-phone',
      testId: 'f8',
      label: L('Reporter phone', 'Телефон автора'),
      meaning: 'A phone number for urgent questions about the report',
      role: 'identifier',
      kind: 'text',
      control: 'input',
      type: 'tel',
      validity: { type: 'text' },
      sample: '+1 202-555-0143',
      sampleOutcome: 'the export lists the phone +1 202-555-0143',
      pii: true,
    });
  }
  if (!ctx.secondary && f.size === 'large') {
    const extra: Array<[string, Text, string, string]> = [
      [
        'environment',
        L('Environment', 'Окружение'),
        'Where it was seen: browser, device, build',
        'Chrome 128 on Windows 11',
      ],
      [
        'component',
        L('Component', 'Компонент'),
        'The part of the product affected',
        'Authentication',
      ],
      ['version', L('Version', 'Версия'), 'The build the defect was found in', '2.4.1'],
      ['assignee', L('Assignee', 'Исполнитель'), 'Who is to fix it', 'Backend team'],
      ['test-case', L('Test case ID', 'ID тест-кейса'), 'The test case that found it', 'TC-101'],
      [
        'requirement id',
        L('Requirement ID', 'ID требования'),
        'The requirement it breaks',
        'REQ-12',
      ],
      [
        'story',
        L('User story link', 'Ссылка на историю'),
        'The user story it belongs to',
        'https://example.com/story/12',
      ],
      [
        'labels',
        L('Labels', 'Метки'),
        'Comma-separated labels to file the bug under',
        'login, safari',
      ],
      ['found-by', L('Found by', 'Кем найден'), 'Who or what found it', 'Regression suite'],
      [
        'workaround',
        L('Workaround', 'Обходной путь'),
        'How users can get past it meanwhile',
        'Use the Enter key',
      ],
      [
        'notes',
        L('Notes', 'Заметки'),
        'Anything else the developer should know',
        'Happens only after a password reset',
      ],
      [
        'reported-on',
        L('Reported on', 'Дата отчёта'),
        'The day the report was written',
        '2026-09-11',
      ],
      [
        'build-url',
        L('Build URL', 'Ссылка на сборку'),
        'Where the failing build can be downloaded',
        'https://example.com/builds/241',
      ],
      [
        'frequency',
        L('How often', 'Как часто'),
        'How often the steps bring the defect back',
        'Every time',
      ],
    ];
    extra.forEach(([key, label, meaning, sample], i) => {
      fields.push({
        key,
        testId: 'f' + (10 + i),
        label,
        meaning,
        role: key === 'reported-on' ? 'date-time' : 'free-text',
        kind: key === 'reported-on' ? 'date' : 'text',
        control: 'input',
        validity: { type: 'text' },
        sample,
        sampleOutcome: 'the export carries ' + sample + ' under ' + label.en,
      });
    });
  }
  if (!ctx.secondary && f.reveal === 'toggle-reveals-field') {
    fields.push({
      key: 'is-regression',
      testId: 'f30',
      label: L('This is a regression', 'Это регрессия'),
      meaning: 'Whether the defect used to work in an earlier version',
      role: 'toggle',
      kind: 'checkbox',
      control: 'checkbox',
      validity: { type: 'toggle' },
      sample: 'checked',
      sampleOutcome: 'the last good version field appears',
    });
    fields.push({
      key: 'last-good',
      testId: 'f31',
      label: L('Last good version', 'Последняя рабочая версия'),
      meaning: 'The newest version in which it still worked',
      role: 'identifier',
      kind: 'text',
      control: 'input',
      validity: { type: 'text' },
      sample: '2.3.0',
      sampleOutcome: 'the export names 2.3.0 as the last good version',
      hiddenUntil: 'f30',
    });
  }
  const repeatedSteps = !ctx.secondary && f.repeated === 'repeated-controls';
  const stepRows = repeatedSteps
    ? ['f4b', 'f4c']
        .map(
          (id) =>
            '<div class="row"><span>' +
            esc(t(L('Steps to reproduce', 'Шаги воспроизведения'), lang)) +
            '</span> <textarea data-testid="' +
            id +
            '" name="steps-' +
            id +
            '"></textarea></div>',
        )
        .join('\n')
    : '';
  const exportLabel = lang === 'ru' ? 'Экспорт в TXT' : 'Export to TXT';
  const outputHtml =
    f.output === 'copy-button'
      ? '<label class="row"><span>' +
        esc(lang === 'ru' ? 'Предпросмотр' : 'Preview') +
        '</span> <textarea readonly data-testid="o1" rows="8" cols="60"></textarea></label>' +
        copyButton('o2', lang, '[data-testid="o1"]')
      : '<button type="button" data-testid="o3" id="export" download>' + exportLabel + '</button>';
  const body =
    fields.map((d) => renderField(d, labels, lang)).join('\n') +
    '\n' +
    stepRows +
    '\n<button type="button" data-testid="b2" id="reset">' +
    (lang === 'ru' ? 'Очистить' : 'Reset') +
    '</button>\n' +
    outputHtml +
    '\n<div class="message" data-testid="o8"></div>';
  const keys = fields
    .filter((d) => d.control !== 'checkbox')
    .map((d) => [d.testId, d.label.en] as const);
  const script = `
${SET_RESULT}
function q(id){return document.querySelector('[data-testid="'+id+'"]');}
var KEYS=${JSON.stringify(keys)};var snapshot=null;
function report(){var src=${defect === 'stale-state' ? 'snapshot||' : ''}null;var lines=[];KEYS.forEach(function(k){${defect === 'wrong-result' ? "if(k[0]==='f5')return;" : ''}var v=src?src[k[0]]:(q(k[0])?q(k[0]).value:'');if(v)lines.push(k[1]+': '+v);});['f4b','f4c'].forEach(function(id){if(q(id)&&q(id).value)lines.push('Steps to reproduce: '+q(id).value);});return lines.join('\\n');}
function fileName(){var id=q('f1').value.trim();return (id?id.replace(/[^A-Za-z0-9._-]/g,'_'):'bug-report')+'.txt';}
function check(){q('o8').textContent='';
  ${defect === 'missing-validation' ? '' : 'if(' + (required || titleLimits.length > 0 ? "!q('f2').value.trim()||" : '') + (titleLimits.length > 0 ? "q('f2').value.length>80" : 'false') + "){q('o8').textContent='" + (lang === 'ru' ? 'Нужен заголовок до 80 символов' : 'A title of up to 80 characters is needed') + "';return false;}"}
  ${rule === 'cross-field' ? "if(q('f3').selectedIndex===0&&!q('f4').value.trim()){q('o8').textContent='" + (lang === 'ru' ? 'Для критичного бага нужны шаги' : 'A critical bug needs steps to reproduce') + "';return false;}" : ''}
  return true;}
function snap(){var s={};KEYS.forEach(function(k){if(q(k[0]))s[k[0]]=q(k[0]).value;});snapshot=s;}
${
  f.output === 'copy-button'
    ? "document.querySelectorAll('input,textarea,select').forEach(function(el){el.addEventListener('input',function(){if(check()){setResult(report());" +
      (defect === 'stale-state' ? 'snap();' : '') +
      '}});});'
    : "document.getElementById('export').addEventListener('click',function(){if(!check())return;var b=new Blob([report()],{type:'text/plain'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=fileName();a.click();" +
      (defect === 'stale-state' ? 'snap();' : '') +
      '});'
}
document.getElementById('reset').addEventListener('click',function(){document.querySelectorAll('main input,main textarea').forEach(function(el){if(el.type==='checkbox')el.checked=false;else if(!el.readOnly)el.value='';});${defect === 'stale-state' ? '' : "setResult('');"}});
`;
  const through = f.output === 'copy-button' ? 'the preview' : 'the exported file';
  const defects: GoldDefect[] = [];
  if (defect === 'wrong-result') {
    defects.push({
      id: 'd1',
      kind: 'wrong-result',
      description: 'The export leaves out the expected result',
      trigger: 'fill every field, then export',
      triggerValues: { f5: 'The dashboard opens' },
      correct: 'the expected result is in the export',
      wrong: 'the expected result is missing',
      correctTokens: ['The dashboard opens'],
      wrongTokens: [],
      text: {
        description: 'Every field typed above, the expected result included, reaches ' + through,
        outcome: through + ' carries Expected result: The dashboard opens',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    });
  } else if (defect === 'missing-validation') {
    defects.push({
      id: 'd1',
      kind: 'missing-validation',
      description: 'A report with no title is exported anyway',
      trigger: 'leave the title empty, export',
      triggerValues: { f2: '' },
      triggerTokens: ['title'],
      correct: 'the export is refused until a title is typed',
      wrong: 'a file without a title',
      correctTokens: ['asks for a title'],
      wrongTokens: [],
      text: {
        description: 'With the title empty, nothing is exported and the page asks for a title',
        outcome: 'a message asks for a title and no file is produced',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'invalid_input',
        layer: 'rule',
      },
    });
  } else if (defect === 'stale-state') {
    defects.push({
      id: 'd1',
      kind: 'stale-state',
      description: 'After Reset, the next export still carries the values typed before the reset',
      trigger: 'fill and export, press Reset, fill a new title and export again',
      triggerValues: { f2: 'Second report' },
      correct: 'the second export carries only the new values',
      wrong: 'the first report again',
      correctTokens: ['Second report'],
      wrongTokens: [],
      text: {
        description:
          'After Reset, a report titled Second report exports with that title and none of the earlier values',
        outcome: through + ' opens with Title: Second report and carries none of the first report',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'error_path',
        layer: 'behavior',
      },
    });
  }
  const rules: GoldRule[] = [];
  if (rule === 'semantic') {
    rules.push({
      id: 'r1',
      statement:
        'The exported file is named after the bug id, with characters a file name cannot hold replaced',
      fields: ['f1'],
      source: 'domain',
      witness: { field: 'f1', value: 'BUG/101:x', polarity: 'valid' },
      text: {
        description: 'A bug id of BUG/101:x still exports, as BUG_101_x.txt',
        outcome: 'the file downloads as BUG_101_x.txt',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'rule',
      },
    });
  } else if (rule === 'cross-field') {
    rules.push({
      id: 'r1',
      statement: 'A critical bug needs steps to reproduce',
      fields: ['f3', 'f4'],
      source: 'domain',
      witness: { field: 'f3', value: t(severities[0], lang), polarity: 'invalid' },
      text: {
        description:
          'A bug of severity ' + t(severities[0], lang) + ' with no steps is not exported',
        outcome: 'a message says a critical bug needs steps to reproduce',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'invalid_input',
        layer: 'rule',
      },
    });
  }
  const outputs: GoldPage['outputs'] =
    f.output === 'copy-button'
      ? [
          { testId: 'o1', kind: 'readonly-field', label: 'Preview' },
          { testId: 'o2', kind: 'copy-button', label: 'Copy result' },
        ]
      : [{ testId: 'o3', kind: 'download', label: exportLabel }];
  const gold: GoldPage = {
    path: ctx.path,
    title: lang === 'ru' ? 'Шаблон баг-репорта' : 'Bug Report Template',
    archetype: 'template-export',
    fields: fields.map((d) => goldField(d, lang)),
    outputs,
    duplicates: repeatedSteps
      ? [
          { testId: 'f4b', of: 'f4' },
          { testId: 'f4c', of: 'f4' },
        ]
      : [],
    mainFlow: {
      inputs: {
        f1: 'BUG-101',
        f2: 'Login button does nothing',
        f3: t(severities[1], lang),
        f4: 'Open the login page',
        f5: 'The dashboard opens',
        f6: 'Nothing happens',
      },
      expectTokens: ['BUG-101'],
      outputs: f.output === 'copy-button' ? ['o1', 'o2'] : ['o3'],
      text: {
        description:
          'A report filed as BUG-101 reaches ' + through + ' with every section typed above',
        outcome:
          f.output === 'copy-button'
            ? 'the preview and the copied text carry the title, severity, steps, expected and actual result as typed'
            : 'BUG-101.txt downloads and carries the title, severity, steps, expected and actual result as typed',
        sourceInput:
          'bug id BUG-101, title Login button does nothing, severity ' +
          t(severities[1], lang) +
          ', one step, expected The dashboard opens, actual Nothing happens',
        technique: 'property',
        relation: 'output-matches-display',
        scenario: 'positive',
        layer: 'behavior',
      },
    },
    rules,
    defects,
    ambiguities: [],
    researchChecks: ['template-export'],
  };
  return {
    gold,
    body,
    script,
    title: gold.title,
    heading: gold.title,
    intro:
      lang === 'ru'
        ? 'Заполните отчёт о дефекте и выгрузите его файлом.'
        : 'Fill in a defect report and export it as a file.',
  };
}

// ---------------------------------------------------------------------------------------------
// Searchable product list

export const PRODUCTS = [
  ['Hammer', 'Tools', 25, true],
  ['Screwdriver set', 'Tools', 18, true],
  ['Wrench', 'Tools', 12, false],
  ['Drill', 'Tools', 89, true],
  ['Chess board', 'Games', 40, true],
  ['Card deck', 'Games', 5, true],
  ['Puzzle 1000', 'Games', 15, false],
  ['Novel: The Hammer', 'Books', 11, true],
  ['Cookbook', 'Books', 22, true],
  ['Atlas', 'Books', 35, false],
  ['Garden hose', 'Garden', 30, true],
  ['Rake', 'Garden', 14, true],
] as const;

export function buildSearchList(ctx: BuildContext): BuiltPage {
  const f = ctx.factors;
  const lang = ctx.lang;
  const labels = ctx.secondary ? 'clear' : f.labels;
  const defect = ctx.secondary ? 'none' : f.defect;
  const rule = ctx.secondary ? 'none' : f.rule;
  const searchLimits: GoldLimit[] =
    !ctx.secondary && f.limits === 'markup-length'
      ? [{ side: 'max', attribute: 'maxlength', value: 40, stated: 'markup' }]
      : [];
  const priceLimits: GoldLimit[] =
    !ctx.secondary && f.limits === 'markup-range'
      ? [
          { side: 'min', attribute: 'min', value: 0, stated: 'markup' },
          { side: 'max', attribute: 'max', value: 1000, stated: 'markup' },
        ]
      : [];
  const categories = [
    L('All', 'Все'),
    L('Tools', 'Инструменты'),
    L('Games', 'Игры'),
    L('Books', 'Книги'),
    L('Garden', 'Сад'),
  ];
  const fields: FieldDef[] = [
    {
      key: 'search',
      testId: 'f1',
      label: L('Search products', 'Поиск товаров'),
      meaning: 'Words the product name has to contain',
      role: 'search-filter',
      kind: 'text',
      control: 'input',
      type: 'search',
      validity: { type: 'text', maxLength: searchLimits.length > 0 ? 40 : undefined },
      limits: searchLimits,
      sample: 'Hammer',
      sampleOutcome: 'the list shows only products named with Hammer',
    },
    {
      key: 'category',
      testId: 'f2',
      label: L('Category', 'Категория'),
      meaning: 'Which department the products come from',
      role: 'search-filter',
      kind: 'select',
      control: 'select',
      options: categories,
      validity: { type: 'option', options: categories.map((c) => t(c, lang)) },
      sample: t(categories[1], lang),
      sampleOutcome: 'the list shows only tools',
    },
    {
      key: 'in-stock',
      testId: 'f3',
      label: L('In stock only', 'Только в наличии'),
      meaning: 'Whether products out of stock are hidden',
      role: 'search-filter',
      kind: 'checkbox',
      control: 'checkbox',
      validity: { type: 'toggle' },
      sample: 'checked',
      sampleOutcome: 'products out of stock disappear from the list',
    },
  ];
  if (priceLimits.length > 0) {
    fields.push({
      key: 'max-price',
      testId: 'f4',
      label: L('Max price', 'Максимальная цена'),
      meaning: 'The highest price a listed product may have',
      role: 'money',
      kind: 'number',
      control: 'input',
      type: 'number',
      validity: { type: 'number', min: 0, max: 1000 },
      limits: priceLimits,
      sample: '30',
      sampleOutcome: 'only products up to 30 are listed',
      invalid: {
        sample: '-5',
        outcome: 'the field is marked invalid and the list is not filtered by price',
        signal: 'html5-constraint',
        excerpt: 'min=0',
      },
    });
  }
  if (!ctx.secondary && f.reveal === 'toggle-reveals-field') {
    fields.push({
      key: 'more-filters',
      testId: 'f5',
      label: L('More filters', 'Ещё фильтры'),
      meaning: 'Whether the extra filters are shown',
      role: 'toggle',
      kind: 'checkbox',
      control: 'checkbox',
      validity: { type: 'toggle' },
      sample: 'checked',
      sampleOutcome: 'the minimum price field appears',
    });
    fields.push({
      key: 'min-price',
      testId: 'f6',
      label: L('Min price', 'Минимальная цена'),
      meaning: 'The lowest price a listed product may have',
      role: 'money',
      kind: 'number',
      control: 'input',
      type: 'number',
      validity: { type: 'number', min: 0 },
      sample: '20',
      sampleOutcome: 'only products from 20 up are listed',
      hiddenUntil: 'f5',
    });
  }
  const catNames = categories.map((c) => t(c, lang));
  const body =
    fields.map((d) => renderField(d, labels, lang)).join('\n') +
    '\n<div class="result" data-testid="o1"></div>';
  const script = `
function q(id){return document.querySelector('[data-testid="'+id+'"]');}
var ITEMS=${JSON.stringify(PRODUCTS)};var CATS=${JSON.stringify(catNames)};var EN=['All','Tools','Games','Books','Garden'];
${ctx.api ? "fetch('/api/items.json').then(function(r){return r.json();}).then(function(j){ITEMS=j;render();}).catch(function(){});" : ''}
var last=null;
function render(){
  var s=q('f1').value${rule === 'semantic' && defect !== 'wrong-result' ? '.toLowerCase()' : defect === 'wrong-result' ? '' : '.toLowerCase()'};
  ${defect === 'stale-state' ? "if(s===''&&last){return;}" : ''}
  var cat=EN[CATS.indexOf(q('f2').value)]||'All',stock=q('f3').checked,max=q('f4')&&q('f4').value!==''?parseFloat(q('f4').value):Infinity,min=q('f6')&&q('f6').value!==''?parseFloat(q('f6').value):-Infinity;
  var list=ITEMS.filter(function(p){var name=${defect === 'wrong-result' ? 'p[0]' : 'p[0].toLowerCase()'};return name.indexOf(s)>=0&&(cat==='All'||p[1]===cat)&&(!stock||p[3])&&p[2]<=max&&p[2]>=min;});
  last=list;
  var n=list.length${defect === 'off-by-one' ? '-(list.length>0?1:0)' : ''};
  q('o1').textContent=n+' ${lang === 'ru' ? 'найдено' : 'result(s)'}:\\n'+list.map(function(p){return p[0]+' - '+p[2];}).join('\\n');
}
['f1','f2','f3','f4','f6'].forEach(function(id){var el=q(id);if(el){el.addEventListener('input',render);el.addEventListener('change',render);}});
render();
`;
  const defects: GoldDefect[] = [];
  if (defect === 'wrong-result') {
    defects.push({
      id: 'd1',
      kind: 'wrong-result',
      description: 'Search is case-sensitive: "hammer" finds nothing although Hammer is listed',
      trigger: 'search hammer in lowercase',
      triggerValues: { f1: 'hammer' },
      correct: 'Hammer is found',
      wrong: '0 results',
      correctTokens: ['lowercase'],
      wrongTokens: [],
      text: {
        description: 'Searching "hammer" in lowercase still finds Hammer',
        outcome: 'the lowercase search lists Hammer and Novel: The Hammer',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    });
  } else if (defect === 'off-by-one') {
    defects.push({
      id: 'd1',
      kind: 'off-by-one',
      description: 'The result count is one less than the products listed',
      trigger: 'category Tools',
      triggerValues: { f2: catNames[1] },
      triggerTokens: ['count'],
      correct: '4 result(s)',
      wrong: '3 result(s)',
      correctTokens: ['count reads 4'],
      wrongTokens: [],
      text: {
        description: 'Category Tools lists 4 products and the count says 4',
        outcome: 'the count reads 4 and 4 products are listed',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    });
  } else if (defect === 'stale-state') {
    defects.push({
      id: 'd1',
      kind: 'stale-state',
      description:
        'Clearing the search box keeps the previous filtered list instead of showing everything again',
      trigger: 'search Hammer, then clear the search',
      triggerValues: { f1: '' },
      correct: 'all 12 products are listed again',
      wrong: 'still only the Hammer results',
      correctTokens: ['count reads 12'],
      wrongTokens: [],
      text: {
        description: 'Clearing the search after searching Hammer brings back all 12 products',
        outcome: 'the count reads 12 and every product is listed',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'error_path',
        layer: 'behavior',
      },
    });
  }
  const rules: GoldRule[] = [];
  if (rule === 'semantic') {
    rules.push({
      id: 'r1',
      statement: 'Search ignores letter case',
      fields: ['f1'],
      source: 'domain',
      witness: { field: 'f1', value: 'HAMMER', polarity: 'valid' },
      text: {
        description: 'Searching HAMMER in capitals finds Hammer',
        outcome: 'the list shows Hammer',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'rule',
      },
    });
  }
  const gold: GoldPage = {
    path: ctx.path,
    title: lang === 'ru' ? 'Каталог товаров' : 'Product Catalogue',
    archetype: 'search-list',
    fields: fields.map((d) => goldField(d, lang)),
    outputs: [{ kind: 'text-region', label: 'Results' }],
    duplicates: [],
    mainFlow: {
      inputs: { f1: 'Hammer', f2: catNames[1] },
      expectTokens: ['Hammer', '1'],
      outputs: [],
      text: {
        description: 'Searching Hammer within Tools lists the one tool named Hammer',
        outcome: 'the list reads 1 result: Hammer - 25',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    },
    rules,
    defects,
    ambiguities: [],
    researchChecks: ['search-list'],
  };
  return {
    gold,
    body,
    script,
    title: gold.title,
    heading: gold.title,
    intro:
      lang === 'ru'
        ? 'Ищите товары по названию, категории и цене.'
        : 'Find products by name, category and price.',
  };
}
