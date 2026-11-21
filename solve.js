// Fast broken-CSV reader: byte-for-byte the same answers as csv-reader 1.0.0
// (make.fun's reference), without its one-character-at-a-time loop.
//
// Idea: most records sit on one line. A record whose line holds no quote
// and no stray CR is one String.split(',') call; a record whose line holds
// quotes is still parsed in one pass over that line, quotes handled inline
// with indexOf instead of stepping through every character. Only the rare
// records that need more — a quoted field spanning lines, a quote that never
// closes, a stray CR — go through the field-by-field scanner below, which
// jumps between the interesting characters with indexOf. The error policy
// is csv-reader's own, kept exactly:
//
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF; a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field opening with a quote runs to the next quote that is not doubled
//     ("" inside it is one quote); CRLF and lone CR inside it each read as LF;
//     what follows the closing quote up to the next comma or line break is
//     appended as it stands (quote_junk when the field ends); a quote that
//     never closes is a literal character and the text after it is read again
//     as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character;
//   - columns is the first record when header is true, else null; rows are the
//     records after it, each padded (short_row) or cut (long_row) to the first
//     record's width; each error is {code, line, row}, line the 1-based line
//     its record starts on, row its index in rows (null for the header).
//
// Pure: no clock, no randomness, no locale, nothing kept between calls.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input, faster. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and its index in rows
  // (null while the header is being read).
  let recLine = 1;
  let recRow = null;

  // The segment [a, b) of a quoted field, with each CRLF or lone CR inside it
  // read as one LF (and counted as a line). The common segment holds neither,
  // so it is a single slice.
  function conv(a, b) {
    const r = text.indexOf('\r', a);
    const nl = text.indexOf('\n', a);
    if ((r === -1 || r >= b) && (nl === -1 || nl >= b)) return text.slice(a, b);
    let s = '';
    let p = a;
    while (p < b) {
      const r2 = text.indexOf('\r', p);
      const n2 = text.indexOf('\n', p);
      let idx = -1;
      let isCR = false;
      if (r2 !== -1 && r2 < b) {
        idx = r2;
        isCR = true;
      }
      if (n2 !== -1 && n2 < b && (idx === -1 || n2 < idx)) {
        idx = n2;
        isCR = false;
      }
      if (idx === -1) {
        s += text.slice(p, b);
        break;
      }
      s += text.slice(p, idx);
      s += '\n';
      line += 1;
      // A CR followed by LF inside the segment is one line break, not two.
      p = isCR && text.charCodeAt(idx + 1) === 10 ? idx + 2 : idx + 1;
    }
    return s;
  }

  // Reads unquoted characters onto `value` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). Returns the field
  // and how it ended; `added` counts the characters kept, which is what
  // decides whether trailing junk after a closing quote is an error.
  function readUnquoted(value) {
    let added = 0;
    let start = pos;
    while (pos < n) {
      const ci = text.indexOf(',', pos);
      const ni = text.indexOf('\n', pos);
      const ri = text.indexOf('\r', pos);
      let idx = -1;
      let kind = COMMA;
      if (ci !== -1) {
        idx = ci;
        kind = COMMA;
      }
      if (ni !== -1 && (idx === -1 || ni < idx)) {
        idx = ni;
        kind = LINE_BREAK;
      }
      if (ri !== -1 && (idx === -1 || ri < idx)) {
        idx = ri;
        kind = 2; // CR: line break when followed by LF, else a stray CR
      }
      if (idx === -1) {
        value += text.slice(start, n);
        added += n - start;
        pos = n;
        return { value, ended: END, added };
      }
      if (kind === COMMA) {
        value += text.slice(start, idx);
        added += idx - start;
        pos = idx + 1;
        return { value, ended: COMMA, added };
      }
      if (kind === LINE_BREAK) {
        value += text.slice(start, idx);
        added += idx - start;
        pos = idx + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A CR: CRLF ends the field at a line break; a lone CR is dropped.
      value += text.slice(start, idx);
      added += idx - start;
      if (text.charCodeAt(idx + 1) === 10) {
        pos = idx + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      errors.push({ code: 'stray_cr', line: recLine, row: recRow });
      pos = idx + 1;
      start = pos;
    }
    value += text.slice(start, n);
    added += n - start;
    pos = n;
    return { value, ended: END, added };
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let p = pos + 1;
    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote inside the field is one quote.
        value += conv(p, q);
        value += '"';
        p = q + 2;
        continue;
      }
      value += conv(p, q);
      pos = q + 1;
      break;
    }
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
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) errors.push({ code: 'quote_junk', line: recLine, row: recRow });
    return junk;
  }

  // Parses the record on the line [pos, end) (end at the LF or EOF) in one
  // pass, returning its fields — or null when the record needs the slow path
  // (a quoted field that spans lines, a quote that never closes on this
  // line, or a CR inside the line). Errors it finds are collected locally
  // and only committed when the parse succeeds, so a fallback never double
  // reports them. `nl` is the index of the LF ending the line, or -1.
  function parseLine(end, nl) {
    const segEnd = nl !== -1 && text.charCodeAt(end - 1) === 13 ? end - 1 : end;
    const q0 = text.indexOf('"', pos);
    if (q0 === -1 || q0 >= segEnd) {
      // No quote on this line: a stray CR (other than the CRLF ending)
      // still needs the slow path.
      const cr = text.indexOf('\r', pos);
      if (cr !== -1 && cr < segEnd) return null;
      return { fields: text.slice(pos, segEnd).split(','), errs: null };
    }
    // A CR inside the line is a stray CR or a line break inside quotes:
    // the slow path.
    if (text.indexOf('\r', pos) !== -1 && text.indexOf('\r', pos) < segEnd) return null;
    const fields = [];
    const errs = [];
    let p = pos;
    for (;;) {
      if (text.charCodeAt(p) === 34) {
        // Quoted field: run to the next quote that is not doubled.
        let value = '';
        let s = p + 1;
        let closed = -1;
        for (;;) {
          const qq = text.indexOf('"', s);
          if (qq === -1 || qq >= segEnd) return null;
          if (text.charCodeAt(qq + 1) === 34) {
            value += text.slice(s, qq);
            value += '"';
            s = qq + 2;
            continue;
          }
          value += text.slice(s, qq);
          closed = qq;
          break;
        }
        p = closed + 1;
        if (p >= segEnd) {
          fields.push(value);
          break;
        }
        if (text.charCodeAt(p) === 44) {
          fields.push(value);
          p += 1;
          if (p >= segEnd) {
            fields.push('');
            break;
          }
          continue;
        }
        // Junk after the closing quote, up to the next comma or line end.
        const cm = text.indexOf(',', p);
        const jend = cm === -1 || cm >= segEnd ? segEnd : cm;
        if (jend > p) {
          value += text.slice(p, jend);
          errs.push({ code: 'quote_junk', line: recLine, row: recRow });
        }
        fields.push(value);
        if (jend >= segEnd) break;
        p = jend + 1;
        if (p >= segEnd) {
          fields.push('');
          break;
        }
        continue;
      }
      // Unquoted field: up to the next comma or line end.
      const cm = text.indexOf(',', p);
      if (cm === -1 || cm >= segEnd) {
        fields.push(text.slice(p, segEnd));
        break;
      }
      fields.push(text.slice(p, cm));
      p = cm + 1;
      if (p >= segEnd) {
        fields.push('');
        break;
      }
    }
    return { fields, errs };
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recLine = line;
    recRow = header && columns === null ? null : rows.length;

    // Fast path: the whole record sits on this one line, so parseLine
    // takes it in one pass. Anything it cannot take (a quoted field that
    // spans lines, an unclosed quote, a stray CR) falls to the slow path.
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? n : nl;
    const parsed = parseLine(end, nl);
    let fields;
    if (parsed !== null) {
      fields = parsed.fields;
      if (parsed.errs !== null) for (const e of parsed.errs) errors.push(e);
      pos = nl === -1 ? n : nl + 1;
      if (nl !== -1) line += 1;
    } else {
      // Slow path: the record holds a quote or a CR, read it field by field.
      fields = [];
      let field;
      let quoted = false;
      do {
        quoted = text.charCodeAt(pos) === 34;
        field = quoted ? readQuoted() : readUnquoted('');
        fields.push(field.value);
      } while (field.ended === COMMA);

      // A line that held only stray CRs is left with no characters: no
      // record (its stray_cr errors stay).
      if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
