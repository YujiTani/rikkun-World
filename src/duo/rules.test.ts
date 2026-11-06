import { describe, expect, it } from 'vitest';
import { P2_OPEN_KINDS, duoTimeScale, duoWaitNotice, duoWorldFrozen, p2MayOpen } from './rules';

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
 * 止め方は 本・建築士さんと 同じ `game.setModal` の 道。`active()` に `duoWorldFrozen({ joined, mode: screen.mode() })` を 足す（下の describe）。
 * `Game.update()` は modal が active の あいだ updaters を 呼ばない（Game.ts の update。本番 frame は modal.tick と idleUpdaters だけ）ので、
 * テスト用の `__rikkun.step()` も 止まる。倍率 0（この 関数）だけでは 世界は 止まらない: `duo.timeScale()` の 0 は 止まった 証拠に しない。
 *
 * ---- 止まっている あいだに 動かす 物（developer への 約束）----
 *   modal が active の あいだは wireDuo の step（game.onUpdate）も、wireGamepad の step も 呼ばれない。だから 次の 2 つは
 *   setModal の `tick()`（src/game/wire/player.ts）と `game.onIdle` からも 呼ぶ:
 *   (1) DOM の 出し入れ: `duo-wait`（`duoWaitNotice` が true の あいだ だけ。1P の 全面を とじた 次の frame で 消える）と `duo-join-hint`
 *       （`DuoJoinHint.step({ ..., active: false })` を わたす。止まっている あいだは 出さない）。
 *   (2) 1P の パッドの せってい／もちもの画面の 操作（gamepad の pumpUi・router.poll の 1P の 分）: 1P の 全面を 1P の パッド（B など）で とじられる。
 *       2P の 入力は 読んでも 歩かせない（世界が 止まっている）。E2E の AC84 が 1P の パッドで とじる。
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

/**
 * 作業 3d（#418。AC84・§10）: `duoWorldFrozen({ joined, mode })`。joined = 2P が いる / mode = `screen.mode()`（'play' | 'inventory' | 'guide'）。
 * 2 人で 1P の 全面の もちもの画面（mode が 'inventory'）の ときだけ true。1 人の ときは 今の まま（false。0.25 倍で 動きつづけ、1P の パッドの ＋ も 読まれる）。
 * 配線: `game.setModal` の `active()` が `book.active() || shared.houseFrozen() || duoWorldFrozen(...)` の 形で 使う。
 */
describe('AC84・§10: duoWorldFrozen', () => {
  it('2 人で 1P の 全面の もちもの画面（inventory）の ときだけ true', () => {
    expect(duoWorldFrozen({ joined: true, mode: 'inventory' })).toBe(true);
    expect(duoWorldFrozen({ joined: true, mode: 'play' })).toBe(false);
    expect(duoWorldFrozen({ joined: true, mode: 'guide' })).toBe(false);
  });
  it('1 人の ときの 全面（inventory）は false（止めない。updaters が 動くので ＋ も 読まれる）', () => {
    expect(duoWorldFrozen({ joined: false, mode: 'inventory' })).toBe(false);
  });
  it('1 人で 全面を 開いたまま 2P が 参加すると、同じ mode で その 時点から true（§10。参加した その ステップから）', () => {
    const mode = 'inventory' as const;
    expect(duoWorldFrozen({ joined: false, mode })).toBe(false);
    expect(duoWorldFrozen({ joined: true, mode })).toBe(true);
  });
});
