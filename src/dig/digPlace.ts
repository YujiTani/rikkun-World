import type { BlockId } from '../contracts';
import { itemType } from '../inventory/items';
import { KOTATSU_CELLS } from '../world/blocks/kotatsu';
import { applyFlatten, planFlatten, type FlattenPlan } from '../world/flatten';
import { HANGING_SUPPORT, overlapsBody, type DigCore } from './digCore';

/** 置く場所とブロック（置けないなら null）。tryPlace とヒントが同じ判定を使う */
export interface PlaceSpot {
  x: number;
  y: number;
  z: number;
  block: BlockId;
  cells?: ReadonlyArray<{ x: number; z: number; block: BlockId }>;
  plan?: FlattenPlan;
}

/** ブロックを 置く（右クリック）。置ける場所の判定・こたつ 2×2・たいらに する・置く の実行までを 受け持つ */
export class BlockPlacer {
  /** LIVE-2.1: 直前 の 置く で たいら に した 列（`takeFlattenDust` で 取る） */
  private flatDust: Array<{ x: number; y: number; z: number }> = [];

  constructor(private readonly c: DigCore) {}

  /** 置く場所とブロック（置けないなら null） */
  spot(): PlaceSpot | null {
    const c = this.c;
    const t = c.tgt();
    const held = c.inventory.held();
    if (!t || !held) return null;
    const block = itemType(held.item)?.placeBlock;
    if (!block) return null;
    if (c.bodyTgt()) {
      // #293: 体の 上。ねらった マスの となり（置く マス）が あいて いて、プレイヤーの 体と 重ならない
      const bb = c.m4.bodyBlocks;
      const { x, y, z } = t.place;
      if (!bb || !bb.accepts(block) || c.world.getBlock(x, y, z) !== 'air' || this.overlapsBody(x, y, z) || !bb.canPlace(t.place, block)) return null;
      return { x, y, z, block };
    }
    // FLORA-75: くさ を ねらって 置くと、くさ の マスに 置ける（くさ は 消える）
    const { x, y, z } = t.id === 'kusa' ? t.block : t.place;
    const cur = c.world.getBlock(x, y, z);
    if (cur !== 'air' && cur !== 'water' && !(cur === 'kusa' && t.id === 'kusa')) return null; // 世界の外・ほかのブロック
    if (block === 'nukunuku') {
      const k = this.kotatsuSpot(x, y, z);
      return k ? { x: k.x, y, z: k.z, block, cells: k.cells, plan: k.plan } : null;
    }
    if (block === 'nobana') {
      // のばな は くさ・つち の上だけ
      const under = c.world.getBlock(x, y - 1, z);
      if (under !== 'grass' && under !== 'dirt') return null;
    }
    // たいまつ・ちょうちん: 固くない（体と重なっても置ける）。支えが要る（たいまつ = 下か横、ちょうちん = 下・横・上）
    const support = HANGING_SUPPORT[block];
    if (support) {
      if (!support(c.world, x, y, z)) return null;
    } else if (this.overlapsBody(x, y, z)) return null;
    if (c.gate?.placeBlocked(x, y, z)) return null; // 妖怪の箱の所には置けない
    return { x, y, z, block };
  }

  private overlapsBody(x: number, y: number, z: number): boolean {
    return overlapsBody(this.c.player().position, x, y, z);
  }

