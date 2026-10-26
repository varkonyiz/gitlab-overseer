/**
 * CSV writer (RFC 4180) for exporting collected data and metrics to spreadsheets and other tools.
 */
export type CsvDelimiter = ',' | ';' | '\t';
export type CsvValue = string | number | boolean | Date | null | undefined;

export interface CsvColumn<T> {
  readonly header: string;
  readonly value: (row: T) => CsvValue;
}

export interface CsvOptions {
  /** `;` suits Excel with a decimal comma (e.g. Hungarian locale). Default `,`. */
  readonly delimiter?: CsvDelimiter;
  /** Prefix a UTF-8 byte order mark so Excel detects the encoding. Default true. */
  readonly bom?: boolean;
}

const FORMULA_START = /^[=+\-@\t\r]/;

export function toCsv<T>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
  options: CsvOptions = {},
): string {
  const delimiter = options.delimiter ?? ',';
  const lines = [
    columns.map((c) => escapeCell(c.header, delimiter)).join(delimiter),
    ...rows.map((row) =>
      columns.map((c) => escapeCell(formatValue(c.value(row)), delimiter)).join(delimiter),
    ),
  ];
  return `${options.bom === false ? '' : '\uFEFF'}${lines.join('\r\n')}\r\n`;
}

export function formatValue(value: CsvValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  return String(value);
}

/**
 * Quotes when needed and neutralises spreadsheet formulas: GitLab data (titles, names, labels) is
 * user-controlled, and a cell starting with `=`, `+`, `-` or `@` would run as a formula in Excel
 * (CSV injection). Such text cells get a leading apostrophe; plain numbers stay numbers.
 */
export function escapeCell(text: string, delimiter: CsvDelimiter): string {
  let cell = text;
  if (FORMULA_START.test(cell) && !isPlainNumber(cell)) {
    cell = `'${cell}`;
  }
  if (cell.includes(delimiter) || /["\r\n]/.test(cell) || cell !== cell.trim()) {
    cell = `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

function isPlainNumber(text: string): boolean {
  return /^[-+]?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(text);
}
