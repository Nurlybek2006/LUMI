import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveQueue } from '../src/services/autosave.ts';

test('autosave queue serializes writes and keeps the latest rapid edit', async () => {
  const writes: number[] = [];
  const queue = new SaveQueue<number>(async (value) => { await new Promise((resolve) => setTimeout(resolve, 12)); writes.push(value); });
  const first = queue.enqueue(1);
  void queue.enqueue(2);
  void queue.enqueue(3);
  await first;
  await queue.enqueue(4);
  await queue.flush();
  assert.deepEqual(writes, [1, 3, 4]);
});

test('autosave retains the newest pending value after a failed write and retries on flush', async () => {
  const writes: number[] = [];
  let failFirst = true;
  const queue = new SaveQueue<number>(async (value) => {
    writes.push(value);
    if (value === 1 && failFirst) { failFirst = false; throw new Error('disk busy'); }
  });

  await assert.rejects(queue.enqueue(1), /disk busy/u);
  await queue.enqueue(2);
  await queue.flush();
  assert.deepEqual(writes, [1, 2]);
});

test('notebook page autosave reuses the editor document ID instead of creating a new page per save', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { migrations } = await import('../src/database/migrations.ts');
  const { resolveNotebookPageId, shouldPersistPage } = await import('../src/services/pageAutosave.ts');
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  for (const migration of migrations) db.exec(migration.sql);
  const stamp = '2026-01-01T00:00:00.000Z';
  db.prepare('INSERT OR IGNORE INTO notebooks(id,title,icon,theme_id,sort_order,created_at,updated_at,type) VALUES(?,?,?,?,?,?,?,?)').run('ideas', 'Ideas', 'book', 'warm', 9, stamp, stamp, 'general');
  let generated = 0;
  const generate = () => `generated-${++generated}`;
  const documentId = 'editor-document-id';
  const save = (text: string) => {
    const current = db.prepare('SELECT id FROM notebook_pages WHERE id=?').get(documentId) as { id: string } | undefined;
    const pageId = resolveNotebookPageId(current?.id, documentId, generate);
    db.prepare(`INSERT INTO notebook_pages(id,notebook_id,title,content,blocks_json,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET content=excluded.content,blocks_json=excluded.blocks_json,updated_at=excluded.updated_at`)
      .run(pageId, 'ideas', '', text, JSON.stringify([{ id: 'b1', type: 'paragraph', text }]), 0, stamp, stamp);
  };
  for (const text of ['С', 'Сә', 'Сәлем', 'Сәлем, әлем']) save(text);
  const rows = db.prepare("SELECT id,content FROM notebook_pages WHERE notebook_id='ideas'").all() as { id: string; content: string }[];
  assert.deepEqual(rows.map((row) => ({ ...row })), [{ id: documentId, content: 'Сәлем, әлем' }]);
  assert.equal(generated, 0);
  // Without a requested ID (e.g. duplicating a page) a fresh ID is still generated.
  assert.equal(resolveNotebookPageId(undefined, undefined, generate), 'generated-1');
  assert.equal(resolveNotebookPageId('existing', 'other', generate), 'existing');
  // Empty new pages are not written; once saved, clearing the text still updates the same page.
  const empty = { title: '  ', blocks: [{ type: 'paragraph', text: '' }] };
  assert.equal(shouldPersistPage(empty, false), false);
  assert.equal(shouldPersistPage(empty, true), true);
  assert.equal(shouldPersistPage({ title: '', blocks: [{ type: 'image' }] }, false), true);
  db.close();
});

test('notebook repository and editor keep one stable page ID for autosave', async () => {
  const { readFileSync } = await import('node:fs');
  const repository = readFileSync(new URL('../src/database/repository.ts', import.meta.url), 'utf8');
  const editor = readFileSync(new URL('../app/notebook/[id]/edit.tsx', import.meta.url), 'utf8');
  assert.match(repository, /resolveNotebookPageId\(current\?\.id, pageId, id\)/u);
  assert.doesNotMatch(repository, /const actualId = current\?\.id \?\? id\(\)/u);
  assert.match(editor, /saveNotebookPage\(db, payload, activePageId\)/u);
  assert.match(editor, /getNotebookPage\(db, documentId\)/u);
});
