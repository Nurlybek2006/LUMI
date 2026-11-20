import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import type * as SQLite from 'expo-sqlite';

const mediaDirectory = new Directory(Paths.document, 'media');

export async function storeImage(sourceUri: string): Promise<string> {
  mediaDirectory.create({ intermediates: true, idempotent: true });
  const extension = sourceUri.split('?')[0]?.split('.').pop()?.toLowerCase();
  const suffix = extension && /^[a-z0-9]{2,5}$/u.test(extension) ? extension : 'jpg';
  const relativePath = `media/${randomUUID()}.${suffix}`;
  const destination = new File(Paths.document, relativePath);
  await new File(sourceUri).copy(destination);
  return relativePath;
}

export function mediaUri(relativePath: string): string {
  if (!relativePath.startsWith('media/') || relativePath.includes('..')) return '';
  return new File(Paths.document, relativePath).uri;
}

export function fileForRelativePath(relativePath: string): File {
  return new File(Paths.document, relativePath);
}

export async function pruneUnusedMedia(db: SQLite.SQLiteDatabase): Promise<void> {
  if (!mediaDirectory.exists) return;
  const rows = await db.getAllAsync<{ relative_path: string }>('SELECT relative_path FROM media_assets UNION SELECT relative_path FROM notebook_page_media');
  const referenced = new Set(rows.map((row) => new File(Paths.document, row.relative_path).uri));
  for (const item of mediaDirectory.list()) {
    if (item instanceof File && !referenced.has(item.uri)) item.delete();
  }
}
