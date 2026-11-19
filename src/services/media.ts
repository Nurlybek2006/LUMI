import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';

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
