import { CHEST_RIGHT, type ChestCompass } from '../blocks/chestBlock';
import { YAKATA_TABLE as T, YAKATA_TUNING as TUNE, type Zone } from './mineYakataConfig';
import { keyOf } from './mineShaftBuild';
import type { PathCell, Pt } from './mineShaftTypes';
import type { Rng } from './random';

/**
 * やかたの 形（MINE-1F §4.2）: 本道の かべの 口から、あやしい 横穴 → 門 → 大広間 → 祭壇。計算だけ〔世界には さわらない〕。
 * 見た目の 組〔A・B〕に よらない 形〔ブロックは「役」で 持つ。組の ブロックへ 直すのは mineYakataPlan.ts〕。
 * 座標は 本道の 口の 中心 o・横穴の すすむ 向き t〔本道から はなれる 向き〕・横の 向き w の (b, a)。b ＝ o から t へ の マス数・a ＝ 横。
 */

export type Role = 'kabe' | 'yuka' | 'dan' | 'taimatsu';
export type { Zone };
export interface Rect {
  x0: number;
  y: number;
  z0: number;
  x1: number;
  z1: number;
}
export interface YakataShape {
  passage: Pt[];
  gate: Rect;
  hall: Rect;
  altar: Rect;
  chest: { x: number; y: number; z: number; cells: Pt[]; front: ChestCompass };
  spawns: { at: Pt; zone: Zone }[];
  /** 空気に する マス〔横穴・門・大広間の 中〕 */
  air: Set<number>;
  /** かならず 固く する マス〔外がわの いし〕 */
  ring: Set<number>;
  /** 置く ブロック〔役〕 */
  roles: Map<number, Role>;
  /** 道の 足の マス〔横穴・大広間の 床・祭壇の 上〕 */
  path: PathCell[];
  /** 門の 12 マス〔ふさぐ とき〕 */
  gateCells: Pt[];
  torches: number;
}

/** やかたの 外の ふち〔大広間の まわり ring マス ＋ 横穴の まわり 2 マス。y は 床の 下 ring マスから 天井の 上 ring マス〕。両はし ふくむ */
export function yakataBoxOf(y: { hall: Rect; passage: readonly Pt[] }): { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number } {
  const xs = [y.hall.x0 - 1 - T.ring, y.hall.x1 + 1 + T.ring, ...y.passage.map((p) => p.x - 2), ...y.passage.map((p) => p.x + 2)];
  const zs = [y.hall.z0 - 1 - T.ring, y.hall.z1 + 1 + T.ring, ...y.passage.map((p) => p.z - 2), ...y.passage.map((p) => p.z + 2)];
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), y0: y.hall.y - 1 - T.ring, y1: y.hall.y + T.hall.height + 1 + T.ring };
}

export interface ShapeIn {
  o: Pt;
  /** 本道から はなれる 向き〔軸 ぞろい〕と 横の 向き */
  t: { x: number; z: number };
  w: { x: number; z: number };
  y: number;
  /** 横穴の 長さ〔マス〕 */
  length: number;
  rng: Rng;
}

const rectOf = (pts: readonly { x: number; z: number }[], y: number): Rect => ({
  x0: Math.min(...pts.map((p) => p.x)),
  y,
  z0: Math.min(...pts.map((p) => p.z)),
  x1: Math.max(...pts.map((p) => p.x)),
  z1: Math.max(...pts.map((p) => p.z)),
});

const frontOf = (t: { x: number; z: number }): ChestCompass => (t.z < 0 ? 's' : t.z > 0 ? 'n' : t.x > 0 ? 'w' : 'e');

