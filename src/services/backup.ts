import type * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import { fromByteArray } from 'base64-js';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { randomUUID } from 'expo-crypto';
import { validateBackupManifest, safeArchivePath } from '@/utils/core';

const tableNames = ['notebooks', 'entries', 'entry_blocks', 'media_assets', 'tasks', 'vocabulary_words', 'vocabulary_reviews', 'app_settings', 'activity_events'] as const;
type TableName = (typeof tableNames)[number];
type BackupData = { schemaVersion: 1; tables: Record<TableName, Record<string, unknown>[]> };
type BackupManifest = { format: 'lumi-backup'; version: 1; createdAt: string; database: 'data.json'; files: string[]; checksums: Record<string, string> };
const MAX_BACKUP_BYTES = 400 * 1024 * 1024;

function inspectZip(bytes: Uint8Array): string[] {
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_BACKUP_BYTES) throw new Error('Сақтық көшірменің көлемі қолдау шегінен тыс.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let at = bytes.byteLength - 22, min = Math.max(0, bytes.byteLength - 65_557); at >= min; at -= 1) {
    if (view.getUint32(at, true) === 0x06054b50) { eocd = at; break; }
  }
  if (eocd < 0 || eocd + 22 + view.getUint16(eocd + 20, true) !== bytes.byteLength) throw new Error('ZIP құрылымы жарамсыз.');
  const entryCount = view.getUint16(eocd + 10, true); const directorySize = view.getUint32(eocd + 12, true); let cursor = view.getUint32(eocd + 16, true);
  if (entryCount === 0xffff || cursor + directorySize > eocd || entryCount > 10_000) throw new Error('ZIP өлшемдері жарамсыз.');
  const paths: string[] = []; let totalExpanded = 0;
  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('ZIP файл тізімі бүлінген.');
    const flags = view.getUint16(cursor + 8, true); const method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true); const expanded = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true); const extraLength = view.getUint16(cursor + 30, true); const commentLength = view.getUint16(cursor + 32, true);
    if ((flags & 1) !== 0 || (method !== 0 && method !== 8) || compressed === 0xffffffff || expanded === 0xffffffff || expanded > MAX_BACKUP_BYTES) throw new Error('ZIP файл түрі қолдау таппайды.');
    const start = cursor + 46; const end = start + nameLength;
    if (end + extraLength + commentLength > bytes.byteLength) throw new Error('ZIP жолы жарамсыз.');
    const path = strFromU8(bytes.subarray(start, end));
    if (!safeArchivePath(path)) throw new Error('Архивте рұқсат етілмеген файл жолы бар.');
    totalExpanded += expanded;
    if (totalExpanded > MAX_BACKUP_BYTES) throw new Error('Сақтық көшірменің ашылған көлемі тым үлкен.');
    paths.push(path); cursor = end + extraLength + commentLength;
  }
  if (cursor > view.getUint32(eocd + 16, true) + directorySize) throw new Error('ZIP каталогы бүлінген.');
  return paths;
}

async function checksum(bytes: Uint8Array): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, fromByteArray(bytes));
}

