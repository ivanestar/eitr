// Template for generating scripts/lint_cpom.py in scaffolded Python projects. create-if-absent.

export function renderCpomLinterPython(): string {
  return `#!/usr/bin/env python3
"""
CPOM Contract & Anti-Fake-Green Linter (Python)
Zero-dependency static rule auditor for Page Objects, Components, and Test Specs.
Parses every file with the standard-library "ast" module (a real syntax tree, not a text/regex
scan) - no pip installs, no third-party packages.

Rules enforced (parity with scripts/lint-cpom.js for TypeScript/Cypress):
  1. Zero Arbitrary Delays - no time.sleep() / page.wait_for_timeout().
  2. Mandatory "_now" suffix for non-retrying boolean/string state getters (is_*/has_*/get_*) in
     components/.
  3. Zero assertions inside Component & Page Object classes (components/) - no "assert"
     statements and no pytest.fail(...) calls.
  4. N/A for Python. Generated Python templates use playwright.sync_api exclusively (a fully
     synchronous API) - there is no await/Promise concept for a state read to be "unawaited"
     against, so the JS/TS "Unawaited Promise Guard" rule has no Python analog. This is a
     deliberate no-op, not an oversight.
  5. Fixture Dependency Injection - rejects raw PageObject(page)/Component(page) construction in
     test files (tests/), mirroring the TS/Java/C# rule. conftest.py and any file with "fixture"
     in its name are exempt (that is where such construction is meant to happen).
  6. Anti-Over-Mocking Guard - rejects unannotated page.route()/context.route()/route_from_har()
     calls in test files. A "# @allow-mock: <reason>" comment on the flagged line, the line
     before, or the line after suppresses it (legitimate 3rd-party isolation like analytics or
     Sentry), mirroring the TS/Java/C# rule.
"""
import ast
import os
import re
import sys

IGNORED_DIR_NAMES = {
    ".git",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "test-results",
    "playwright-report",
    ".auth",
    ".tms-cache",
    "node_modules",
    "build",
    "dist",
}

TARGET_DIRS = ("components", "tests", "fixtures", "shared")

DELAY_CALL_NAMES = {"sleep", "wait_for_timeout"}

# Playwright's own get_*-shaped API calls - never themselves a point-in-time state read needing a
# _now suffix (mirrors the same exemption set in cpom-linter.ts/cpom-linter-java.ts, kept in sync
# by hand).
STRUCTURAL_GETTER_EXEMPTIONS = {
    "get_attribute",
    "get_by_role",
    "get_by_test_id",
    "get_by_label",
    "get_by_text",
    "get_by_alt_text",
    "get_by_placeholder",
    "get_by_title",
    "get_by_display_value",
}


CPOM_BASE_CLASS_NAMES = {"BasePage", "Component"}

MOCK_CALL_NAMES = {"route", "route_from_har"}
MOCK_RECEIVER_NAMES = {"page", "context", "browser_context"}

ALLOW_MOCK_PATTERN = re.compile(r"#\\s*@allow-mock:\\s*\\S")


class CpomVisitor(ast.NodeVisitor):
    """Walks one file's AST, collecting CPOM contract violations."""

    def __init__(self, is_component: bool, is_test: bool, is_fixture: bool, lines: list[str]) -> None:
        self.is_component = is_component
        self.is_test = is_test
        self.is_fixture = is_fixture
        self.lines = lines
        self.class_depth = 0
        self.violations: list[tuple[int, str, str]] = []

    def _has_allow_mock_suppression(self, lineno: int) -> bool:
        for candidate in (lineno, lineno - 1, lineno + 1):
            if 1 <= candidate <= len(self.lines) and ALLOW_MOCK_PATTERN.search(self.lines[candidate - 1]):
                return True
        return False

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self.class_depth += 1
        self.generic_visit(node)
        self.class_depth -= 1

    def _check_snapshot_suffix(self, name: str, lineno: int) -> None:
        if not self.is_component or self.class_depth == 0:
            return
        if name == "is_attached" or name in STRUCTURAL_GETTER_EXEMPTIONS:
            return
        if (
            (name.startswith("is_") or name.startswith("has_") or name.startswith("get_"))
            and not name.endswith("_now")
        ):
            self.violations.append((
                lineno,
                "Rule 2: Mandatory _now Suffix",
                'State reader "' + name + '" in component must end with "_now" (e.g. '
                + name + '_now) to signify a point-in-time read.',
            ))

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._check_snapshot_suffix(node.name, node.lineno)
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._check_snapshot_suffix(node.name, node.lineno)
        self.generic_visit(node)

    def visit_Assert(self, node: ast.Assert) -> None:
        if self.is_component and self.class_depth > 0:
            self.violations.append((
                node.lineno,
                "Rule 3: Zero Assertions in Components",
                "assert statement found in component/page-object class. Components must only "
                "provide locators and actions; assertions belong in test files.",
            ))
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        func = node.func
        attr_name = None
        receiver_name = None
        if isinstance(func, ast.Attribute):
            attr_name = func.attr
            if isinstance(func.value, ast.Name):
                receiver_name = func.value.id
        elif isinstance(func, ast.Name):
            attr_name = func.id

        if attr_name in DELAY_CALL_NAMES:
            self.violations.append((
                node.lineno,
                "Rule 1: Zero Arbitrary Delays",
                'Arbitrary delay detected ("' + attr_name + '(...)"). Use web-first '
                "auto-retrying assertions or Playwright state waiters instead.",
            ))

        if self.is_component and self.class_depth > 0 and attr_name == "fail":
            self.violations.append((
                node.lineno,
                "Rule 3: Zero Assertions in Components",
                "pytest.fail(...) found in component/page-object class. Assertions belong in "
                "test files only.",
            ))

        if (
            self.is_test
            and not self.is_fixture
            and attr_name
            and (attr_name.endswith("Page") or attr_name.endswith("Component"))
            and attr_name not in CPOM_BASE_CLASS_NAMES
        ):
            self.violations.append((
                node.lineno,
                "Rule 5: Fixture Dependency Injection",
                'Direct instantiation of "' + attr_name + '" in a test file is prohibited. '
                "Inject it as a pytest fixture parameter instead (see conftest.py).",
            ))

        if (
            self.is_test
            and not self.is_fixture
            and attr_name in MOCK_CALL_NAMES
            and receiver_name in MOCK_RECEIVER_NAMES
            and not self._has_allow_mock_suppression(node.lineno)
        ):
            self.violations.append((
                node.lineno,
                "Rule 6: Inappropriate Mocking Guard",
                'Network route interception/mocking detected ("' + attr_name + '(...)"). This '
                "can mask a real backend defect behind a fake-green test. If this is legitimate "
                '3rd-party isolation (e.g. analytics, Sentry), annotate with '
                '"# @allow-mock: <reason>".',
            ))

        self.generic_visit(node)


def walk_files(cwd: str) -> list[str]:
    found: list[str] = []
    for target in TARGET_DIRS:
        base = os.path.join(cwd, target)
        if not os.path.isdir(base):
            continue
        for root, dirs, filenames in os.walk(base):
            dirs[:] = [d for d in dirs if d not in IGNORED_DIR_NAMES]
            for filename in filenames:
                if filename.endswith(".py"):
                    found.append(os.path.join(root, filename))
    return found


def audit_file(cwd: str, path: str, violations_out: list[tuple[str, int, str, str]]) -> None:
    rel_path = os.path.relpath(path, cwd).replace(os.sep, "/")
    is_component = rel_path.startswith("components/")
    is_test = rel_path.startswith("tests/") and not rel_path.startswith("fixtures/")
    is_fixture = "conftest" in rel_path or "fixture" in rel_path.lower() or rel_path.startswith("fixtures/")

    try:
        with open(path, "r", encoding="utf-8") as handle:
            source = handle.read()
        tree = ast.parse(source, filename=rel_path)
    except (SyntaxError, OSError) as err:
        violations_out.append((rel_path, 0, "Rule 0: Parse Error", str(err)))
        return

    visitor = CpomVisitor(is_component, is_test, is_fixture, source.splitlines())
    visitor.visit(tree)
    for lineno, rule, message in visitor.violations:
        violations_out.append((rel_path, lineno, rule, message))


def main() -> None:
    cwd = os.getcwd()
    files = walk_files(cwd)

    if not files:
        sys.stdout.write("[INFO] No components or tests directory found to lint.\\n")
        sys.exit(0)

    violations: list[tuple[str, int, str, str]] = []
    for file_path in files:
        audit_file(cwd, file_path, violations)

    if not violations:
        sys.stdout.write(
            "[PASS] CPOM Contract & Anti-Fake-Green Audit Passed ("
            + str(len(files)) + " files checked).\\n"
        )
        sys.exit(0)

    sys.stderr.write("\\n[FAIL] CPOM Contract Violations Found (" + str(len(violations)) + " issues):\\n\\n")
    for rel_path, lineno, rule, message in violations:
        sys.stderr.write("  " + rel_path + ":" + str(lineno) + " [" + rule + "]\\n")
        sys.stderr.write("    Error: " + message + "\\n\\n")
    sys.exit(1)


if __name__ == "__main__":
    main()
`;
}
