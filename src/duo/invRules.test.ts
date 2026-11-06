import { describe, expect, it } from 'vitest';
import { ACTIONS, type Action } from '../input/actions';
import {
  duoInvSnapshot,
  duoPageOf,
  invAccepts,
  invCloseReason,
  invLayoutFor,
  invPadCommand,
  invQuitHeld,
  type InvLayout,
  type InvSource,
} from './invRules';
import { DuoSession, type DuoStepInput } from './session';
import { P2State } from './p2State';
import { DUO_TUNING } from './tuning';

/**
 * COOP-1 4a（docs/design/COOP-1.md §3.3・§12.0、AC75・AC77・AC78・AC79・AC89）の 先行テスト（赤）。2 人用 もちもの・クラフト画面の 「決まり」だけを 見る
 * （DOM の 出し入れ・見た目は E2E〔e2e/duoInv.spec.ts〕と UI 検査）。
 *
 * ---- 開発への つなぎ目の 約束（新しい ファイル src/duo/invRules.ts。DOM を 使わない 関数だけ）----
 *   type InvLayout = 'full' | 'duo'                          画面の 形（`#inventory-screen` の `data-layout` は 'duo' の ときだけ 付く。'full' は 付けない）
 *   type FullPage  = 'items' | 'craft' | 'furnace' | 'storage' | 'achievements' | 'log'
 *                                                             1P の 全面が 今 見せている ページ（タブ「もちもの／じっせき／できごと」と 右の「つくる／やく／たんす」）
 *   type DuoInvPage = 'items' | 'craft' | 'furnace' | 'tansu'  2 人用 画面の ページ（`data-page`・`duo.inv(who).page`）
 *   invLayoutFor({ joined, open, current }): InvLayout
 *       joined（2P が いる）→ いつも 'duo'（開いている 途中で 参加した ときも その ステップで 'duo'。AC79）。
 *       いない → 開いている あいだは current の まま（2P が いなくなっても とじるまで 半分。AC79）、とじていれば 'full'（つぎに 開く ときから 全面）。
 *   duoPageOf(full: FullPage): DuoInvPage                    全面 → 2 人用。items・craft・furnace は そのまま、storage → 'tansu'、achievements・log → 'items'（じっせき・できごと は 2 人用に ない）
 *   duoInvSnapshot({ layout, open, page, focus }): { open, page, focus }
 *                                                             `duo.inv(who)` の 値。layout が 'full'（1 人の 全面）か とじていれば { open: false, page: null, focus: null }。
 *   invAccepts(panel: 1 | 2, src: InvSource): boolean         その 画面が その 入力を うけるか。
 *       InvSource = { device: 'mouse' } | { device: 'key' } | { device: 'pad'; player: 1 | 2 }。マス・タブ・つくる の クリック／ダブルクリック／ドラッグ／ツールチップも 同じ。
 *   invPadCommand(action: Action): 'up' | 'down' | 'left' | 'right' | 'press' | 'close' | null
 *                                                             開いている 2 人用 画面を パッドで うごかす Action の 表。focusUp〜focusRight・confirm・closeMenu だけ。ほかは null。
 *   invQuitHeld({ open, focus, confirmHeld }): boolean        `DuoSession.step` の `quitHeld` に わたす 値。画面が 開いていて、えらびが「やめる」（`duo.inv(2).focus === 'quit'`）で、confirm を 押している ときだけ true。
 *   invCloseReason(who: 1 | 2, { down, padLost, left }): 'left' | 'down' | 'padLost' | null
 *                                                             その 人の パネルを その ステップで とじる 理由。
 *                                                             2P: やめた（left）→ 'left'、倒れた（down）→ 'down'、パッドが ぬけた（padLost）→ 'padLost'（この 順）。
 *                                                             1P: 倒れた → 'down' だけ。1P の パッドが ぬけても（padLost）null（キー・マウスで つづく）。1P には「やめた」が ない。
 *   配線（wireDuo）: 毎ステップ invLayoutFor で 1P の 画面の 形を きめ、invCloseReason が null でなければ その人の パネルを とじる（手に もっている 物は invClose.ts〔invClose.test.ts〕）。
 *   足りない 口: 仕様 §12.0 の 表に 上の 関数名は いらない（内側の 約束）。
 */

