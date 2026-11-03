import { describe, expect, it } from 'vitest';
import { changedSections, lineChanges, lineDiffStats } from './diff';

const lines = (...xs: string[]) => xs.join('\n');

describe('lineChanges', () => {
  it('marks nothing when the texts match', () => {
    expect(lineChanges(lines('a', 'b'), lines('a', 'b'))).toEqual({ added: [], modified: [], removedAbove: [] });
  });

  it('marks an edited line as modified', () => {
    expect(lineChanges(lines('a', 'b', 'c'), lines('a', 'B', 'c'))).toEqual({ added: [], modified: [2], removedAbove: [] });
  });

  it('marks inserted lines as added', () => {
    expect(lineChanges(lines('a', 'c'), lines('a', 'b1', 'b2', 'c'))).toEqual({ added: [2, 3], modified: [], removedAbove: [] });
  });

  it('marks the line below a removal', () => {
    expect(lineChanges(lines('a', 'b', 'c'), lines('a', 'c'))).toEqual({ added: [], modified: [], removedAbove: [2] });
  });

  it('splits a one-for-two replacement into modified then added', () => {
    expect(lineChanges(lines('a', 'b', 'c'), lines('a', 'x', 'y', 'c'))).toEqual({ added: [3], modified: [2], removedAbove: [] });
  });

  it('clamps a removal at the end onto the last line', () => {
    expect(lineChanges(lines('a', 'b'), lines('a'))).toEqual({ added: [], modified: [], removedAbove: [1] });
  });
});

describe('lineDiffStats and changedSections', () => {
  it('counts lines and ignores key order', () => {
    expect(lineDiffStats(lines('a', 'b'), lines('a', 'c', 'd'))).toEqual({ added: 2, removed: 1 });
    expect(changedSections({ a: { x: 1, y: 2 }, b: 1 }, { a: { y: 2, x: 1 }, b: 2 })).toEqual(['b']);
  });
});
