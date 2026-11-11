import { describe, expect, it } from 'vitest';
import type { Action } from '../../input/actions';
import { createHouseGate, createModalOwner, createBookInput, type ModalOwnerDeps, type ModalSource } from './modalOwner';

/**
 * COOP-1 5d（docs/design/COOP-1.md 1.15 §3.7 (e)・§8 の 5d の つなぎ目・§10・§12.0）: 「開いた 人」（本・建築士さんの メニューを 開いた 人）の
 * 持ち主と、入力の ふりわけ、「ちょっと まってね」の 行き先。AC140・AC161・AC162・AC167・AC142／AC146（1 人の ときは かわらない）。
 * 実装の 前に 書いた 赤の テスト。
 *
 * ---- 開発への つなぎ目の 約束（新しい ファイル `src/game/wire/modalOwner.ts`。名前は 開発が かえて よい。かえたら 依頼文と 仕様に 書く）----
 *   export type Who = 1 | 2;
 *   export type ModalSource = 'p1' | 'p2' | 'mouse';   // 1P の キー・パッド（game.input）／ 2P の パッド（p2Actions）／ マウス（画面の ボタン）
 *   export interface ModalOwnerDeps {
 *     joined(): boolean;                          // 2P が いる か
 *     setWait(who: Who, on: boolean): void;       // 「ちょっと まってね」を who の 半分に 出す／消す（DuoNotices.setWait(who, on)）
 *     closeNow(): void;                           // 開いて いる 物を その ステップで しまう（本は Book.closeNow〔音なし〕、建築士さんは house.close()）
 *   }
 *   export interface ModalOwner {
 *     get(): Who | null;                          // `duo.modalOwner()` の 中身。開いて いなければ null
 *     claim(who: Who): boolean;                   // 開こうと した 人が 持ち主に なる。もう だれかが 開いて いれば・2P が いない のに who 2 なら false
 *     release(): void;                            // しまった（本の visibleHook・建築士さんの onClose から）。持ち主を はずす
 *     step(padLost: boolean): void;               // 毎ステップ 1 回（毎ステップ 物を 作らない ため 引数は 真偽だけ）: 「ちょっと まってね」の 出し入れ（参加・やめる も ここで 追いつく）と、2P が 持ち主の とき やめた／パッドが ぬけたら closeNow
 *     accepts(src: ModalSource): boolean;         // その 入力を 本・メニューに 通すか（持ち主の 入力と マウス だけ。開いて いない ときは 'p1' だけ 通す〔本が 自分で 無視する。今の まま〕）
 *     menuSource<T>(p1: T, p2: T): T;             // 十字・けってい を 読む ActionState（持ち主が 2P なら p2、それ以外は p1）
 *     padMenu(): boolean;                         // 2 本の パッドを メニューの 割り当て（けってい・もどる・十字）に するか（持ち主が いる あいだ 両方 true）
 *   }
 *   export function createModalOwner(d: ModalOwnerDeps): ModalOwner;
 *   // 建築士さん（game/wire/house.ts）の 取り合い。onOpen で claim し、取れなければ 建築士さんを 閉じる（先に 開いた 人が 勝つ。仕様 §8 5d）。
 *   export function createHouseGate(owner: Pick<ModalOwner, 'claim' | 'release'>, closeHouse: () => void): { onOpen(who: Who): void; onClose(): void };
 *     onOpen(who): owner.claim(who) が false なら closeHouse() を 1 回〔本が 先に 開いて いれば 本が 勝つ〕。onClose(): この 門が 取った ときだけ owner.release()（取れずに 閉じた ときは 本の 持ち主を はずさない）。
 *   // 本の 入力（game/wire/player.ts の Book.onAction の ふりわけ）。1P の game.input.onPress には p1、2P の p2Actions.onPress には p2 を つなぐ。
 *   export function createBookInput(owner: Pick<ModalOwner, 'accepts'>, book: { onAction(a: Action): void }): { p1(a: Action): void; p2(a: Action): void };
 *     持ち主の 入力だけ book.onAction に 同じ Action の まま わたす。AC140: 2P の 十字〔◀▶〕・A・B は 1P の パッドと 同じ はたらき（L／R は 割り当てない）。
 *   `duo.modalOwner()` は get() を そのまま 返す。同じ ステップの 2 人の 申し出は 1P が 先（呼ぶ 順は つなぎ込みで 1P の 入力 → 2P の 入力。ここでは 先に 来た 方が 取る）。
 *   `duoWaitNotice`（src/duo/rules.ts）と その テスト（rules.test.ts）は かえない（2 人の とき 世界が 止まって いるか だけを 返す 関数として のこる）。
 */

