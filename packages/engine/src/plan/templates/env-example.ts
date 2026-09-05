// .env.example template for the generated project. create-if-absent.
const PROVIDER_ENV_STANZA: Record<string, string> = {
  'azure-devops': `# --- Azure DevOps (Work Items / Test Plans) ---
# Org/project come from your ADO URL: https://dev.azure.com/<ORG>/<PROJECT>
# PAT: dev.azure.com -> User settings -> Personal access tokens -> New Token
#      (needs "Work Items (Read)" + "Test Management (Read & Write)" scopes).
# AZURE_DEVOPS_ORG=
# AZURE_DEVOPS_PROJECT=
# AZURE_DEVOPS_PAT=
# AZURE_DEVOPS_RUN_ID=
# AZURE_DEVOPS_TEST_POINT_ID=
# AZURE_DEVOPS_PLAN_ID=
`,
  testrail: `# --- TestRail ---
# API key: TestRail -> My Settings -> API Keys -> Add Key.
# TESTRAIL_HOST=
# TESTRAIL_USERNAME=
# TESTRAIL_API_KEY=
# TESTRAIL_RUN_ID=
# TESTRAIL_PROJECT_ID=
# TESTRAIL_SECTION_ID=
# TESTRAIL_SUITE_ID=
`,
  jira: `# --- Jira (task tracker) ---
# API token: id.atlassian.com/manage-profile/security/api-tokens -> Create API token.
# JIRA_HOST=
# JIRA_EMAIL=
# JIRA_API_TOKEN=
# JIRA_PROJECT_KEY=
`,
  xray: `# --- Jira Xray ---
# Cloud: Jira Settings -> Apps -> Xray -> API Keys -> Create API Key.
# Server/DC fallback reuses JIRA_HOST + JIRA_API_TOKEN above as a PAT (fetch only, no publish).
# XRAY_CLIENT_ID=
# XRAY_CLIENT_SECRET=
# XRAY_TEST_EXECUTION_KEY=
`,
  zephyr: `# --- Zephyr Scale ---
# API token: Jira Settings -> Apps -> Zephyr Scale -> API Access Tokens.
# ZEPHYR_API_TOKEN=
# ZEPHYR_BASE_URL=
# ZEPHYR_PROJECT_KEY=
# ZEPHYR_TEST_CYCLE_KEY=
`,
};

export function renderEnvExample(
  baseUrl: string,
  taskTracker?: string,
  tmsProviders?: readonly string[],
): string {
  const configuredProviders = Array.from(
    new Set([
      ...(taskTracker && taskTracker !== 'none' ? [taskTracker] : []),
      ...(tmsProviders ?? []),
    ]),
  );

  const tmsSection =
    configuredProviders.length > 0
      ? `\n# ==============================================================================\n# TMS / MCP Bridge Integration Secrets — only needed to use the mcp__tms__* tools\n# in .mcp/tms-bridge/. Uncomment and fill in only what you actually use.\n# ==============================================================================\n\n${configuredProviders
          .map((p) => PROVIDER_ENV_STANZA[p.toLowerCase()])
          .filter(Boolean)
          .join('\n')}`
      : '';

  return `# The base URL of the application under test
E2E_BASE_URL=${baseUrl}

# (Optional) Authentication credentials
# E2E_USERNAME=
# E2E_PASSWORD=

# (Optional) TOTP secret for MFA/SSO login flows in auth.setup.ts
# TOTP_SECRET=

# (Optional) Pre-issued API token — CI fast-path that skips interactive login in auth.setup.ts
# E2E_API_TOKEN=
${tmsSection}`;
}
