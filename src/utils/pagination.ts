import type { Entry, EntryBlock, ThemeId } from '@/types/models';

export interface RenderedBookPage { entry: Entry; blocks: EntryBlock[]; segment: number; segmentCount: number }

const breakLines = (value: string, lineLength: number): string[] => {
  const words = value.split(/\s+/u).filter(Boolean);
  const lines: string[] = []; let current = '';
  for (const word of words) {
    if (!current) current = word;
    else if (current.length + word.length + 1 <= lineLength) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
};

export function paginateEntry(entry: Entry, width: number, height: number, themeId: ThemeId, fontScale = 1): RenderedBookPage[] {
  const font = themeId === 'midnight' ? 17 : 18;
  const lineLength = Math.max(16, Math.floor(width / (font * 0.55 * fontScale)));
  const linesPerPage = Math.max(6, Math.floor((height - 185) / (font * 1.65 * fontScale)));
  const result: EntryBlock[][] = []; let page: EntryBlock[] = []; let used = entry.title ? 2 : 0;
  const flush = () => { if (page.length) result.push(page); page = []; used = 0; };

  for (const block of entry.blocks) {
    if (block.type === 'image') {
      if (used > 0) flush();
      page.push(block); flush();
      continue;
    }
    const text = block.text ?? '';
    const multiplier = block.type === 'heading' ? 1.4 : block.type === 'code' ? 0.95 : 1;
    const lines = breakLines(text, Math.max(12, Math.floor(lineLength / multiplier)));
    if (!lines.length) { if (used < linesPerPage) page.push(block); continue; }
    let offset = 0;
    while (offset < lines.length) {
      if (used >= linesPerPage) flush();
      const available = Math.max(1, linesPerPage - used);
      const slice = lines.slice(offset, offset + available);
      page.push({ ...block, text: slice.join('\n') });
      used += slice.length + 1;
      offset += slice.length;
      if (offset < lines.length) flush();
    }
  }
  flush();
  if (!result.length) result.push([]);
  return result.map((blocks, segment) => ({ entry, blocks, segment, segmentCount: result.length }));
}
