import { escapeCell, formatValue, toCsv } from './csv';

interface Row {
  name: string;
  count: number | null;
}

const columns = [
  { header: 'name', value: (r: Row) => r.name },
  { header: 'count', value: (r: Row) => r.count },
];

describe('csv', () => {
  it('toCsv_Rows_HeaderBomAndCrlf', () => {
    const csv = toCsv<Row>([{ name: 'a', count: 1 }], columns);

    expect(csv).toBe('﻿name,count\r\na,1\r\n');
  });

  it('toCsv_SemicolonWithoutBom_UsesDelimiter', () => {
    const csv = toCsv<Row>([{ name: 'x;y', count: null }], columns, { delimiter: ';', bom: false });

    expect(csv).toBe('name;count\r\n"x;y";\r\n');
  });

  it('escapeCell_QuotesAndNewlines_Quoted', () => {
    expect(escapeCell('say "hi"', ',')).toBe('"say ""hi"""');
    expect(escapeCell('a\nb', ',')).toBe('"a\nb"');
    expect(escapeCell(' padded', ',')).toBe('" padded"');
  });

  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1)', '=HYPERLINK("x")'])(
    'escapeCell_FormulaText_Neutralised %s',
    (text) => {
      expect(escapeCell(text, ',').replace(/^"/, '').startsWith("'")).toBe(true);
    },
  );

  it('escapeCell_NegativeNumber_StaysNumber', () => {
    expect(escapeCell('-12.5', ',')).toBe('-12.5');
  });

  it('formatValue_Types_Formatted', () => {
    expect(formatValue(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('2026-01-02T03:04:05.000Z');
    expect(formatValue(Number.NaN)).toBe('');
    expect(formatValue(undefined)).toBe('');
    expect(formatValue(true)).toBe('true');
  });
});
