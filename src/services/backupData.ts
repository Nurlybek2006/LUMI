export const backupTableNames = ['notebooks', 'entries', 'entry_blocks', 'media_assets', 'notebook_pages', 'notebook_page_media', 'tasks', 'vocabulary_words', 'vocabulary_entries', 'vocabulary_translations', 'vocabulary_notebook_languages', 'vocabulary_reviews', 'app_settings', 'activity_events'] as const;
export type BackupTableName = (typeof backupTableNames)[number];
export type BackupData = { schemaVersion: 2; tables: Record<BackupTableName, Record<string, unknown>[]> };

const allowedColumns: Record<BackupTableName, string[]> = {
  notebooks: ['id', 'title', 'type', 'icon', 'theme_id', 'sort_order', 'created_at', 'updated_at'],
  entries: ['id', 'notebook_id', 'entry_date', 'title', 'content', 'blocks_json', 'mood', 'tags_json', 'created_at', 'updated_at'],
  entry_blocks: ['id', 'entry_id', 'block_order', 'block_type', 'payload_json'],
  media_assets: ['id', 'entry_id', 'relative_path', 'mime_type', 'created_at'],
  notebook_pages: ['id', 'notebook_id', 'title', 'content', 'blocks_json', 'sort_order', 'created_at', 'updated_at'],
  notebook_page_media: ['page_id', 'relative_path'],
  tasks: ['id', 'notebook_id', 'task_date', 'title', 'priority', 'due_time', 'completed', 'sort_order', 'created_at'],
  vocabulary_words: ['id', 'source', 'translation', 'source_language', 'target_language', 'example', 'example_translation', 'notes', 'favorite', 'learned', 'repetitions', 'next_review', 'created_at'],
  vocabulary_entries: ['id', 'notebook_id', 'example', 'example_translation', 'notes', 'tags_json', 'favorite', 'learned', 'repetitions', 'next_review', 'created_at', 'updated_at'],
  vocabulary_translations: ['id', 'entry_id', 'language_code', 'value', 'display_order'],
  vocabulary_notebook_languages: ['notebook_id', 'language_code', 'display_order'],
  vocabulary_reviews: ['id', 'word_id', 'reviewed_at', 'remembered', 'repetition', 'next_review'],
  app_settings: ['key', 'value'],
  activity_events: ['id', 'event_type', 'event_date', 'reference_id', 'created_at']
};

export interface BackupDatabase {
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<unknown>;
  getAllAsync<T>(sql: string): Promise<T[]>;
}

const array = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value as Record<string, unknown>[] : [];
export function normalizeBackupData(value: unknown): BackupData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!input.tables || typeof input.tables !== 'object' || Array.isArray(input.tables)) return null;
  const source = input.tables as Record<string, unknown>;
  const tables = Object.fromEntries(backupTableNames.map((name) => [name, array(source[name])])) as BackupData['tables'];
  for (const notebook of tables.notebooks) {
    if (typeof notebook.type !== 'string') notebook.type = notebook.id === 'diary' ? 'journal' : notebook.id === 'plans' ? 'planner' : notebook.id === 'vocabulary' ? 'vocabulary' : 'general';
  }
  for (const task of tables.tasks) if (!Object.hasOwn(task, 'notebook_id')) task.notebook_id = null;
  for (const entry of tables.vocabulary_entries) if (!Object.hasOwn(entry, 'tags_json')) entry.tags_json = '[]';
  return { schemaVersion: 2, tables };
}

