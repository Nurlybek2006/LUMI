import type * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import { fromByteArray } from 'base64-js';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { randomUUID } from 'expo-crypto';
import { validateBackupManifest, safeArchivePath } from '@/utils/core';
import { backupTableNames as tableNames, normalizeBackupData, replaceBackupTables, validateBackupData, type BackupData } from '@/services/backupData';

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
  return { schemaVersion: 2, tables };
}

export async function exportBackup(db: SQLite.SQLiteDatabase): Promise<string> {
  const data = snapshot(db);
  const snapshotData = await data;
  const mediaRows = [...snapshotData.tables.media_assets, ...snapshotData.tables.notebook_page_media];
  const files: Record<string, Uint8Array> = { 'data.json': strToU8(JSON.stringify(snapshotData)) };
  const checksums: Record<string, string> = { 'data.json': await checksum(files['data.json']!) };
  for (const row of mediaRows) {
    const relativePath = String(row.relative_path ?? '');
    if (!safeArchivePath(relativePath) || !relativePath.startsWith('media/')) throw new Error('Сурет жолы жарамсыз, сақтық көшірме тоқтатылды.');
    const file = new File(Paths.document, relativePath);
    if (!file.exists) throw new Error(`Жазба суреті табылмады: ${relativePath}`);
    if (!files[relativePath]) {
      const bytes = await file.bytes();
      files[relativePath] = bytes;
      checksums[relativePath] = await checksum(bytes);
    }
  }
  if (Object.values(files).reduce((total, bytes) => total + bytes.byteLength, 0) > MAX_BACKUP_BYTES) throw new Error('Сақтық көшірме файлы 400 МБ-тан үлкен.');
  const manifest: BackupManifest = { format: 'lumi-backup', version: 1, createdAt: new Date().toISOString(), database: 'data.json', files: Object.keys(files), checksums };
  const archive = zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), ...files }, { level: 6 });
  const output = new File(Paths.cache, `LUMI-backup-${new Date().toISOString().slice(0, 10)}.lumibackup`);
  await output.write(archive);
  if (!output.exists || output.size !== archive.byteLength) throw new Error('Сақтық көшірме файлы толық жасалмады.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Бұл құрылғыда файл бөлісу қолжетімсіз.');
  await Sharing.shareAsync(output.uri, { mimeType: 'application/zip', dialogTitle: 'LUMI сақтық көшірмесі' });
  return output.uri;
}

