import type { CropKind, CropStage } from '../../contracts';

/** M7 農業の 16×16 ドット絵（仕様 §3.2）。`'#rrggbb'` か null（すきとおる）。pixels[y * 16 + x]、y = 0 が上 */
export type FarmPx = Array<string | null>;

const N = 16;
const KINDS: readonly CropKind[] = ['onion', 'tomato', 'pumpkin', 'eggplant'];

export const FARM_TILE_NAMES: readonly string[] = [
  'farmland_top',
  'farmland_wet_top',
  'farmland_side',
  'farmland_wet_side',
  ...KINDS.flatMap((k) => [0, 1, 2, 3].map((s) => `crop_${k}_${s}`)),
  ...KINDS.map((k) => `wild_${k}`),
  'kakashi',
  'kakashi_head',
  'saku',
  'sprinkler_top',
  'sprinkler_side',
  'sprinkler_bottom',
];

export const FARM_SOIL = { dry: '#6E4520', wet: '#4A3A33' } as const;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function blank(): FarmPx {
  return new Array<string | null>(N * N).fill(null);
}

/** y が minY より上へは はみ出さない描き手 */
interface Pen {
  t: FarmPx;
  minY: number;
}
function dot(p: Pen, x: number, y: number, c: string): void {
  if (x < 0 || x >= N || y < p.minY || y >= N) return;
  p.t[y * N + x] = c;
}
function rect(p: Pen, x: number, y: number, w: number, h: number, c: string): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) dot(p, i, j, c);
}
/** だ円。ふち（右下）は dark、左上に bright */
function blob(p: Pen, cx: number, cy: number, rx: number, ry: number, mid: string, dark: string, bright?: string): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      let c = mid;
      if (d > 0.55 && dx + dy > 0.3) c = dark;
      else if (bright && dx + dy < -0.7) c = bright;
      dot(p, x, y, c);
    }
  }
}

const LEAF_DARK = '#2E7D32';
const LEAF = '#43A047';
const LEAF_LIGHT = '#7CC756';
const STEM = '#558B2F';
const TOP_Y: Record<CropStage, number> = { 0: 12, 1: 9, 2: 5, 3: 2 };

function farmlandTop(wet: boolean): FarmPx {
  const t = blank();
  const base = wet ? FARM_SOIL.wet : FARM_SOIL.dry;
  const groove = wet ? '#2F2622' : '#4E3016';
  const ridge = wet ? '#5E4B42' : '#86552A';
  for (let i = 0; i < t.length; i++) t[i] = base;
  for (let x = 0; x < N; x++) {
    for (const y of [3, 7, 11, 15]) t[y * N + x] = groove;
    for (const y of [2, 6, 10, 14]) t[y * N + x] = ridge;
  }
  if (wet) {
    for (const [x, y] of [[2, 2], [10, 2], [5, 6], [12, 6], [3, 10], [9, 14]]) {
      t[y * N + x] = '#6F8FB8';
      t[y * N + x + 1] = '#6F8FB8';
    }
  } else {
    const rnd = lcg(7101);
    const rows = [0, 1, 4, 5, 8, 9, 12, 13];
    for (let i = 0; i < 10; i++) {
      const y = rows[Math.floor(rnd() * rows.length)];
      t[y * N + Math.floor(rnd() * N)] = '#5E3B1B';
    }
  }
  return t;
}

