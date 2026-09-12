// Page builders, part one: pages that turn input into a computed output - a unit converter, a price
// calculator and an identifier generator. Each builder writes the page and its gold from the same
// decisions; a defect factor changes the page's script and adds the defect to the gold.
import type { DatasetFactors } from './model.js';
import type { GoldPage, GoldDefect, GoldRule, GoldLimit } from './gold.js';
import {
  type FieldDef,
  type Lang,
  type Text,
  renderField,
  goldField,
  resultMarkup,
  downloadButton,
  SET_RESULT,
  t,
} from './page-kit.js';

export interface BuildContext {
  factors: DatasetFactors;
  lang: Lang;
  path: string;
  // A second page of the feature: the plain version, with no defect and no hidden rule of its own.
  secondary: boolean;
  api: boolean;
}

export interface BuiltPage {
  gold: GoldPage;
  body: string;
  script: string;
  heading: string;
  intro: string;
  title: string;
}

const L = (en: string, ru: string): Text => ({ en, ru });

function outputsOf(output: DatasetFactors['output'], label: string): GoldPage['outputs'] {
  if (output === 'text-region') return [{ kind: 'text-region', label }];
  if (output === 'copy-button')
    return [
      { testId: 'o1', kind: 'readonly-field', label },
      { testId: 'o2', kind: 'copy-button', label: 'Copy result' },
    ];
  if (output === 'download')
    return [
      { testId: 'o1', kind: 'readonly-field', label },
      { testId: 'o3', kind: 'download', label: 'Download' },
    ];
  return [{ testId: 'o1', kind: 'readonly-field', label }];
}

// Where a main flow reads its result from, as the ids a condition names in outputs.
function readFrom(output: DatasetFactors['output']): string[] {
  if (output === 'text-region') return [];
  if (output === 'download') return ['o1', 'o3'];
  return ['o1'];
}

function resultPhrase(output: DatasetFactors['output']): string {
  return output === 'text-region' ? 'the result below the form' : 'the result box';
}

// ---------------------------------------------------------------------------------------------
// Unit converter

