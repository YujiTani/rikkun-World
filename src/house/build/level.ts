// みずもり（HOUSE-1C PR-2 #340。仕様 §2.9・§4.4・AC16）: 地面を 右クリックして base（きじゅんの 高さ）を きめ、まわり 13×13 の 列が base より 高い（high）・低い（low）・同じ（ok）を 出す。DOM・three なし。
import { LEVEL } from './tuning';

export type LevelState = 'high' | 'low' | 'ok';
export interface LevelCell {
  x: number;
  z: number;
  state: LevelState;
}
export interface LevelBase {
  x: number;
  y: number;
  z: number;
}
export interface LevelView {
  base: LevelBase | null;
  cells: readonly LevelCell[];
}

/** 列 (x, z) の 高さ y に「固い ブロック」が あるか（草花・はっぱは 固いに 数えない。世界の 読み方は つなぎ側） */
export type SolidAt = (x: number, y: number, z: number) => boolean;

const SIDE = LEVEL.half * 2 + 1;
const EMPTY: readonly LevelCell[] = [];

/** 列の いちばん 上の 固い ブロックの 高さ − base の 高さ（−4〜+5 に 固い ブロックが なければ null） */
function topDelta(solid: SolidAt, base: LevelBase, x: number, z: number): number | null {
  for (let d = LEVEL.above; d >= -LEVEL.below; d--) if (solid(x, base.y + d, z)) return d;
  return null;
}

export const stateOfDelta = (d: number | null): LevelState => (d === null || d < 0 ? 'low' : d > 0 ? 'high' : 'ok');

/**
 * みずもりの 持ち主。base は 持ちかえても のこる。cells は 持って いて base から 横 showRange 以内の 間だけ。
 * 高さが かわったら（blockChanged・blocksChanged）次に 読む とき 作りなおす。169 この 入れものは 作りなおさない（毎フレーム 新しい 物を 作らない）。
 */
export class LevelTool {
  private base_: LevelBase | null = null;
  private readonly list: LevelCell[] = [];
  private dirty = true;
  /** cells の 中身を 作りなおす たびに ふえる 数（描画が 変わった ときだけ 書きなおす ため） */
  private rev = 0;

  constructor(private readonly solid: SolidAt) {
    for (let i = 0; i < SIDE * SIDE; i++) this.list.push({ x: 0, z: 0, state: 'ok' });
  }

  /** 右クリックで きじゅんを きめた */
  setBase(x: number, y: number, z: number): void {
    this.base_ = { x, y, z };
    this.dirty = true;
  }

  /** きじゅんを わすれる（読みこみなおし） */
  setBaseNone(): void {
    this.base_ = null;
    this.dirty = true;
  }

  base(): LevelBase | null {
    return this.base_ ? { ...this.base_ } : null;
  }

  /** (x, z) の 列が かわった */
  blockChanged(x: number, z: number): void {
    this.blocksChanged(x, z, x, z);
  }

  /** 箱（2 つの 角の 列）の 中が かわった */
  blocksChanged(x0: number, z0: number, x1: number, z1: number): void {
    const b = this.base_;
    if (!b || this.dirty) return;
    const h = LEVEL.half;
    if (Math.max(x0, x1) < b.x - h || Math.min(x0, x1) > b.x + h || Math.max(z0, z1) < b.z - h || Math.min(z0, z1) > b.z + h) return;
    this.dirty = true;
  }

  /** 色を 出す か（みずもりを 持って いて、base から 横 16 マス 以内） */
  visible(holding: boolean, px: number, pz: number): boolean {
    const b = this.base_;
    return holding && b !== null && Math.hypot(px - (b.x + 0.5), pz - (b.z + 0.5)) <= LEVEL.showRange;
  }

  /** 窓口 `level()` と 色の 描画が 読む もの */
  view(holding: boolean, px: number, pz: number): LevelView {
    const b = this.base_;
    if (!b) return { base: null, cells: EMPTY };
    if (!this.visible(holding, px, pz)) return { base: { ...b }, cells: EMPTY };
    if (this.dirty) this.recompute(b);
    return { base: { ...b }, cells: this.list };
  }

  /** 色を 出す 列（描画用。新しい 物を 作らない）。出さない ときは 空 */
  cells(holding: boolean, px: number, pz: number): readonly LevelCell[] {
    const b = this.base_;
    if (!b || !this.visible(holding, px, pz)) return EMPTY;
    if (this.dirty) this.recompute(b);
    return this.list;
  }

  /** cells の 版（recompute のたび +1。同じ 版 ＋ 同じ 配列なら 描画は そのまま） */
  revision(): number {
    return this.rev;
  }

  /** base の 高さ（なければ 0） */
  baseY(): number {
    return this.base_?.y ?? 0;
  }

  private recompute(b: LevelBase): void {
    const h = LEVEL.half;
    let i = 0;
    for (let dz = -h; dz <= h; dz++) {
      for (let dx = -h; dx <= h; dx++) {
        const c = this.list[i++]!;
        c.x = b.x + dx;
        c.z = b.z + dz;
        c.state = stateOfDelta(topDelta(this.solid, b, c.x, c.z));
      }
    }
    this.dirty = false;
    this.rev++;
  }
}
