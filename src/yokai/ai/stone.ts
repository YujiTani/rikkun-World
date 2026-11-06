import type { BlockId, VoxelWorld } from '../../contracts';
import { doorInfo } from '../../world/blocks/houseBlocks';
import { applyDollBrightness } from './brightness';
import { forCells } from './body';
import { AI_CONST } from './config';
import type { YokaiDefeat } from './defeat';
import type { Ent } from './entity';
import type { OBox } from './geometry';
import type { YokaiManagerOptions } from './managerTypes';
import { isDeepWater, isWater } from '../../world/blocks/water';

interface StoneDeps {
  world: VoxelWorld;
  reward: Pick<YokaiDefeat, 'defeat'>;
  /** onBlocks を 呼ぶときに 読む */
  opts: Pick<YokaiManagerOptions, 'onBlocks'>;
}

/**
 * 石とつぶす係（ぬりかべ）: みず の中でかたまって石になる、たおれこみで ブロックを こわす。
 */
export class YokaiStone {
  constructor(private readonly d: StoneDeps) {}

  /** ぬりかべ: みず の中でかたまる（足もとが みず のマス）。石になったら true */
  stoneTick(e: Ent): boolean {
    const { world } = this.d;
    const inWater = isDeepWater(world.getBlock(Math.floor(e.x), Math.floor(e.y + 1e-6), Math.floor(e.z)));
    const before = e.stone;
    e.stone = Math.max(0, Math.min(1, e.stone + (inWater ? 1 : -1) / AI_CONST.stoneTicks));
    if (e.stone !== before) {
      e.model.stoneness = e.stone;
      applyDollBrightness(e.model, e.kind, e.bright, e.stage);
    }
    if (e.stone < 1 - 1e-9) return false;
    // 石になった: 体が重なる 空気・みず のマスだけ石に。経験値・ドロップは ふつうに出す
    const changed: { x: number; y: number; z: number; from: BlockId; to: BlockId }[] = [];
    const lo = Math.floor(e.y + 1e-6);
    const body: OBox = { cx: 0, cy: 1.5, cz: 0, hx: 1.3, hy: 1.5, hz: 0.4 };
    forCells(e, body, lo, lo + 2, (x, y, z) => {
      const b = world.getBlock(x, y, z);
      if (b !== 'outside' && (b === 'air' || isWater(b))) {
        if (world.setBlock(x, y, z, 'stone')) changed.push({ x, y, z, from: b, to: 'stone' });
      }
    });
    const y0 = e.y;
    e.y += 3.2; // ドロップは石の上に出す
    this.d.reward.defeat(e);
    e.y = y0;
    e.remove = true;
    if (changed.length > 0) this.d.opts.onBlocks?.(changed, 'stone');
    return true;
  }

  /** ぬりかべ の たおれこみ: たおれた体が重なるマスと その真下 1 段をこわす（start_torch・みず・家の 戸〔上・下・あけた 物も。HOUSE-1 AC24〕・いちばん下の段は除く。落とし物なし） */
  crush(e: Ent): void {
    const { world } = this.d;
    const lying: OBox = { cx: 0, cy: 0.4, cz: -1.9, hx: 1.3, hy: 0.4, hz: 1.5 };
    const lo = Math.floor(e.y + 1e-6);
    const hi = Math.floor(e.y + 0.8 - 1e-6);
    const changed: { x: number; y: number; z: number; from: BlockId; to: BlockId }[] = [];
    forCells(e, lying, lo - 1, hi, (x, y, z) => {
      if (y <= 0) return;
      const b = world.getBlock(x, y, z);
      if (b === 'air' || b === 'outside' || isWater(b) || b === 'start_torch' || doorInfo(b) !== null) return;
      if (world.setBlock(x, y, z, 'air')) changed.push({ x, y, z, from: b, to: 'air' });
    });
    if (changed.length > 0) this.d.opts.onBlocks?.(changed, 'crush');
  }
}
