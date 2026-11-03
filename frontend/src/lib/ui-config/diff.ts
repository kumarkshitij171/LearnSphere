// Pure helpers for the UI-config editor: gutter marks, the review sheet and version history.

/** Lines added and removed between two texts (LCS over lines; documents are capped at 64 KB). */
export function lineDiffStats(before: string, after: string): { added: number; removed: number } {
  const a = before.split('\n');
  const b = after.split('\n');
  // trim the shared head and tail so the quadratic part only sees what changed
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const prev = new Array<number>(midB.length + 1).fill(0);
  for (let i = 1; i <= midA.length; i++) {
    let diagonal = 0;
    for (let j = 1; j <= midB.length; j++) {
      const above = prev[j];
      prev[j] = midA[i - 1] === midB[j - 1] ? diagonal + 1 : Math.max(prev[j], prev[j - 1]);
      diagonal = above;
    }
  }
  const common = prev[midB.length];
  return { added: midB.length - common, removed: midA.length - common };
}

export interface LineChanges {
  /** 1-based lines of `after` that are new */
  added: number[];
  /** 1-based lines of `after` that replace lines of `before` */
  modified: number[];
  /** 1-based lines of `after` that have removed lines directly above them */
  removedAbove: number[];
}

// Beyond this many cells the LCS table is not worth building; the whole middle is marked modified.
const MAX_LCS_CELLS = 4_000_000;

/** Which lines of `after` differ from `before`, for VS Code-style gutter marks. */
export function lineChanges(before: string, after: string): LineChanges {
  const a = before.split('\n');
  const b = after.split('\n');
  const result: LineChanges = { added: [], modified: [], removedAbove: [] };
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const n = endA - start;
  const m = endB - start;
  if (n === 0 && m === 0) return result;
  if (n * m > MAX_LCS_CELLS) {
    for (let j = 0; j < m; j++) result.modified.push(start + j + 1);
    return result;
  }

  // suffix LCS lengths, so the walk below can go forwards
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[start + i] === b[start + j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  let removed = 0;
  let inserted: number[] = [];
  const flush = (nextLine: number) => {
    if (inserted.length) {
      inserted.forEach((line, k) => (k < removed ? result.modified : result.added).push(line));
    } else if (removed) {
      result.removedAbove.push(Math.max(1, Math.min(b.length, nextLine)));
    }
    removed = 0;
    inserted = [];
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) {
      flush(start + j + 1);
      i++;
      j++;
    } else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) {
      removed++;
      i++;
    } else {
      inserted.push(start + j + 1);
      j++;
    }
  }
  flush(start + m + 1);
  return result;
}

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

/** Top-level settings whose value differs, ignoring key order: "branding", "navigation", … */
export function changedSections(before: unknown, after: unknown): string[] {
  const a = (before ?? {}) as Record<string, unknown>;
  const b = (after ?? {}) as Record<string, unknown>;
  return Array.from(new Set([...Object.keys(a), ...Object.keys(b)]))
    .filter((key) => stable(a[key]) !== stable(b[key]))
    .sort();
}

/**
 * Where a JSON pointer (/navigation/sidebar/3/href) sits in pretty-printed or hand-edited JSON
 * text, as a 1-based line and column, so a server-reported problem can move the cursor. Returns
 * the closest existing ancestor when the exact path is absent (a missing required key).
 */
export function locatePointer(text: string, pointer: string): { line: number; column: number } {
  const target = pointer.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  const found = new Map<string, number>();
  const stack: Array<{ kind: 'object' | 'array'; index: number; key: string | null }> = [];
  const path = () =>
    stack.map((frame) => (frame.kind === 'array' ? String(frame.index) : frame.key ?? '')).join('/');

  let i = 0;
  let expectingKey = false;
  found.set('', 0);
  // object members are located at their key; array items at the first character of the value
  const markValueStart = () => {
    const top = stack[stack.length - 1];
    if (!top) return;
    if (top.kind === 'array' || !found.has(path())) found.set(path(), i);
  };

  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      let value = '';
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') {
          value += text[j + 1] ?? '';
          j += 2;
        } else {
          value += text[j++];
        }
      }
      const top = stack[stack.length - 1];
      if (top?.kind === 'object' && expectingKey) {
        top.key = value;
        found.set(path(), i);
        expectingKey = false;
      } else {
        markValueStart();
      }
      i = j + 1;
      continue;
    }
    if (ch === '{' || ch === '[') {
      markValueStart();
      stack.push({ kind: ch === '{' ? 'object' : 'array', index: 0, key: null });
      expectingKey = ch === '{';
    } else if (ch === '}' || ch === ']') {
      stack.pop();
      expectingKey = false;
    } else if (ch === ',') {
      const top = stack[stack.length - 1];
      if (top?.kind === 'array') {
        top.index++;
      } else if (top) {
        expectingKey = true;
      }
    } else if (!/\s|:/.test(ch)) {
      markValueStart();
      while (i + 1 < text.length && !/[\s,\]}]/.test(text[i + 1])) i++;
    }
    i++;
  }

  let offset = 0;
  for (let depth = target.length; depth >= 0; depth--) {
    const key = target.slice(0, depth).join('/');
    if (found.has(key)) {
      offset = found.get(key)!;
      break;
    }
  }
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  const column = offset - before.lastIndexOf('\n');
  return { line, column };
}
