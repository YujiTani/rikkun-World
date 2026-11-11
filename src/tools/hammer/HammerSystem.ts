import { LEGEND4_ID } from '../../content/items/ids';
import { LEGEND4_TUNING } from '../../content/items/legend4Tuning';
import type { ItemId, Vec3, VoxelWorld, YokaiInfo, YokaiWorld } from '../../contracts';
import { boxOf, inFanColumn, wallBetween } from '../../combat/attackFacing';
import { breakCells, diveDamage, diveDepth, facingDir4OfYaw, isBreakable, type Cell } from './hammerModel';

/**
 * 大地のハンマー（LEGEND-4 §8）の しくみ。1 ステップ 1 回 `update` を 呼ぶ（人ごとに 1 つ。1P も 2P も 同じ 部品）。
 * 地面: 押した ステップ = F1。F43 に 前の 3 × 2 を こわし、F43〜F51 の 妖怪に 1 回ずつ。F159 で おわり、押しつづけで 次の F1。
 * 空中: 押した ステップで その 高さ y0 を おぼえ、diveHover ステップ 止まり、そのあと 1 ステップ 0.5 ずつ 真下へ。着地した ステップ = F43。
 */
const T = LEGEND4_TUNING.daichi;
const DEG = Math.PI / 180;
/** ステップ。1 振りの ながさ（出だし ＋ 当たり ＋ 後すき） */
const TOTAL = T.startup + T.active + T.recovery;
/** ステップ。着地の あと 落下ダメージを 見ない 長さ（次の 地面の ステップで ためた 高さを けす） */
const NO_FALL_AFTER_LAND = T.noFallAfterLand;
/** マス。足もとの 地面を 見る はば（からだの 半分より 少し 小さく） */
const FOOT_HALF = T.footHalf;
const EPS = 1e-6;

type HammerPhase = 'idle' | 'swing' | 'hover' | 'dive';

interface HammerLast {
  /** 急降下で 落ちた 高さ（地面の 振りは 0） */
  h: number;
  damage: number;
  depth: 1 | 2;
  broken: Cell[];
}

interface HammerView {
  phase: HammerPhase;
  f: number;
  diveFrom: number | null;
  last: HammerLast | null;
}

/** 画面用の 出来事（呼ぶと 空） */
export type HammerEvent =
  | { type: 'slam'; position: Vec3; dir: { dx: number; dz: number }; depth: number; cells: Cell[]; big: boolean }
  | { type: 'bonk'; position: Vec3; dir: { dx: number; dz: number } };

export interface HammerCtx {
  item: ItemId | null;
  /** 遊べる（やられて いない・ひるんで いない・画面が あそび中） */
  active: boolean;
  pressed: boolean;
  held: boolean;
  /** 足もと（コントローラが 動かした あと） */
  position: Vec3;
  yawDeg: number;
  onGround: boolean;
  inWater: boolean;
}

export interface HammerMotion {
  speedMul: number;
  jumpLocked: boolean;
  noRun: boolean;
  /** 水平の 速さを 0 に する */
  stopNow: boolean;
  /** null でない あいだ 足もとの 高さを これへ（重力なし）。急降下の ふりかぶり・落ちる 間 */
  hoverY: number | null;
}

export interface HammerDeps {
  world: Pick<VoxelWorld, 'getBlock' | 'isSolid'>;
  yokai: () => YokaiWorld;
  /** 1 マス ふつうに ほった ときと 同じに こわす（こわせたら true）。持ち物・ドロップは 持ち主の もの */
  breakAt: (x: number, y: number, z: number) => boolean;
  /** たいきゅうを 1 振り ぶん へらす */
  wear: () => void;
  /** 音の 名前（hammerSwing・hammerDive・hammerSlam・hammerBonk） */
  sound: (name: 'hammerSwing' | 'hammerDive' | 'hammerSlam' | 'hammerBonk') => void;
}

