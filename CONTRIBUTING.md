# Contributing to EITR

Thank you for your interest in contributing to EITR!

- **Main Documentation:** [README.md](README.md)
- **Public License:** [Apache-2.0](LICENSE)
- **Architecture Guide:** [docs/architecture/](docs/architecture/README.md)
- **Issue Tracker:** [GitHub Issues](https://github.com/ivanestar/eitr/issues)

---

## Contribution Guidelines

1. **Targeted Tests:** Every feature or bug fix must include isolated unit/eval tests under `packages/*/test/`.
2. **Zero Lock-in:** Generator templates must never inject `@eitr/engine` as a runtime dependency into generated user projects.
3. **Code Style & Type Safety:** Run `npm run format:check` and `npm run typecheck` before submitting your PR.

---

## Development Setup

### Prerequisites

- **Node.js:** `>= 18.0.0`
- **npm:** `>= 9.0.0`

### Step-by-Step Setup

```bash
# 1. Clone the repository
git clone https://github.com/ivanestar/eitr.git
cd eitr

# 2. Install dependencies
npm install

# 3. Build all packages (Engine, CLI, Evals)
npm run build

# 4. Run typecheck & formatting checks
npm run typecheck
npm run format:check

# 5. Run isolated targeted tests (e.g. boundary test)
npx vitest run packages/engine/test/boundary.test.ts

# 6. Test CLI locally
npm run new
```
