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

// Numbers that can never be anyone's, for test data that needs a phone or a card: the telephone
// numbers reserved for fiction (NANPA's 555-0100 to 555-0199 in any area code; Ofcom's 07700 900xxx,
// 01632 960xxx and 020 7946 0xxx) and the card numbers payment providers publish for testing. With
// { keepTestData: true } these stay, and so does a variant a negative case makes of one: digits added
// to either, or a card cut short or given a wrong check digit.
const PII_TEST_PHONES = [/^1?\\d{3}55501\\d{2}/, /^(?:44|0)7700900\\d{3}/, /^(?:44|0)1632960\\d{3}/, /^(?:44|0)2079460\\d{3}/];
const PII_TEST_CARDS = [
  '4242424242424242', '4000056655665556', '4111111111111111', '4012888888881881', '5555555555554444',
  '2223003122003222', '5200828282828210', '5105105105105100', '378282246310005', '371449635398431',
  '6011111111111117', '6011000990139424', '6011981111111113', '3056930009020004', '36227206271667',
  '6555900000604105', '3566002020360505', '6200000000000005', '6200000000000047', '6205500000000000004',
];

function isTestNumber(digits) {
  for (const phone of PII_TEST_PHONES) {
    if (phone.test(digits)) return true;
  }
  return PII_TEST_CARDS.some(function (card) {
    if (digits.length >= 6 && card.indexOf(digits) === 0) return true;
    if (digits.indexOf(card) === 0) return true;
    return digits.length === card.length && digits.slice(0, -1) === card.slice(0, -1);
  });
}

function maskPii(text, options) {
  if (typeof text !== 'string') return text;
  const keepEmails = Boolean(options && options.keepEmails);
  const keepTestData = Boolean(options && options.keepTestData);
  const masked = keepEmails ? text : text.replace(PII_EMAIL, '[REDACTED]');
  return masked
    .replace(PII_DIGIT_RUN, function (run) {
      return keepTestData && isTestNumber(run.replace(/[^0-9]/g, '')) ? run : '[REDACTED]';
    })
    .replace(PII_ID_TOKEN, function (token) {
      const digits = token.replace(/[^0-9]/g, '');
      if (digits.length <= token.length / 2) return token;
      return keepTestData && digits.length === token.length && isTestNumber(digits) ? token : '[REDACTED]';
    });
}

function hasPii(text, options) {
  return typeof text === 'string' && maskPii(text, options) !== text;
}`;
