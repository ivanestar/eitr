// tests/auth.setup.ts template for the generated project. create-if-absent.

export interface AuthSetupOpts {
  baseUrl?: string;
  storageStatePath?: string;
}

export function renderAuthSetupTs(opts: AuthSetupOpts = {}): string {
  const storagePath = opts.storageStatePath ?? '.auth/user.json';
  const appOrigin = opts.baseUrl ?? 'http://localhost:3000';

  return `import { test as setup } from '@playwright/test';
import * as path from 'node:path';

const authFile = path.resolve('${storagePath}');

// ---------------------------------------------------------------------------
// MODE A: Interactive / TOTP 2FA Browser Session
// Supports standard forms, MFA with TOTP generator, and SSO (Okta, Keycloak).
// ---------------------------------------------------------------------------
setup('authenticate: browser session with MFA/TOTP support', async ({ page }) => {
  await page.goto('/');

  // 1. Fill credentials from environment variables (never hardcode secrets)
  // await page.getByLabel('Username').fill(process.env.E2E_USERNAME ?? '');
  // await page.getByLabel('Password').fill(process.env.E2E_PASSWORD ?? '');
  // await page.getByRole('button', { name: 'Login' }).click();

  // 2. TOTP 2FA handling: if process.env.TOTP_SECRET is provided, generate OTP
  if (process.env.TOTP_SECRET) {
    // Generate TOTP token (RFC 6238) or fill from authenticator
  }

  // 3. Serialize session state: cookies, localStorage, sessionStorage
  await page.context().storageState({ path: authFile });
});

// ---------------------------------------------------------------------------
// MODE B: API Fast-Path Token Injection (Headless CI / Service Accounts)
// ---------------------------------------------------------------------------
setup('authenticate: API fast-path token', async () => {
  const token = process.env.E2E_API_TOKEN;
  if (!token) return;

  const { promises: fs } = await import('node:fs');
  await fs.mkdir(path.dirname(authFile), { recursive: true });
  await fs.writeFile(
    authFile,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: '${appOrigin}',
          localStorage: [{ name: 'auth_token', value: token }],
        },
      ],
    }),
  );
});
`;
}

export function renderAuthSetup(): string {
  return renderAuthSetupTs({});
}
