import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from '../src/database/migrations.ts';
import { addLocalDays, nextReview } from '../src/utils/core.ts';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  for (const migration of migrations) db.exec(migration.sql);
  return db;
}

test('SQLite migration creates indexed tables and enforces journal foreign keys', () => {
  const db = freshDb();
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
    for (const table of ['notebooks', 'entries', 'entry_blocks', 'media_assets', 'tasks', 'vocabulary_words', 'vocabulary_reviews', 'app_settings', 'activity_events']) assert.ok(tables.includes(table));
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((row) => row.name);
    assert.ok(indexes.includes('idx_entries_date'));
    assert.ok(indexes.includes('idx_tasks_date'));
    const now = '2025-01-01T12:00:00.000Z';
    db.prepare('INSERT INTO notebooks(id,title,icon,theme_id,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('book', 'Diary', 'book', 'classic', 0, now, now);
    db.prepare('INSERT INTO entries(id,notebook_id,entry_date,title,content,blocks_json,tags_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('entry', 'book', '2025-01-01', 'One', 'Thought', '[]', '[]', now, now);
    assert.throws(() => db.prepare('INSERT INTO entries(id,notebook_id,entry_date,title,content,blocks_json,tags_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('entry-2', 'book', '2025-01-01', 'Two', 'Duplicate date', '[]', '[]', now, now));
    db.prepare('INSERT INTO entry_blocks(id,entry_id,block_order,block_type,payload_json) VALUES(?,?,?,?,?)').run('block', 'entry', 0, 'paragraph', '{"text":"Thought"}');
    db.prepare('DELETE FROM notebooks WHERE id=?').run('book');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM entries').get()?.count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM entry_blocks').get()?.count, 0);
  } finally { db.close(); }
});

test('task completion and vocabulary review history persist in SQLite', () => {
  const db = freshDb();
  try {
    const now = '2025-02-01T12:00:00.000Z';
    db.prepare('INSERT INTO tasks(id,task_date,title,created_at) VALUES(?,?,?,?)').run('task-1', '2025-02-01', 'Read', now);
    db.prepare('UPDATE tasks SET completed=1 WHERE id=?').run('task-1');
    assert.equal(db.prepare('SELECT completed FROM tasks WHERE id=?').get('task-1')?.completed, 1);
    db.prepare('INSERT INTO vocabulary_words(id,source,translation,next_review,created_at) VALUES(?,?,?,?,?)').run('word-1', 'сәлем', 'hello', '2025-02-01', now);
    const schedule = nextReview('2025-02-01', 0, true);
    db.prepare('UPDATE vocabulary_words SET repetitions=?,next_review=? WHERE id=?').run(schedule.repetitions, schedule.date, 'word-1');
    db.prepare('INSERT INTO vocabulary_reviews(id,word_id,reviewed_at,remembered,repetition,next_review) VALUES(?,?,?,?,?,?)').run('review-1', 'word-1', '2025-02-01', 1, schedule.repetitions, schedule.date);
    assert.equal(db.prepare('SELECT next_review FROM vocabulary_words WHERE id=?').get('word-1')?.next_review, addLocalDays('2025-02-01', 1));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vocabulary_reviews').get()?.count, 1);
  } finally { db.close(); }
});