export function validateBackupData(value: unknown): value is BackupData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1 && data.schemaVersion !== 2) return false;
  if (!data.tables || typeof data.tables !== 'object' || Array.isArray(data.tables)) return false;
  const rawTables = data.tables as Record<string, unknown>;
  const requiredTables: readonly BackupTableName[] = data.schemaVersion === 2 ? backupTableNames : ['notebooks', 'entries', 'entry_blocks', 'media_assets', 'tasks', 'vocabulary_words', 'vocabulary_reviews', 'app_settings', 'activity_events'];
  if (requiredTables.some((name) => !Array.isArray(rawTables[name]))) return false;
  if (Object.values(rawTables).some((value) => Array.isArray(value) && value.some((row) => !row || typeof row !== 'object' || Array.isArray(row)))) return false;
  const normalized = normalizeBackupData(data);
  if (!normalized) return false;
  const rows = normalized.tables;
  const text = (row: Record<string, unknown>, key: string) => typeof row[key] === 'string';
  const number = (row: Record<string, unknown>, key: string) => typeof row[key] === 'number' && Number.isFinite(row[key]);
  const nullableText = (row: Record<string, unknown>, key: string) => row[key] === null || text(row, key);
  const unique = (name: BackupTableName, key: string) => { const values = rows[name].map((row) => row[key]); return values.every((value) => typeof value === 'string' && value.length > 0) && new Set(values).size === values.length; };
  const uniquePair = (name: BackupTableName, a: string, b: string) => { const values = rows[name].map((row) => `${String(row[a])}\0${String(row[b])}`); return new Set(values).size === values.length; };
  for (const name of ['notebooks', 'entries', 'entry_blocks', 'media_assets', 'notebook_pages', 'tasks', 'vocabulary_words', 'vocabulary_entries', 'vocabulary_translations', 'vocabulary_reviews', 'activity_events'] as const) if (!unique(name, 'id')) return false;
  if (!unique('app_settings', 'key') || !uniquePair('notebook_page_media', 'page_id', 'relative_path') || !uniquePair('vocabulary_notebook_languages', 'notebook_id', 'language_code') || !uniquePair('vocabulary_translations', 'entry_id', 'language_code')) return false;
  if (!rows.notebooks.every((row) => ['id', 'title', 'icon', 'theme_id', 'created_at', 'updated_at'].every((key) => text(row, key)) && ['general', 'journal', 'vocabulary', 'planner'].includes(String(row.type)))) return false;
  const checkBlocks = (value: unknown) => {
    try { const blocks: unknown = JSON.parse(String(value)); return Array.isArray(blocks) && blocks.every((block) => !!block && typeof block === 'object' && typeof (block as Record<string, unknown>).id === 'string' && typeof (block as Record<string, unknown>).type === 'string'); }
    catch { return false; }
  };
  if (!rows.entries.every((row) => ['id', 'notebook_id', 'entry_date', 'title', 'content', 'blocks_json', 'tags_json', 'created_at', 'updated_at'].every((key) => text(row, key)) && nullableText(row, 'mood') && checkBlocks(row.blocks_json) && (() => { try { const tags: unknown = JSON.parse(String(row.tags_json)); return Array.isArray(tags) && tags.every((tag) => typeof tag === 'string'); } catch { return false; } })())) return false;
  if (!rows.entry_blocks.every((row) => ['id', 'entry_id', 'block_type', 'payload_json'].every((key) => text(row, key)) && number(row, 'block_order'))) return false;
  if (!rows.media_assets.every((row) => ['id', 'relative_path', 'mime_type', 'created_at'].every((key) => text(row, key)) && nullableText(row, 'entry_id'))) return false;
  if (!rows.notebook_pages.every((row) => ['id', 'notebook_id', 'title', 'content', 'blocks_json', 'created_at', 'updated_at'].every((key) => text(row, key)) && number(row, 'sort_order') && checkBlocks(row.blocks_json))) return false;
  if (!rows.notebook_page_media.every((row) => text(row, 'page_id') && text(row, 'relative_path'))) return false;
  if (!rows.tasks.every((row) => ['id', 'task_date', 'title', 'created_at'].every((key) => text(row, key)) && nullableText(row, 'notebook_id') && ['priority', 'completed', 'sort_order'].every((key) => number(row, key)) && nullableText(row, 'due_time'))) return false;
  if (!rows.vocabulary_words.every((row) => ['id', 'source', 'translation', 'source_language', 'target_language', 'example', 'example_translation', 'notes', 'next_review', 'created_at'].every((key) => text(row, key)) && ['favorite', 'learned', 'repetitions'].every((key) => number(row, key)))) return false;
  if (!rows.vocabulary_entries.every((row) => text(row, 'id') && nullableText(row, 'notebook_id') && ['example', 'example_translation', 'notes', 'tags_json', 'next_review', 'created_at', 'updated_at'].every((key) => text(row, key)) && (() => { try { const tags: unknown = JSON.parse(String(row.tags_json)); return Array.isArray(tags) && tags.every((tag) => typeof tag === 'string'); } catch { return false; } })() && ['favorite', 'learned', 'repetitions'].every((key) => number(row, key)))) return false;
  if (!rows.vocabulary_translations.every((row) => ['id', 'entry_id', 'language_code', 'value'].every((key) => text(row, key)) && number(row, 'display_order'))) return false;
  if (!rows.vocabulary_notebook_languages.every((row) => text(row, 'notebook_id') && text(row, 'language_code') && number(row, 'display_order'))) return false;
  if (!rows.vocabulary_reviews.every((row) => ['id', 'word_id', 'reviewed_at', 'next_review'].every((key) => text(row, key)) && ['remembered', 'repetition'].every((key) => number(row, key)))) return false;
  if (!rows.app_settings.every((row) => text(row, 'key') && text(row, 'value'))) return false;
  if (!rows.activity_events.every((row) => ['id', 'event_type', 'event_date', 'created_at'].every((key) => text(row, key)) && nullableText(row, 'reference_id'))) return false;

  const notebookIds = new Set(rows.notebooks.map((row) => row.id)); const entryIds = new Set(rows.entries.map((row) => row.id));
  const pageIds = new Set(rows.notebook_pages.map((row) => row.id)); const wordIds = new Set(rows.vocabulary_words.map((row) => row.id)); const vocabIds = new Set(rows.vocabulary_entries.map((row) => row.id));
  if (!rows.entries.every((row) => notebookIds.has(row.notebook_id)) || !rows.entry_blocks.every((row) => entryIds.has(row.entry_id)) || !rows.media_assets.every((row) => row.entry_id === null || entryIds.has(row.entry_id))) return false;
  if (!rows.notebook_pages.every((row) => notebookIds.has(row.notebook_id)) || !rows.notebook_page_media.every((row) => pageIds.has(row.page_id)) || !rows.tasks.every((row) => row.notebook_id === null || notebookIds.has(row.notebook_id))) return false;
  if (!rows.vocabulary_entries.every((row) => row.notebook_id === null || notebookIds.has(row.notebook_id)) || !rows.vocabulary_translations.every((row) => vocabIds.has(row.entry_id)) || !rows.vocabulary_notebook_languages.every((row) => notebookIds.has(row.notebook_id))) return false;
  return rows.vocabulary_reviews.every((row) => wordIds.has(row.word_id));
}

