import type { Part, Prim, V3 } from './chickenSpec';
import { cachedModel, type BuiltModel } from './voxelMesh';

/**
 * LIVE-2 の とりごや（K3「さく の にわ」を 5×5 に。DESIGN 16.14）・たまご（こたつ・すばこ）の 形。
 * 小屋 の 形の 単位は 1/9 ブロック（世界の 物。生き物 の 1/16 では ない）。数は オーナーが OK した 試作
 * （`livestockV3.ts` の `coopK3x5`）と 同じ。原点 = 5×5 の まん中 の マス の 中心 の 地面、前（もん）= −z、上 = +y。
 * 乱数なし（わら の まだら は 場所の ハッシュ）。
 */
const box = (a: V3, b: V3, col: number): Prim => ({ k: 'box', a, b, col });
const fn = (a: V3, b: V3, f: (x: number, y: number, z: number) => number): Prim => ({ k: 'fn', a, b, f });

const hash = (x: number, y: number, z: number): number => {
  let h = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263 + Math.floor(z) * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** とりごや の 色（DESIGN 16.14） */
export const COOP_COL = {
  wood: 0xc9a574,
  woodD: 0x9e7c50,
  /** もんの かさ木 */
  lintel: 0x7a5434,
  roof: 0x4f6690,
  roofS: 0x3d5a9e,
  noren: 0x3d5a9e,
  hem: 0xefe7d4,
  box: 0xa87b4f,
  straw: 0xd9b65c,
  strawD: 0xc29a45,
} as const;

/** 形の 単位（1 点 = 1/9 ブロック）と 1/16 の 形 を 1/9 の メッシュ に 合わせる 倍率 */
export const COOP_UNIT = 1 / 9;
/** 小屋 の 三角形 の 上限（DESIGN 16.14・16.17）。すばこ の たまご は 入れない */
export const COOP_TRI_LIMIT = 3600;
/** こたつ（たまご なし。ブロック の 絵）の 目安 は 1,250。たまご 1 こ の 上限 */
export const EGG_TRI_LIMIT = 200;

/** 5×5 の とりごや の 部品（1/9 点）。そと 5×5・中 3×3、さく の 高さ 12/9、もん の 高さ 18/9、ねぐら は うしろの 列 */
export function coopSpec(): Part[] {
  const prims: Prim[] = [];
  const F = COOP_COL.wood;
  const FD = COOP_COL.woodD;
  const H = 22.5; // そとの はし（2.5 マス）
  const PH = 12; // さくの 高さ
  const ps = [-22.5, -13.5, -4.5, 4.5, 13.5, 22.5];
  // くい（前・左右。うしろは ねぐらの かべ）
  for (const a of ps) {
    prims.push(box([a - 1, 0, -H], [a + 1, PH + 1, -H + 1], FD));
    prims.push(box([-H, 0, a - 1], [-H + 2, PH + 1, a + 1], FD), box([H - 2, 0, a - 1], [H, PH + 1, a + 1], FD));
  }
  for (const y of [3, 7, 11]) {
    prims.push(box([-H, y, -H], [-H + 1.5, y + 1, H], F), box([H - 1.5, y, -H], [H, y + 1, H], F)); // 左右
    prims.push(box([-H, y, H - 1.5], [-13.5, y + 1, H], F), box([13.5, y, H - 1.5], [H, y + 1, H], F)); // うしろの すみ
    prims.push(box([-H, y, -H], [-5.5, y + 1, -H + 1.5], F), box([5.5, y, -H], [H, y + 1, -H + 1.5], F)); // 前（まん中 1 マスは 入口）
  }
  // 入口の もん（高さ 2 マス）＋ かさ木 ＋ のれん 3 まい（すそ に 生成りの 線）
  prims.push(box([-6, 0, -H], [-4, 18, -H + 2], FD), box([4, 0, -H], [6, 18, -H + 2], FD), box([-7, 18, -H], [7, 19.5, -H + 2], COOP_COL.lintel));
  for (const [x0, x1] of [[-4, -1.6], [-1.2, 1.2], [1.6, 4]] as const) {
    prims.push(box([x0, 12, -H + 0.5], [x1, 18, -H + 1.5], COOP_COL.noren), box([x0, 12, -H + 0.4], [x1, 13, -H + 1.6], COOP_COL.hem));
  }
  // ねぐら（うしろの 列 3 マス・ゆか ＋ かべ ＋ 三角やね。前は ひらく）
  const X = 13.5;
  const Z0 = 13.5;
  for (const x of [-X, X - 1.5]) for (const z of [Z0, H - 1.5]) prims.push(box([x, 0, z], [x + 1.5, 5, z + 1.5], FD));
  prims.push(box([-X, 5, Z0], [X, 6, H], F));
  prims.push(
    fn([-X - 1, 6, Z0 - 3], [X + 1, 27, H + 1.5], (x, y, z) => {
      const ax = Math.abs(x);
      if (y < 16) {
        if (z > H - 1.5 || ax > X - 1.5) return Math.floor(y) % 4 === 3 ? FD : F; // うしろ・横の かべ
        return -1; // 前は ひらく
      }
      const w = 7.5 - (y - 16) * 0.85; // 三角やね（むね は 左右）
      const dz = Math.abs(z - (Z0 + H) / 2);
      if (dz > w + 1.5 || ax > X + 1) return -1;
      if (dz < w - 0.5 && ax < X - 0.5) return -1;
      return Math.floor(x + 30) % 3 === 0 ? COOP_COL.roofS : COOP_COL.roof;
    }),
  );
  // すばこ（ゆかの 上・わら）と さか（中から ねぐらへ 4 段）
  prims.push(box([-6, 6, Z0 + 1], [6, 8, H - 2], COOP_COL.box));
  prims.push(fn([-5, 8, Z0 + 2], [5, 9, H - 3], (x, _y, z) => (hash(x, 9, z) < 0.3 ? COOP_COL.strawD : COOP_COL.straw)));
  for (let i = 0; i < 4; i++) prims.push(box([-11, 5 - i * 1.25, Z0 - 1.5 - i * 2], [-7, 6 - i * 1.25, Z0 + 0.5 - i * 2], FD));
  return [{ name: 'coop', pivot: [0, 0, 0], prims }];
}

export function getCoopModel(): BuiltModel {
  return cachedModel('coop:K3x5', coopSpec);
}

/** すばこ（ねぐら の ゆか の 上）の 場所（ブロック。小屋 の 中心 の 地面 から）。たまご を ならべる はんい */
export const NEST_BOX = { x0: -6 * COOP_UNIT, x1: 6 * COOP_UNIT, z0: 14.5 * COOP_UNIT, z1: 20.5 * COOP_UNIT, y: 9 * COOP_UNIT } as const;

// ---------------------------------------------------------------- たまご

/** たまご の 色（DESIGN 16.12・16.15）。`gold` = きん の たまご */
export const EGG_COL = {
  shell: 0xf5ecd8,
  shellD: 0xe2d6b8,
  crack: 0x8c7a5a,
  gold: 0xf4c430,
  goldD: 0xc8921c,
  goldCrack: 0x8a5e10,
} as const;

/** たまご 1 こ の 形（1/16。cracked = ひび 1 点）。中心 = (ox, oy, oz)、足もと = oy */
function eggPrim(gold: boolean, cracked: boolean, ox = 0, oy = 0, oz = 0): Prim {
  const body = gold ? EGG_COL.gold : EGG_COL.shell;
  const low = gold ? EGG_COL.goldD : EGG_COL.shellD;
  const crack = gold ? EGG_COL.goldCrack : EGG_COL.crack;
  return fn([-3 + ox, oy, -3 + oz], [3 + ox, 8 + oy, 3 + oz], (x, y, z) => {
    x -= ox;
    y -= oy;
    z -= oz;
    const dy = (y - 3.4) / 3.5;
    const rx = dy > 0 ? 2.3 : 2.7;
    if ((x / rx) ** 2 + (z / rx) ** 2 + dy * dy > 1) return -1;
    // ひび: 前（−z）の 面 に ぎざぎざ の 線 1 点
    if (cracked && z < -1.2 && Math.abs(y - (4.2 + (Math.floor(x + 6) % 2 === 0 ? 0 : 1))) < 0.5) return crack;
    return y < 1.5 ? low : body;
  });
}

/** こたつ に 入って いる たまご（1/16）。`cracked` = 2/3 から ひび */
export function eggSpec(gold: boolean, cracked: boolean): Part[] {
  return [{ name: 'egg', pivot: [0, 0, 0], prims: [eggPrim(gold, cracked)] }];
}

export function getEggModel(gold: boolean, cracked: boolean): BuiltModel {
  return cachedModel(`egg:${gold ? 'gold' : 'plain'}:${cracked ? 'crack' : 'whole'}`, () => eggSpec(gold, cracked));
}

/** すばこ の たまご 1 こ の 大きさ（1/16 の たまご に かける。すばこ は はば 12/9 しか ない ので 小さく） */
export const NEST_EGG_SCALE = 0.55;
/** すばこ に 見える たまご の 数の 上限（それ以上 は 数えて も 見えない。`coopNestMax` の 12） */
export const NEST_EGG_SHOWN = 12;

/**
 * すばこ の たまご の ならべ方（ブロック。`NEST_BOX` の 中）。6 こ まで は 2 列 × 3、7 こ から は 上 に 山。
 * 返す 配列 の 長さ = 見える たまご の 数。`gold` の ぶん は さきに ならぶ（きんいろ）。
 */
export function nestEggSlots(egg: number, gold: number): Array<{ x: number; y: number; z: number; gold: boolean }> {
  const total = Math.max(0, Math.min(NEST_EGG_SHOWN, Math.floor(egg) + Math.floor(gold)));
  const goldN = Math.min(total, Math.max(0, Math.floor(gold)));
  const out: Array<{ x: number; y: number; z: number; gold: boolean }> = [];
  const { x0, x1, z0, z1, y } = NEST_BOX;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const dx = (x1 - x0) / 3;
  const dz = (z1 - z0) / 2;
  const eggH = (8 / 16) * NEST_EGG_SCALE;
  for (let i = 0; i < total; i++) {
    let px: number;
    let pz: number;
    let py = y;
    if (i < 6) {
      px = cx + ((i % 3) - 1) * dx;
      pz = cz + (Math.floor(i / 3) - 0.5) * dz;
    } else {
      // 山: 下の たまご の すきま の 上
      const j = i - 6;
      px = cx + ((j % 3) - 1) * dx * 0.5 * (j < 3 ? 1 : 0.6);
      pz = cz + (j < 3 ? 0 : (j % 2 ? 1 : -1) * dz * 0.3);
      py = y + eggH * 0.8 + (j >= 3 ? eggH * 0.5 : 0);
    }
    out.push({ x: px, y: py, z: pz, gold: i < goldN });
  }
  return out;
}

/** すばこ の たまご 全部（1 メッシュ。単位 = 1/16 の 1 点 ＝ `NEST_EGG_SCALE`/16 ブロック） */
export function nestEggsSpec(egg: number, gold: number): Part[] {
  const u = NEST_EGG_SCALE / 16;
  const prims = nestEggSlots(egg, gold).map((s) => eggPrim(s.gold, false, s.x / u, s.y / u, s.z / u));
  return [{ name: 'nestEggs', pivot: [0, 0, 0], prims }];
}

export function getNestEggsModel(egg: number, gold: number): BuiltModel {
  const e = Math.max(0, Math.min(NEST_EGG_SHOWN, Math.floor(egg)));
  const g = Math.max(0, Math.min(NEST_EGG_SHOWN, Math.floor(gold)));
  const total = Math.min(NEST_EGG_SHOWN, e + g);
  const gn = Math.min(total, g);
  return cachedModel(`nestEggs:${total - gn}:${gn}`, () => nestEggsSpec(total - gn, gn));
}

/** から の かけら（足もと に ちる 3 つ。1×1 点。DESIGN 16.12） */
export const SHELL_COL = { a: 0xf5ecd8, b: 0xe2d6b8 } as const;

// ---------------------------------------------------------------- ねぐら の とびら（LIVE-3 仮。art 案 A: たて板 ＋ よこ さん 2 本）

/** とびら の 色（art 案 A の とびら と 同じ。木 は とりごや と 同じ 系） */
export const DOOR_COL = { frame: 0x8e6f48, plank: 0xc2a277, edge: 0xa68455, light: 0xb49468, bar: 0x9e7c51 } as const;

/** しまった とびら（1/9 点）。ねぐら の 前（z = 13.5）の ひらき（x −12〜12・y 6〜16）を ふさぐ。たて板 5 まい ＋ よこ さん 2 本 */
export function coopDoorSpec(): Part[] {
  const prims: Prim[] = [];
  const Z0 = 13.5;
  const z1 = Z0 + 1.2;
  const c = DOOR_COL;
  prims.push(box([-12, 6, Z0], [-10.5, 16, z1 + 0.3], c.frame), box([10.5, 6, Z0], [12, 16, z1 + 0.3], c.frame), box([-12, 6, Z0], [12, 7.2, z1 + 0.3], c.frame));
  const w = 21 / 5;
  for (let i = 0; i < 5; i++) {
    const x0 = -10.5 + i * w;
    prims.push(box([x0, 7.2, Z0], [x0 + w, 16, z1], c.plank), box([x0, 7.2, Z0], [x0 + 0.5, 16, z1 + 0.05], c.edge), box([x0 + w * 0.55, 7.2, Z0], [x0 + w * 0.8, 16, z1 + 0.05], c.light));
  }
  for (const y of [8.6, 13.4]) prims.push(box([-10.5, y, z1 - 0.1], [10.5, y + 1.1, z1 + 0.4], c.bar));
  return [{ name: 'coopDoor', pivot: [0, 0, 0], prims }];
}

export function getCoopDoorModel(): BuiltModel {
  return cachedModel('coop:door:A', coopDoorSpec);
}
