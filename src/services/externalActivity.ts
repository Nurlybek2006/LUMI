let activeOperations = 0;
let foregroundGraceUntil = 0;

export async function withExternalActivity<T>(operation: () => Promise<T>): Promise<T> {
  activeOperations += 1;
  try {
    return await operation();
  } finally {
    activeOperations = Math.max(0, activeOperations - 1);
    foregroundGraceUntil = Math.max(foregroundGraceUntil, Date.now() + 2_000);
  }
}

export function isExternalActivityActive(now = Date.now()): boolean {
  return activeOperations > 0 || now < foregroundGraceUntil;
}
