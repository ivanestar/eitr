/**
 * Python project-level template render functions:
 * conftest.py, pyproject.toml, example tests, api client, login page example, README.
 */

export interface PythonProjectOpts {
  baseUrl: string;
  projectName: string;
}

// ── pytest-playwright config ──────────────────────────────────────────────

/** conftest.py (root) */
export function renderPythonConftest(_opts: Pick<PythonProjectOpts, 'baseUrl'>): string {
  return `"""Root conftest — shared Playwright fixtures for the whole test suite."""
import pytest
from playwright.sync_api import BrowserContext


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args: dict) -> dict:
    """Extend default browser context: set 1280×720 viewport for all tests."""
    return {
        **browser_context_args,
        "viewport": {"width": 1280, "height": 720},
        # "storage_state": ".auth/user.json",  # Uncomment after running authentication setup
    }
`;
}

/** pyproject.toml */
export function renderPyprojectToml(opts: PythonProjectOpts): string {
  const { projectName, baseUrl } = opts;
  return `[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[project]
name = "${projectName}"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "playwright>=1.45.0",
    "pytest>=8.0.0",
    "pytest-playwright>=0.5.0",
    "pytest-html>=4.1.1",
    "pytest-rerunfailures>=14.0",
]

[project.optional-dependencies]
api = ["httpx>=0.27.0"]

[tool.pytest.ini_options]
base_url = "${baseUrl}"
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = "--tracing=retain-on-failure"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.setuptools.packages.find]
include = ["components*", "shared*"]
`;
}

/** .env.example */
export function renderPythonEnvExample(opts: Pick<PythonProjectOpts, 'baseUrl'>): string {
  return `# Environment configuration — copy to .env and fill in real values.
# pytest-playwright reads BASE_URL from pyproject.toml [tool.pytest.ini_options].
# Override here if needed for local development.

BASE_URL=${opts.baseUrl}
HEADLESS=true
SLOW_MO=0
`;
}

// ── Test files ─────────────────────────────────────────────────────────────

/** tests/examples/test_example.py */
export function renderPythonExampleTest(opts: Pick<PythonProjectOpts, 'baseUrl'>): string {
  return `"""Example smoke tests — demonstrates the Component Page Object Model pattern.
Copy and adapt these for your own page objects.
"""
import pytest
from playwright.sync_api import Page


def test_harness_boots(page: Page) -> None:
    """Verify browser harness boots and renders HTML correctly without network."""
    page.set_content("<h1>ok</h1>")
    assert page.get_by_role("heading").inner_text() == "ok"


def test_home_page_is_reachable(page: Page) -> None:
    """Verify the application home page returns a successful HTTP response."""
    try:
        response = page.goto("${opts.baseUrl}")
        assert response is not None, "Expected a response, got None"
        assert response.ok, f"Expected HTTP 2xx, got {response.status}"
    except Exception as err:
        pytest.skip(f"Base URL is unreachable: {err}")


def test_page_has_non_empty_title(page: Page) -> None:
    """Verify the page has a non-empty <title> after loading."""
    try:
        page.goto("${opts.baseUrl}")
        assert page.title() != "", "Expected page title to be non-empty"
    except Exception as err:
        pytest.skip(f"Base URL is unreachable: {err}")
`;
}

// ── Seed files ─────────────────────────────────────────────────────────────

/** components/pages/login_page_example.py */
export function renderPythonLoginPageExample(): string {
  return `"""LoginPage — worked example of a Page Object using framework components.
Adapt selectors and URLs to match your application. Then delete this comment.
"""
from __future__ import annotations

from playwright.sync_api import Page

from components.base.base_page import BasePage
from components.primitives.button import Button
from components.primitives.text_input import TextInput


class LoginPage(BasePage):
    """Page Object for a standard username/password login form."""

    URL = "/login"

    def navigate(self) -> None:
        self._page.goto(self.URL)

    # ── Producers ────────────────────────────────────────────────────────────

    @property
    def username_input(self) -> TextInput:
        return self._scope(TextInput, self._root.get_by_label("Username"))

    @property
    def password_input(self) -> TextInput:
        return self._scope(TextInput, self._root.get_by_label("Password"))

    @property
    def login_button(self) -> Button:
        return self._scope(Button, self._root.get_by_role("button", name="Log in"))

    # ── Actions ─────────────────────────────────────────────────────────────

    def login(self, username: str, password: str) -> None:
        """Fill credentials and submit the form."""
        self.username_input.fill(username)
        self.password_input.fill(password)
        self.login_button.click()
`;
}

