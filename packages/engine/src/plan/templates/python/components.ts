/**
 * Python component template render functions.
 * All functions return valid Python 3.11+ source code strings.
 *
 * Naming conventions enforced:
 *   - snake_case for methods and properties
 *   - PascalCase for class names
 *   - @property producers, _now() snapshot reads, no assertions
 */

// ── Base layer ────────────────────────────────────────────────────────────────

/** components/__init__.py */
export function renderPythonComponentsInit(): string {
  return `from .base import BasePage, Collection, Component, Container, Scope
from .primitives import Button, Checkbox, FileInput, Link, NativeSelect, RadioButton, RadioGroup, Select, TextInput
from .widgets import Dialog, Table

__all__ = [
    "BasePage",
    "Button",
    "Checkbox",
    "Collection",
    "Component",
    "Container",
    "Dialog",
    "FileInput",
    "Link",
    "NativeSelect",
    "RadioButton",
    "RadioGroup",
    "Scope",
    "Select",
    "Table",
    "TextInput",
]
`;
}

/** components/base/__init__.py */
export function renderPythonBaseInit(): string {
  return `from .base_page import BasePage
from .collection import Collection
from .component import Component
from .container import Container
from .scope import Scope

__all__ = ["BasePage", "Collection", "Component", "Container", "Scope"]
`;
}

/** components/base/scope.py */
export function renderPythonScope(): string {
  return `"""Scope — root Locator wrapper and child-component factory."""
from __future__ import annotations

from typing import Type, TypeVar

from playwright.sync_api import Locator

T = TypeVar("T", bound="Scope")


class Scope:
    """Base class for all page-object components. Wraps a single Playwright Locator."""

    def __init__(self, root: Locator) -> None:
        self._root = root

    def _scope(self, cls: Type[T], locator: Locator) -> T:
        """Instantiate a child component of type *cls* scoped to *locator*."""
        return cls(locator)
`;
}

/** components/base/component.py */
export function renderPythonComponent(): string {
  return `"""Component — atomic, self-contained UI element with no assertions."""
from __future__ import annotations

from playwright.sync_api import Locator

from .scope import Scope


class Component(Scope):
    """
    Base class for all UI primitives (Button, TextInput, …).

    Method Safety Contract
    ─────────────────────
    Actions      → return None; rely on Playwright native auto-waiting.
    Producers    → @property returning a child Component (lazy init).
    Snapshots    → return a value; name ends with _now.
    No assertions → never call assert / pytest.fail inside this class.
    """

    @property
    def locator(self) -> Locator:
        return self._root

    @property
    def _locator(self) -> Locator:
        return self._root

    # ── Universal Actions ───────────────────────────────────────────────────

    def click(self, force: bool = False, timeout: float | None = None) -> None:
        """Click the element. Playwright auto-waits for actionability."""
        self._root.click(force=force, timeout=timeout)

    def dblclick(self, force: bool = False, timeout: float | None = None) -> None:
        """Double-click the element."""
        self._root.dblclick(force=force, timeout=timeout)

    def hover(self, force: bool = False, timeout: float | None = None) -> None:
        """Hover over the element."""
        self._root.hover(force=force, timeout=timeout)

    def focus(self, timeout: float | None = None) -> None:
        """Focus the element."""
        self._root.focus(timeout=timeout)

    def press(self, key: str, timeout: float | None = None) -> None:
        """Press a keyboard key."""
        self._root.press(key, timeout=timeout)

    def wait_for(self, state: str = "visible", timeout: float | None = None) -> None:
        """Wait for the element to reach the specified state (visible, hidden, etc.)."""
        self._root.wait_for(state=state, timeout=timeout)

    def wait_for_animations(self, timeout_ms: int = 5000) -> None:
        """Wait for Web Animations API animations on this element and subtree to settle."""
        self._root.evaluate(
            """async (el, timeout) => {
                const anims = el.getAnimations ? el.getAnimations({ subtree: true }) : [];
                await Promise.all(anims.map(a => Promise.race([
                    a.finished,
                    new Promise(r => setTimeout(r, timeout))
                ])));
            }""",
            timeout_ms,
        )

    # ── Snapshot reads ───────────────────────────────────────────────────────

    def is_visible_now(self) -> bool:
        """Return True if the element is currently visible in the DOM."""
        return self._root.is_visible()

    def is_enabled_now(self) -> bool:
        """Return True if the element is currently not disabled."""
        return self._root.is_enabled()

    def text_now(self) -> str:
        """Return the current inner text content of the element."""
        return self._root.inner_text()

    def attribute_now(self, name: str) -> str | None:
        """Return the value of attribute *name*, or None if not set."""
        return self._root.get_attribute(name)
`;
}

