/**
 * Column id reserved for the row-selection checkbox. `HyperTable` and `HyperRow`
 * each accept an override; this is the id they agree on when neither is told
 * otherwise, so the header checkbox and the row checkboxes cannot drift apart.
 */
export const DEFAULT_SELECT_COLUMN_ID = 'select'