export function buildConverter(ctx: BuildContext): BuiltPage {
  const f = ctx.factors;
  const lang = ctx.lang;
  const labels = ctx.secondary ? 'clear' : f.labels;
  const defect = ctx.secondary ? 'none' : f.defect;
  const rule = ctx.secondary ? 'none' : f.rule;
  const lengthUnits =
    lang === 'ru'
      ? ['Метры (m)', 'Футы (ft)', 'Километры (km)', 'Мили (mi)']
      : ['Meters (m)', 'Feet (ft)', 'Kilometers (km)', 'Miles (mi)'];
  const tempUnits =
    lang === 'ru'
      ? ['Цельсий (C)', 'Фаренгейт (F)', 'Кельвин (K)']
      : ['Celsius (C)', 'Fahrenheit (F)', 'Kelvin (K)'];
  const measures = lang === 'ru' ? ['Длина', 'Температура'] : ['Length', 'Temperature'];
  const limits: GoldLimit[] =
    f.limits === 'markup-range' && !ctx.secondary
      ? [
          { side: 'min', attribute: 'min', value: -1000000, stated: 'markup' },
          { side: 'max', attribute: 'max', value: 1000000, stated: 'markup' },
        ]
      : f.limits === 'label-only' && !ctx.secondary
        ? [
            {
              side: 'max',
              attribute: 'max',
              value: 1000000,
              stated: 'label',
              excerpt: lang === 'ru' ? '(до 1 000 000)' : '(up to 1,000,000)',
            },
          ]
        : [];
  const amount: FieldDef = {
    key: 'amount',
    testId: 'f2',
    label: L('Amount', 'Значение'),
    meaning:
      'The amount to convert, in the unit chosen under From; a negative temperature is an ordinary reading',
    role: 'quantity',
    kind: 'number',
    control: 'input',
    type: 'number',
    attrs: { step: 'any' },
    validity: {
      type: 'number',
      min: limits.find((l) => l.side === 'min')?.value,
      max: limits.find((l) => l.side === 'max')?.value,
    },
    limits,
    sample: '100',
    sampleOutcome: 'the converted amount appears in ' + resultPhrase(f.output),
    invalid:
      limits.length > 0
        ? {
            sample: '2000000',
            outcome:
              limits[0].stated === 'markup'
                ? 'the field is marked invalid and no result is shown'
                : 'no result is shown for an amount past 1,000,000',
            signal: limits[0].stated === 'markup' ? 'html5-constraint' : 'form-label',
            excerpt: limits[0].stated === 'markup' ? 'max=1000000' : limits[0].excerpt!,
          }
        : undefined,
  };
  const fields: FieldDef[] = [
    {
      key: 'measure',
      testId: 'f1',
      label: L('Measure', 'Величина'),
      meaning: 'Which quantity is converted; it decides which units the From and To lists offer',
      role: 'choice',
      kind: 'select',
      control: 'select',
      options: measures.map((m) => ({ en: m, ru: m })),
      validity: { type: 'option', options: measures },
      sample: measures[0],
      sampleOutcome: 'both unit lists offer ' + lengthUnits[0] + ' to ' + lengthUnits[3],
    },
    amount,
    {
      key: 'from unit',
      testId: 'f3',
      label: L('From', 'Из'),
      meaning: 'The unit the amount is written in',
      role: 'choice',
      kind: 'select',
      control: 'select',
      options: lengthUnits.map((u) => ({ en: u, ru: u })),
      validity: { type: 'option', options: lengthUnits },
      sample: lengthUnits[0],
      sampleOutcome: 'the amount is read as ' + lengthUnits[0],
    },
    {
      key: 'to unit',
      testId: 'f4',
      label: L('To', 'В'),
      meaning: 'The unit the result is shown in',
      role: 'choice',
      kind: 'select',
      control: 'select',
      options: lengthUnits.map((u) => ({ en: u, ru: u })),
      validity: { type: 'option', options: lengthUnits },
      sample: lengthUnits[1],
      sampleOutcome: 'the result is given in ' + lengthUnits[1],
      attrs: {},
    },
  ];
  if (!ctx.secondary && f.ambiguity === 'unstated-limit') {
    fields.push({
      key: 'decimals',
      testId: 'f7',
      label: L('Decimal places', 'Знаков после запятой'),
      meaning: 'How many decimals the result is rounded to',
      role: 'setting',
      kind: 'number',
      control: 'input',
      type: 'number',
      validity: { type: 'number', min: 0, max: 10, integer: true },
      sample: '2',
      sampleOutcome: 'the result is rounded to 2 decimals',
    });
  }
  if (!ctx.secondary && f.reveal === 'toggle-reveals-field') {
    fields.push({
      key: 'show-formula',
      testId: 'f5',
      label: L('Show the formula', 'Показать формулу'),
      meaning: 'Whether the formula used for the conversion is shown under the result',
      role: 'toggle',
      kind: 'checkbox',
      control: 'checkbox',
      validity: { type: 'toggle' },
      sample: 'checked',
      sampleOutcome: 'the formula line appears under the result',
    });
    fields.push({
      key: 'formula-note',
      testId: 'f6',
      label: L('Note to show with the formula', 'Заметка к формуле'),
      meaning: 'A note printed next to the formula, such as where the factor comes from',
      role: 'free-text',
      kind: 'text',
      control: 'input',
      validity: { type: 'text' },
      sample: 'factor from NIST',
      sampleOutcome: 'the note factor from NIST is printed beside the formula',
      hiddenUntil: 'f5',
    });
  }
  const result = resultMarkup(f.output, lang, L('Result', 'Результат'));
  const duplicate = !ctx.secondary && f.repeated === 'repeated-controls';
  const body =
    fields.map((d) => renderField(d, labels, lang)).join('\n') +
    (duplicate
      ? '\n<div class="row mobile"><input type="number" step="any" data-testid="f2m" name="amount-mobile" aria-label="' +
        t(L('Amount', 'Значение'), lang) +
        '"></div>'
      : '') +
    '\n' +
    result.html +
    '\n<div class="formula" data-testid="o9"></div>';
  const script = `
${SET_RESULT}
var UNITS={length:${JSON.stringify(lengthUnits)},temperature:${JSON.stringify(tempUnits)}};
var MEASURES=${JSON.stringify(measures)};
var RATES={m_ft:3.28084,km_mi:0.621371};
${ctx.api ? "fetch('/api/rates.json').then(function(r){return r.json();}).then(function(j){RATES=j;update();}).catch(function(){});" : ''}
function q(id){return document.querySelector('[data-testid="'+id+'"]');}
function fill(sel,list){var keep=sel.value;sel.innerHTML='';list.forEach(function(u){var o=document.createElement('option');o.textContent=u;sel.appendChild(o);});if(list.indexOf(keep)>=0)sel.value=keep;}
function toMeters(v,u){var i=UNITS.length.indexOf(u);return [v,v/RATES.m_ft,v*1000,v*1000/RATES.km_mi*1][i];}
function fromMeters(v,u){var i=UNITS.length.indexOf(u);return [v,v*RATES.m_ft,v/1000,v/1000*RATES.km_mi][i];}
function temp(v,a,b){var ia=UNITS.temperature.indexOf(a),ib=UNITS.temperature.indexOf(b);var c=[v,(v-32)*5/9,v-273.15][ia];return [c,c*9/5+32,c+273.15][ib];}
function round(n){var d=q('f7')&&q('f7').value!==''?Math.max(0,Math.min(10,parseInt(q('f7').value,10)||0)):3;var p=Math.pow(10,d);return String(Math.round(n*p)/p);}
function update(){
  var raw=q('f2').value;
  if(raw===''){${defect === 'stale-state' ? '' : "setResult('');"}return;}
  var v=parseFloat(raw);if(isNaN(v)){setResult('');return;}
  ${limits.length > 0 ? "if(v>1000000||v<-1000000){setResult('');return;}" : ''}
  var measure=MEASURES.indexOf(q('f1').value)===1?'temperature':'length';
  var a=q('f3').value,b=q('f4').value,out;
  if(measure==='temperature'){out=temp(v,a,b);setResult(${defect === 'precision' ? 'String(out)' : 'round(out)'});}
  else{
    ${defect === 'wrong-result' ? 'if(UNITS.length.indexOf(a)===2&&UNITS.length.indexOf(b)===3){setResult(round(v*0.62));return;}' : ''}
    out=fromMeters(toMeters(v,a),b);setResult(round(out));
  }
  var fm=q('o9');if(fm){fm.textContent=q('f5')&&q('f5').checked?('x '+(measure==='length'?'factor':'offset')+(q('f6')&&q('f6').value?' - '+q('f6').value:'')):'';}
}
q('f1').addEventListener('change',function(){var list=MEASURES.indexOf(q('f1').value)===1?UNITS.temperature:UNITS.length;fill(q('f3'),list);fill(q('f4'),list);q('f4').selectedIndex=1;update();});
['f2','f3','f4','f5','f6','f7'].forEach(function(id){var el=q(id);if(el){el.addEventListener('input',update);el.addEventListener('change',update);}});
var mob=q('f2m');if(mob){mob.addEventListener('input',function(){q('f2').value=mob.value;update();});}
q('f4').selectedIndex=1;
`;
  const defects: GoldDefect[] = [];
  if (defect === 'precision') {
    defects.push({
      id: 'd1',
      kind: 'precision',
      description:
        'Temperature results are shown unrounded: -40 Celsius to Kelvin reads 233.14999999999998',
      trigger: 'convert -40 Celsius to Kelvin',
      triggerValues: { f1: measures[1], f2: '-40', f3: tempUnits[0], f4: tempUnits[2] },
      correct: '233.15',
      wrong: '233.14999999999998',
      correctTokens: ['233.15'],
      wrongTokens: ['233.14999999999998'],
      text: {
        description:
          '-40 degrees Celsius converts to 233.15 Kelvin, rounded like every other result',
        outcome: 'the result reads 233.15, not a long floating point tail',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    });
  } else if (defect === 'stale-state') {
    defects.push({
      id: 'd1',
      kind: 'stale-state',
      description: 'Clearing the amount leaves the previous result on screen',
      trigger: 'convert 100 m to ft, then clear the amount',
      triggerValues: { f2: '' },
      triggerTokens: ['clear', 'cleared', 'empty'],
      correct: 'the result is cleared',
      wrong: 'the old result 328.084 stays',
      correctTokens: ['empty', 'clear', 'cleared', 'blank'],
      wrongTokens: [],
      text: {
        description:
          'Clearing the amount after converting 100 metres removes the old 328.084 from the result',
        outcome: 'the result is empty once the amount is cleared',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'error_path',
        layer: 'behavior',
      },
    });
  } else if (defect === 'wrong-result') {
    defects.push({
      id: 'd1',
      kind: 'wrong-result',
      description: 'Kilometres to miles uses 0.62 instead of 0.621371: 10 km reads 6.2 mi',
      trigger: 'convert 10 km to miles',
      triggerValues: { f2: '10', f3: lengthUnits[2], f4: lengthUnits[3] },
      correct: '6.214',
      wrong: '6.2',
      correctTokens: ['6.214'],
      wrongTokens: [],
      text: {
        description: '10 kilometres converts to 6.214 miles',
        outcome: 'the result reads 6.214',
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
      statement: 'A negative amount is valid: a temperature below zero is an ordinary reading',
      fields: ['f2'],
      source: 'domain',
      witness: { field: 'f2', value: '-40', polarity: 'valid', stands: { kind: 'number', lt: 0 } },
      text: {
        description: '-40 degrees Celsius converts to -40 Fahrenheit rather than being refused',
        outcome: 'the result reads -40',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'rule',
      },
    });
  } else if (rule === 'cross-field') {
    rules.push({
      id: 'r1',
      statement: 'Converting a unit to itself returns the amount unchanged',
      fields: ['f3', 'f4'],
      source: 'domain',
      // The same unit on both sides, whether the analysis names the option or writes the word.
      witness: {
        field: 'f4',
        value: lengthUnits[0],
        polarity: 'valid',
        stands: { kind: 'text', matches: '^(metres|meters)$' },
      },
      text: {
        description: '100 metres converted to metres stays 100',
        outcome: 'the result reads 100',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'rule',
      },
    });
  }
  const outputs = outputsOf(f.output, 'Result');
  const gold: GoldPage = {
    path: ctx.path,
    title: lang === 'ru' ? 'Конвертер единиц' : 'Unit Converter',
    archetype: 'converter',
    fields: fields.map((d) => goldField(d, lang)),
    outputs,
    duplicates: duplicate ? [{ testId: 'f2m', of: 'f2' }] : [],
    mainFlow: {
      inputs: { f1: measures[0], f2: '100', f3: lengthUnits[0], f4: lengthUnits[1] },
      expectTokens: ['328.084'],
      outputs: readFrom(f.output),
      text: {
        description: '100 metres converts to 328.084 feet',
        outcome: resultPhrase(f.output) + ' reads 328.084',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    },
    rules,
    defects,
    ambiguities:
      !ctx.secondary && f.ambiguity === 'unstated-limit'
        ? [
            {
              testId: 'f7',
              question:
                'How many decimal places may the result be rounded to? Nothing on the page states a limit.',
            },
          ]
        : [],
    researchChecks: ['converter'],
  };
  return {
    gold,
    body,
    script,
    title: gold.title,
    heading: gold.title,
    intro:
      lang === 'ru'
        ? 'Переводит значение из одной единицы в другую.'
        : 'Converts an amount from one unit to another.',
  };
}

// ---------------------------------------------------------------------------------------------
// Price calculator

export function buildCalculator(ctx: BuildContext): BuiltPage {
  const f = ctx.factors;
  const lang = ctx.lang;
  const labels = ctx.secondary ? 'clear' : f.labels;
  const defect = ctx.secondary ? 'none' : f.defect;
  const rule = ctx.secondary ? 'none' : f.rule;
  const ranged = !ctx.secondary && f.limits === 'markup-range';
  const labelled = !ctx.secondary && f.limits === 'label-only';
  const qtyLimits: GoldLimit[] = ranged
    ? [
        { side: 'min', attribute: 'min', value: 1, stated: 'markup' },
        { side: 'max', attribute: 'max', value: 99, stated: 'markup' },
      ]
    : labelled
      ? [
          {
            side: 'max',
            attribute: 'max',
            value: 99,
            stated: 'label',
            excerpt: lang === 'ru' ? '(1-99)' : '(1-99)',
          },
        ]
      : [];
  const discountLimits: GoldLimit[] =
    ranged && f.ambiguity !== 'unstated-limit'
      ? [
          { side: 'min', attribute: 'min', value: 0, stated: 'markup' },
          { side: 'max', attribute: 'max', value: 100, stated: 'markup' },
        ]
      : [];
  const fields: FieldDef[] = [
    {
      key: 'price',
      testId: 'f1',
      label: L('Unit price', 'Цена за единицу'),
      meaning: 'The price of one item before any discount, in the currency the shop sells in',
      role: 'money',
      kind: 'number',
      control: 'input',
      type: 'number',
      attrs: { step: '0.01' },
      validity: { type: 'number', min: 0 },
      sample: '19.99',
      sampleOutcome: 'the total is computed from 19.99 per item',
    },
    {
      key: 'quantity',
      testId: 'f2',
      label: L('Quantity', 'Количество'),
      meaning: 'How many items are bought',
      role: 'quantity',
      kind: 'number',
      control: 'input',
      type: 'number',
      validity: {
        type: 'number',
        min: 1,
        max: qtyLimits.length > 0 ? 99 : undefined,
        integer: true,
      },
      limits: qtyLimits,
      sample: '3',
      sampleOutcome: 'the total covers 3 items',
      invalid:
        qtyLimits.length > 0
          ? {
              sample: '100',
              outcome:
                qtyLimits[0].stated === 'markup'
                  ? 'the field is marked invalid and no total is shown'
                  : 'no total is shown for 100 items',
              signal: qtyLimits[0].stated === 'markup' ? 'html5-constraint' : 'form-label',
              excerpt: qtyLimits[0].stated === 'markup' ? 'max=99' : '(1-99)',
            }
          : undefined,
    },
    {
      key: 'discount',
      testId: 'f3',
      label: L('Discount, %', 'Скидка, %'),
      meaning: 'The share of the price taken off, in percent',
      role: 'quantity',
      kind: 'number',
      control: 'input',
      type: 'number',
      validity: { type: 'number', min: 0, max: 100 },
      limits: discountLimits,
      sample: '10',
      sampleOutcome: 'the total is 10 percent lower',
      invalid:
        discountLimits.length > 0
          ? {
              sample: '150',
              outcome: 'the field is marked invalid and no total is shown',
              signal: 'html5-constraint',
              excerpt: 'max=100',
            }
          : undefined,
    },
  ];
  if (!ctx.secondary && f.reveal === 'toggle-reveals-field') {
    fields.push({
      key: 'has-coupon',
      testId: 'f5',
      label: L('I have a coupon', 'У меня есть купон'),
      meaning: 'Whether a coupon code is applied on top of the discount',
      role: 'toggle',
      kind: 'checkbox',
      control: 'checkbox',
      validity: { type: 'toggle' },
      sample: 'checked',
      sampleOutcome: 'the coupon field appears',
    });
    fields.push({
      key: 'coupon',
      testId: 'f6',
      label: L('Coupon code', 'Код купона'),
      meaning: 'A coupon code; SAVE5 takes 5 more off the total',
      role: 'identifier',
      kind: 'text',
      control: 'input',
      validity: { type: 'text' },
      sample: 'SAVE5',
      sampleOutcome: 'the total drops by 5 with the coupon SAVE5',
      hiddenUntil: 'f5',
    });
  }
  const result = resultMarkup(f.output, lang, L('Total', 'Итого'));
  const duplicate = !ctx.secondary && f.repeated === 'repeated-controls';
  const body =
    fields.map((d) => renderField(d, labels, lang)).join('\n') +
    (duplicate
      ? '\n<div class="row mobile"><input type="number" data-testid="f2m" name="quantity-mobile" aria-label="' +
        t(L('Quantity', 'Количество'), lang) +
        '"></div>'
      : '') +
    '\n' +
    result.html +
    '\n<div class="message" data-testid="o8"></div>';
  const script = `
${SET_RESULT}
function q(id){return document.querySelector('[data-testid="'+id+'"]');}
function msg(t){q('o8').textContent=t;}
function update(){
  var p=parseFloat(q('f1').value),n=parseFloat(q('f2').value),d=q('f3').value===''?0:parseFloat(q('f3').value);
  msg('');
  if(isNaN(p)||isNaN(n)){setResult('');return;}
  ${qtyLimits.length > 0 ? (defect === 'off-by-one' ? "if(n<1||n>100){setResult('');return;}" : "if(n<1||n>99){setResult('');return;}") : "if(n<1){setResult('');return;}"}
  ${defect === 'missing-validation' ? '' : "if(d<0||d>100){setResult('');msg('" + (lang === 'ru' ? 'Скидка должна быть от 0 до 100' : 'The discount must be between 0 and 100') + "');return;}"}
  ${rule === 'cross-field' ? "if(p===0&&d>0){setResult('');msg('" + (lang === 'ru' ? 'Скидка не применяется к бесплатному товару' : 'A discount cannot apply to a free item') + "');return;}" : ''}
  var total=p*n*(1-d/100)${defect === 'wrong-result' ? '*(1-d/100)' : ''};
  if(q('f5')&&q('f5').checked&&q('f6')&&q('f6').value==='SAVE5')total-=5;
  ${rule === 'semantic' ? 'if(total<0)total=0;' : ''}
  setResult(${defect === 'precision' ? 'String(total)' : 'total.toFixed(2)'});
}
['f1','f2','f3','f5','f6'].forEach(function(id){var el=q(id);if(el){el.addEventListener('input',update);el.addEventListener('change',update);}});
var mob=q('f2m');if(mob){mob.addEventListener('input',function(){q('f2').value=mob.value;update();});}
`;
  const defects: GoldDefect[] = [];
  if (defect === 'precision') {
    defects.push({
      id: 'd1',
      kind: 'precision',
      description: 'The total is shown unrounded: 3 items at 19.99 read 59.97000000000001',
      trigger: 'price 19.99, quantity 3, no discount',
      triggerValues: { f1: '19.99', f2: '3', f3: '0' },
      correct: '59.97',
      wrong: '59.97000000000001',
      correctTokens: ['59.97'],
      wrongTokens: ['59.97000000000001'],
      text: {
        description: '3 items at 19.99 with no discount total 59.97',
        outcome: 'the total reads 59.97 with two decimals',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    });
  } else if (defect === 'off-by-one') {
    defects.push({
      id: 'd1',
      kind: 'off-by-one',
      description: 'A quantity of 100 is accepted although the limit is 99',
      trigger: 'quantity 100',
      triggerValues: { f2: '100' },
      triggerTokens: ['100 items', 'one past'],
      correct: 'no total for 100 items',
      wrong: 'a total for 100 items',
      correctTokens: ['100'],
      wrongTokens: [],
      text: {
        description: 'A quantity of 100, one past the limit of 99, gets no total',
        outcome: 'no total is shown for 100 items',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'boundary',
        layer: 'rule',
      },
    });
  } else if (defect === 'missing-validation') {
    defects.push({
      id: 'd1',
      kind: 'missing-validation',
      description: 'A discount of 150% is accepted and gives a negative total',
      trigger: 'discount 150',
      triggerValues: { f1: '10', f2: '1', f3: '150' },
      triggerTokens: ['150'],
      correct: 'the discount is refused',
      wrong: 'a total of -5.00',
      correctTokens: ['0 and 100', 'between 0', 'refused'],
      wrongTokens: ['-5.00'],
      text: {
        description: 'A discount of 150 percent is refused instead of producing a negative total',
        outcome: 'a message says the discount must be between 0 and 100 and no total is shown',
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
      description: 'The discount is applied twice: 100 at 10% off reads 81.00',
      trigger: 'price 100, quantity 1, discount 10',
      triggerValues: { f1: '100', f2: '1', f3: '10' },
      triggerTokens: ['10 percent off'],
      correct: '90.00',
      wrong: '81.00',
      correctTokens: ['90'],
      wrongTokens: ['81'],
      text: {
        description: 'One item at 100 with 10 percent off totals 90.00',
        outcome: 'the total reads 90.00',
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
      statement: 'The total is never negative, whatever the coupon takes off',
      fields: ['f1'],
      source: 'domain',
      // Any price the coupon can swallow shows it, not only 1.00.
      witness: {
        field: 'f1',
        value: '1',
        polarity: 'valid',
        stands: { kind: 'number', gt: 0, lte: 5 },
      },
      text: {
        description: 'One item at 1.00 with the coupon SAVE5 totals 0.00, not a negative amount',
        outcome: 'the total reads 0.00',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'rule',
      },
    });
  } else if (rule === 'cross-field') {
    rules.push({
      id: 'r1',
      statement: 'A discount cannot apply to an item priced 0',
      fields: ['f1', 'f3'],
      source: 'domain',
      witness: { field: 'f1', value: '0', polarity: 'invalid' },
      text: {
        description: 'A price of 0 with a 10 percent discount is refused',
        outcome: 'a message says a discount cannot apply to a free item',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'invalid_input',
        layer: 'rule',
      },
    });
  }
  const gold: GoldPage = {
    path: ctx.path,
    title: lang === 'ru' ? 'Калькулятор стоимости' : 'Price Calculator',
    archetype: 'calculator',
    fields: fields.map((d) => goldField(d, lang)),
    outputs: outputsOf(f.output, 'Total'),
    duplicates: duplicate ? [{ testId: 'f2m', of: 'f2' }] : [],
    mainFlow: {
      inputs: { f1: '19.99', f2: '3', f3: '10' },
      expectTokens: ['53.97'],
      outputs: readFrom(f.output),
      text: {
        description: '3 items at 19.99 with a 10 percent discount total 53.97',
        outcome:
          (f.output === 'text-region' ? 'the total below the form' : 'the total box') +
          ' reads 53.97',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    },
    rules,
    defects,
    ambiguities:
      !ctx.secondary && f.ambiguity === 'unstated-limit'
        ? [
            {
              testId: 'f3',
              question:
                'May a discount be more than 100 percent, or below 0? Nothing on the page states a limit.',
            },
          ]
        : [],
    researchChecks: ['calculator'],
  };
  return {
    gold,
    body,
    script,
    title: gold.title,
    heading: gold.title,
    intro:
      lang === 'ru'
        ? 'Считает итоговую стоимость покупки со скидкой.'
        : 'Works out the total of a purchase after a discount.',
  };
}

// ---------------------------------------------------------------------------------------------
// Identifier generator

export function buildGenerator(ctx: BuildContext): BuiltPage {
  const f = ctx.factors;
  const lang = ctx.lang;
  const labels = ctx.secondary ? 'clear' : f.labels;
  const defect = ctx.secondary ? 'none' : f.defect;
  const rule = ctx.secondary ? 'none' : f.rule;
  const countLimits: GoldLimit[] =
    !ctx.secondary && f.limits === 'markup-range'
      ? [
          { side: 'min', attribute: 'min', value: 1, stated: 'markup' },
          { side: 'max', attribute: 'max', value: 500, stated: 'markup' },
        ]
      : !ctx.secondary && f.limits === 'label-only'
        ? [{ side: 'max', attribute: 'max', value: 500, stated: 'label', excerpt: '(1-500)' }]
        : [];
  const prefixLimits: GoldLimit[] =
    !ctx.secondary && f.limits === 'markup-length'
      ? [{ side: 'max', attribute: 'maxlength', value: 8, stated: 'markup' }]
      : [];
  const fields: FieldDef[] = [
    {
      key: 'count',
      testId: 'f1',
      label: L('How many codes', 'Сколько кодов'),
      meaning: 'How many codes one click produces',
      role: 'quantity',
      kind: 'number',
      control: 'input',
      type: 'number',
      validity: {
        type: 'number',
        min: 1,
        max: countLimits.length > 0 ? 500 : undefined,
        integer: true,
      },
      limits: countLimits,
      sample: '5',
      sampleOutcome: 'exactly 5 codes are listed',
      invalid:
        countLimits.length > 0
          ? {
              sample: '501',
              outcome:
                countLimits[0].stated === 'markup'
                  ? 'the field is marked invalid and no codes are listed'
                  : 'no codes are listed for 501',
              signal: countLimits[0].stated === 'markup' ? 'html5-constraint' : 'form-label',
              excerpt: countLimits[0].stated === 'markup' ? 'max=500' : '(1-500)',
            }
          : undefined,
    },
    {
      key: 'prefix',
      testId: 'f2',
      label: L('Prefix', 'Префикс'),
      meaning: 'Text put in front of every code, such as a project key',
      role: 'free-text',
      kind: 'text',
      control: 'input',
      validity: { type: 'text', maxLength: prefixLimits.length > 0 ? 8 : undefined },
      limits: prefixLimits,
      sample: 'QA',
      sampleOutcome: 'every code starts with QA-',
    },
    {
      key: 'uppercase',
      testId: 'f3',
      label: L('Uppercase letters', 'Заглавные буквы'),
      meaning: 'Whether the letters in the codes are capitals',
      role: 'setting',
      kind: 'checkbox',
      control: 'checkbox',
      validity: { type: 'toggle' },
      sample: 'checked',
      sampleOutcome: 'every letter in the codes is a capital',
    },
    {
      key: 'separator',
      testId: 'f4',
      label: L('Separator', 'Разделитель'),
      meaning: 'What goes between the codes in the result',
      role: 'setting',
      kind: 'select',
      control: 'select',
      options: [L('New line', 'Новая строка'), L('Comma', 'Запятая')],
      validity: {
        type: 'option',
        options: [t(L('New line', 'Новая строка'), lang), t(L('Comma', 'Запятая'), lang)],
      },
      sample: t(L('New line', 'Новая строка'), lang),
      sampleOutcome: 'the codes stand one per line',
    },
  ];
  if (!ctx.secondary && f.reveal === 'toggle-reveals-field') {
    fields.push({
      key: 'custom-length',
      testId: 'f5',
      label: L('Custom length', 'Своя длина'),
      meaning: 'Whether the random part gets a length of its own',
      role: 'toggle',
      kind: 'checkbox',
      control: 'checkbox',
      validity: { type: 'toggle' },
      sample: 'checked',
      sampleOutcome: 'the length field appears',
    });
    fields.push({
      key: 'random part length',
      testId: 'f6',
      label: L('Random part length', 'Длина случайной части'),
      meaning: 'How many random characters each code carries',
      role: 'quantity',
      kind: 'number',
      control: 'input',
      type: 'number',
      validity: { type: 'number', min: 4, max: 16, integer: true },
      sample: '6',
      sampleOutcome: 'each code carries 6 random characters',
      hiddenUntil: 'f5',
      limits: [
        { side: 'min', attribute: 'min', value: 4, stated: 'markup' },
        { side: 'max', attribute: 'max', value: 16, stated: 'markup' },
      ],
    });
  }
  const result = resultMarkup(
    f.output === 'download' ? 'readonly-field' : f.output,
    lang,
    L('Codes', 'Коды'),
  );
  const download =
    f.output === 'download'
      ? downloadButton(
          'o3',
          lang,
          "var b=new Blob([document.querySelector('[data-testid=o1]').value],{type:'text/plain'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='codes.txt';a.click();",
        )
      : '';
  const duplicate = !ctx.secondary && f.repeated === 'repeated-controls';
  const body =
    fields.map((d) => renderField(d, labels, lang)).join('\n') +
    (duplicate
      ? '\n<div class="row mobile"><input type="number" data-testid="f1m" name="count-mobile" aria-label="' +
        t(L('How many codes', 'Сколько кодов'), lang) +
        '"></div>'
      : '') +
    '\n<button type="button" data-testid="b1" id="generate">' +
    (lang === 'ru' ? 'Сгенерировать' : 'Generate') +
    '</button>' +
    '\n' +
    result.html +
    download +
    '\n<div class="message" data-testid="o8"></div>';
  const script = `
${SET_RESULT}
function q(id){return document.querySelector('[data-testid="'+id+'"]');}
var ALPHA='abcdefghjkmnpqrstuvwxyz23456789';var seq=0;
function code(len){var s='';for(var i=0;i<len;i++){s+=ALPHA[Math.floor(Math.random()*ALPHA.length)];}return s;}
document.getElementById('generate').addEventListener('click',function(){
  var n=parseInt(q('f1').value,10);q('o8').textContent='';
  if(isNaN(n)||n<1${countLimits.length > 0 && defect !== 'missing-validation' ? '||n>500' : ''}){${defect === 'stale-state' ? '' : "setResult('');"}q('o8').textContent='${lang === 'ru' ? 'Укажите количество' : 'Enter how many codes'}';return;}
  var len=q('f5')&&q('f5').checked?(parseInt(q('f6').value,10)||8):8;
  var prefix=q('f2').value;var list=[];
  var count=${defect === 'off-by-one' ? 'n-1' : 'n'};
  for(var i=0;i<count;i++){var c=code(len);${defect === 'wrong-result' ? 'if(i%10===9)c=list[i-1].split("-").pop();' : ''}${rule === 'semantic' ? 'while(list.indexOf(c)>=0)c=code(len);' : ''}list.push((prefix?prefix+'-':'')+c);}
  if(q('f3').checked)list=list.map(function(x){return x.toUpperCase();});
  var sep=q('f4').selectedIndex===1?', ':'\\n';
  setResult(list.join(sep));
});
var mob=q('f1m');if(mob){mob.addEventListener('input',function(){q('f1').value=mob.value;});}
`;
  const defects: GoldDefect[] = [];
  if (defect === 'off-by-one') {
    defects.push({
      id: 'd1',
      kind: 'off-by-one',
      description: 'Asking for N codes lists N-1',
      trigger: 'how many 5, generate',
      triggerValues: { f1: '5' },
      triggerTokens: ['5 codes'],
      correct: '5 codes',
      wrong: '4 codes',
      correctTokens: ['5'],
      wrongTokens: [],
      text: {
        description: 'Asking for 5 codes lists exactly 5',
        outcome: 'the result holds 5 codes, one per line',
        technique: 'property',
        relation: 'count-matches-request',
        sourceInput: 'how many 5, new line separator',
        scenario: 'positive',
        layer: 'behavior',
      },
    });
  } else if (defect === 'stale-state') {
    defects.push({
      id: 'd1',
      kind: 'stale-state',
      description:
        'After a valid batch, generating with an empty count keeps the old codes on screen beside the error',
      trigger: 'generate 5 codes, then clear how many and generate again',
      triggerValues: { f1: '' },
      triggerTokens: ['clear', 'no count', 'empty'],
      correct: 'the old codes are removed and the message asks for a count',
      wrong: 'the old codes stay',
      correctTokens: ['empty', 'removed', 'cleared', 'no codes'],
      wrongTokens: [],
      text: {
        description:
          'Generating with no count after a batch of 5 clears the old codes and asks for a count',
        outcome: 'the result is empty and the message says to enter how many codes',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'error_path',
        layer: 'behavior',
      },
    });
  } else if (defect === 'missing-validation') {
    defects.push({
      id: 'd1',
      kind: 'missing-validation',
      description: 'A count past the limit of 500 is generated anyway',
      trigger: 'how many 501',
      triggerValues: { f1: '501' },
      correct: 'no codes for 501',
      wrong: '501 codes',
      correctTokens: ['501'],
      wrongTokens: [],
      text: {
        description: 'A count of 501, one past the limit, produces no codes',
        outcome: 'no codes are listed for 501 and a message asks for a count within the limit',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'boundary',
        layer: 'rule',
      },
    });
  } else if (defect === 'wrong-result') {
    defects.push({
      id: 'd1',
      kind: 'wrong-result',
      description:
        'Every tenth code repeats the one before it, so a batch of 20 carries duplicates',
      trigger: 'how many 20',
      triggerValues: { f1: '20' },
      triggerTokens: ['20 codes', 'batch of 20'],
      correct: '20 distinct codes',
      wrong: 'duplicates',
      correctTokens: ['unique', 'different', 'distinct', 'repeat'],
      wrongTokens: [],
      text: {
        description: 'No code repeats within a batch of 20',
        outcome: 'all 20 codes in the result are different from each other',
        technique: 'property',
        relation: 'all-unique',
        sourceInput: 'how many 20',
        scenario: 'positive',
        layer: 'behavior',
      },
    });
  }
  const rules: GoldRule[] = [];
  if (rule === 'semantic') {
    rules.push({
      id: 'r1',
      statement: 'Codes in one batch are never repeated - they are used as unique keys',
      fields: ['f1'],
      source: 'domain',
      // Repeats can only show in a batch of more than one, whatever its size.
      witness: {
        field: 'f1',
        value: '20',
        polarity: 'valid',
        stands: { kind: 'number', gte: 2 },
      },
      text: {
        description: 'A batch of 200 codes has no repeats',
        outcome: 'all 200 codes are different',
        technique: 'property',
        relation: 'all-unique',
        sourceInput: 'how many 200',
        scenario: 'positive',
        layer: 'rule',
      },
    });
  } else if (rule === 'cross-field') {
    rules.push({
      id: 'r1',
      statement:
        'With a comma separator the codes are joined by commas and never split across lines',
      fields: ['f4'],
      source: 'domain',
      witness: { field: 'f4', value: t(L('Comma', 'Запятая'), lang), polarity: 'valid' },
      text: {
        description:
          '5 codes with the separator ' + t(L('Comma', 'Запятая'), lang) + ' come on one line',
        outcome: 'the result is one line with 4 commas between the codes',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'rule',
      },
    });
  }
  const outputs: GoldPage['outputs'] =
    f.output === 'download'
      ? [
          { testId: 'o1', kind: 'readonly-field', label: 'Codes' },
          { testId: 'o3', kind: 'download', label: 'Download' },
        ]
      : outputsOf(f.output, 'Codes');
  const gold: GoldPage = {
    path: ctx.path,
    title: lang === 'ru' ? 'Генератор кодов' : 'Code Generator',
    archetype: 'generator',
    fields: fields.map((d) => goldField(d, lang)),
    outputs,
    duplicates: duplicate ? [{ testId: 'f1m', of: 'f1' }] : [],
    mainFlow: {
      inputs: { f1: '5', f2: 'QA', f3: 'checked' },
      expectTokens: ['5'],
      outputs: readFrom(f.output),
      text: {
        description: 'Asking for 5 codes with the prefix QA lists 5 codes, each starting with QA-',
        outcome:
          (f.output === 'text-region' ? 'the result below' : 'the codes box') +
          ' holds 5 lines, each QA- followed by 8 capital characters',
        sourceInput: 'how many 5, prefix QA, uppercase on',
        technique: 'property',
        relation: 'count-matches-request',
        scenario: 'positive',
        layer: 'behavior',
      },
    },
    rules,
    defects,
    ambiguities:
      !ctx.secondary && f.ambiguity === 'unstated-limit'
        ? [
            {
              testId: 'f2',
              question: 'How long may the prefix be? Nothing on the page states a limit.',
            },
          ]
        : [],
    researchChecks: ['generator'],
  };
  return {
    gold,
    body,
    script,
    title: gold.title,
    heading: gold.title,
    intro:
      lang === 'ru'
        ? 'Создаёт пачку уникальных кодов для тестовых данных.'
        : 'Creates a batch of unique codes for test data.',
  };
}