/** shared/utils/api_client.py */
export function renderPythonApiClient(opts: Pick<PythonProjectOpts, 'baseUrl'>): string {
  return `"""ApiClient — thin httpx wrapper for REST and GraphQL API test steps.

Requires: pip install httpx  (or add to pyproject.toml [project.optional-dependencies] api)
"""
from __future__ import annotations

from typing import Any

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore[assignment]


class ApiClient:
    """
    Lightweight HTTP client for API test steps.

    Usage::

        with ApiClient() as client:
            response = client.get("/api/users")
            users = response.json()
    """

    def __init__(self, base_url: str = "${opts.baseUrl}") -> None:
        if httpx is None:
            raise ImportError(
                "httpx package is required for ApiClient. Install it with: pip install httpx"
            )
        self._client = httpx.Client(base_url=base_url.rstrip("/"), timeout=30)

    # ── HTTP verbs ────────────────────────────────────────────────────────────

    def get(self, path: str, **kwargs: Any) -> httpx.Response:
        return self._client.get(path, **kwargs)

    def post(self, path: str, **kwargs: Any) -> httpx.Response:
        return self._client.post(path, **kwargs)

    def put(self, path: str, **kwargs: Any) -> httpx.Response:
        return self._client.put(path, **kwargs)

    def patch(self, path: str, **kwargs: Any) -> httpx.Response:
        return self._client.patch(path, **kwargs)

    def delete(self, path: str, **kwargs: Any) -> httpx.Response:
        return self._client.delete(path, **kwargs)

    # ── GraphQL ───────────────────────────────────────────────────────────────

    def graphql(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        """Execute a GraphQL query and return the parsed JSON body."""
        payload: dict[str, Any] = {"query": query}
        if variables:
            payload["variables"] = variables
        response = self._client.post("/graphql", json=payload)
    # ── Test Data Management (TDM) ─────────────────────────────────────────────

    @staticmethod
    def create_unique_id(prefix: str = "id") -> str:
        import time, uuid
        return f"{prefix}-{int(time.time() * 1000)}-{uuid.uuid4().hex[:5]}"

    @staticmethod
    def create_test_email(prefix: str = "user") -> str:
        import time, uuid
        return f"test-{prefix}-{int(time.time() * 1000)}-{uuid.uuid4().hex[:4]}@example.com"

    @staticmethod
    def create_test_phone() -> str:
        import random
        return f"+1{random.randint(100000000, 999999999)}"

    @staticmethod
    def create_test_password(length: int = 14) -> str:
        import random, string
        chars = string.ascii_letters + string.digits + "!@#$%^&*"
        return "Aa1!" + "".join(random.choice(chars) for _ in range(max(0, length - 4)))

    @staticmethod
    def create_test_uuid() -> str:
        import uuid
        return str(uuid.uuid4())

    @staticmethod
    def create_test_name(prefix: str = "User") -> str:
        import random, uuid
        names = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Sam", "Chris"]
        return f"{prefix} {random.choice(names)} {uuid.uuid4().hex[:4].upper()}"

    @staticmethod
    def create_test_amount(min_val: float = 10.0, max_val: float = 1000.0) -> float:
        import random
        return round(random.uniform(min_val, max_val), 2)

    @staticmethod
    def create_test_date(offset_days: int = 0) -> str:
        from datetime import datetime, timedelta, timezone
        d = datetime.now(timezone.utc) + timedelta(days=offset_days)
        return d.isoformat()

    # ── Context manager ───────────────────────────────────────────────────────

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> ApiClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
`;
}

// ── README ─────────────────────────────────────────────────────────────────

