/**
 * 小ブロック（9×9×9）の「仮の見た目」。ここだけ差しかえれば、形と色が変わる（メッシュ作りは見ない）。
 *
 * 約束（メッシュ作りが頼りにする）:
 * - `fillBlockLook(kind, bx, by, bz, exposed, out)` は out（長さ 729）に 0 = 空 / 1〜255 = 色番号（PALETTE_RGB）を書く。
 *   out の並びは (y * 9 + z) * 9 + x（y が上）。
 * - exposed は「となりが 空・水・はっぱ・十字の板 で、この面が外に見える」面の印（FACE_BIT の OR）。
 *   へこみ・でこぼこは **見える面の側だけ**。見えない面（となりの固いブロックにくっつく面）の外側の層は、ぜんぶ つまっている。
 * - 同じ (kind, bx, by, bz, exposed) からは、いつも同じ結果（位置のハッシュだけ。乱数は使わない）。
 * - はっぱ（leaves）だけは、どの面にも すきまがあってよい。
 */

export const LOOK_N = 9;
export const LOOK_VOLUME = LOOK_N * LOOK_N * LOOK_N;

/** 面の印。meshChunk の FACES の並びと同じ: 上, 下, +x, -x, +z, -z */
export const FACE_BIT = [1, 2, 4, 8, 16, 32] as const;
export const ALL_FACES = 63;

// ---- 色（sRGB の 16 進。仮の色）
const PALETTE_HEX: string[] = [];
function P(hex: string): number {
  let i = PALETTE_HEX.indexOf(hex);
  if (i < 0) {
    PALETTE_HEX.push(hex);
    i = PALETTE_HEX.length - 1;
  }
  return i + 1; // 0 は「空」
}
const set = (...hexes: string[]): number[] => hexes.map(P);

const GRASS = set('#5FA83A', '#4F9830', '#74BC48', '#6AB03F');
const DIRT = set('#8B5A2B', '#7A4E25', '#9C6A38', '#6E4620');
const SAND = set('#E3D49A', '#D8C888', '#EEE0AE');
const STONE = set('#8E8E8E', '#7C7C7C', '#A2A2A2', '#6F6F6F');
const COAL = set('#1E1E1E', '#2B2B2B');
const IRON = set('#D9A27A', '#C98B5E');
const LOG_BARK = set('#6B4423', '#5A3A1D', '#7A5230');
const LOG_RING = set('#B98A52', '#A67A45');
const LEAVES = set('#2F7D32', '#3D9140', '#256B2A', '#4DA550');
const BEDROCK = set('#3A3A3A', '#2A2A2A', '#4A4A4A');
const FURNACE = set('#8E8E8E', '#757575', '#A5A5A5');
const KAWARA = set('#4A5F7A', '#3E5169', '#566E8C');
const BRICK = set('#A84A3A', '#92402F', '#BC5846');
const TANSU = set('#A0703C', '#8C6032', '#B58048');
const FARMLAND = set('#5B3B1F', '#4C3019', '#6A4626');
const SPRINKLER = set('#7F9FB8', '#6A8AA3', '#93B1C8');
const DARK_FALLBACK = set('#FF00FF');

/** 色番号 → RGB（sRGB）。3 バイトずつ。0 番目（空）は黒 */
export const PALETTE_RGB: Uint8Array = (() => {
  const a = new Uint8Array((PALETTE_HEX.length + 1) * 3);
  PALETTE_HEX.forEach((h, i) => {
    const n = parseInt(h.slice(1), 16);
    a[(i + 1) * 3] = (n >> 16) & 255;
    a[(i + 1) * 3 + 1] = (n >> 8) & 255;
    a[(i + 1) * 3 + 2] = n & 255;
  });
  return a;
})();

// ---- ブロックの種類（BLOCK_TYPES の id で引く。番号は blockTypes.ts と同じ並び）
type Style = 'grass' | 'solid' | 'ore' | 'log' | 'leaves';
interface KindLook {
  style: Style;
  base: number[];
  /** ore のつぶの色 */
  speck?: number[];
}

const LOOKS: Record<string, KindLook> = {
  grass: { style: 'grass', base: DIRT },
  dirt: { style: 'solid', base: DIRT },
  sand: { style: 'solid', base: SAND },
  stone: { style: 'solid', base: STONE },
  coal_ore: { style: 'ore', base: STONE, speck: COAL },
  iron_ore: { style: 'ore', base: STONE, speck: IRON },
  log: { style: 'log', base: LOG_BARK },
  leaves: { style: 'leaves', base: LEAVES },
  bedrock: { style: 'solid', base: BEDROCK },
  furnace: { style: 'solid', base: FURNACE },
  kawara: { style: 'solid', base: KAWARA },
  brick: { style: 'solid', base: BRICK },
  tansu: { style: 'solid', base: TANSU },
  farmland: { style: 'solid', base: FARMLAND },
  farmland_wet: { style: 'solid', base: FARMLAND },
  sprinkler: { style: 'solid', base: SPRINKLER },
};

/** ブロック番号 → 見た目（無ければ undefined = 小ブロックで描かない種類: 空気・水・十字の板・たいまつ） */
export type KindLooks = (KindLook | undefined)[];

let byIndex: KindLooks | null = null;
let ids: readonly string[] = [];

/** blockTypes の id の並び（番号順）を渡して初期化する（look が blockTypes に依らないように、外から渡す） */
export function initLooks(blockIds: readonly string[]): void {
  ids = blockIds;
  byIndex = blockIds.map((id) => LOOKS[id]);
}

export function hasLook(kind: number): boolean {
  return byIndex !== null && byIndex[kind] !== undefined;
}

