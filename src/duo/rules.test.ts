import { describe, expect, it } from 'vitest';
import * as rules from './rules';
import { P2_OPEN_KINDS, duoTimeScale, duoWaitNotice, p2MayOpen } from './rules';

/**
 * COOP-1 作業 1（#395）の 先行テスト。AC11・AC15。COOP-1 4a（1.9）の テスト準備で AC84 の 止める 形を 新しい 形（AC75）に 直した（期待を ゆるめず 仕様に 合わせた）。
 * つなぎ目の 約束: src/duo/rules.ts（宣言は rules.ts）。
 *   duoTimeScale(base, joined): base = 今の `screen.timeScale()`。2 人のとき（joined）は 1。1 人のときは base のまま。
 *     4a: 1P の もちもの画面が 開いていても（base が 0.25 でも 0 でも）2 人の ときは 1（世界は 止めない。AC11・AC75）。
 *     配線: Game.setTimeScale（src/game/Game.ts）に 渡す 関数の 中で 使う。
 *   p2MayOpen(kind): 2P が 開ける 画面は 'inventory'（2P 自分の もちもの。4a から 2 人用の 半分の 画面）と、4c から 'storage'（たんす。Y か ZL）・'furnace'（かまど。ZL）。
 *     本・建築士さん・とりごやは 段階 3 まで 開かない（AC95）。4c で 直した（4a・3a の「たんす・かまども false」を AC95 の 形に。期待を ゆるめたのでなく 仕様の かわりに 合わせた）。
 *     配線: 2P の ActionState の 押下から 本・建築士さん・とりごやを 開く 道は 作らない（この 表で 見張る）。たんす・かまどを 開く 道は src/duo/p2Dig.ts の onOpenTansu・onOpenFurnace（p2Dig.test.ts）。
 *   duoWaitNotice({ joined, modal }): 4a で `inventoryOpen` を やめた。本・建築士さん（modal）が 世界を 止めている あいだ だけ true。
 *   duoWorldFrozen: 4a で なくす（1P の 全面の もちもの画面は 世界を 止めない。AC84 は AC75 に かわった）。
 *
 * ---- 止まっている あいだに 動かす 物（本・建築士さん。developer への 約束）----
 *   modal が active の あいだは wireDuo の step（game.onUpdate）が 呼ばれない。だから `duo-wait` の 出し入れと `duo-join-hint` は setModal の `tick()` と `game.onIdle` からも 呼ぶ（今の まま）。
 *   もちもの画面は もう 世界を 止めない ので、もちもの画面まわりの 1 コマ・1P の パッドを modal の tick から 回す 道は いらない（modalTick.test.ts）。
 */
describe('AC11・AC75: 2 人のとき もちもの画面は 世界を 止めない（倍率 1）', () => {
  it('2 人: base が 0.25 でも 0 でも 1（1P の 全面を 開いたままでも 同じ）', () => {
    expect(duoTimeScale(0.25, true)).toBe(1);
    expect(duoTimeScale(0, true)).toBe(1);
    expect(duoTimeScale(1, true)).toBe(1);
  });
  it('1 人: base の まま（今までどおり。全面は 0.25 倍）', () => {
    expect(duoTimeScale(0.25, false)).toBe(0.25);
    expect(duoTimeScale(1, false)).toBe(1);
    expect(duoTimeScale(0, false)).toBe(0);
  });
  it('AC84 の 止める 形は なくなった: duoWorldFrozen を 出さない', () => {
    expect((rules as Record<string, unknown>).duoWorldFrozen).toBeUndefined();
  });
});

describe('AC15 の 4c の 形・AC95: 2P が 開ける 画面（たんす・かまどは 4c から。本・建築士さん・とりごやは 段階 3 まで 開かない）', () => {
  it.each(['book', 'builder', 'henhouse'] as const)('%s は 開かない', (kind) => {
    expect(p2MayOpen(kind)).toBe(false);
  });
  it.each(['inventory', 'storage', 'furnace'] as const)('%s は 開ける', (kind) => {
    expect(p2MayOpen(kind)).toBe(true);
  });
  it('表は 6 つの 画面（かまどを 足した）を ぜんぶ 持つ（足し忘れを 落とす）', () => {
    expect([...P2_OPEN_KINDS].sort()).toEqual(['book', 'builder', 'furnace', 'henhouse', 'inventory', 'storage']);
  });
});

/**
 * 2P の 側の「ちょっと まってね」。`duoWaitNotice({ joined, modal })`（COOP-1 4a で inventoryOpen を やめた。もちもの画面は 世界を 止めない）:
 *   joined = 2P が いる / modal = 本・建築士さんの 画面が 開いている。
 *   配線: wireDuo が 毎ステップ 呼んで DuoHud の `data-testid="duo-wait"`（「ちょっと まってね」）を 出し入れする。
 *   本・建築士さんが 開いている とき 2P の パネルが 開いたままなら「ちょっと まってね」は パネルの 上に 出る（E2E）。
 */
describe('2P の 側に「ちょっと まってね」（4a から 本・建築士さん だけ）', () => {
  const base = { joined: true, modal: false };
  it('2 人で 本・建築士さんが 開いている あいだ 出る。とじたら 消える', () => {
    expect(duoWaitNotice({ ...base, modal: true })).toBe(true);
    expect(duoWaitNotice(base)).toBe(false);
  });
  it('2P が いない ときは 出ない（1 人の ときは 今の まま）', () => {
    expect(duoWaitNotice({ joined: false, modal: true })).toBe(false);
    expect(duoWaitNotice({ joined: false, modal: false })).toBe(false);
  });
  it('もちもの画面（1P の 全面・2 人用）は 出さない: inventoryOpen を 受けない', () => {
    // 型で 落とす: 余分な 入力は 受け付けない（古い 呼び方を 残さない）
    // @ts-expect-error inventoryOpen は 4a で なくなった
    expect(duoWaitNotice({ ...base, inventoryOpen: true })).toBe(false);
  });
});