/** components/base/container.py */
export function renderPythonContainer(): string {
  return `"""Container — a logical sub-region of a page or component."""
from __future__ import annotations

from .component import Component


class Container(Component):
    """
    A UI region (form, card, modal body, …) that exposes children
    as typed @property producers.

    Example::

        class LoginForm(Container):

            @property
            def username(self) -> TextInput:
                return self._scope(TextInput, self._root.locator("[name='username']"))

            @property
            def submit_button(self) -> Button:
                return self._scope(Button, self._root.get_by_role("button", name="Log in"))

            def submit(self, username: str, password: str) -> None:
                self.username.fill(username)
                self.submit_button.click()
    """
`;
}

/** components/base/collection.py */
export function renderPythonCollection(): string {
  return `"""Collection — an ordered, iterable sequence of homogeneous components."""
from __future__ import annotations

from typing import Generic, Iterator, Type, TypeVar

from playwright.sync_api import Locator

from .component import Component

T = TypeVar("T", bound=Component)


class Collection(Generic[T]):
    """
    Wraps a multi-element Playwright Locator as a typed, iterable sequence.

    Example::

        class ResultList(Collection[ResultItem]):
            pass

        results = ResultList(ResultItem, page.locator(".result-card"))
        first_item = results.nth(0)
        count = results.count_now()
        for item in results:
            print(item.text_now())
    """

    def __init__(self, item_cls: Type[T], root: Locator) -> None:
        self._item_cls = item_cls
        self._root = root

    @property
    def locator(self) -> Locator:
        return self._root

    # ── Snapshot reads ───────────────────────────────────────────────────────

    def count_now(self) -> int:
        """Return the number of matched elements currently in the DOM."""
        return self._root.count()

    def nth(self, index: int) -> T:
        """Return the component at zero-based *index*."""
        return self._item_cls(self._root.nth(index))

    def first(self) -> T:
        """Return the first component in the collection."""
        return self._item_cls(self._root.first)

    def last(self) -> T:
        """Return the last component in the collection."""
        return self._item_cls(self._root.last)

    # ── Python protocols ─────────────────────────────────────────────────────

    def __iter__(self) -> Iterator[T]:
        for i in range(self.count_now()):
            yield self.nth(i)

    def __len__(self) -> int:
        return self.count_now()
`;
}

/** components/base/base_page.py */
export function renderPythonBasePage(): string {
  return `"""BasePage — foundation for all Page Object Models."""
from __future__ import annotations

from playwright.sync_api import Page

from .scope import Scope


class BasePage(Scope):
    """
    Base class for all page objects.

    Method Safety Contract
    ─────────────────────
    Actions      → return None; rely on Playwright native auto-waiting.
    Producers    → @property returning a child Component (lazy init).
    Snapshots    → return a value; name ends with _now.
    No assertions → never call assert / pytest.fail inside page objects.

    Example::

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
    """

    def __init__(self, page: Page) -> None:
        super().__init__(page.locator("body"))
        self._page = page

    def navigate(self) -> None:
        """Navigate to the page URL. Must be overridden in subclasses."""
        raise NotImplementedError(f"{type(self).__name__}.navigate() is not implemented")

    def wait_for_load(self) -> None:
        """Wait for a stable loaded state. Override for custom waiting logic."""
        self._page.wait_for_load_state("networkidle")

    def url_now(self) -> str:
        """Return the current browser URL."""
        return self._page.url

    def title_now(self) -> str:
        """Return the current page title."""
        return self._page.title()
`;
}

// ── Primitives ─────────────────────────────────────────────────────────────

/** components/primitives/__init__.py */
export function renderPythonPrimitivesInit(): string {
  return `from .button import Button
from .checkbox import Checkbox
from .file_input import FileInput
from .link import Link
from .native_select import NativeSelect
from .radio import RadioButton, RadioGroup
from .select import Select
from .text_input import TextInput

__all__ = [
    "Button",
    "Checkbox",
    "FileInput",
    "Link",
    "NativeSelect",
    "RadioButton",
    "RadioGroup",
    "Select",
    "TextInput",
]
`;
}

