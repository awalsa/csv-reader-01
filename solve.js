// Fast drop-in for csv-reader 1.0.0 (make.fun): identical answers, much less CPU.
// Strategy: never walk a field one character at a time building a string.
// Unquoted fields are cut by one tight charCodeAt scan to the next delimiter
// (a single JS pass beats three native indexOf calls on these short fields)
// and one slice; quoted fields find their closing quote with indexOf('"') and
// slice the content in one go when it holds no doubled quote and no line break.
// Stray CRs, doubled quotes and line breaks inside quotes are rare, so they
// take a slower path that only runs when one is actually present. No
// per-character string concat, no helper call per character; the only per-field
// call is the unquoted reader itself.
//
// Semantics (csv-reader 1.0.0, verified against its source):
// - U+FEFF at the very start is dropped.
// - A record ends at LF or CRLF; a line left with no characters is no record.
// - Outside quotes a CR not followed by LF is dropped (error stray_cr).
// - A field opening with a quote runs to the next non-doubled quote; "" inside is
//   one quote; CRLF / lone CR inside is LF (and counts a line). What follows the
//   closing quote up to the next comma or line break is appended as-is
//   (quote_junk, when anything was added). A quote that never closes is a
//   literal character and the text after it is re-read as unquoted
//   (unterminated_quote). A quote inside an unquoted field is literal.
// - Fields stay strings, never trimmed or converted. columns is the first record
//   when header is true, else null (header with no records gives columns []).
//   rows are padded with "" (short_row, fields: count) or cut (long_row, extra:
//   the cut fields) to the first record's width.
// - Each error is {code, line, row}, in the order met: line is the 1-based line
//   its record starts on, row its index in rows (null for the header). A line
//   that held only stray CRs leaves no record (its stray_cr errors stay).

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // These change per record; the readers below close over them.
  let recordLine = 1;
  let recordRow = null;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field starting at pos, appending to `init` (which is the
  // value built so far, "" for a fresh field, '"' for an unterminated re-read,
  // or a quoted field's value for quote junk). Returns {value, ended, added}
  // where added counts the characters kept. Advances pos/line, records stray_cr.
  // The scan is one tight charCodeAt loop (a single JS pass beats three native
  // indexOf calls on these short fields); the field is cut with one slice.
  function readUnquoted(init, initAdded) {
    let p = pos;
    let value = init;
    let added = initAdded;
    for (;;) {
      // Scan to the next delimiter (comma, LF, CR) or the end of the text.
      let i = p;
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 44 || c === 10 || c === 13) break;
        i += 1;
      }
      if (i >= n) {
        value = value === '' ? text.slice(p, n) : value + text.slice(p, n);
        added += n - p;
        pos = n;
        return { value, ended: END, added };
      }
      const c = text.charCodeAt(i);
      if (c === 44) {
        value = value === '' ? text.slice(p, i) : value + text.slice(p, i);
        added += i - p;
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (c === 10) {
        value = value === '' ? text.slice(p, i) : value + text.slice(p, i);
        added += i - p;
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // CR: CRLF ends the field, a lone CR is dropped (stray_cr) and the
      // field goes on. Stray CRs are rare, so the loop above re-runs.
      if (i + 1 < n && text.charCodeAt(i + 1) === 10) {
        value = value === '' ? text.slice(p, i) : value + text.slice(p, i);
        added += i - p;
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      value = value === '' ? text.slice(p, i) : value + text.slice(p, i);
      added += i - p;
      pushError('stray_cr');
      p = i + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Returns {value, ended}.
  // On an unterminated quote it reports the error and re-reads as unquoted.
  function readQuoted() {
    const open = pos;
    // Find the closing quote: a quote not followed by another quote.
    let q = pos + 1;
    let closeQ = -1;
    let hasDoubled = false;
    for (;;) {
      const idx = text.indexOf('"', q);
      if (idx === -1) break;
      if (idx + 1 < n && text.charCodeAt(idx + 1) === 34) {
        hasDoubled = true;
        q = idx + 2;
        continue;
      }
      closeQ = idx;
      break;
    }
    if (closeQ === -1) {
      // The quote never closes: literal quote, re-read as unquoted.
      // line is still the opening line: nothing inside was counted yet.
      pushError('unterminated_quote');
      pos = open + 1;
      return readUnquoted('"', 1);
    }
    // Build the value from the content [open+1, closeQ).
    let value;
    const firstLF = text.indexOf('\n', open + 1);
    const firstCR = text.indexOf('\r', open + 1);
    const hasBreak = (firstLF !== -1 && firstLF < closeQ) || (firstCR !== -1 && firstCR < closeQ);
    if (!hasDoubled && !hasBreak) {
      value = text.slice(open + 1, closeQ);
    } else {
      // Slow path: collapse "" to one quote, turn each CRLF / lone CR into LF
      // (counting a line each), keep every other character as-is.
      const out = [];
      let i = open + 1;
      while (i < closeQ) {
        const c = text.charCodeAt(i);
        if (c === 34) {
          out.push('"');
          i += 2; // "" is one quote
        } else if (c === 13) {
          out.push('\n');
          line += 1;
          i += (i + 1 < closeQ && text.charCodeAt(i + 1) === 10) ? 2 : 1;
        } else if (c === 10) {
          out.push('\n');
          line += 1;
          i += 1;
        } else {
          // Copy a run of plain characters in one slice.
          let j = i + 1;
          while (j < closeQ) {
            const d = text.charCodeAt(j);
            if (d === 34 || d === 13 || d === 10) break;
            j += 1;
          }
          out.push(text.slice(i, j));
          i = j;
        }
      }
      value = out.join('');
    }
    pos = closeQ + 1;
    if (pos >= n) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands.
    const junk = readUnquoted(value, value.length);
    if (junk.added > value.length) pushError('quote_junk');
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('', 0);
      fields.push(field.value);
    } while (field.ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