// 開発の 直し（型だけ）: joined は 真偽で わたす〔関数の joined を ...over で 上書きして しまわない ように 外す〕
function make({ joined, ...over }: Partial<Omit<ModalOwnerDeps, 'joined'>> & { joined?: boolean } = {}) {
  const state = { joined: joined ?? true };
  const wait: Record<1 | 2, boolean> = { 1: false, 2: false };
  const log: string[] = [];
  const owner = createModalOwner({
    joined: () => state.joined,
    setWait: (who, on) => {
      wait[who] = on;
      log.push(`wait${who}:${on ? 'on' : 'off'}`);
    },
    closeNow: () => {
      log.push('closeNow');
    },
    ...over,
  });
  const tick = (padLost = false): void => owner.step(padLost);
  return { owner, state, wait, log, tick };
}

describe('AC161 開いた 人（modalOwner）', () => {
  it('だれも 開いて いなければ null。1P が 開けば 1、2P が 開けば 2', () => {
    const a = make();
    expect(a.owner.get()).toBeNull();
    expect(a.owner.claim(1)).toBe(true);
    expect(a.owner.get()).toBe(1);
    const b = make();
    expect(b.owner.claim(2)).toBe(true);
    expect(b.owner.get()).toBe(2);
  });

  it('開いて いる あいだ もう 1 人は 開けない。持ち主は かわらない（世界が 止まって いるので 入力が 通らない のと 同じ）', () => {
    const a = make();
    expect(a.owner.claim(1)).toBe(true);
    expect(a.owner.claim(2)).toBe(false);
    expect(a.owner.get()).toBe(1);
    const b = make();
    expect(b.owner.claim(2)).toBe(true);
    expect(b.owner.claim(1)).toBe(false);
    expect(b.owner.get()).toBe(2);
  });

  it('同じ ステップに 2 人が 開こうと したら 先に 呼ばれた 1P が 取り、2P の 押しは 何も しない（呼ぶ 順は 1P → 2P）', () => {
    const { owner, tick, wait } = make();
    const first = owner.claim(1);
    const second = owner.claim(2);
    tick();
    expect([first, second]).toEqual([true, false]);
    expect(owner.get()).toBe(1);
    expect(wait).toEqual({ 1: false, 2: true });
  });

  it('しまうと null に もどり、また どちらでも 開ける', () => {
    const { owner, tick } = make();
    owner.claim(2);
    owner.release();
    tick();
    expect(owner.get()).toBeNull();
    expect(owner.claim(1)).toBe(true);
    expect(owner.get()).toBe(1);
  });

  it('2P が いない のに who 2 は 開けない（持ち主に ならない）', () => {
    const { owner } = make({ joined: false });
    expect(owner.claim(2)).toBe(false);
    expect(owner.get()).toBeNull();
  });

  it('「ちょっと まってね」は 開いて いない 人の 半分に だけ: 1P が 開けば 2P の 半分（duo-wait）、2P が 開けば 1P の 半分（duo-wait-p1）。同時に 2 つ 出ない', () => {
    const a = make();
    a.owner.claim(1);
    a.tick();
    expect(a.wait).toEqual({ 1: false, 2: true });
    const b = make();
    b.owner.claim(2);
    b.tick();
    expect(b.wait).toEqual({ 1: true, 2: false });
  });

  it('しまった 次の ステップで 両方 消える（とじた 次の frame で 消える）', () => {
    const { owner, tick, wait } = make();
    owner.claim(2);
    tick();
    expect(wait[1]).toBe(true);
    owner.release();
    tick();
    expect(wait).toEqual({ 1: false, 2: false });
  });

  it('開いて いる あいだに 2P が 参加すると その ステップから 2P の 半分に 出る。やめると 消える（持ち主が 1P の とき）', () => {
    const { owner, state, wait, tick } = make({ joined: false });
    owner.claim(1);
    tick();
    expect(wait).toEqual({ 1: false, 2: false });
    state.joined = true;
    tick();
    expect(wait).toEqual({ 1: false, 2: true });
    state.joined = false;
    tick();
    expect(wait).toEqual({ 1: false, 2: false });
    expect(owner.get(), '1P の 本は そのまま').toBe(1);
  });
});

