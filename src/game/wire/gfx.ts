// GFX-1: せっていの「がめん」の 窓口を つなぐ。おもさ・かげ・がめんの こまかさ・ちかくの こまかさを、
// その場で 効かせる（Game.setResolution・renderer.config.microRadius・影の しくみを あとから 作る）。
import type { Game } from '../Game';
import type { WorldRenderer } from '../../world/render/WorldRenderer';
import { createGfx, type GfxPort } from '../../start/gfxController';
import { normalizeMicroR } from '../../world/render/voxel/tier';
import { RING_SMALL } from '../../world/stream/ring';
import type { GfxStore, Weight } from '../../start/gfxPref';
import type { WeightedStart } from '../../start/weightPref';

export function wireGfx(d: {
  game: Game;
  renderer: WorldRenderer;
  store: GfxStore | null;
  weighted: WeightedStart;
  weight: Weight;
  setShadow: (on: boolean, persist?: boolean) => void;
  shadowOn: () => boolean;
}): GfxPort {
  d.game.setResolution(d.weighted.res); // はじめの がめんの こまかさ（起動の とき 1 回）
  return createGfx({
    store: d.store,
    weight: d.weight,
    res: d.weighted.res,
    ring: d.weighted.ring === RING_SMALL ? 'small' : 'full',
    shadowAllowed: d.weighted.shadowAllowed,
    live: { micro: () => normalizeMicroR(d.renderer.config.microRadius), shadow: d.shadowOn },
    apply: {
      micro: (r) => {
        d.renderer.config.microRadius = r; // F4 と 同じ 先
      },
      res: (r) => d.game.setResolution(r),
      shadow: (on, persist) => d.setShadow(on, persist),
    },
  });
}
