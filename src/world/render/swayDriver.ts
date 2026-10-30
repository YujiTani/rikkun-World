import type { Group, MeshBasicMaterial } from 'three';
import type { CropStageSource } from '../../contracts';
import { cropKindOfBlock } from '../../contracts';
import { BLOCK_TYPES, isCrossIndex, isWildIndex } from '../blocks/blockTypes';
import { CropSwayMesh, SWAY_POOL_MAX, type SwayItem } from './cropSway';
import { crossTileName, RIPE_FLAG } from './meshChunk';

const LIGHT_MAX_N = 15;

/** なでた ゆれが 世界から 読む・頼むもの（ArrayVoxelWorld の一部） */
interface SwayWorld {
  getIndex(x: number, y: number, z: number): number;
  touch(x: number, y: number, z: number): void;
}

/** なでた ゆれが 読む光（WorldLight の一部） */
interface SwayLight {
  skyAt(x: number, y: number, z: number): number;
  blockAt(x: number, y: number, z: number): number;
}

/**
 * なでた ゆれ（M7-2）: ゆれ中の 作物 を 専用メッシュ で 描き、セクション側 の 板 は 隠す（WorldRenderer から分けた。4-7）。
 */
export class SwayDriver {
  private source: ((cb: (x: number, y: number, z: number, deg: number) => void) => void) | undefined;
  private mesh: CropSwayMesh | null = null;
  /** セクション側で 板を隠している マス（SectionMesher の hide が読む） */
  readonly hidden = new Set<number>();
  private readonly next = new Set<number>();
  private readonly cells: Array<{ x: number; y: number; z: number; deg: number }> = [];
  private readonly items: SwayItem[] = [];
  /** SectionMesher に渡す hide（毎回 作らず 1 つだけ） */
  readonly hideFn = (x: number, y: number, z: number): boolean => this.hidden.has(this.keyOf(x, y, z));

  constructor(
    private readonly world: SwayWorld,
    private readonly light: SwayLight,
    private readonly group: Group,
    private readonly material: MeshBasicMaterial,
  ) {}

  /** ゆれている 作物 の 一覧 を 教える 先（`FarmSparkle.forEachSway` が 合う）。 */
  setSource(src: ((cb: (x: number, y: number, z: number, deg: number) => void) => void) | undefined): void {
    this.source = src;
  }

  /** いま 専用メッシュ で ゆらしている 本数（テスト・計測用） */
  count(): number {
    return this.mesh?.count ?? 0;
  }

  private keyOf(x: number, y: number, z: number): number {
    return (x * 4096 + z) * 512 + y;
  }

  /** ゆれ 中 の マス の 集まり が 変わったら、そのセクション だけ 作り直しに 出す（板 を 隠す／出す） */
  sync(): void {
    this.cells.length = 0;
    this.next.clear();
    if (this.source) {
      this.source((x, y, z, deg) => {
        if (this.cells.length >= SWAY_POOL_MAX) return;
        const b = this.world.getIndex(x, y, z);
        if (b < 0 || !isCrossIndex(b)) return;
        this.cells.push({ x, y, z, deg });
        this.next.add(this.keyOf(x, y, z));
      });
    }
    if (this.hidden.size === 0 && this.next.size === 0) return;
    let changed = false;
    for (const c of this.cells) {
      if (!this.hidden.has(this.keyOf(c.x, c.y, c.z))) {
        this.world.touch(c.x, c.y, c.z);
        changed = true;
      }
    }
    if (this.hidden.size > 0) {
      for (const k of this.hidden) {
        if (this.next.has(k)) continue;
        const y = k % 512;
        const r = (k - y) / 512;
        const z = r % 4096;
        const x = (r - z) / 4096;
        this.world.touch(x, y, z);
        changed = true;
      }
    }
    if (changed) {
      this.hidden.clear();
      for (const k of this.next) this.hidden.add(k);
    }
  }

  draw(crops: CropStageSource | undefined): void {
    if (this.cells.length === 0 && !this.mesh?.mesh.visible) return;
    if (!this.mesh) {
      this.mesh = new CropSwayMesh(this.material);
      this.group.add(this.mesh.mesh);
    }
    this.items.length = 0;
    for (const c of this.cells) {
      // 板 を 隠せている（作り直し 済み）ものだけ 描く
      if (!this.hidden.has(this.keyOf(c.x, c.y, c.z))) continue;
      const b = this.world.getIndex(c.x, c.y, c.z);
      const stage = crops?.stageAt(c.x, c.y, c.z) ?? 3;
      const ripe = isWildIndex(b) || (cropKindOfBlock(BLOCK_TYPES[b].id) !== null && stage === 3);
      this.items.push({
        x: c.x, y: c.y, z: c.z, deg: c.deg,
        tile: crossTileName(b, stage),
        sky: this.light.skyAt(c.x, c.y, c.z) / LIGHT_MAX_N,
        blk: this.light.blockAt(c.x, c.y, c.z) / LIGHT_MAX_N + (ripe ? RIPE_FLAG : 0),
      });
    }
    this.mesh.set(this.items);
  }

  dispose(): void {
    this.mesh?.dispose();
  }
}
