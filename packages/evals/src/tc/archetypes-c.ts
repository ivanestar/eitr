// Page builders, part three: pages whose result is a state rather than a computed value - a
// multi-step sign-up, a settings page that has to remember, a CSV import and a sign-in form.
import type { GoldPage, GoldDefect, GoldRule, GoldLimit } from './gold.js';
import { type FieldDef, type Text, renderField, goldField, t } from './page-kit.js';
import type { BuildContext, BuiltPage } from './archetypes-a.js';

const L = (en: string, ru: string): Text => ({ en, ru });

// ---------------------------------------------------------------------------------------------
// Multi-step sign-up

export function buildWizard(ctx: BuildContext): BuiltPage {
  const f = ctx.factors;
  const lang = ctx.lang;
  const labels = ctx.secondary ? 'clear' : f.labels;
  const defect = ctx.secondary ? 'none' : f.defect;
  const rule = ctx.secondary ? 'none' : f.rule;
  const seatLimits: GoldLimit[] =
    !ctx.secondary && f.limits === 'markup-range'
      ? [
          { side: 'min', attribute: 'min', value: 1, stated: 'markup' },
          { side: 'max', attribute: 'max', value: 50, stated: 'markup' },
        ]
      : !ctx.secondary && f.limits === 'label-only'
        ? [
            {
              side: 'max',
              attribute: 'max',
              value: 50,
              stated: 'label',
              excerpt: lang === 'ru' ? '(не больше 50)' : '(up to 50)',
            },
          ]
        : [];
  const nameLimits: GoldLimit[] =
    !ctx.secondary && f.limits === 'markup-length'
      ? [{ side: 'max', attribute: 'maxlength', value: 60, stated: 'markup' }]
      : [];
  const plans = [L('Basic', 'Базовый'), L('Team', 'Командный')];
  const step1: FieldDef[] = [
    {
      key: 'name',
      testId: 'f1',
      label: L('Full name', 'Имя и фамилия'),
      meaning: 'The name the account is registered to',
      role: 'free-text',
      kind: 'text',
      control: 'input',
      validity: { type: 'text', required: true, maxLength: nameLimits.length > 0 ? 60 : undefined },
      limits: nameLimits,
      required: true,
      sample: 'Test User',
      sampleOutcome: 'the summary greets Test User',
      invalid: {
        sample: '',
        outcome: 'the page stays on step 1 and asks for a name',
        signal: 'html5-constraint',
        excerpt: 'required',
      },
    },
    {
      key: 'email',
      testId: 'f2',
      label: L('Work email', 'Рабочий email'),
      meaning: 'Where the account confirmation and invoices go',
      role: 'identifier',
      kind: 'email',
      control: 'input',
      type: 'email',
      validity: { type: 'text', format: 'email', required: true },
      required: true,
      sample: 'user@example.com',
      sampleOutcome: 'the summary lists user@example.com as the contact',
      pii: true,
      invalid: {
        sample: '',
        outcome: 'the page stays on step 1 and asks for an email',
        signal: 'html5-constraint',
        excerpt: 'required',
      },
    },
    {
      key: 'plan',
      testId: 'f3',
      label: L('Plan', 'Тариф'),
      meaning: 'Which subscription is bought: Basic for one person, Team priced per seat',
      role: 'choice',
      kind: 'select',
      control: 'select',
      options: plans,
      validity: { type: 'option', options: plans.map((p) => t(p, lang)) },
      sample: t(plans[1], lang),
      sampleOutcome: 'the summary shows the Team plan priced per seat',
    },
  ];
  const step2: FieldDef[] = [
    {
      key: 'seats',
      testId: 'f4',
      label: L('Seats', 'Мест'),
      meaning: 'How many people the subscription covers',
      role: 'quantity',
      kind: 'number',
      control: 'input',
      type: 'number',
      validity: {
        type: 'number',
        min: 1,
        max: seatLimits.length > 0 ? 50 : undefined,
        integer: true,
      },
      limits: seatLimits,
      sample: '3',
      sampleOutcome: 'the summary prices 3 seats',
      invalid:
        seatLimits.length > 0
          ? {
              sample: '51',
              outcome:
                seatLimits[0].stated === 'markup'
                  ? 'the field is marked invalid and the page stays on step 2'
                  : 'the page stays on step 2 for 51 seats',
              signal: seatLimits[0].stated === 'markup' ? 'html5-constraint' : 'form-label',
              excerpt: seatLimits[0].stated === 'markup' ? 'max=50' : seatLimits[0].excerpt!,
            }
          : undefined,
    },
    {
      key: 'company',
      testId: 'f5',
      label: L('Company', 'Компания'),
      meaning: 'The company invoices are made out to',
      role: 'free-text',
      kind: 'text',
      control: 'input',
      validity: { type: 'text' },
      sample: 'Example Ltd',
      sampleOutcome: 'the summary bills Example Ltd',
    },
  ];
  if (!ctx.secondary && f.size === 'large') {
    const extra: Array<[string, Text, string]> = [
      ['street', L('Street', 'Улица'), '1 Test Street'],
      ['city', L('City', 'Город'), 'Springfield'],
      ['zip', L('Postal code', 'Индекс'), '12345'],
      ['country', L('Country', 'Страна'), 'Testland'],
      ['vat', L('VAT number', 'ИНН'), 'TL123'],
      ['po', L('Purchase order', 'Номер заказа'), 'PO-7'],
      ['billing-contact', L('Billing contact', 'Контакт по оплате'), 'Accounts team'],
      ['referral', L('How did you hear about us', 'Откуда вы о нас узнали'), 'A colleague'],
    ];
    extra.forEach(([key, label, sample], i) =>
      step2.push({
        key,
        testId: 'f' + (10 + i),
        label,
        meaning: 'Billing detail: ' + label.en.toLowerCase(),
        role: 'free-text',
        kind: 'text',
        control: 'input',
        validity: { type: 'text' },
        sample,
        sampleOutcome: 'the summary lists ' + sample + ' under the billing details',
      }),
    );
  }
  if (!ctx.secondary && f.reveal === 'toggle-reveals-field') {
    step2.push({
      key: 'has-promo',
      testId: 'f20',
      label: L('I have a promo code', 'У меня есть промокод'),
      meaning: 'Whether a promo code is applied',
      role: 'toggle',
      kind: 'checkbox',
      control: 'checkbox',
      validity: { type: 'toggle' },
      sample: 'checked',
      sampleOutcome: 'the promo code field appears',
    });
    step2.push({
      key: 'promo',
      testId: 'f21',
      label: L('Promo code', 'Промокод'),
      meaning: 'A promo code; HALF halves the first month',
      role: 'identifier',
      kind: 'text',
      control: 'input',
      validity: { type: 'text' },
      sample: 'HALF',
      sampleOutcome: 'the summary halves the first month with HALF',
      hiddenUntil: 'f20',
    });
  }
  const body =
    '<section data-step="1">' +
    step1.map((d) => renderField(d, labels, lang)).join('\n') +
    '<button type="button" data-testid="b1" id="next1">' +
    (lang === 'ru' ? 'Далее' : 'Next') +
    '</button></section>\n<section data-step="2" hidden>' +
    step2.map((d) => renderField(d, labels, lang)).join('\n') +
    '<button type="button" data-testid="b2" id="back2">' +
    (lang === 'ru' ? 'Назад' : 'Back') +
    '</button> <button type="button" data-testid="b3" id="next2">' +
    (lang === 'ru' ? 'Далее' : 'Next') +
    '</button></section>\n<section data-step="3" hidden><div class="result" data-testid="o1"></div><button type="button" data-testid="b4" id="confirm">' +
    (lang === 'ru' ? 'Подтвердить' : 'Confirm') +
    '</button></section>\n<div class="message" data-testid="o8"></div>';
  const script = `
function q(id){return document.querySelector('[data-testid="'+id+'"]');}
var PLANS=${JSON.stringify(plans.map((p) => t(p, lang)))};var PRICE={basic:12,team:10};
${ctx.api ? "fetch('/api/prices.json').then(function(r){return r.json();}).then(function(j){PRICE=j;}).catch(function(){});" : ''}
function show(n){document.querySelectorAll('section[data-step]').forEach(function(s){s.hidden=s.getAttribute('data-step')!==String(n);});}
function msg(t){q('o8').textContent=t;}
document.getElementById('next1').addEventListener('click',function(){
  ${defect === 'missing-validation' ? '' : "if(!q('f1').value.trim()||!q('f2').value.trim()){msg('" + (lang === 'ru' ? 'Укажите имя и email' : 'Enter your name and email') + "');return;}"}
  ${rule === 'semantic' ? "if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(q('f2').value)){msg('" + (lang === 'ru' ? 'Неверный email' : 'That email address is not valid') + "');return;}" : ''}
  msg('');show(2);});
document.getElementById('back2').addEventListener('click',function(){${defect === 'stale-state' ? "q('f1').value='';q('f2').value='';" : ''}show(1);});
document.getElementById('next2').addEventListener('click',function(){
  var seats=parseInt(q('f4').value,10),team=PLANS.indexOf(q('f3').value)===1;
  if(isNaN(seats)||seats<1${seatLimits.length > 0 ? (defect === 'off-by-one' ? '||seats>51' : '||seats>50') : ''}){msg('${lang === 'ru' ? 'Неверное число мест' : 'Enter a valid number of seats'}');return;}
  ${rule === 'cross-field' ? "if(team&&seats<2){msg('" + (lang === 'ru' ? 'Командный тариф - от 2 мест' : 'The Team plan needs at least 2 seats') + "');return;}" : ''}
  var per=${defect === 'wrong-result' ? 'PRICE.basic' : '(team?PRICE.team:PRICE.basic)'};var total=team?per*seats:per;
  if(q('f20')&&q('f20').checked&&q('f21').value==='HALF')total=total/2;
  q('o1').textContent=q('f1').value+' - '+q('f3').value+', '+seats+' ${lang === 'ru' ? 'мест' : 'seat(s)'}, '+total.toFixed(2)+' ${lang === 'ru' ? 'в месяц' : 'per month'}';
  msg('');show(3);});
document.getElementById('confirm').addEventListener('click',function(){msg('${lang === 'ru' ? 'Заказ оформлен' : 'Order placed'}');});
`;
  const defects: GoldDefect[] = [];
  if (defect === 'missing-validation') {
    defects.push({
      id: 'd1',
      kind: 'missing-validation',
      description: 'Step 1 moves on with the name and email empty',
      trigger: 'press Next with name and email empty',
      triggerValues: { f1: '', f2: '' },
      triggerTokens: ['empty', 'without'],
      correct: 'the page stays on step 1 and asks for a name and email',
      wrong: 'step 2 opens',
      correctTokens: ['asks for the name'],
      wrongTokens: [],
      text: {
        description: 'Pressing Next with the name and email empty keeps the sign-up on step 1',
        outcome: 'a message asks for the name and email and step 2 does not open',
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
      description: 'Going Back from step 2 empties the name and email typed on step 1',
      trigger: 'fill step 1, Next, then Back',
      triggerValues: { f1: 'Test User' },
      correct: 'step 1 still shows Test User',
      wrong: 'step 1 is empty',
      correctTokens: ['as typed'],
      wrongTokens: [],
      text: {
        description:
          'Back from step 2 returns to step 1 with Test User and the email still filled in',
        outcome: 'step 1 shows Test User and user@example.com as typed',
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
      description: 'The Team plan is priced at the Basic rate: 3 seats read 36.00 instead of 30.00',
      trigger: 'Team plan, 3 seats',
      triggerValues: { f3: t(plans[1], lang), f4: '3' },
      correct: '30.00',
      wrong: '36.00',
      correctTokens: ['30'],
      wrongTokens: ['36'],
      text: {
        description: 'The Team plan with 3 seats costs 30.00 per month',
        outcome: 'the summary reads 3 seats, 30.00 per month',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    });
  } else if (defect === 'off-by-one') {
    defects.push({
      id: 'd1',
      kind: 'off-by-one',
      description: 'A 51st seat is accepted although the limit is 50',
      trigger: 'seats 51',
      triggerValues: { f4: '51' },
      correct: 'the page stays on step 2',
      wrong: 'the summary prices 51 seats',
      correctTokens: ['51'],
      wrongTokens: [],
      text: {
        description: '51 seats, one past the limit of 50, keeps the sign-up on step 2',
        outcome: 'a message asks for a valid number of seats and no summary appears',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'boundary',
        layer: 'rule',
      },
    });
  }
  const rules: GoldRule[] = [];
  if (rule === 'cross-field') {
    rules.push({
      id: 'r1',
      statement: 'The Team plan needs at least 2 seats',
      fields: ['f3', 'f4'],
      source: 'domain',
      witness: {
        field: 'f4',
        value: '1',
        polarity: 'invalid',
        stands: { kind: 'number', lt: 2 },
      },
      text: {
        description: 'The Team plan with 1 seat is refused',
        outcome: 'a message says the Team plan needs at least 2 seats',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'invalid_input',
        layer: 'rule',
      },
    });
  } else if (rule === 'semantic') {
    rules.push({
      id: 'r1',
      statement: 'The work email has to be a real address: name@domain',
      fields: ['f2'],
      source: 'domain',
      // An address with nothing after the at sign, nothing before it, or no at sign at all.
      witness: {
        field: 'f2',
        value: 'user@',
        polarity: 'invalid',
        stands: { kind: 'text', matches: '^[^@\\s]+@$|^@[^@\\s]*$|^[^@\\s]+@[^@.\\s]*$' },
      },
      text: {
        description: 'user@ with no domain keeps the sign-up on step 1',
        outcome: 'a message says the email address is not valid',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'invalid_input',
        layer: 'rule',
      },
    });
  }
  const all = step1.concat(step2);
  const gold: GoldPage = {
    path: ctx.path,
    title: lang === 'ru' ? 'Оформление подписки' : 'Subscription Sign-up',
    archetype: 'wizard',
    fields: all.map((d) => goldField(d, lang)),
    outputs: [{ kind: 'text-region', label: 'Summary' }],
    duplicates: [],
    mainFlow: {
      inputs: { f1: 'Test User', f2: 'user@example.com', f3: t(plans[1], lang), f4: '3' },
      expectTokens: ['30'],
      outputs: [],
      text: {
        description:
          'Test User on the Team plan with 3 seats reaches a summary priced 30.00 per month',
        outcome: 'step 3 reads Test User - Team, 3 seats, 30.00 per month',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    },
    rules,
    defects,
    ambiguities: [],
    researchChecks: ['wizard'],
  };
  return {
    gold,
    body,
    script,
    title: gold.title,
    heading: gold.title,
    intro:
      lang === 'ru'
        ? 'Три шага: вы, тариф, подтверждение.'
        : 'Three steps: you, your plan, confirmation.',
  };
}

// ---------------------------------------------------------------------------------------------
// Settings that have to persist

export function buildSettings(ctx: BuildContext): BuiltPage {
  const f = ctx.factors;
  const lang = ctx.lang;
  const labels = ctx.secondary ? 'clear' : f.labels;
  const defect = ctx.secondary ? 'none' : f.defect;
  const rule = ctx.secondary ? 'none' : f.rule;
  const slider = !ctx.secondary && f.limits === 'markup-range';
  const formats = ['DD.MM.YYYY', 'YYYY-MM-DD'];
  const fields: FieldDef[] = [
    {
      key: 'dark',
      testId: 'f1',
      label: L('Dark theme', 'Тёмная тема'),
      meaning: 'Whether the whole application uses dark colours',
      role: 'setting',
      kind: 'checkbox',
      control: 'checkbox',
      validity: { type: 'toggle' },
      sample: 'checked',
      sampleOutcome: 'the preview says the theme is dark',
    },
    slider
      ? {
          key: 'font-size',
          testId: 'f2',
          label: L('Font size', 'Размер шрифта'),
          meaning: 'The text size used across the application, in pixels',
          role: 'setting',
          kind: 'number',
          control: 'input',
          type: 'range',
          attrs: { step: '2', value: '16' },
          validity: { type: 'number', min: 12, max: 24 },
          limits: [
            { side: 'min', attribute: 'min', value: 12, stated: 'markup' },
            { side: 'max', attribute: 'max', value: 24, stated: 'markup' },
          ],
          sample: '16',
          sampleOutcome: 'the preview text is set at 16 px',
        }
      : {
          key: 'font-size',
          testId: 'f2',
          label: L('Font size', 'Размер шрифта'),
          meaning: 'The text size used across the application, in pixels',
          role: 'setting',
          kind: 'select',
          control: 'select',
          options: ['12', '14', '16', '18', '20', '22', '24'].map((x) => ({ en: x, ru: x })),
          validity: { type: 'option', options: ['12', '14', '16', '18', '20', '22', '24'] },
          sample: '16',
          sampleOutcome: 'the preview text is set at 16 px',
        },
    {
      key: 'date-format',
      testId: 'f3',
      label: L('Date format', 'Формат даты'),
      meaning: 'How dates are written everywhere in the application',
      role: 'setting',
      kind: 'select',
      control: 'select',
      options: formats.map((x) => ({ en: x, ru: x })),
      validity: { type: 'option', options: formats },
      sample: 'YYYY-MM-DD',
      sampleOutcome: 'the preview date reads 2026-09-12',
    },
  ];
  if (!ctx.secondary && f.reveal === 'toggle-reveals-field') {
    fields.push({
      key: 'notify',
      testId: 'f5',
      label: L('Email me a weekly digest', 'Присылать еженедельную сводку'),
      meaning: 'Whether a weekly summary is emailed',
      role: 'toggle',
      kind: 'checkbox',
      control: 'checkbox',
      validity: { type: 'toggle' },
      sample: 'checked',
      sampleOutcome: 'the weekday field appears',
    });
    fields.push({
      key: 'digest-day',
      testId: 'f6',
      label: L('Digest day', 'День сводки'),
      meaning: 'Which weekday the digest is sent on',
      role: 'setting',
      kind: 'select',
      control: 'select',
      options: [L('Monday', 'Понедельник'), L('Friday', 'Пятница')],
      validity: {
        type: 'option',
        options: [t(L('Monday', 'Понедельник'), lang), t(L('Friday', 'Пятница'), lang)],
      },
      sample: t(L('Friday', 'Пятница'), lang),
      sampleOutcome: 'the preview says the digest goes out on Friday',
      hiddenUntil: 'f5',
    });
  }
  const body =
    fields.map((d) => renderField(d, labels, lang)).join('\n') +
    '\n<button type="button" data-testid="b1" id="save">' +
    (lang === 'ru' ? 'Сохранить' : 'Save') +
    '</button> <button type="button" data-testid="b2" id="defaults">' +
    (lang === 'ru' ? 'По умолчанию' : 'Restore defaults') +
    '</button>\n<div class="result" data-testid="o1"></div>';
  const script = `
function q(id){return document.querySelector('[data-testid="'+id+'"]');}
var KEY='settings-v1';
function preview(s){q('o1').textContent=(s.dark?'${lang === 'ru' ? 'Тёмная тема' : 'Dark theme'}':'${lang === 'ru' ? 'Светлая тема' : 'Light theme'}')+', '+s.font+' px, '+(s.format==='YYYY-MM-DD'?'2026-09-12':'12.09.2026')+(s.day?', digest '+s.day:'');}
function read(){return {dark:q('f1').checked,font:q('f2').value,format:q('f3').value,day:q('f5')&&q('f5').checked?q('f6').value:''};}
function load(){try{var s=JSON.parse(localStorage.getItem(KEY)||'null');if(!s)return preview(read());${defect === 'wrong-result' ? 's.dark=false;' : ''}q('f1').checked=s.dark;q('f2').value=s.font;q('f3').value=s.format;preview(s);}catch(e){preview(read());}}
document.getElementById('save').addEventListener('click',function(){var s=read();${defect === 'off-by-one' ? "if(s.font==='24')s.font='22';" : ''}localStorage.setItem(KEY,JSON.stringify(s));preview(s);});
document.getElementById('defaults').addEventListener('click',function(){q('f1').checked=false;q('f2').value='16';q('f3').value='DD.MM.YYYY';localStorage.removeItem(KEY);${defect === 'stale-state' ? '' : 'preview(read());'}});
load();
`;
  const defects: GoldDefect[] = [];
  if (defect === 'wrong-result') {
    defects.push({
      id: 'd1',
      kind: 'wrong-result',
      description: 'The dark theme is saved but comes back light after a reload',
      trigger: 'tick Dark theme, Save, reload the page',
      triggerValues: { f1: 'checked' },
      triggerTokens: ['dark theme', 'reload'],
      correct: 'Dark theme after the reload',
      wrong: 'Light theme after the reload',
      correctTokens: ['Dark', 'reload'],
      wrongTokens: [],
      text: {
        description: 'The dark theme, once saved, is still on after the page is reloaded',
        outcome: 'after a reload the Dark theme box is ticked and the preview says Dark theme',
        technique: 'property',
        relation: 'persists-across-navigation',
        sourceInput: 'Dark theme on, Save, reload',
        scenario: 'positive',
        layer: 'behavior',
      },
    });
  } else if (defect === 'off-by-one') {
    defects.push({
      id: 'd1',
      kind: 'off-by-one',
      description: 'The largest font size, 24, is saved as 22',
      trigger: 'font size 24, Save',
      triggerValues: { f2: '24' },
      correct: '24 px',
      wrong: '22 px',
      correctTokens: ['24'],
      wrongTokens: [],
      text: {
        description: 'Font size 24, the largest offered, is saved as 24',
        outcome: 'the preview reads 24 px after Save',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    });
  } else if (defect === 'stale-state') {
    defects.push({
      id: 'd1',
      kind: 'stale-state',
      description: 'Restore defaults resets the fields but the preview keeps the old settings',
      trigger: 'save Dark theme, then Restore defaults',
      triggerValues: { f1: 'unchecked' },
      triggerTokens: ['restore defaults', 'defaults'],
      correct: 'the preview says Light theme, 16 px',
      wrong: 'the preview still says Dark theme',
      correctTokens: ['Light'],
      wrongTokens: [],
      text: {
        description:
          'Restore defaults after saving the dark theme puts the preview back to Light theme, 16 px',
        outcome: 'the preview reads Light theme, 16 px, 12.09.2026',
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
      statement: 'Saved settings persist across a reload and a visit to another page',
      fields: ['f1', 'f2', 'f3'],
      source: 'domain',
      // Either format shows that a saved setting comes back.
      witness: {
        field: 'f3',
        value: 'YYYY-MM-DD',
        polarity: 'valid',
        stands: { kind: 'text', matches: '^(YYYY-MM-DD|DD\\.MM\\.YYYY)$' },
      },
      text: {
        description: 'The date format YYYY-MM-DD, once saved, is still chosen after a reload',
        outcome: 'after a reload the date format reads YYYY-MM-DD and the preview shows 2026-09-12',
        technique: 'property',
        relation: 'persists-across-navigation',
        sourceInput: 'date format YYYY-MM-DD, Save, reload',
        scenario: 'positive',
        layer: 'rule',
      },
    });
  }
  const gold: GoldPage = {
    path: ctx.path,
    title: lang === 'ru' ? 'Настройки' : 'Settings',
    archetype: 'settings',
    fields: fields.map((d) => goldField(d, lang)),
    outputs: [{ kind: 'text-region', label: 'Preview' }],
    duplicates: [],
    mainFlow: {
      inputs: { f1: 'checked', f2: '16', f3: 'YYYY-MM-DD' },
      expectTokens: ['16'],
      outputs: [],
      text: {
        description: 'Saving the dark theme, 16 px and YYYY-MM-DD shows them in the preview',
        outcome: 'the preview reads Dark theme, 16 px, 2026-09-12',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    },
    rules,
    defects,
    ambiguities: [],
    researchChecks: ['settings'],
  };
  return {
    gold,
    body,
    script,
    title: gold.title,
    heading: gold.title,
    intro:
      lang === 'ru'
        ? 'Как приложение выглядит и пишет даты.'
        : 'How the application looks and writes dates.',
  };
}

// ---------------------------------------------------------------------------------------------
// CSV import

export function buildFileUpload(ctx: BuildContext): BuiltPage {
  const f = ctx.factors;
  const lang = ctx.lang;
  const labels = ctx.secondary ? 'clear' : f.labels;
  const defect = ctx.secondary ? 'none' : f.defect;
  const rule = ctx.secondary ? 'none' : f.rule;
  const labelled = !ctx.secondary && f.limits === 'label-only';
  const fields: FieldDef[] = [
    {
      key: 'file',
      testId: 'f1',
      label: L('CSV file', 'CSV-файл'),
      meaning: 'The CSV file whose rows are imported',
      role: 'file',
      kind: 'other',
      control: 'input',
      type: 'file',
      attrs: { accept: '.csv' },
      validity: { type: 'file', accept: ['.csv'] },
      limits: labelled
        ? [
            {
              side: 'max',
              attribute: 'max',
              value: 1048576,
              stated: 'label',
              excerpt: lang === 'ru' ? '(до 1 МБ)' : '(up to 1 MB)',
            },
          ]
        : [],
      sample: 'people.csv',
      sampleOutcome: 'the summary counts the rows and columns of people.csv',
    },
    {
      key: 'header',
      testId: 'f2',
      label: L('First row is a header', 'Первая строка - заголовок'),
      meaning: 'Whether the first row names the columns rather than holding data',
      role: 'setting',
      kind: 'checkbox',
      control: 'checkbox',
      validity: { type: 'toggle' },
      sample: 'checked',
      sampleOutcome: 'the first row is shown as column names, not counted as data',
    },
    {
      key: 'delimiter',
      testId: 'f3',
      label: L('Delimiter', 'Разделитель'),
      meaning: 'The character that separates columns in the file',
      role: 'setting',
      kind: 'select',
      control: 'select',
      options: [L('Comma', 'Запятая'), L('Semicolon', 'Точка с запятой')],
      validity: {
        type: 'option',
        options: [t(L('Comma', 'Запятая'), lang), t(L('Semicolon', 'Точка с запятой'), lang)],
      },
      sample: t(L('Comma', 'Запятая'), lang),
      sampleOutcome: 'columns are split at commas',
    },
  ];
  const body =
    fields.map((d) => renderField(d, labels, lang)).join('\n') +
    '\n<button type="button" data-testid="b1" id="import">' +
    (lang === 'ru' ? 'Импортировать' : 'Import') +
    '</button>\n<div class="result" data-testid="o1"></div>';
  const script = `
function q(id){return document.querySelector('[data-testid="'+id+'"]');}
document.getElementById('import').addEventListener('click',function(){
  var file=q('f1').files[0];if(!file){q('o1').textContent='${lang === 'ru' ? 'Выберите файл' : 'Choose a file'}';return;}
  ${defect === 'missing-validation' ? '' : "if(!/\\.csv$/i.test(file.name)){q('o1').textContent='" + (lang === 'ru' ? 'Нужен файл .csv' : 'Only .csv files can be imported') + "';return;}"}
  ${labelled ? "if(file.size>1048576){q('o1').textContent='" + (lang === 'ru' ? 'Файл больше 1 МБ' : 'The file is larger than 1 MB') + "';return;}" : ''}
  var reader=new FileReader();reader.onload=function(){
    var text=String(reader.result).replace(/\\r/g,'');var lines=text.split('\\n').filter(function(l){return l.trim()!=='';});
    ${rule === 'semantic' ? "if(lines.length===0){q('o1').textContent='" + (lang === 'ru' ? 'Файл пуст' : 'The file is empty') + "';return;}" : ''}
    var sep=${defect === 'wrong-result' ? "','" : "q('f3').selectedIndex===1?';':','"};var header=q('f2').checked;
    var cols=lines.length?lines[0].split(sep).length:0;var rows=lines.length-(header${defect === 'off-by-one' ? '&&false' : ''}?1:0);
    q('o1').textContent=rows+' ${lang === 'ru' ? 'строк' : 'rows'}, '+cols+' ${lang === 'ru' ? 'столбцов' : 'columns'}'+(header&&lines.length?': '+lines[0].split(sep).join(', '):'');
  };reader.readAsText(file);
});
`;
  const defects: GoldDefect[] = [];
  if (defect === 'off-by-one') {
    defects.push({
      id: 'd1',
      kind: 'off-by-one',
      description:
        'The header row is counted as data: a file with a header and 3 rows reads 4 rows',
      trigger: 'import name,age plus 3 rows with the header box ticked',
      triggerValues: { f2: 'checked' },
      triggerTokens: ['header'],
      correct: '3 rows',
      wrong: '4 rows',
      correctTokens: ['3 rows'],
      wrongTokens: ['4 rows'],
      text: {
        description: 'A file with a header row and 3 data rows imports as 3 rows',
        outcome: 'the summary reads 3 rows, 2 columns: name, age',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    });
  } else if (defect === 'missing-validation') {
    defects.push({
      id: 'd1',
      kind: 'missing-validation',
      description: 'A .png file is imported as if it were CSV',
      trigger: 'import a file named picture.png',
      triggerValues: { f1: 'picture.png' },
      correct: 'the file is refused',
      wrong: 'a row count for the image',
      correctTokens: ['.csv', 'refused'],
      wrongTokens: [],
      text: {
        description: 'A file named picture.png is refused as not being a CSV',
        outcome: 'a message says only .csv files can be imported and nothing is counted',
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
      description: 'The semicolon delimiter is ignored: a;b;c counts as 1 column',
      trigger: 'import a;b;c rows with Semicolon chosen',
      triggerValues: { f3: t(L('Semicolon', 'Точка с запятой'), lang) },
      correct: '3 columns',
      wrong: '1 column',
      correctTokens: ['3 columns', '3'],
      wrongTokens: [],
      text: {
        description: 'With Semicolon chosen, rows written a;b;c import as 3 columns',
        outcome: 'the summary reads 3 columns: a, b, c',
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
      statement: 'An empty file is refused instead of importing 0 rows',
      fields: ['f1'],
      source: 'domain',
      witness: {
        field: 'f1',
        value: 'empty.csv',
        polarity: 'invalid',
        stands: { kind: 'text', matches: 'empty|пуст' },
      },
      text: {
        description: 'An empty empty.csv is refused',
        outcome: 'a message says the file is empty',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'invalid_input',
        layer: 'rule',
      },
    });
  }
  const gold: GoldPage = {
    path: ctx.path,
    title: lang === 'ru' ? 'Импорт CSV' : 'CSV Import',
    archetype: 'file-upload',
    fields: fields.map((d) => goldField(d, lang)),
    outputs: [{ kind: 'text-region', label: 'Summary' }],
    duplicates: [],
    mainFlow: {
      inputs: { f1: 'people.csv', f2: 'checked' },
      expectTokens: ['3'],
      outputs: [],
      text: {
        description:
          'Importing people.csv - a header name,age and 3 rows - counts 3 rows and 2 columns',
        outcome: 'the summary reads 3 rows, 2 columns: name, age',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    },
    rules,
    defects,
    ambiguities: [],
    researchChecks: ['file-upload'],
  };
  return {
    gold,
    body,
    script,
    title: gold.title,
    heading: gold.title,
    intro:
      lang === 'ru'
        ? 'Загрузите CSV, чтобы увидеть его строки и столбцы.'
        : 'Upload a CSV to see its rows and columns.',
  };
}

// ---------------------------------------------------------------------------------------------
// Sign-in form

export function buildLogin(ctx: BuildContext): BuiltPage {
  const f = ctx.factors;
  const lang = ctx.lang;
  const labels = ctx.secondary ? 'clear' : f.labels;
  const defect = ctx.secondary ? 'none' : f.defect;
  const rule = ctx.secondary ? 'none' : f.rule;
  const pwLimits: GoldLimit[] =
    !ctx.secondary && f.limits === 'markup-length'
      ? [{ side: 'min', attribute: 'minlength', value: 8, stated: 'markup' }]
      : !ctx.secondary && f.limits === 'label-only'
        ? [
            {
              side: 'min',
              attribute: 'minlength',
              value: 8,
              stated: 'label',
              excerpt: lang === 'ru' ? '(не короче 8 символов)' : '(at least 8 characters)',
            },
          ]
        : [];
  const required = !ctx.secondary && f.limits === 'markup-length';
  const fields: FieldDef[] = [
    {
      key: 'email',
      testId: 'f1',
      label: L('Email', 'Email'),
      meaning: 'The address the account is registered under',
      role: 'identifier',
      kind: 'email',
      control: 'input',
      type: 'email',
      validity: { type: 'text', format: 'email', required: true },
      required,
      sample: 'user@example.com',
      sampleOutcome: 'the sign-in is tried for user@example.com',
      pii: true,
      invalid: required
        ? {
            sample: '',
            outcome: 'the browser asks for an email and nothing is sent',
            signal: 'html5-constraint',
            excerpt: 'required',
          }
        : undefined,
    },
    {
      key: 'password',
      testId: 'f2',
      label: L('Password', 'Пароль'),
      meaning: 'The secret that proves the person owns the account',
      role: 'credential',
      kind: 'password',
      control: 'input',
      type: 'password',
      validity: { type: 'text', minLength: 8, required: true },
      limits: pwLimits,
      required,
      sample: 'Passw0rd!',
      sampleOutcome: 'a correct password signs the test account in',
      invalid:
        pwLimits.length > 0
          ? {
              sample: 'short1',
              outcome:
                pwLimits[0].stated === 'markup'
                  ? 'the field is marked too short and nothing is sent'
                  : 'a message says the password needs at least 8 characters',
              signal: pwLimits[0].stated === 'markup' ? 'html5-constraint' : 'form-label',
              excerpt: pwLimits[0].stated === 'markup' ? 'minlength=8' : pwLimits[0].excerpt!,
            }
          : undefined,
    },
    {
      key: 'remember',
      testId: 'f3',
      label: L('Keep me signed in', 'Не выходить из аккаунта'),
      meaning: 'Whether the session survives closing the browser',
      role: 'setting',
      kind: 'checkbox',
      control: 'checkbox',
      validity: { type: 'toggle' },
      sample: 'checked',
      sampleOutcome: 'the greeting says the session is kept',
    },
  ];
  if (!ctx.secondary && f.pii === 'contact-fields') {
    fields.push({
      key: 'phone',
      testId: 'f4',
      label: L('Or phone number', 'Или номер телефона'),
      meaning: 'A phone number that signs in instead of the email',
      role: 'identifier',
      kind: 'text',
      control: 'input',
      type: 'tel',
      validity: { type: 'text' },
      sample: '+1 202-555-0143',
      sampleOutcome: 'the sign-in is tried for the phone +1 202-555-0143',
      pii: true,
    });
  }
  const body =
    '<form onsubmit="return false">' +
    fields.map((d) => renderField(d, labels, lang)).join('\n') +
    '\n<button type="submit" data-testid="b1" id="signin">' +
    (lang === 'ru' ? 'Войти' : 'Sign in') +
    '</button></form>\n<div class="message" data-testid="o1"></div>';
  const welcome = lang === 'ru' ? 'С возвращением' : 'Welcome back';
  const wrong = lang === 'ru' ? 'Неверный email или пароль' : 'Wrong email or password';
  const script = `
function q(id){return document.querySelector('[data-testid="'+id+'"]');}
document.getElementById('signin').addEventListener('click',function(){
  var e=q('f1').value.trim(),p=q('f2').value;
  ${defect === 'stale-state' ? '' : "q('o1').textContent='';"}
  ${pwLimits.length > 0 && defect !== 'missing-validation' ? "if(p.length<8){q('o1').textContent='" + (lang === 'ru' ? 'Пароль не короче 8 символов' : 'The password needs at least 8 characters') + "';return;}" : ''}
  if(e==='user@example.com'&&p==='Passw0rd!'){q('o1').textContent=${defect === 'stale-state' ? "(q('o1').textContent?q('o1').textContent+' ':'')+" : ''}'${welcome}, '+e+(q('f3').checked?' (${lang === 'ru' ? 'сессия сохранена' : 'session kept'})':'');return;}
  q('o1').textContent=${defect === 'wrong-result' ? "e==='user@example.com'?'" + (lang === 'ru' ? 'Неверный пароль' : 'Wrong password') + "':'" + (lang === 'ru' ? 'Нет аккаунта с таким email' : 'No account with this email') + "'" : "'" + wrong + "'"};
});
`;
  const defects: GoldDefect[] = [];
  if (defect === 'missing-validation') {
    defects.push({
      id: 'd1',
      kind: 'missing-validation',
      description:
        'A 7-character password is sent anyway; the page answers wrong password instead of too short',
      trigger: 'password short12 (7 characters)',
      triggerValues: { f2: 'short12' },
      triggerTokens: ['short12', '7-character', '7 character'],
      correct: 'the password is refused as too short',
      wrong: 'the sign-in is tried',
      correctTokens: ['8'],
      wrongTokens: [],
      text: {
        description: 'A 7-character password is refused before anything is sent',
        outcome: 'a message says the password needs at least 8 characters',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'boundary',
        layer: 'rule',
      },
    });
  } else if (defect === 'stale-state') {
    defects.push({
      id: 'd1',
      kind: 'stale-state',
      description:
        'After a failed attempt, the error stays on screen beside the welcome of the next, correct attempt',
      trigger: 'sign in with a wrong password, then with the right one',
      triggerValues: { f2: 'Passw0rd!' },
      triggerTokens: ['after a wrong password', 'after a failed'],
      correct: 'only the welcome is shown',
      wrong: 'the old error and the welcome',
      correctTokens: [welcome],
      wrongTokens: [],
      text: {
        description: 'A correct sign-in after a wrong password shows only the welcome',
        outcome:
          'the message reads ' + welcome + ', user@example.com and the earlier error is gone',
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
      description:
        'The error says whether the email exists: "No account with this email" versus "Wrong password"',
      trigger: 'sign in as nobody@example.com',
      triggerValues: { f1: 'nobody@example.com' },
      triggerTokens: ['unknown email', 'nobody@example.com'],
      correct: wrong,
      wrong: 'No account with this email',
      correctTokens: [wrong],
      wrongTokens: ['No account'],
      text: {
        description: 'An unknown email and a wrong password get the same message',
        outcome: 'both read ' + wrong + ', never which part was wrong',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'permission_denied',
        layer: 'rule',
      },
    });
  }
  const rules: GoldRule[] = [];
  if (rule === 'semantic') {
    rules.push({
      id: 'r1',
      statement: 'The error never tells which of email or password was wrong',
      fields: ['f1', 'f2'],
      source: 'domain',
      // Any address nobody is registered under says the same thing.
      witness: {
        field: 'f1',
        value: 'nobody@example.com',
        polarity: 'invalid',
        stands: { kind: 'text', matches: '@(example|test)\\.(com|org|net)$' },
      },
      text: {
        description: 'Signing in as nobody@example.com says ' + wrong,
        outcome: 'the message reads ' + wrong + ' and names neither field',
        technique: 'error-guessing',
        scenario: 'negative',
        negativeCategory: 'permission_denied',
        layer: 'rule',
      },
    });
  }
  const gold: GoldPage = {
    path: ctx.path,
    title: lang === 'ru' ? 'Вход' : 'Sign in',
    archetype: 'login',
    fields: fields.map((d) => goldField(d, lang)),
    outputs: [{ kind: 'text-region', label: 'Message' }],
    duplicates: [],
    mainFlow: {
      inputs: { f1: 'user@example.com', f2: 'Passw0rd!' },
      expectTokens: [welcome],
      outputs: [],
      text: {
        description: 'The test account user@example.com with its password signs in',
        outcome: 'the message reads ' + welcome + ', user@example.com',
        technique: 'error-guessing',
        scenario: 'positive',
        layer: 'behavior',
      },
    },
    rules,
    defects,
    ambiguities: [],
    researchChecks: ['login'],
  };
  return {
    gold,
    body,
    script,
    title: gold.title,
    heading: gold.title,
    intro: lang === 'ru' ? 'Войдите в тестовый аккаунт.' : 'Sign in to the test account.',
  };
}
