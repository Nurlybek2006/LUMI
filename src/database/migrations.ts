import type * as SQLite from 'expo-sqlite';

export const migrations: { version: number; sql: string }[] = [
  { version: 1, sql: `
    CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'book-open',
      theme_id TEXT NOT NULL DEFAULT 'warm', sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY NOT NULL, notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      entry_date TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
      blocks_json TEXT NOT NULL DEFAULT '[]', mood TEXT, tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(notebook_id, entry_date)
    );
    CREATE TABLE IF NOT EXISTS entry_blocks (
      id TEXT PRIMARY KEY NOT NULL, entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      block_order INTEGER NOT NULL, block_type TEXT NOT NULL, payload_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY NOT NULL, entry_id TEXT REFERENCES entries(id) ON DELETE CASCADE,
      relative_path TEXT NOT NULL, mime_type TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL, task_date TEXT NOT NULL, title TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0,
      due_time TEXT, completed INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vocabulary_words (
      id TEXT PRIMARY KEY NOT NULL, source TEXT NOT NULL, translation TEXT NOT NULL,
      source_language TEXT NOT NULL DEFAULT 'en', target_language TEXT NOT NULL DEFAULT 'kk',
      example TEXT NOT NULL DEFAULT '', example_translation TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      favorite INTEGER NOT NULL DEFAULT 0, learned INTEGER NOT NULL DEFAULT 0, repetitions INTEGER NOT NULL DEFAULT 0,
      next_review TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vocabulary_reviews (
      id TEXT PRIMARY KEY NOT NULL, word_id TEXT NOT NULL REFERENCES vocabulary_words(id) ON DELETE CASCADE,
      reviewed_at TEXT NOT NULL, remembered INTEGER NOT NULL, repetition INTEGER NOT NULL, next_review TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY NOT NULL, event_type TEXT NOT NULL, event_date TEXT NOT NULL,
      reference_id TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(entry_date DESC);
    CREATE INDEX IF NOT EXISTS idx_entries_notebook ON entries(notebook_id, entry_date DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(task_date, sort_order);
    CREATE INDEX IF NOT EXISTS idx_words_review ON vocabulary_words(next_review);
    CREATE INDEX IF NOT EXISTS idx_reviews_day ON vocabulary_reviews(reviewed_at);
    CREATE INDEX IF NOT EXISTS idx_blocks_entry ON entry_blocks(entry_id, block_order);
    CREATE INDEX IF NOT EXISTS idx_media_entry ON media_assets(entry_id);
  ` }
];

const defaultNotebooks = [
  ['diary', 'Менің күнделігім', 'book-heart', 'classic'], ['plans', 'Жоспарларым', 'calendar-days', 'winter'],
  ['vocabulary', 'Сөздік', 'languages', 'creative'], ['ideas', 'Идеялар', 'lightbulb', 'warm'],
  ['programming', 'Бағдарламалау', 'code-2', 'midnight']
] as const;

export async function migrateDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
  const found = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM notebooks');
  const seeded = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key='defaults_seeded'");
  if ((found?.count ?? 0) === 0 && seeded?.value !== 'true') {
    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < defaultNotebooks.length; i += 1) {
        const [id, title, icon, theme] = defaultNotebooks[i]!;
        await db.runAsync('INSERT INTO notebooks (id,title,icon,theme_id,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', id, title, icon, theme, i, now, now);
      }
      await db.runAsync("INSERT OR IGNORE INTO app_settings(key,value) VALUES ('onboarding_complete','false')");
      await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES ('defaults_seeded','true')");
    });
  }
  try {
    await db.execAsync(`
      CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(kind UNINDEXED, object_id UNINDEXED, title, body, event_date UNINDEXED, notebook_id UNINDEXED, tokenize='unicode61 remove_diacritics 2');
      CREATE TRIGGER IF NOT EXISTS fts_entries_insert AFTER INSERT ON entries BEGIN INSERT INTO content_fts VALUES('entry',new.id,new.title,new.content,new.entry_date,new.notebook_id); END;
      CREATE TRIGGER IF NOT EXISTS fts_entries_update AFTER UPDATE ON entries BEGIN DELETE FROM content_fts WHERE kind='entry' AND object_id=old.id; INSERT INTO content_fts VALUES('entry',new.id,new.title,new.content,new.entry_date,new.notebook_id); END;
      CREATE TRIGGER IF NOT EXISTS fts_entries_delete AFTER DELETE ON entries BEGIN DELETE FROM content_fts WHERE kind='entry' AND object_id=old.id; END;
      CREATE TRIGGER IF NOT EXISTS fts_tasks_insert AFTER INSERT ON tasks BEGIN INSERT INTO content_fts VALUES('task',new.id,new.title,'',new.task_date,''); END;
      CREATE TRIGGER IF NOT EXISTS fts_tasks_update AFTER UPDATE ON tasks BEGIN DELETE FROM content_fts WHERE kind='task' AND object_id=old.id; INSERT INTO content_fts VALUES('task',new.id,new.title,'',new.task_date,''); END;
      CREATE TRIGGER IF NOT EXISTS fts_tasks_delete AFTER DELETE ON tasks BEGIN DELETE FROM content_fts WHERE kind='task' AND object_id=old.id; END;
      CREATE TRIGGER IF NOT EXISTS fts_words_insert AFTER INSERT ON vocabulary_words BEGIN INSERT INTO content_fts VALUES('word',new.id,new.source,new.translation,'',''); END;
      CREATE TRIGGER IF NOT EXISTS fts_words_update AFTER UPDATE ON vocabulary_words BEGIN DELETE FROM content_fts WHERE kind='word' AND object_id=old.id; INSERT INTO content_fts VALUES('word',new.id,new.source,new.translation,'',''); END;
      CREATE TRIGGER IF NOT EXISTS fts_words_delete AFTER DELETE ON vocabulary_words BEGIN DELETE FROM content_fts WHERE kind='word' AND object_id=old.id; END;
      CREATE TRIGGER IF NOT EXISTS fts_notebooks_insert AFTER INSERT ON notebooks BEGIN INSERT INTO content_fts VALUES('notebook',new.id,new.title,'','',''); END;
      CREATE TRIGGER IF NOT EXISTS fts_notebooks_update AFTER UPDATE ON notebooks BEGIN DELETE FROM content_fts WHERE kind='notebook' AND object_id=old.id; INSERT INTO content_fts VALUES('notebook',new.id,new.title,'','',''); END;
      CREATE TRIGGER IF NOT EXISTS fts_notebooks_delete AFTER DELETE ON notebooks BEGIN DELETE FROM content_fts WHERE kind='notebook' AND object_id=old.id; END;
    `);
    const indexed = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key='fts5_initialized'");
    if (indexed?.value !== 'true') {
      await db.execAsync(`INSERT INTO content_fts SELECT 'entry',id,title,content,entry_date,notebook_id FROM entries;
        INSERT INTO content_fts SELECT 'task',id,title,'',task_date,'' FROM tasks;
        INSERT INTO content_fts SELECT 'word',id,source,translation,'','' FROM vocabulary_words;
        INSERT INTO content_fts SELECT 'notebook',id,title,'','','' FROM notebooks;`);
      await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('fts5_initialized','true')");
    }
    await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('fts5_available','true')");
  } catch {
    await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('fts5_available','false')");
  }
}
