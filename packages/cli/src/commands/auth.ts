import { parseArgs } from 'node:util';
import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

const AUTH_USAGE = `Usage: eitr auth [options]

Capture browser session credentials and save them to a storage state file
(auth.json) for reuse across Playwright tests.

Two modes are supported:

  headed (default)
    Launches an interactive Playwright browser window. Navigate to your
    application and log in manually (supports SSO, OAuth, 2FA/MFA, SAML).
    The session is serialized to the output file automatically on completion.

  token
    Non-interactive CI mode. Writes a minimal storageState stub from an API
    token or Bearer token (set via environment variable E2E_API_TOKEN).
    Use playwright.config.ts extraHTTPHeaders to inject the token at runtime.

Options:
  --url <url>           Login page URL (optional, auto-detected from playwright.config.ts / .env if omitted)
  --output <file>       Path to write the storage state JSON (default: .auth/user.json)
  --mode <headed|token> Execution mode (default: headed)
  --token <string>      Bearer token value (overrides E2E_API_TOKEN env var)
  --token-header <name> HTTP header name for the token (default: Authorization)
  --timeout <ms>        Browser session timeout in milliseconds (default: 300000 = 5 min)
  --cwd <dir>           Working directory (default: current working directory)
  -h, --help            Show this help

Examples:
  eitr auth
  eitr auth --url https://app.example.com/login
  eitr auth --url https://app.example.com/login --output auth/admin.json
  eitr auth --mode token --token-header X-API-Key
`;