describe('AC75・AC79: 画面の 形（data-layout）', () => {
  const next = (layout: InvLayout, joined: boolean, open: boolean): InvLayout => invLayoutFor({ joined, open, current: layout });

  it('2P が いなければ 開いても 全面（data-layout なし）', () => {
    expect(next('full', false, true)).toBe('full');
    expect(next('full', false, false)).toBe('full');
  });
  it('2P が いれば 開いた 画面は 2 人用（1P も 2P も）', () => {
    expect(next('full', true, true)).toBe('duo');
    expect(next('full', true, false)).toBe('duo'); // 開く 前から 形は 2 人用に そなえる
  });
  it('1P の 全面が 開いている ときに 2P が 参加すると、その ステップで 2 人用に かわる', () => {
    let layout: InvLayout = 'full';
    layout = next(layout, false, true); // 全面を 開いている
    expect(layout).toBe('full');
    layout = next(layout, true, true); // 参加した ステップ
    expect(layout).toBe('duo');
  });
  it('2P が いなくなっても 開いている あいだは 半分の まま。とじた つぎから 全面', () => {
    let layout: InvLayout = 'duo';
    layout = next(layout, false, true); // 2P が やめた。まだ 開いている
    expect(layout).toBe('duo');
    layout = next(layout, false, true);
    expect(layout).toBe('duo');
    layout = next(layout, false, false); // とじた
    expect(layout).toBe('full');
  });
});

describe('AC79: 参加と 重なった とき ページが 引きつがれる', () => {
  it('つくる・もちもの（・4c の やく）は そのまま。たんす は 2 人用の たんす', () => {
    expect(duoPageOf('craft')).toBe('craft');
    expect(duoPageOf('items')).toBe('items');
    expect(duoPageOf('furnace')).toBe('furnace');
    expect(duoPageOf('storage')).toBe('tansu');
  });
  it('じっせき・できごと は 2 人用に ないので「もちもの」', () => {
    expect(duoPageOf('achievements')).toBe('items');
    expect(duoPageOf('log')).toBe('items');
  });
});

describe('AC75・§12.0: duo.inv(who) の 値', () => {
  it('2 人用で 開いている → { open: true, page, focus }', () => {
    expect(duoInvSnapshot({ layout: 'duo', open: true, page: 'items', focus: 'slot:0' })).toEqual({ open: true, page: 'items', focus: 'slot:0' });
    expect(duoInvSnapshot({ layout: 'duo', open: true, page: 'craft', focus: null })).toEqual({ open: true, page: 'craft', focus: null });
  });
  it('とじている・1 人の 全面（who 1 でも）は { open: false, page: null, focus: null }', () => {
    const none = { open: false, page: null, focus: null };
    expect(duoInvSnapshot({ layout: 'duo', open: false, page: 'craft', focus: 'tab:craft' })).toEqual(none);
    expect(duoInvSnapshot({ layout: 'full', open: true, page: 'items', focus: 'slot:0' })).toEqual(none);
  });
});

describe('AC77: だれが 動かすか', () => {
  const mouse: InvSource = { device: 'mouse' };
  const key: InvSource = { device: 'key' };
  const pad = (player: 1 | 2): InvSource => ({ device: 'pad', player });

  it('1P の 画面: 1P の キー・マウス・パッド。2P の パッドは うけない', () => {
    expect(invAccepts(1, mouse)).toBe(true);
    expect(invAccepts(1, key)).toBe(true);
    expect(invAccepts(1, pad(1))).toBe(true);
    expect(invAccepts(1, pad(2))).toBe(false);
  });
  it('2P の 画面: 2P の パッド だけ。マウス（ダブルクリック・ドラッグ・ツールチップ）も キーも うけない', () => {
    expect(invAccepts(2, pad(2))).toBe(true);
    expect(invAccepts(2, mouse)).toBe(false);
    expect(invAccepts(2, key)).toBe(false);
    expect(invAccepts(2, pad(1))).toBe(false);
  });

  it('パッドの 動かし方: 十字・けってい・とじる の 6 つ だけ（L/R・Y・ほかは メニュー中は 何も しない）', () => {
    expect(invPadCommand('focusUp')).toBe('up');
    expect(invPadCommand('focusDown')).toBe('down');
    expect(invPadCommand('focusLeft')).toBe('left');
    expect(invPadCommand('focusRight')).toBe('right');
    expect(invPadCommand('confirm')).toBe('press');
    expect(invPadCommand('closeMenu')).toBe('close');
    const used: Action[] = ['focusUp', 'focusDown', 'focusLeft', 'focusRight', 'confirm', 'closeMenu'];
    for (const a of ACTIONS) if (!used.includes(a)) expect(invPadCommand(a), a).toBeNull();
  });
});