export async function replaceBackupTables(db: BackupDatabase, input: BackupData): Promise<void> {
  if (!validateBackupData(input)) throw new Error('Backup database data is invalid.');
  const data = normalizeBackupData(input);
  if (!data) throw new Error('Backup database data is invalid.');
  await db.withTransactionAsync(async () => {
    await db.execAsync('PRAGMA defer_foreign_keys = ON; DELETE FROM notebook_page_media; DELETE FROM notebook_pages; DELETE FROM entry_blocks; DELETE FROM media_assets; DELETE FROM entries; DELETE FROM tasks; DELETE FROM vocabulary_translations; DELETE FROM vocabulary_notebook_languages; DELETE FROM vocabulary_entries; DELETE FROM vocabulary_reviews; DELETE FROM vocabulary_words; DELETE FROM activity_events; DELETE FROM notebooks; DELETE FROM app_settings;');
    for (const table of backupTableNames) for (const row of data.tables[table]) {
      const columns = allowedColumns[table].filter((column) => Object.hasOwn(row, column));
      if (!columns.length) continue;
      await db.runAsync(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...columns.map((column) => row[column] as string | number | null));
    }
    await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('defaults_seeded','true')");
    await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('onboarding_complete','true')");
    try {
      await db.execAsync(`DELETE FROM content_fts;
        INSERT INTO content_fts SELECT 'entry',id,title,content,entry_date,notebook_id FROM entries;
        INSERT INTO content_fts SELECT 'page',id,title,content,'',notebook_id FROM notebook_pages;
        INSERT INTO content_fts SELECT 'task',id,title,'',task_date,COALESCE(notebook_id,'') FROM tasks;
        INSERT INTO content_fts SELECT 'word',w.id,w.source,COALESCE((SELECT group_concat(value,' ') FROM vocabulary_translations WHERE entry_id=w.id),w.translation),'',COALESCE((SELECT notebook_id FROM vocabulary_entries WHERE id=w.id),'') FROM vocabulary_words w;
        INSERT INTO content_fts SELECT 'notebook',id,title,'','','' FROM notebooks;`);
      await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('fts5_initialized','true')");
      await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('fts5_refactor_initialized','true')");
      await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('fts5_available','true')");
    } catch {
      await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('fts5_available','false')");
    }
    const violations = await db.getAllAsync<{ table: string }>('PRAGMA foreign_key_check');
    if (violations.length) throw new Error('Restored data has invalid relationships.');
  });
}
