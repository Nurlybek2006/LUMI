import type * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import type { VocabularyWord } from '@/types/models';
import { saveMultilingualWord } from '@/database/repository';
import { withExternalActivity } from '@/services/externalActivity';

type TransferDocument = { format: 'lumi-vocabulary'; version: 1; exportedAt: string; words: VocabularyWord[] };

export async function exportVocabulary(db: SQLite.SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<Record<string, unknown>>('SELECT w.*,ve.notebook_id,ve.tags_json FROM vocabulary_words w LEFT JOIN vocabulary_entries ve ON ve.id=w.id ORDER BY w.source COLLATE NOCASE');
  const words: VocabularyWord[] = rows.map((row) => ({
    id: String(row.id), source: String(row.source), translation: String(row.translation), sourceLanguage: String(row.source_language), targetLanguage: String(row.target_language),
    example: String(row.example), exampleTranslation: String(row.example_translation), notes: String(row.notes), favorite: Boolean(row.favorite), learned: Boolean(row.learned),
    repetitions: Number(row.repetitions), nextReview: String(row.next_review), createdAt: String(row.created_at),
    ...(typeof row.notebook_id === 'string' ? { notebookId: row.notebook_id } : {}),
    ...(typeof row.tags_json === 'string' ? { tags: JSON.parse(row.tags_json) as string[] } : {})
  }));
  for (let offset = 0; offset < words.length; offset += 900) {
    const batch = words.slice(offset, offset + 900);
    if (!batch.length) continue;
    const placeholders = batch.map(() => '?').join(',');
    const translations = await db.getAllAsync<{ id: string; entry_id: string; language_code: string; value: string; display_order: number }>(
      `SELECT id,entry_id,language_code,value,display_order FROM vocabulary_translations WHERE entry_id IN (${placeholders}) ORDER BY entry_id,display_order,id`,
      ...batch.map((word) => word.id)
    );
    const byWord = new Map<string, NonNullable<VocabularyWord['translations']>>();
    for (const item of translations) {
      const values = byWord.get(item.entry_id) ?? [];
      values.push({ id: item.id, entryId: item.entry_id, languageCode: item.language_code, value: item.value, displayOrder: item.display_order });
      byWord.set(item.entry_id, values);
    }
    for (const word of batch) word.translations = byWord.get(word.id) ?? [];
  }
  const data: TransferDocument = { format: 'lumi-vocabulary', version: 1, exportedAt: new Date().toISOString(), words };
  const folder = new Directory(Paths.cache, 'exports'); folder.create({ intermediates: true, idempotent: true });
  const file = new File(folder, 'lumi-vocabulary.json'); await file.write(JSON.stringify(data, null, 2));
  if (!file.exists) throw new Error('JSON экспорт файлы жасалмады.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Файл бөлісу қолжетімсіз.');
  await withExternalActivity(() => Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'LUMI сөздігін экспорттау' }));
}

export async function importVocabulary(db: SQLite.SQLiteDatabase): Promise<number> {
  const picked = await withExternalActivity(() => DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true }));
  if (picked.canceled || !picked.assets[0]) return 0;
  let value: unknown;
  try { value = JSON.parse(await new File(picked.assets[0].uri).text()); } catch { throw new Error('JSON файлы оқылмады.'); }
  if (!value || typeof value !== 'object') throw new Error('Файл форматы жарамсыз.');
  const data = value as Record<string, unknown>;
  if (data.format !== 'lumi-vocabulary' || data.version !== 1 || !Array.isArray(data.words)) throw new Error('Бұл LUMI сөздік файлы емес.');
  const valid = (data.words as unknown[]).filter((row): row is VocabularyWord => {
    if (!row || typeof row !== 'object') return false;
    const item = row as Record<string, unknown>;
    return typeof item.source === 'string' && typeof item.translation === 'string' && item.source.length <= 500 && item.translation.length <= 1000;
  });
  if (valid.length !== data.words.length) throw new Error('Кейбір сөздерде міндетті атау немесе аударма жоқ.');
  for (const word of valid) {
    const notebook = word.notebookId ? await db.getFirstAsync<{ id: string }>("SELECT id FROM notebooks WHERE id=? AND type='vocabulary'", word.notebookId) : null;
    const translations = word.translations?.length ? word.translations.map(({ id, languageCode, value }) => ({ id, languageCode, value })) : [
      { languageCode: word.sourceLanguage || 'en', value: word.source },
      { languageCode: word.targetLanguage || 'kk', value: word.translation }
    ];
    await saveMultilingualWord(db, {
      id: word.id, ...(notebook ? { notebookId: notebook.id } : {}), translations,
      example: word.example, exampleTranslation: word.exampleTranslation, notes: word.notes,
      ...(word.tags ? { tags: word.tags } : {}), favorite: word.favorite, learned: word.learned,
      repetitions: word.repetitions, nextReview: word.nextReview, createdAt: word.createdAt
    });
  }
  return valid.length;
}
