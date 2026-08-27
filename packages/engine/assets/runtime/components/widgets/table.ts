import { type Scope } from '../base/scope';
import { Component } from '../base/component';
import { Container } from '../base/container';
import { Collection } from '../base/collection';

/** A single cell (role `cell` in a table, `gridcell` in a grid; header cells are separate). */
export class Cell extends Component {}

/** A table/grid row. Scopes its cells to itself (cells are always DOM descendants of the row). */
export class Row extends Container {
  /** The body cells of this row. */
  cells(): Collection<Cell> {
    return new Collection(
      this.locator.getByRole('cell').or(this.locator.getByRole('gridcell')),
      Cell,
    );
  }

  /** The nth body cell (0-based). */
  cell(i: number): Cell {
    return this.cells().nth(i);
  }
}

/**
 * A data table or grid — matches a semantic `<table>` (role `table`) or an ARIA grid (role `grid`);
 * rows use the shared `row` role, cells the `cell`/`gridcell` roles. Because a table's identity is a
 * role union (not a single role), construct it directly: `new Table(page)` or `new Table(scope)`.
 */
export class Table extends Container {
  constructor(scope: Scope) {
    super(scope, {
      kind: 'custom',
      why: 'a data table (role table) or ARIA grid (role grid)',
      resolve: (s) => s.getByRole('table').or(s.getByRole('grid')),
    });
  }

  /** All rows (including the header row, which also has role `row`). */
  rows(): Collection<Row> {
    return new Collection(this.locator.getByRole('row'), Row);
  }

  /** The first row containing the given text. */
  row(hasText: string | RegExp): Row {
    return this.rows().filter({ hasText }).nth(0);
  }

  /** The first row where a specific column (0-based) contains the given text. */
  rowByColumn(colIndex: number, text: string | RegExp): Row {
    const cellLoc = this.locator
      .locator(
        `td:nth-child(${colIndex + 1}), th:nth-child(${colIndex + 1}), [role="cell"]:nth-child(${colIndex + 1}), [role="gridcell"]:nth-child(${colIndex + 1})`,
      )
      .filter({ hasText: text });
    return this.rows().filter({ has: cellLoc }).first();
  }

  /** The text content of a specific cell right now (a one-shot, non-retrying read). */
  async cellTextNow(rowIndex: number, colIndex: number): Promise<string | null> {
    return this.rows().nth(rowIndex).cell(colIndex).locator.textContent();
  }

  /** The header cells (role `columnheader` or `rowheader`). */
  headerCells(): Collection<Cell> {
    return new Collection(
      this.locator.getByRole('columnheader').or(this.locator.getByRole('rowheader')),
      Cell,
    );
  }
}