/** components/primitives/button.py */
export function renderPythonButton(): string {
  return `"""Button — clickable button or link-button element."""
from __future__ import annotations

from ..base.component import Component


class Button(Component):
    """Represents a <button>, <input type='submit'>, or any role='button' element."""
    pass
`;
}

/** components/primitives/text_input.py */
export function renderPythonTextInput(): string {
  return `"""TextInput — single-line or multi-line text field."""
from __future__ import annotations

from ..base.component import Component


class TextInput(Component):
    """Represents an <input type='text|email|password|...'> or <textarea>."""

    # ── Actions ─────────────────────────────────────────────────────────────

    def fill(self, value: str) -> None:
        """Clear the field and type *value*. Playwright auto-waits for editability."""
        self._root.fill(value)

    def clear(self) -> None:
        """Clear the current field content."""
        self._root.clear()

    def press(self, key: str) -> None:
        """Press a keyboard key (e.g. 'Enter', 'Tab', 'Escape')."""
        self._root.press(key)

    # ── Snapshot reads ───────────────────────────────────────────────────────

    def value_now(self) -> str:
        """Return the current input value."""
        return self._root.input_value()
`;
}

/** components/primitives/checkbox.py */
export function renderPythonCheckbox(): string {
  return `"""Checkbox — a binary toggle input."""
from __future__ import annotations

from ..base.component import Component


class Checkbox(Component):
    """Represents an <input type='checkbox'> element."""

    # ── Actions ─────────────────────────────────────────────────────────────

    def check(self) -> None:
        """Check the checkbox if it is not already checked."""
        self._root.check()

    def uncheck(self) -> None:
        """Uncheck the checkbox if it is currently checked."""
        self._root.uncheck()

    def set_checked(self, checked: bool) -> None:
        """Set the checked state to *checked*."""
        self._root.set_checked(checked)

    # ── Snapshot reads ───────────────────────────────────────────────────────

    def is_checked_now(self) -> bool:
        """Return True if the checkbox is currently checked."""
        return self._root.is_checked()
`;
}

/** components/primitives/select.py */
export function renderPythonSelect(): string {
  return `"""Select — a native <select> dropdown element."""
from __future__ import annotations

from typing import Optional

from ..base.component import Component


class Select(Component):
    """
    Wraps a native HTML <select> element.
    For custom UI-library dropdowns, extend Container and use locator-based actions.
    """

    # ── Actions ─────────────────────────────────────────────────────────────

    def select_option(
        self,
        value: Optional[str] = None,
        label: Optional[str] = None,
        index: Optional[int] = None,
    ) -> None:
        """Select an option by value, visible label, or zero-based index."""
        self._root.select_option(value=value, label=label, index=index)

    # ── Snapshot reads ───────────────────────────────────────────────────────

    def value_now(self) -> str:
        """Return the currently selected option value."""
        return self._root.input_value()
`;
}

/** components/primitives/native_select.py */
export function renderPythonNativeSelect(): string {
  return `"""NativeSelect — a native HTML <select> element."""
from __future__ import annotations

from typing import Optional

from ..base.component import Component


class NativeSelect(Component):
    """Represents a native <select> element."""

    # ── Actions ─────────────────────────────────────────────────────────────

    def select_option(
        self,
        value: Optional[str] = None,
        label: Optional[str] = None,
        index: Optional[int] = None,
    ) -> list[str]:
        """Select an option by value, visible label, or zero-based index."""
        kwargs = {}
        if value is not None:
            kwargs["value"] = value
        if label is not None:
            kwargs["label"] = label
        if index is not None:
            kwargs["index"] = index
        return self._root.select_option(**kwargs)

    # ── Snapshot reads ───────────────────────────────────────────────────────

    def value_now(self) -> str:
        """Return the currently selected option value."""
        return self._root.input_value()
`;
}

/** components/primitives/link.py */
export function renderPythonLink(): string {
  return `"""Link — a hyperlink element."""
from __future__ import annotations

from ..base.component import Component


class Link(Component):
    """Represents an <a> element or role='link'."""

    def href_now(self) -> str | None:
        """Return the href attribute value."""
        return self._root.get_attribute("href")
`;
}

/** components/primitives/file_input.py */
export function renderPythonFileInput(): string {
  return `"""FileInput — a file upload control."""
from __future__ import annotations

from pathlib import Path
from typing import Union

from ..base.component import Component


class FileInput(Component):
    """
    A file upload control.
    """

    def set_files(self, files: Union[str, Path, list[Union[str, Path]]]) -> None:
        """Upload one or more files."""
        self._root.set_input_files(files)
`;
}

