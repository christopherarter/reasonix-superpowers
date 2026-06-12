function stripQuotes(v) {
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Parse a SKILL.md's frontmatter the way Reasonix does (minimal, not YAML).
 * @param {string} text
 * @returns {{ frontmatter: Record<string,string>, body: string }}
 */
export function parseFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { frontmatter: {}, body: text };
  }
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { close = i; break; }
  }
  if (close === -1) {
    return { frontmatter: {}, body: text };
  }

  const fm = {};
  const fmLines = lines.slice(1, close);
  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const m = line.match(/^([A-Za-z0-9._-]+):(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    let value = m[2].trim();

    if (value === '') {
      const collectedList = [];
      const collectedSection = {};
      let j = i + 1;
      let kind = null;
      while (j < fmLines.length) {
        const next = fmLines[j];
        const listMatch = next.match(/^\s+-\s+(.*)$/);
        const sectionMatch = next.match(/^\s+([A-Za-z0-9._-]+):\s*(.*)$/);
        // Once a block's kind is set, only keep collecting that same kind; a
        // different indented form ends the block (it is reprocessed as a normal
        // line) rather than being silently swallowed.
        if (listMatch && kind !== 'section') { kind = 'list'; collectedList.push(stripQuotes(listMatch[1].trim())); j++; continue; }
        if (sectionMatch && kind !== 'list') { kind = 'section'; collectedSection[sectionMatch[1].toLowerCase()] = stripQuotes(sectionMatch[2].trim()); j++; continue; }
        break;
      }
      if (kind === 'list') { fm[key] = collectedList.join(', '); i = j - 1; continue; }
      if (kind === 'section') { Object.assign(fm, collectedSection); i = j - 1; continue; }
      fm[key] = '';
      continue;
    }
    fm[key] = stripQuotes(value);
  }

  const body = lines.slice(close + 1).join('\n');
  return { frontmatter: fm, body };
}
