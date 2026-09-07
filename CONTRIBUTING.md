# Contributing to EITR

Thank you for your interest in contributing to EITR!

- **Main Documentation:** [README.md](README.md)
- **Public License:** [Apache-2.0](LICENSE)
- **Architecture Guide:** [docs/architecture/](docs/architecture/README.md)
- **Issue Tracker:** [GitHub Issues](https://github.com/ivanestar/eitr/issues)

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
