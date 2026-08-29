import * as path from 'node:path';
import type { Question, QuestionId } from './schema.js';
import { getChoicesForLanguage } from './schema.js';

// Pure validators. Each returns the parsed/normalized value on success so callers never
// re-parse (single source of truth) and a human-readable message on failure. No IO.
export type ValidationResult<T = string> = { ok: true; value: T } | { ok: false; error: string };

const SCHEME_AUTHORITY = /^[a-z][a-z0-9+.-]*:\/\//i; // scheme://...
const SCHEME_OPAQUE = /^([a-z][a-z0-9+.-]*):(?!\/\/)(.*)$/i; // scheme: NOT followed by //
const HOST_PORT_TAIL = /^\d+(?:[/?#].*)?$/; // ":4173" / ":8080/path" — a port, not a scheme tail

// Accepts a scheme-less host or host:port (prepends https://); enforces http/https and a
// non-empty host. Rejects opaque non-web schemes like mailto:/javascript: — which `new URL`
// would otherwise coerce into a valid-looking https URL — while keeping localhost:4173 usable.
export function validateStartUrl(raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: 'A start-page URL is required.' };

  let candidate: string;
  if (SCHEME_AUTHORITY.test(trimmed)) {
    candidate = trimmed; // explicit scheme://... — the protocol check below enforces http/https
  } else {
    const opaque = SCHEME_OPAQUE.exec(trimmed);
    if (opaque && !HOST_PORT_TAIL.test(opaque[2])) {
      return { ok: false, error: `Only http and https URLs are supported (got "${opaque[1]}:").` };
    }
    candidate = `https://${trimmed}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: `"${raw}" is not a valid URL.` };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      error: `Only http and https URLs are supported (got "${url.protocol}//").`,
    };
  }
  if (url.hostname === '') return { ok: false, error: 'The URL must include a host name.' };
  return { ok: true, value: url.toString() };
}

// Must be a relative path that stays inside the project — the generated tree is written here with
// an overwrite (regenerate) policy, so an absolute or `..`-escaping path could clobber files
// outside the project.
export function validateOutputDir(raw: string): ValidationResult {
  const trimmed = raw.trim();
  const value = trimmed === '' ? '.' : trimmed;
  if (path.isAbsolute(value)) {
    return { ok: false, error: 'Output directory must be a relative path inside the project.' };
  }
  // Block Windows relative-drive paths like 'C:folder' (path.isAbsolute returns false for these,
  // but they resolve relative to the drive's current directory, enabling path traversal).
  if (/^[a-zA-Z]:/.test(value)) {
    return { ok: false, error: 'Output directory must be a relative path inside the project.' };
  }
  if (value.split(/[/\\]/).includes('..')) {
    return { ok: false, error: 'Output directory must not escape the project (remove "..").' };
  }
  return { ok: true, value };
}

// Validates (and normalizes) a raw answer against its question. Selects check membership in the
// closed option set; text questions delegate to the field-specific validators above.
export function validateAnswer(
  question: Question,
  raw: string,
  answers?: Partial<Record<QuestionId, string>>,
): ValidationResult {
  if (question.kind === 'select') {
    if (question.id === 'automationTool' && answers?.language) {
      const allowed = getChoicesForLanguage(question.choices, answers.language);
      if (!allowed.some((c) => c.value === raw)) {
        if (question.choices.some((c) => c.value === raw)) {
          return {
            ok: false,
            error: `E2E automation tool "${raw}" is not supported for language "${answers.language}".`,
          };
        }
        return { ok: false, error: `"${raw}" is not one of the available choices.` };
      }
      return { ok: true, value: raw };
    }
    return question.choices.some((c) => c.value === raw)
      ? { ok: true, value: raw }
      : { ok: false, error: `"${raw}" is not one of the available choices.` };
  }
  if (question.kind === 'multiselect') {
    const rawArray = Array.isArray(raw)
      ? (raw as string[])
      : typeof raw === 'string' && raw.trim() !== ''
        ? raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const validChoices = question.choices.map((c) => c.value);
    const invalid = rawArray.find((val) => !validChoices.includes(val));
    if (invalid) {
      return { ok: false, error: `"${invalid}" is not one of the available choices.` };
    }
    if (question.id === 'tmsProviders') {
      const requiresJira = rawArray.filter((v) => v === 'xray' || v === 'zephyr');
      if (requiresJira.length > 0 && answers?.taskTracker !== 'jira') {
        return {
          ok: false,
          error: `${requiresJira.join(', ')} require${requiresJira.length === 1 ? 's' : ''} Jira as the Task Tracker (their Test/Test Execution issues live in Jira) — select Jira as the task tracker first.`,
        };
      }
    }
    return { ok: true, value: rawArray as any };
  }
  switch (question.id) {
    case 'startUrl':
      return validateStartUrl(raw);
    case 'outputDir':
      return validateOutputDir(raw);
    default:
      return { ok: true, value: raw.trim() };
  }
}
