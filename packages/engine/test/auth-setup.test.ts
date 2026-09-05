import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import * as esbuild from 'esbuild';
import { renderAuthSetupTs } from '../src/plan/templates/auth-setup.js';

// Extracts the self-contained base32Decode()/generateTotp() pair emitted into the generated
// fixtures/auth.setup.ts, strips TS types via esbuild, and evaluates it in an isolated VM context
// so the RFC 6238 test vectors below exercise the exact code shipped to users, not a
// re-implementation in this test file.
function loadGeneratedTotp(): (
  secret: string,
  opts?: { digits?: number; period?: number; timestamp?: number },
) => string {
  const source = renderAuthSetupTs({});
  const start = source.indexOf('function base32Decode');
  const end = source.indexOf('// ---', source.indexOf('function generateTotp'));
  const tsBody = source.slice(start, end);
  const jsBody = esbuild.transformSync(tsBody, { loader: 'ts' }).code;

  const context: Record<string, unknown> = {
    require: (name: string) => (name === 'node:crypto' ? require('node:crypto') : require(name)),
    Buffer,
  };
  vm.createContext(context);
  vm.runInContext(
    `const { createHmac } = require('node:crypto');\n${jsBody}\nthis.generateTotp = generateTotp;`,
    context,
  );
  return context.generateTotp as (
    secret: string,
    opts?: { digits?: number; period?: number; timestamp?: number },
  ) => string;
}

describe('RFC 6238 TOTP generator embedded in fixtures/auth.setup.ts', () => {
  const generateTotp = loadGeneratedTotp();
  // Base32 encoding of the RFC 6238 Appendix B ASCII SHA1 seed "12345678901234567890".
  const RFC_6238_SHA1_SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
  ])('matches RFC 6238 Appendix B SHA1 vector at T=%i seconds', (unixSeconds, expected) => {
    const code = generateTotp(RFC_6238_SHA1_SECRET_B32, {
      digits: 8,
      timestamp: unixSeconds * 1000,
    });
    expect(code).toBe(expected);
  });

  it('defaults to a 6-digit code (truncation of the 8-digit vector)', () => {
    const code = generateTotp(RFC_6238_SHA1_SECRET_B32, { timestamp: 59 * 1000 });
    expect(code).toBe('287082');
    expect(code).toHaveLength(6);
  });

  it('emits real TOTP generation code, not a comment-only stub', () => {
    const source = renderAuthSetupTs({});
    expect(source).toContain("import { createHmac } from 'node:crypto'");
    expect(source).toContain('function generateTotp');
    expect(source).toContain('generateTotp(process.env.TOTP_SECRET)');
    expect(source).not.toContain('// Generate TOTP token (RFC 6238) or fill from authenticator');
  });
});

describe('storageStatePath threading (PlanOptions -> renderAuthSetupTs)', () => {
  it('bakes a non-default storageStatePath into the generated auth file path', () => {
    const source = renderAuthSetupTs({ storageStatePath: 'custom/.auth/session.json' });
    expect(source).toContain("path.resolve('custom/.auth/session.json')");
  });

  it('falls back to .auth/user.json when storageStatePath is omitted', () => {
    const source = renderAuthSetupTs({});
    expect(source).toContain("path.resolve('.auth/user.json')");
  });
});