describe('AC142・AC146 1 人の とき（2P が いない）は かわらない', () => {
  it('1P が 開く: 持ち主は 1、「ちょっと まってね」は どちらにも 出ない。1P の キー・パッド・マウスは ぜんぶ 通る。2P の 入力は 通らない', () => {
    const { owner, wait, tick } = make({ joined: false });
    expect(owner.claim(1)).toBe(true);
    tick();
    expect(owner.get()).toBe(1);
    expect(wait).toEqual({ 1: false, 2: false });
    expect(owner.accepts('p1')).toBe(true);
    expect(owner.accepts('mouse')).toBe(true);
    expect(owner.accepts('p2')).toBe(false);
  });
});

describe('AC162 入力の 持ち主', () => {
  const SRC: ModalSource[] = ['p1', 'p2', 'mouse'];
  const accepted = (owner: ReturnType<typeof make>['owner']): ModalSource[] => SRC.filter((s) => owner.accepts(s));

  it('持ち主が 2P の あいだ: 1P の キー・パッドは 通らない。2P の パッドと マウスは 通る', () => {
    const { owner } = make();
    owner.claim(2);
    expect(accepted(owner)).toEqual(['p2', 'mouse']);
  });

  it('持ち主が 1P の あいだ: 2P の パッドは 何も しない。1P の キー・パッド・マウスは 通る（今の まま）', () => {
    const { owner } = make();
    owner.claim(1);
    expect(accepted(owner)).toEqual(['p1', 'mouse']);
  });

  it('十字・けってい・もどる を 読む ActionState は 持ち主の 物。2P が 持ち主なら 2P の スロット、それ以外は 1P の スロット', () => {
    const p1 = { slot: 'p1' };
    const p2 = { slot: 'p2' };
    const a = make();
    a.owner.claim(2);
    expect(a.owner.menuSource(p1, p2)).toBe(p2);
    const b = make();
    b.owner.claim(1);
    expect(b.owner.menuSource(p1, p2)).toBe(p1);
    expect(make().owner.menuSource(p1, p2), '開いて いなければ 1P').toBe(p1);
  });

  it('パッドを メニューの 割り当て（けってい・もどる・十字）に するのは 持ち主が いる あいだ だけ（両方の パッドが 遊びの ボタンに ならない）', () => {
    const { owner } = make();
    expect(owner.padMenu()).toBe(false);
    owner.claim(2);
    expect(owner.padMenu()).toBe(true);
    owner.release();
    expect(owner.padMenu()).toBe(false);
  });
});

