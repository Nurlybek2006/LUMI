export function shouldCommitPageTurn(translationX: number, velocityX: number, width: number): boolean {
  return Math.abs(translationX) >= Math.max(64, width * 0.18) || Math.abs(velocityX) > 850;
}

export function nextPageIndex(index: number, direction: -1 | 1, pageCount: number): number {
  return clampPageIndex(index + direction, pageCount);
}

export function clampPageIndex(index: number, pageCount: number): number {
  if (!Number.isFinite(index) || !Number.isFinite(pageCount) || pageCount <= 0) return 0;
  return Math.max(0, Math.min(Math.max(0, Math.floor(pageCount) - 1), Math.floor(index)));
}

export function resolvePageIndex(saved: string | null, pages: readonly { entryId: string; segment: number; date: string }[], requestedDate?: string): number {
  let candidate = 0;
  if (saved) {
    try {
      const value: unknown = JSON.parse(saved);
      if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0) candidate = value;
      else if (value && typeof value === 'object' && 'entryId' in value && typeof value.entryId === 'string' && 'segment' in value && Number.isInteger(value.segment)) {
        const match = pages.findIndex((page) => page.entryId === value.entryId && page.segment === value.segment);
        if (match >= 0) candidate = match;
      }
    } catch { /* Invalid or obsolete bookmarks start at the first valid page. */ }
  }
  if (requestedDate) {
    const requestedIndex = pages.findIndex((page) => page.date === requestedDate);
    if (requestedIndex >= 0) candidate = requestedIndex;
  }
  return clampPageIndex(candidate, pages.length);
}

export type PageCurlMesh = {
  points: { x: number; y: number }[];
  textures: { x: number; y: number }[];
  frontColors: string[];
  backColors: string[];
  frontIndices: number[];
  backIndices: number[];
};

function shadeHex(color: string, amount: number): string {
  'worklet';
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const factor = Math.max(0, Math.min(1, 1 - amount));
  const channel = (start: number) => Math.round(parseInt(hex.slice(start, start + 2), 16) * factor).toString(16).padStart(2, '0');
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

/** Builds a textured, UI-thread-friendly cylindrical paper fold mesh. */
export function buildPageCurlMesh(
  width: number,
  height: number,
  progress: number,
  direction: -1 | 1,
  touchY: number,
  paperColor: string,
  columns = 24,
  rows = 18
): PageCurlMesh {
  'worklet';
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const amount = Math.max(0, Math.min(1, progress));
  const points: { x: number; y: number }[] = [];
  const textures: { x: number; y: number }[] = [];
  const angles: number[] = [];
  const crease = direction === 1 ? w * (1 - amount) : w * amount;
  const remaining = Math.max(1, direction === 1 ? w - crease : crease);
  const maxAngle = amount * Math.PI;
  const radius = remaining / Math.max(0.001, maxAngle);

  for (let row = 0; row <= rows; row += 1) {
    const sourceY = (row / rows) * h;
    for (let column = 0; column <= columns; column += 1) {
      const sourceX = (column / columns) * w;
      let angle = 0;
      let x = sourceX;
      if (amount > 0 && (direction === 1 ? sourceX >= crease : sourceX <= crease)) {
        const distance = direction === 1 ? sourceX - crease : crease - sourceX;
        const t = Math.max(0, Math.min(1, distance / remaining));
        angle = t * maxAngle;
        const projected = radius * Math.sin(angle);
        x = direction === 1 ? crease + projected : crease - projected;
      }
      const bend = Math.sin(angle) * amount * 0.18;
      const y = sourceY + bend * (touchY - h / 2) * (sourceX / w);
      points.push({ x, y });
      textures.push({ x: sourceX, y: sourceY });
      angles.push(angle);
    }
  }

  const frontIndices: number[] = [];
  const backIndices: number[] = [];
  const stride = columns + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = row * stride + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + stride;
      const bottomRight = bottomLeft + 1;
      const centerAngle = (angles[topLeft]! + angles[topRight]! + angles[bottomLeft]! + angles[bottomRight]!) / 4;
      const target = centerAngle <= Math.PI / 2 ? frontIndices : backIndices;
      target.push(topLeft, topRight, bottomLeft, topRight, bottomRight, bottomLeft);
    }
  }

  const foldShadow = textures.map((texture) => Math.exp(-Math.abs(texture.x - crease) / Math.max(1, w * 0.035)) * amount * 0.34);
  const frontColors = angles.map((angle, index) => shadeHex('#FFFFFF', 0.06 + Math.sin(angle) * 0.16 + foldShadow[index]!));
  const backColors = angles.map((angle, index) => shadeHex(paperColor, 0.1 + Math.sin(angle) * 0.18 + foldShadow[index]!));
  return { points, textures, frontColors, backColors, frontIndices, backIndices };
}
