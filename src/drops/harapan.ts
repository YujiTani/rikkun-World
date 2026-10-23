import type { LiveSettings } from '../contracts';
import { createRng } from '../world/gen/random';

/**
 * GOLD-1 §4.7: はらぱんみみず の おとしもの の くじ。
 * 乱数 は シード 付き の **べつ の 流れ**（今 の 妖怪 の おとしもの・ほる の くじ を ずらさない）。
 * 1 回 の「たおした／こわした」で 1 つ つかう（くじ が ない とき は つかわない）。
 */
export interface HarapanRoll {
  /** 妖怪 を たおした（足もと の 高さ y。地下 = y < `harapanUnderY` の ときだけ くじ） */
  yokai(y: number): boolean;
  /** ブロック を こわした（き は 高さ を とわず `harapanLog`、ほか は 地下 の ときだけ `harapanBlock`） */
  block(id: string, y: number): boolean;
  /** 宝箱 を あけた（宝箱 は まだ 無い。つなぐ ため の 口） */
  chest(): boolean;
}

export function createHarapanRoll(seed: number, settings: () => Pick<LiveSettings, 'harapanYokai' | 'harapanChest' | 'harapanBlock' | 'harapanLog' | 'harapanUnderY'>): HarapanRoll {
  const rng = createRng((seed ^ 0x6a09e667) >>> 0);
  const draw = (chance: number): boolean => rng() < chance;
  return {
    yokai: (y) => (y < settings().harapanUnderY ? draw(settings().harapanYokai) : false),
    block: (id, y) => {
      const s = settings();
      if (id === 'log') return draw(s.harapanLog);
      return y < s.harapanUnderY ? draw(s.harapanBlock) : false;
    },
    chest: () => draw(settings().harapanChest),
  };
}
