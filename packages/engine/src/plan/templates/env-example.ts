// .env.example template for the generated project. create-if-absent.
export function renderEnvExample(baseUrl: string): string {
  return `# The base URL of the application under test
E2E_BASE_URL=${baseUrl}

# (Optional) Authentication credentials
# E2E_USERNAME=admin
# E2E_PASSWORD=password123

# (Optional) TOTP secret for MFA/SSO login flows in auth.setup.ts
# TOTP_SECRET=

# (Optional) Pre-issued API token — CI fast-path that skips interactive login in auth.setup.ts
# E2E_API_TOKEN=
`;
}