/** 作物 1 まい（kind × stage） */
function crop(kind: CropKind, stage: CropStage): FarmPx {
  const top = TOP_Y[stage];
  const p: Pen = { t: blank(), minY: top };
  const ripe = stage === 3;
  const seedColor = { onion: '#F2EEDC', tomato: '#E53935', pumpkin: '#F57C00', eggplant: '#7B1FA2' }[kind];

  if (stage === 0) {
    rect(p, 7, 13, 2, 3, STEM);
    dot(p, 5, 12, LEAF);
    dot(p, 6, 12, LEAF);
    dot(p, 9, 12, LEAF);
    dot(p, 10, 12, LEAF);
    rect(p, 9, 15, 2, 1, seedColor);
    if (kind === 'tomato') dot(p, 7, 12, LEAF_LIGHT);
    if (kind === 'pumpkin') dot(p, 8, 12, LEAF_DARK);
    if (kind === 'eggplant') rect(p, 5, 15, 2, 1, '#B39DDB');
    return p.t;
  }

  switch (kind) {
    case 'onion': {
      // ねぎの形: 細い葉が たてに のびる
      const s = stage;
      rect(p, 7, top, 2, 16 - top, LEAF);
      rect(p, 8, top + 1, 1, 15 - top, LEAF_DARK);
      if (s === 1) {
        rect(p, 5, top + 2, 1, 14 - top, LEAF_DARK);
        rect(p, 10, top + 2, 1, 14 - top, LEAF_DARK);
      } else {
        rect(p, 5, top + 2, 2, 14 - top, LEAF_LIGHT);
        rect(p, 9, top + 2, 2, 14 - top, LEAF_LIGHT);
        rect(p, 3, top + 5, 2, 11 - top, LEAF_DARK);
        rect(p, 11, top + 5, 2, 11 - top, LEAF_DARK);
        if (s === 2) {
          rect(p, 7, 14, 2, 2, '#F2EEDC');
          rect(p, 8, 15, 1, 1, '#CFC6A6');
        } else {
          rect(p, 5, 11, 6, 5, '#F5F0DC');
          rect(p, 5, 15, 6, 1, '#D8CFAE');
          rect(p, 10, 11, 1, 5, '#D8CFAE');
          dot(p, 6, 12, '#FFFFFF');
        }
      }
      break;
    }
    case 'tomato': {
      rect(p, 7, top, 2, 16 - top, STEM);
      // ぎざぎざの葉
      const rows = stage === 1 ? 5 : stage === 2 ? 8 : 10;
      const half = stage === 1 ? 4 : 6;
      for (let r = 0; r < rows; r++) {
        const y = 15 - 2 - r;
        const w = half - (r % 2 === 0 ? 0 : 2);
        rect(p, 8 - w, y, w, 1, r % 2 ? LEAF : LEAF_DARK);
        rect(p, 8, y, w, 1, r % 2 ? LEAF_DARK : LEAF);
      }
      if (stage === 2) {
        rect(p, 3, 12, 2, 2, '#9CCC65');
        rect(p, 11, 10, 2, 2, '#9CCC65');
      }
      if (ripe) {
        for (const [x, y] of [[2, 11], [11, 9], [6, 12]]) {
          rect(p, x, y, 3, 3, '#E53935');
          dot(p, x, y, '#FF8A80');
          dot(p, x + 1, y - 1, '#2E7D32');
        }
      }
      break;
    }
    case 'pumpkin': {
      if (stage === 1) {
        rect(p, 7, 9, 2, 7, STEM);
        blob(p, 5, 12, 2.5, 1.5, LEAF, LEAF_DARK);
        blob(p, 11, 10, 2.5, 1.5, LEAF, LEAF_DARK);
      } else {
        rect(p, 7, stage === 2 ? 9 : 7, 2, stage === 2 ? 7 : 9, STEM);
        const up = stage === 2 ? 0 : -3;
        blob(p, 4.5, 9 + up, 5, 3.2, LEAF, LEAF_DARK, LEAF_LIGHT);
        blob(p, 11.5, 7 + up, 5, 3.2, LEAF, LEAF_DARK, LEAF_LIGHT);
        if (stage === 2) {
          rect(p, 6, 13, 3, 3, '#C0CA33');
        } else {
          rect(p, 4, 10, 8, 6, '#F57C00');
          rect(p, 6, 10, 1, 6, '#E65100');
          rect(p, 9, 10, 1, 6, '#E65100');
          rect(p, 4, 15, 8, 1, '#E65100');
          rect(p, 5, 11, 2, 1, '#FFB74D');
          rect(p, 7, 8, 1, 2, '#6D4C41');
        }
      }
      break;
    }
    case 'eggplant': {
      rect(p, 7, top, 2, 16 - top, STEM);
      if (stage === 1) {
        blob(p, 4.5, 12, 2, 2, LEAF, LEAF_DARK);
        blob(p, 11.5, 11, 2, 2, LEAF, LEAF_DARK);
        blob(p, 8, 10.5, 1.5, 1.5, LEAF_LIGHT, LEAF);
      } else {
        blob(p, 4, top + 5, 3.5, 3, LEAF, LEAF_DARK, LEAF_LIGHT);
        blob(p, 12, top + 4, 3.5, 3, LEAF, LEAF_DARK, LEAF_LIGHT);
        blob(p, 8, top + 3, 2.2, 3, LEAF_LIGHT, LEAF);
        if (stage === 2) {
          dot(p, 4, 12, '#B39DDB');
          dot(p, 11, 11, '#B39DDB');
          rect(p, 7, 13, 1, 2, '#7B1FA2');
        } else {
          for (const [x, y] of [[4, 10], [10, 9]]) {
            rect(p, x, y, 2, 5, '#6A1B9A');
            rect(p, x, y + 1, 1, 2, '#9C4DCC');
            rect(p, x, y - 1, 2, 1, '#2E7D32');
          }
        }
      }
      break;
    }
  }
  return p.t;
}

