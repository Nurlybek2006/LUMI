import test from 'node:test';
import assert from 'node:assert/strict';
import { addLocalDays, isThemeId, localDate, longestStreak, nextReview, safeArchivePath, validateBackupManifest, wordCount, writingStreak } from '../src/utils/core.ts';
import { getTheme, themeIds } from '../src/themes/registry.ts';
import { paginateEntry } from '../src/utils/pagination.ts';
import type { Entry } from '../src/types/models.ts';

test('review scheduler uses a deterministic 1, 3, 7, 14, 30 day progression', () => {
  const expected = [1, 3, 7, 14, 30];
  let repetitions = 0; let date = '2025-02-01';
  for (const interval of expected) {
    const next = nextReview(date, repetitions, true);
    assert.equal(next.date, addLocalDays(date, interval));
    repetitions = next.repetitions; date = next.date;
  }
  assert.deepEqual(nextReview('2025-02-10', 4, false), { date: '2025-02-11', repetitions: 0 });
});

test('date and streak helpers keep local calendar dates stable', () => {
  assert.equal(addLocalDays('2025-03-08', 1), '2025-03-09');
  assert.equal(addLocalDays('2024-02-28', 1), '2024-02-29');
  assert.equal(localDate(new Date(2024, 0, 2, 23, 50)), '2024-01-02');
  assert.equal(writingStreak(['2025-01-02', '2025-01-03'], '2025-01-04'), 2);
  assert.equal(writingStreak(['2025-01-01', '2025-01-03'], '2025-01-03'), 1);
  assert.equal(longestStreak(['2025-01-01', '2025-01-02', '2025-01-04', '2025-01-05', '2025-01-06']), 3);
});

test('word counting and theme registry return actual derived values', () => {
  assert.equal(wordCount('  LUMI   жеке әлем  '), 3);
  assert.equal(wordCount('   '), 0);
  assert.equal(themeIds.length, 6);
  assert.ok(isThemeId('midnight'));
  assert.equal(isThemeId('unknown'), false);
  assert.equal(getTheme('midnight').page, '#282D37');
});

test('backup manifest rejects unsafe paths and unsupported formats', () => {
  assert.equal(safeArchivePath('media/a1.jpg'), true);
  assert.equal(safeArchivePath('../secret.db'), false);
  assert.equal(safeArchivePath('C:\\secret.db'), false);
  assert.equal(validateBackupManifest({ format: 'lumi-backup', version: 1, database: 'data.json', files: ['data.json', 'media/a1.jpg'], checksums: { 'data.json': 'a'.repeat(64), 'media/a1.jpg': 'b'.repeat(64) } }), true);
  assert.equal(validateBackupManifest({ format: 'lumi-backup', version: 7, database: 'data.json', files: ['data.json'], checksums: {} }), false);
  assert.equal(validateBackupManifest({ format: 'lumi-backup', version: 1, database: 'data.json', files: ['../x'], checksums: {} }), false);
});

test('visual pagination adapts to layout without changing saved entry content', () => {
  const entry: Entry = {
    id: 'entry', notebookId: 'diary', date: '2025-05-01', title: 'Ұзын жазба', content: 'Көп сөз. '.repeat(900),
    blocks: [{ id: 'block-1', type: 'paragraph', text: 'Көп сөз. '.repeat(900) }, { id: 'block-2', type: 'image', uri: 'media/photo.jpg' }],
    mood: null, tags: [], createdAt: '2025-05-01T10:00:00.000Z', updatedAt: '2025-05-01T10:00:00.000Z'
  };
  const original = entry.blocks[0]?.text;
  const narrow = paginateEntry(entry, 260, 500, 'classic');
  const wide = paginateEntry(entry, 390, 760, 'classic');
  assert.ok(narrow.length > 1);
  assert.ok(wide.length <= narrow.length);
  assert.equal(entry.blocks[0]?.text, original);
  assert.equal(narrow.at(-1)?.blocks[0]?.type, 'image');
});
