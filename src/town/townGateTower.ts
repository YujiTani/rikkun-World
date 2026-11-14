import { Builder, T } from './townBuilder';
import { GATE_CODES, GATE_LAYERS } from './townGateLayers';
import { GATE_PARTS, type GatePartKey } from '../world/blocks/townGateParts';

/**
 * TOWN-1 1B-2 試作: 街の 門（二かいだての 楼門）の 置き方。形は アートの 設計 v2（gate-design.png）。
 * 段ごとの 表は townGateLayers.ts（絵を 作った スクリプトから 書き出した 物）、形ブロックは townGateParts.ts。ここは 置く 場所と へい・あかりだけ。
 * 正面は 南（v が 大きい 方）。表の 向き e・s・w・n は 街の 向きの 印 @u+ @v+ @u- @v- に して 置く（townWrite.ts が 世界の 向きに あわせる）。
 * 門は たいこ橋（用水路 v 90〜93）の 手前（北）に 立つ: 橋を わたると 正面の 門が 迎える。石段（u 38・39 と 57・58 の v 86〜89）の きりこみには かからない よう v 73〜85 に おく。
 */
export const GATE = {
  /** 門の ひだり うしろの かど（u・v）。はば 19（u 41〜59）・おく 13（v 73〜85）。まん中の 通り道は u 50 の まわり */
  origin: { u: 41, v: 73 },
  /** 通り道: u の はんい（はば 5）・v の はんい（門の おく ぜんぶ）・頭の 高さ（dy 0〜clearDy が あいている。高さ 6） */
  passage: { u0: 48, u1: 52, v0: 73, v1: 85, clearDy: 5 },
  /** へい（白かべ・かわらのせ）: v と 左右の u の はんい（門の 土台の 外がわから） */
  wall: { v: 79, west: [37, 41], east: [59, 63] },
  /** 石どうろう 4（u, v, 台の 高さ ブロック）。あかりの 数は 上限どおり 4 */
  toro: [[36, 79, 2], [64, 79, 2], [46, 87, 0], [54, 87, 0]],
  /** 赤い のぼり 4（u, v） */
  noboru: [[41, 87], [59, 87], [47, 87], [53, 87]],
} as const;

/** 表の 向きの 文字 → 街の 向きの 印 */
const DIR_MARK = { e: '@u+', w: '@u-', s: '@v+', n: '@v-' } as const;
const PAVING = ['ishidatami_b', 'ishidatami_a', 'ishidatami_c'] as const;

/** 表の 1 マス（3 文字）を ブロックの 名前に する。「---」は 空（置かない） */
function cellId(token: string, u: number, v: number): string {
  if (token === '---') return '';
  const code = token.slice(0, 2) as keyof typeof GATE_CODES;
  const d = token.slice(2);
  const def = GATE_CODES[code];
  if ('paving' in def) return T(PAVING[(u + v * 2) % 3]!);
  if ('block' in def) return T(def.block);
  const part: GatePartKey = def.part;
  if (!GATE_PARTS[part].face) return T(part);
  if (d !== 'e' && d !== 's' && d !== 'w' && d !== 'n') throw new Error(`門の 表: 向きが ない ${token}`);
  return `${T(part)}${DIR_MARK[d]}`;
}

/** 門の からだ（段の 表を そのまま 置く） */
export function buildTower(b: Builder): void {
  const { u: u0, v: v0 } = GATE.origin;
  GATE_LAYERS.forEach((rows, i) => {
    rows.forEach((row, r) => {
      row.split(' ').forEach((token, c) => b.put(u0 + c, v0 + r, i - 1, cellId(token, u0 + c, v0 + r)));
    });
  });
}

/** 門の まわり: 左右の へい（白かべ・かわらのせ）・石どうろう・のぼり */
export function buildYard(b: Builder): void {
  const Wl = GATE.wall;
  for (const [a, z] of [Wl.west, Wl.east]) {
    for (let u = a; u <= z; u++) {
      b.put(u, Wl.v, 0, T('ishizumi'));
      b.fill(u, Wl.v, 1, u, Wl.v, 2, T('shikkui'));
      b.put(u, Wl.v, 3, T('munegawara'));
    }
  }
  for (const [u, v, base] of GATE.toro) {
    if (base > 0) b.fill(u, v, 0, u, v, base - 1, T('ishizumi'));
    b.put(u, v, base, T('toro_mini'));
  }
  for (const [u, v] of GATE.noboru) b.fill(u, v, 0, u, v, 1, T('noboru_aka'));
}
