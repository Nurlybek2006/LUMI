import type * as SQLite from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { localDate, longestStreak, wordCount, writingStreak } from '@/utils/core';
import type { Entry, EntryBlock, Notebook, NotebookPage, NotebookType, PlannerTask, VocabularyWord } from '@/types/models';

const id = (): string => randomUUID();
const now = (): string => new Date().toISOString();

type NotebookRow = { id: string; title: string; type: NotebookType; icon: string; theme_id: Notebook['themeId']; sort_order: number; created_at: string; updated_at: string };
type EntryRow = { id: string; notebook_id: string; entry_date: string; title: string; content: string; blocks_json: string; mood: string | null; tags_json: string; created_at: string; updated_at: string };
type TaskRow = { id: string; notebook_id: string | null; task_date: string; title: string; priority: number; due_time: string | null; completed: number; sort_order: number; created_at: string };
type WordRow = { id: string; source: string; translation: string; source_language: string; target_language: string; example: string; example_translation: string; notes: string; favorite: number; learned: number; repetitions: number; next_review: string; created_at: string; vocabulary_notebook_id?: string | null; vocabulary_tags_json?: string | null };

const notebookModel = (r: NotebookRow): Notebook => ({ id: r.id, title: r.title, type: r.type, icon: r.icon, themeId: r.theme_id, sortOrder: r.sort_order, createdAt: r.created_at, updatedAt: r.updated_at });
const entryModel = (r: EntryRow): Entry => ({ id: r.id, notebookId: r.notebook_id, date: r.entry_date, title: r.title, content: r.content, blocks: JSON.parse(r.blocks_json) as EntryBlock[], mood: r.mood, tags: JSON.parse(r.tags_json) as string[], createdAt: r.created_at, updatedAt: r.updated_at });
const taskModel = (r: TaskRow): PlannerTask => ({ id: r.id, date: r.task_date, title: r.title, priority: r.priority, dueTime: r.due_time, completed: Boolean(r.completed), sortOrder: r.sort_order, createdAt: r.created_at, ...(r.notebook_id ? { notebookId: r.notebook_id } : {}) });
const wordModel = (r: WordRow): VocabularyWord => ({ id: r.id, source: r.source, translation: r.translation, sourceLanguage: r.source_language, targetLanguage: r.target_language, example: r.example, exampleTranslation: r.example_translation, notes: r.notes, favorite: Boolean(r.favorite), learned: Boolean(r.learned), repetitions: r.repetitions, nextReview: r.next_review, createdAt: r.created_at, ...(r.vocabulary_notebook_id ? { notebookId: r.vocabulary_notebook_id } : {}), ...(r.vocabulary_tags_json ? { tags: JSON.parse(r.vocabulary_tags_json) as string[] } : {}) });

