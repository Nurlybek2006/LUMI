export const backupTableNames = ['notebooks', 'entries', 'entry_blocks', 'media_assets', 'tasks', 'vocabulary_words', 'vocabulary_reviews', 'app_settings', 'activity_events'] as const;
export type BackupTableName = (typeof backupTableNames)[number];
export type BackupData = { schemaVersion: 1; tables: Record<BackupTableName, Record<string, unknown>[]> };

const allowedColumns: Record<BackupTableName, string[]> = {
  notebooks: ['id', 'title', 'icon', 'theme_id', 'sort_order', 'created_at', 'updated_at'],
  entries: ['id', 'notebook_id', 'entry_date', 'title', 'content', 'blocks_json', 'mood', 'tags_json', 'created_at', 'updated_at'],
  entry_blocks: ['id', 'entry_id', 'block_order', 'block_type', 'payload_json'],
  media_assets: ['id', 'entry_id', 'relative_path', 'mime_type', 'created_at'],
  tasks: ['id', 'task_date', 'title', 'priority', 'due_time', 'completed', 'sort_order', 'created_at'],
  vocabulary_words: ['id', 'source', 'translation', 'source_language', 'target_language', 'example', 'example_translation', 'notes', 'favorite', 'learned', 'repetitions', 'next_review', 'created_at'],
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

export function validateBackupData(value: unknown): value is BackupData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1 || !data.tables || typeof data.tables !== 'object') return false;
  const tables = data.tables as Record<string, unknown>;
  if (!backupTableNames.every((name) => Array.isArray(tables[name]) && (tables[name] as unknown[]).every((row) => !!row && typeof row === 'object' && !Array.isArray(row)))) return false;

  const rows = tables as unknown as Record<BackupTableName, Record<string, unknown>[]>;
  const text = (row: Record<string, unknown>, key: string) => typeof row[key] === 'string';
  const number = (row: Record<string, unknown>, key: string) => typeof row[key] === 'number' && Number.isFinite(row[key]);
  const uniqueIds = (name: 'notebooks' | 'entries' | 'entry_blocks' | 'media_assets' | 'tasks' | 'vocabulary_words' | 'vocabulary_reviews' | 'activity_events') => {
    const ids = rows[name].map((row) => row.id);
    return ids.every((id) => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length;
  };
  for (const name of ['notebooks', 'entries', 'entry_blocks', 'media_assets', 'tasks', 'vocabulary_words', 'vocabulary_reviews', 'activity_events'] as const) if (!uniqueIds(name)) return false;
  if (!rows.notebooks.every((row) => ['id', 'title', 'icon', 'theme_id', 'created_at', 'updated_at'].every((key) => text(row, key)))) return false;
  if (!rows.entries.every((row) => {
    if (!['id', 'notebook_id', 'entry_date', 'title', 'content', 'blocks_json', 'tags_json', 'created_at', 'updated_at'].every((key) => text(row, key))) return false;
    try {
      const blocks: unknown = JSON.parse(String(row.blocks_json));
      const tags: unknown = JSON.parse(String(row.tags_json));
      return Array.isArray(blocks) && Array.isArray(tags) && tags.every((tag) => typeof tag === 'string') && blocks.every((block) => !!block && typeof block === 'object' && typeof (block as Record<string, unknown>).id === 'string' && typeof (block as Record<string, unknown>).type === 'string');
    } catch { return false; }
  })) return false;
  if (!rows.entry_blocks.every((row) => ['id', 'entry_id', 'block_type', 'payload_json'].every((key) => text(row, key)) && number(row, 'block_order'))) return false;
  if (!rows.media_assets.every((row) => ['id', 'relative_path', 'mime_type', 'created_at'].every((key) => text(row, key)) && (row.entry_id === null || text(row, 'entry_id')))) return false;
  if (!rows.tasks.every((row) => ['id', 'task_date', 'title', 'created_at'].every((key) => text(row, key)) && ['priority', 'completed', 'sort_order'].every((key) => number(row, key)))) return false;
  if (!rows.vocabulary_words.every((row) => ['id', 'source', 'translation', 'source_language', 'target_language', 'example', 'example_translation', 'notes', 'next_review', 'created_at'].every((key) => text(row, key)) && ['favorite', 'learned', 'repetitions'].every((key) => number(row, key)))) return false;
  if (!rows.vocabulary_reviews.every((row) => ['id', 'word_id', 'reviewed_at', 'next_review'].every((key) => text(row, key)) && ['remembered', 'repetition'].every((key) => number(row, key)))) return false;
  if (!rows.app_settings.every((row) => text(row, 'key') && text(row, 'value'))) return false;
  if (!rows.activity_events.every((row) => ['id', 'event_type', 'event_date', 'created_at'].every((key) => text(row, key)) && (row.reference_id === null || text(row, 'reference_id')))) return false;

  const notebookIds = new Set(rows.notebooks.map((row) => row.id));
  const entryIds = new Set(rows.entries.map((row) => row.id));
  const wordIds = new Set(rows.vocabulary_words.map((row) => row.id));
  return rows.entries.every((row) => notebookIds.has(row.notebook_id)) &&
    rows.entry_blocks.every((row) => entryIds.has(row.entry_id)) &&
    rows.media_assets.every((row) => row.entry_id === null || entryIds.has(row.entry_id)) &&
    rows.vocabulary_reviews.every((row) => wordIds.has(row.word_id));
}

export async function replaceBackupTables(db: BackupDatabase, data: BackupData): Promise<void> {
  if (!validateBackupData(data)) throw new Error('Backup database data is invalid.');
  await db.withTransactionAsync(async () => {
    await db.execAsync('PRAGMA defer_foreign_keys = ON; DELETE FROM entry_blocks; DELETE FROM media_assets; DELETE FROM entries; DELETE FROM tasks; DELETE FROM vocabulary_reviews; DELETE FROM vocabulary_words; DELETE FROM activity_events; DELETE FROM notebooks; DELETE FROM app_settings;');
    for (const table of backupTableNames) {
      for (const row of data.tables[table]) {
        const columns = allowedColumns[table].filter((column) => Object.hasOwn(row, column));
        if (!columns.length) continue;
        const placeholders = columns.map(() => '?').join(',');
        await db.runAsync(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`, ...columns.map((column) => row[column] as string | number | null));
      }
    }
    await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('defaults_seeded','true')");
    await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('onboarding_complete','true')");
    const violations = await db.getAllAsync<{ table: string }>('PRAGMA foreign_key_check');
    if (violations.length) throw new Error('Restored data has invalid relationships.');
  });
}