export async function resolveTargetUrl(
  cwd: string,
  passedUrl?: string,
): Promise<{ url: string; source: string } | undefined> {
  if (passedUrl) {
    try {
      const parsed = new URL(passedUrl.trim());
      if (['http:', 'https:'].includes(parsed.protocol)) {
        return { url: parsed.href, source: 'CLI argument (--url)' };
      }
    } catch {}
    return undefined;
  }

  const envUrl = process.env['E2E_BASE_URL'] ?? process.env['BASE_URL'];
  if (envUrl) {
    try {
      const parsed = new URL(envUrl.trim());
      if (['http:', 'https:'].includes(parsed.protocol)) {
        return { url: parsed.href, source: 'environment variable' };
      }
    } catch {}
  }

  // 1. Check .scaffold/init.json
  try {
    const initPath = path.join(cwd, '.scaffold', 'init.json');
    const content = await fs.readFile(initPath, 'utf8');
    const data = JSON.parse(content);
    if (data && typeof data === 'object') {
      const candidate =
        (data as Record<string, unknown>).startUrl ?? (data as Record<string, unknown>).baseUrl;
      if (candidate && typeof candidate === 'string') {
        const parsed = new URL(candidate.trim());
        if (['http:', 'https:'].includes(parsed.protocol)) {
          return { url: parsed.href, source: '.scaffold/init.json' };
        }
      }
    }
  } catch {}

  // 2. Check playwright.config.ts / playwright.config.js
  for (const cfgName of ['playwright.config.ts', 'playwright.config.js']) {
    try {
      const cfgPath = path.join(cwd, cfgName);
      const content = await fs.readFile(cfgPath, 'utf8');
      const match = content.match(
        /baseURL:\s*(?:process\.env\.[A-Za-z0-9_]+\s*\?\?\s*)?['"`](https?:\/\/[^'"`]+)['"`]/,
      );
      if (match && match[1]) {
        return { url: match[1].trim(), source: cfgName };
      }
    } catch {}
  }

  // 3. Check .env / .env.example
  for (const envName of ['.env', '.env.example']) {
    try {
      const envPath = path.join(cwd, envName);
      const content = await fs.readFile(envPath, 'utf8');
      const match = content.match(
        /^\s*(?:E2E_BASE_URL|BASE_URL)\s*=\s*['"]?(https?:\/\/[^\s'"#]+)['"]?/m,
      );
      if (match && match[1]) {
        return { url: match[1].trim(), source: envName };
      }
    } catch {}
  }

  return undefined;
}

export async function runAuth(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(AUTH_USAGE);
    return 0;
  }

  const { values } = parseArgs({
    args: argv,
    options: {
      url: { type: 'string' },
      output: { type: 'string' },
      mode: { type: 'string' },
      token: { type: 'string' },
      'token-header': { type: 'string' },
      timeout: { type: 'string' },
      cwd: { type: 'string' },
    },
    strict: false,
  });

  const cwdArg = (values['cwd'] as string | undefined) ?? process.cwd();
  const cwd = path.resolve(cwdArg);

  const mode = (values['mode'] as string | undefined) ?? 'headed';
  const outputArg = (values['output'] as string | undefined) ?? path.join('.auth', 'user.json');
  const outputPath = path.resolve(cwd, outputArg);

  if (mode !== 'headed' && mode !== 'token') {
    process.stderr.write(`eitr auth: unknown mode "${mode}". Must be "headed" or "token".\n`);
    return 1;
  }

  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  if (mode === 'token') {
    return runTokenMode(values, outputPath);
  }

  return runHeadedMode(values, outputPath, cwd);
}

async function runHeadedMode(
  values: Record<string, string | boolean | string[] | undefined>,
  outputPath: string,
  cwd: string,
): Promise<number> {
  const passedUrl = values['url'] as string | undefined;
  const resolved = await resolveTargetUrl(cwd, passedUrl);

  if (!resolved) {
    process.stderr.write(
      'eitr auth: could not resolve target URL for headed mode.\n' +
        'Specify --url <url>, set E2E_BASE_URL in .env, or run from a project directory with playwright.config.ts.\n' +
        'Example: eitr auth --url https://app.example.com/login\n',
    );
    return 1;
  }

  const loginUrl = resolved.url;
  const timeoutMs = parseInt((values['timeout'] as string | undefined) ?? '300000', 10);

  process.stdout.write(
    [
      'Starting headed browser session for authentication capture.',
      `Auto-detected target URL from ${resolved.source}: ${loginUrl}`,
      `Output:    ${outputPath}`,
      `Timeout:   ${timeoutMs / 1000}s`,
      '',
      'Instructions:',
      '  1. Complete the login flow in the browser window that opens.',
      '  2. For 2FA/MFA: complete the verification step manually.',
      '  3. Wait until you see your application dashboard or authenticated state.',
      '  4. Close the browser window to save the session.',
      '',
    ].join('\n'),
  );

  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';

  try {
    execSync(`npx playwright open --save-storage="${outputPath}" "${loginUrl}"`, {
      stdio: 'inherit',
      timeout: timeoutMs,
      shell,
    });
    process.stdout.write(`\nSession saved to: ${outputPath}\n`);
    process.stdout.write('Use this file with Playwright:\n');
    process.stdout.write(
      `  playwright.config.ts > use > storageState: '${outputPath.replace(/\\/g, '/')}'\n`,
    );
    return 0;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`eitr auth: headed session failed.\n${message}\n`);
    return 1;
  }
}

async function runTokenMode(
  values: Record<string, string | boolean | string[] | undefined>,
  outputPath: string,
): Promise<number> {
  const tokenValue = (values['token'] as string | undefined) ?? process.env['E2E_API_TOKEN'] ?? '';
  const tokenHeader = (values['token-header'] as string | undefined) ?? 'Authorization';

  if (!tokenValue) {
    process.stderr.write(
      'eitr auth: no token provided.\n' +
        'Set E2E_API_TOKEN environment variable or pass --token <value>.\n',
    );
    return 1;
  }

  process.stdout.write(
    [
      'Writing token-based storage state (CI mode).',
      `Header: ${tokenHeader}: Bearer ***`,
      `Output: ${outputPath}`,
      '',
      'Note: Add extraHTTPHeaders to playwright.config.ts to inject the token:',
      `  use: { extraHTTPHeaders: { '${tokenHeader}': \`Bearer \${process.env.E2E_API_TOKEN}\` } }`,
      '',
    ].join('\n'),
  );

  const storageState = JSON.stringify({ cookies: [], origins: [] }, null, 2);
  await fs.writeFile(outputPath, storageState, 'utf8');

  process.stdout.write(`Storage state stub saved to: ${outputPath}\n`);
  return 0;
}