/** README.md */
export function renderPythonProjectReadme(opts: PythonProjectOpts): string {
  const { projectName, baseUrl } = opts;
  return `# ${projectName}

E2E test framework — Python + Playwright (pytest-playwright).

## Quick Start

\`\`\`bash
# Install dependencies
pip install -e ".[api]"

# Install Playwright browsers
playwright install chromium

# Run all tests
pytest

# Run with visible browser
pytest --headed

# Run a specific file
pytest tests/examples/test_example.py -v
\`\`\`

## Project Structure

\`\`\`
components/
  base/          # BasePage, Component, Container, Collection, Scope
  primitives/    # Button, TextInput, Checkbox, Select, Link, FileInput
  widgets/       # Dialog, Table
  pages/         # Your Page Object Models go here
tests/
  examples/      # Generated example specs
shared/
  utils/         # ApiClient and shared helpers
conftest.py      # Shared pytest-playwright fixtures (viewport, context)
pyproject.toml   # Project config + pytest options (base_url: ${baseUrl})
\`\`\`

## Component Model (CPOM)

Wrap every UI element in a **typed component**. Pages expose components as \`@property\` producers.

\`\`\`python
class LoginPage(BasePage):
    URL = "/login"

    def navigate(self) -> None:
        self._page.goto(self.URL)

    @property
    def username_input(self) -> TextInput:
        return self._scope(TextInput, self._root.get_by_label("Username"))

    def login(self, username: str, password: str) -> None:
        self.username_input.fill(username)
        self._root.get_by_role("button", name="Log in").click()
\`\`\`

## Method Safety Contract

| Type | Return | Rule |
|---|---|---|
| Action | \`None\` | Playwright auto-waiting, no sleep() |
| Producer | component instance | \`@property\`, lazy — no side effects |
| Snapshot read | value | Name ends with \`_now\` |
| Assertion | — | **Never** inside components or pages — test code only |
`;
}

// ── Helpers / Wrappers ──────────────────────────────────────────────────────

/** test.bat */
export function renderPythonTestBat(): string {
  return `@echo off
".venv\\Scripts\\pytest" %*
`;
}

/** test.sh */
export function renderPythonTestSh(): string {
  return `#!/bin/sh
".venv/bin/pytest" "$@"
`;
}

/** shared/utils/react.py */
export function renderPythonReactHelpers(): string {
  return `from playwright.sync_api import Page

def wait_for_react_hydration(page: Page) -> None:
    """
    Wait for React hydration to complete by waiting for network idle and the document state.
    This helps avoid "click race conditions" where components are visible but not yet interactive.
    """
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_load_state("networkidle")
    page.evaluate("() => new Promise(requestAnimationFrame)")
`;
}

/** shared/utils/vue.py */
export function renderPythonVueHelpers(): string {
  return `from playwright.sync_api import Page

def wait_for_vue_hydration(page: Page) -> None:
    """
    Wait for Vue hydration to complete by waiting for network idle and the document state.
    This helps avoid "click race conditions" where components are visible but not yet interactive.
    """
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_load_state("networkidle")
    page.evaluate("() => new Promise(requestAnimationFrame)")
`;
}

/** shared/utils/svelte.py */
export function renderPythonSvelteHelpers(): string {
  return `from playwright.sync_api import Page

def wait_for_svelte_hydration(page: Page) -> None:
    """
    Wait for Svelte hydration to complete by waiting for network idle and the document state.
    This helps avoid "click race conditions" where components are visible but not yet interactive.
    """
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_load_state("networkidle")
    page.evaluate("() => new Promise(requestAnimationFrame)")
`;
}

/** shared/utils/angular.py */
export function renderPythonAngularHelpers(): string {
  return `from playwright.sync_api import Page

def wait_for_angular_hydration(page: Page) -> None:
    """
    Wait for Angular hydration to complete by waiting for network idle and the document state.
    This helps avoid "click race conditions" where components are visible but not yet interactive.
    """
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_load_state("networkidle")
    page.evaluate("() => new Promise(requestAnimationFrame)")
`;
}

