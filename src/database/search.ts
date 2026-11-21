import type * as SQLite from 'expo-sqlite';

export type SearchKind = 'entry' | 'page' | 'task' | 'word' | 'notebook';
export interface SearchResult { kind: SearchKind; id: string; title: string; subtitle: string; date?: string; notebookId?: string }

type IndexedRow = { kind: SearchKind; id: string; notebook_id: string | null; title: string; body: string; date: string | null };

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, '\\$&');
}

function shortQueryVariants(query: string): string[] {
  const characters = Array.from(query);
  if (characters.length > 6) return [...new Set([query, query.toLowerCase(), query.toUpperCase()])];
  let variants = [''];
  for (const character of characters) {
    const choices = [...new Set([character, character.toLowerCase(), character.toUpperCase()])];
    variants = variants.flatMap((prefix) => choices.map((choice) => prefix + choice)).slice(0, 128);
  }
  return [...new Set(variants)];
}

function contextAround(text: string, query: string): string {
  const normalizedText = text.normalize('NFKC').toLowerCase();
  const normalizedQuery = query.normalize('NFKC').toLowerCase();
  const index = normalizedText.indexOf(normalizedQuery);
  if (index < 0) return Array.from(text).slice(0, 104).join('');
  const start = Math.max(0, index - 38);
  const excerpt = Array.from(text).slice(start, index + Array.from(query).length + 62).join('');
  return `${start > 0 ? '…' : ''}${excerpt}${start + Array.from(excerpt).length < Array.from(text).length ? '…' : ''}`;
}

function toResult(row: IndexedRow, query: string): SearchResult {
  const title = row.title || row.date || row.body || 'Атаусыз жазба';
  const subtitle = row.kind === 'task' ? (row.date ?? '')
    : row.kind === 'notebook' ? row.body
      : contextAround(row.body, query);
  return {
    kind: row.kind,
    id: row.id,
    title,
    subtitle,
    ...(row.date ? { date: row.date } : {}),
    ...(row.notebook_id ? { notebookId: row.notebook_id } : row.kind === 'notebook' ? { notebookId: row.id } : {})
  };
}

async function searchWithTrigram(db: SQLite.SQLiteDatabase, query: string): Promise<IndexedRow[]> {
  const match = `"${query.replaceAll('"', '""')}"`;
  const queries = [
    db.getAllAsync<IndexedRow>(`SELECT 'entry' AS kind,e.id,e.notebook_id,e.title,e.content AS body,e.entry_date AS date
      FROM content_substring_fts f JOIN entries e ON e.id=f.object_id JOIN notebooks n ON n.id=e.notebook_id
      WHERE f.kind='entry' AND content_substring_fts MATCH ? AND n.type='journal' ORDER BY e.entry_date DESC LIMIT 30`, match),
    db.getAllAsync<IndexedRow>(`SELECT 'page' AS kind,p.id,p.notebook_id,p.title,p.content AS body,NULL AS date
      FROM content_substring_fts f JOIN notebook_pages p ON p.id=f.object_id
      WHERE f.kind='page' AND content_substring_fts MATCH ? ORDER BY p.updated_at DESC LIMIT 30`, match),
    db.getAllAsync<IndexedRow>(`SELECT 'task' AS kind,t.id,t.notebook_id,t.title,'' AS body,t.task_date AS date
      FROM content_substring_fts f JOIN tasks t ON t.id=f.object_id
      WHERE f.kind='task' AND content_substring_fts MATCH ? ORDER BY t.task_date DESC LIMIT 20`, match),
    db.getAllAsync<IndexedRow>(`SELECT 'word' AS kind,w.id,ve.notebook_id,w.source AS title,
        COALESCE((SELECT group_concat(value,' · ') FROM vocabulary_translations WHERE entry_id=w.id),w.translation) AS body,NULL AS date
      FROM content_substring_fts f JOIN vocabulary_words w ON w.id=f.object_id LEFT JOIN vocabulary_entries ve ON ve.id=w.id
      WHERE f.kind='word' AND content_substring_fts MATCH ? LIMIT 30`, match),
    db.getAllAsync<IndexedRow>(`SELECT 'notebook' AS kind,n.id,n.id AS notebook_id,n.title,'' AS body,NULL AS date
      FROM content_substring_fts f JOIN notebooks n ON n.id=f.object_id
      WHERE f.kind='notebook' AND content_substring_fts MATCH ? LIMIT 20`, match)
  ];
  return (await Promise.all(queries)).flat();
}

