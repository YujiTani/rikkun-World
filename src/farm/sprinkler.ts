import type { BlockId, SprinklerPort, Vec3, VoxelWorld } from '../contracts';
import { blockIndexOf } from '../world/blocks/blockTypes';

/**
 * スプリンクラー の はんい（M7-2 §2.2・§4.3 ③）。
 * - 横 |x−sx| ≤ r・|z−sz| ≤ r（r = `farmSprinklerRadius`、5×5）、高さ sy−2 ≤ y ≤ sy の はたけ を しめらせる。
 * - 置く・こわす は `onBlockChanged` で 追いかける。読みこみ の あとは `rescan(world)`。
 * - みず・明るさ・時刻 は 関係 ない。`FarmSystem` を import しない（A は この口 だけ で 聞く）。
 */
export interface SprinklerDeps {
  /** `farmSprinklerRadius`（なければ 2）。設定を 変えたら すぐ 効く ように 毎回 読む */
  radius?: () => number;
}

const OFF = 512;
const key = (x: number, y: number, z: number): number => ((x + OFF) * 1024 + (z + OFF)) * 1024 + (y + OFF);

/** 高さの はば（スプリンクラー と 同じ 〜 2 下） */
export const SPRINKLER_DEPTH = 2;

export class Sprinklers implements SprinklerPort {
  private readonly set = new Set<number>();
  private items: Vec3[] = [];

  constructor(private readonly d: SprinklerDeps = {}) {}

  private r(): number {
    return Math.max(0, Math.floor(this.d.radius?.() ?? 2));
  }

  covers(x: number, y: number, z: number): boolean {
    if (this.set.size === 0) return false;
    const r = this.r();
    for (let dy = 0; dy <= SPRINKLER_DEPTH; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (this.set.has(key(x + dx, y + dy, z + dz))) return true;
        }
      }
    }
    return false;
  }

  list(): Vec3[] {
    return this.items.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  }

  /** 数（毎フレーム 呼んでも 安い） */
  get count(): number {
    return this.items.length;
  }

  /** 中の 配列 を そのまま 返す（読むだけ。しぶき が 毎ステップ 使う） */
  peek(): readonly Vec3[] {
    return this.items;
  }

  onBlockChanged(x: number, y: number, z: number, before: BlockId, after: BlockId): void {
    if (before === after) return;
    if (after === 'sprinkler') this.add(x, y, z);
    else if (before === 'sprinkler') this.remove(x, y, z);
  }

  rescan(world: VoxelWorld): void {
    this.set.clear();
    this.items = [];
    const sc = (world as unknown as { scanBlocks?: (want: (i: number) => boolean, found: (x: number, y: number, z: number) => void) => void }).scanBlocks;
    if (sc) {
      // 高さ 352 でも 速い: スプリンクラーが入っているセクションだけ見る
      const si = blockIndexOf('sprinkler');
      sc.call(world, (i) => i === si, (x, y, z) => this.add(x, y, z));
      return;
    }
    const eb = world.loadedBounds();
    for (let y = 0; y < world.size.y; y++) {
      for (let z = eb.z0; z < eb.z1; z++) {
        for (let x = eb.x0; x < eb.x1; x++) {
          if (world.getBlock(x, y, z) === 'sprinkler') this.add(x, y, z);
        }
      }
    }
  }

  private add(x: number, y: number, z: number): void {
    const k = key(x, y, z);
    if (this.set.has(k)) return;
    this.set.add(k);
    this.items.push({ x, y, z });
  }

  private remove(x: number, y: number, z: number): void {
    if (!this.set.delete(key(x, y, z))) return;
    this.items = this.items.filter((p) => !(p.x === x && p.y === y && p.z === z));
  }
}

export function createSprinklers(d: SprinklerDeps = {}): Sprinklers {
  return new Sprinklers(d);
}
