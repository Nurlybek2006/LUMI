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
  ` },
  { version: 2, sql: `
    ALTER TABLE notebooks ADD COLUMN type TEXT NOT NULL DEFAULT 'general'
      CHECK(type IN ('general','journal','vocabulary','planner'));
    UPDATE notebooks SET type=CASE id
      WHEN 'diary' THEN 'journal' WHEN 'plans' THEN 'planner' WHEN 'vocabulary' THEN 'vocabulary'
      ELSE 'general' END;
    CREATE TABLE notebook_pages (
      id TEXT PRIMARY KEY NOT NULL,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', blocks_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_notebook_pages_order ON notebook_pages(notebook_id, sort_order, created_at);
    CREATE TABLE notebook_page_media (
      page_id TEXT NOT NULL REFERENCES notebook_pages(id) ON DELETE CASCADE,
      relative_path TEXT NOT NULL, PRIMARY KEY(page_id, relative_path)
    );
    INSERT INTO notebook_pages(id,notebook_id,title,content,blocks_json,sort_order,created_at,updated_at)
      SELECT e.id,e.notebook_id,e.title,e.content,e.blocks_json,
        ROW_NUMBER() OVER(PARTITION BY e.notebook_id ORDER BY e.entry_date,e.created_at,e.id)-1,e.created_at,e.updated_at
      FROM entries e JOIN notebooks n ON n.id=e.notebook_id WHERE n.type<>'journal';
    INSERT OR IGNORE INTO notebook_page_media(page_id,relative_path)
      SELECT p.id,json_extract(b.payload_json,'$.uri') FROM notebook_pages p
      JOIN entry_blocks b ON b.entry_id=p.id WHERE b.block_type='image' AND json_extract(b.payload_json,'$.uri') LIKE 'media/%';
    INSERT OR IGNORE INTO notebook_page_media(page_id,relative_path)
      SELECT p.id,m.relative_path FROM notebook_pages p JOIN media_assets m ON m.entry_id=p.id;
    INSERT OR IGNORE INTO notebook_page_media(page_id,relative_path)
      SELECT p.id,json_extract(block.value,'$.uri') FROM notebook_pages p,json_each(p.blocks_json) AS block
      WHERE json_extract(block.value,'$.type')='image' AND json_extract(block.value,'$.uri') LIKE 'media/%';
    DELETE FROM entries WHERE notebook_id IN (SELECT id FROM notebooks WHERE type<>'journal');
  ` },
  { version: 3, sql: `
    CREATE TABLE vocabulary_entries (
      id TEXT PRIMARY KEY NOT NULL, notebook_id TEXT REFERENCES notebooks(id) ON DELETE CASCADE,
      example TEXT NOT NULL DEFAULT '', example_translation TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      favorite INTEGER NOT NULL DEFAULT 0, learned INTEGER NOT NULL DEFAULT 0, repetitions INTEGER NOT NULL DEFAULT 0,
      next_review TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_vocabulary_entries_review ON vocabulary_entries(next_review);
    CREATE TABLE vocabulary_translations (
      id TEXT PRIMARY KEY NOT NULL,
      entry_id TEXT NOT NULL REFERENCES vocabulary_entries(id) ON DELETE CASCADE,
      language_code TEXT NOT NULL, value TEXT NOT NULL, display_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(entry_id, language_code)
    );
    CREATE INDEX idx_vocabulary_translations_entry ON vocabulary_translations(entry_id, display_order);
    CREATE TABLE vocabulary_notebook_languages (
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      language_code TEXT NOT NULL, display_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(notebook_id, language_code)
    );
    INSERT INTO vocabulary_entries(id,notebook_id,example,example_translation,notes,favorite,learned,repetitions,next_review,created_at,updated_at)
      SELECT id,NULL,example,example_translation,notes,favorite,learned,repetitions,next_review,created_at,created_at FROM vocabulary_words;
    INSERT INTO vocabulary_translations(id,entry_id,language_code,value,display_order)
      SELECT id || ':source',id,source_language,source,0 FROM vocabulary_words;
    INSERT INTO vocabulary_translations(id,entry_id,language_code,value,display_order)
      SELECT id || ':target',id,target_language,translation,1 FROM vocabulary_words WHERE target_language<>source_language;
  ` },
  { version: 4, sql: `
    ALTER TABLE tasks ADD COLUMN notebook_id TEXT REFERENCES notebooks(id) ON DELETE CASCADE;
    UPDATE tasks SET notebook_id='plans' WHERE EXISTS(SELECT 1 FROM notebooks WHERE id='plans');
    CREATE INDEX idx_tasks_notebook_day ON tasks(notebook_id,task_date,sort_order);
    DROP TRIGGER IF EXISTS fts_tasks_insert;
    DROP TRIGGER IF EXISTS fts_tasks_update;
    DROP TRIGGER IF EXISTS fts_tasks_delete;
  ` },
  { version: 5, sql: `
    ALTER TABLE vocabulary_entries ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
  ` }
];

const defaultNotebooks = [
  ['diary', 'Менің күнделігім', 'book-heart', 'classic', 'journal'], ['plans', 'Жоспарларым', 'calendar-days', 'winter', 'planner'],
  ['vocabulary', 'Сөздік', 'languages', 'creative', 'vocabulary'], ['ideas', 'Идеялар', 'lightbulb', 'warm', 'general'],
  ['programming', 'Бағдарламалау', 'code-2', 'midnight', 'general']
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
        const [id, title, icon, theme, type] = defaultNotebooks[i]!;
        await db.runAsync('INSERT INTO notebooks (id,title,icon,theme_id,sort_order,created_at,updated_at,type) VALUES (?,?,?,?,?,?,?,?)', id, title, icon, theme, i, now, now, type);
      }
      await db.runAsync("INSERT OR IGNORE INTO app_settings(key,value) VALUES ('onboarding_complete','false')");
      await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES ('defaults_seeded','true')");
    });
  }
  const vocabularyNotebook = await db.getFirstAsync<{ id: string }>("SELECT id FROM notebooks WHERE id='vocabulary'");
  if (vocabularyNotebook) {
    await db.runAsync("UPDATE vocabulary_entries SET notebook_id='vocabulary' WHERE notebook_id IS NULL");
    const languageCount = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM vocabulary_notebook_languages WHERE notebook_id='vocabulary'");
    if ((languageCount?.count ?? 0) === 0) {
      for (const [index, language] of ['kk', 'ru', 'en'].entries()) await db.runAsync('INSERT OR IGNORE INTO vocabulary_notebook_languages(notebook_id,language_code,display_order) VALUES(?,?,?)', 'vocabulary', language, index);
    }
  }
  try {
    await db.execAsync(`
      CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(kind UNINDEXED, object_id UNINDEXED, title, body, event_date UNINDEXED, notebook_id UNINDEXED, tokenize='unicode61 remove_diacritics 2');
      CREATE TRIGGER IF NOT EXISTS fts_entries_insert AFTER INSERT ON entries BEGIN INSERT INTO content_fts VALUES('entry',new.id,new.title,new.content,new.entry_date,new.notebook_id); END;
      CREATE TRIGGER IF NOT EXISTS fts_entries_update AFTER UPDATE ON entries BEGIN DELETE FROM content_fts WHERE kind='entry' AND object_id=old.id; INSERT INTO content_fts VALUES('entry',new.id,new.title,new.content,new.entry_date,new.notebook_id); END;
      CREATE TRIGGER IF NOT EXISTS fts_entries_delete AFTER DELETE ON entries BEGIN DELETE FROM content_fts WHERE kind='entry' AND object_id=old.id; END;
      CREATE TRIGGER IF NOT EXISTS fts_tasks_insert AFTER INSERT ON tasks BEGIN INSERT INTO content_fts VALUES('task',new.id,new.title,'',new.task_date,COALESCE(new.notebook_id,'')); END;
      CREATE TRIGGER IF NOT EXISTS fts_tasks_update AFTER UPDATE ON tasks BEGIN DELETE FROM content_fts WHERE kind='task' AND object_id=old.id; INSERT INTO content_fts VALUES('task',new.id,new.title,'',new.task_date,COALESCE(new.notebook_id,'')); END;
      CREATE TRIGGER IF NOT EXISTS fts_tasks_delete AFTER DELETE ON tasks BEGIN DELETE FROM content_fts WHERE kind='task' AND object_id=old.id; END;
      CREATE TRIGGER IF NOT EXISTS fts_words_insert AFTER INSERT ON vocabulary_words BEGIN INSERT INTO content_fts VALUES('word',new.id,new.source,new.translation,'',COALESCE((SELECT notebook_id FROM vocabulary_entries WHERE id=new.id),'')); END;
      CREATE TRIGGER IF NOT EXISTS fts_words_update AFTER UPDATE ON vocabulary_words BEGIN DELETE FROM content_fts WHERE kind='word' AND object_id=old.id; INSERT INTO content_fts VALUES('word',new.id,new.source,new.translation,'',COALESCE((SELECT notebook_id FROM vocabulary_entries WHERE id=new.id),'')); END;
      CREATE TRIGGER IF NOT EXISTS fts_words_delete AFTER DELETE ON vocabulary_words BEGIN DELETE FROM content_fts WHERE kind='word' AND object_id=old.id; END;
      CREATE TRIGGER IF NOT EXISTS fts_vocabulary_translation_insert AFTER INSERT ON vocabulary_translations BEGIN
        DELETE FROM content_fts WHERE kind='word' AND object_id=new.entry_id;
        INSERT INTO content_fts SELECT 'word',v.id,v.source,(SELECT group_concat(value,' ') FROM vocabulary_translations WHERE entry_id=v.id),'',COALESCE((SELECT notebook_id FROM vocabulary_entries WHERE id=v.id),'') FROM vocabulary_words v WHERE v.id=new.entry_id;
      END;
      CREATE TRIGGER IF NOT EXISTS fts_vocabulary_translation_update AFTER UPDATE ON vocabulary_translations BEGIN
        DELETE FROM content_fts WHERE kind='word' AND object_id=old.entry_id;
        INSERT INTO content_fts SELECT 'word',v.id,v.source,(SELECT group_concat(value,' ') FROM vocabulary_translations WHERE entry_id=v.id),'',COALESCE((SELECT notebook_id FROM vocabulary_entries WHERE id=v.id),'') FROM vocabulary_words v WHERE v.id=new.entry_id;
      END;
      CREATE TRIGGER IF NOT EXISTS fts_vocabulary_translation_delete AFTER DELETE ON vocabulary_translations BEGIN
        DELETE FROM content_fts WHERE kind='word' AND object_id=old.entry_id;
        INSERT INTO content_fts SELECT 'word',v.id,v.source,(SELECT group_concat(value,' ') FROM vocabulary_translations WHERE entry_id=v.id),'',COALESCE((SELECT notebook_id FROM vocabulary_entries WHERE id=v.id),'') FROM vocabulary_words v WHERE v.id=old.entry_id;
      END;
      CREATE TRIGGER IF NOT EXISTS fts_notebooks_insert AFTER INSERT ON notebooks BEGIN INSERT INTO content_fts VALUES('notebook',new.id,new.title,'','',''); END;
      CREATE TRIGGER IF NOT EXISTS fts_notebooks_update AFTER UPDATE ON notebooks BEGIN DELETE FROM content_fts WHERE kind='notebook' AND object_id=old.id; INSERT INTO content_fts VALUES('notebook',new.id,new.title,'','',''); END;
      CREATE TRIGGER IF NOT EXISTS fts_notebooks_delete AFTER DELETE ON notebooks BEGIN DELETE FROM content_fts WHERE kind='notebook' AND object_id=old.id; END;
      CREATE TRIGGER IF NOT EXISTS fts_pages_insert AFTER INSERT ON notebook_pages BEGIN INSERT INTO content_fts VALUES('page',new.id,new.title,new.content,'',new.notebook_id); END;
      CREATE TRIGGER IF NOT EXISTS fts_pages_update AFTER UPDATE ON notebook_pages BEGIN DELETE FROM content_fts WHERE kind='page' AND object_id=old.id; INSERT INTO content_fts VALUES('page',new.id,new.title,new.content,'',new.notebook_id); END;
      CREATE TRIGGER IF NOT EXISTS fts_pages_delete AFTER DELETE ON notebook_pages BEGIN DELETE FROM content_fts WHERE kind='page' AND object_id=old.id; END;
    `);
    const indexed = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key='fts5_initialized'");
    if (indexed?.value !== 'true') {
      await db.execAsync(`INSERT INTO content_fts SELECT 'entry',id,title,content,entry_date,notebook_id FROM entries;
        INSERT INTO content_fts SELECT 'page',id,title,content,'',notebook_id FROM notebook_pages;
        INSERT INTO content_fts SELECT 'task',id,title,'',task_date,COALESCE(notebook_id,'') FROM tasks;
        INSERT INTO content_fts SELECT 'word',w.id,w.source,COALESCE((SELECT group_concat(value,' ') FROM vocabulary_translations WHERE entry_id=w.id),w.translation),'',COALESCE((SELECT notebook_id FROM vocabulary_entries WHERE id=w.id),'') FROM vocabulary_words w;
        INSERT INTO content_fts SELECT 'notebook',id,title,'','','' FROM notebooks;`);
      await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('fts5_initialized','true')");
    }
    const refactorIndexed = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key='fts5_refactor_initialized'");
    if (refactorIndexed?.value !== 'true') {
      await db.execAsync(`DELETE FROM content_fts WHERE kind IN ('page','word','task');
        INSERT INTO content_fts SELECT 'page',id,title,content,'',notebook_id FROM notebook_pages;
        INSERT INTO content_fts SELECT 'task',id,title,'',task_date,COALESCE(notebook_id,'') FROM tasks;
        INSERT INTO content_fts SELECT 'word',w.id,w.source,COALESCE((SELECT group_concat(value,' ') FROM vocabulary_translations WHERE entry_id=w.id),w.translation),'',COALESCE((SELECT notebook_id FROM vocabulary_entries WHERE id=w.id),'') FROM vocabulary_words w;`);
      await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('fts5_refactor_initialized','true')");
    }
    await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('fts5_available','true')");
  } catch {
    await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('fts5_available','false')");
  }
}
