export function shouldCommitPageTurn(translationX: number, velocityX: number, width: number): boolean {
  return Math.abs(translationX) >= Math.max(64, width * 0.18) || Math.abs(velocityX) > 850;
}

export function nextPageIndex(index: number, direction: -1 | 1, pageCount: number): number {
  return Math.max(0, Math.min(Math.max(0, pageCount - 1), index + direction));
}