export function renderPythonRadio(): string {
  return `"""Radio and RadioGroup primitives."""
from __future__ import annotations

from ..base.component import Component
from ..base.container import Container

class RadioButton(Component):
    """A single radio button primitive."""

    def check(self) -> None:
        """Ensure the radio button is checked."""
        self._root.check()


class RadioGroup(Container):
    """A group of radio buttons."""

    def radio(self, name: str) -> RadioButton:
        """Find a radio button inside the group by its accessible name."""
        return self._scope(RadioButton, self._root.get_by_role("radio", name=name))

    def select(self, name: str) -> None:
        """Quick helper to check a radio button by name."""
        self.radio(name).check()
`;
}

// ── Widgets ────────────────────────────────────────────────────────────────

/** components/widgets/__init__.py */
export function renderPythonWidgetsInit(): string {
  return `from .dialog import Dialog
from .table import Table

__all__ = ["Dialog", "Table"]
`;
}

/** components/widgets/dialog.py */
export function renderPythonDialog(): string {
  return `"""Dialog — a modal dialog or overlay panel."""
from __future__ import annotations

from playwright.sync_api import Locator

from ..base.container import Container
from ..base.component import Component


class Dialog(Container):
    """
    Represents a modal dialog, drawer, or overlay panel.
    Subclass and add @property producers for the dialog's interactive content.
    """

    def __init__(self, root: Locator) -> None:
        super().__init__(root)

    # ── Producers ────────────────────────────────────────────────────────────

    def button(self, name: str) -> Component:
        """Return a Button component matching *name* inside the dialog."""
        from ..primitives.button import Button
        return Button(self._root.get_by_role("button", name=name))

    # ── Actions ─────────────────────────────────────────────────────────────

    def close(self) -> None:
        """Click the dialog's close/dismiss button (role='button', name='Close')."""
        self._root.get_by_role("button", name="Close").click()

    # ── Snapshot reads ───────────────────────────────────────────────────────

    def is_open_now(self) -> bool:
        """Return True if the dialog overlay is currently visible."""
        return self._root.is_visible()

    def title_now(self) -> str:
        """Return the current dialog heading text."""
        return self._root.locator("[role='heading']").first.inner_text()
`;
}

/** components/widgets/table.py */
export function renderPythonTable(): string {
  return `"""Table — a data table or ARIA grid widget."""
from __future__ import annotations

from playwright.sync_api import Locator

from ..base.collection import Collection
from ..base.component import Component


class TableCell(Component):
    """A single cell inside a TableRow."""
    pass


class TableRow(Component):
    """A single data row inside a Table."""

    def cells(self) -> Collection[TableCell]:
        return Collection(TableCell, self._root.locator("td, [role='cell']"))

    def cell(self, column_index: int) -> TableCell:
        return self.cells().nth(column_index)

    def cell_now(self, column_index: int) -> str:
        """Return the text of the cell at *column_index* (0-based)."""
        return self.cell(column_index).locator.inner_text()


class Table(Component):
    """
    Represents an HTML <table> or ARIA grid widget.
    """

    # ── Producers ────────────────────────────────────────────────────────────

    def rows(self) -> Collection[TableRow]:
        """Return all rows as a Collection."""
        return Collection(TableRow, self._root.get_by_role("row"))

    def row(self, text: str) -> TableRow:
        """Locate a single row matching *text*."""
        return TableRow(self._root.get_by_role("row", name=text))

    def row_by_column(self, col_index: int, text: str) -> TableRow:
        """The first row where a specific column (0-based) contains the given text."""
        cell_loc = self._root.locator(f"td:nth-child({col_index + 1}), th:nth-child({col_index + 1}), [role='cell']:nth-child({col_index + 1}), [role='gridcell']:nth-child({col_index + 1})").filter(has_text=text)
        return TableRow(self.rows().locator.filter(has=cell_loc).first)

    # ── Snapshot reads ───────────────────────────────────────────────────────

    def cell_text_now(self, row_index: int, col_index: int) -> str:
        """The text content of a specific cell right now."""
        return self.rows().nth(row_index).cell_now(col_index)

    def row_count_now(self) -> int:
        """Return the current number of body rows."""
        return self.rows().count_now()

    def headers_now(self) -> list[str]:
        """Return the column header label list."""
        hdrs = self._root.locator("th, [role='columnheader']")
        return [hdrs.nth(i).inner_text() for i in range(hdrs.count())]
`;
}
