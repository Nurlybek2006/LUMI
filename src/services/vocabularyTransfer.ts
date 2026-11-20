import type * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import type { VocabularyWord } from '@/types/models';
import { saveWord } from '@/database/repository';

type TransferDocument = { format: 'lumi-vocabulary'; version: 1; exportedAt: string; words: VocabularyWord[] };

export async function exportVocabulary(db: SQLite.SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM vocabulary_words ORDER BY source COLLATE NOCASE');
  const words = rows.map((row) => ({ id: String(row.id), source: String(row.source), translation: String(row.translation), sourceLanguage: String(row.source_language), targetLanguage: String(row.target_language), example: String(row.example), exampleTranslation: String(row.example_translation), notes: String(row.notes), favorite: Boolean(row.favorite), learned: Boolean(row.learned), repetitions: Number(row.repetitions), nextReview: String(row.next_review), createdAt: String(row.created_at) }));
  const data: TransferDocument = { format: 'lumi-vocabulary', version: 1, exportedAt: new Date().toISOString(), words };
  const folder = new Directory(Paths.cache, 'exports'); folder.create({ intermediates: true, idempotent: true });
  const file = new File(folder, 'lumi-vocabulary.json'); await file.write(JSON.stringify(data, null, 2));
  if (!file.exists) throw new Error('JSON экспорт файлы жасалмады.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Файл бөлісу қолжетімсіз.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'LUMI сөздігін экспорттау' });
}

export async function importVocabulary(db: SQLite.SQLiteDatabase): Promise<number> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
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
  await db.withTransactionAsync(async () => {
    for (const word of valid) await saveWord(db, word);
  });
  return valid.length;
}
