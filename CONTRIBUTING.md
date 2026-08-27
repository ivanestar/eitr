# Contributing to EITR

Thank you for your interest in contributing to EITR!

EITR is designed with uncompromising SDET rigor, polyglot parity across 5 languages (TypeScript, JavaScript, Python, C#, Java), and zero lock-in for users.

- **Main Documentation:** [README.md](README.md)
- **Contributor License Agreement:** [CLA.md](CLA.md)
- **Public License:** [FSL-1.1-Apache-2.0](LICENSE)
- **Enterprise Licensing:** [COMMERCIAL.md](COMMERCIAL.md)
- **Architecture Guide:** [docs/architecture.md](docs/architecture.md)
- **Issue Tracker:** [GitHub Issues](https://github.com/ivanestar/eitr/issues)

---

## Contributor License Agreement (CLA)

Before submitting any Pull Request, all contributors must agree to the **[Individual Contributor License Agreement (CLA)](CLA.md)**.

### How It Works:

- When you open a Pull Request, the automated **CLA Assistant** GitHub Action will check if you have signed the CLA.
- You can accept it directly in your Pull Request by posting a comment: `I have read the CLA Document and I hereby sign the CLA` or by following the bot's prompt.
- By submitting code to this repository, you agree to assign full intellectual property, commercial, and licensing rights in your Contribution to the Project Owner (**Ivan Nestaruk**), while retaining public authorship attribution in the git history.
- **Troubleshooting:** If the check fails to update, post a comment containing `recheck` in your Pull Request.

---

## Contribution Guidelines

1. **Zero-Emoji Policy:** We enforce a strict zero-emoji policy across code, commit messages, CLI logs, templates, and markdown documentation.
2. **5-Language Parity:** If you introduce a new CPOM primitive, synthetic data helper, or generator feature, it must be implemented across all supported languages (TypeScript, JavaScript, Python, C#, Java) and runners (Playwright, Cypress).
3. **Targeted Tests:** Every feature or bug fix must include isolated unit/eval tests under `packages/*/test/`.
4. **Zero Lock-in:** Generator templates must never inject `@eitr/engine` as a runtime dependency into generated user projects.
5. **Code Style & Type Safety:** Run `npm run format:check` and `npm run typecheck` before submitting your PR.

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
