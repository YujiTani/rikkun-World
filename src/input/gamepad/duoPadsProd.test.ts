import { describe, expect, it } from 'vitest';
import { ActionState } from '../actions';
import { AlwaysLook } from './reader';
import { DuoPadRouter } from './duoPads';
import { PAD_CHOICE_KEY } from './padChoice';
import { FakeStorage, fakePad } from './testPad';

/**
 * COOP-1 作業 3d（#418。docs/design/COOP-1.md §2.1・§2.7・AC64）の 先行テスト（赤）。本番（ふつうの URL）で ＋ 参加が できる 条件。
 *
 * ---- developer への つなぎ目の 約束 ----
 *   src/input/gamepad/duoPads.ts
 *     - `joinCandidate(): number | null`（置いてある スタブ）: 2P の 候補（その ＋ で 参加できる パッド）の 番号。いなければ null。
 *       今の `candidate()` と 同じ 決まり: 2P の 番号を 決めてあれば それが つながっている ときだけ、決めて なければ 1P で ない 番号の いちばん 小さい つながっている 物。
 *       3 本目は 候補に ならない（決めた 番号が ぬけていて 3 本目だけ あっても null）。
 *     - `DuoPadRouterOptions.choiceEnabled` は けす（`DuoPadRouter.choiceUsable()` も けす）。作った だけで 保存を いつも 読み、`setChoice` も いつも 効く
 *       （けす とき 今ある テストの `choiceEnabled: true` も 一緒に けす）。AC65 の ユニットは duoPadChoice.test.ts。
 *   配線: src/game/wire/gamepad.ts の `choiceEnabled`（`?duo=dev`）をやめる。src/game/wire/duo.ts の `onJoinRequested` と `hook.join` の `dev` を はずす
 *     （`hook.place` と 3a の `?duo=dev` 専用の 口だけ `dev` の まま）。「＋で さんか」は src/duo/joinHint.ts（joinHint.test.ts）。
 */

const START = 9; // ＋
const STICK_UP = [0, -1, 0, 0];

function make(init: Record<string, string> = {}) {
  const p1 = new ActionState();
  const p2 = new ActionState();
  const storage = new FakeStorage(init);
  // choiceEnabled を わたさない（ふつうの URL と 同じ）
  const router = new DuoPadRouter({ p1, p2, look1: new AlwaysLook(), look2: new AlwaysLook(), storage: null, choiceStorage: storage });
  let pads: (Gamepad | null)[] = [];
  router.getPads = () => pads;
  const set = (...p: (Gamepad | null)[]) => {
    pads = p;
  };
  let t = 0;
  const poll = (active = true) => router.poll((t += 16), active);
  return { p1, p2, router, storage, set, poll };
}

describe('AC64: 2P の 候補（保存が ない とき）', () => {
  it('パッドが 0 本・1 本: 候補は いない', () => {
    const { router, set } = make();
    expect(router.joinCandidate()).toBeNull();
    set(fakePad(0));
    expect(router.joinCandidate()).toBeNull();
  });
  it('2 本: 2 本目が 候補。3 本: 3 本目は 候補に ならない', () => {
    const { router, set } = make();
    set(fakePad(0), fakePad(1));
    expect(router.joinCandidate()).toBe(1);
    set(fakePad(0), fakePad(1), fakePad(2));
    expect(router.joinCandidate()).toBe(1);
  });
});

describe('AC64: 1P の 物だけ つながっている とき は 参加しない', () => {
  it('1 本だけで ＋ を 押しても joinRequested は false。1P の スタートメニューが 開く', () => {
    const { p1, set, poll } = make();
    set(fakePad(0, { buttons: [START] }));
    for (let i = 0; i < 5; i++) expect(poll().joinRequested).toBe(false);
    expect(p1.isHeld('openStartMenu')).toBe(true);
  });
});

