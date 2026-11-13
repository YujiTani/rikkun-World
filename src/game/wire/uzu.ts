// わきどころ・たきつぼ（マグマ版も）の「あわのうず」のつなぎ。1P・2P の まわりに 出す（画面分割でも 同じ 場面に 入るので 各自の 画面に 出る）。
// おもさ「とても かるい」では 出さない（しぶきの あつかいに あわせる）。
import type { BlockId } from '../../contracts';
import type { Game } from '../Game';
import type { Weight } from '../../start/gfxPref';
import { UzuFx } from '../../fx/uzuFx';
import type { UzuPoint } from '../../fx/uzuModel';

interface UzuWire {
  game: Pick<Game, 'scene' | 'onUpdate'>;
  world: {
    getBlock: (x: number, y: number, z: number) => BlockId | 'outside';
    onBlockChange: ((x: number, y: number, z: number, prev: number, next: number) => void) | null;
  };
  controller: { state: { position: UzuPoint } };
  seed: number;
  shared: { duoMate: () => { position: UzuPoint } | null; gfx: { state: () => { weight: Weight } } | null };
}

export function installUzu(d: UzuWire): UzuFx {
  const foci: UzuPoint[] = [];
  // ブロックが かわった 番号。world.onBlockChange は 水の 系も つかう 1 つの 口なので、前の 持ち主も よぶ（水の 前に つないでも 後に つないでも こわれない）
  let version = 0;
  const prev = d.world.onBlockChange;
  d.world.onBlockChange = (x, y, z, p, n) => {
    version++;
    prev?.(x, y, z, p, n);
  };
  const fx = new UzuFx(d.game.scene, {
    seed: d.seed,
    getBlock: (x, y, z) => d.world.getBlock(x, y, z),
    blockVersion: () => version,
    foci: () => {
      foci.length = 0;
      if (d.shared.gfx?.state().weight === 'xlight') return foci;
      foci.push(d.controller.state.position);
      const mate = d.shared.duoMate();
      if (mate) foci.push(mate.position);
      return foci;
    },
  });
  d.game.onUpdate((dt) => fx.update(dt));
  return fx;
}
