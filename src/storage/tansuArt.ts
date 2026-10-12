/**
 * たんす（和だんす）のドット絵 16x16（M6 §2.9 (6)）。コードで描く。three には依存しない。
 * 色はこの 7 色だけ。
 */
export const TANSU_COLORS = {
  light: '#E3C9A0', // 桐 明
  mid: '#D2B07E', // 桐 中
  grain: '#B98F5E', // 桐 暗（木目）
  frame: '#7A5534', // わく
  shadow: '#5E3F24', // かげ
  kurogane: '#1F1F24', // くろがね（金具）
  shine: '#6B6F7A', // 金具の光
} as const;

export type TansuFace = 'front' | 'frontOpen' | 'side' | 'top' | 'icon';
const N = 16;

type Grid = string[];
const C = TANSU_COLORS;

function blank(c: string): Grid {
  return new Array<string>(N * N).fill(c);
}
function put(g: Grid, x: number, y: number, c: string): void {
  if (x >= 0 && y >= 0 && x < N && y < N) g[y * N + x] = c;
}
function rect(g: Grid, x0: number, y0: number, w: number, h: number, c: string): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(g, x, y, c);
}
function border(g: Grid, c: string): void {
  rect(g, 0, 0, N, 1, c);
  rect(g, 0, N - 1, N, 1, c);
  rect(g, 0, 0, 1, N, c);
  rect(g, N - 1, 0, 1, N, c);
}
/** 4 すみの金具（L 字: 3 ドット） */
function corners(g: Grid): void {
  for (const [cx, cy, dx, dy] of [
    [0, 0, 1, 1],
    [N - 1, 0, -1, 1],
    [0, N - 1, 1, -1],
    [N - 1, N - 1, -1, -1],
  ] as const) {
    put(g, cx, cy, C.kurogane);
    put(g, cx + dx, cy, C.kurogane);
    put(g, cx, cy + dy, C.kurogane);
  }
}
/** わらび手: よこ 4 ドットの弓なり（両はし 1 ドット下がる）。真ん中の左の 1 ドットが金具の光 */
function handle(g: Grid, x: number, y: number): void {
  put(g, x, y + 1, C.kurogane);
  put(g, x + 1, y, C.shine);
  put(g, x + 2, y, C.kurogane);
  put(g, x + 3, y + 1, C.kurogane);
}
/** 引き出し 1 つ（板・左上の明るい 2 ドット・木目・下のかげ・取っ手） */
function drawer(g: Grid, x: number, y: number, w: number, h: number, grainX: number, handleX: number, handleY: number): void {
  rect(g, x, y, w, h, C.mid);
  put(g, x, y, C.light);
  put(g, x + 1, y, C.light);
  for (let yy = y + 1; yy < y + h; yy++) if (yy !== handleY && yy !== handleY + 1) put(g, grainX, yy, C.grain);
  rect(g, x, y + h, w, 1, C.shadow);
  handle(g, handleX, handleY);
}

function frontBase(open: boolean): Grid {
  const g = blank(C.mid);
  rect(g, 1, 1, 14, 14, C.mid);
  if (open) {
    // いちばん上の 2 つが 2 ドット下にずれて、中がこい色で見える
    rect(g, 1, 2, 7, 5, C.shadow);
    rect(g, 9, 2, 6, 5, C.shadow);
    drawer(g, 1, 4, 7, 2, 2, 3, 4);
    drawer(g, 9, 4, 6, 2, 12, 10, 4);
  } else {
    drawer(g, 1, 2, 7, 4, 2, 3, 3);
    drawer(g, 9, 2, 6, 4, 13, 10, 3);
  }
  rect(g, 8, 2, 1, 5, C.frame); // 小さな引き出しのさかい
  drawer(g, 1, 7, 14, 4, 3, 6, 8);
  rect(g, 12, 8, 1, 3, C.grain);
  drawer(g, 1, 12, 14, 3, 3, 6, 12);
  rect(g, 12, 12, 1, 2, C.grain);
  border(g, C.frame);
  corners(g);
  return g;
}

function sideFace(): Grid {
  const g = blank(C.mid);
  for (const gx of [3, 7, 11]) {
    for (let y = 1; y < N - 1; y++) put(g, gx + (Math.floor(y / 4) % 2), y, C.grain);
  }
  rect(g, 1, 1, 2, 1, C.light);
  border(g, C.frame);
  corners(g);
  // たて真ん中に 運ぶための 取っ手（1x3）
  rect(g, 7, 6, 1, 3, C.kurogane);
  return g;
}

function topFace(): Grid {
  const g = blank(C.mid);
  rect(g, 1, 1, 14, 2, C.light);
  for (const y of [4, 8, 12]) {
    for (let x = 1; x < N - 1; x++) put(g, x, y + (Math.floor(x / 5) % 2), C.grain);
  }
  border(g, C.frame);
  corners(g);
  return g;
}

function iconFace(): Grid {
  const g = frontBase(false);
  // 外わくを かげの色（こい色）にして 正面から
  border(g, C.shadow);
  corners(g);
  return g;
}

/** 面の 16x16（'#rrggbb' の配列。pixels[y * 16 + x]、y = 0 が上） */
export function tansuPixels(face: TansuFace): string[] {
  switch (face) {
    case 'front':
      return frontBase(false);
    case 'frontOpen':
      return frontBase(true);
    case 'side':
      return sideFace();
    case 'top':
      return topFace();
    case 'icon':
      return iconFace();
  }
}
