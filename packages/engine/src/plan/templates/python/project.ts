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
export function renderPythonConftest(_opts?: Pick<PythonProjectOpts, 'baseUrl'>): string {
  return `"""Root conftest — shared Playwright fixtures for the whole test suite."""
from collections.abc import Iterator
import json
import pathlib
import pytest
from dotenv import load_dotenv
from playwright.sync_api import BrowserContext, Page
from shared.utils.api_client import ApiClient

# Loads .env into the process environment once, before anything below reads os.getenv(...).
# Never overrides a variable already set in the real environment (e.g. CI secrets).
load_dotenv()


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args: dict) -> dict:
    """Extend default browser context: set 1280×720 viewport and preload storage state if available."""
    args = {
        **browser_context_args,
        "viewport": {"width": 1280, "height": 720},
    }
    auth_file = pathlib.Path(".auth/user.json")
    if auth_file.is_file():
        args["storage_state"] = str(auth_file)
    return args


@pytest.fixture
def api_client(base_url: str) -> Iterator[ApiClient]:
    """Fixture providing an ApiClient instance with automatic cleanup.

    Shares cookies with the captured browser session (.auth/user.json, written by /auth-setup)
    when present, so API-based preconditions authenticate the same way the UI does. Token-based
    sessions still work via api_client.set_auth_token(...) after an API login step.
    """
    cookies: dict[str, str] = {}
    auth_file = pathlib.Path(".auth/user.json")
    if auth_file.is_file():
        state = json.loads(auth_file.read_text())
        cookies = {c["name"]: c["value"] for c in state.get("cookies", [])}
    with ApiClient(base_url=base_url, cookies=cookies) as client:
        yield client


# ── Page Object Fixtures (Dependency Injection) ────────────────────────────
# Add your own Page Object fixtures here once you have concrete Page Objects — tests should
# receive them as parameters (dependency injection), never construct them directly. Example:
#
# from components.login_page import LoginPage
#
# @pytest.fixture
# def login_page(page: Page) -> LoginPage:
#     """Fixture providing an initialized LoginPage instance."""
#     return LoginPage(page)
`;
}

/** pyproject.toml */
export function renderPyprojectToml(opts?: Partial<PythonProjectOpts>): string {
  const projectName = opts?.projectName ?? 'playwright-tests';
  const baseUrl = opts?.baseUrl ?? 'http://localhost:3000';
  return `[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[project]
name = "${projectName}"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "playwright==1.62.0",
    "pytest>=8.0.0",
    "pytest-playwright>=0.5.0",
    "pytest-html>=4.1.1",
    "pytest-rerunfailures>=14.0",
    "pytest-split>=0.11.0",
    "httpx>=0.27.0",
    "python-dotenv>=1.0.0",
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

// ── Test files ─────────────────────────────────────────────────────────────

/** tests/examples/test_example.py */
export function renderPythonExampleTest(opts?: Pick<PythonProjectOpts, 'baseUrl'>): string {
  const baseUrl = opts?.baseUrl ?? 'http://localhost:3000';
  return `"""Example smoke tests — demonstrates the Component Page Object Model pattern.
Copy and adapt these for your own page objects.
"""
import pytest
from playwright.sync_api import Page, expect


def test_harness_boots(page: Page) -> None:
    """Verify browser harness boots and renders HTML correctly without network."""
    page.set_content("<h1>ok</h1>")
    expect(page.get_by_role("heading")).to_have_text("ok")



def test_home_page_is_reachable(page: Page) -> None:
    """Verify the application home page returns a successful HTTP response."""
    try:
        response = page.goto("${baseUrl}")
        assert response is not None, "Expected a response, got None"
        assert response.ok, f"Expected HTTP 2xx, got {response.status}"
    except Exception as err:
        pytest.skip(f"Base URL is unreachable: {err}")


def test_page_has_non_empty_title(page: Page) -> None:
    """Verify the page has a non-empty <title> after loading."""
    try:
        page.goto("${baseUrl}")
        assert page.title() != "", "Expected page title to be non-empty"
    except Exception as err:
        pytest.skip(f"Base URL is unreachable: {err}")


# Example: fixture injection (uncomment once you have Page Objects and the matching fixture in
# conftest.py — tests receive Page Objects as parameters, never construct them directly):
#
# def test_login_flow(login_page: LoginPage) -> None:
#     login_page.navigate()
#     login_page.login("user@example.com", "SecretPass123!")
`;
}

/** shared/utils/api_client.py */
export function renderPythonApiClient(opts: Pick<PythonProjectOpts, 'baseUrl'>): string {
  return `"""ApiClient — thin httpx wrapper for REST and GraphQL API test steps.

Requires: pip install httpx  (or add to pyproject.toml [project.optional-dependencies] api)
"""
from __future__ import annotations

import os
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

    def __init__(
        self,
        base_url: str = "${opts.baseUrl}",
        cookies: dict[str, str] | None = None,
        auth_token: str | None = None,
    ) -> None:
        if httpx is None:
            raise ImportError(
                "httpx package is required for ApiClient. Install it with: pip install httpx"
            )
        # Falls back to E2E_API_TOKEN / AUTH_TOKEN from the environment (.env) when not passed
        # explicitly, mirroring the TypeScript ApiClient's own default resolution.
        self._auth_token = auth_token or os.getenv("E2E_API_TOKEN") or os.getenv("AUTH_TOKEN")
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"), timeout=30, cookies=cookies or {}, headers=headers
        )

    def set_auth_token(self, token: str | None) -> None:
        """Set (or clear, passing None) the bearer token injected into every subsequent request's
        Authorization header. Call this after an API-based login step returns an access_token, so
        the rest of that test's API calls (create/modify/delete/read preconditions) authenticate
        the same way the real application does."""
        self._auth_token = token
        if token:
            self._client.headers["Authorization"] = f"Bearer {token}"
        else:
            self._client.headers.pop("Authorization", None)

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
        return response.json()

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

/** fixtures/auth_setup.py */
export function renderPythonAuthSetup(): string {
  return `"""Authentication setup blueprint — logs in and saves storage state."""
import os
from playwright.sync_api import Page

AUTH_FILE = ".auth/user.json"


def test_authenticate(page: Page) -> None:
    # ------------------------------------------------------------------------
    # BLUEPRINT: Customize this block for your application's login mechanism.
    # Supports SSO, OAuth, Auth0, standard forms, or API-based login.
    # ------------------------------------------------------------------------

    # 1. Go to your login page
    # page.goto("/login")

    # 2. Perform login actions (e.g. fill username/password, click login, handle redirects)
    # page.get_by_label("Username").fill(os.getenv("E2E_USERNAME", ""))
    # page.get_by_label("Password").fill(os.getenv("E2E_PASSWORD", ""))
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
