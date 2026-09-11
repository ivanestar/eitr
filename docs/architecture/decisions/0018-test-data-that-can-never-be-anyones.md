# 0018: Test data keeps only the numbers that can never be anyone's

## Status

Accepted

## Context

Every generated script that stores text read from the application masks personal data by one rule:
an email address, six or more digits with or without separators, and a mostly-digit token. The
same rule ran over the sample values of the test conditions, the values a test will type. There it
does damage: a phone field's valid partition kept no phone number to type, a card field no card
number, a timestamp or amount field of six digits or more no value at all, and a field probe of
`1000001` was recorded as `[REDACTED]`. The inventory masked the limits the markup declares, so
`max="1000000"` could no longer be checked against a boundary.

Sample values are written by the analysis, not read off the page. The backstop exists because the
analysis can still copy a real value it saw - a pre-filled phone number, an account number in an
admin list - and the rule has to catch that without trusting the model's word that a value was
made up.

## Decision

**A sample value is kept only when it can never be anyone's; everything else is masked as before.**

- The masking rule gains `keepTestData`: it leaves telephone numbers reserved for fiction (NANPA's
  555-0100 to 555-0199 in any area code; Ofcom's 07700 900xxx, 01632 960xxx and 020 7946 0xxx) and
  the card numbers payment providers publish for testing, and the variants a negative case makes of
  one (digits added, a card cut short or given a wrong check digit).
- A plain number in a parameter of kind `number`, or a date in one of kind `date`, is kept when the
  feature analysis says the field holds a quantity, an amount, a date, a setting, a filter or a
  choice. The same number in a field that holds an identifier or a credential is masked.
- A number typed into a number or range field during a probe is kept, as is the browser's own
  message for such a field, which only ever names its limits.
- A number or date in `min`, `max`, `step`, `minlength` or `maxlength` is recorded as the markup
  writes it.
- Gate 2 refuses a sample the masking hid and names the values to use instead.

## Alternatives Considered

- **Let the analysis mark a sample as synthetic.** One flag, no lists. Rejected: the backstop exists
  for the case where the model is wrong, and a flag the model sets cannot catch the model's mistake.
- **Stop masking sample values.** The simplest fix. Rejected: an admin crawl shows other people's
  phone numbers and addresses, and a copied one would be stored in an artifact that is committed.
- **Keep any plain number in a number field.** Covers amounts and timestamps without the analysis.
  Rejected: an account or customer number field is often a number field, and it is exactly the value
  worth masking; the field's role is what tells the two apart.

## Consequences

- A test that needs a phone or card number uses a reserved one, and the skill says which. A real-
  looking number in free text is still masked, and Gate 2 sends it back.
- Keeping a number depends on the field's role in the analysis being right. A field recorded as a
  quantity when it holds an identifier lets its long numbers through; Gate 1 checks the role against
  the control only for free text.
- The reserved ranges are a fixed list. A country whose fictional numbers are not on it has its test
  phone numbers masked until the list grows.
