// .env.example template for the generated project. create-if-absent.
export function renderEnvExample(baseUrl: string): string {
  return `# The base URL of the application under test
E2E_BASE_URL=${baseUrl}

# (Optional) Authentication credentials
# E2E_USERNAME=admin
# E2E_PASSWORD=password123
`;
}