/** やせいの やさい: 3 だんかいの絵に「ぼうぼうの葉・のはらの花・草」を足す */
function wild(kind: CropKind): FarmPx {
  const t = crop(kind, 3);
  const p: Pen = { t, minY: 0 };
  for (let y = 3; y < 15; y++) {
    let lo = N;
    let hi = -1;
    for (let x = 0; x < N; x++) {
      if (t[y * N + x]) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
    }
    if (hi < 0) continue;
    if ((y + KINDS.indexOf(kind)) % 3 !== 0 && hi - lo + 1 <= 12) dot(p, lo - 1, y, LEAF_DARK);
    if ((y + KINDS.indexOf(kind)) % 2 === 0 && hi - lo + 1 <= 12) dot(p, hi + 1, y, LEAF_DARK);
  }
  for (const [x, y] of [[0, 13], [3, 14], [13, 14]]) {
    rect(p, x, y, 2, 2, '#FFFFFF');
    dot(p, x + 1, y + 1, '#FFD54F');
  }
  for (const x of [6, 9, 11]) rect(p, x, 13, 1, 3, x === 9 ? '#4CA332' : '#5DBB3F');
  return t;
}

function kakashiBody(): FarmPx {
  const p: Pen = { t: blank(), minY: 0 };
  rect(p, 7, 0, 2, 16, '#8A5A2E');
  rect(p, 8, 0, 1, 16, '#6B4421');
  rect(p, 3, 0, 10, 10, '#3F5E9A');
  rect(p, 11, 0, 2, 10, '#2F4775');
  rect(p, 3, 9, 10, 1, '#2F4775');
  rect(p, 4, 2, 3, 3, '#D9534F');
  rect(p, 8, 5, 3, 3, '#E8D3A0');
  for (const x of [4, 8, 11]) rect(p, x, 10, 1, 2, '#E1C16E');
  return p.t;
}

function kakashiHead(): FarmPx {
  const p: Pen = { t: blank(), minY: 0 };
  rect(p, 5, 0, 6, 3, '#E1C16E');
  rect(p, 5, 2, 6, 1, '#D9534F');
  rect(p, 2, 3, 12, 1, '#E1C16E');
  rect(p, 2, 3, 1, 1, '#C9A44E');
  rect(p, 13, 3, 1, 1, '#C9A44E');
  rect(p, 4, 4, 8, 6, '#C9AE78');
  rect(p, 5, 5, 6, 4, '#F2E6C8');
  dot(p, 6, 6, '#111111');
  dot(p, 9, 6, '#111111');
  dot(p, 6, 7, '#6D4C41');
  dot(p, 7, 8, '#6D4C41');
  dot(p, 8, 8, '#6D4C41');
  dot(p, 9, 7, '#6D4C41');
  rect(p, 0, 10, 16, 2, '#8A5A2E');
  rect(p, 0, 10, 2, 2, '#E1C16E');
  rect(p, 14, 10, 2, 2, '#E1C16E');
  rect(p, 5, 12, 6, 4, '#3F5E9A');
  return p.t;
}