export async function listNotebooks(db: SQLite.SQLiteDatabase): Promise<Notebook[]> {
  return (await db.getAllAsync<NotebookRow>('SELECT * FROM notebooks ORDER BY sort_order, created_at')).map(notebookModel);
}
export async function createNotebook(db: SQLite.SQLiteDatabase, title: string, themeId = 'warm', type: NotebookType = 'general'): Promise<string> {
  const timestamp = now(); const newId = id();
  const order = await db.getFirstAsync<{ max: number | null }>('SELECT MAX(sort_order) AS max FROM notebooks');
  await db.runAsync('INSERT INTO notebooks(id,title,icon,theme_id,sort_order,created_at,updated_at,type) VALUES(?,?,?,?,?,?,?,?)', newId, title.trim(), 'book-open', (themeId || 'warm'), (order?.max ?? -1) + 1, timestamp, timestamp, type);
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

type NotebookPageRow = { id: string; notebook_id: string; title: string; content: string; blocks_json: string; sort_order: number; created_at: string; updated_at: string };
const pageModel = (r: NotebookPageRow): NotebookPage => ({ id: r.id, notebookId: r.notebook_id, title: r.title, content: r.content, blocks: JSON.parse(r.blocks_json) as EntryBlock[], sortOrder: r.sort_order, createdAt: r.created_at, updatedAt: r.updated_at });

export async function listNotebookPages(db: SQLite.SQLiteDatabase, notebookId: string): Promise<NotebookPage[]> {
  return (await db.getAllAsync<NotebookPageRow>('SELECT * FROM notebook_pages WHERE notebook_id=? ORDER BY sort_order,created_at,id', notebookId)).map(pageModel);
}
export async function getNotebookPage(db: SQLite.SQLiteDatabase, pageId: string): Promise<NotebookPage | null> {
  const row = await db.getFirstAsync<NotebookPageRow>('SELECT * FROM notebook_pages WHERE id=?', pageId);
  return row ? pageModel(row) : null;
}
export async function saveNotebookPage(db: SQLite.SQLiteDatabase, input: Pick<NotebookPage, 'notebookId' | 'title' | 'content' | 'blocks'>, pageId?: string): Promise<string> {
  const timestamp = now(); const current = pageId ? await getNotebookPage(db, pageId) : null; const actualId = current?.id ?? id();
  const order = current?.sortOrder ?? ((await db.getFirstAsync<{ max: number | null }>('SELECT MAX(sort_order) AS max FROM notebook_pages WHERE notebook_id=?', input.notebookId))?.max ?? -1) + 1;
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO notebook_pages(id,notebook_id,title,content,blocks_json,sort_order,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET notebook_id=excluded.notebook_id,title=excluded.title,content=excluded.content,
      blocks_json=excluded.blocks_json,updated_at=excluded.updated_at`, actualId, input.notebookId, input.title, input.content, JSON.stringify(input.blocks), order, current?.createdAt ?? timestamp, timestamp);
    await db.runAsync('DELETE FROM notebook_page_media WHERE page_id=?', actualId);
    for (const block of input.blocks) if (block.type === 'image' && block.uri?.startsWith('media/')) await db.runAsync('INSERT OR IGNORE INTO notebook_page_media(page_id,relative_path) VALUES(?,?)', actualId, block.uri);
    await db.runAsync('UPDATE notebooks SET updated_at=? WHERE id=?', timestamp, input.notebookId);
    const eventDate = localDate();
    await db.runAsync(`INSERT INTO activity_events(id,event_type,event_date,reference_id,created_at)
      SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM activity_events WHERE event_type='writing' AND event_date=? AND reference_id=?)`, id(), 'writing', eventDate, actualId, timestamp, eventDate, actualId);
  });
  return actualId;
}
export async function renameNotebookPage(db: SQLite.SQLiteDatabase, pageId: string, title: string): Promise<void> { await db.runAsync('UPDATE notebook_pages SET title=?,updated_at=? WHERE id=?', title.trim(), now(), pageId); }
export async function duplicateNotebookPage(db: SQLite.SQLiteDatabase, pageId: string): Promise<string | null> {
  const page = await getNotebookPage(db, pageId); if (!page) return null;
  return saveNotebookPage(db, { notebookId: page.notebookId, title: page.title ? `${page.title} (көшірме)` : '', content: page.content, blocks: page.blocks.map((block) => ({ ...block, id: id() })) });
}
export async function moveNotebookPage(db: SQLite.SQLiteDatabase, pageId: string, notebookId: string): Promise<void> {
  const order = (await db.getFirstAsync<{ max: number | null }>('SELECT MAX(sort_order) AS max FROM notebook_pages WHERE notebook_id=?', notebookId))?.max ?? -1;
  await db.runAsync('UPDATE notebook_pages SET notebook_id=?,sort_order=?,updated_at=? WHERE id=?', notebookId, order + 1, now(), pageId);
}
export async function deleteNotebookPage(db: SQLite.SQLiteDatabase, pageId: string): Promise<void> { await db.withTransactionAsync(async () => { await db.runAsync('DELETE FROM notebook_pages WHERE id=?', pageId); await db.runAsync("DELETE FROM activity_events WHERE event_type='writing' AND reference_id=?", pageId); }); }

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

export async function listTasks(db: SQLite.SQLiteDatabase, date: string, notebookId?: string): Promise<PlannerTask[]> {
  const rows = notebookId ? await db.getAllAsync<TaskRow>('SELECT * FROM tasks WHERE task_date=? AND (notebook_id=? OR (?=\'plans\' AND notebook_id IS NULL)) ORDER BY sort_order,created_at', date, notebookId, notebookId) : await db.getAllAsync<TaskRow>('SELECT * FROM tasks WHERE task_date=? ORDER BY sort_order,created_at', date);
  return rows.map(taskModel);
}
export async function getTask(db: SQLite.SQLiteDatabase, taskId: string): Promise<PlannerTask | null> {
  const row = await db.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id=?', taskId);
  return row ? taskModel(row) : null;
}
export async function addTask(db: SQLite.SQLiteDatabase, date: string, title: string, priority = 0, dueTime: string | null = null, notebookId = 'plans'): Promise<void> {
  const exists = await db.getFirstAsync<{ id: string }>('SELECT id FROM notebooks WHERE id=?', notebookId);
  const scopedNotebookId = exists?.id ?? null;
  const max = await db.getFirstAsync<{ max: number | null }>('SELECT MAX(sort_order) AS max FROM tasks WHERE task_date=? AND notebook_id IS ?', date, scopedNotebookId);
  await db.runAsync('INSERT INTO tasks(id,notebook_id,task_date,title,priority,due_time,completed,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?,?)', id(), scopedNotebookId, date, title.trim(), priority, dueTime, 0, (max?.max ?? -1) + 1, now());
}
export async function updateTask(db: SQLite.SQLiteDatabase, taskId: string, patch: { title?: string; completed?: boolean; priority?: number; dueTime?: string | null }): Promise<void> {
  if (patch.title !== undefined) await db.runAsync('UPDATE tasks SET title=? WHERE id=?', patch.title.trim(), taskId);
  if (patch.completed !== undefined) await db.runAsync('UPDATE tasks SET completed=? WHERE id=?', patch.completed ? 1 : 0, taskId);
  if (patch.priority !== undefined) await db.runAsync('UPDATE tasks SET priority=? WHERE id=?', patch.priority, taskId);
  if (patch.dueTime !== undefined) await db.runAsync('UPDATE tasks SET due_time=? WHERE id=?', patch.dueTime, taskId);
}
export async function deleteTask(db: SQLite.SQLiteDatabase, taskId: string): Promise<void> { await db.runAsync('DELETE FROM tasks WHERE id=?', taskId); }
export async function moveTask(db: SQLite.SQLiteDatabase, task: PlannerTask, date: string): Promise<void> {
  const order = await db.getFirstAsync<{ max: number | null }>('SELECT MAX(sort_order) AS max FROM tasks WHERE task_date=? AND notebook_id IS ?', date, task.notebookId ?? null);
  await db.runAsync('UPDATE tasks SET task_date=?,completed=0,sort_order=? WHERE id=?', date, (order?.max ?? -1) + 1, task.id);
}
export async function reorderTask(db: SQLite.SQLiteDatabase, date: string, taskId: string, direction: -1 | 1): Promise<void> {
  const task = await getTask(db, taskId); const rows = await listTasks(db, date, task?.notebookId); const index = rows.findIndex((item) => item.id === taskId); const other = rows[index + direction];
  if (index < 0 || !other) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE tasks SET sort_order=? WHERE id=?', other.sortOrder, taskId);
    await db.runAsync('UPDATE tasks SET sort_order=? WHERE id=?', rows[index]!.sortOrder, other.id);
  });
}

export type VocabularySort = 'due' | 'alphabetical' | 'newest';
export async function listWords(db: SQLite.SQLiteDatabase, query = '', sort: VocabularySort = 'due', notebookId?: string): Promise<VocabularyWord[]> {
  const ordering = sort === 'alphabetical' ? 'w.source COLLATE NOCASE, w.translation COLLATE NOCASE' : sort === 'newest' ? 'w.created_at DESC, w.source COLLATE NOCASE' : 'w.favorite DESC, w.next_review, w.created_at DESC';
  const scope = notebookId ? '(ve.notebook_id=? OR ve.notebook_id IS NULL)' : '1=1';
  const rows = query.trim()
    ? await db.getAllAsync<WordRow>(`SELECT w.*,ve.notebook_id AS vocabulary_notebook_id,ve.tags_json AS vocabulary_tags_json FROM vocabulary_words w LEFT JOIN vocabulary_entries ve ON ve.id=w.id WHERE ${scope} AND (w.source LIKE ? OR w.translation LIKE ? OR EXISTS(SELECT 1 FROM vocabulary_translations vt WHERE vt.entry_id=w.id AND vt.value LIKE ?)) ORDER BY ${ordering}`, ...(notebookId ? [notebookId] : []), `%${query}%`, `%${query}%`, `%${query}%`)
    : await db.getAllAsync<WordRow>(`SELECT w.*,ve.notebook_id AS vocabulary_notebook_id,ve.tags_json AS vocabulary_tags_json FROM vocabulary_words w LEFT JOIN vocabulary_entries ve ON ve.id=w.id WHERE ${scope} ORDER BY ${ordering}`, ...(notebookId ? [notebookId] : []));
  const words = rows.map(wordModel); const translationsByWord = new Map<string, VocabularyWord['translations']>();
  for (let offset = 0; offset < words.length; offset += 900) {
    const batch = words.slice(offset, offset + 900); if (!batch.length) continue;
    const placeholders = batch.map(() => '?').join(',');
    const translations = await db.getAllAsync<{ id: string; entry_id: string; language_code: string; value: string; display_order: number }>(`SELECT id,entry_id,language_code,value,display_order FROM vocabulary_translations WHERE entry_id IN (${placeholders}) ORDER BY entry_id,display_order,id`, ...batch.map((word) => word.id));
    for (const item of translations) {
      const current = translationsByWord.get(item.entry_id) ?? [];
      current.push({ id: item.id, entryId: item.entry_id, languageCode: item.language_code, value: item.value, displayOrder: item.display_order });
      translationsByWord.set(item.entry_id, current);
    }
  }
  for (const word of words) {
    word.translations = translationsByWord.get(word.id) ?? [];
    if (word.translations.length) {
      word.source = word.translations[0]?.value ?? word.source;
      word.sourceLanguage = word.translations[0]?.languageCode ?? word.sourceLanguage;
      word.translation = word.translations[1]?.value ?? word.translation;
      word.targetLanguage = word.translations[1]?.languageCode ?? word.targetLanguage;
    }
  }
  return words;
}
export async function saveWord(db: SQLite.SQLiteDatabase, input: Partial<VocabularyWord> & Pick<VocabularyWord, 'source' | 'translation'>): Promise<void> {
  const wordId = input.id ?? id(); const date = localDate();
  const created = input.createdAt ?? now(); const changed = now();
  await db.withTransactionAsync(async () => {
  await db.runAsync(`INSERT INTO vocabulary_words(id,source,translation,source_language,target_language,example,example_translation,notes,favorite,learned,repetitions,next_review,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source=excluded.source,translation=excluded.translation,
    source_language=excluded.source_language,target_language=excluded.target_language,example=excluded.example,
    example_translation=excluded.example_translation,notes=excluded.notes,favorite=excluded.favorite,learned=excluded.learned`,
    wordId, input.source.trim(), input.translation.trim(), input.sourceLanguage ?? 'en', input.targetLanguage ?? 'kk', input.example ?? '',
    input.exampleTranslation ?? '', input.notes ?? '', input.favorite ? 1 : 0, input.learned ? 1 : 0, input.repetitions ?? 0, input.nextReview ?? date, created);
  await db.runAsync(`INSERT INTO vocabulary_entries(id,notebook_id,example,example_translation,notes,tags_json,favorite,learned,repetitions,next_review,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET example=excluded.example,example_translation=excluded.example_translation,
    notes=excluded.notes,tags_json=excluded.tags_json,favorite=excluded.favorite,learned=excluded.learned,updated_at=excluded.updated_at`, wordId, input.notebookId ?? null,
    input.example ?? '', input.exampleTranslation ?? '', input.notes ?? '', JSON.stringify(input.tags ?? []), input.favorite ? 1 : 0, input.learned ? 1 : 0, input.repetitions ?? 0, input.nextReview ?? date, created, changed);
  const pair = input.translations?.length ? input.translations.map((item) => ({ languageCode: item.languageCode, value: item.value.trim() })).filter((item) => item.value) : [{ languageCode: input.sourceLanguage ?? 'en', value: input.source.trim() }, { languageCode: input.targetLanguage ?? 'kk', value: input.translation.trim() }];
  if (new Set(pair.map((item) => item.languageCode)).size !== pair.length) throw new Error('Әр тіл бір рет қана көрсетілуі керек.');
  await db.runAsync('DELETE FROM vocabulary_translations WHERE entry_id=?', wordId);
  for (let index = 0; index < pair.length; index += 1) { const item = pair[index]!; await db.runAsync('INSERT INTO vocabulary_translations(id,entry_id,language_code,value,display_order) VALUES(?,?,?,?,?)', `${wordId}:legacy:${item.languageCode}`, wordId, item.languageCode, item.value, index); }
  });
}
export async function saveMultilingualWord(db: SQLite.SQLiteDatabase, input: { id?: string; notebookId: string; translations: { languageCode: string; value: string }[]; example?: string; exampleTranslation?: string; notes?: string; tags?: string[]; favorite?: boolean; learned?: boolean; repetitions?: number; nextReview?: string; createdAt?: string }): Promise<string> {
  const clean = input.translations.map((item) => ({ languageCode: item.languageCode.trim().toLowerCase(), value: item.value.trim() })).filter((item) => item.languageCode && item.value);
  if (clean.length < 2) throw new Error('Кемінде екі тілдегі сөзді енгізіңіз.');
  if (new Set(clean.map((item) => item.languageCode)).size !== clean.length) throw new Error('Әр тіл бір рет қана көрсетілуі керек.');
  const wordId = input.id ?? id(); const timestamp = now(); const date = localDate(); const first = clean[0]!; const second = clean[1]!;
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO vocabulary_words(id,source,translation,source_language,target_language,example,example_translation,notes,favorite,learned,repetitions,next_review,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source=excluded.source,translation=excluded.translation,source_language=excluded.source_language,
      target_language=excluded.target_language,example=excluded.example,example_translation=excluded.example_translation,notes=excluded.notes,favorite=excluded.favorite,learned=excluded.learned`,
      wordId, first.value, second.value, first.languageCode, second.languageCode, input.example ?? '', input.exampleTranslation ?? '', input.notes ?? '', input.favorite ? 1 : 0, input.learned ? 1 : 0, input.repetitions ?? 0, input.nextReview ?? date, input.createdAt ?? timestamp);
    await db.runAsync(`INSERT INTO vocabulary_entries(id,notebook_id,example,example_translation,notes,tags_json,favorite,learned,repetitions,next_review,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET notebook_id=excluded.notebook_id,example=excluded.example,example_translation=excluded.example_translation,
      notes=excluded.notes,tags_json=excluded.tags_json,favorite=excluded.favorite,learned=excluded.learned,updated_at=excluded.updated_at`, wordId, input.notebookId, input.example ?? '', input.exampleTranslation ?? '', input.notes ?? '', JSON.stringify(input.tags ?? []), input.favorite ? 1 : 0, input.learned ? 1 : 0, input.repetitions ?? 0, input.nextReview ?? date, input.createdAt ?? timestamp, timestamp);
    await db.runAsync('DELETE FROM vocabulary_translations WHERE entry_id=?', wordId);
    for (let index = 0; index < clean.length; index += 1) { const item = clean[index]!; await db.runAsync('INSERT INTO vocabulary_translations(id,entry_id,language_code,value,display_order) VALUES(?,?,?,?,?)', `${wordId}:lang:${item.languageCode}`, wordId, item.languageCode, item.value, index); }
  });
  return wordId;
}
export async function listVocabularyLanguages(db: SQLite.SQLiteDatabase, notebookId: string): Promise<string[]> {
  const configured = await db.getAllAsync<{ language_code: string }>('SELECT language_code FROM vocabulary_notebook_languages WHERE notebook_id=? ORDER BY display_order,language_code', notebookId);
  if (configured.length) return configured.map((row) => row.language_code);
  const legacy = await db.getAllAsync<{ language_code: string }>('SELECT DISTINCT language_code FROM vocabulary_translations WHERE entry_id IN (SELECT id FROM vocabulary_entries WHERE notebook_id IS NULL) ORDER BY language_code');
  return legacy.length ? legacy.map((row) => row.language_code) : ['kk', 'ru', 'en'];
}
export async function saveVocabularyLanguages(db: SQLite.SQLiteDatabase, notebookId: string, languages: string[]): Promise<void> {
  const values = [...new Set(languages.map((language) => language.trim().toLowerCase()).filter((language) => /^[a-z]{2,3}([_-][a-z0-9]{2,8})?$/u.test(language)))];
  if (values.length < 2) throw new Error('Сөздікке кемінде екі тіл таңдаңыз.');
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM vocabulary_notebook_languages WHERE notebook_id=?', notebookId);
    for (let index = 0; index < values.length; index += 1) await db.runAsync('INSERT INTO vocabulary_notebook_languages(notebook_id,language_code,display_order) VALUES(?,?,?)', notebookId, values[index]!, index);
  });
}
export async function deleteWord(db: SQLite.SQLiteDatabase, wordId: string): Promise<void> { await db.withTransactionAsync(async () => { await db.runAsync('DELETE FROM vocabulary_entries WHERE id=?', wordId); await db.runAsync('DELETE FROM vocabulary_words WHERE id=?', wordId); }); }
export async function setWordLearningStatus(db: SQLite.SQLiteDatabase, wordId: string, learned: boolean): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE vocabulary_words SET learned=?,repetitions=CASE WHEN ?=1 THEN repetitions ELSE 0 END,next_review=CASE WHEN ?=1 THEN next_review ELSE ? END WHERE id=?', learned ? 1 : 0, learned ? 1 : 0, learned ? 1 : 0, localDate(), wordId);
    await db.runAsync('UPDATE vocabulary_entries SET learned=?,repetitions=CASE WHEN ?=1 THEN repetitions ELSE 0 END,next_review=CASE WHEN ?=1 THEN next_review ELSE ? END,updated_at=? WHERE id=?', learned ? 1 : 0, learned ? 1 : 0, learned ? 1 : 0, localDate(), now(), wordId);
  });
}
export async function reviewWord(db: SQLite.SQLiteDatabase, word: VocabularyWord, remembered: boolean, nextDate: string, repetitions: number): Promise<void> {
  const date = localDate();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE vocabulary_words SET repetitions=?,next_review=?,learned=? WHERE id=?', repetitions, nextDate, remembered && repetitions >= 5 ? 1 : 0, word.id);
    await db.runAsync('UPDATE vocabulary_entries SET repetitions=?,next_review=?,learned=?,updated_at=? WHERE id=?', repetitions, nextDate, remembered && repetitions >= 5 ? 1 : 0, now(), word.id);
    await db.runAsync('INSERT INTO vocabulary_reviews(id,word_id,reviewed_at,remembered,repetition,next_review) VALUES(?,?,?,?,?,?)', id(), word.id, date, remembered ? 1 : 0, repetitions, nextDate);
    await db.runAsync('INSERT INTO activity_events(id,event_type,event_date,reference_id,created_at) VALUES(?,?,?,?,?)', id(), 'review', date, word.id, now());
  });
}
export async function getStats(db: SQLite.SQLiteDatabase): Promise<{ entries: number; words: number; tasksDone: number; tasksTotal: number; wordsReviewedToday: number; wordsLearned: number; totalWords: number; streak: number; longest: number; monthlyDays: string[] }> {
  const [entryDateRows, pageDateRows, entryTextRows, pageTextRows] = await Promise.all([
    db.getAllAsync<{ entry_date: string }>('SELECT DISTINCT entry_date FROM entries WHERE content<>\'\' OR title<>\'\''),
    db.getAllAsync<{ entry_date: string }>("SELECT DISTINCT substr(updated_at,1,10) AS entry_date FROM notebook_pages WHERE content<>'' OR title<>''"),
    db.getAllAsync<{ title: string; content: string }>('SELECT title,content FROM entries'),
    db.getAllAsync<{ title: string; content: string }>('SELECT title,content FROM notebook_pages')
  ]);
  const entryDates = [...new Set([...entryDateRows, ...pageDateRows].map((row) => row.entry_date))];
  const textRows = [...entryTextRows, ...pageTextRows];
  const wordsWritten = textRows.reduce((sum, row) => sum + wordCount(`${row.title} ${row.content}`), 0);
  const [entries, generalPages, words, tasksDone, tasksTotal, reviewed, learned] = await Promise.all([
    db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM entries WHERE title<>'' OR content<>'' OR tags_json<>'[]' OR mood IS NOT NULL"),
    db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM notebook_pages WHERE title<>'' OR content<>'' OR blocks_json<>'[]'"),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM vocabulary_words'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM tasks WHERE completed=1'), db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM tasks'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM vocabulary_reviews WHERE reviewed_at=?', localDate()),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM vocabulary_words WHERE learned=1')
  ]);
  const month = localDate().slice(0, 7);
  return { entries: (entries?.count ?? 0) + (generalPages?.count ?? 0), words: words?.count ?? 0, tasksDone: tasksDone?.count ?? 0, tasksTotal: tasksTotal?.count ?? 0, wordsReviewedToday: reviewed?.count ?? 0, wordsLearned: learned?.count ?? 0, totalWords: wordsWritten, streak: writingStreak(entryDates), longest: longestStreak(entryDates), monthlyDays: entryDates.filter((date) => date.startsWith(month)) };
}
