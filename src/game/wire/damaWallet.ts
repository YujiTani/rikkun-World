// TOWN-1 1F: ようかいダマの さいふ（1.6）の 毎ステップ: 「＋」の のこりを すすめ、すみの 札と もちもの画面の 数を 描く。
import type { Shared } from './shared';
import { installDamaWallet } from '../../ui/damaWallet';
import { invChipOf, invOpenOf } from './dama';

export function wireDamaWallet(deps: { shared: Shared; game: { onUpdate(fn: (dt: number) => void): void }; hud: HTMLElement }): void {
  const { shared, game, hud } = deps;
  const dama = shared.dama!;
  const draw = installDamaWallet(hud, { duo: () => dama.joined(2), hud: (p) => dama.hud(p), invChip: invChipOf(dama, invOpenOf(shared)) });
  game.onUpdate(() => {
    dama.step();
    draw();
  });
}
