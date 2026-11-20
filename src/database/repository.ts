import type * as SQLite from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { localDate, longestStreak, wordCount, writingStreak } from '@/utils/core';
import type { Entry, EntryBlock, Notebook, PlannerTask, VocabularyWord } from '@/types/models';

const id = (): string => randomUUID();
const now = (): string => new Date().toISOString();

type NotebookRow = { id: string; title: string; icon: string; theme_id: Notebook['themeId']; sort_order: number; created_at: string; updated_at: string };
type EntryRow = { id: string; notebook_id: string; entry_date: string; title: string; content: string; blocks_json: string; mood: string | null; tags_json: string; created_at: string; updated_at: string };
type TaskRow = { id: string; task_date: string; title: string; priority: number; due_time: string | null; completed: number; sort_order: number; created_at: string };
type WordRow = { id: string; source: string; translation: string; source_language: string; target_language: string; example: string; example_translation: string; notes: string; favorite: number; learned: number; repetitions: number; next_review: string; created_at: string };

const notebookModel = (r: NotebookRow): Notebook => ({ id: r.id, title: r.title, icon: r.icon, themeId: r.theme_id, sortOrder: r.sort_order, createdAt: r.created_at, updatedAt: r.updated_at });
const entryModel = (r: EntryRow): Entry => ({ id: r.id, notebookId: r.notebook_id, date: r.entry_date, title: r.title, content: r.content, blocks: JSON.parse(r.blocks_json) as EntryBlock[], mood: r.mood, tags: JSON.parse(r.tags_json) as string[], createdAt: r.created_at, updatedAt: r.updated_at });
const taskModel = (r: TaskRow): PlannerTask => ({ id: r.id, date: r.task_date, title: r.title, priority: r.priority, dueTime: r.due_time, completed: Boolean(r.completed), sortOrder: r.sort_order, createdAt: r.created_at });
const wordModel = (r: WordRow): VocabularyWord => ({ id: r.id, source: r.source, translation: r.translation, sourceLanguage: r.source_language, targetLanguage: r.target_language, example: r.example, exampleTranslation: r.example_translation, notes: r.notes, favorite: Boolean(r.favorite), learned: Boolean(r.learned), repetitions: r.repetitions, nextReview: r.next_review, createdAt: r.created_at });

export async function listNotebooks(db: SQLite.SQLiteDatabase): Promise<Notebook[]> {
  return (await db.getAllAsync<NotebookRow>('SELECT * FROM notebooks ORDER BY sort_order, created_at')).map(notebookModel);
}
export async function createNotebook(db: SQLite.SQLiteDatabase, title: string, themeId = 'warm'): Promise<string> {
  const timestamp = now(); const newId = id();
  const order = await db.getFirstAsync<{ max: number | null }>('SELECT MAX(sort_order) AS max FROM notebooks');
  await db.runAsync('INSERT INTO notebooks(id,title,icon,theme_id,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', newId, title.trim(), 'book-open', (themeId || 'warm'), (order?.max ?? -1) + 1, timestamp, timestamp);
  return newId;
}
export async function updateNotebook(db: SQLite.SQLiteDatabase, notebookId: string, patch: { title?: string; themeId?: string }): Promise<void> {
  const fields: string[] = []; const values: (string | number)[] = [];
  if (patch.title !== undefined) { fields.push('title=?'); values.push(patch.title.trim()); }
  if (patch.themeId !== undefined) { fields.push('theme_id=?'); values.push(patch.themeId); }
  if (!fields.length) return;
  fields.push('updated_at=?'); values.push(now(), notebookId);
  await db.runAsync(`UPDATE notebooks SET ${fields.join(',')} WHERE id=?`, ...values);
}
export async function deleteNotebook(db: SQLite.SQLiteDatabase, notebookId: string): Promise<void> {
  await db.runAsync('DELETE FROM notebooks WHERE id=?', notebookId);
}
export async function reorderNotebook(db: SQLite.SQLiteDatabase, notebookId: string, direction: -1 | 1): Promise<void> {
  const rows = await listNotebooks(db); const index = rows.findIndex((item) => item.id === notebookId); const other = rows[index + direction];
  if (index < 0 || !other) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE notebooks SET sort_order=? WHERE id=?', other.sortOrder, notebookId);
    await db.runAsync('UPDATE notebooks SET sort_order=? WHERE id=?', rows[index]!.sortOrder, other.id);
  });
}
export async function getNotebook(db: SQLite.SQLiteDatabase, notebookId: string): Promise<Notebook | null> {
  const row = await db.getFirstAsync<NotebookRow>('SELECT * FROM notebooks WHERE id=?', notebookId);
  return row ? notebookModel(row) : null;
}

