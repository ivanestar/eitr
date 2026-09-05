// fixtures/auth.setup.ts template for the generated project. create-if-absent.

export interface AuthSetupOpts {
  baseUrl?: string;
  storageStatePath?: string;
}

export function renderAuthSetupTs(opts: AuthSetupOpts = {}): string {
  const storagePath = (opts.storageStatePath ?? '.auth/user.json').replace(/\\/g, '/');
  const appOrigin = opts.baseUrl ?? 'http://localhost:3000';

  return `import { test as setup } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createHmac } from 'node:crypto';

const authFile = path.resolve(${JSON.stringify(storagePath)});

// ---------------------------------------------------------------------------
// RFC 6238 TOTP (Time-Based One-Time Password) generator — self-contained,
// built on Node's built-in crypto module (no external dependencies). Decodes
// a Base32 shared secret and derives a 6-digit HMAC-SHA1 code (RFC 4226 HOTP)
// bucketed into the current 30-second time step, per RFC 6238 section 4.
// ---------------------------------------------------------------------------
function base32Decode(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of cleaned) {
    const value = alphabet.indexOf(char);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(
  secretBase32: string,
  options: { digits?: number; period?: number; timestamp?: number } = {},
): string {
  const digits = options.digits ?? 6;
  const period = options.period ?? 30;
  const timestamp = options.timestamp ?? Date.now();

  const counter = Math.floor(timestamp / 1000 / period);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const key = base32Decode(secretBase32);
  const hmac = createHmac('sha1', key).update(counterBuffer).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, '0');
}

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

  // 2. TOTP 2FA handling: if process.env.TOTP_SECRET is provided, generate a real
  // RFC 6238 code and fill it into the MFA prompt.
  if (process.env.TOTP_SECRET) {
    const totpCode = generateTotp(process.env.TOTP_SECRET);
    // await page.getByLabel('Authentication code').fill(totpCode);
    // await page.getByRole('button', { name: 'Verify' }).click();
    void totpCode;
  }

  // 3. Serialize session state: cookies, localStorage, sessionStorage
  await fs.promises.mkdir(path.dirname(authFile), { recursive: true });
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
          origin: ${JSON.stringify(appOrigin)},
          localStorage: [{ name: 'auth_token', value: token }],
        },
      ],
    }),
  );
});
`;
}

export function renderAuthSetup(opts: AuthSetupOpts = {}): string {
  return renderAuthSetupTs(opts);
}
