import { LEGEND4_ID } from '../../content/items/ids';
import { LEGEND4_TUNING } from '../../content/items/legend4Tuning';
import type { ItemId, Vec3, VoxelWorld, YokaiInfo, YokaiWorld } from '../../contracts';
import { boxOf, centerOfYokai, inFanColumn, wallBetween } from '../../combat/attackFacing';
import { diveCells, diveDamage, facingDir4OfYaw, faceCells, isBreakable, type Cell } from './hammerModel';

/**
 * 大地のハンマー（LEGEND-4 §8）の しくみ。1 ステップ 1 回 `update` を 呼ぶ（人ごとに 1 つ。1P も 2P も 同じ 部品）。
 * 地面: 押した ステップ = F1。F43 に ねらった ブロックの 面に 沿った 3 × 3 を こわし（ねらいが ブロックでなければ こわさない）、
 *   F43〜F51 の 妖怪に 1 回ずつ（前方の 扇 ＋ 当たった 点の まわり 半径）。F159 で おわり、押しつづけで 次の F1。
 * 空中: 押した ステップで その 高さ y0 を おぼえ、diveHover ステップ 止まり、そのあと 1 ステップ 0.5 ずつ 真下へ。
 *   着地した ステップ = F43: 足の 下の 3 × 3 ＋ 同じ 段の まわり 8 を こわし、まわりの 半径の 妖怪 ぜんぶに 当てる。
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
  /** position = 絵の 地面の 点（こわした 面の まん中の 下）。scale = 絵の 大きさの 倍（LEGEND4_TUNING.daichi.fxScale） */
  | { type: 'slam'; position: Vec3; dir: { dx: number; dz: number }; cells: Cell[]; scale: number }
  | { type: 'bonk'; position: Vec3; dir: { dx: number; dz: number } };

/** ねらって いる ブロック（ふつうに ほる ときの ねらいと 同じ。`dig.target()`） */
export interface HammerFocus {
  block: Vec3;
  /** 面の 外向き（各成分 −1・0・1） */
  face: Vec3;
}

