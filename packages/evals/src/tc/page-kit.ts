// The pieces every dataset page is built from: the page shell with its site frame, and fields
// rendered the way the dataset's label factor says - so the markup, the gold and the label text come
// out of one call and cannot disagree.
import type { DatasetFactors } from './model.js';
import type { GoldField, GoldLimit, Validity, FieldRole, ParameterKind } from './gold.js';

export type Lang = DatasetFactors['language'];
export type Text = { en: string; ru: string };

export function t(text: Text, lang: Lang): string {
  return text[lang];
}

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface FieldDef {
  key: string;
  testId: string;
  label: Text;
  meaning: string;
  role: FieldRole;
  kind: ParameterKind;
  // The control: input type, select, textarea or checkbox.
  control: 'input' | 'select' | 'textarea' | 'checkbox';
  type?: string | undefined;
  options?: Text[] | undefined;
  validity: Validity;
  limits?: GoldLimit[] | undefined;
  required?: boolean | undefined;
  sample: string;
  sampleOutcome: string;
  invalid?: GoldField['invalid'] | undefined;
  // Extra attributes: step, value, readonly.
  attrs?: Record<string, string> | undefined;
  hiddenUntil?: string | undefined;
  pii?: boolean | undefined;
}

// The limit a label states, written into the label text itself.
export function limitSuffix(limits: GoldLimit[] | undefined, _lang: Lang): string {
  const stated = (limits || []).filter((l) => l.stated === 'label');
  if (stated.length === 0) return '';
  return ' ' + stated.map((l) => l.excerpt).join(', ');
}

export function renderField(def: FieldDef, labels: DatasetFactors['labels'], lang: Lang): string {
  const attrs: string[] = ['data-testid="' + def.testId + '"', 'name="' + def.key + '"'];
  for (const limit of def.limits || []) {
    if (limit.stated === 'markup') attrs.push(limit.attribute + '="' + limit.value + '"');
  }
  if (def.required) attrs.push('required');
  for (const [k, v] of Object.entries(def.attrs || {}))
    attrs.push(v === '' ? k : k + '="' + esc(v) + '"');
  const text = t(def.label, lang) + limitSuffix(def.limits, lang);
  const hidden = def.hiddenUntil ? ' hidden data-reveal-by="' + def.hiddenUntil + '"' : '';
  let control: string;
  if (def.control === 'select') {
    const options = (def.options || [])
      .map((o) => '<option>' + esc(t(o, lang)) + '</option>')
      .join('');
    control =
      '<select ' +
      attrs.join(' ') +
      (labels === 'placeholder-only' ? ' aria-label="' + esc(text) + '"' : '') +
      '>' +
      options +
      '</select>';
  } else if (def.control === 'textarea') {
    control =
      '<textarea ' +
      attrs.join(' ') +
      (labels === 'placeholder-only' ? ' placeholder="' + esc(text) + '"' : '') +
      '></textarea>';
  } else if (def.control === 'checkbox') {
    // A checkbox is always named by the text beside it: there is nothing else to read.
    return (
      '<label class="row"' +
      hidden +
      '><input type="checkbox" ' +
      attrs.join(' ') +
      '> ' +
      esc(text) +
      '</label>'
    );
  } else {
    control =
      '<input type="' +
      (def.type || 'text') +
      '" ' +
      attrs.join(' ') +
      (labels === 'placeholder-only' ? ' placeholder="' + esc(text) + '"' : '') +
      '>';
  }
  if (labels === 'clear')
    return (
      '<label class="row"' + hidden + '><span>' + esc(text) + '</span> ' + control + '</label>'
    );
  if (labels === 'hint-only')
    return '<div class="row"' + hidden + '><span>' + esc(text) + '</span> ' + control + '</div>';
  return '<div class="row"' + hidden + '>' + control + '</div>';
}

export function goldField(def: FieldDef, lang: Lang): GoldField {
  return {
    testId: def.testId,
    key: def.key,
    label: t(def.label, lang),
    meaning: def.meaning,
    role: def.role,
    kind: def.kind,
    validity: def.validity,
    limits: def.limits || [],
    required: Boolean(def.required),
    sample: def.sample,
    sampleOutcome: def.sampleOutcome,
    invalid: def.invalid,
    options: def.options ? def.options.map((o) => t(o, lang)) : undefined,
    revealedBy: def.hiddenUntil,
    pii: def.pii,
  };
}

