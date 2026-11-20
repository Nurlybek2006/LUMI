import type * as SQLite from 'expo-sqlite';

export type SearchKind = 'entry' | 'page' | 'task' | 'word' | 'notebook';
export interface SearchResult { kind: SearchKind; id: string; title: string; subtitle: string; date?: string; notebookId?: string }

export async function searchAll(db: SQLite.SQLiteDatabase, query: string): Promise<SearchResult[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  const pattern = `%${normalized}%`;
  const ftsEnabled = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key='fts5_available'");
  if (ftsEnabled?.value === 'true') {
    try {
      const phrase = `"${normalized.replaceAll('"', '""')}"`;
      const hits = await db.getAllAsync<{ kind: SearchKind; object_id: string; title: string; body: string; event_date: string; notebook_id: string }>(`SELECT kind,object_id,title,body,event_date,notebook_id FROM content_fts
        WHERE content_fts MATCH ? AND (kind<>'entry' OR EXISTS(SELECT 1 FROM notebooks n WHERE n.id=content_fts.notebook_id AND n.type='journal')) ORDER BY rank LIMIT 60`, phrase);
      return hits.map((row) => ({ kind: row.kind, id: row.object_id, title: row.title || row.event_date || row.body, subtitle: row.kind === 'entry' || row.kind === 'page' ? row.body.slice(0, 92) : row.kind === 'task' ? row.event_date : row.body, ...(row.event_date ? { date: row.event_date } : {}), ...(row.notebook_id ? { notebookId: row.notebook_id } : {}) }));
    } catch { /* Индекс қолжетімсіз болса, SQL іздеуін қолданамыз. */ }
  }
  const [entries, pages, tasks, words, notebooks] = await Promise.all([
    db.getAllAsync<{ id: string; notebook_id: string; title: string; content: string; entry_date: string }>(`SELECT e.id,e.notebook_id,e.title,e.content,e.entry_date FROM entries e JOIN notebooks n ON n.id=e.notebook_id
      WHERE n.type='journal' AND (e.title LIKE ? OR e.content LIKE ?) ORDER BY e.entry_date DESC LIMIT 30`, pattern, pattern),
    db.getAllAsync<{ id: string; notebook_id: string; title: string; content: string }>('SELECT id,notebook_id,title,content FROM notebook_pages WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC LIMIT 30', pattern, pattern),
    db.getAllAsync<{ id: string; title: string; task_date: string; notebook_id: string | null }>('SELECT id,title,task_date,notebook_id FROM tasks WHERE title LIKE ? ORDER BY task_date DESC LIMIT 20', pattern),
    db.getAllAsync<{ id: string; source: string; translation: string; notebook_id: string | null }>(`SELECT DISTINCT w.id,w.source,w.translation,ve.notebook_id FROM vocabulary_words w LEFT JOIN vocabulary_entries ve ON ve.id=w.id LEFT JOIN vocabulary_translations vt ON vt.entry_id=w.id WHERE w.source LIKE ? OR w.translation LIKE ? OR vt.value LIKE ? LIMIT 20`, pattern, pattern, pattern),
    db.getAllAsync<{ id: string; title: string; theme_id: string }>('SELECT id,title,theme_id FROM notebooks WHERE title LIKE ? LIMIT 20', pattern)
  ]);
  return [
    ...entries.map((row): SearchResult => ({ kind: 'entry', id: row.id, title: row.title || row.entry_date, subtitle: row.content.slice(0, 92), date: row.entry_date, notebookId: row.notebook_id })),
    ...pages.map((row): SearchResult => ({ kind: 'page', id: row.id, title: row.title || 'Атаусыз бет', subtitle: row.content.slice(0, 92), notebookId: row.notebook_id })),
    ...tasks.map((row): SearchResult => ({ kind: 'task', id: row.id, title: row.title, subtitle: row.task_date, date: row.task_date, ...(row.notebook_id ? { notebookId: row.notebook_id } : {}) })),
    ...words.map((row): SearchResult => ({ kind: 'word', id: row.id, title: row.source, subtitle: row.translation, ...(row.notebook_id ? { notebookId: row.notebook_id } : {}) })),
    ...notebooks.map((row): SearchResult => ({ kind: 'notebook', id: row.id, title: row.title, subtitle: row.theme_id }))
  ];
}
