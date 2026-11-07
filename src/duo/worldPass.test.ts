import { describe, expect, it } from 'vitest';
import { worldPassActive } from './rules';

/**
 * COOP-1 4d-0（docs/design/COOP-1.md 1.13 §3.6 (b)「まぶしい 光」「不具合 ① を 直す」・§12.0 の `duo.state().fullPass`・AC98・AC113）の 先行テスト（赤）。
 * 不具合 ①: 2 人の とき、1P が 虹の 刀で ふつうに 切る か 雷を 落とすと、画面ぜんたいが 1P の 絵に なり 2P の 半分が 消える。
 * 直し: 2P が いる あいだは 全面の 光の 道（`Game.setWorldPass` の `worldPass`）を 通らない。いつも 左右（`viewPass`）。
 *
 * ---- 実装への 約束（src/duo/rules.ts に 足す。純粋な 関数）----
 *   worldPassActive(i: { thunder: boolean; rainbow: boolean; joined: boolean }): boolean
 *     全面の 光の 道を 使うか。1 人の とき: 雷か 虹が 出ている あいだ（今の 決まり）。2 人の とき（joined）: いつも false。
 *     配線: `src/game/wire/combat.ts` の `game.setWorldPass({ active: () => worldPassActive({ thunder: thunderFx.active(), rainbow: rainbowFx.active(), joined: shared.duoJoined() }), … })`。
 *     `Game.drawWorld()` の 順（worldPass → viewPass → ふつう）は かえない。2 人の ときは worldPass が false なので viewPass（左右）に なる。
 *   口 `duo.state().fullPass`（E2E。e2e/duoLight.spec.ts）: 2P が 参加して から 全面の 光の 道で 描いた コマの 数。参加で 0 に もどる。2P が いなければ 0。
 *     数えるのは `Game` の worldPass の 描画（`wp.render` を 呼んだ コマ）。2 人の とき 1 に なったら 不具合 ① が 残っている。
 */

describe('AC98: 2 人の とき 全面の 光の 道を 通らない', () => {
  it('雷が 出ている あいだ・虹が 出ている あいだ・両方 でも false', () => {
    expect(worldPassActive({ thunder: true, rainbow: false, joined: true })).toBe(false);
    expect(worldPassActive({ thunder: false, rainbow: true, joined: true })).toBe(false);
    expect(worldPassActive({ thunder: true, rainbow: true, joined: true })).toBe(false);
  });
  it('何も 出ていなければ false', () => {
    expect(worldPassActive({ thunder: false, rainbow: false, joined: true })).toBe(false);
  });
});

describe('AC113: 1 人の とき 今の 全面の 光の 描き方（かわらない）', () => {
  it('雷か 虹が 出ている あいだ だけ true', () => {
    expect(worldPassActive({ thunder: true, rainbow: false, joined: false })).toBe(true);
    expect(worldPassActive({ thunder: false, rainbow: true, joined: false })).toBe(true);
    expect(worldPassActive({ thunder: true, rainbow: true, joined: false })).toBe(true);
    expect(worldPassActive({ thunder: false, rainbow: false, joined: false })).toBe(false);
  });
});