/** 3D テクスチャで空のマスをうめる色 / 見た目の「代表の色」 */
export function baseColorOf(kind: number): number {
  const l = byIndex?.[kind];
  if (!l) return DARK_FALLBACK[0];
  return l.style === 'grass' ? GRASS[0] : l.base[0];
}

/** この種類のブロックは、となりの面をかくすか（すきまのある はっぱ はかくさない） */
export function occludes(kind: number): boolean {
  const l = byIndex?.[kind];
  return l !== undefined && l.style !== 'leaves';
}

export function lookIdOf(kind: number): string {
  return ids[kind] ?? '?';
}

// ---- ハッシュ
function mix(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/** ブロックの位置と種類から作る数 */
export function blockHash(kind: number, bx: number, by: number, bz: number): number {
  return mix(mix(mix(kind + 1, bx), by), bz);
}

/** そのブロックの中の 1 マスの数（0 以上 2^32 未満） */
function cellHash(h: number, x: number, y: number, z: number): number {
  return mix(h, (y * 9 + z) * 9 + x);
}

const N = LOOK_N;

/** (x,y,z) が はしにある面のうち、見えない面にさわっていないか（へこませてよいか） */
function dentable(x: number, y: number, z: number, exposed: number): boolean {
  if (y === N - 1 && !(exposed & 1)) return false;
  if (y === 0 && !(exposed & 2)) return false;
  if (x === N - 1 && !(exposed & 4)) return false;
  if (x === 0 && !(exposed & 8)) return false;
  if (z === N - 1 && !(exposed & 16)) return false;
  if (z === 0 && !(exposed & 32)) return false;
  return true;
}

/** はしの層（外の面にさわる）か。その面が見えているときだけ true */
function onExposedSurface(x: number, y: number, z: number, exposed: number): boolean {
  return (
    (y === N - 1 && (exposed & 1) !== 0) ||
    (y === 0 && (exposed & 2) !== 0) ||
    (x === N - 1 && (exposed & 4) !== 0) ||
    (x === 0 && (exposed & 8) !== 0) ||
    (z === N - 1 && (exposed & 16) !== 0) ||
    (z === 0 && (exposed & 32) !== 0)
  );
}

/** 見えている面にさわる 1 段の内側（へこみの下の層）か */
function onSecondLayer(x: number, y: number, z: number, exposed: number): boolean {
  return (
    (y === N - 2 && (exposed & 1) !== 0) ||
    (x === N - 2 && (exposed & 4) !== 0) ||
    (x === 1 && (exposed & 8) !== 0) ||
    (z === N - 2 && (exposed & 16) !== 0) ||
    (z === 1 && (exposed & 32) !== 0)
  );
}

export function fillBlockLook(
  kind: number,
  bx: number,
  by: number,
  bz: number,
  exposed: number,
  out: Uint8Array,
): void {
  const look = byIndex?.[kind];
  if (!look) {
    out.fill(0, 0, LOOK_VOLUME);
    return;
  }
  const h = blockHash(kind, bx, by, bz);
  const top = (exposed & 1) !== 0;
  let i = 0;
  for (let y = 0; y < N; y++) {
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++, i++) {
        const c = cellHash(h, x, y, z);
        let color = 0;
        switch (look.style) {
          case 'grass': {
            // 草のふさ: 上が見えているとき、列ごとに高さが 7〜9（上 1〜2 段がでこぼこ）
            const colH = top && dentable(x, N - 1, z, exposed) ? 7 + (cellHash(h, x, 0, z) % 3) : N;
            if (y >= colH) {
              color = 0;
            } else if (y >= 6 || (y === 5 && c % 3 === 0)) {
              color = GRASS[(c >>> 8) % GRASS.length]; // 横の上の方は緑
            } else {
              color = DIRT[(c >>> 8) % DIRT.length]; // 下は土色
              if (onExposedSurface(x, y, z, exposed) && y < 5 && (c >>> 16) % 11 === 0 && dentable(x, y, z, exposed)) color = 0;
            }
            break;
          }
          case 'solid':
          case 'ore': {
            color = look.base[(c >>> 8) % look.base.length];
            if (onExposedSurface(x, y, z, exposed) && dentable(x, y, z, exposed) && (c >>> 16) % 7 === 0) {
              color = 0; // 表面 1 段を所々へこませる
            } else if (look.style === 'ore' && look.speck) {
              // つぶ: 2×2×2 のかたまり単位で 色をかえる
              const cell = mix(h, ((y >> 1) * 5 + (z >> 1)) * 5 + (x >> 1));
              if (cell % 5 === 0) color = look.speck[(cell >>> 8) % look.speck.length];
            }
            if (color !== 0 && look.style === 'solid' && onSecondLayer(x, y, z, exposed) && (c >>> 20) % 9 === 0) {
              color = look.base[(look.base.length - 1) % look.base.length]; // ほんの少しの色むら
            }
            break;
          }
          case 'log': {
            // 木目: 外から数えた層（たて縞）。上下の面は年輪っぽい二色
            const ring = Math.max(Math.abs(x - 4), Math.abs(z - 4));
            if (y === 0 || y === N - 1) {
              color = LOG_RING[ring % 2];
            } else {
              color = LOG_BARK[(ring + (c >>> 28)) % LOG_BARK.length];
              if (onExposedSurface(x, y, z, exposed) && dentable(x, y, z, exposed) && (c >>> 16) % 13 === 0) color = 0;
            }
            break;
          }
          case 'leaves': {
            color = (c >>> 16) % 10 < 3 ? 0 : look.base[(c >>> 8) % look.base.length];
            break;
          }
        }
        out[i] = color;
      }
    }
  }
}