  /**
   * こたつ 2×2 を 置く 場所。ねらった マス (x, y, z) を かど に して、プレイヤー から 見て おく がわ（むこう）に 2×2。
   * ふさがって いたら ほか の 3 つ の むき も ためす。LIVE-2.1: 足もと は たいら に する（`planFlatten`、H = 1）。
   * 消える ブロック は 消し、くぼみ は うめる。体 や 妖怪 の 箱 に 重なる なら だめ。本体 は 北西 の マス。見つからなければ null
   */
  private kotatsuSpot(x: number, y: number, z: number): { x: number; z: number; cells: Array<{ x: number; z: number; block: BlockId }>; plan: FlattenPlan } | null {
    const c = this.c;
    const p = c.player().position;
    const ex = x + 0.5 >= p.x ? 1 : -1;
    const ez = z + 0.5 >= p.z ? 1 : -1;
    for (const [sx, sz] of [[ex, ez], [-ex, ez], [ex, -ez], [-ex, -ez]] as const) {
      const ax = sx > 0 ? x : x - 1;
      const az = sz > 0 ? z : z - 1;
      const plan = planFlatten(c.world, { x0: ax, z0: az, w: 2, d: 2, y, h: 1, stepMax: c.m4.live?.().placeStepMax });
      if (!plan) continue;
      let ok = true;
      for (const k of KOTATSU_CELLS) {
        if (this.overlapsBody(ax + k.dx, y, az + k.dz) || c.gate?.placeBlocked(ax + k.dx, y, az + k.dz)) ok = false;
      }
      // うめる・消す マス にも 体 が 重ならない・妖怪 の 箱 に かからない
      for (const e of plan.edits) if ((e.block !== 'air' && this.overlapsBody(e.x, e.y, e.z)) || c.gate?.placeBlocked(e.x, e.y, e.z)) ok = false;
      if (ok) return { x: ax, z: az, cells: KOTATSU_CELLS.map((k) => ({ x: ax + k.dx, z: az + k.dz, block: k.block })), plan };
    }
    return null;
  }

  /** 置く 前 の すけた こたつ（`nukunuku` を 持って ブロック を ねらって いる とき だけ。置けない 所 は ok=false で 赤）。毎フレーム 描く 側 が 読む。`flat` = たいら に なる 足もと の 板（置ける とき だけ） */
  kotatsuGhost(): { x: number; y: number; z: number; ok: boolean; flat?: FlattenPlan['plate'] } | null {
    const t = this.c.tgt();
    if (!t || this.c.inventory.held()?.item !== 'nukunuku') return null;
    const { x, y, z } = t.id === 'kusa' ? t.block : t.place;
    const k = kotatsuPlan(this.spot());
    if (k) return { x: k.x, y: k.y, z: k.z, ok: true, flat: k.plan.plate };
    return { x, y, z, ok: false };
  }

  /** 置いた とき に たいら に した 列（土けむり を 出す 用）。取ったら 空に なる。つなぎ込み が `AnimalFx.flattenDust()` に わたす */
  takeFlattenDust(): Array<{ x: number; y: number; z: number }> {
    const d = this.flatDust;
    this.flatDust = [];
    return d;
  }

  tryPlace(): void {
    const c = this.c;
    const spot = this.spot();
    if (!spot) return;
    const { x, y, z, block } = spot;
    if (spot.cells) {
      if (spot.plan) {
        applyFlatten(spot.plan, (fx, fy, fz, b) => c.world.setBlock(fx, fy, fz, b));
        this.flatDust = spot.plan.dust;
      }
      for (const k of spot.cells) c.world.setBlock(k.x, y, k.z, k.block);
    } else if (c.bodyTgt()) {
      if (!c.m4.bodyBlocks?.place({ x, y, z }, block)) return;
    } else if (!c.world.setBlock(x, y, z, block)) return;
    c.inventory.consumeHeld();
    if (block === 'tansu') c.m4.storage?.placed(x, y, z, c.player().yawDeg);
    c.m4.tools?.pushSwing('place');
    c.emit({ type: 'place', tick: c.tick(), block: { x, y, z }, id: block });
  }
}

/** `spot()` の 答え が こたつ の とき の 計画 */
function kotatsuPlan(spot: { x: number; y: number; z: number; plan?: FlattenPlan } | null): { x: number; y: number; z: number; plan: FlattenPlan } | null {
  return spot?.plan ? { x: spot.x, y: spot.y, z: spot.z, plan: spot.plan } : null;
}

