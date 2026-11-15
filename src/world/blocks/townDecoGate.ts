/**
 * TOWN-1 1B-2 試作: 街の 門・たいこ橋・のれんの かざり ブロック（箱の 組み合わせ）。townGateParts.ts（門の 形ブロックの 表）だけ import する 葉。点 ＝ 1/16 ブロック。
 * 向きの ある 物は「正面が 東（x が 大きい 側）」の 形で 1 回 書き、4 向き（_e _s _w _n ＝ 正面が 向く 方角）の ブロックに して ある。
 * 置く とき は 向きの 印「@u+」「@u-」「@v+」「@v-」（townWrite.ts）で 街の 向きに あわせて えらぶ。
 * 数・形は この 表 1 か所。光る 物は 作らない（あんどんの 上限 12 の ため。ちょうちんは 光らない）。
 */
import { GATE_PARTS, type GatePartKey } from './townGateParts';

type GateBox = readonly [number, number, number, number, number, number, string, string?];

const c = (n: string): string => `town_c_${n}`;
const SHU = 'town_shubashira';

const GATE_DIRS = ['e', 's', 'w', 'n'] as const;
type GateDir = (typeof GATE_DIRS)[number];

/** 正面が 東の 形を、正面が d の 形に まわす（箱の 向きだけ。絵の 向きは そのまま） */
const face = (d: GateDir, b: GateBox): GateBox => {
  const [x0, y0, z0, x1, y1, z1, t, top] = b;
  const r: [number, number, number, number, number, number] =
    d === 'e' ? [x0, y0, z0, x1, y1, z1] : d === 's' ? [16 - z1, y0, x0, 16 - z0, y1, x1] : d === 'w' ? [16 - x1, y0, 16 - z1, 16 - x0, y1, 16 - z0] : [z0, y0, 16 - x1, z1, y1, 16 - x0];
  return top === undefined ? [...r, t] : [...r, t, top];
};

/** 向きの ある 物（正面が 東の 形）。名前は ここに 書く */
const FACING = {
  /** たいこ橋の らんかん: 橋に 近い ふち（正面）に 細く 立つ。柱 1 本と 上・下の 横木 */
  taiko_rail: { name: 'たいこ橋の らんかん', boxes: [[11, 0, 5, 16, 14, 11, SHU], [12, 14, 6, 16, 16, 10, c('kin')], [12, 9, 0, 16, 12, 16, SHU], [12, 3, 0, 16, 6, 16, SHU]] },
  /** ぎぼし（橋の 四すみ）: 太い 朱の 柱に 金の たま */
  giboshi: { name: 'ぎぼし', boxes: [[9, 0, 4, 16, 14, 12, SHU], [8, 14, 3, 16, 16, 13, c('kin')]] },
  /** のれん（正面の ふちに ぴったり。上の 棒に 2 まい・まん中が あく） */
  noren_hang_aka: { name: 'のれん（あか）', boxes: [[12, 13, 0, 15, 16, 16, c('koge')], [12, 3, 1, 15, 13, 7.5, c('aka')], [12, 3, 8.5, 15, 13, 15, c('aka')], [11.7, 8, 1, 15.3, 10, 15, c('kin')]] },
  noren_hang_ai: { name: 'のれん（あい）', boxes: [[12, 13, 0, 15, 16, 16, c('maki')], [12, 3, 1, 15, 13, 7.5, c('ao')], [12, 3, 8.5, 15, 13, 15, c('ao')], [11.7, 8, 1, 15.3, 10, 15, c('shiro')]] },
} as const satisfies Record<string, { name: string; boxes: readonly GateBox[] }>;
type FacingKey = keyof typeof FACING;
/** 門の 形ブロック（townGateParts.ts）の うち 向きの ある 物・ない 物 */
type PartFaceKey = { [K in GatePartKey]: (typeof GATE_PARTS)[K]['face'] extends true ? K : never }[GatePartKey];
type PartPlainKey = Exclude<GatePartKey, PartFaceKey>;

export type GateItemKey = PartPlainKey | `${FacingKey | PartFaceKey}_${GateDir}`;
export interface GateItem {
  name: string;
  boxes: readonly GateBox[];
}

const facing = (k: string, name: string, boxes: readonly GateBox[]): [string, GateItem][] => GATE_DIRS.map((d) => [`${k}_${d}`, { name: `${name}（${d}）`, boxes: boxes.map((b) => face(d, b)) }]);

/** 門の かざり 全部（id は town_<キー>）。向きの ある 物は 4 つずつ */
export const GATE_ITEMS: Readonly<Record<GateItemKey, GateItem>> = Object.fromEntries([
  ...(Object.keys(FACING) as FacingKey[]).flatMap((k) => facing(k, FACING[k].name, FACING[k].boxes)),
  ...(Object.keys(GATE_PARTS) as GatePartKey[]).flatMap((k): [string, GateItem][] => (GATE_PARTS[k].face ? facing(k, GATE_PARTS[k].name, GATE_PARTS[k].boxes) : [[k, { name: GATE_PARTS[k].name, boxes: GATE_PARTS[k].boxes }]])),
]) as Record<GateItemKey, GateItem>;
