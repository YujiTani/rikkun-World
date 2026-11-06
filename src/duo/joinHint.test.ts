import { describe, expect, it } from 'vitest';
import { DuoJoinHint, type DuoJoinHintInput } from './joinHint';
import { DUO_TUNING } from './tuning';

/**
 * COOP-1 作業 3d（#418。docs/design/COOP-1.md §2.1・AC46・AC64）の 先行テスト（赤）。「＋で さんか」を いつ 出すか。
 *
 * ---- developer への つなぎ目の 約束 ----
 *   src/duo/joinHint.ts  `DuoJoinHint`（型は 置いてある スタブ）。DOM なし。時間は 持たず、固定ステップごとに step(input) を 1 回 呼ぶ。
 *     input = { candidate, joined, active, anyButton }（意味は joinHint.ts）。candidate は `DuoPadRouter.joinCandidate() !== null`、
 *     active は `router.poll(now, active)` に わたす 値と 同じ。visible() は その step を 見た あとの 答え。
 *     出す 長さは `DUO_TUNING.joinHintSteps`（180 = 3 秒。世界が 動いている ステップだけ 数える）。
 *   決まり（§2.1）:
 *     - 出るのは 候補が false → true に なった とき だけ（最初の step で 候補が いても 「なった」と 数える）。
 *     - 候補が いる のに 出ない: 2P が いる・もう 出して 消えた（3 秒たった・ボタンを 押した）あと。候補が いったん いなく なって また 来たら また 出す。
 *     - 世界が 止まっている あいだ（active が false）は 出さない。その あいだに 候補が 来たら、動きだした step から 3 秒。
 *     - 出している ステップの 数え方: 動いている step の 数が joinHintSteps に とどいた step で 消える（179 まで 出て、180 で 消える）。
 *   配線: wireDuo が 毎ステップ step を 呼び、visible() で DOM の `data-testid="duo-join-hint"`（「＋で さんか」。ひらがな・＋ボタンの 絵）を 出し入れする。
 *     modal（本・建築士さん・2 人で 1P の 全面の もちもの画面）が active の あいだは Game.update() が updaters を 呼ばない
 *     （src/game/Game.ts の update。本番 frame は modal.tick と idleUpdaters だけ）ので、`game.setModal` の tick（src/game/wire/player.ts）と
 *     `game.onIdle` からも 同じ step を 呼ぶ。そのとき active には false を わたす（止まっている あいだは 出さない）。
 */

const base: DuoJoinHintInput = { candidate: true, joined: false, active: true, anyButton: false };
const N = DUO_TUNING.joinHintSteps;

function run(h: DuoJoinHint, n: number, i: Partial<DuoJoinHintInput> = {}): void {
  for (let k = 0; k < n; k++) h.step({ ...base, ...i });
}

describe('AC46・AC64: 候補が 0 から 1 に なると 3 秒 出る', () => {
  it('3 秒は 180 ステップ', () => {
    expect(N).toBe(180);
  });
  it('候補が いない あいだは 出ない', () => {
    const h = new DuoJoinHint();
    run(h, 10, { candidate: false });
    expect(h.visible()).toBe(false);
  });
  it('候補が 来た step から 出て、N - 1 ステップまで 出て、N ステップ目で 消える', () => {
    const h = new DuoJoinHint();
    run(h, 5, { candidate: false });
    run(h, 1);
    expect(h.visible()).toBe(true);
    run(h, N - 2);
    expect(h.visible(), `${N - 1} ステップ目`).toBe(true);
    run(h, 1);
    expect(h.visible(), `${N} ステップ目`).toBe(false);
  });
  it('消えたあと 候補が いるままでは もう 出ない', () => {
    const h = new DuoJoinHint();
    run(h, N + 300);
    expect(h.visible()).toBe(false);
  });
  it('最初の step から 候補が いても 出る（ページを 開いたとき すでに 刺さっている）', () => {
    const h = new DuoJoinHint();
    run(h, 1);
    expect(h.visible()).toBe(true);
  });
  it('候補が いなく なって また 来たら また 3 秒 出る', () => {
    const h = new DuoJoinHint();
    run(h, N);
    expect(h.visible()).toBe(false);
    run(h, 3, { candidate: false });
    run(h, 1);
    expect(h.visible()).toBe(true);
    run(h, N - 1);
    expect(h.visible()).toBe(false);
  });
  it('出ている あいだに 候補が いなく なったら すぐ 消える', () => {
    const h = new DuoJoinHint();
    run(h, 30);
    expect(h.visible()).toBe(true);
    run(h, 1, { candidate: false });
    expect(h.visible()).toBe(false);
  });
});

describe('AC46: ボタンを 押すか 参加したら 消える', () => {
  it('候補の パッドの ボタンを 押したら 消える。そのあと 候補が いるままでは もどらない', () => {
    const h = new DuoJoinHint();
    run(h, 30);
    expect(h.visible()).toBe(true);
    run(h, 1, { anyButton: true });
    expect(h.visible()).toBe(false);
    run(h, 5);
    expect(h.visible()).toBe(false);
  });
  it('参加したら その step で 消える。やめて 候補が いるままでも 出ない（0 から 1 に なっていない）', () => {
    const h = new DuoJoinHint();
    run(h, 30);
    run(h, 1, { joined: true });
    expect(h.visible()).toBe(false);
    run(h, 10, { joined: true });
    expect(h.visible()).toBe(false);
    run(h, 10); // やめた
    expect(h.visible()).toBe(false);
  });
  it('2P が いる あいだに 候補が 来ても 出ない', () => {
    const h = new DuoJoinHint();
    run(h, 10, { joined: true, candidate: false });
    run(h, 10, { joined: true });
    expect(h.visible()).toBe(false);
  });
});

describe('§2.1: 世界が 止まっている あいだは 出さない', () => {
  it('止まっている あいだに 候補が 来たら、動きだした step から N ステップ', () => {
    const h = new DuoJoinHint();
    run(h, 300, { active: false });
    expect(h.visible()).toBe(false);
    run(h, 1);
    expect(h.visible(), '動きだした step').toBe(true);
    run(h, N - 2);
    expect(h.visible()).toBe(true);
    run(h, 1);
    expect(h.visible()).toBe(false);
  });
  it('出している とちゅうで 止まったら 消え、止まっている 時間は 数えない（動いた 分だけ 数える）', () => {
    const h = new DuoJoinHint();
    run(h, 100);
    expect(h.visible()).toBe(true);
    run(h, 500, { active: false });
    expect(h.visible()).toBe(false);
    run(h, N - 101); // 動いた 合計 N - 1
    expect(h.visible()).toBe(true);
    run(h, 1);
    expect(h.visible()).toBe(false);
  });
});
