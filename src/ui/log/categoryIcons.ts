import type { LogCategory } from '../../contracts';

/**
 * カテゴリーの印（CRAFT-2 §2.7）。16×16 のドット絵をコードで描く（DOM なし）。
 * 外の形（ふち 1 ドットをふくむ）が 6 つ たがいにちがう。中に白い小さな絵。
 * 色は M6 §3.5 (2) の色だけ。
 */
export type ShapeName = 'circle' | 'square' | 'hexagon' | 'star' | 'diamond' | 'triangle';

export interface CategoryInfo {
  id: LogCategory;
  /** ひらがなの名前 */
  label: string;
  /** 塗りの色 '#rrggbb'（M6 の色の表と同じ） */
  color: string;
  shape: ShapeName;
}

export const LOG_CATEGORIES: readonly CategoryInfo[] = [
  { id: 'pickup', label: 'ひろう', color: '#3ddc84', shape: 'circle' },
  { id: 'craft', label: 'つくる', color: '#ffc83d', shape: 'square' },
  { id: 'fight', label: 'たたかい', color: '#ff8a1f', shape: 'hexagon' },
  { id: 'achieve', label: 'じっせき', color: '#c79bff', shape: 'star' },
  { id: 'info', label: 'おしらせ', color: '#4fc3f7', shape: 'diamond' },
  { id: 'warn', label: 'できない', color: '#ff5a5f', shape: 'triangle' },
];

export function categoryInfo(id: LogCategory): CategoryInfo {
  return LOG_CATEGORIES.find((c) => c.id === id)!;
}

/** ふちの色（--rk-bg-900） */
export const EDGE_COLOR = '#10141f';
const WHITE = '#ffffff';
const N = 16;

function inPolygon(px: number, py: number, pts: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const STAR_PTS: (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 7.9 : 3.4;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    out.push([8 + r * Math.cos(a), 8.5 + r * Math.sin(a)]);
  }
  return out;
})();

/**
 * 六角（たたかい）: 横長（はば 16・高さ 12）で 上下が まっすぐ、左右が とがる形。行ごとの 左はし x（右はしは 15 − x）。
 * 式で描くと 32px で まるに近く見えたので（#82）、正六角形の 左右の とがりを 行ごとに 手で 決めた
 */
const HEX_ROWS: Readonly<Record<number, number>> = { 2: 4, 3: 3, 4: 2, 5: 2, 6: 1, 7: 0, 8: 0, 9: 1, 10: 2, 11: 2, 12: 3, 13: 4 };

/** 外の形（ふちをふくむ不透明なドット）。N×N の真偽 */
export function shapeMask(shape: ShapeName): boolean[] {
  const m = new Array<boolean>(N * N).fill(false);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = x + 0.5 - 8;
      const py = y + 0.5 - 8;
      let on = false;
      switch (shape) {
        case 'circle':
          on = px * px + py * py <= 7.6 * 7.6;
          break;
        case 'square':
          on = x >= 1 && x <= 14 && y >= 1 && y <= 14 && !((x === 1 || x === 14) && (y === 1 || y === 14));
          break;
        case 'hexagon':
          on = HEX_ROWS[y] !== undefined && x >= HEX_ROWS[y] && x <= 15 - HEX_ROWS[y];
          break;
        case 'star':
          on = inPolygon(x + 0.5, y + 0.5, STAR_PTS);
          break;
        case 'diamond':
          on = Math.abs(px) + Math.abs(py) <= 7.9;
          break;
        case 'triangle':
          on = y >= 1 && y <= 14 && Math.abs(px) <= ((y - 1) / 13) * 7.4 + 0.6;
          break;
      }
      m[y * N + x] = on;
    }
  }
  return m;
}

/** 中の白い絵（x, y の組） */
function glyph(cat: LogCategory): [number, number][] {
  const rows = (art: string[], x0: number, y0: number): [number, number][] => {
    const out: [number, number][] = [];
    art.forEach((row, dy) => [...row].forEach((c, dx) => c === '#' && out.push([x0 + dx, y0 + dy])));
    return out;
  };
  switch (cat) {
    case 'pickup': // 下向きの やじるし
      return rows(['...#...', '...#...', '...#...', '.#.#.#.', '..###..', '...#...'], 4, 5);
    case 'craft': // かなづち
      return rows(['.######.', '.######.', '...##...', '...##...', '...##...', '...##...'], 4, 4);
    case 'fight': // かたな（ななめ）
      return [[11, 4], [10, 4], [11, 5], [10, 5], [9, 6], [10, 6], [8, 7], [9, 7], [7, 8], [8, 8], [6, 9], [7, 9], [5, 8], [7, 10], [5, 10], [4, 11]];
    case 'achieve': // 小さな ひかり（2×2）
      return [[7, 7], [8, 7], [7, 8], [8, 8]];
    case 'info': // てん 3 つ
      return [3, 7, 11].flatMap((x) => (x === 7 ? [[7, 7], [8, 7], [7, 8], [8, 8]] : [[x, 7], [x + 1, 7], [x, 8], [x + 1, 8]])) as [number, number][];
    case 'warn': // ！
      return [[7, 6], [8, 6], [7, 7], [8, 7], [7, 8], [8, 8], [7, 9], [8, 9], [7, 11], [8, 11], [7, 12], [8, 12]];
  }
}

/** 16×16 の色（'#rrggbb'、透明は null）。左上から 横に並べる */
export function categoryIconPixels(cat: LogCategory): (string | null)[] {
  const info = categoryInfo(cat);
  const mask = shapeMask(info.shape);
  const out: (string | null)[] = new Array(N * N).fill(null);
  const at = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < N && y < N && mask[y * N + x];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!mask[y * N + x]) continue;
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      out[y * N + x] = edge ? EDGE_COLOR : info.color;
    }
  }
  const g = glyph(cat);
  const set = new Set(g.map(([x, y]) => y * N + x));
  // 明るい きいろ の上は 白い絵を こい色の 1 ドットで囲む
  if (cat === 'craft') {
    for (const [x, y] of g) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = (y + dy) * N + (x + dx);
          if (x + dx >= 0 && y + dy >= 0 && x + dx < N && y + dy < N && !set.has(i) && out[i] === info.color) out[i] = EDGE_COLOR;
        }
      }
    }
  }
  for (const [x, y] of g) if (mask[y * N + x]) out[y * N + x] = WHITE;
  return out;
}

/** できごと タブの絵: まきもの（クリーム色の紙・茶色の じく 上下・こい茶の よこ線 3 本） */
export function scrollIconPixels(): (string | null)[] {
  const out: (string | null)[] = new Array(N * N).fill(null);
  const put = (x: number, y: number, c: string): void => {
    out[y * N + x] = c;
  };
  for (let y = 3; y <= 12; y++) for (let x = 3; x <= 12; x++) put(x, y, '#F3E3C0');
  for (const y of [2, 3, 12, 13]) for (let x = 2; x <= 13; x++) put(x, y, '#8A5A2E');
  for (const y of [5, 7, 9]) for (let x = 5; x <= 10; x++) put(x, y, '#5a3a1a');
  return out;
}

/** 外の形のドット数（テスト用） */
export function shapeDots(shape: ShapeName): number {
  return shapeMask(shape).filter(Boolean).length;
}
