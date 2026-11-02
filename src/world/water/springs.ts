import { BLOCK_INDEX } from '../blocks/blockTypes';
import { SPRING_TUNING as T } from '../blocks/liquids';
import { magmaAmount } from '../blocks/magma';
import { waterAmount } from '../blocks/water';
import { sectionToArray } from '../sections';
import { DX, DZ, chunkId, type LiquidCore, type LiquidWorld } from './liquidCore';

/**
 * WATERFALL-1 §4.2: わきどころ（水）・マグマの わきどころ。決まった 間かくで 1 つぶずつ 出す。
 * WAKIDOKORO §5: 出口は 下・北・東・南・西 の 5 つ（向きは 持たない）。入れる 出口 それぞれに 1 つぶ。
 * 水の わきどころは、出口から まっすぐ 下に たどった 床（takiReach マス 以内）が たきつぼ なら「つながった」とみなし、
 * たきつぼの 上の 水を 1 つぶ けして 同じ 1 つぶを 出口に 出す（量は かわらない）。
 * つながる 前は 出す だけ（水が すこし たまる）。水が 床に 落ちて いる 1 回ごとに 確率 takiChance で その 床が たきつぼに なる（シード つき）。
 * つながりは 保存しない（毎回 ブロックの 並びから 決まる）。だから 自然の 生成でも 2 つの ブロックを 置けば 動く。
 */

const WAKIMIZU = BLOCK_INDEX.wakimizu;
const MAGMA_WAKIMIZU = BLOCK_INDEX.magma_wakimizu;
const TAKITSUBO = BLOCK_INDEX.takitsubo;
/** マグマの わきどころが つながる たきつぼ（マグマの たきつぼ ＋ 前の 世界の ふつうの たきつぼ） */
const MAGMA_TAKI: ReadonlySet<number> = new Set([BLOCK_INDEX.magma_takitsubo, TAKITSUBO]);
const TAKI_FLOOR: ReadonlySet<number> = new Set(T.takiFloor.map((id) => BLOCK_INDEX[id]));
const AIR = BLOCK_INDEX.air;
/** わきどころの 番号 → マグマを 出すか */
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
  update(tick: number, focus?: { x: number; z: number } | null, cap?: number): void;
  /** WAKIDOKORO §10: さいごの 出す ステップで 動いた 数 */
  active(): number;
  onColumnLoaded(cx: number, cz: number): void;
  onColumnUnloaded(cx: number, cz: number): void;
  count(): number;
  /** わきどころの 状態（テスト用）: つながった たきつぼの 場所 か null */
  linkOf(x: number, y: number, z: number): { x: number; y: number; z: number } | null;
}

interface Spring {
  x: number;
  y: number;
  z: number;
  magma: boolean;
  rolls: number;
  /** WAKIDOKORO §10: さいごの 出す ステップで 動いた（上限の 内がわ）。ちらつき どめ の ゆとりに 使う */
  on: boolean;
  /** 並べかえ 用の 遠さ（その ステップだけ） */
  d: number;
  /** つながる 前に 出した つぶの 数（たきつぼが できる 前に 列 ＋ 1 マスぶん は たまる ように。§4.2） */
  emitted: number;
}

