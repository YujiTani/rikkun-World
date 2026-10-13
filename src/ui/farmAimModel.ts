import type { FarmAim } from '../contracts';

/** もうすぐ かわく とき の しずく の 不透明度（M7-2 §3.5） */
export const WET_SOON_OPACITY = 0.45;

/** くらい ときの 文（M7 §3.4） */
export const DARK_TEXT = 'くらい と そだたない よ';

export type DotState = 'ok' | 'gold' | 'empty';

export interface FarmAimView {
  /** まる 4 つの 状態（左から） */
  dots: DotState[];
  /** くらい とき まる を うすく（不透明度 40%） */
  dim: boolean;
  droplet: boolean;
  /** M7-2: しずく を うすく（不透明度 45%）=「もうすぐ かわく」 */
  dropletFaint: boolean;
  /** M7-2: ごきげん の 作物（しずく の 右 に ハート） */
  heart: boolean;
  moon: boolean;
  darkText: string | null;
  /** はたけ を ねらった（作物なし。まる 0） */
  soilOnly: boolean;
}

/**
 * ねらった作物の しるし（M7 §3.4）。段階 s なら 左から s+1 こ みどり、のこりは ふちだけ。みのった（ripe）なら 4 つ とも 金色。
 * くらい（dark）なら まる を うすくして 月と 文。aim が null なら null。
 */
export function farmAimView(aim: FarmAim | null): FarmAimView | null {
  if (!aim) return null;
  const dots: DotState[] = [];
  for (let i = 0; i < 4; i++) dots.push(aim.ripe ? 'gold' : i < aim.dots ? 'ok' : 'empty');
  const dark = aim.dark && !aim.ripe;
  return {
    dots,
    dim: dark,
    droplet: aim.wet,
    dropletFaint: aim.wet && !!aim.wetSoon,
    heart: !!aim.happy,
    moon: dark,
    darkText: dark ? DARK_TEXT : null,
    soilOnly: aim.dots === 0 && !aim.ripe,
  };
}