/** 形を つくる〔座標は ShapeIn の とおり〕 */
export function yakataShape(c: ShapeIn): YakataShape {
  const { o, t, w, y, length: L } = c;
  const H = T.hall.height;
  const half = (T.hall.size - 1) / 2; // 8
  const gateHalf = (T.gate.width - 1) / 2; // 1
  const bg = 2 + L; // 門の かべの b
  const bs = bg + 1; // 大広間の 床の はじまり b〔s = 0〕
  const bFar = bs + T.hall.size - 1; // 大広間の いちばん おく b〔s = 16〕
  const px = (b: number, a: number): number => o.x + t.x * b + w.x * a;
  const pz = (b: number, a: number): number => o.z + t.z * b + w.z * a;
  const key = (b: number, a: number, h: number): number => keyOf(px(b, a), y + h, pz(b, a));
  const cell = (b: number, a: number, h = 0): Pt => ({ x: px(b, a), y: y + h, z: pz(b, a) });

  const air = new Set<number>();
  const roles = new Map<number, Role>();
  const ring = new Set<number>();
  const path: PathCell[] = [];
  const stand = (p: Pt): void => {
    path.push({ ...p, part: 'yakata' }); // たいまつの マスも 歩いて 通れる〔ぶつからない〕
  };

  // --- 横穴
  const passage: Pt[] = [];
  const pAir = (b: number): void => {
    for (let a = -1; a <= 1; a++) for (let h = 0; h < T.passage.height; h++) air.add(key(b, a, h));
  };
  for (let i = 0; i < L; i++) {
    const b = 2 + i;
    pAir(b);
    passage.push(cell(b, 0));
    stand(cell(b, 0));
  }
  // 口の 柱 2 本と はり〔b = 2。本道の かべの 口〕
  for (const a of [-2, 2]) for (let h = 0; h < TUNE.mouthPillar; h++) roles.set(key(2, a, h), 'kabe');
  for (let a = -2; a <= 2; a++) roles.set(key(2, a, T.passage.height), 'kabe');
  // 横穴の たいまつ: 1 マス目から 3 マスごと 左右 こうご〔光 6 以上。床の 高さの 横の マス〕
  let torches = 0;
  for (let i = 1, k = 0; i < L; i += T.passage.torchEvery, k++) {
    roles.set(key(2 + i, k % 2 === 0 ? 1 : -1, 0), 'taimatsu');
    torches++;
  }

  // --- 門〔かべの 12 マス〕
  const gateCells: Pt[] = [];
  for (let h = 0; h < T.gate.height; h++) for (let a = -gateHalf; a <= gateHalf; a++) gateCells.push(cell(bg, a, h));
  for (const p of gateCells) air.add(keyOf(p.x, p.y, p.z));
  const gate = rectOf(gateCells.filter((p) => p.y === y), y);

  // --- 大広間: かべ・天井・床〔あつさ 1〕
  for (let b = bg; b <= bFar + 1; b++) {
    for (let a = -half - 1; a <= half + 1; a++) {
      const rim = b === bg || b === bFar + 1 || a === -half - 1 || a === half + 1;
      roles.set(key(b, a, -1), rim ? 'kabe' : 'yuka');
      roles.set(key(b, a, H), 'kabe');
      if (!rim) continue;
      for (let h = 0; h < H; h++) roles.set(key(b, a, h), 'kabe');
    }
  }
  for (const p of gateCells) roles.delete(keyOf(p.x, p.y, p.z));
  // 中の 空気
  const hallCells: Pt[] = [];
  for (let b = bs; b <= bFar; b++) {
    for (let a = -half; a <= half; a++) {
      hallCells.push(cell(b, a));
      for (let h = 0; h < H; h++) air.add(key(b, a, h));
    }
  }
  const hall = rectOf(hallCells, y);
  // 柱 4 本〔2×2・床から 天井まで。まん中の 道 はば 5 を あける〕
  const pillar = new Set<number>();
  for (const s0 of [TUNE.pillarFront, TUNE.pillarBack]) {
    for (const a0 of [-TUNE.pillarSide - 1, TUNE.pillarSide]) {
      for (let s = s0; s <= s0 + 1; s++) {
        for (let a = a0; a <= a0 + 1; a++) {
          pillar.add(s * 1000 + a);
          for (let h = 0; h < H; h++) {
            air.delete(key(bs + s, a, h));
            roles.set(key(bs + s, a, h), 'kabe');
          }
        }
      }
    }
  }
  // 祭壇 2 段〔下の 段 7×5・上の 段 5×3。おくの かべぎわの まん中〕
  const [lowW, lowD] = T.altar.lower;
  const [upW, upD] = T.altar.upper;
  const sLow0 = T.hall.size - lowD - TUNE.altarGap; // 12
  const sMid = sLow0 + Math.floor(lowD / 2); // 14
  const inLow = (s: number, a: number): boolean => s >= sLow0 && s < sLow0 + lowD && Math.abs(a) <= (lowW - 1) / 2;
  const inUp = (s: number, a: number): boolean => Math.abs(s - sMid) <= (upD - 1) / 2 && Math.abs(a) <= (upW - 1) / 2;
  const altarCells: Pt[] = [];
  const altarTop: Pt[] = [];
  for (let s = sLow0; s < sLow0 + lowD; s++) {
    for (let a = -(lowW - 1) / 2; a <= (lowW - 1) / 2; a++) {
      altarCells.push(cell(bs + s, a, 1));
      air.delete(key(bs + s, a, 0));
      roles.set(key(bs + s, a, 0), 'dan');
      if (inUp(s, a)) {
        air.delete(key(bs + s, a, 1));
        roles.set(key(bs + s, a, 1), 'dan');
        altarTop.push(cell(bs + s, a, 2));
      }
    }
  }
  const altar = rectOf(altarCells, y + 1);
  // 宝箱: 上の 段の まん中の 2 マス〔前 ＝ 門の ほう〕。のこりは 本体の 右がわ
  const front = frontOf(t);
  const [rx, rz] = CHEST_RIGHT[front];
  const mid = cell(bs + sMid, 0, 2);
  const same = mid.x >> 4 === (mid.x + rx) >> 4 && mid.z >> 4 === (mid.z + rz) >> 4;
  const cells: Pt[] = same ? [mid, { x: mid.x + rx, y: mid.y, z: mid.z + rz }] : [{ x: mid.x - rx, y: mid.y, z: mid.z - rz }, mid];
  for (const p of cells) air.delete(keyOf(p.x, p.y, p.z));
  const chestSet = new Set(cells.map((p) => keyOf(p.x, p.y, p.z)));
  // 大広間の たいまつ〔光 9 が 7 マスで 2 に なる ので、どの 床からも 7 マス いない に 1 本〕: 門がわ 2・柱の 門がわ 4・おくの すみ 2・祭壇の 下の 段の 前の すみ 2
  const torchAt = (b: number, a: number, h: number): void => {
    roles.set(key(b, a, h), 'taimatsu');
    torches++;
  };
  torchAt(bs, -TUNE.torchGateSide, 0);
  torchAt(bs, TUNE.torchGateSide, 0);
  for (const s of [TUNE.pillarFront - 1, TUNE.pillarBack - 1]) for (const a of [-TUNE.pillarSide, TUNE.pillarSide]) torchAt(bs + s, a, 0);
  torchAt(bs + T.hall.size - 1, -half, 0);
  torchAt(bs + T.hall.size - 1, half, 0);
  for (const a of [-(lowW - 1) / 2, (lowW - 1) / 2]) torchAt(bs + sLow0, a, 1);

  // --- 道の 足の マス〔大広間の 床・祭壇の 上〕
  for (let s = 0; s < T.hall.size; s++) {
    for (let a = -half; a <= half; a++) {
      if (pillar.has(s * 1000 + a) || inLow(s, a)) continue;
      stand(cell(bs + s, a));
    }
  }
  for (let s = sLow0; s < sLow0 + lowD; s++) for (let a = -(lowW - 1) / 2; a <= (lowW - 1) / 2; a++) if (!inUp(s, a)) stand(cell(bs + s, a, 1));
  for (const p of altarTop) if (!chestSet.has(keyOf(p.x, p.y, p.z))) stand(p);

  // --- 外がわの いし〔かならず 固く する〕: 大広間の まわり ring マス・横穴の まわり
  const R = T.ring;
  for (let b = bg - R; b <= bFar + 1 + R; b++) {
    for (let a = -half - 1 - R; a <= half + 1 + R; a++) for (let h = -1 - R; h <= H + R; h++) ring.add(key(b, a, h));
  }
  for (let i = 0; i < L; i++) {
    const b = 2 + i;
    for (let a = -2; a <= 2; a++) for (let h = -2; h <= T.passage.height; h++) ring.add(key(b, a, h));
  }
  for (const k of air) ring.delete(k);
  for (const k of roles.keys()) ring.delete(k);

  // --- 出る 場所の 候補〔宝箱から 6〜10・おたがい 3 マス いじょう・左右の 区分 4 か所ずつ〕
  const cc = { x: cells.reduce((s, p) => s + p.x, 0) / 2, z: cells.reduce((s, p) => s + p.z, 0) / 2 };
  const torchKeys = new Set([...roles].filter(([, r]) => r === 'taimatsu').map(([k]) => k));
  const eligible: { at: Pt; zone: Zone }[] = [];
  for (let s = 0; s < T.hall.size; s++) {
    for (let a = -half; a <= half; a++) {
      if (pillar.has(s * 1000 + a) || inLow(s, a) || torchKeys.has(key(bs + s, a, 0))) continue;
      const at = cell(bs + s, a);
      const d = Math.hypot(at.x - cc.x, at.z - cc.z);
      if (d < T.spawn.fromChest[0] || d > T.spawn.fromChest[1]) continue;
      const lat = (at.x - cc.x) * w.x + (at.z - cc.z) * w.z; // 宝箱から 横〔w の むき〕
      const fw = -((at.x - cc.x) * t.x + (at.z - cc.z) * t.z); // 宝箱から 門の ほう
      if (fw > 0.5 && fw >= 1.5 * Math.abs(lat)) eligible.push({ at, zone: 'front' }); // 門の ほうへ 約 34 度の はんい
      else if (lat !== 0) eligible.push({ at, zone: lat < 0 ? 'left' : 'right' });
    }
  }
  // 区分ごとに 4 か所〔おたがい apart マス いじょう〕。くじで ならべて 足りなければ 何回か ひきなおす
  const zoneList: Zone[] = ['left', 'right', 'front'];
  let spawns: YakataShape['spawns'] = [];
  for (let attempt = 0; attempt < TUNE.spawnTries && spawns.length < T.spawn.perZone * zoneList.length; attempt++) {
    spawns = [];
    for (const z of zoneList) {
      for (const e of shuffle(c.rng, eligible.filter((q) => q.zone === z))) {
        if (spawns.filter((q) => q.zone === z).length >= T.spawn.perZone) break;
        if (spawns.some((q) => Math.hypot(q.at.x - e.at.x, q.at.z - e.at.z) < T.spawn.apart)) continue;
        spawns.push({ at: e.at, zone: z });
      }
    }
  }
  return { passage, gate, hall, altar, chest: { x: cells[0]!.x, y: cells[0]!.y, z: cells[0]!.z, cells, front }, spawns, air, ring, roles, path, gateCells, torches };
}

function shuffle<A>(rng: Rng, xs: A[]): A[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs;
}
