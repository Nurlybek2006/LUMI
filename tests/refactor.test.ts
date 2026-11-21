import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrations, migrateDatabase } from '../src/database/migrations.ts';
import { searchAll } from '../src/database/search.ts';
import { parseBulkVocabulary } from '../src/utils/vocabulary.ts';

const stamp = '2025-01-02T03:04:05.000Z';

test('versioned upgrades retain IDs, themes, journal dates, and review progress while migrating general pages', () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  try {
    db.exec(migrations[0]!.sql);
    const addBook = db.prepare('INSERT INTO notebooks(id,title,icon,theme_id,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
    addBook.run('diary', 'My Diary', 'book-heart', 'classic', 0, stamp, stamp);
    addBook.run('vocabulary', 'Words', 'languages', 'creative', 1, stamp, stamp);
    addBook.run('custom-programming', 'My Diary', 'code-2', 'midnight', 2, stamp, stamp);
    addBook.run('plans', 'Plans', 'calendar-days', 'winter', 3, stamp, stamp);
    db.prepare('INSERT INTO entries(id,notebook_id,entry_date,title,content,blocks_json,tags_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('journal-entry-id', 'diary', '2025-01-02', 'Journal', 'Today', '[]', '[]', stamp, stamp);
    db.prepare('INSERT INTO entries(id,notebook_id,entry_date,title,content,blocks_json,tags_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('custom-entry-id', 'custom-programming', '2025-01-02', 'Legacy note', 'const x = 1', '[{"id":"b1","type":"code","text":"const x = 1"},{"id":"b2","type":"image","uri":"media/legacy.jpg"}]', '[]', stamp, stamp);
    db.prepare('INSERT INTO media_assets(id,entry_id,relative_path,mime_type,created_at) VALUES(?,?,?,?,?)').run('legacy-media-id', 'custom-entry-id', 'media/legacy.jpg', 'image/jpeg', stamp);
    db.prepare('INSERT INTO vocabulary_words(id,source,translation,source_language,target_language,learned,repetitions,next_review,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('word-kept-id', 'apple', 'алма', 'en', 'kk', 1, 5, '2025-01-30', stamp);
    db.prepare('INSERT INTO vocabulary_reviews(id,word_id,reviewed_at,remembered,repetition,next_review) VALUES(?,?,?,?,?,?)').run('review-kept-id', 'word-kept-id', '2025-01-02', 1, 5, '2025-01-30');
    db.prepare('INSERT INTO tasks(id,task_date,title,created_at) VALUES(?,?,?,?)').run('old-task-id', '2025-01-02', 'Keep task', stamp);
    for (const migration of migrations.slice(1)) db.exec(migration.sql);

    assert.equal(db.prepare('SELECT type FROM notebooks WHERE id=?').get('diary')?.type, 'journal');
    assert.equal(db.prepare('SELECT type,theme_id FROM notebooks WHERE id=?').get('custom-programming')?.type, 'general');
    assert.equal(db.prepare('SELECT theme_id FROM notebooks WHERE id=?').get('custom-programming')?.theme_id, 'midnight');
    assert.equal(db.prepare('SELECT id,content FROM notebook_pages WHERE id=?').get('custom-entry-id')?.content, 'const x = 1');
    assert.equal(db.prepare('SELECT relative_path FROM notebook_page_media WHERE page_id=?').get('custom-entry-id')?.relative_path, 'media/legacy.jpg');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM entries WHERE id=?').get('custom-entry-id')?.count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM notebook_pages WHERE id=?').get('journal-entry-id')?.count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vocabulary_reviews WHERE id=?').get('review-kept-id')?.count, 1);
    assert.equal(db.prepare('SELECT notebook_id FROM tasks WHERE id=?').get('old-task-id')?.notebook_id, 'plans');
    assert.equal(db.prepare('SELECT id,learned,repetitions,next_review FROM vocabulary_entries WHERE id=?').get('word-kept-id')?.next_review, '2025-01-30');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vocabulary_translations WHERE entry_id=?').get('word-kept-id')?.count, 2);
  } finally { db.close(); }
});

test('page deletion leaves its notebook, and vocabulary entries support ordered three and four language rows', () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  try {
    for (const migration of migrations) db.exec(migration.sql);
    const stampNow = stamp;
    db.prepare('INSERT INTO notebooks(id,title,icon,theme_id,sort_order,created_at,updated_at,type) VALUES(?,?,?,?,?,?,?,?)').run('general-book', 'Notes', 'book-open', 'warm', 0, stampNow, stampNow, 'general');
    db.prepare('INSERT INTO notebook_pages(id,notebook_id,title,content,blocks_json,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('page-delete', 'general-book', 'Keep book', 'Body', '[]', 0, stampNow, stampNow);
    const longContent = 'Қазақша ұзын мәтін · '.repeat(400);
    db.prepare('INSERT INTO notebook_pages(id,notebook_id,title,content,blocks_json,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('page-long', 'general-book', 'Long reading page', longContent, JSON.stringify([{ id: 'long-block', type: 'paragraph', text: longContent }]), 1, stampNow, stampNow);
    assert.equal(db.prepare('SELECT length(content) AS count FROM notebook_pages WHERE id=?').get('page-long')?.count, longContent.length);
    assert.equal(db.prepare('SELECT json_extract(blocks_json,\'$[0].text\') AS body FROM notebook_pages WHERE id=?').get('page-long')?.body, longContent);
    db.prepare('DELETE FROM notebook_pages WHERE id=?').run('page-delete');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM notebooks WHERE id=?').get('general-book')?.count, 1);

    db.prepare('INSERT INTO vocabulary_entries(id,notebook_id,next_review,created_at,updated_at) VALUES(?,?,?,?,?)').run('multi', null, '2025-01-03', stampNow, stampNow);
    const insert = db.prepare('INSERT INTO vocabulary_translations(id,entry_id,language_code,value,display_order) VALUES(?,?,?,?,?)');
    for (const [index, language] of ['kk', 'ru', 'en', 'tr'].entries()) insert.run(`multi-${language}`, 'multi', language, `value-${language}`, index);
    const rows = db.prepare('SELECT language_code FROM vocabulary_translations WHERE entry_id=? ORDER BY display_order').all('multi').map((row) => row.language_code);
    assert.deepEqual(rows, ['kk', 'ru', 'en', 'tr']);
  } finally { db.close(); }
});

test('bulk vocabulary preview keeps malformed rows visible and validates column count', () => {
  const rows = parseBulkVocabulary('алма | яблоко | apple\nқате жол\nкітап | книга | book', ['kk', 'ru', 'en']);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.error, undefined);
  assert.match(rows[1]?.error ?? '', /3 баған/);
  assert.equal(rows[2]?.values[2], 'book');
});

test('full database initialization seeds typed notebooks and keeps FTS search active for new pages and translations', async () => {
  const raw = new DatabaseSync(':memory:'); raw.exec('PRAGMA foreign_keys=ON');
  const adapter = {
    async execAsync(sql: string) { raw.exec(sql); },
    async runAsync(sql: string, ...params: (string | number | null)[]) { return raw.prepare(sql).run(...params); },
    async getFirstAsync<T>(sql: string, ...params: (string | number | null)[]) { return raw.prepare(sql).get(...params) as T | undefined ?? null; },
    async getAllAsync<T>(sql: string, ...params: (string | number | null)[]) { return raw.prepare(sql).all(...params) as T[]; },
    async withTransactionAsync(task: () => Promise<void>) { raw.exec('BEGIN'); try { await task(); raw.exec('COMMIT'); } catch (error) { raw.exec('ROLLBACK'); throw error; } }
  } as unknown as Parameters<typeof migrateDatabase>[0];
  try {
    await migrateDatabase(adapter);
    assert.equal(raw.prepare("SELECT type FROM notebooks WHERE id='diary'").get()?.type, 'journal');
    assert.equal(raw.prepare("SELECT type FROM notebooks WHERE id='programming'").get()?.type, 'general');
    assert.equal(raw.prepare("SELECT value FROM app_settings WHERE key='fts5_available'").get()?.value, 'true');
    raw.prepare('INSERT INTO notebook_pages(id,notebook_id,title,content,blocks_json,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('fts-page', 'programming', 'Search page', 'Unique Moonstone phrase', '[]', 0, stamp, stamp);
    raw.prepare('INSERT INTO vocabulary_words(id,source,translation,source_language,target_language,next_review,created_at) VALUES(?,?,?,?,?,?,?)').run('fts-word', 'bilingual', 'initial', 'en', 'kk', '2025-01-02', stamp);
    raw.prepare('INSERT INTO vocabulary_entries(id,notebook_id,next_review,created_at,updated_at) VALUES(?,?,?,?,?)').run('fts-word', 'vocabulary', '2025-01-02', stamp, stamp);
    raw.prepare('INSERT INTO vocabulary_translations(id,entry_id,language_code,value,display_order) VALUES(?,?,?,?,?)').run('fts-translation', 'fts-word', 'tr', 'moonstone search phrase', 2);
    const searchAdapter = {
      async getFirstAsync<T>(sql: string, ...params: string[]) { return raw.prepare(sql).get(...params) as T | undefined ?? null; },
      async getAllAsync<T>(sql: string, ...params: string[]) { return raw.prepare(sql).all(...params) as T[]; }
    } as unknown as Parameters<typeof searchAll>[0];
    const pageHits = await searchAll(searchAdapter, 'Unique Moonstone phrase');
    assert.ok(pageHits.some((hit) => hit.kind === 'page' && hit.id === 'fts-page'));
    const wordHits = await searchAll(searchAdapter, 'moonstone search phrase');
    assert.ok(wordHits.some((hit) => hit.kind === 'word' && hit.id === 'fts-word' && hit.notebookId === 'vocabulary'));
  } finally { raw.close(); }
});

test('substring search finds partial, internal, multilingual and Kazakh Cyrillic matches without treating LIKE markers as wildcards', async () => {
  const raw = new DatabaseSync(':memory:'); raw.exec('PRAGMA foreign_keys=ON');
  const adapter = {
    async execAsync(sql: string) { raw.exec(sql); },
    async runAsync(sql: string, ...params: (string | number | null)[]) { return raw.prepare(sql).run(...params); },
    async getFirstAsync<T>(sql: string, ...params: (string | number | null)[]) { return raw.prepare(sql).get(...params) as T | undefined ?? null; },
    async getAllAsync<T>(sql: string, ...params: (string | number | null)[]) { return raw.prepare(sql).all(...params) as T[]; },
    async withTransactionAsync(task: () => Promise<void>) { raw.exec('BEGIN'); try { await task(); raw.exec('COMMIT'); } catch (error) { raw.exec('ROLLBACK'); throw error; } }
  } as unknown as Parameters<typeof migrateDatabase>[0];
  try {
    await migrateDatabase(adapter);
    assert.equal(raw.prepare("SELECT value FROM app_settings WHERE key='substring_fts_available'").get()?.value, 'true');
    raw.prepare('INSERT INTO notebook_pages(id,notebook_id,title,content,blocks_json,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .run('kazakh-page', 'programming', 'Тіл үйрену', 'кітапхана · яблоко · 100%_нақты белгі', '[]', 0, stamp, stamp);
    raw.prepare('INSERT INTO vocabulary_words(id,source,translation,source_language,target_language,next_review,created_at) VALUES(?,?,?,?,?,?,?)')
      .run('apple-word', 'apple', 'алма', 'en', 'kk', '2025-01-02', stamp);
    raw.prepare('INSERT INTO vocabulary_entries(id,notebook_id,next_review,created_at,updated_at) VALUES(?,?,?,?,?)')
      .run('apple-word', 'vocabulary', '2025-01-02', stamp, stamp);
    raw.prepare('INSERT INTO vocabulary_translations(id,entry_id,language_code,value,display_order) VALUES(?,?,?,?,?)')
      .run('apple-tr', 'apple-word', 'tr', 'elma', 2);
    const searchAdapter = {
      async getFirstAsync<T>(sql: string, ...params: string[]) { return raw.prepare(sql).get(...params) as T | undefined ?? null; },
      async getAllAsync<T>(sql: string, ...params: string[]) { return raw.prepare(sql).all(...params) as T[]; }
    } as unknown as Parameters<typeof searchAll>[0];
    for (const [query, expectedId] of [['кі', 'kazakh-page'], ['КІ', 'kazakh-page'], ['кіт', 'kazakh-page'], ['тап', 'kazakh-page'], ['ТАП', 'kazakh-page'], ['ябл', 'kazakh-page'], ['app', 'apple-word'], ['elma', 'apple-word']] as const) {
      const results = await searchAll(searchAdapter, query);
      assert.ok(results.some((hit) => hit.id === expectedId), `query ${query} should match ${expectedId}`);
    }
    const escaped = await searchAll(searchAdapter, '%_');
    assert.ok(escaped.some((hit) => hit.id === 'kazakh-page'));
    const snippet = (await searchAll(searchAdapter, 'ябл'))[0]?.subtitle ?? '';
    assert.ok(snippet.includes('ябл'), 'result context should include the matching part');
  } finally { raw.close(); }
});
