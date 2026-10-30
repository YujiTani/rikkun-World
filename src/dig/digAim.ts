import type { BlockId, Inventory, PlayerState, TargetInfo, Vec3, VoxelWorld } from '../contracts';
import { itemType } from '../inventory/items';
import { isBladeItem } from '../tools/blade/BladeSystem';
import { cellInWall } from '../world/wall';
import type { DigConfig } from './config';
import type { DigM4Deps } from './digPorts';
import { lookDirection, raycastBlocks } from './raycast';

type OriginFn = (player: PlayerState, out: Vec3) => Vec3;

/** ねらう係が DigSystemImpl から受け取る物 */
export interface DigAimDeps {
  readonly world: VoxelWorld;
  readonly config: DigConfig;
  readonly inventory: Pick<Inventory, 'held'>;
  readonly m4: DigM4Deps;
  eyeHeight(): number;
  /** ねらいの線の出どころ（CHAR-1 §4.5）。なければ 今の 目 */
  aimOrigin(): OriginFn | undefined;
  /** 届く距離のはかり始め（CHAR-1 第 5.2 版 §4.5）。なければ 出どころと同じ */
  reachOrigin(): OriginFn | undefined;
}

/** ステップごとに ねらいを 決め直す係（ブロック・体の上のマス・にわとり）。ねらいの結果を 持つ */
export class DigAim {
  tgt: TargetInfo | null = null;
  /** いまの ねらいが ワールドの ブロックではなく 体の 上の マス（#293）。置いた ブロックを ねらう か、置く ブロックを 持って 体を ねらって いる とき */
  bodyTgt = false;
  /** 体の マスを ねらって いるとき: 置いた ブロック（本体の 固い マスなら null） */
  bodyPlaced: BlockId | null = null;
  /** 体の マスが ガラスの 雲（ほると 割れる。アイテムは 出ない） */
  bodyGlass = false;
  /** LIVE-1: ブロック より 手前 の ねらう 箱 に 当たった にわとり（毎ステップ 決め直す） */
  animalHit: { id: number; distance: number } | null = null;
  /** HOUSE-1A: ブロック・にわとり より 手前 の ねらう 箱 に 当たった 建築士さん（毎ステップ 決め直す） */
  architectHit: { id: string; distance: number } | null = null;
  readonly dir = { x: 0, y: 0, z: 0 };
  readonly originScratch = { x: 0, y: 0, z: 0 };
  private readonly reachScratch = { x: 0, y: 0, z: 0 };

  constructor(private readonly d: DigAimDeps) {}

  /** ねらい（ステップごとに決め直す）。向きは `dir`、出どころは `originScratch` に入る */
  update(p: PlayerState, enabled: boolean): void {
    const d = lookDirection(p.yawDeg, p.pitchDeg, this.dir);
    const o = this.origin(p, this.originScratch);
    this.tgt = this.aimBlock(p, o, d);
    this.aimBody(enabled, o, d);
    this.animalHit = this.aimAnimal(o, d);
    this.architectHit = this.aimArchitect(o, d);
    // 建築士さんと にわとりが 同じ 線に 重なる ときは 近い 方だけ
    if (this.animalHit && this.architectHit) {
      if (this.architectHit.distance <= this.animalHit.distance) this.animalHit = null;
      else this.architectHit = null;
    }
  }

  origin(p: PlayerState, out: Vec3): Vec3 {
    const f = this.d.aimOrigin();
    if (f) return f(p, out);
    out.x = p.position.x;
    out.y = p.position.y + this.d.eyeHeight();
    out.z = p.position.z;
    return out;
  }

  /** 出どころ o から d の向きの線で ねらうブロック（reachOrigin があれば その点から reach 以内のものだけ）。distance は o から */
  aimBlock(p: PlayerState, o: Vec3, d: Vec3): TargetInfo | null {
    const t = this.aimBlockRaw(p, o, d);
    // 見えない壁の外のマスは ほれない（VOX-D W4）。ブロックも おく所も 壁の中だけ
    return t && cellInWall(t.block.x, t.block.z) && cellInWall(t.place.x, t.place.z) ? t : null;
  }

  private aimBlockRaw(p: PlayerState, o: Vec3, d: Vec3): TargetInfo | null {
    const reach = this.d.config.reach;
    const reachOrigin = this.d.reachOrigin();
    if (!reachOrigin) return raycastBlocks(this.d.world, o.x, o.y, o.z, d.x, d.y, d.z, reach);
    const r = reachOrigin(p, this.reachScratch);
    const span = Math.hypot(o.x - r.x, o.y - r.y, o.z - r.z);
    const t = raycastBlocks(this.d.world, o.x, o.y, o.z, d.x, d.y, d.z, reach + span);
    if (!t) return null;
    const hx = o.x + d.x * t.distance - r.x;
    const hy = o.y + d.y * t.distance - r.y;
    const hz = o.z + d.z * t.distance - r.z;
    return Math.hypot(hx, hy, hz) <= reach ? t : null;
  }

  /**
   * #293: 体（がしゃどくろ）の 固い マスを ワールドの ブロックと くらべて、近い 方を ねらいに する。
   * 体の マスを ねらうのは「置いた ブロック」か「置ける ブロックを 持って いる とき」だけ（刀・パンチは いつもどおり）。
   */
  private aimBody(enabled: boolean, o: Vec3, d: Vec3): void {
    this.bodyTgt = false;
    this.bodyPlaced = null;
    this.bodyGlass = false;
    const bb = this.d.m4.bodyBlocks;
    if (!bb || !enabled) return;
    const held = this.d.inventory.held();
    if (held && isBladeItem(held.item)) return; // 刀は いつもどおり ふる（ガラスの 雲は 刀の ふりで 割れる）
    const a = bb.aim(o, d, this.d.config.reach);
    if (!a || (this.tgt && a.distance >= this.tgt.distance)) return;
    const hb = held ? itemType(held.item)?.placeBlock : undefined;
    if (a.placed === null && !(hb && bb.accepts(hb))) return;
    this.tgt = { block: a.cell, id: a.placed ?? 'bedrock', face: a.face, place: a.place, distance: a.distance };
    this.bodyTgt = true;
    this.bodyPlaced = a.placed;
    this.bodyGlass = a.glass === true;
  }

  /** HOUSE-1A: 目 から の 線 が ブロック に 当たる より 手前 で 建築士さん の 箱 に 当たるか（とどく 距離 は ブロックを 置く 距離 と 同じ） */
  private aimArchitect(o: Vec3, d: Vec3): { id: string; distance: number } | null {
    const a = this.d.m4.architects;
    if (!a) return null;
    const h = a.rayHit(o, d, this.d.config.reach);
    if (!h || (this.tgt && h.distance >= this.tgt.distance)) return null;
    return h;
  }

  /** LIVE-1 §2.4: 目 から の 線 が ブロック に 当たる より 手前 で ねらう 箱 に 当たるか */
  private aimAnimal(o: Vec3, d: Vec3): { id: number; distance: number } | null {
    const a = this.d.m4.animals;
    if (!a) return null;
    const h = a.rayHit(o, d, this.d.config.reach);
    if (!h || (this.tgt && h.distance >= this.tgt.distance)) return null;
    return h;
  }
}
