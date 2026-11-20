import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from '../src/database/migrations.ts';
import { normalizeBackupData, replaceBackupTables, validateBackupData, type BackupData, type BackupDatabase } from '../src/services/backupData.ts';
import { searchAll } from '../src/database/search.ts';

const timestamp = '2025-06-01T12:00:00.000Z';

function backupData(): BackupData {
  return {
    schemaVersion: 2,
    tables: {
      notebooks: [{ id: 'restored-book', title: 'Restored notebook', type: 'general', icon: 'book-open', theme_id: 'warm', sort_order: 0, created_at: timestamp, updated_at: timestamp }],
      entries: [{ id: 'restored-entry', notebook_id: 'restored-book', entry_date: '2025-06-01', title: 'Restored entry', content: 'Restored content', blocks_json: '[]', mood: null, tags_json: '[]', created_at: timestamp, updated_at: timestamp }],
      entry_blocks: [], media_assets: [], notebook_pages: [], notebook_page_media: [], tasks: [], vocabulary_words: [], vocabulary_entries: [], vocabulary_translations: [], vocabulary_notebook_languages: [], vocabulary_reviews: [], app_settings: [{ key: 'onboarding_complete', value: 'false' }], activity_events: []
    }
  };
}

function createDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  for (const migration of migrations) db.exec(migration.sql);
  return db;
}

function backupDb(db: DatabaseSync): BackupDatabase {
  return {
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try { await task(); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    async execAsync(sql: string) { db.exec(sql); },
    async runAsync(sql, ...params) { return db.prepare(sql).run(...params); },
    async getAllAsync<T>(sql: string) { return db.prepare(sql).all() as T[]; }
  };
}

test('backup table validation rejects broken relationships and restoration replaces data atomically', async () => {
  const db = createDatabase();
  try {
    db.prepare('INSERT INTO notebooks(id,title,icon,theme_id,sort_order,created_at,updated_at,type) VALUES(?,?,?,?,?,?,?,?)').run('old-book', 'Old', 'book', 'warm', 0, timestamp, timestamp, 'journal');
    db.prepare('INSERT INTO entries(id,notebook_id,entry_date,title,content,blocks_json,tags_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('old-entry', 'old-book', '2025-05-01', 'Old', 'Keep until commit', '[]', '[]', timestamp, timestamp);

    const data = backupData();
    assert.equal(validateBackupData(data), true);
    await replaceBackupTables(backupDb(db), data);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM notebooks').get()?.count, 1);
    assert.equal(db.prepare('SELECT id FROM entries').get()?.id, 'restored-entry');
    assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='onboarding_complete'").get()?.value, 'true');

    const invalid = backupData();
    invalid.tables.entries = [
      ...invalid.tables.entries,
      { ...invalid.tables.entries[0]!, id: 'duplicate-date-entry' }
    ];
    assert.equal(validateBackupData(invalid), true);
    await assert.rejects(replaceBackupTables(backupDb(db), invalid));
    assert.equal(db.prepare('SELECT id FROM entries').get()?.id, 'restored-entry');
  } finally { db.close(); }
});

test('legacy schema version 1 backups normalize with safe ID-based notebook types', () => {
  const modern = backupData();
  const legacyTables = { ...modern.tables } as Record<string, unknown>;
  for (const name of ['notebook_pages', 'notebook_page_media', 'vocabulary_entries', 'vocabulary_translations', 'vocabulary_notebook_languages']) delete legacyTables[name];
  legacyTables.notebooks = [
    { id: 'diary', title: 'Renamed by user', icon: 'book', theme_id: 'classic', sort_order: 0, created_at: timestamp, updated_at: timestamp },
    { id: 'custom-diary-name', title: 'My Diary', icon: 'book', theme_id: 'warm', sort_order: 1, created_at: timestamp, updated_at: timestamp }
  ];
  legacyTables.entries = [];
  const legacy = { schemaVersion: 1, tables: legacyTables };
  assert.equal(validateBackupData(legacy), true);
  const normalized = normalizeBackupData(legacy);
  assert.equal(normalized?.tables.notebooks[0]?.type, 'journal');
  assert.equal(normalized?.tables.notebooks[1]?.type, 'general');
});

test('global SQL fallback search returns notebook, journal, task and vocabulary matches', async () => {
  const db = createDatabase();
  try {
    db.prepare("INSERT INTO app_settings(key,value) VALUES('fts5_available','false')").run();
    db.prepare('INSERT INTO notebooks(id,title,icon,theme_id,sort_order,created_at,updated_at,type) VALUES(?,?,?,?,?,?,?,?)').run('book', 'Tranquil ideas', 'book', 'warm', 0, timestamp, timestamp, 'journal');
    db.prepare('INSERT INTO entries(id,notebook_id,entry_date,title,content,blocks_json,tags_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('entry', 'book', '2025-06-01', 'A quiet day', 'A tranquil evening', '[]', '[]', timestamp, timestamp);
    db.prepare('INSERT INTO tasks(id,task_date,title,created_at) VALUES(?,?,?,?)').run('task', '2025-06-01', 'Read tranquil notes', timestamp);
    db.prepare('INSERT INTO vocabulary_words(id,source,translation,next_review,created_at) VALUES(?,?,?,?,?)').run('word', 'tranquil', 'тыныш', '2025-06-01', timestamp);
    const adapter = {
      async getFirstAsync<T>(sql: string, ...params: string[]) { return db.prepare(sql).get(...params) as T | undefined ?? null; },
      async getAllAsync<T>(sql: string, ...params: string[]) { return db.prepare(sql).all(...params) as T[]; }
    } as unknown as Parameters<typeof searchAll>[0];

    const matches = await searchAll(adapter, 'tranquil');
    assert.deepEqual(new Set(matches.map((match) => match.kind)), new Set(['notebook', 'entry', 'task', 'word']));
    assert.deepEqual(await searchAll(adapter, '   '), []);
  } finally { db.close(); }
});
