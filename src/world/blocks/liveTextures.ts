/**
 * LIVE-2 の ブロックの 16×16 絵（こたつ・とりごや の 4 ブロック。DESIGN 16.14・16.15 の 色）。
 * 世界の 1 マス は 平らな 箱（たんす と 同じ しくみ）。形そのもの（ふとん の すそ・三角やね）は
 * `src/animals/models/coopSpec.ts` の モデル が 受け持つ。ここは 「ブロック として 見た とき」の 絵。
 * 乱数なし（場所の きまった 並び だけ）。
 */
export const LIVE_TILE_NAMES = [
  'kotatsu_top',
  'kotatsu_side',
  'toriya_fence_top',
  'toriya_fence_side',
  'toriya_gate',
  'toriya_nest_roof',
  'toriya_nest_side',
  'toriya_box_top',
  'toriya_box_side',
  // LIVE-2.1: さく・もん を 十字の板 で 描く ときの 絵（すきま は すきとおる）
  'toriya_fence_x',
  'toriya_gate_x',
] as const;
export type LiveTileName = (typeof LIVE_TILE_NAMES)[number];

type Rgba = readonly [number, number, number, number];
const N = 16;

const hex = (c: string): Rgba => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

/** 色（DESIGN 16.14・16.15） */
export const LIVE_COLORS = {
  futon: '#3D5A9E',
  futonL: '#5B7BC4',
  futonD: '#2F4780',
  hem: '#EFE7D4',
  plate: '#A87B4F',
  plateEdge: '#7A5434',
  mikan: '#F0902A',
  mikanD: '#C86E14',
  leaf: '#6E9A3A',
  wood: '#C9A574',
  woodD: '#9E7C50',
  woodDD: '#6F5236',
  roof: '#4F6690',
  roofS: '#3D5A9E',
  straw: '#D9B65C',
  strawD: '#C29A45',
  boxWood: '#A87B4F',
  egg: '#F5ECD8',
  eggD: '#E2D6B8',
} as const;
const C = LIVE_COLORS;

function make(bg: string): Rgba[] {
  return new Array<Rgba>(N * N).fill(hex(bg));
}
function rect(t: Rgba[], x: number, y: number, w: number, h: number, c: string): void {
  const col = hex(c);
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && i < N && j >= 0 && j < N) t[j * N + i] = col;
}
function dot(t: Rgba[], x: number, y: number, c: string): void {
  rect(t, x, y, 1, 1, c);
}

function kotatsuTop(): Rgba[] {
  const t = make(C.plate);
  // ふち（こい 木）
  rect(t, 0, 0, N, 1, C.plateEdge);
  rect(t, 0, N - 1, N, 1, C.plateEdge);
  rect(t, 0, 0, 1, N, C.plateEdge);
  rect(t, N - 1, 0, 1, N, C.plateEdge);
  // 木目（よこ に 3 本）
  for (const y of [4, 8, 12]) for (let x = 2; x < 14; x++) if ((x + y) % 5 !== 0) dot(t, x, y, '#9C7040');
  // みかん（右おく）と はっぱ
  for (let y = 3; y <= 7; y++) {
    for (let x = 9; x <= 13; x++) {
      const dx = x - 11;
      const dy = y - 5;
      if (dx * dx + dy * dy <= 5) dot(t, x, y, dx + dy > 1 ? C.mikanD : C.mikan);
    }
  }
  dot(t, 11, 2, C.leaf);
  dot(t, 12, 2, C.leaf);
  return t;
}

function kotatsuSide(): Rgba[] {
  const t = make(C.futon);
  // 天板 の ふち（上 2 ドット）
  rect(t, 0, 0, N, 2, C.plate);
  rect(t, 0, 1, N, 1, C.plateEdge);
  // ふとん の もよう: 6 ドット に 1 つ、ななめ に ならべる（ざわざわ させない）
  for (let y = 3; y < 14; y++) for (let x = 0; x < N; x++) if ((x + y * 2) % 6 === 0) dot(t, x, y, C.futonL);
  // ふとん の ひだ（たて に うすい かげ）
  for (const x of [5, 10, 15]) for (let y = 2; y < 14; y++) if (y % 3 !== 0) dot(t, x, y, C.futonD);
  // すそ（生成り の 帯）
  rect(t, 0, N - 2, N, 2, C.hem);
  return t;
}

function fenceTop(): Rgba[] {
  const t = make(C.woodD);
  rect(t, 0, 0, N, 1, C.woodDD);
  rect(t, 0, N - 1, N, 1, C.woodDD);
  rect(t, 6, 0, 4, N, C.wood);
  return t;
}

function fenceSide(): Rgba[] {
  // くい 2 本（こい 木）と よこ木 3 本（あかるい 木）。すきま は かげ の 色（見通せない 箱 なので）
  const t = make(C.woodDD);
  for (const x of [0, 7, 14]) rect(t, x, 0, 2, N, C.woodD);
  for (const y of [2, 7, 12]) {
    rect(t, 0, y, N, 2, C.wood);
    rect(t, 0, y + 1, N, 1, C.woodD);
  }
  return t;
}

function gate(): Rgba[] {
  const t = make(C.futon);
  // かさ木
  rect(t, 0, 0, N, 3, C.plateEdge);
  rect(t, 0, 2, N, 1, '#5A3E26');
  // のれん 3 まい（すきま は うすい かげ）
  for (const x of [5, 10]) rect(t, x, 3, 1, N - 3, C.futonD);
  for (let y = 5; y < 12; y += 3) for (const x of [2, 7, 12]) dot(t, x, y, C.futonL);
  rect(t, 0, N - 2, N, 2, C.hem);
  return t;
}

