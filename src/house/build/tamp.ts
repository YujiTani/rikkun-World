// どうづき（HOUSE-1C PR-2 #340。仕様 §2.9・§4.4・AC17）: 地面を たたくと、たたいた ブロックと 同じ 高さの 3×3 の うち、上が 空気（か 消える 草花）の くさ・つち・すな・ゆきが かためた つちに なる。DOM・three なし。
import type { BlockId } from '../../contracts';
import { KATAME_TSUCHI } from '../../world/blocks/buildBlocks';
import { isVanishingFlora } from '../../world/blocks/flora';
import { DOZUKI } from './tuning';

/** かためた つちに できる 地面 */
const TAMPABLE: ReadonlySet<string> = new Set(['grass', 'dirt', 'sand', 'snow']);

export interface TampWorld {
  getBlock(x: number, y: number, z: number): BlockId | 'outside';
  setBlock(x: number, y: number, z: number, id: BlockId): boolean;
}

/** 'cooling' = まだ 20 ステップ たって いない（何も おきない・音も なし）／'soft' = もう かためた つち（小さい 音だけ）／'tamp' = たたいた（掛け声 ＋ ドスン。changed = かわった マスの 数） */
export type TampResult = { kind: 'cooling' } | { kind: 'soft' } | { kind: 'tamp'; changed: number };

export class Dozuki {
  private nextAt = 0;

  constructor(private readonly world: TampWorld) {}

  /** now = 世界の 歩数。(x, y, z) = たたいた ブロック。たたける ときは 20 ステップの 間かくを 始める */
  tap(x: number, y: number, z: number, now: number): TampResult {
    if (now < this.nextAt) return { kind: 'cooling' };
    this.nextAt = now + DOZUKI.cooldownTicks;
    const w = this.world;
    if (w.getBlock(x, y, z) === KATAME_TSUCHI) return { kind: 'soft' };
    let changed = 0;
    for (let dz = -DOZUKI.half; dz <= DOZUKI.half; dz++) {
      for (let dx = -DOZUKI.half; dx <= DOZUKI.half; dx++) {
        const cx = x + dx;
        const cz = z + dz;
        if (!TAMPABLE.has(w.getBlock(cx, y, cz))) continue;
        const above = w.getBlock(cx, y + 1, cz);
        if (above !== 'air' && !isVanishingFlora(above)) continue;
        if (above !== 'air') w.setBlock(cx, y + 1, cz, 'air'); // 消える 草花は どける
        w.setBlock(cx, y, cz, KATAME_TSUCHI);
        changed++;
      }
    }
    return { kind: 'tamp', changed };
  }

  /** あと 何ステップで また たたけるか（テスト用） */
  waitLeft(now: number): number {
    return Math.max(0, this.nextAt - now);
  }

  /** 世界が かわった（読みこみなおし）: 間かくを 0 に */
  reset(): void {
    this.nextAt = 0;
  }
}
