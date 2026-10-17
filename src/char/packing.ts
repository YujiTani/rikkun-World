// 切りつめた絵（packed）の 引き方（仕様 §4.7）。板のシェーダーと 同じ計算を 数だけで持つ（テストで 確かめる）。

/** [x, y, w, h, ox, oy]: x, y = 切りつめた PNG の中の 四角の左上、w, h = 大きさ、ox, oy = もとの 256 のコマの中の 左上 */
export type Cell = [number, number, number, number, number, number];

export interface Packed {
  width: number;
  height: number;
  /** 24 × frames こ。番号 = (段 × 8 + 方向) × frames + コマ */
  cells: Cell[];
}

export const CELL_SIZE = 256;

/** atlas.json の `packed` を 読む。形がおかしければ undefined */
export function parsePacked(raw: unknown): Packed | undefined {
  const o = raw as { width?: unknown; height?: unknown; cells?: unknown } | null | undefined;
  if (!o || typeof o !== 'object') return undefined;
  const width = Number(o.width);
  const height = Number(o.height);
  if (!(width > 0) || !(height > 0) || !Array.isArray(o.cells)) return undefined;
  const cells: Cell[] = [];
  for (const c of o.cells) {
    if (!Array.isArray(c) || c.length < 6) return undefined;
    cells.push([Number(c[0]), Number(c[1]), Number(c[2]), Number(c[3]), Number(c[4]), Number(c[5])]);
  }
  return { width, height, cells };
}

/** 読んだ PNG が packed と 合っているか。ちがえば Error（大きさが ちがう・四角が 外に出る・コマが たりない） */
export function validatePacked(p: Packed, imgW: number, imgH: number, frames: number): void {
  if (imgW !== p.width || imgH !== p.height) throw new Error(`絵の大きさが packed と ちがいます（${imgW}×${imgH} と ${p.width}×${p.height}）`);
  if (p.cells.length < 24 * frames) throw new Error(`コマの数が たりません（${p.cells.length} < ${24 * frames}）`);
  for (const [x, y, w, h, ox, oy] of p.cells) {
    const ok =
      Number.isFinite(x + y + w + h + ox + oy) &&
      w >= 1 && h >= 1 && x >= 0 && y >= 0 && ox >= 0 && oy >= 0 &&
      x + w <= imgW && y + h <= imgH && ox + w <= CELL_SIZE && oy + h <= CELL_SIZE;
    if (!ok) throw new Error(`四角が 絵の外に出ます（${x},${y},${w},${h},${ox},${oy}）`);
  }
}

export interface CellUniforms {
  /** 切りつめた PNG の中の 四角（0〜1。x, y, 幅, 高さ。y は 上から） */
  rect: [number, number, number, number];
  /** もとの 256 のコマの中の 四角（0〜1。y は 上から） */
  crop: [number, number, number, number];
}

export function cellUniforms(cell: Cell, W: number, H: number): CellUniforms {
  const [x, y, w, h, ox, oy] = cell;
  return {
    rect: [x / W, y / H, w / W, h / H],
    crop: [ox / CELL_SIZE, oy / CELL_SIZE, w / CELL_SIZE, h / CELL_SIZE],
  };
}

/**
 * 動き 1 まいの絵（cols コマ）から、段・向きの行 row（段 × 8 + 向き）・コマ f の 四角と ずれを決める。
 * 板（sprite.ts）と 影を落とす板（ShadowSystem）で 同じ計算を使う。packed が無い 格子の絵は 四角 = 格子の 1 つ・crop = コマ全体
 */
export function cellRectCrop(a: { cols: number; width: number; height: number; packed?: Packed | undefined }, row: number, frame: number): CellUniforms {
  const f = Math.max(0, Math.min(frame, a.cols - 1));
  const cell = a.packed?.cells[row * a.cols + f];
  if (a.packed && cell) return cellUniforms(cell, a.packed.width, a.packed.height);
  return { rect: [f / a.cols, row / GRID_ROWS, 1 / a.cols, 1 / GRID_ROWS], crop: [0, 0, 1, 1] };
}

const GRID_ROWS = 24;

const f = Math.fround;

/**
 * 板の シェーダーと 同じ計算（32 ビットの小数）: もとのコマの中の ドット (i, j)（j は 上から）が 引く
 * 切りつめた PNG の ドット。四角の外は null（とうめい）
 */
export function shaderTexel(u: CellUniforms, W: number, H: number, i: number, j: number): { x: number; y: number } | null {
  const dx = i - Math.floor(f(u.crop[0] * CELL_SIZE) + 0.5);
  const dy = j - Math.floor(f(u.crop[1] * CELL_SIZE) + 0.5);
  if (dx < 0 || dy < 0 || dx >= Math.floor(f(u.crop[2] * CELL_SIZE) + 0.5) || dy >= Math.floor(f(u.crop[3] * CELL_SIZE) + 0.5)) return null;
  return { x: Math.floor(f(u.rect[0] * W) + 0.5) + dx, y: Math.floor(f(u.rect[1] * H) + 0.5) + dy };
}

/** 切りつめた PNG の色番号から、もとの 256 × 256 の コマの色番号を もどす */
export function unpackCell(indices: Uint8Array, W: number, cell: Cell): Uint8Array {
  const [x, y, w, h, ox, oy] = cell;
  const out = new Uint8Array(CELL_SIZE * CELL_SIZE);
  for (let j = 0; j < h; j++) {
    const src = (y + j) * W + x;
    out.set(indices.subarray(src, src + w), (oy + j) * CELL_SIZE + ox);
  }
  return out;
}
