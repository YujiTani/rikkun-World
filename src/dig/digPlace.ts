import type { BlockId, TargetInfo } from '../contracts';
import { itemType } from '../inventory/items';
import { FUTON_HEAD, futonDirFromYaw, futonPartner } from '../world/blocks/futon';
import { KOTATSU_CELLS } from '../world/blocks/kotatsu';
import { K_TANSU, doorId, doorInfo, furnInfo, furnPlaceCells, houseDropOf, isFurnKind } from '../world/blocks/houseBlocks';
import { applyFlatten, planFlatten, type FlattenPlan } from '../world/flatten';
import { HANGING_SUPPORT, isReplaceable, overlapsBody, type DigCore } from './digCore';
import { isWater } from '../world/blocks/water';
import { ROPE, planRope } from '../world/blocks/rope';

/** 置く場所とブロック（置けないなら null）。tryPlace とヒントが同じ判定を使う */
export interface PlaceSpot {
  x: number;
  y: number;
  z: number;
  block: BlockId;
  /** ふとん・こたつ・家具・戸の ぜんぶの マス。y を 書かない マスは 置く 高さ y */
  cells?: ReadonlyArray<{ x: number; y?: number; z: number; block: BlockId }>;
  plan?: FlattenPlan;
  /** ROPE-1: つかう ロープの 本数（ふつうは 1 こ） */
  use?: number;
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
    // FLORA-75: くさ を ねらって 置くと、くさ の マスに 置ける（くさ は 消える）。MINE-1B: チョークの しるしも 同じ
    const { x, y, z } = isReplaceable(t.id) ? t.block : t.place;
    if (this.lockedCell(x, y, z)) return null; // HOUSE-1C PR-2: 建築中の 場所には 置けない
    const cur = c.world.getBlock(x, y, z);
    if (cur !== 'air' && !isWater(cur) && !(isReplaceable(cur) && cur === t.id)) return null; // 世界の外・ほかのブロック
    if (block === ROPE) return this.ropeSpot(t.face.y, x, y, z, held.count);
    if (block === 'nukunuku') {
      const k = this.kotatsuSpot(x, y, z);
      return k ? { x: k.x, y, z: k.z, block, cells: k.cells, plan: k.plan } : null;
    }
    // HOUSE-1C: 向きの ある 家具（プレイヤーの ほうを 向く）・戸（2 マス。いつも 南向き）
    if (furnInfo(block)) return this.furnSpot(block, x, y, z);
    if (doorInfo(block)) return this.doorSpot(x, y, z);
    if (block === 'nobana') {
      // のばな は くさ・つち の上だけ
      const under = c.world.getBlock(x, y - 1, z);
      if (under !== 'grass' && under !== 'dirt') return null;
    }
    if (block === FUTON_HEAD[0]) {
      // ふとん: 2 マス。向いている 方向（頭 → 足）。足の マスも あいていて、体に 重ならない ところだけ
      const dir = futonDirFromYaw(c.player().yawDeg);
      const head = FUTON_HEAD[dir]!;
      const foot = futonPartner(head, x, z)!;
      const fcur = c.world.getBlock(foot.x, y, foot.z);
      if (fcur !== 'air' && !isWater(fcur)) return null;
      if (this.overlapsBody(x, y, z) || this.overlapsBody(foot.x, y, foot.z)) return null;
      if (c.gate?.placeBlocked(x, y, z) || c.gate?.placeBlocked(foot.x, y, foot.z) || this.lockedCell(foot.x, y, foot.z)) return null;
      return { x, y, z, block: head, cells: [{ x, z, block: head }, { x: foot.x, z: foot.z, block: foot.id }] };
    }
    // たいまつ・ちょうちん: 固くない（体と重なっても置ける）。支えが要る（たいまつ = 下か横、ちょうちん = 下・横・上）
    const support = HANGING_SUPPORT[block];
    if (support) {
      if (!support(c.world, x, y, z)) return null;
    } else if (this.overlapsBody(x, y, z)) return null;
    if (c.gate?.placeBlocked(x, y, z)) return null; // 妖怪の箱の所には置けない
    return { x, y, z, block };
  }

  /** 向きの ある 家具を 置く 場所。ぜんぶの マスが あいて いて、体に 重ならない ところ だけ（ねらった マスが 見た目の 左はし〔長さ 2〕か まん中〔長さ 3〕） */
  private furnSpot(block: BlockId, x: number, y: number, z: number): PlaceSpot | null {
    const c = this.c;
    const kind = furnInfo(block)!.kind;
    const { cells } = furnPlaceCells(kind, c.player().yawDeg, x, z);
    for (const k of cells) {
      // ねらった マスは spot() が しらべ済み〔あき・水・くさ・チョークの しるし〕。ほかの マスも くさ・しるしの 上には 置ける
      if (k.x !== x || k.z !== z) {
        const cur = c.world.getBlock(k.x, y, k.z);
        if (cur !== 'air' && !isWater(cur) && !isReplaceable(cur)) return null;
      }
      if (this.overlapsBody(k.x, y, k.z) || c.gate?.placeBlocked(k.x, y, k.z) || this.lockedCell(k.x, y, k.z)) return null;
    }
    const aimed = cells.find((k) => k.x === x && k.z === z)!;
    return cells.length === 1 ? { x, y, z, block: aimed.id } : { x, y, z, block: aimed.id, cells: cells.map((k) => ({ x: k.x, z: k.z, block: k.id })) };
  }

  /** ROPE-1: ブロックの よこ・下の 面から 下へ たらす（上の 面には 使えない）。くわしくは world/blocks/rope.ts */
  private ropeSpot(faceY: number, x: number, y: number, z: number, have: number): PlaceSpot | null {
    if (faceY > 0) return null;
    const c = this.c;
    const open = (yy: number): boolean => {
      const cur = c.world.getBlock(x, yy, z);
      return (cur === 'air' || isWater(cur)) && !c.gate?.placeBlocked(x, yy, z) && !this.lockedCell(x, yy, z);
    };
    const plan = planRope(open, y, have);
    if (!plan) return null;
    return { x, y, z, block: ROPE, cells: plan.cells.map((k) => ({ x, y: k.y, z, block: k.block })), use: plan.used };
  }

  /** 戸 2 マス（下〔ねらった マス〕と その 上）を 置く 場所。2 マスとも あいて いて、体に 重ならない ところ だけ */
  private doorSpot(x: number, y: number, z: number): PlaceSpot | null {
    const c = this.c;
    const upper = c.world.getBlock(x, y + 1, z);
    if (upper !== 'air' && !isWater(upper)) return null;
    for (const yy of [y, y + 1]) if (this.overlapsBody(x, yy, z) || c.gate?.placeBlocked(x, yy, z) || this.lockedCell(x, yy, z)) return null;
    const lo = doorId(false, false);
    return { x, y, z, block: lo, cells: [{ x, z, block: lo }, { x, y: y + 1, z, block: doorId(true, false) }] };
  }

  /** HOUSE-1C PR-2: 建築中の 場所の マスか */
  private lockedCell(x: number, y: number, z: number): boolean {
    return this.c.m4.build?.locked(x, y, z) ?? false;
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
    const { x, y, z } = isReplaceable(t.id) ? t.block : t.place;
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

  /** 家の 戸を あける・しめる（上下 どちらを ねらっても 2 マスとも。あいて いたら しめる）。戸でなければ 何も しない */
  toggleDoor(t: TargetInfo): void {
    const w = this.c.world;
    const d = doorInfo(t.id);
    if (!d) return;
    const { x, y, z } = t.block;
    const loY = d.top ? y - 1 : y;
    const open = !d.open;
    if (doorInfo(w.getBlock(x, loY, z))?.top === false) w.setBlock(x, loY, z, doorId(false, open));
    if (doorInfo(w.getBlock(x, loY + 1, z))?.top === true) w.setBlock(x, loY + 1, z, doorId(true, open));
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
      for (const k of spot.cells) c.world.setBlock(k.x, k.y ?? y, k.z, k.block);
    } else if (c.bodyTgt()) {
      if (!c.m4.bodyBlocks?.place({ x, y, z }, block)) return;
    } else if (!c.world.setBlock(x, y, z, block)) return;
    for (let i = 0; i < (spot.use ?? 1); i++) c.inventory.consumeHeld();
    if (isFurnKind(block, K_TANSU)) c.m4.storage?.placed(x, y, z, c.player().yawDeg);
    c.m4.tools?.pushSwing('place');
    c.emit({ type: 'place', tick: c.tick(), block: { x, y, z }, id: houseDropOf(block) ?? block }); // 家の もの〔向き・マス ちがい〕は もとの id
  }
}

/** `spot()` の 答え が こたつ の とき の 計画 */
function kotatsuPlan(spot: { x: number; y: number; z: number; plan?: FlattenPlan } | null): { x: number; y: number; z: number; plan: FlattenPlan } | null {
  return spot?.plan ? { x: spot.x, y: spot.y, z: spot.z, plan: spot.plan } : null;
}

