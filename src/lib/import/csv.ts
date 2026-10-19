// A small CSV reader for spreadsheet exports. Handles quoted fields, escaped
// quotes, CRLF line endings and a UTF-8 BOM. Excel saves CSV with ";" in
// locales that use a decimal comma (South Africa among them), so the
// delimiter is detected from the header line.

export function detectDelimiter(text: string): "," | ";" | "\t" {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const candidates = [",", ";", "\t"] as const;
  return candidates.reduce((best, ch) => (count(ch) > count(best) ? ch : best), ",");
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines (a trailing newline, or empty rows in the sheet).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// Quotes a value for writing CSV (template downloads).
export function csvCell(value: string): string {
  return /[",;\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
