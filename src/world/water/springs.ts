import { BLOCK_INDEX } from '../blocks/blockTypes';
import { SPRING_TUNING as T } from '../blocks/liquids';
import { waterAmount } from '../blocks/water';
import { sectionToArray } from '../sections';
import { DX, DZ, chunkId, type LiquidCore, type LiquidWorld } from './liquidCore';

/**
 * WATERFALL-1 §4.2: わきみず（水）・マグマの わきみず。決まった 間かくで 1 つぶずつ 出す。
 * 水の わきみずは、出口から まっすぐ 下に たどった 床（takiReach マス 以内）が たきつぼ なら「つながった」とみなし、
 * たきつぼの 上の 水を 1 つぶ けして 同じ 1 つぶを 出口に 出す（量は かわらない）。
 * つながる 前は 出す だけ（水が すこし たまる）。水が 床に 落ちて いる 1 回ごとに 確率 takiChance で その 床が たきつぼに なる（シード つき）。
 * つながりは 保存しない（毎回 ブロックの 並びから 決まる）。だから 自然の 生成でも 2 つの ブロックを 置けば 動く。
 */

const WAKIMIZU = BLOCK_INDEX.wakimizu;
const MAGMA_WAKIMIZU = BLOCK_INDEX.magma_wakimizu;
const TAKITSUBO = BLOCK_INDEX.takitsubo;
const TAKI_FLOOR: ReadonlySet<number> = new Set(T.takiFloor.map((id) => BLOCK_INDEX[id]));
const AIR = BLOCK_INDEX.air;
/** わきみずの 番号 → マグマを 出すか */
const SPRING_OF: ReadonlyMap<number, boolean> = new Map([[WAKIMIZU, false], [MAGMA_WAKIMIZU, true]]);