function nestRoof(): Rgba[] {
  const t = make(C.roof);
  for (let x = 0; x < N; x += 3) rect(t, x, 0, 1, N, C.roofS);
  return t;
}

function nestSide(): Rgba[] {
  const t = make(C.wood);
  for (let y = 3; y < N; y += 4) rect(t, 0, y, N, 1, C.woodD);
  rect(t, 0, 0, N, 1, C.woodD);
  // 三角やね の すそ（上 2 ドット は 藍）
  rect(t, 0, 0, N, 2, C.roof);
  rect(t, 0, 2, N, 1, C.roofS);
  return t;
}

function boxTop(): Rgba[] {
  const t = make(C.straw);
  for (let i = 0; i < 18; i++) {
    const x = (i * 7 + 3) % N;
    const y = (i * 5 + 1) % N;
    dot(t, x, y, C.strawD);
  }
  rect(t, 0, 0, N, 1, C.boxWood);
  rect(t, 0, N - 1, N, 1, C.boxWood);
  rect(t, 0, 0, 1, N, C.boxWood);
  rect(t, N - 1, 0, 1, N, C.boxWood);
  // たまご 2 こ（上から 見た まる）
  for (const [cx, cy] of [[5, 7], [10, 9]] as const) {
    for (let y = cy - 2; y <= cy + 2; y++) {
      for (let x = cx - 2; x <= cx + 2; x++) {
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d <= 5) dot(t, x, y, d > 3 || x - cx + y - cy > 1 ? C.eggD : C.egg);
      }
    }
  }
  return t;
}

function boxSide(): Rgba[] {
  const t = make(C.boxWood);
  for (let y = 4; y < N; y += 5) rect(t, 0, y, N, 1, C.plateEdge);
  rect(t, 0, 0, N, 1, C.plateEdge);
  rect(t, 0, N - 1, N, 1, C.plateEdge);
  // 上 に わら が はみ出す
  rect(t, 0, 0, N, 3, C.straw);
  for (let x = 1; x < N; x += 3) dot(t, x, 1, C.strawD);
  rect(t, 0, 3, N, 1, C.plateEdge);
  return t;
}

// ---------- LIVE-2.1 B「たけ の よつめがき」の 板（art/LIVE-2.1/fence/tiles.js の bLattice・bGate を 16×16 に 写した 物）----------
const BAMBOO = { L: '#CDB86E', D: '#A38F4C', N: '#8C7A3E', H: '#DCCB8A' };
const NOREN = '#3D5A9E';
const NOREN_D = '#2F4A86';
const CLEAR: Rgba = [0, 0, 0, 0];

/** 下から y 行目（0 = いちばん下）に 点 */
function put(t: Rgba[], x: number, y: number, c: string): void {
  if (x < 0 || x >= N || y < 0 || y >= N) return;
  t[(N - 1 - y) * N + x] = hex(c);
}
function span(t: Rgba[], x: number, y: number, w: number, h: number, c: string): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(t, x + i, y + j, c);
}

/** さく: たて 2 本（たけ）・よこ 3 本・むすび目 は 藍。絵の 高さ は 1.33 マス ぶん に のばして 貼る */
function fenceX(): Rgba[] {
  const t = new Array<Rgba>(N * N).fill(CLEAR);
  for (const [x, top] of [[3, 16], [11, 15]] as const) {
    span(t, x, 0, 1, top, BAMBOO.L);
    span(t, x + 1, 0, 1, top - 1, BAMBOO.D);
    for (const y of [5, 10]) { put(t, x, y, BAMBOO.N); put(t, x + 1, y, BAMBOO.N); }
  }
  for (const y of [4, 9, 13]) {
    span(t, 0, y + 1, N, 1, BAMBOO.H);
    span(t, 0, y, N, 1, BAMBOO.D);
  }
  for (const x of [5, 13]) { put(t, x, 13, NOREN); put(t, x, 14, NOREN); }
  return t;
}

/** もん: たけ の はしら 2 本・かさ木・藍 の のれん 3 まい（すそ は 生成り）。1.8 マス の 高さ に 貼る */
function gateX(): Rgba[] {
  const t = new Array<Rgba>(N * N).fill(CLEAR);
  for (const x0 of [1, 13]) {
    span(t, x0, 0, 1, 15, BAMBOO.L);
    span(t, x0 + 1, 0, 2, 15, BAMBOO.D);
    for (const y of [5, 10]) for (let i = 0; i < 3; i++) put(t, x0 + i, y, BAMBOO.N);
  }
  span(t, 0, 15, N, 1, BAMBOO.H);
  span(t, 0, 14, N, 1, BAMBOO.L);
  span(t, 0, 13, N, 1, BAMBOO.D);
  for (const x of [3, 12]) put(t, x, 13, NOREN);
  for (const x of [4, 7, 10]) {
    for (let y = 7; y < 13; y++) {
      put(t, x, y, NOREN);
      put(t, x + 1, y, NOREN_D);
    }
    put(t, x, 7, C.hem);
    put(t, x + 1, 7, C.hem);
  }
  return t;
}

export function paintLiveTile(name: LiveTileName): Rgba[] {
  switch (name) {
    case 'kotatsu_top':
      return kotatsuTop();
    case 'kotatsu_side':
      return kotatsuSide();
    case 'toriya_fence_top':
      return fenceTop();
    case 'toriya_fence_side':
      return fenceSide();
    case 'toriya_gate':
      return gate();
    case 'toriya_nest_roof':
      return nestRoof();
    case 'toriya_nest_side':
      return nestSide();
    case 'toriya_box_top':
      return boxTop();
    case 'toriya_box_side':
      return boxSide();
    case 'toriya_fence_x':
      return fenceX();
    case 'toriya_gate_x':
      return gateX();
  }
}
