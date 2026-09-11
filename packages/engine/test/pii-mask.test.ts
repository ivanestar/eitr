import { describe, it, expect } from 'vitest';
import { PII_MASK_SOURCE } from '../src/plan/templates/pii-mask.js';
import { renderPageInventory } from '../src/plan/templates/page-inventory.js';
import { renderFieldProbe } from '../src/plan/templates/field-probe.js';
import { renderOverlayLedger } from '../src/plan/templates/overlay-ledger.js';
import { renderTestConditionsEngine } from '../src/plan/templates/test-conditions-engine.js';
import { renderApiContractsValidator } from '../src/plan/templates/api-contracts-validator.js';
import { renderFeatureMapEngine } from '../src/plan/templates/feature-map-engine.js';
import { renderFeatureMapValidator } from '../src/plan/templates/feature-map-validator.js';

type MaskPii = (text: unknown, options?: { keepEmails?: boolean }) => unknown;
type HasPii = (text: unknown, options?: { keepEmails?: boolean }) => boolean;

// The fragment as the generated scripts run it: plain JavaScript, no imports.
const { maskPii, hasPii } = new Function(PII_MASK_SOURCE + '\nreturn { maskPii, hasPii };')() as {
  maskPii: MaskPii;
  hasPii: HasPii;
};

// Every script that stores text read from the application.
const SCRIPTS: Array<[string, string]> = [
  ['page-inventory.mjs', renderPageInventory()],
  ['field-probe.mjs', renderFieldProbe()],
  ['overlay-ledger.mjs', renderOverlayLedger()],
  ['generate-test-conditions.mjs', renderTestConditionsEngine()],
  ['validate-api-contracts.mjs', renderApiContractsValidator()],
  ['derive-feature-map.mjs', renderFeatureMapEngine()],
  ['validate-feature-map.mjs', renderFeatureMapValidator()],
];

describe('PII masking rule shared by the generated scripts', () => {
  it.each([
    [
      'a phone number with a country code, brackets and a dash',
      'Call +1 (555) 123-4567',
      'Call +[REDACTED]',
    ],
    ['a phone number with dots', 'Tel. 555.123.4567', 'Tel. [REDACTED]'],
    ['a phone number with en dashes', '555–123–4567', '[REDACTED]'],
    ['a card number in groups', 'Card 4111 1111 1111 1111', 'Card [REDACTED]'],
    ['a social security number', 'SSN 123-45-6789', 'SSN [REDACTED]'],
    ['an unbroken account number', 'Account 998877665544', 'Account [REDACTED]'],
    // Letters break the digit run, so only the mostly-digits rule can catch this one.
    ['a mostly-digit order id', 'Order X9Y8Z7654 shipped', 'Order [REDACTED] shipped'],
    ['an email address glued to a label', 'Contact:ann@corp.example', 'Contact:[REDACTED]'],
    ['a written-out date', 'Updated 2026-09-11', 'Updated [REDACTED]'],
  ])('masks %s', (_label, input, expected) => {
    expect(maskPii(input)).toBe(expected);
  });

  it.each([
    ['a range label', 'Count (1-1000):'],
    ['a short number', 'Page 12 of 40'],
    ['a version', 'Version 2.1.3'],
    ['a UUID-like token that is not mostly digits', 'id a1b2c3d4'],
    ['plain text', 'Generate GUIDs'],
  ])('leaves %s alone', (_label, input) => {
    expect(maskPii(input)).toBe(input);
    expect(hasPii(input)).toBe(false);
  });

  it('keeps a made-up email address when asked, and still masks digit shapes', () => {
    expect(maskPii('qa.user@example.test', { keepEmails: true })).toBe('qa.user@example.test');
    expect(maskPii('4111 1111 1111 1111', { keepEmails: true })).toBe('[REDACTED]');
  });

  it('is idempotent, and answers the same on every call despite its global regexes', () => {
    const input = 'Call (555) 123-4567 or write to ann@corp.example';
    const once = maskPii(input);
    expect(maskPii(once)).toBe(once);
    expect(hasPii(input)).toBe(true);
    expect(hasPii(input)).toBe(true);
    expect(hasPii(once)).toBe(false);
  });

  it('passes a non-string through untouched', () => {
    expect(maskPii(undefined)).toBeUndefined();
    expect(maskPii(42)).toBe(42);
    expect(hasPii(null)).toBe(false);
  });

  // Seven scripts once carried seven versions of this rule and drifted apart. Each must carry the
  // fragment verbatim and nothing of its own.
  it.each(SCRIPTS)('%s carries the shared rule and no copy of its own', (_name, source) => {
    expect(source).toContain(PII_MASK_SOURCE);
    expect(source.split('function maskPii(').length - 1).toBe(1);
    expect(source).not.toMatch(/const (DIGIT_RUN|EMAIL|MAJORITY_DIGIT_TOKEN) =/);
    expect(source).not.toMatch(/function isMajorityDigit/);
  });
});