export async function importBackup(db: SQLite.SQLiteDatabase, confirmReplace: (counts: { notebookCount: number; entryCount: number }) => Promise<boolean>): Promise<{ notebookCount: number; entryCount: number; cancelled?: boolean }> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/octet-stream'], copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets[0]) return { notebookCount: 0, entryCount: 0, cancelled: true };
  const archiveBytes = await new File(picked.assets[0].uri).bytes();
  const archivePaths = inspectZip(archiveBytes);
  if (new Set(archivePaths).size !== archivePaths.length) throw new Error('ZIP архивте қайталанатын файл бар.');
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
  if (!validateBackupData(parsed)) throw new Error('Сақтық көшірмедегі деректер құрылымы жарамсыз.');
  const data = normalizeBackupData(parsed);
  if (!data) throw new Error('Сақтық көшірме деректерінің құрылымы жарамсыз.');
  const mediaPaths = new Set<string>();
  const mediaRows = [...data.tables.media_assets, ...data.tables.notebook_page_media];
  for (const row of mediaRows) {
    const oldPath = String(row.relative_path ?? '');
    if (!oldPath.startsWith('media/') || !safeArchivePath(oldPath) || !manifest.files.includes(oldPath)) throw new Error(`Сурет файлы сақтық көшірмеде жоқ: ${oldPath}`);
    mediaPaths.add(oldPath);
  }
  if (manifest.files.length !== mediaPaths.size + 1 || manifest.files.some((path) => path !== 'data.json' && !mediaPaths.has(path))) throw new Error('Архивте деректерге тіркелмеген файл бар.');
  const assetPaths = new Set(data.tables.media_assets.map((row) => String(row.relative_path)));
  for (const row of data.tables.entries) {
    const blocks = JSON.parse(String(row.blocks_json)) as { type?: string; uri?: string }[];
    if (blocks.some((block) => block.type === 'image' && (!block.uri || !assetPaths.has(block.uri)))) throw new Error('Жазба суреттерінің бірі архивте тіркелмеген.');
  }
  for (const row of data.tables.notebook_pages) {
    const blocks = JSON.parse(String(row.blocks_json)) as { type?: string; uri?: string }[];
    if (blocks.some((block) => block.type === 'image' && (!block.uri || !mediaPaths.has(block.uri)))) throw new Error('Дәптер бетіндегі сурет архивте жоқ.');
  }

  const counts = { notebookCount: data.tables.notebooks.length, entryCount: data.tables.entries.length };
  if (!(await confirmReplace(counts))) return { ...counts, cancelled: true };

  // Validate every byte in a temporary cache directory before replacing data.
  const staging = new Directory(Paths.cache, `lumi-restore-${randomUUID()}`);
  staging.create({ intermediates: true, idempotent: false });
  const mediaDir = new Directory(Paths.document, 'media');
  mediaDir.create({ intermediates: true, idempotent: true });
  const pathMap = new Map<string, string>();
  const stagedFiles = new Map<string, { newPath: string; file: File }>();
  try {
    for (const oldPath of new Set(mediaRows.map((r) => String(r.relative_path)))) {
      const extension = oldPath.split('.').pop()?.replace(/[^a-z0-9]/giu, '') || 'img';
      const newPath = `media/${randomUUID()}.${extension}`;
      const stagedFile = new File(staging, `${randomUUID()}.${extension}`);
      await stagedFile.write(archive[oldPath]!);
      if (stagedFile.size !== archive[oldPath]!.byteLength) throw new Error(`Сурет файлы толық жазылмады: ${oldPath}`);
      pathMap.set(oldPath, newPath);
      stagedFiles.set(oldPath, { newPath, file: stagedFile });
    }
    for (const row of data.tables.media_assets) row.relative_path = pathMap.get(String(row.relative_path))!;
    for (const row of data.tables.entries) {
      const blocks = JSON.parse(String(row.blocks_json)) as { uri?: string }[];
      for (const block of blocks) if (block.uri && pathMap.has(block.uri)) block.uri = pathMap.get(block.uri)!;
      row.blocks_json = JSON.stringify(blocks);
    }
    for (const row of data.tables.entry_blocks) {
      const payload = JSON.parse(String(row.payload_json)) as { uri?: string };
      if (payload.uri && pathMap.has(payload.uri)) payload.uri = pathMap.get(payload.uri)!;
      row.payload_json = JSON.stringify(payload);
    }
    for (const row of data.tables.notebook_pages) {
      const blocks = JSON.parse(String(row.blocks_json)) as { uri?: string }[];
      for (const block of blocks) if (block.uri && pathMap.has(block.uri)) block.uri = pathMap.get(block.uri)!;
      row.blocks_json = JSON.stringify(blocks);
    }
    for (const row of data.tables.notebook_page_media) row.relative_path = pathMap.get(String(row.relative_path))!;
  } catch (error) {
    if (staging.exists) staging.delete();
    throw error instanceof Error ? error : new Error('Жазба блоктарының құрылымы жарамсыз.');
  }

  const oldMediaRows = await Promise.all([
    db.getAllAsync<{ relative_path: string }>('SELECT relative_path FROM media_assets'),
    db.getAllAsync<{ relative_path: string }>('SELECT relative_path FROM notebook_page_media')
  ]);
  const oldMediaPaths = oldMediaRows.flat().map((row) => row.relative_path);
  const installedPaths: string[] = [];
  try {
    for (const { newPath, file } of stagedFiles.values()) {
      await file.copy(new File(Paths.document, newPath));
      installedPaths.push(newPath);
      const destination = new File(Paths.document, newPath);
      if (!destination.exists || destination.size !== file.size) throw new Error(`Сурет файлы қалпына келмеді: ${newPath}`);
    }
    await replaceBackupTables(db, data);
  } catch (error) {
    for (const path of installedPaths) new File(Paths.document, path).delete();
    throw error;
  } finally {
    if (staging.exists) staging.delete();
  }
  for (const path of oldMediaPaths) {
    if (safeArchivePath(path) && path.startsWith('media/') && !installedPaths.includes(path)) new File(Paths.document, path).delete();
  }
  return counts;
}