export async function getEntry(db: SQLite.SQLiteDatabase, notebookId: string, date: string): Promise<Entry | null> {
  const row = await db.getFirstAsync<EntryRow>('SELECT * FROM entries WHERE notebook_id=? AND entry_date=?', notebookId, date);
  return row ? entryModel(row) : null;
}
export async function saveEntry(db: SQLite.SQLiteDatabase, input: Pick<Entry, 'notebookId' | 'date' | 'title' | 'content' | 'blocks' | 'mood' | 'tags'>, knownId?: string): Promise<string> {
  const timestamp = now(); const current = await getEntry(db, input.notebookId, input.date); const entryId = current?.id ?? knownId ?? id();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO entries(id,notebook_id,entry_date,title,content,blocks_json,mood,tags_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(notebook_id,entry_date) DO UPDATE SET title=excluded.title,content=excluded.content,
      blocks_json=excluded.blocks_json,mood=excluded.mood,tags_json=excluded.tags_json,updated_at=excluded.updated_at`,
      entryId, input.notebookId, input.date, input.title, input.content, JSON.stringify(input.blocks), input.mood,
      JSON.stringify(input.tags), current?.createdAt ?? timestamp, timestamp);
    const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM entries WHERE notebook_id=? AND entry_date=?', input.notebookId, input.date);
    const actualId = row?.id ?? entryId;
    await db.runAsync('DELETE FROM entry_blocks WHERE entry_id=?', actualId);
    await db.runAsync('DELETE FROM media_assets WHERE entry_id=?', actualId);
    for (let i = 0; i < input.blocks.length; i += 1) {
      const block = input.blocks[i]!;
      await db.runAsync('INSERT INTO entry_blocks(id,entry_id,block_order,block_type,payload_json) VALUES(?,?,?,?,?)', block.id, actualId, i, block.type, JSON.stringify(block));
      if (block.type === 'image' && block.uri?.startsWith('media/')) {
        const extension = block.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
        const mime = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
        await db.runAsync('INSERT INTO media_assets(id,entry_id,relative_path,mime_type,created_at) VALUES(?,?,?,?,?)', id(), actualId, block.uri, mime, timestamp);
      }
    }
    await db.runAsync(`INSERT INTO activity_events(id,event_type,event_date,reference_id,created_at)
      SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM activity_events WHERE event_type='writing' AND event_date=? AND reference_id=?)`, id(), 'writing', input.date, actualId, timestamp, input.date, actualId);
  });
  return entryId;
}
export async function listEntries(db: SQLite.SQLiteDatabase, notebookId?: string): Promise<Entry[]> {
  const sql = notebookId ? 'SELECT * FROM entries WHERE notebook_id=? ORDER BY entry_date DESC' : 'SELECT * FROM entries ORDER BY entry_date DESC';
  const rows = notebookId ? await db.getAllAsync<EntryRow>(sql, notebookId) : await db.getAllAsync<EntryRow>(sql);
  return rows.map(entryModel);
}
export async function deleteEntry(db: SQLite.SQLiteDatabase, entryId: string): Promise<void> { await db.runAsync('DELETE FROM entries WHERE id=?', entryId); }

export async function listTasks(db: SQLite.SQLiteDatabase, date: string): Promise<PlannerTask[]> {
  return (await db.getAllAsync<TaskRow>('SELECT * FROM tasks WHERE task_date=? ORDER BY sort_order, created_at', date)).map(taskModel);
}
export async function addTask(db: SQLite.SQLiteDatabase, date: string, title: string, priority = 0, dueTime: string | null = null): Promise<void> {
  const max = await db.getFirstAsync<{ max: number | null }>('SELECT MAX(sort_order) AS max FROM tasks WHERE task_date=?', date);
  await db.runAsync('INSERT INTO tasks(id,task_date,title,priority,due_time,completed,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?)', id(), date, title.trim(), priority, dueTime, 0, (max?.max ?? -1) + 1, now());
}
export async function updateTask(db: SQLite.SQLiteDatabase, taskId: string, patch: { title?: string; completed?: boolean; priority?: number; dueTime?: string | null }): Promise<void> {
  if (patch.title !== undefined) await db.runAsync('UPDATE tasks SET title=? WHERE id=?', patch.title.trim(), taskId);
  if (patch.completed !== undefined) await db.runAsync('UPDATE tasks SET completed=? WHERE id=?', patch.completed ? 1 : 0, taskId);
  if (patch.priority !== undefined) await db.runAsync('UPDATE tasks SET priority=? WHERE id=?', patch.priority, taskId);
  if (patch.dueTime !== undefined) await db.runAsync('UPDATE tasks SET due_time=? WHERE id=?', patch.dueTime, taskId);
}
export async function deleteTask(db: SQLite.SQLiteDatabase, taskId: string): Promise<void> { await db.runAsync('DELETE FROM tasks WHERE id=?', taskId); }
export async function moveTask(db: SQLite.SQLiteDatabase, task: PlannerTask, date: string): Promise<void> {
  const order = await db.getFirstAsync<{ max: number | null }>('SELECT MAX(sort_order) AS max FROM tasks WHERE task_date=?', date);
  await db.runAsync('UPDATE tasks SET task_date=?,completed=0,sort_order=? WHERE id=?', date, (order?.max ?? -1) + 1, task.id);
}
export async function reorderTask(db: SQLite.SQLiteDatabase, date: string, taskId: string, direction: -1 | 1): Promise<void> {
  const rows = await listTasks(db, date); const index = rows.findIndex((item) => item.id === taskId); const other = rows[index + direction];
  if (index < 0 || !other) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE tasks SET sort_order=? WHERE id=?', other.sortOrder, taskId);
    await db.runAsync('UPDATE tasks SET sort_order=? WHERE id=?', rows[index]!.sortOrder, other.id);
  });
}

export type VocabularySort = 'due' | 'alphabetical' | 'newest';
export async function listWords(db: SQLite.SQLiteDatabase, query = '', sort: VocabularySort = 'due'): Promise<VocabularyWord[]> {
  const ordering = sort === 'alphabetical' ? 'source COLLATE NOCASE, translation COLLATE NOCASE' : sort === 'newest' ? 'created_at DESC, source COLLATE NOCASE' : 'favorite DESC, next_review, created_at DESC';
  const rows = query.trim()
    ? await db.getAllAsync<WordRow>(`SELECT * FROM vocabulary_words WHERE source LIKE ? OR translation LIKE ? ORDER BY ${ordering}`, `%${query}%`, `%${query}%`)
    : await db.getAllAsync<WordRow>(`SELECT * FROM vocabulary_words ORDER BY ${ordering}`);
  return rows.map(wordModel);
}
export async function saveWord(db: SQLite.SQLiteDatabase, input: Partial<VocabularyWord> & Pick<VocabularyWord, 'source' | 'translation'>): Promise<void> {
  const wordId = input.id ?? id(); const date = localDate();
  await db.runAsync(`INSERT INTO vocabulary_words(id,source,translation,source_language,target_language,example,example_translation,notes,favorite,learned,repetitions,next_review,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source=excluded.source,translation=excluded.translation,
    source_language=excluded.source_language,target_language=excluded.target_language,example=excluded.example,
    example_translation=excluded.example_translation,notes=excluded.notes,favorite=excluded.favorite,learned=excluded.learned`,
    wordId, input.source.trim(), input.translation.trim(), input.sourceLanguage ?? 'en', input.targetLanguage ?? 'kk', input.example ?? '',
    input.exampleTranslation ?? '', input.notes ?? '', input.favorite ? 1 : 0, input.learned ? 1 : 0, input.repetitions ?? 0, input.nextReview ?? date, input.createdAt ?? now());
}
export async function deleteWord(db: SQLite.SQLiteDatabase, wordId: string): Promise<void> { await db.runAsync('DELETE FROM vocabulary_words WHERE id=?', wordId); }
export async function setWordLearningStatus(db: SQLite.SQLiteDatabase, wordId: string, learned: boolean): Promise<void> {
  await db.runAsync('UPDATE vocabulary_words SET learned=?,repetitions=CASE WHEN ?=1 THEN repetitions ELSE 0 END,next_review=CASE WHEN ?=1 THEN next_review ELSE ? END WHERE id=?', learned ? 1 : 0, learned ? 1 : 0, learned ? 1 : 0, localDate(), wordId);
}
export async function reviewWord(db: SQLite.SQLiteDatabase, word: VocabularyWord, remembered: boolean, nextDate: string, repetitions: number): Promise<void> {
  const date = localDate();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE vocabulary_words SET repetitions=?,next_review=?,learned=? WHERE id=?', repetitions, nextDate, remembered && repetitions >= 5 ? 1 : 0, word.id);
    await db.runAsync('INSERT INTO vocabulary_reviews(id,word_id,reviewed_at,remembered,repetition,next_review) VALUES(?,?,?,?,?,?)', id(), word.id, date, remembered ? 1 : 0, repetitions, nextDate);
    await db.runAsync('INSERT INTO activity_events(id,event_type,event_date,reference_id,created_at) VALUES(?,?,?,?,?)', id(), 'review', date, word.id, now());
  });
}
export async function getStats(db: SQLite.SQLiteDatabase): Promise<{ entries: number; words: number; tasksDone: number; tasksTotal: number; wordsReviewedToday: number; wordsLearned: number; totalWords: number; streak: number; longest: number; monthlyDays: string[] }> {
  const entryDates = (await db.getAllAsync<{ entry_date: string }>('SELECT DISTINCT entry_date FROM entries WHERE content<>\'\' OR title<>\'\'')).map((r) => r.entry_date);
  const textRows = await db.getAllAsync<{ title: string; content: string }>('SELECT title,content FROM entries');
  const wordsWritten = textRows.reduce((sum, row) => sum + wordCount(`${row.title} ${row.content}`), 0);
  const [entries, words, tasksDone, tasksTotal, reviewed, learned] = await Promise.all([
    db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM entries WHERE title<>'' OR content<>'' OR tags_json<>'[]' OR mood IS NOT NULL"), db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM vocabulary_words'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM tasks WHERE completed=1'), db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM tasks'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM vocabulary_reviews WHERE reviewed_at=?', localDate()),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM vocabulary_words WHERE learned=1')
  ]);
  const month = localDate().slice(0, 7);
  return { entries: entries?.count ?? 0, words: words?.count ?? 0, tasksDone: tasksDone?.count ?? 0, tasksTotal: tasksTotal?.count ?? 0, wordsReviewedToday: reviewed?.count ?? 0, wordsLearned: learned?.count ?? 0, totalWords: wordsWritten, streak: writingStreak(entryDates), longest: longestStreak(entryDates), monthlyDays: entryDates.filter((date) => date.startsWith(month)) };
}