export interface HammerSystem {
  update(ctx: HammerCtx): void;
  motion(): HammerMotion;
  view(): HammerView;
  /** 落下ダメージを 見ない か（急降下の 間と 着地の あと すこし） */
  noFall(): boolean;
  drainEvents(): HammerEvent[];
}

function isHammerItem(item: ItemId | null | undefined): boolean {
  return item === LEGEND4_ID.daichi_hammer;
}

export function createHammerSystem(d: HammerDeps): HammerSystem {
  let phase: HammerPhase = 'idle';
  let f = 0;
  let diveFrom: number | null = null;
  let last: HammerLast | null = null;
  let buffered = false;
  let yaw = 0;
  let lastY = 0;
  let noFallLeft = 0;
  let curDamage: number = T.damage;
  let curDepth = 1;
  let curH = 0;
  let acted = false; // この 振りで 何か こわした／当てた（たいきゅう 1 回・ゴンの 判定）
  let slammed = false;
  const hitSet = new Set<number>();
  // 出来事の 入れ物は 2 本を 入れかえて 使う（毎ステップ 新しく 作らない）。返した 配列は 次の 次の drainEvents まで 有効
  let events: HammerEvent[] = [];
  let spare: HammerEvent[] = [];
  const out: HammerMotion = { speedMul: 1, jumpLocked: false, noRun: false, stopNow: false, hoverY: null };
  const viewOut: HammerView = { phase: 'idle', f: 0, diveFrom: null, last: null };
  const body: Vec3 = { x: 0, y: 0, z: 0 };

  function reset(): void {
    phase = 'idle';
    f = 0;
    diveFrom = null;
    buffered = false;
    hitSet.clear();
  }

  function standing(p: Vec3): boolean {
    const y = Math.floor(p.y - 0.01);
    for (const sx of [-FOOT_HALF, FOOT_HALF]) for (const sz of [-FOOT_HALF, FOOT_HALF]) if (d.world.isSolid(Math.floor(p.x + sx), y, Math.floor(p.z + sz))) return true;
    return false;
  }

  function slam(): void {
    if (slammed) return;
    slammed = true;
    d.sound('hammerSlam');
  }

  function startGround(ctx: HammerCtx): void {
    phase = 'swing';
    f = 1;
    yaw = ctx.yawDeg;
    curDamage = T.damage;
    curDepth = T.breakDepth;
    curH = 0;
    acted = false;
    slammed = false;
    hitSet.clear();
    buffered = false;
    d.sound('hammerSwing');
  }

  function startDive(ctx: HammerCtx): void {
    phase = 'hover';
    f = 0;
    yaw = ctx.yawDeg;
    diveFrom = ctx.position.y;
    lastY = ctx.position.y;
    acted = false;
    slammed = false;
    hitSet.clear();
    buffered = false;
    d.sound('hammerDive');
  }

  /** F43: 前の ブロックを こわす（妖怪が いなくても）。1 振りに 1 回 */
  function breakFront(p: Vec3): void {
    const dir = facingDir4OfYaw(yaw);
    const foot: Cell = { x: Math.floor(p.x), y: Math.floor(p.y + EPS), z: Math.floor(p.z) };
    const broken: Cell[] = [];
    for (const c of breakCells(foot, dir, curDepth)) {
      if (!isBreakable(d.world.getBlock(c.x, c.y, c.z))) continue;
      if (d.breakAt(c.x, c.y, c.z)) broken.push(c);
    }
    last = { h: curH, damage: curDamage, depth: curDepth as 1 | 2, broken };
    if (broken.length > 0) {
      acted = true;
      slam();
      d.wear();
    }
    events.push({ type: 'slam', position: { x: p.x, y: p.y, z: p.z }, dir, depth: curDepth, cells: broken, big: curH >= T.diveDeepFrom });
  }

  /** F43〜F51: 扇の 中の 妖怪に 1 回ずつ */
  function hitFan(p: Vec3): void {
    const yw = d.yokai();
    const fx = Math.sin(yaw * DEG);
    const fz = -Math.cos(yaw * DEG);
    body.x = p.x;
    body.y = p.y + 1.4;
    body.z = p.z;
    const sh = T.shape;
    let hits = 0;
    for (const y of yw.list() as readonly YokaiInfo[]) {
      if (y.state === 'dying' || y.state === 'leaving' || hitSet.has(y.id)) continue;
      if (!inFanColumn(p, fx, fz, sh.halfAngleDeg, sh.rMax, sh.yMin, sh.yMax, y)) continue;
      if (wallBetween(d.world as VoxelWorld, body, y.position.x, y.position.y + boxOf(y).h / 2, y.position.z)) continue;
      hitSet.add(y.id);
      yw.damage(y.id, curDamage, { x: p.x, y: p.y, z: p.z }, { dist: T.knock[0], up: T.knock[1] });
      hits++;
    }
    if (hits > 0) {
      if (!acted) d.wear();
      acted = true;
      slam();
    }
  }

  function strikeFrame(p: Vec3): void {
    if (f === T.startup + 1) breakFront(p);
    if (f > T.startup && f <= T.startup + T.active) hitFan(p);
    if (f === T.startup + T.active && !acted) {
      d.sound('hammerBonk');
      events.push({ type: 'bonk', position: { x: p.x, y: p.y, z: p.z }, dir: facingDir4OfYaw(yaw) });
    }
  }

  return {
    update(ctx: HammerCtx): void {
      if (noFallLeft > 0) noFallLeft--;
      if (!isHammerItem(ctx.item) || !ctx.active) {
        reset();
        return;
      }
      const p = ctx.position;
      if (phase === 'hover' || phase === 'dive') {
        if (ctx.inWater) {
          reset(); // 水に 入った: 当たりも こわすも なし。すぐ 動ける
          return;
        }
        if (phase === 'hover') {
          f++;
          if (f >= T.diveHover) phase = 'dive';
        } else {
          f++;
          if (standing(p) || lastY - p.y < T.diveStep - EPS) {
            // 着地した ステップ = F43
            const h = Math.max(0, (diveFrom ?? p.y) - p.y);
            curH = h;
            curDamage = diveDamage(h);
            curDepth = diveDepth(h);
            phase = 'swing';
            f = T.startup + 1;
            noFallLeft = NO_FALL_AFTER_LAND;
            strikeFrame(p);
          }
        }
        lastY = p.y;
        return;
      }
      if (phase === 'swing') {
        f++;
        if (f > TOTAL) reset();
        else {
          if (ctx.pressed && f >= TOTAL - 8) buffered = true; // さいご 8F に 先行入力
          strikeFrame(p);
        }
      }
      if (phase === 'idle') {
        const want = buffered || ctx.pressed || ctx.held;
        if (want) {
          if (!ctx.onGround && !ctx.inWater) startDive(ctx);
          else if (ctx.onGround) startGround(ctx);
        }
      }
      lastY = p.y;
    },
    motion(): HammerMotion {
      out.speedMul = 1;
      out.jumpLocked = false;
      out.noRun = false;
      out.stopNow = false;
      out.hoverY = null;
      if (phase === 'swing') {
        out.speedMul = T.moveMul;
        out.jumpLocked = true;
        out.noRun = true;
      } else if (phase === 'hover' || phase === 'dive') {
        out.speedMul = 0;
        out.jumpLocked = true;
        out.noRun = true;
        out.stopNow = true;
        out.hoverY = phase === 'hover' ? lastY : lastY - T.diveStep;
      }
      return out;
    },
    view(): HammerView {
      viewOut.phase = phase;
      viewOut.f = f;
      viewOut.diveFrom = diveFrom;
      viewOut.last = last;
      return viewOut;
    },
    noFall(): boolean {
      return phase === 'hover' || phase === 'dive' || noFallLeft > 0;
    },
    drainEvents(): HammerEvent[] {
      const e = events;
      events = spare;
      events.length = 0;
      spare = e;
      return e;
    },
  };
}
