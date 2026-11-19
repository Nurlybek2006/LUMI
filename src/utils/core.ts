import type { ThemeId } from '@/types/models';

export const localDate = (date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const addLocalDays = (isoDate: string, days: number): string => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year ?? 2000, (month ?? 1) - 1, day ?? 1, 12);
  date.setDate(date.getDate() + days);
  return localDate(date);
};

const steps = [1, 3, 7, 14, 30] as const;
export function nextReview(current: string, repetitions: number, remembered: boolean): { date: string; repetitions: number } {
  const nextCount = remembered ? Math.max(0, repetitions) + 1 : 0;
  const interval = remembered ? steps[Math.min(nextCount - 1, steps.length - 1)]! : 1;
  return { date: addLocalDays(current, interval), repetitions: nextCount };
}

export function writingStreak(dates: string[], today = localDate()): number {
  const set = new Set(dates);
  let cursor = set.has(today) ? today : addLocalDays(today, -1);
  let count = 0;
  while (set.has(cursor)) { count += 1; cursor = addLocalDays(cursor, -1); }
  return count;
}

export function longestStreak(dates: string[]): number {
  let longest = 0;
  let run = 0;
  let previous = '';
  for (const date of [...new Set(dates)].sort()) {
    run = previous && addLocalDays(previous, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  return longest;
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

export function isThemeId(value: unknown): value is ThemeId {
  return ['classic', 'halloween', 'winter', 'creative', 'midnight', 'warm'].includes(String(value));
}

export function validateBackupManifest(value: unknown): value is { format: 'lumi-backup'; version: number; database: string; files: string[]; checksums: Record<string, string> } {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Record<string, unknown>;
  if (manifest.format !== 'lumi-backup' || manifest.version !== 1 || manifest.database !== 'data.json') return false;
  if (!Array.isArray(manifest.files) || !manifest.files.every((f) => typeof f === 'string' && safeArchivePath(f))) return false;
  if (!manifest.files.includes('data.json') || new Set(manifest.files).size !== manifest.files.length) return false;
  if (!manifest.checksums || typeof manifest.checksums !== 'object') return false;
  const checksums = manifest.checksums as Record<string, unknown>;
  if (!manifest.files.every((path) => typeof checksums[path] === 'string' && /^[a-f0-9]{64}$/iu.test(checksums[path] as string))) return false;
  return true;
}

export function safeArchivePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return !normalized.startsWith('/') && !/^[a-z]:/iu.test(normalized) && normalized.split('/').every((part) => part && part !== '..' && part !== '.');
}