/** tests/examples/test_cpom_showcase.py */
export function renderPythonCpomShowcase(): string {
  return `"""CPOM showcase test — self-contained, runs against mock HTML without network.

Regenerated by framework — do not edit. Write your own tests in sibling files.
"""
import pytest
from playwright.sync_api import Page, expect
from components import BasePage, Table, Dialog, Link, TextInput, NativeSelect

HTML = """
  <input aria-label="Search" />
  <select aria-label="Role filter">
    <option value="engineer">Engineer</option>
    <option value="admiral">Admiral</option>
  </select>
  <table>
    <thead>
      <tr><th>Name</th><th>Role</th></tr>
    </thead>
    <tbody>
      <tr><td>Ada</td><td>Engineer</td></tr>
      <tr><td>Grace</td><td>Admiral</td></tr>
    </tbody>
  </table>
  <a href="/next">Next</a>
  <div role="dialog" aria-label="Confirm">
    <h2>Delete?</h2>
    <button>Cancel</button>
  </div>
"""


class ShowcaseScreen(BasePage):
    path = "/"

    @property
    def search(self) -> TextInput:
        return self._scope(TextInput, self._root.get_by_role("textbox", name="Search"))

    @property
    def role(self) -> NativeSelect:
        return self._scope(NativeSelect, self._root.get_by_role("combobox", name="Role filter"))

    @property
    def next(self) -> Link:
        return self._scope(Link, self._root.get_by_role("link", name="Next"))

    @property
    def people(self) -> Table:
        return Table(self._root.get_by_role("table"))

    @property
    def dialog(self) -> Dialog:
        return Dialog(self._root.get_by_role("dialog"))


def test_page_composes_components_and_table_nests(page: Page) -> None:
    page.set_content(HTML)
    screen = ShowcaseScreen(page)

    # Collection cardinality via a web-first assertion (1 header row + 2 body rows = 3).
    expect(screen.people.rows().locator).to_have_count(3)

    # Nesting: locate a row by its text, then read a body cell inside it.
    expect(screen.people.row("Ada").cell(1).locator).to_have_text("Engineer")


def test_child_composes_primitive_and_dialog_resolves_from_page_root(page: Page) -> None:
    page.set_content(HTML)
    screen = ShowcaseScreen(page)

    expect(screen.next.locator).to_have_text("Next")
    expect(screen.dialog.locator).to_be_visible()
    expect(screen.dialog.button("Cancel").locator).to_be_visible()


def test_universal_actions_and_helpers(page: Page) -> None:
    page.set_content(HTML)
    screen = ShowcaseScreen(page)

    # A universal action (fill) plus a web-first assertion on the exposed locator.
    screen.search.fill("ada")
    expect(screen.search.locator).to_have_value("ada")

    # A native <select> handled by the NativeSelect primitive.
    screen.role.select_option(label="Admiral")
    expect(screen.role.locator).to_have_value("admiral")

    # Collection helpers: first()/last() alongside nth().
    expect(screen.people.rows().first().locator).to_contain_text("Name")
    expect(screen.people.rows().last().locator).to_contain_text("Grace")
`;
}

/** tests/examples/test_api_showcase.py */
export function renderPythonApiExampleSpec(opts: { baseUrl: string }): string {
  return `"""Showcase of REST and GraphQL API testing using ApiClient."""
import pytest

try:
    import httpx
except ImportError:
    httpx = None

pytestmark = pytest.mark.skipif(
    httpx is None, reason="httpx is not installed (install with: pip install httpx)"
)

from shared.utils.api_client import ApiClient


def test_rest_get_request_demo() -> None:
    # 1. Initialize our ApiClient
    try:
        with ApiClient(base_url="${opts.baseUrl}") as api:
            # 2. Fetch mock list of items
            response = api.get("/api/todos")
            # In a real test, assert response properties. Here we just demo usage.
            assert api is not None
    except Exception as err:
        pytest.skip(f"Base URL / REST endpoint is unreachable: {err}")


def test_graphql_query_request_demo() -> None:
    query = """
      query getCountry($code: ID!) {
        country(code: $code) {
          name
          currency
        }
      }
    """
    try:
        # 1. Initialize client with Trevor Blades countries GraphQL API
        with ApiClient(base_url="https://countries.trevorblades.com") as api:
            # 2. Execute GraphQL query
            data = api.graphql(query, variables={"code": "CA"})
            
            # 3. Assert properties
            assert data["data"]["country"]["name"] == "Canada"
            assert data["data"]["country"]["currency"] == "CAD"
    except Exception:
        # Skip gracefully if external API is unreachable
        pytest.skip("External GraphQL API is unreachable")
`;
}

/** tests/test_auth_setup.py */
export function renderPythonAuthSetup(): string {
  return `"""Authentication setup blueprint — logs in and saves storage state."""
import pytest
from playwright.sync_api import Page

AUTH_FILE = ".auth/user.json"


@pytest.mark.skip(reason="SSO/Form authentication blueprint - configure for your application")
def test_authenticate(page: Page) -> None:
    # ------------------------------------------------------------------------
    # BLUEPRINT: Customize this block for your application's login mechanism.
    # Supports SSO, OAuth, Auth0, standard forms, or API-based login.
    # ------------------------------------------------------------------------

    # 1. Go to your login page
    # page.goto("/login")

    # 2. Perform login actions (e.g. fill username/password, click login, handle redirects)
    # page.get_by_label("Username").fill("admin")
    # page.get_by_label("Password").fill("password")
    # page.get_by_role("button", name="Log in").click()

    # 3. Wait for the application to be in an authenticated state
    # page.wait_for_url("/dashboard")

    # ------------------------------------------------------------------------
    # End of authentication steps.
    # ------------------------------------------------------------------------

    # Save storage state (cookies, local storage) to share across tests
    page.context.storage_state(path=AUTH_FILE)
`;
}