describe('AC167 とじる とき', () => {
  it('持ち主が 2P の あいだに 2P が やめた（joined が false）: その ステップで closeNow が 1 回、持ち主は null、「ちょっと まってね」は 消える', () => {
    const { owner, state, tick, log, wait } = make();
    owner.claim(2);
    tick();
    state.joined = false;
    tick();
    expect(log.filter((l) => l === 'closeNow')).toHaveLength(1);
    expect(owner.get()).toBeNull();
    expect(wait).toEqual({ 1: false, 2: false });
    tick();
    expect(log.filter((l) => l === 'closeNow'), '2 回 目は 呼ばない').toHaveLength(1);
  });

  it('持ち主が 2P の あいだに 2P の パッドが ぬけた（padLost）: その ステップで closeNow が 1 回、持ち主は null', () => {
    const { owner, tick, log } = make();
    owner.claim(2);
    tick(true);
    expect(log.filter((l) => l === 'closeNow')).toHaveLength(1);
    expect(owner.get()).toBeNull();
  });

  it('持ち主が 1P の あいだに 2P の パッドが ぬけても とじない（持ち主は 1P の まま）', () => {
    const { owner, tick, log } = make();
    owner.claim(1);
    tick(true);
    expect(log).not.toContain('closeNow');
    expect(owner.get()).toBe(1);
  });

  it('持ち主が 1P の あいだに 2P が やめても とじない', () => {
    const { owner, state, tick, log } = make();
    owner.claim(1);
    tick();
    state.joined = false;
    tick();
    expect(log).not.toContain('closeNow');
    expect(owner.get()).toBe(1);
  });

  it('開いて いなければ padLost でも やめても closeNow は 呼ばない', () => {
    const { owner, state, tick, log } = make();
    tick(true);
    state.joined = false;
    tick();
    expect(log).not.toContain('closeNow');
    expect(owner.get()).toBeNull();
  });
});

describe('建築士さんの 取り合い（createHouseGate）', () => {
  function gate(over: { claim?: boolean } = {}) {
    const log: string[] = [];
    const owner = { claim: (w: 1 | 2) => (log.push(`claim${w}`), over.claim ?? true), release: () => void log.push('release') };
    const g = createHouseGate(owner, () => void log.push('closeHouse'));
    return { g, log };
  }
  it('取れれば そのまま（閉じない）。閉じた とき owner を はずす', () => {
    const { g, log } = gate();
    g.onOpen(2);
    g.onClose();
    expect(log).toEqual(['claim2', 'release']);
  });
  it('ふきだしの あいだに もう 1 人が 本を 開いて いた（claim が false）: 建築士さんを 閉じる。閉じた ときは 本の 持ち主を はずさない', () => {
    const { g, log } = gate({ claim: false });
    g.onOpen(2);
    expect(log).toEqual(['claim2', 'closeHouse']);
    g.onClose();
    expect(log, '本の 持ち主は そのまま').toEqual(['claim2', 'closeHouse']);
  });
  it('実物の 持ち主と: 本を 1P が 開いて いる 間に 2P の 建築士さんの メニューが 開こうと しても 持ち主は 1P の まま', () => {
    const o = make().owner;
    o.claim(1);
    let closed = 0;
    const g = createHouseGate(o, () => void closed++);
    g.onOpen(2);
    g.onClose();
    expect(closed).toBe(1);
    expect(o.get()).toBe(1);
  });
});

describe('AC140 本の 入力の ふりわけ（createBookInput）', () => {
  function input(ownerWho: 1 | 2 | null) {
    const { owner } = make();
    if (ownerWho) owner.claim(ownerWho);
    const got: Action[] = [];
    const bi = createBookInput(owner, { onAction: (a) => void got.push(a) });
    return { bi, got };
  }
  it('持ち主が 2P: 2P の パッドの 十字◀▶・B は 本へ わたる。1P の キー・パッド（Q／E・Esc・Backspace）は わたらない', () => {
    const { bi, got } = input(2);
    for (const a of ['pagePrev', 'pageNext', 'closeMenu', 'bookBack'] as Action[]) bi.p1(a);
    expect(got).toEqual([]);
    for (const a of ['pagePrev', 'pageNext', 'closeMenu'] as Action[]) bi.p2(a);
    expect(got).toEqual(['pagePrev', 'pageNext', 'closeMenu']);
  });
  it('持ち主が 1P: 1P の 入力は わたる。2P の パッドは 何も しない', () => {
    const { bi, got } = input(1);
    bi.p2('pageNext');
    expect(got).toEqual([]);
    bi.p1('pageNext');
    expect(got).toEqual(['pageNext']);
  });
  it('だれも 開いて いない: 1P の 入力は 今まで どおり わたす（本が 自分で 無視する）。2P は わたさない', () => {
    const { bi, got } = input(null);
    bi.p2('closeMenu');
    expect(got).toEqual([]);
    bi.p1('closeMenu');
    expect(got).toEqual(['closeMenu']);
  });
});