describe('AC64: 保存で 決めた 2P の 番号が つながっていない とき は 候補が いない', () => {
  const saved = (p1: number | null, p2: number | null) => ({ [PAD_CHOICE_KEY]: JSON.stringify({ p1, p2 }) });

  it('保存 {p1:0,p2:3}・つながっているのは 0 と 1: 候補は null。1 本目の ＋ でも 2 本目の ＋ でも 参加しない', () => {
    const { router, set, poll } = make(saved(0, 3));
    set(fakePad(0), fakePad(1));
    expect(router.choice()).toEqual({ p1: 0, p2: 3 });
    expect(router.joinCandidate()).toBeNull();
    set(fakePad(0), fakePad(1, { buttons: [START] }));
    expect(poll().joinRequested).toBe(false);
    set(fakePad(0, { buttons: [START] }), fakePad(1));
    expect(poll().joinRequested).toBe(false);
  });
  it('保存 {p1:0,p2:3} で 番号 3 が つながると 候補は 3。その ＋ で 参加の 求め', () => {
    const { router, set, poll } = make(saved(0, 3));
    set(fakePad(0), fakePad(1), fakePad(2), fakePad(3));
    expect(router.joinCandidate()).toBe(3);
    set(fakePad(0), fakePad(1), fakePad(2), fakePad(3, { buttons: [START] }));
    expect(poll().joinRequested).toBe(true);
  });
  it('保存 {p1:0,p2:1}・番号 1 が ぬけていて 3 本目（番号 2）だけ ある: 候補は null。3 本目の ＋ では 参加しない', () => {
    const { router, set, poll } = make(saved(0, 1));
    set(fakePad(0), null, fakePad(2, { buttons: [START] }));
    expect(router.joinCandidate()).toBeNull();
    expect(poll().joinRequested).toBe(false);
  });
});

describe('AC64・AC65: 保存 {p1:null,p2:0}（1 本だけ つないで 2P に 決めた）は ふつうの URL でも 効く', () => {
  const raw = '{"p1":null,"p2":0}';
  it('番号 0 が 候補。その ＋ で 参加の 求めが 出て、1P の スタートメニューは 開かない', () => {
    const { p1, router, set, poll } = make({ [PAD_CHOICE_KEY]: raw });
    set(fakePad(0));
    expect(router.joinCandidate()).toBe(0);
    set(fakePad(0, { buttons: [START] }));
    expect(poll().joinRequested).toBe(true);
    expect(p1.isHeld('openStartMenu')).toBe(false);
  });
});

describe('AC64: 参加の 求めの 出かた', () => {
  it('2 本目の ＋ を 押しつづけても 求めは 最初の 1 回だけ', () => {
    const { set, poll } = make();
    set(fakePad(0), fakePad(1, { buttons: [START] }));
    expect(poll().joinRequested).toBe(true);
    expect(poll().joinRequested).toBe(false);
    expect(poll().joinRequested).toBe(false);
  });
  it('世界が 止まっている あいだ（active = false）に 押して はなした ＋ は 参加に ならない', () => {
    const { set, poll } = make();
    set(fakePad(0), fakePad(1, { buttons: [START] }));
    expect(poll(false).joinRequested).toBe(false);
    set(fakePad(0), fakePad(1));
    expect(poll(false).joinRequested).toBe(false);
    expect(poll(true).joinRequested).toBe(false);
  });
  it('参加したら 2 本目の 左スティックは 2P の ActionState に だけ 入る（1P は 動かない）', () => {
    const { p1, p2, router, set, poll } = make();
    set(fakePad(0), fakePad(1, { buttons: [START] }));
    expect(poll().joinRequested).toBe(true);
    router.setJoined(true);
    set(fakePad(0), fakePad(1));
    poll();
    set(fakePad(0), fakePad(1, { axes: STICK_UP }));
    poll();
    expect(p2.isHeld('moveForward')).toBe(true);
    expect(p1.isHeld('moveForward')).toBe(false);
  });
});
