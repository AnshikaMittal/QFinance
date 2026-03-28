export function parseCSVText(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"';
        i++; // skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(current);
        current = '';
      } else if (char === '\n' || (char === '\r' && next === '\n')) {
        row.push(current);
        current = '';
        if (row.some((cell) => cell.trim())) {
          rows.push(row);
        }
        row = [];
        if (char === '\r') i++; // skip \n
      } else {
        current += char;
      }
    }
  }

  // Last row
  if (current || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.trim())) {
      rows.push(row);
    }
  }

  return rows;
}
