import type * as SQLite from 'expo-sqlite';

export interface SearchResult {
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  date?: string;
  notebookId?: string;
}

export async function searchAll(db: SQLite.SQLiteDatabase, query: string): Promise<SearchResult[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  const pattern = `%${normalized}%`;
  const ftsEnabled = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key='fts5_available'");
  if (ftsEnabled?.value === 'true') {
    try {
      const phrase = `"${normalized.replaceAll('"', '""')}"`;
      const hits = await db.getAllAsync<{ kind: string; object_id: string; title: string; body: string; event_date: string; notebook_id: string }>('SELECT kind,object_id,title,body,event_date,notebook_id FROM content_fts WHERE content_fts MATCH ? ORDER BY rank LIMIT 60', phrase);
      return hits.map((row) => ({ kind: row.kind === 'entry' ? 'Жазба' : row.kind === 'task' ? 'Жоспар' : row.kind === 'word' ? 'Сөздік' : 'Дәптер', id: row.object_id, title: row.title || row.event_date || row.body, subtitle: row.kind === 'entry' ? row.body.slice(0, 92) : row.kind === 'task' ? row.event_date : row.body, ...(row.event_date ? { date: row.event_date } : {}), ...(row.notebook_id ? { notebookId: row.notebook_id } : {}) }));
    } catch { /* Fall through to the indexed SQL fallback. */ }
  }
  const [notes, tasks, words, notebooks] = await Promise.all([
    db.getAllAsync<{ id: string; notebook_id: string; title: string; content: string; entry_date: string }>('SELECT id,notebook_id,title,content,entry_date FROM entries WHERE title LIKE ? OR content LIKE ? ORDER BY entry_date DESC LIMIT 30', pattern, pattern),
    db.getAllAsync<{ id: string; title: string; task_date: string }>('SELECT id,title,task_date FROM tasks WHERE title LIKE ? ORDER BY task_date DESC LIMIT 20', pattern),
    db.getAllAsync<{ id: string; source: string; translation: string }>('SELECT id,source,translation FROM vocabulary_words WHERE source LIKE ? OR translation LIKE ? LIMIT 20', pattern, pattern),
    db.getAllAsync<{ id: string; title: string; theme_id: string }>('SELECT id,title,theme_id FROM notebooks WHERE title LIKE ? LIMIT 20', pattern)
  ]);
  return [
    ...notes.map((row) => ({ kind: 'Жазба', id: row.id, title: row.title || row.entry_date, subtitle: row.content.slice(0, 92), date: row.entry_date, notebookId: row.notebook_id })),
    ...tasks.map((row) => ({ kind: 'Жоспар', id: row.id, title: row.title, subtitle: row.task_date, date: row.task_date })),
    ...words.map((row) => ({ kind: 'Сөздік', id: row.id, title: row.source, subtitle: row.translation })),
    ...notebooks.map((row) => ({ kind: 'Дәптер', id: row.id, title: row.title, subtitle: row.theme_id }))
  ];
}