/** がしゃどくろへの 当たりの 球（世界の 座標・ダメージ） */
export interface BigHit {
  center: Vec3;
  radius: number;
  damage: number;
}

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
  /** いま ねらって いる ブロック（空・妖怪・とどかない ときは null。F43 に 1 回 読む） */
  focus: () => HammerFocus | null;
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
  /** がしゃどくろに 当てる 球（F43 に 1 回だけ 1 つ。読んだら 空。`gashaBigHit` の HitSources.hammer） */
  bigHits(): readonly BigHit[];
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
  let curDive = false;
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
  const pt: Vec3 = { x: 0, y: 0, z: 0 }; // 当たった 点（使い回し）
  const cen: Vec3 = { x: 0, y: 0, z: 0 }; // 妖怪の 中心（使い回し）
  // がしゃどくろへの 球（使い回し。1 振りに 1 回だけ 返す）
  const bigHit = { center: { x: 0, y: 0, z: 0 }, radius: 0, damage: 0 };
  const bigList = [bigHit];
  const bigNone: readonly BigHit[] = [];
  let bigPending = false;
  let focusNow: HammerFocus | null = null; // この 振りの F43 で 読んだ ねらい

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
    curDive = false;
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

  /** 絵の 地面の 点を 作る（ねらった 面の まん中の 下。ねらいが 無ければ 足の 前 1 マス） */
  function anchorInto(out: Vec3, p: Vec3, dir: { dx: number; dz: number }, fo: HammerFocus | null): Vec3 {
    if (fo) {
      out.x = fo.block.x + 0.5 + fo.face.x * 0.5;
      out.y = fo.block.y + (fo.face.y > 0 ? 1 : 0);
      out.z = fo.block.z + 0.5 + fo.face.z * 0.5;
    } else {
      out.x = Math.floor(p.x) + 0.5 + dir.dx;
      out.y = Math.floor(p.y + EPS);
      out.z = Math.floor(p.z) + 0.5 + dir.dz;
    }
    return out;
  }

  /** F43: こわす（地面の 振り: ねらった 面の 3 × 3。急降下: 足の 下の 3 × 3 ＋ 同じ 段の まわり 8）。妖怪が いなくても こわす。1 振りに 1 回 */
  function breakCellsNow(p: Vec3): void {
    const dir = facingDir4OfYaw(yaw);
    const fo = curDive ? null : d.focus();
    focusNow = fo;
    const foot: Cell = { x: Math.floor(p.x), y: Math.floor(p.y + EPS), z: Math.floor(p.z) };
    const cells = curDive ? diveCells(foot) : fo ? faceCells({ x: fo.block.x, y: fo.block.y, z: fo.block.z }, fo.face) : [];
    const broken: Cell[] = [];
    for (const c of cells) {
      if (!isBreakable(d.world.getBlock(c.x, c.y, c.z))) continue;
      if (d.breakAt(c.x, c.y, c.z)) broken.push(c);
    }
    readyBigHit(p);
    last = { h: curH, damage: curDamage, broken };
    if (broken.length > 0) {
      acted = true;
      slam();
      d.wear();
    }
    const origin = curDive ? { x: foot.x + 0.5, y: foot.y, z: foot.z + 0.5 } : anchorInto({ x: 0, y: 0, z: 0 }, p, dir, fo);
    events.push({ type: 'slam', position: origin, dir, cells: broken, scale: curDive ? T.fxScale.dive : T.fxScale.ground });
  }

  /** 当たった 点（ねらいの 面の まん中。無ければ 前方 reach マス） */
  function hitPointInto(out: Vec3, p: Vec3, fx: number, fz: number): void {
    if (focusNow) {
      out.x = focusNow.block.x + 0.5 + focusNow.face.x * 0.5;
      out.y = focusNow.block.y + 0.5 + focusNow.face.y * 0.5;
      out.z = focusNow.block.z + 0.5 + focusNow.face.z * 0.5;
    } else {
      out.x = p.x + fx * T.reach;
      out.y = p.y + 1;
      out.z = p.z + fz * T.reach;
    }
  }

  /** がしゃどくろ（箱の 当たり）へ わたす 球を 1 つ 用意する（F43 に 1 回。HitSources.hammer が 1 回だけ 読む） */
  function readyBigHit(p: Vec3): void {
    if (curDive) {
      bigHit.center.x = p.x;
      bigHit.center.y = p.y + 1;
      bigHit.center.z = p.z;
      bigHit.radius = T.diveRadius;
    } else {
      hitPointInto(bigHit.center, p, Math.sin(yaw * DEG), -Math.cos(yaw * DEG));
      bigHit.radius = T.hitRadius;
    }
    bigHit.damage = curDamage;
    bigPending = true;
  }

  /** F43〜F51: 当たる 妖怪に 1 回ずつ。地面: 前方の 扇 ＋ 当たった 点の まわり 半径。急降下: プレイヤーの まわり 半径 ぜんぶ */
  function hitNow(p: Vec3): void {
    const yw = d.yokai();
    const fx = Math.sin(yaw * DEG);
    const fz = -Math.cos(yaw * DEG);
    body.x = p.x;
    body.y = p.y + 1.4;
    body.z = p.z;
    hitPointInto(pt, p, fx, fz);
    const sh = T.shape;
    let hits = 0;
    for (const y of yw.list() as readonly YokaiInfo[]) {
      if (y.state === 'dying' || y.state === 'leaving' || hitSet.has(y.id)) continue;
      if (curDive) {
        const r = boxOf(y).r;
        if (Math.hypot(y.position.x - p.x, y.position.z - p.z) > T.diveRadius + r) continue;
        if (y.position.y < p.y + sh.yMin || y.position.y > p.y + sh.yMax) continue;
      } else {
        const r = boxOf(y).r;
        const c = centerOfYokai(y, cen);
        const near = Math.hypot(c.x - pt.x, c.y - pt.y, c.z - pt.z) <= T.hitRadius + r;
        if (!near) {
          if (!inFanColumn(p, fx, fz, sh.halfAngleDeg, sh.rMax, sh.yMin, sh.yMax, y)) continue;
          if (wallBetween(d.world as VoxelWorld, body, y.position.x, y.position.y + boxOf(y).h / 2, y.position.z)) continue;
        }
      }
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
    if (f === T.startup + 1) breakCellsNow(p);
    if (f > T.startup && f <= T.startup + T.active) hitNow(p);
    if (f === T.startup + T.active && !acted) {
      d.sound('hammerBonk');
      const dir = facingDir4OfYaw(yaw);
      events.push({ type: 'bonk', position: anchorInto({ x: 0, y: 0, z: 0 }, p, dir, focusNow), dir });
    }
  }

  return {
    update(ctx: HammerCtx): void {
      if (noFallLeft > 0) noFallLeft--;
      bigPending = false; // 読まれなかった 球は すてる
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
            curDive = true;
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
    bigHits(): readonly BigHit[] {
      if (!bigPending) return bigNone;
      bigPending = false;
      return bigList;
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
