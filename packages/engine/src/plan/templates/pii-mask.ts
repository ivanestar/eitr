// The one PII-masking rule every generated script applies before it stores text that came from the
// application under test: page text, overlay text, probe messages, quoted evidence, recorded request
// payloads.
//
// It is pasted into each script at generation rather than imported at run time, so the scripts stay
// self-contained and any one of them can be removed without breaking another. A generated project
// therefore carries several copies of it; the engine carries one, and pii-mask.test.ts fails when a
// script goes back to a rule of its own.
//
// Seven scripts used to carry their own versions, and they had drifted apart: three masked a phone
// number written with spaces or brackets, the other four only masked six digits in an unbroken run,
// so "+1 (555) 123-4567" was hidden in the page inventory and stored in full by the overlay ledger,
// the feature map's quotes and the recorded API payloads.
//
// The separators follow libphonenumber's punctuation for phone numbers (spaces, hyphens and the
// Unicode dashes, dots, brackets) minus the slash, which would also take in every path in an href.
export const PII_MASK_SOURCE = `// PII masking - the same rule in every script of this project that stores text read from the
// application. It masks an email address; six or more digits even when spaces, hyphens, dashes, dots
// or brackets sit between them ("4111 1111 1111 1111", "(555) 123-4567", "123-45-6789"); and a run of
// 8+ letters and digits that is mostly digits (account numbers, order ids). A range label such as
// "(1-1000)" has too few digits and survives; a written-out date has enough and is masked.
const PII_EMAIL = /[\\w.+-]+@[\\w-]+\\.[\\w.-]+/g;
const PII_DIGIT_RUN = /\\d(?:[\\s\\-\\u2010-\\u2015\\u2212().]*\\d){5,}/g;
const PII_ID_TOKEN = /[A-Za-z0-9]{8,}/g;

function maskPii(text, options) {
  if (typeof text !== 'string') return text;
  const keepEmails = Boolean(options && options.keepEmails);
  const masked = keepEmails ? text : text.replace(PII_EMAIL, '[REDACTED]');
  return masked.replace(PII_DIGIT_RUN, '[REDACTED]').replace(PII_ID_TOKEN, function (token) {
    return token.replace(/[^0-9]/g, '').length > token.length / 2 ? '[REDACTED]' : token;
  });
}

function hasPii(text, options) {
  return typeof text === 'string' && maskPii(text, options) !== text;
}`;