/** 整数の 混ぜあわせ（シード つきの 0〜1。Math.random は 使わない） */
export function springRoll(seed: number, x: number, y: number, z: number, n: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const v of [x, y, z, n]) {
    h = Math.imul(h ^ (v | 0), 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return h / 4294967296;
}

interface Springs {
  onChange(x: number, y: number, z: number, prev: number, next: number): void;
  update(tick: number): void;
  onColumnLoaded(cx: number, cz: number): void;
  onColumnUnloaded(cx: number, cz: number): void;
  count(): number;
  /** わきみずの 状態（テスト用）: つながった たきつぼの 場所 か null */
  linkOf(x: number, y: number, z: number): { x: number; y: number; z: number } | null;
}

interface Spring {
  x: number;
  y: number;
  z: number;
  magma: boolean;
  rolls: number;
  /** つながる 前に 出した つぶの 数（たきつぼが できる 前に 列 ＋ 1 マスぶん は たまる ように。§4.2） */
  emitted: number;
}

export function createSprings(world: LiquidWorld, water: LiquidCore, magma: LiquidCore, seed: number): Springs {
  const list = new Map<string, Spring>();
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const add = (x: number, y: number, z: number, magma: boolean): void => {
    const k = key(x, y, z);
    if (!list.has(k)) list.set(k, { x, y, z, magma, rolls: 0, emitted: 0 });
  };
  const out = { x: 0, y: 0, z: 0 };

  /** 出口（下 → 北 → 東 → 南 → 西 の 入れる マス）。なければ false */
  function exit(s: Spring, core: LiquidCore): boolean {
    if (core.room(world.getIndex(s.x, s.y - 1, s.z)) >= 0) {
      out.x = s.x;
      out.y = s.y - 1;
      out.z = s.z;
      return true;
    }
    for (let d = 0; d < 4; d++) {
      if (core.room(world.getIndex(s.x + DX[d], s.y, s.z + DZ[d])) >= 0) {
        out.x = s.x + DX[d];
        out.y = s.y;
        out.z = s.z + DZ[d];
        return true;
      }
    }
    return false;
  }

  /** 出口から まっすぐ 下の 床の 高さ（空気・水を ぬける）。takiReach より 深い・世界の 外は −1 */
  function floorBelow(x: number, y: number, z: number): number {
    for (let yy = y - 1; yy >= y - T.takiReach && yy >= 0; yy--) {
      const i = world.getIndex(x, yy, z);
      if (i < 0) return -1;
      if (i !== AIR && waterAmount(i) === 0) return yy;
    }
    return -1;
  }

  function stepWater(s: Spring): void {
    if (!exit(s, water)) return;
    const fy = floorBelow(out.x, out.y, out.z);
    const floor = fy >= 0 ? world.getIndex(out.x, fy, out.z) : -1;
    if (floor === TAKITSUBO) {
      // つながって いる: たきつぼの 上の 水 1 つぶ → 出口へ（出口 = たきつぼの 真上 なら 何も しない）
      if (fy + 1 === out.y) return;
      // けす 水: たきつぼの 真上、なければ その 北・東・南・西（たまりの 水。はじめに 列が まだ 届いて いない とき）
      let ax = out.x;
      let az = out.z;
      let a = waterAmount(world.getIndex(ax, fy + 1, az));
      for (let d = 0; d < 4 && a === 0; d++) {
        ax = out.x + DX[d];
        az = out.z + DZ[d];
        a = waterAmount(world.getIndex(ax, fy + 1, az));
      }
      if (a === 0) return;
      const r = water.room(world.getIndex(out.x, out.y, out.z));
      water.write(ax, fy + 1, az, a - 1);
      water.write(out.x, out.y, out.z, r + 1);
      return;
    }
    water.write(out.x, out.y, out.z, water.room(world.getIndex(out.x, out.y, out.z)) + 1);
    s.emitted++;
    // 水が 床に 落ちて いる（床の すぐ 上が 水）→ 1 回ごとに たきつぼが できる かも。
    // ただし 出した 数が 「列の 高さ ＋ 8」に 満たない うちは できない（まわる 水が 列より 少ないと 滝が とぎれる）
    if (fy >= 0 && TAKI_FLOOR.has(floor) && s.emitted >= out.y - fy + T.minPool && waterAmount(world.getIndex(out.x, fy + 1, out.z)) > 0) {
      s.rolls++;
      if (springRoll(seed, s.x, s.y, s.z, s.rolls) < T.takiChance) world.setBlock(out.x, fy, out.z, 'takitsubo');
    }
  }

  function stepMagma(s: Spring): void {
    if (!exit(s, magma)) return;
    magma.write(out.x, out.y, out.z, magma.room(world.getIndex(out.x, out.y, out.z)) + 1);
  }

  return {
    onChange(x, y, z, prev, next) {
      const pk = SPRING_OF.get(prev);
      if (pk !== undefined) list.delete(key(x, y, z));
      const nk = SPRING_OF.get(next);
      if (nk !== undefined) add(x, y, z, nk);
    },
    update(tick) {
      if (list.size === 0) return;
      const w = tick % T.waterEvery === 0;
      const m = tick % T.magmaEvery === 0;
      if (!w && !m) return;
      for (const s of [...list.values()]) {
        if (world.getIndex(s.x, s.y, s.z) !== (s.magma ? MAGMA_WAKIMIZU : WAKIMIZU)) {
          list.delete(key(s.x, s.y, s.z));
          continue;
        }
        if (!s.magma && w) stepWater(s);
        else if (s.magma && m) stepMagma(s);
      }
    },
    onColumnLoaded(cx, cz) {
      for (let sy = 0; sy * 16 < world.size.y; sy++) {
        const sec = world.section(cx, sy, cz);
        if (sec === undefined) return;
        if (sec.kind === 'uniform') continue; // わきみず だけの セクションは ない
        if (sec.kind === 'palette' && !sec.palette.some((b) => SPRING_OF.has(b))) continue;
        const d = sectionToArray(sec);
        for (let i = 0; i < 4096; i++) {
          const k = SPRING_OF.get(d[i]);
          if (k !== undefined) add(cx * 16 + (i & 15), sy * 16 + (i >> 8), cz * 16 + ((i >> 4) & 15), k);
        }
      }
    },
    onColumnUnloaded(cx, cz) {
      const id = chunkId(cx, cz);
      for (const [k, s] of list) if (chunkId(s.x >> 4, s.z >> 4) === id) list.delete(k);
    },
    count: () => list.size,
    linkOf(x, y, z) {
      const s = list.get(key(x, y, z));
      if (!s || s.magma || !exit(s, water)) return null;
      const fy = floorBelow(out.x, out.y, out.z);
      return fy >= 0 && world.getIndex(out.x, fy, out.z) === TAKITSUBO ? { x: out.x, y: fy, z: out.z } : null;
    },
  };
}