async function snapshot(db: SQLite.SQLiteDatabase): Promise<BackupData> {
  const tables = {} as BackupData['tables'];
  await db.withTransactionAsync(async () => {
    for (const name of tableNames) {
      const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${name}`);
      tables[name] = rows;
    }
  });
  return { schemaVersion: 1, tables };
}

export async function exportBackup(db: SQLite.SQLiteDatabase): Promise<string> {
  const data = snapshot(db);
  const snapshotData = await data;
  const mediaRows = snapshotData.tables.media_assets;
  const files: Record<string, Uint8Array> = { 'data.json': strToU8(JSON.stringify(snapshotData)) };
  const checksums: Record<string, string> = { 'data.json': await checksum(files['data.json']!) };
  for (const row of mediaRows) {
    const relativePath = String(row.relative_path ?? '');
    if (!safeArchivePath(relativePath) || !relativePath.startsWith('media/')) throw new Error('Сурет жолы жарамсыз, сақтық көшірме тоқтатылды.');
    const file = new File(Paths.document, relativePath);
    if (!file.exists) throw new Error(`Жазба суреті табылмады: ${relativePath}`);
    const bytes = await file.bytes();
    files[relativePath] = bytes;
    checksums[relativePath] = await checksum(bytes);
  }
  if (Object.values(files).reduce((total, bytes) => total + bytes.byteLength, 0) > MAX_BACKUP_BYTES) throw new Error('Сақтық көшірме файлы 400 МБ-тан үлкен.');
  const manifest: BackupManifest = { format: 'lumi-backup', version: 1, createdAt: new Date().toISOString(), database: 'data.json', files: Object.keys(files), checksums };
  const archive = zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), ...files }, { level: 6 });
  const output = new File(Paths.cache, `LUMI-backup-${new Date().toISOString().slice(0, 10)}.lumibackup`);
  output.write(archive);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Бұл құрылғыда файл бөлісу қолжетімсіз.');
  await Sharing.shareAsync(output.uri, { mimeType: 'application/zip', dialogTitle: 'LUMI сақтық көшірмесі' });
  return output.uri;
}

function validateData(value: unknown): value is BackupData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1 || !data.tables || typeof data.tables !== 'object') return false;
  const tables = data.tables as Record<string, unknown>;
  return tableNames.every((name) => Array.isArray(tables[name]) && (tables[name] as unknown[]).every((row) => !!row && typeof row === 'object' && !Array.isArray(row)));
}

const allowedColumns: Record<TableName, string[]> = {
  notebooks: ['id', 'title', 'icon', 'theme_id', 'sort_order', 'created_at', 'updated_at'],
  entries: ['id', 'notebook_id', 'entry_date', 'title', 'content', 'blocks_json', 'mood', 'tags_json', 'created_at', 'updated_at'],
  entry_blocks: ['id', 'entry_id', 'block_order', 'block_type', 'payload_json'],
  media_assets: ['id', 'entry_id', 'relative_path', 'mime_type', 'created_at'],
  tasks: ['id', 'task_date', 'title', 'priority', 'due_time', 'completed', 'sort_order', 'created_at'],
  vocabulary_words: ['id', 'source', 'translation', 'source_language', 'target_language', 'example', 'example_translation', 'notes', 'favorite', 'learned', 'repetitions', 'next_review', 'created_at'],
  vocabulary_reviews: ['id', 'word_id', 'reviewed_at', 'remembered', 'repetition', 'next_review'],
  app_settings: ['key', 'value'], activity_events: ['id', 'event_type', 'event_date', 'reference_id', 'created_at']
};

export async function importBackup(db: SQLite.SQLiteDatabase, confirmReplace: (counts: { notebookCount: number; entryCount: number }) => Promise<boolean>): Promise<{ notebookCount: number; entryCount: number; cancelled?: boolean }> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/octet-stream'], copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets[0]) return { notebookCount: 0, entryCount: 0, cancelled: true };
  const archiveBytes = await new File(picked.assets[0].uri).bytes();
  const archivePaths = inspectZip(archiveBytes);
  const archive = unzipSync(archiveBytes);
  const manifestBytes = archive['manifest.json'];
  if (!manifestBytes) throw new Error('Сақтық көшірме манифесті табылмады.');
  let manifest: unknown;
  try { manifest = JSON.parse(strFromU8(manifestBytes)); } catch { throw new Error('Сақтық көшірме манифесті оқылмады.'); }
  if (!validateBackupManifest(manifest)) throw new Error('Бұл LUMI сақтық көшірмесі емес немесе нұсқасы қолдау таппайды.');
  if (archivePaths.length !== manifest.files.length + 1 || archivePaths.some((path) => path !== 'manifest.json' && !manifest.files.includes(path))) throw new Error('Архивтегі файлдар тізімі манифестпен сәйкес келмейді.');
  for (const path of manifest.files) {
    const bytes = archive[path];
    if (!bytes || manifest.checksums[path] !== await checksum(bytes)) throw new Error(`Файл бүтіндігі тексерілмеді: ${path}`);
  }
  const dataBytes = archive['data.json'];
  if (!dataBytes) throw new Error('Деректер файлы жоқ.');
  let parsed: unknown;
  try { parsed = JSON.parse(strFromU8(dataBytes)); } catch { throw new Error('Деректер файлы бүлінген.'); }
  if (!validateData(parsed)) throw new Error('Сақтық көшірмедегі деректер құрылымы жарамсыз.');
  const data = parsed;
  for (const row of data.tables.media_assets) {
    const oldPath = String(row.relative_path ?? '');
    if (!oldPath || !manifest.files.includes(oldPath)) throw new Error(`Сурет файлы сақтық көшірмеде жоқ: ${oldPath}`);
  }

  const counts = { notebookCount: data.tables.notebooks.length, entryCount: data.tables.entries.length };
  if (!(await confirmReplace(counts))) return { ...counts, cancelled: true };

  // Validate every byte before writing media or replacing the current database.
  const mediaDir = new Directory(Paths.document, 'media');
  mediaDir.create({ intermediates: true, idempotent: true });
  const pathMap = new Map<string, string>();
  for (const oldPath of new Set(data.tables.media_assets.map((r) => String(r.relative_path)))) {
    const extension = oldPath.split('.').pop()?.replace(/[^a-z0-9]/giu, '') || 'img';
    const newPath = `media/${randomUUID()}.${extension}`;
    const target = new File(Paths.document, newPath);
    target.write(archive[oldPath]!);
    pathMap.set(oldPath, newPath);
  }
  for (const row of data.tables.media_assets) row.relative_path = pathMap.get(String(row.relative_path))!;
  for (const row of data.tables.entries) {
    try {
      const blocks = JSON.parse(String(row.blocks_json ?? '[]')) as { uri?: string }[];
      for (const block of blocks) if (block.uri && pathMap.has(block.uri)) block.uri = pathMap.get(block.uri)!;
      row.blocks_json = JSON.stringify(blocks);
    } catch { throw new Error('Жазба блоктарының құрылымы жарамсыз.'); }
  }

  await db.withTransactionAsync(async () => {
    await db.execAsync('PRAGMA defer_foreign_keys = ON; DELETE FROM entry_blocks; DELETE FROM media_assets; DELETE FROM entries; DELETE FROM tasks; DELETE FROM vocabulary_reviews; DELETE FROM vocabulary_words; DELETE FROM activity_events; DELETE FROM notebooks; DELETE FROM app_settings;');
    for (const table of tableNames) {
      for (const row of data.tables[table]) {
        const columns = allowedColumns[table].filter((column) => Object.hasOwn(row, column));
        if (!columns.length) continue;
        const placeholders = columns.map(() => '?').join(',');
        const query = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;
        await db.runAsync(query, ...columns.map((column) => row[column] as string | number | null));
      }
    }
    await db.runAsync("INSERT OR REPLACE INTO app_settings(key,value) VALUES('defaults_seeded','true')");
  });
  return counts;
}