async function searchWithLike(db: SQLite.SQLiteDatabase, query: string): Promise<IndexedRow[]> {
  const variants = shortQueryVariants(query);
  const condition = (columns: string[]) => {
    const clauses = variants.flatMap(() => columns.map((column) => `${column} LIKE ? ESCAPE char(92)`)).join(' OR ');
    const params = variants.flatMap((variant) => columns.map(() => `%${escapeLike(variant)}%`));
    return { sql: `(${clauses})`, params };
  };
  const entry = condition(['e.title', 'e.content']);
  const page = condition(['p.title', 'p.content']);
  const task = condition(['t.title', 't.task_date']);
  const word = condition(['w.source', 'w.translation', 'COALESCE(vt.value,\'\')']);
  const notebook = condition(['n.title']);
  const results = await Promise.all([
    db.getAllAsync<IndexedRow>(`SELECT 'entry' AS kind,e.id,e.notebook_id,e.title,e.content AS body,e.entry_date AS date FROM entries e JOIN notebooks n ON n.id=e.notebook_id WHERE n.type='journal' AND ${entry.sql} ORDER BY e.entry_date DESC LIMIT 30`, ...entry.params),
    db.getAllAsync<IndexedRow>(`SELECT 'page' AS kind,p.id,p.notebook_id,p.title,p.content AS body,NULL AS date FROM notebook_pages p WHERE ${page.sql} ORDER BY p.updated_at DESC LIMIT 30`, ...page.params),
    db.getAllAsync<IndexedRow>(`SELECT 'task' AS kind,t.id,t.notebook_id,t.title,'' AS body,t.task_date AS date FROM tasks t WHERE ${task.sql} ORDER BY t.task_date DESC LIMIT 20`, ...task.params),
    db.getAllAsync<IndexedRow>(`SELECT DISTINCT 'word' AS kind,w.id,ve.notebook_id,w.source AS title,
        COALESCE((SELECT group_concat(value,' · ') FROM vocabulary_translations WHERE entry_id=w.id),w.translation) AS body,NULL AS date
      FROM vocabulary_words w LEFT JOIN vocabulary_entries ve ON ve.id=w.id LEFT JOIN vocabulary_translations vt ON vt.entry_id=w.id WHERE ${word.sql} LIMIT 30`, ...word.params),
    db.getAllAsync<IndexedRow>(`SELECT 'notebook' AS kind,n.id,n.id AS notebook_id,n.title,'' AS body,NULL AS date FROM notebooks n WHERE ${notebook.sql} LIMIT 20`, ...notebook.params)
  ]);
  return results.flat();
}

export async function searchAll(db: SQLite.SQLiteDatabase, query: string): Promise<SearchResult[]> {
  const normalized = query.normalize('NFKC').trim();
  if (!normalized) return [];
  let rows: IndexedRow[];
  const codePoints = Array.from(normalized).length;
  const substringAvailable = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key='substring_fts_available'");
  if (substringAvailable?.value === 'true' && codePoints >= 3) {
    try {
      rows = await searchWithTrigram(db, normalized);
      if (!rows.length) rows = await searchWithLike(db, normalized);
    } catch {
      rows = await searchWithLike(db, normalized);
    }
  } else {
    rows = await searchWithLike(db, normalized);
  }
  const unique = new Map<string, SearchResult>();
  for (const row of rows) unique.set(`${row.kind}:${row.id}`, toResult(row, normalized));
  return [...unique.values()];
}
