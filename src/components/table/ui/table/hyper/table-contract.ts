import type {
  Cell_Cell,
  ColumnDef_ColumnSizing,
  Column_Column,
  Column_ColumnFaceting,
  Column_ColumnFiltering,
  Column_ColumnPinning,
  Column_ColumnResizing,
  Column_ColumnSizing,
  Column_ColumnVisibility,
  Column_RowSorting,
  Header_ColumnResizing,
  Header_ColumnSizing,
  Header_Header,
  Renderable,
  Row_Row,
  Row_RowSelection,
  SortingState
} from '@octanejs/tanstack-table'

/**
 * The structural contract the `Hyper*` components require of a table, its rows,
 * cells, headers and columns — only the surface they actually read.
 *
 * WHY STRUCTURAL. TanStack v9 resolves a feature map through
 * `ExtractFeatureMapTypes<any, …>`, which expands to *every* feature. That makes
 * `Table<any, any>` the MAXIMAL table rather than a permissive one: a table built
 * from a feature subset is missing ~34 of its members and will not assign. The
 * same trap applies to `Header<any, …>`, `Column<any, …>`, `Row<any, …>` and
 * `Cell<any, …>`, and to the base constraint (`Table<TableFeatures, …>`) too.
 *
 * WHY COMPOSED RATHER THAN HAND-WRITTEN. Every member below is `Pick`ed from the
 * per-feature interface that declares it, so the signatures are the library's,
 * not a copy that drifts. TanStack's per-feature interfaces are mostly
 * non-generic, and where they are generic the members used here name no feature
 * in their own signatures, so picking from `<any, any>` yields a feature-free
 * type that any sufficient feature set satisfies.
 *
 * WHAT IS STILL DECLARED BY HAND, and why it has to be:
 *   - the recursive references (`column`, `getLeafColumns`, `getAllCells`,
 *     `getAllLeafColumns`, `getHeaderGroups`) — the library types these as
 *     `Column<TFeatures, …>` etc., which reintroduces the feature parameter, so
 *     they are re-pointed at the narrowed types here;
 *   - `getContext`, whose real return is `HeaderContext`/`CellContext<TFeatures,
 *     …>`. It is only ever handed straight to `flexRender`, which takes
 *     `TProps extends object`, so `object` is all that is required of it;
 *   - `columnDef.header`/`.cell`/`.aggregatedCell`, typed as `Renderable` for the
 *     same reason. The size fields come from `ColumnDef_ColumnSizing`.
 *
 * A feature set that cannot satisfy these is rejected for the right reason: the
 * table genuinely needs column visibility, sizing, resizing and row sorting to
 * be rendered here. This mirrors `ColumnLike`/`SizedColumnLike` in
 * `column-pinning.ts`, which exist for the same reason.
 */
export interface HyperColumn
  extends Pick<Column_Column<any, any, any>, 'id'>,
    Pick<Column_ColumnVisibility, 'getCanHide'>,
    Pick<Column_ColumnResizing, 'getCanResize' | 'getIsResizing'>,
    Pick<Column_ColumnSizing, 'getSize' | 'resetSize'>,
    Pick<Column_RowSorting<any, any>, 'getCanSort' | 'toggleSorting'> {
  columnDef: ColumnDef_ColumnSizing & { header?: Renderable<any> }
  getLeafColumns: () => HyperColumn[]
}

/** A header as `HyperTable` and `ColumnSort` read it. */
export interface HyperHeader
  extends Pick<Header_Header<any, any, any>, 'colSpan' | 'isPlaceholder'>,
    Pick<Header_ColumnSizing, 'getSize'>,
    Pick<Header_ColumnResizing, 'getResizeHandler'> {
  column: HyperColumn
  getContext: () => object
}

/** The table itself, as `HyperTable` reads it. */
export interface HyperTableModel {
  getAllLeafColumns: () => HyperColumn[]
  getHeaderGroups: () => Array<{ headers: HyperHeader[] }>
  state: {
    /** Only ever used as a memo input, so its shape does not matter here. */
    columnSizing: unknown
    sorting: SortingState
  }
}

/**
 * A cell as `HyperCell` reads it.
 *
 * `getIsAggregated`/`getIsPlaceholder` and `columnDef.aggregatedCell` are
 * optional because `columnGroupingFeature` is optional — the same probe the
 * library's own `FlexRender` does rather than requiring the feature.
 */
export interface HyperCellModel extends Pick<Cell_Cell<any, any, any>, 'id'> {
  column: Pick<Column_Column<any, any, any>, 'id'> & {
    columnDef: { cell?: Renderable<any>; aggregatedCell?: Renderable<any> }
    getCanHide?: () => boolean
  }
  getContext: () => object
  getIsAggregated?: () => boolean
  getIsPlaceholder?: () => boolean
}

/** A row as `HyperRow` reads it. */
export interface HyperRowModel
  extends Pick<Row_Row<any, any>, 'id'>,
    Pick<Row_RowSelection, 'getCanSelect' | 'getIsSelected' | 'getToggleSelectedHandler' | 'toggleSelected'> {
  getAllCells: () => HyperCellModel[]
}

/** The minimum a column must expose to be given a human label in the UI. */
export interface LabelledColumn extends Pick<Column_Column<any, any, any>, 'id'> {
  columnDef: { header?: unknown }
}

/** A column as the column-view menu and the reorder list read it. */
export interface HyperViewColumn
  extends LabelledColumn,
    Pick<Column_ColumnVisibility, 'getCanHide' | 'getIsVisible' | 'toggleVisibility'>,
    Pick<Column_ColumnPinning, 'getIsPinned'> {}

/**
 * Props of the lazily loaded reorder list.
 *
 * Declared here rather than in `ColumnPositionList.btsx` because `ColumnView`
 * must name them when it calls `lazyComponent`, and a named type import from a
 * `.btsx` specifier does not resolve under `tsrx-tsc`.
 */
export interface ColumnPositionListProps {
  columns: HyperViewColumn[]
  reorderableColumnIds: string[]
  onReorder: (nextReorderableColumnIds: string[]) => void
}

/**
 * A column as the filter list reads it.
 *
 * Faceting and filtering are the features it needs; a table without them cannot
 * drive a filter list, and this says so precisely instead of `Column<any, …>`,
 * which demanded every feature — including grouping, which `snapsFeatures` does
 * not enable.
 */
export interface FilterListColumn
  extends Pick<Column_Column<any, any, any>, 'id'>,
    Pick<Column_ColumnFaceting<any, any>, 'getFacetedUniqueValues'>,
    Pick<Column_ColumnFiltering<any, any>, 'setFilterValue'> {}