describe('AC78: やめる（duo-quit）は 十字で えらんで confirm を 2 秒（120 ステップ）', () => {
  const idle: DuoStepInput = { padPresent: true, quitHeld: false };
  function make() {
    const left: string[] = [];
    const session = new DuoSession({ p2: new P2State(), saveP2: () => undefined, loadP2: () => null, onLeft: (r) => left.push(r) });
    session.join();
    return { session, left };
  }
  /** 毎ステップ: 画面の 状態から quitHeld を つくって session に わたす（配線と 同じ） */
  const hold = (s: DuoSession, n: number, state: { open: boolean; focus: string | null; confirmHeld: boolean }): void => {
    for (let i = 0; i < n; i++) s.step({ padPresent: true, quitHeld: invQuitHeld(state) });
  };
  const onQuit = { open: true, focus: 'quit', confirmHeld: true };

  it('時間は 表から（120 ステップ）', () => {
    expect(DUO_TUNING.quitHoldSteps).toBe(120);
  });
  it('「やめる」を えらんで 120 ステップ 押しつづけると 2P が いなくなる', () => {
    const { session, left } = make();
    hold(session, 119, onQuit);
    expect(session.joined).toBe(true);
    hold(session, 1, onQuit);
    expect(session.joined).toBe(false);
    expect(left).toEqual(['quit']);
  });
  it('119 ステップで はなすと ゲージは 0、2P は いるまま', () => {
    const { session } = make();
    hold(session, 119, onQuit);
    expect(session.quitGauge()).toBeGreaterThan(0.9);
    session.step(idle);
    expect(session.quitGauge()).toBe(0);
    expect(session.joined).toBe(true);
  });
  it('マス・つくる・タブ・✕ の 上で confirm を 300 ステップ 押しつづけても やめない', () => {
    for (const focus of ['slot:0', 'equip:head', 'tile:wood_pickaxe', 'craft', 'page-next', 'tab:craft', 'tab:items', 'close']) {
      const { session } = make();
      hold(session, 300, { open: true, focus, confirmHeld: true });
      expect(session.joined, focus).toBe(true);
      expect(session.quitGauge(), focus).toBe(0);
    }
  });
  it('画面が とじていれば（えらびが 残っていても）やめない。confirm を はなしていても やめない', () => {
    expect(invQuitHeld({ open: false, focus: 'quit', confirmHeld: true })).toBe(false);
    expect(invQuitHeld({ open: true, focus: 'quit', confirmHeld: false })).toBe(false);
    expect(invQuitHeld({ open: true, focus: null, confirmHeld: true })).toBe(false);
    const { session } = make();
    hold(session, 300, { open: false, focus: 'quit', confirmHeld: true });
    expect(session.joined).toBe(true);
  });
});

describe('AC89: とじる とき（その人が 倒れた・2P の パッドが ぬけた・2P が やめた）', () => {
  const none = { down: false, padLost: false, left: false };

  it('なにも なければ とじない', () => {
    expect(invCloseReason(1, none)).toBeNull();
    expect(invCloseReason(2, none)).toBeNull();
  });
  it('その人が 倒れた ステップに その人の パネルが とじる（2P も 1P も）', () => {
    expect(invCloseReason(1, { ...none, down: true })).toBe('down');
    expect(invCloseReason(2, { ...none, down: true })).toBe('down');
  });
  it('2P の パッドが ぬけた ステップに 2P の パネルが とじる', () => {
    expect(invCloseReason(2, { ...none, padLost: true })).toBe('padLost');
  });
  it('1P の パッドが ぬけても 1P の パネルは とじない（キー・マウスで つづく）', () => {
    expect(invCloseReason(1, { ...none, padLost: true })).toBeNull();
  });
  it('2P が やめた ステップに 2P の パネルは 消える。1P の パネルは そのまま', () => {
    expect(invCloseReason(2, { ...none, left: true })).toBe('left');
    expect(invCloseReason(1, { ...none, left: true })).toBeNull();
  });
  it('2P が パッドぬけで 60 秒 たって やめた とき 理由は「やめた」（消える）', () => {
    expect(invCloseReason(2, { down: false, padLost: true, left: true })).toBe('left');
  });
});
