/**
 * MINE-1F（docs/design/MINE-1F.md §3.2・§4.6。アート docs/art/design/07-mine.md 20.12・見本 mine-art/1def/1F-yakata.png）:
 * ようかいの やかたの ブロックの 16×16 の 絵。A「まおうの しろ」= 四角い 切り石・市松の ゆか・ふちどりの だん・むらさきの 火 /
 * B「よるの おてら」= いびつな 石垣・ずらした 石だたみ・しめなわと 紙垂の だん・青白い 鬼火。乱数なし〔座標の ハッシュ〕。
 * かべ・ゆか・だんは となりと つながる〔はしで 切れる〕。たいまつは 細い 棒（TORCH_PX の 場所）と ほのおの 色だけ。
 */
type Rgba = readonly [number, number, number, number];
const T = 16;

export const YAKATA_TILE_NAMES = [
  'maou_kabe', 'maou_yuka', 'maou_dan_top', 'maou_dan_side', 'maou_taimatsu',
  'otera_ishigaki', 'otera_ishidatami', 'otera_dan_top', 'otera_dan_side', 'onibi_taimatsu',
] as const;
export type YakataTileName = (typeof YAKATA_TILE_NAMES)[number];
const NAME_SET: ReadonlySet<string> = new Set(YAKATA_TILE_NAMES);
export const isYakataTile = (name: string): name is YakataTileName => NAME_SET.has(name);

/** 絵の 色〔組ごと〕 */
const C = {
  maou: { stone: ['#4B3C6B', '#56467A', '#3F3260'], mortar: '#241A3A', check: ['#3A2D58', '#2D2248'], inlay: '#8E78C8', danTop: '#8D77BB', danEdge: '#B9A6E2', danSide: '#5C4A86', danDark: '#3A2C5E', dot: '#D8C8F5' },
  otera: { stone: ['#3C4256', '#454C62', '#333849'], seam: '#1E2230', paving: ['#434A5E', '#3A4054'], paveLine: '#222636', danTop: '#2C2E52', danSide: '#26284A', rope: '#C9B27A', ropeDark: '#8F7C4C', shide: '#F2F2EC', shideDark: '#C6C8CC' },
} as const;

const hex = (c: string): Rgba => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};
const hash = (x: number, y: number, k = 0): number => {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 144665 + k * 977, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) & 255;
};
const make = (f: (x: number, y: number) => string): Rgba[] => {
  const out: Rgba[] = [];
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) out.push(hex(f(x, y)));
  return out;
};

/** 四角い 切り石: 高さ 5 の だんが 3 つ〔5・5・6〕、石の はば 10〔1.5 こ ぶん。だんごとに 半分ずらす〕 */
function maouKabe(): Rgba[] {
  return make((x, y) => {
    const row = y < 5 ? 0 : y < 10 ? 1 : 2;
    const top = [0, 5, 10][row]!;
    const bottom = row === 2 ? T - 1 : top + 4;
    if (y === bottom) return C.maou.mortar;
    const off = row === 1 ? 5 : row === 2 ? 2 : 0;
    const cx = (x + off) % 10;
    if (cx === 9) return C.maou.mortar;
    const brick = Math.floor((x + off) / 10) + row * 3;
    const n = hash(x, y, brick);
    const base = C.maou.stone[brick % 2]!;
    if (y === top && cx !== 0) return C.maou.stone[1]!; // 上の ふちは 少し 明るい
    return n < 28 ? C.maou.stone[2]! : base;
  });
}

/** 市松の ゆか: 8×8 の 2 色の 市松。まん中に うすい むらさきの はめこみ〔十字〕 */
function maouYuka(): Rgba[] {
  return make((x, y) => {
    const a = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
    const lx = x % 8;
    const ly = y % 8;
    if (lx === 0 || ly === 0) return '#20183A';
    if (a === 0 && ((lx === 4 && ly >= 2 && ly <= 6) || (ly === 4 && lx >= 2 && lx <= 6))) return C.maou.inlay;
    const n = hash(x, y, 7);
    return n < 24 ? '#4A3B6E' : C.maou.check[a]!;
  });
}

/** 祭壇の 上〔ふちどり〕 */
function maouDanTop(): Rgba[] {
  return make((x, y) => {
    const edge = Math.min(x, y, T - 1 - x, T - 1 - y);
    if (edge === 0) return C.maou.danEdge;
    if (edge === 1) return C.maou.danDark;
    return hash(x, y, 3) < 30 ? '#9885C5' : C.maou.danTop;
  });
}

/** 祭壇の 横〔ふちどり・横の みぞ・点の もよう〕 */
function maouDanSide(): Rgba[] {
  return make((x, y) => {
    if (y === 0 || y === T - 1) return C.maou.danEdge;
    if (y === 1 || y === T - 2) return C.maou.danDark;
    if (y === 7 || y === 8) return '#2A1F47'; // 横の みぞ
    if ((y === 4 || y === 11) && x % 4 === 2) return C.maou.dot; // 点の もよう
    return hash(x, y, 5) < 26 ? '#6A5894' : C.maou.danSide;
  });
}

