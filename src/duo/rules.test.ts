import { describe, expect, it } from 'vitest';
import { P2_OPEN_KINDS, duoTimeScale, duoWaitNotice, p2MayOpen } from './rules';

/**
 * COOP-1 作業 1（#395）の 先行テスト（赤）。AC11・AC15。
 * つなぎ目の 約束: src/duo/rules.ts（宣言は rules.ts）。
 *   duoTimeScale(base, joined): base = 今の `screen.timeScale()`。2 人のとき（joined）は 1。1 人のときは base のまま。
 *     配線: Game.setTimeScale（src/game/Game.ts）に 渡す 関数の 中で 使う。
 *   p2MayOpen(kind): 段階 1 で 2P が 開ける 画面は 'inventory'（2P 自分の もちもの）だけ。
 *     配線: 2P の ActionState の 押下から 本・建築士さん・とりごや・たんすを 開く 道は 作らない（この 表で 見張る）。
 */

/**
 * 作業 3d（#418。AC84）で 意味が かわった: `duoTimeScale(base, joined)` は 1P の 全面の もちもの画面（screen.mode() が 'inventory'）の ときの 倍率。
 * 2 人の ときは 1 では なく 0（世界が 止まる）。2P の パネルを 開いても 1P の 画面は 'inventory' に ならないので 倍率は 1 のまま（E2E の AC11）。
 * 止め方は 本・建築士さんと 同じ `game.setModal` の 道（`active()` に「2 人で 1P の 全面が 開いている」を 足す）。テスト用の `__rikkun.step()` も 止まる ように。
 * 倍率（`duo.timeScale()`）も 0 を 返す（この 関数）。
 */
describe('AC11・AC84: 2 人のとき 1P の 全面の もちもの画面は 世界を 止める（倍率 0）', () => {
  it('2 人: base が 0.25 でも 0', () => {
    expect(duoTimeScale(0.25, true)).toBe(0);
    expect(duoTimeScale(0, true)).toBe(0);
  });
  it('1 人: base の まま（今までどおり）', () => {
    expect(duoTimeScale(0.25, false)).toBe(0.25);
    expect(duoTimeScale(1, false)).toBe(1);
    expect(duoTimeScale(0, false)).toBe(0);
  });
});

describe('AC15: 段階 1 の 2P は 本・建築士さん・とりごや・たんすを 開けない', () => {
  it.each(['book', 'builder', 'henhouse', 'storage', 'furnace'] as const)('%s は 開かない', (kind) => {
    expect(p2MayOpen(kind)).toBe(false);
  });
  it('2P 自分の もちものは 開ける', () => {
    expect(p2MayOpen('inventory')).toBe(true);
  });
  it('表は 6 つの 画面（かまどを 足した）を ぜんぶ 持つ（足し忘れを 落とす）', () => {
    expect([...P2_OPEN_KINDS].sort()).toEqual(['book', 'builder', 'furnace', 'henhouse', 'inventory', 'storage']);
  });
});

/**
 * 作業 3d（#418。AC84）: 2P の 側の「ちょっと まってね」。`duoWaitNotice({ joined, inventoryOpen, modal })`:
 *   joined = 2P が いる / inventoryOpen = 1P の 全面の もちもの画面が 開いている / modal = 本・建築士さんの 画面が 開いている。
 *   配線: wireDuo が 毎ステップ 呼んで DuoHud の `data-testid="duo-wait"`（「ちょっと まってね」）を 出し入れする（2P の 側: 1 画面・ルーペは 右下、分割は 右半分の まん中）。
 */
describe('AC84: 2P の 側に「ちょっと まってね」', () => {
  const base = { joined: true, inventoryOpen: false, modal: false };
  it('2 人で 1P が 全面の もちもの画面を 開いている あいだ 出る。とじたら 消える', () => {
    expect(duoWaitNotice({ ...base, inventoryOpen: true })).toBe(true);
    expect(duoWaitNotice(base)).toBe(false);
  });
  it('2 人で 本・建築士さんが 開いている あいだも 出る（今の 止まり方に 文を 足す）', () => {
    expect(duoWaitNotice({ ...base, modal: true })).toBe(true);
  });
  it('2P が いない ときは 出ない（1 人の ときは 今の まま）', () => {
    expect(duoWaitNotice({ joined: false, inventoryOpen: true, modal: false })).toBe(false);
    expect(duoWaitNotice({ joined: false, inventoryOpen: false, modal: true })).toBe(false);
  });
  // 2P の 小さい パネルだけ 開いている ときは 入力の どれも true に ならない（inventoryOpen は 1P の 全面だけ）ので、出ない・世界も 止まらない。
  // 2P の パネルが 開いている ときに 1P が 全面を 開いたときも 同じ（inventoryOpen が true で 出る。とじると 2P の パネルは 開いたまま 続き）。
});
