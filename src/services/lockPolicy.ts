export const DEFAULT_AUTO_LOCK_MINUTES = 1;

export function shouldAutoLockAfterBackground(input: {
  pinConfigured: boolean;
  backgroundedAt: number | null;
  now: number;
  delayMinutes: number;
  externalActivity?: boolean;
}): boolean {
  if (!input.pinConfigured || input.backgroundedAt === null || input.externalActivity) return false;
  return Math.max(0, input.now - input.backgroundedAt) >= Math.max(0, input.delayMinutes) * 60_000;
}