/** いびつな 石垣: 4×4 の ゆらした 点から いちばん ちかい 石。きわは 暗い すじ（まわりこむので つながる） */
const SEEDS: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) out.push([i * 4 + 1 + (hash(i, j, 11) % 3), j * 4 + 1 + (hash(i, j, 13) % 3)]);
  return out;
})();
function oteraIshigaki(): Rgba[] {
  const wrap = (d: number): number => (d > 8 ? d - 16 : d < -8 ? d + 16 : d);
  return make((x, y) => {
    let d1 = 1e9;
    let d2 = 1e9;
    let id = 0;
    for (let k = 0; k < SEEDS.length; k++) {
      const dx = wrap(x - SEEDS[k]![0]);
      const dy = wrap(y - SEEDS[k]![1]) * 1.15; // すこし 横ながの 石
      const d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; id = k; } else if (d < d2) d2 = d;
    }
    if (d2 - d1 < 0.9) return C.otera.seam;
    const n = hash(x, y, id);
    if (n < 22) return C.otera.stone[2]!;
    return C.otera.stone[id % 2]!;
  });
}

/** ずらして しいた 石だたみ: 高さ 5〜6 の だん・はばの ちがう 石。だんごとに ずらす */
function oteraIshidatami(): Rgba[] {
  const widths = [[7, 9], [10, 6], [5, 11]] as const;
  return make((x, y) => {
    const row = y < 5 ? 0 : y < 10 ? 1 : 2;
    const top = [0, 5, 10][row]!;
    const bottom = row === 2 ? T - 1 : top + 4;
    if (y === bottom) return C.otera.paveLine;
    const w = widths[row]!;
    const edge = x === w[0] - 1 || x === T - 1;
    if (edge) return C.otera.paveLine;
    const idx = x < w[0] ? 0 : 1;
    const n = hash(x, y, row * 2 + idx);
    if (y === top) return '#4C5470';
    return n < 26 ? '#31374A' : C.otera.paving[idx]!;
  });
}

/** 祭壇の 上: みがいた こい 石〔ふちに しめなわの 色の すじ〕 */
function oteraDanTop(): Rgba[] {
  return make((x, y) => {
    const edge = Math.min(x, y, T - 1 - x, T - 1 - y);
    if (edge === 0) return C.otera.rope;
    if (edge === 1) return C.otera.ropeDark;
    return hash(x, y, 9) < 22 ? '#34376A' : C.otera.danTop;
  });
}

/** 祭壇の 横: 上に しめなわ〔よじれ〕・白い 紙垂〔しで。ぎざぎざ〕 */
function oteraDanSide(): Rgba[] {
  return make((x, y) => {
    if (y <= 2) return (x + y) % 4 < 2 ? C.otera.rope : C.otera.ropeDark; // しめなわ
    const sx = x % 8;
    if (y >= 3 && y <= 11 && (sx === 2 || sx === 3)) {
      const zig = Math.floor((y - 3) / 2) % 2 === 0 ? 2 : 3; // ぎざぎざ
      if (sx === zig || y <= 4) return y % 2 === 0 ? C.otera.shide : C.otera.shideDark;
    }
    return hash(x, y, 4) < 24 ? '#303358' : C.otera.danSide;
  });
}

/** あやしい たいまつの 絵: 細い 棒（x=7〜8、y=4〜15）。さいしょの 行が 火の しん、つぎの 3 行が ほのお、のこりが 棒。textures.ts の TORCH_PX と そろえる */
function torchTile(flame: string, core: string, stick: string, stickLight: string): Rgba[] {
  const out: Rgba[] = [];
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      if (x < 7 || x > 8 || y < 4) out.push([0, 0, 0, 0]);
      else if (y === 4) out.push(hex(core));
      else if (y < 7) out.push(hex(flame));
      else out.push(hex(x === 7 ? stickLight : stick));
    }
  }
  return out;
}

const PAINT: Readonly<Record<YakataTileName, () => Rgba[]>> = {
  maou_kabe: maouKabe,
  maou_yuka: maouYuka,
  maou_dan_top: maouDanTop,
  maou_dan_side: maouDanSide,
  maou_taimatsu: () => torchTile('#B36CFF', '#F1DEFF', '#34303C', '#4A4552'), // 鉄の 火ざら ＋ むらさきの 火
  otera_ishigaki: oteraIshigaki,
  otera_ishidatami: oteraIshidatami,
  otera_dan_top: oteraDanTop,
  otera_dan_side: oteraDanSide,
  onibi_taimatsu: () => torchTile('#7FD0FF', '#EAF9FF', '#5A5A6A', '#77778A'), // 細い 燭台 ＋ 青白い 鬼火
};

export function paintYakataTile(name: YakataTileName): Rgba[] {
  return PAINT[name]();
}
