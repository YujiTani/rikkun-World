import type { BlockId, VoxelWorld } from '../../contracts';
import { canCrushBlock, crushPartner } from '../../world/blocks/crushable';
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
  opts: Pick<YokaiManagerOptions, 'onBlocks' | 'protectAt'>;
}

/**
 * 石とつぶす係（ぬりかべ）: みず の中でかたまって石になる、たおれこみで ブロックを こわす。
 */
export class YokaiStone {
  constructor(private readonly d: StoneDeps) {}

  /** ぬりかべ: みず の中でかたまる（足もとが みず のマス）。石になったら true */
  stoneTick(e: Ent): boolean {
    const { world } = this.d;
    // 足もとの マスが 水、か 水の すぐ 上に 立って いる（ふかさ 1 の 用水路では 水の 面に うかぶ。TOWN-1 1.4）
    const fx = Math.floor(e.x);
    const fy = Math.floor(e.y + 1e-6);
    const fz = Math.floor(e.z);
    const inWater = isDeepWater(world.getBlock(fx, fy, fz)) || isDeepWater(world.getBlock(fx, fy - 1, fz));
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
        if (this.d.opts.protectAt?.(x, y, z)) return; // TOWN-1 1.3 AC9: 街・やかたの 中には 石を 置かない（たおれて 経験値は 出る）
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

  /** ぬりかべ の たおれこみ: たおれた体が重なるマスと その真下 1 段をこわす（start_torch・みず・宝箱〔MINE-1C §4.4。2 マス とも のこす〕・家の 戸〔上・下・あけた 物も。HOUSE-1 AC24〕・いちばん下の段は除く。落とし物なし） */
  crush(e: Ent): void {
    const { world } = this.d;
    const lying: OBox = { cx: 0, cy: 0.4, cz: -1.9, hx: 1.3, hy: 0.4, hz: 1.5 };
    const lo = Math.floor(e.y + 1e-6);
    const hi = Math.floor(e.y + 0.8 - 1e-6);
    const changed: { x: number; y: number; z: number; from: BlockId; to: BlockId }[] = [];
    forCells(e, lying, lo - 1, hi, (x, y, z) => {
      if (y <= 0) return;
      const b = world.getBlock(x, y, z);
      if (b === 'outside' || !canCrushBlock(b)) return;
      if (this.d.opts.protectAt?.(x, y, z)) return; // MINE-1F: やかたの ブロック・ふさいだ かべは こわさない
      if (world.setBlock(x, y, z, 'air')) changed.push({ x, y, z, from: b, to: 'air' });
      const pr = crushPartner(b, x, y, z); // ひまわりの 相手の 段
      if (pr) {
        const pb = world.getBlock(pr.x, pr.y, pr.z);
        if (pb !== 'outside' && canCrushBlock(pb) && world.setBlock(pr.x, pr.y, pr.z, 'air')) changed.push({ x: pr.x, y: pr.y, z: pr.z, from: pb, to: 'air' });
      }
    });
    if (changed.length > 0) this.d.opts.onBlocks?.(changed, 'crush');
  }
}
