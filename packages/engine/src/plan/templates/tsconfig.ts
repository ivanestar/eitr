// tsconfig.json for the generated project. create-if-absent. Mirrors the engine's proven
// assets/tsconfig.json: moduleResolution 'Bundler' is the one setting that both resolves the base
// components' extensionless relative imports at tsc time AND honours @playwright/test's exports map
// (node16/nodenext would reject extensionless imports; classic 'node' breaks the exports map).
// Hand-written to match the project's Prettier style (short arrays inline) so it is clean on emit.
export function renderTsconfig(): string {
  return `{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "paths": {
      "@components": ["./components/index.ts"],
      "@components/*": ["./components/*"],
      "@pages/*": ["./components/pages/*"],
      "@shared/*": ["./shared/*"],
      "@utils/*": ["./shared/utils/*"],
      "@fixtures": ["./tests/fixtures.ts"]
    }
  },
  "include": ["components", "tests", "shared", "playwright.config.ts"]
}
`;
}