export function createSprings(world: LiquidWorld, water: LiquidCore, magma: LiquidCore, seed: number): Springs {
  const list = new Map<string, Spring>();
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const add = (x: number, y: number, z: number, magma: boolean): void => {
    const k = key(x, y, z);
    if (!list.has(k)) list.set(k, { x, y, z, magma, rolls: 0, emitted: 0, on: false, d: 0 });
  };
  const out = { x: 0, y: 0, z: 0 };
  /** その ステップで 動かす わきどころ（入れ物を 使いまわす） */
  const run: Spring[] = [];
  let lastActive = 0;

  /** WAKIDOKORO §5: 出口の 5 方向（下 → 北 → 東 → 南 → 西。上は 出さない） */
  const EX = [0, 0, 1, 0, -1] as const;
  const EY = [-1, 0, 0, 0, 0] as const;
  const EZ = [0, -1, 0, 1, 0] as const;
  /** 出口 d（0〜4）が 入れる マスなら out に 書いて true */
  function exitAt(s: Spring, core: LiquidCore, d: number): boolean {
    out.x = s.x + EX[d];
    out.y = s.y + EY[d];
    out.z = s.z + EZ[d];
    return core.room(world.getIndex(out.x, out.y, out.z)) >= 0;
  }

  /** 出口から まっすぐ 下の 床の 高さ（空気・水・マグマを ぬける）。takiReach より 深い・世界の 外は −1 */
  function floorBelow(x: number, y: number, z: number): number {
    for (let yy = y - 1; yy >= y - T.takiReach && yy >= 0; yy--) {
      const i = world.getIndex(x, yy, z);
      if (i < 0) return -1;
      if (i !== AIR && waterAmount(i) === 0 && magmaAmount(i) === 0) return yy;
    }
    return -1;
  }

  /**
   * 出口 out に 1 つぶ。真下の 床が その 液体の たきつぼ なら「つながって いる」: たきつぼの 上の 1 つぶを 出口へ（量は かわらない）。
   * 水: つながる 前は 出す だけ（床に 落ちた 1 回ごとに 確率で たきつぼが できる）。マグマ: たきつぼは できない（置く か 生成）
   */
  function stepExit(s: Spring, core: LiquidCore, amt: (i: number) => number): void {
    const fy = floorBelow(out.x, out.y, out.z);
    const floor = fy >= 0 ? world.getIndex(out.x, fy, out.z) : -1;
    if (s.magma ? MAGMA_TAKI.has(floor) : floor === TAKITSUBO) {
      if (fy + 1 === out.y) return;
      // けす つぶ: たきつぼの 真上、なければ その 北・東・南・西（たまり。はじめに 列が まだ 届いて いない とき）
      let ax = out.x;
      let az = out.z;
      let a = amt(world.getIndex(ax, fy + 1, az));
      for (let d = 0; d < 4 && a === 0; d++) {
        ax = out.x + DX[d];
        az = out.z + DZ[d];
        a = amt(world.getIndex(ax, fy + 1, az));
      }
      if (a === 0) return;
      const r = core.room(world.getIndex(out.x, out.y, out.z));
      core.write(ax, fy + 1, az, a - 1);
      core.write(out.x, out.y, out.z, r + 1);
      return;
    }
    core.write(out.x, out.y, out.z, core.room(world.getIndex(out.x, out.y, out.z)) + 1);
    if (s.magma) return;
    s.emitted++;
    // 水が 床に 落ちて いる（床の すぐ 上が 水）→ 1 回ごとに たきつぼが できる かも。
    // ただし 出した 数が 「列の 高さ ＋ 8」に 満たない うちは できない（まわる 水が 列より 少ないと 滝が とぎれる）
    // WAKIDOKORO §5.1: 出口から 床まで まっすぐ minFall マス 以上 落ちる とき だけ（階段の ように 1 マスずつ 流れる 水は 滝に ならない）
    if (fy >= 0 && out.y - fy >= T.minFall && TAKI_FLOOR.has(floor) && s.emitted >= out.y - fy + T.minPool && waterAmount(world.getIndex(out.x, fy + 1, out.z)) > 0) {
      s.rolls++;
      if (springRoll(seed, s.x, s.y, s.z, s.rolls) < T.takiChance) world.setBlock(out.x, fy, out.z, 'takitsubo');
    }
  }

  /** WAKIDOKORO §5: 5 方向 それぞれの 入れる 出口に 1 回ずつ */
  function step(s: Spring): void {
    const core = s.magma ? magma : water;
    const amt = s.magma ? magmaAmount : waterAmount;
    for (let d = 0; d < 5; d++) {
      if (world.getIndex(s.x, s.y, s.z) !== (s.magma ? MAGMA_WAKIMIZU : WAKIMIZU)) return; // たきつぼが できて こわれた など
      if (exitAt(s, core, d)) stepExit(s, core, amt);
    }
  }

  return {
    onChange(x, y, z, prev, next) {
      const pk = SPRING_OF.get(prev);
      if (pk !== undefined) list.delete(key(x, y, z));
      const nk = SPRING_OF.get(next);
      if (nk !== undefined) add(x, y, z, nk);
    },
    update(tick, focus, cap = T.maxActive) {
      if (list.size === 0) return;
      const w = tick % T.waterEvery === 0;
      const m = tick % T.magmaEvery === 0;
      if (!w && !m) return;
      const R = T.activeRadius;
      run.length = 0;
      for (const s of [...list.values()]) {
        if (world.getIndex(s.x, s.y, s.z) !== (s.magma ? MAGMA_WAKIMIZU : WAKIMIZU)) {
          list.delete(key(s.x, s.y, s.z));
          continue;
        }
        if (focus && (Math.abs(s.x - focus.x) > R || Math.abs(s.z - focus.z) > R)) {
          s.on = false;
          continue; // MAGMA-SPAWN: 遠い わきどころは 休む
        }
        if ((!s.magma && w) || (s.magma && m)) run.push(s);
      }
      // WAKIDOKORO §10: 上限より 多い ときは プレイヤーに 近い じゅん。前の ステップで 動いた ものは hold マス ぶん 近い あつかい（ちらつかない）。
      // 同じ 遠さは 座標の じゅん（いつも 同じ 並び）
      if (run.length > cap) {
        const fx = focus?.x ?? 0;
        const fz = focus?.z ?? 0;
        for (const s of run) s.d = Math.hypot(s.x + 0.5 - fx, s.z + 0.5 - fz) - (s.on ? T.capHold : 0);
        run.sort((a, b) => a.d - b.d || a.x - b.x || a.z - b.z || a.y - b.y);
        for (let i = cap; i < run.length; i++) run[i].on = false;
        run.length = cap;
      }
      lastActive = run.length;
      for (const s of run) {
        s.on = true;
        step(s);
      }
    },
    active: () => lastActive,
    onColumnLoaded(cx, cz) {
      for (let sy = 0; sy * 16 < world.size.y; sy++) {
        const sec = world.section(cx, sy, cz);
        if (sec === undefined) return;
        if (sec.kind === 'uniform') continue; // わきどころ だけの セクションは ない
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
      // つながった たきつぼ（5 つの 出口の うち はじめに 見つかった もの）
      const s = list.get(key(x, y, z));
      if (!s) return null;
      const core = s.magma ? magma : water;
      for (let d = 0; d < 5; d++) {
        if (!exitAt(s, core, d)) continue;
        const fy = floorBelow(out.x, out.y, out.z);
        const f = fy >= 0 ? world.getIndex(out.x, fy, out.z) : -1;
        if (s.magma ? MAGMA_TAKI.has(f) : f === TAKITSUBO) return { x: out.x, y: fy, z: out.z };
      }
      return null;
    },
  };
}