export interface ShellOptions {
  lang: Lang;
  title: string;
  heading: string;
  intro: string;
  nav: Array<{ path: string; label: string }>;
  frame: boolean;
  body: string;
  script: string;
}

export const FRAME_FIELD = {
  testId: 'fr1',
  label: { en: 'Language', ru: 'Язык' },
  options: ['EN', 'RU', 'DE'],
};

export function shell(o: ShellOptions): string {
  const nav = o.nav.map((n) => '<a href="' + n.path + '">' + esc(n.label) + '</a>').join(' ');
  const frame = o.frame
    ? ' <label class="lang">' +
      esc(t(FRAME_FIELD.label, o.lang)) +
      ' <select data-testid="' +
      FRAME_FIELD.testId +
      '" name="site-language">' +
      FRAME_FIELD.options.map((x) => '<option>' + x + '</option>').join('') +
      '</select></label>'
    : '';
  return (
    '<!doctype html>\n<html lang="' +
    o.lang +
    '"><head><meta charset="utf-8"><title>' +
    esc(o.title) +
    '</title><style>' +
    'body{font-family:system-ui,sans-serif;margin:0}header,footer{padding:12px 24px;background:#f3f3f3}' +
    'main{padding:24px;max-width:760px}.row{display:flex;gap:8px;align-items:center;margin:8px 0}' +
    '.result,.message{margin:12px 0;padding:8px;background:#f8f8ff;min-height:1.2em;white-space:pre-wrap}' +
    'nav a{margin-right:12px}.lang{float:right}' +
    '</style></head><body>' +
    '<header><nav>' +
    nav +
    frame +
    '</nav></header><main><h1>' +
    esc(o.heading) +
    '</h1><p>' +
    esc(o.intro) +
    '</p>' +
    o.body +
    '</main><footer>' +
    (o.lang === 'ru' ? 'Инструменты для тестировщиков' : 'Tools for testers') +
    '</footer><script>\n' +
    // Every page reveals a field hidden behind a toggle the same way.
    "document.querySelectorAll('[data-reveal-by]').forEach(function(el){var t=document.querySelector('[data-testid=\"'+el.getAttribute('data-reveal-by')+'\"]');if(t)t.addEventListener('change',function(){el.hidden=!t.checked;});});\n" +
    o.script +
    '\n</script></body></html>\n'
  );
}

// A button that hands the page's result on: named so the inventory records it as an output.
export function copyButton(testId: string, lang: Lang, source: string): string {
  return (
    '<button type="button" data-testid="' +
    testId +
    '" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.querySelector(\'' +
    source +
    "').value||document.querySelector('" +
    source +
    '\').textContent)">' +
    (lang === 'ru' ? 'Копировать результат' : 'Copy result') +
    '</button>'
  );
}

export function downloadButton(testId: string, lang: Lang, script: string): string {
  return (
    '<button type="button" data-testid="' +
    testId +
    '" onclick="' +
    esc(script) +
    '">' +
    (lang === 'ru' ? 'Скачать' : 'Download') +
    '</button>'
  );
}

// Where a result goes, as markup: a read-only box, plain text, or a box and a copy button beside it.
export function resultMarkup(
  output: DatasetFactors['output'],
  lang: Lang,
  label: Text,
): { html: string; target: string } {
  if (output === 'text-region')
    return {
      html: '<div class="result" data-testid="o1" aria-live="polite"></div>',
      target: '[data-testid="o1"]',
    };
  const box =
    '<label class="row"><span>' +
    esc(t(label, lang)) +
    '</span> <textarea readonly data-testid="o1" rows="4" cols="50"></textarea></label>';
  if (output === 'copy-button')
    return {
      html: box + copyButton('o2', lang, '[data-testid="o1"]'),
      target: '[data-testid="o1"]',
    };
  return { html: box, target: '[data-testid="o1"]' };
}

// Sets the result wherever it lives.
export const SET_RESULT =
  "function setResult(text){var el=document.querySelector('[data-testid=\"o1\"]');if(!el)return;if('value' in el&&el.tagName!=='DIV')el.value=text;else el.textContent=text;}";
