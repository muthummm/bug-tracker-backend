const BOM = '﻿';

/** RFC 4180 CSV parser: handles quoted cells with commas, quotes and line breaks. */
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

/** Builds a CSV that Excel opens correctly (UTF-8 BOM, CRLF line endings). */
export const toCsv = rows => BOM + rows.map(row => row.map(quote).join(',')).join('\r\n');