function saku(): FarmPx {
  const p: Pen = { t: blank(), minY: 0 };
  rect(p, 6, 6, 4, 10, '#8A5A2E');
  rect(p, 9, 6, 1, 10, '#6B4421');
  rect(p, 6, 5, 3, 1, '#8A5A2E');
  rect(p, 6, 4, 2, 1, '#8A5A2E');
  dot(p, 6, 3, '#8A5A2E');
  rect(p, 10, 5, 5, 2, '#8A5A2E');
  rect(p, 10, 6, 5, 1, '#6B4421');
  dot(p, 14, 5, '#8A5A2E');
  dot(p, 14, 6, '#8A5A2E');
  return p.t;
}

/** スプリンクラー（M7-2 §3.2 (3)）。上: 輪 + ふんしゃ口 + 穴 4 こ */
function sprinklerTop(): FarmPx {
  const t = blank();
  const p: Pen = { t, minY: 0 };
  rect(p, 0, 0, N, N, '#78909C');
  // 輪（半径 5、1 ドット）
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      if (d >= 4.5 && d < 5.5) dot(p, x, y, '#B0BEC5');
    }
  }
  rect(p, 6, 6, 4, 4, '#455A64');
  // 上下左右 3 ドット はなれた所 に 穴
  for (const [x, y] of [[7, 2], [7, 13], [2, 7], [13, 7]]) dot(p, x, y, '#81D4FA');
  return t;
}

/** 横: 青い 帯（y=6〜8）・四すみ の ねじ・下 2 行 */
function sprinklerSide(): FarmPx {
  const t = blank();
  const p: Pen = { t, minY: 0 };
  rect(p, 0, 0, N, N, '#78909C');
  rect(p, 0, 6, N, 3, '#4FC3F7');
  rect(p, 0, 14, N, 2, '#546E7A');
  for (const [x, y] of [[1, 1], [14, 1], [1, 12], [14, 12]]) dot(p, x, y, '#455A64');
  return t;
}

function sprinklerBottom(): FarmPx {
  const t = blank();
  rect({ t, minY: 0 }, 0, 0, N, N, '#546E7A');
  return t;
}

/**
 * 農業の絵。`farmland_side` / `farmland_wet_side` は つち（dirt）の上 2 行を 下地の色にするので、
 * dirt の絵（16 進の文字列）を わたす
 */
export function paintFarmTile(name: string, dirt: readonly string[]): FarmPx {
  switch (name) {
    case 'farmland_top': return farmlandTop(false);
    case 'farmland_wet_top': return farmlandTop(true);
    case 'farmland_side':
    case 'farmland_wet_side': {
      const t: FarmPx = dirt.slice();
      const c = name === 'farmland_side' ? FARM_SOIL.dry : FARM_SOIL.wet;
      for (let i = 0; i < 2 * N; i++) t[i] = c;
      return t;
    }
    case 'sprinkler_top': return sprinklerTop();
    case 'sprinkler_side': return sprinklerSide();
    case 'sprinkler_bottom': return sprinklerBottom();
    case 'kakashi': return kakashiBody();
    case 'kakashi_head': return kakashiHead();
    case 'saku': return saku();
  }
  const m = /^crop_(onion|tomato|pumpkin|eggplant)_([0-3])$/.exec(name);
  if (m) return crop(m[1] as CropKind, Number(m[2]) as CropStage);
  const w = /^wild_(onion|tomato|pumpkin|eggplant)$/.exec(name);
  if (w) return wild(w[1] as CropKind);
  throw new Error(`unknown farm tile: ${name}`);
}
