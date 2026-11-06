import { describe, expect, it } from 'vitest';
import { ActionState } from '../actions';
import { AlwaysLook } from './reader';
import { DuoPadRouter } from './duoPads';
import { PAD_CHOICE_KEY } from './padChoice';
import { PadPicker } from '../../ui/settings/padPicker';
import { FakeStorage, fakePad } from './testPad';

/**
 * COOP-1 作業 2.5（#401。docs/design/COOP-1.md §2.7・§12.0）の 先行テスト（赤）。AC48（ルーター側）・AC50・AC52・AC53・AC54・AC55・AC57・AC58・AC61（→ 作業 3d で AC65 に かわった）。
 * ルーターの 新しい 口は src/input/gamepad/duoPads.ts の setChoice / choice / effectiveChoice / padIndex / setPicking（型だけの スタブ）。
 * 画面の 決まり（待ち・光る）は src/ui/settings/padPicker.test.ts。
 */

const START = 9;
const ZR = 7;
const STICK_UP = [0, -1, 0, 0];

function make(opts: { init?: Record<string, string>; storage?: FakeStorage } = {}) {
  const p1 = new ActionState();
  const p2 = new ActionState();
  const look1 = new AlwaysLook();
  const look2 = new AlwaysLook();
  const storage = opts.storage ?? new FakeStorage(opts.init ?? {});
  const router = new DuoPadRouter({ p1, p2, look1, look2, storage: null, choiceStorage: storage, choiceEnabled: true });
  let pads: (Gamepad | null)[] = [];
  router.getPads = () => pads;
  const set = (...p: (Gamepad | null)[]) => {
    pads = p;
  };
  let t = 0;
  const poll = () => router.poll((t += 16));
  return { p1, p2, look1, look2, router, storage, set, poll };
}

const held = (a: ActionState) => (['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump', 'primary', 'secondary', 'toggleInventory', 'openStartMenu'] as const).filter((x) => a.isHeld(x));
const saved = (st: FakeStorage) => JSON.parse(st.data.get(PAD_CHOICE_KEY) ?? 'null');

describe('AC48: こわれた 保存でも はじめの 動き（エラーなし・書きかえなし）', () => {
  const raws = [null, 'not json{', '{"p1":4,"p2":0}', '{"p1":1,"p2":1}', '{"p1":null,"p2":null}', '"x"'];
  for (const raw of raws) {
    it(`保存 ${String(raw)} → choice() null、効くのは 1P=0・2P=1`, () => {
      const m = make({ init: raw === null ? {} : { [PAD_CHOICE_KEY]: raw } });
      m.set(fakePad(0), fakePad(1));
      m.poll();
      expect(m.router.choice()).toBeNull();
      expect(m.router.effectiveChoice()).toEqual({ p1: 0, p2: 1 });
      expect(m.router.padIndex(1)).toBe(0);
      expect(m.storage.writes).toBe(0);
      if (raw !== null) expect(m.storage.data.get(PAD_CHOICE_KEY)).toBe(raw);
    });
  }
  it('localStorage が 投げても 動く', () => {
    const m = make({ storage: new FakeStorage({}, { get: true, set: true }) });
    m.set(fakePad(0), fakePad(1));
    expect(() => m.poll()).not.toThrow();
    expect(m.router.choice()).toBeNull();
    expect(m.router.effectiveChoice()).toEqual({ p1: 0, p2: 1 });
  });
});

describe('AC50・AC52: 決める → 保存して すぐ 効く（この 機械に 1 つ・決めた ときだけ 書く）', () => {
  it('setChoice({p1:1,p2:0}): 保存は §9.6 の 形。同じ ステップから 番号 1 で 1P が 動く。2P は 参加していないので padIndex(2) は null', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.poll();
    expect(m.storage.writes, '決めるまで 書かない').toBe(0);
    expect(m.router.setChoice({ p1: 1, p2: 0 })).toBe(true);
    expect(saved(m.storage)).toEqual({ p1: 1, p2: 0 });
    expect(m.storage.writes).toBe(1);
    m.set(fakePad(0), fakePad(1, { axes: STICK_UP }));
    m.poll();
    expect(m.router.choice()).toEqual({ p1: 1, p2: 0 });
    expect(m.router.padIndex(1)).toBe(1);
    expect(m.router.padIndex(2)).toBeNull();
    expect(m.p1.isHeld('moveForward')).toBe(true);
  });

  it('読みなおし（べつの ルーターに 同じ storage）でも {p1:1,p2:0}', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.router.setChoice({ p1: 1, p2: 0 });
    const again = make({ storage: m.storage });
    again.set(fakePad(0), fakePad(1));
    again.poll();
    expect(again.router.choice()).toEqual({ p1: 1, p2: 0 });
    expect(again.router.padIndex(1)).toBe(1);
  });

  it('変な 値は false で 何も かえない・書かない（番号が 整数 0〜3 でない・同じ・両方 null）', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.router.setChoice({ p1: 1, p2: 0 });
    const w = m.storage.writes;
    const bad: PadChoiceLike[] = [
      { p1: 4, p2: 0 },
      { p1: -1, p2: 0 },
      { p1: 0.5, p2: 1 },
      { p1: 1, p2: 1 },
      { p1: null, p2: null },
      { p1: Number.NaN, p2: 1 },
    ];
    for (const c of bad) expect(m.router.setChoice(c), JSON.stringify(c)).toBe(false);
    expect(m.storage.writes).toBe(w);
    expect(m.router.choice()).toEqual({ p1: 1, p2: 0 });
  });

  it('つながっていない 番号でも 決められる（0〜3）', () => {
    const m = make();
    m.set(fakePad(0));
    expect(m.router.setChoice({ p1: 0, p2: 3 })).toBe(true);
    expect(m.router.choice()).toEqual({ p1: 0, p2: 3 });
  });

  it('この 機械の 1 つの キーだけを 使う（世界の セーブには 入れない）', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.router.setChoice({ p1: 1, p2: 0 });
    expect([...m.storage.data.keys()]).toEqual([PAD_CHOICE_KEY]);
  });
});

type PadChoiceLike = { p1: number | null; p2: number | null };

/**
 * 作業 3d（#418）: AC61（ふつうの URL では 保存を 読まない）は AC65 に かわった。ふつうの URL でも 保存を 読み、setChoice も 効く。
 * `choiceEnabled` を わたさない（ふつうの URL と 同じ）。`choiceEnabled` / `choiceUsable()` は けす 約束（duoPadsProd.test.ts の 頭）。
 */
describe('AC65: ふつうの URL でも 保存を 読む・書く（choiceEnabled を わたさない）', () => {
  function makeProd(init: Record<string, string> = {}) {
    const p1 = new ActionState();
    const p2 = new ActionState();
    const storage = new FakeStorage(init);
    const router = new DuoPadRouter({ p1, p2, look1: new AlwaysLook(), look2: new AlwaysLook(), storage: null, choiceStorage: storage });
    let pads: (Gamepad | null)[] = [];
    router.getPads = () => pads;
    let t = 0;
    return {
      p1,
      p2,
      router,
      storage,
      set: (...p: (Gamepad | null)[]) => {
        pads = p;
      },
      poll: () => router.poll((t += 16)),
    };
  }

  it('保存に {"p1":null,"p2":0} が あれば それが 効く: 番号 0 の 左スティックで 1P は 動かず、番号 0 の ＋ で 参加の 求め。保存は 消さない', () => {
    const raw = '{"p1":null,"p2":0}';
    const m = makeProd({ [PAD_CHOICE_KEY]: raw });
    m.set(fakePad(0, { axes: STICK_UP }));
    m.router.bootstrap();
    m.poll();
    expect(m.router.choice()).toEqual({ p1: null, p2: 0 });
    expect(m.router.effectiveChoice()).toEqual({ p1: null, p2: 0 });
    expect(m.p1.isHeld('moveForward')).toBe(false);
    expect(m.router.padIndex(1)).toBeNull();
    m.set(fakePad(0, { buttons: [START] }));
    expect(m.poll().joinRequested).toBe(true);
    expect(m.p1.isHeld('openStartMenu'), '2P の ＋ は 1P の スタートメニューに ならない').toBe(false);
    expect(m.storage.data.get(PAD_CHOICE_KEY)).toBe(raw);
    expect(m.storage.writes).toBe(0);
  });
  it('参加したあと 番号 0 の 左スティックで 2P だけ 動く', () => {
    const m = makeProd({ [PAD_CHOICE_KEY]: '{"p1":null,"p2":0}' });
    m.set(fakePad(0));
    m.router.bootstrap();
    m.poll();
    m.router.setJoined(true);
    m.set(fakePad(0, { axes: STICK_UP }));
    m.poll();
    expect(m.p2.isHeld('moveForward')).toBe(true);
    expect(m.p1.isHeld('moveForward')).toBe(false);
    expect(m.router.padIndex(2)).toBe(0);
    expect(m.router.padIndex(1)).toBeNull();
  });
  it('こわれた 保存は はじめの 動き（AC48 と 同じ）: 書きかえない', () => {
    const m = makeProd({ [PAD_CHOICE_KEY]: '{"p1":1,"p2":1}' });
    m.set(fakePad(0), fakePad(1));
    m.poll();
    expect(m.router.choice()).toBeNull();
    expect(m.router.effectiveChoice()).toEqual({ p1: 0, p2: 1 });
    expect(m.storage.data.get(PAD_CHOICE_KEY)).toBe('{"p1":1,"p2":1}');
  });
  it('setChoice は 効く: true を 返し、この 機械の キーに 保存して すぐ 割り当てが かわる', () => {
    const m = makeProd();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    expect(m.router.setChoice({ p1: 1, p2: 0 })).toBe(true);
    expect(m.storage.writes).toBe(1);
    expect(saved(m.storage)).toEqual({ p1: 1, p2: 0 });
    expect(m.router.padIndex(1)).toBe(1);
    expect(m.router.choice()).toEqual({ p1: 1, p2: 0 });
  });
  it('setChoice({p1:null,p2:0})（1 本だけ つないで 2P に 決める）も 効く', () => {
    const m = makeProd();
    m.set(fakePad(0));
    expect(m.router.setChoice({ p1: null, p2: 0 })).toBe(true);
    expect(saved(m.storage)).toEqual({ p1: null, p2: 0 });
    expect(m.router.padIndex(1)).toBeNull();
  });
});

describe('AC53: 通し（setChoice({p1:1,p2:0}): 番号 1 が 1P、番号 0 の ＋ で 2P が 参加、番号 0 で 2P だけ 動く）', () => {
  it('1P → 参加 → 2P', () => {
    const { router, set, poll, p1, p2 } = make();
    set(fakePad(0), fakePad(1));
    poll();
    expect(router.setChoice({ p1: 1, p2: 0 })).toBe(true);
    set(fakePad(0), fakePad(1, { axes: STICK_UP }));
    poll();
    expect(p1.isHeld('moveForward')).toBe(true);
    expect(held(p2)).toEqual([]);
    expect(router.padIndex(1)).toBe(1);
    set(fakePad(0, { buttons: [START] }), fakePad(1));
    expect(poll().joinRequested, '番号 0 の ＋ の 最初の 押し').toBe(true);
    expect(poll().joinRequested, '押しっぱなしは 1 回だけ').toBe(false);
    set(fakePad(0), fakePad(1));
    poll();
    set(fakePad(0, { buttons: [START] }), fakePad(1));
    expect(poll().joinRequested).toBe(true);
    expect(p1.isHeld('openStartMenu'), '2P の ＋ は 1P の スタートメニューに ならない').toBe(false);
    router.setJoined(true);
    set(fakePad(0), fakePad(1));
    poll();
    set(fakePad(0, { axes: STICK_UP }), fakePad(1));
    poll();
    expect(p2.isHeld('moveForward')).toBe(true);
    expect(held(p1)).toEqual([]);
    expect(router.padIndex(1)).toBe(1);
    expect(router.padIndex(2)).toBe(0);
  });
});

describe('AC54: 1P の パッドなし（前の pad=2p）', () => {
  it('1 本だけ つないで それを 2P に 決める → 1P は パッドなし。どの パッドでも 1P は 動かず、スタートメニューも 開かない。その ＋ で 2P が 参加', () => {
    const { router, set, poll, p1, p2 } = make();
    set(fakePad(0));
    router.bootstrap();
    expect(router.setChoice({ p1: null, p2: 0 })).toBe(true);
    poll();
    set(fakePad(0, { axes: STICK_UP, buttons: [ZR] }));
    poll();
    expect(held(p1)).toEqual([]);
    expect(router.padIndex(1)).toBeNull();
    set(fakePad(0));
    poll();
    set(fakePad(0, { buttons: [START] }));
    const r = poll();
    expect(r.joinRequested).toBe(true);
    expect(p1.isHeld('openStartMenu')).toBe(false);
    router.setJoined(true);
    set(fakePad(0));
    poll();
    set(fakePad(0, { axes: STICK_UP, buttons: [ZR] }));
    poll();
    expect(p2.isHeld('moveForward')).toBe(true);
    expect(p2.isHeld('primary')).toBe(true);
    expect(held(p1)).toEqual([]);
    expect(router.padIndex(2)).toBe(0);
  });

  it('キー入力は 1P に 入る（パッドなしでも）', () => {
    const { router, set, poll, p1 } = make();
    set(fakePad(0));
    router.setChoice({ p1: null, p2: 0 });
    p1.press('moveForward');
    poll();
    expect(p1.isHeld('moveForward')).toBe(true);
  });

  it('1P が パッドなしの とき、2P の パッド以外は むし（3 本目と 同じ）', () => {
    const { router, set, poll, p1 } = make();
    set(fakePad(0), fakePad(1, { buttons: [START] }));
    router.setChoice({ p1: null, p2: 0 });
    expect(poll().joinRequested).toBe(false);
    expect(held(p1)).toEqual([]);
    expect(router.ignoredPadIndexes()).toEqual([1]);
  });
});

describe('AC55: 1 本のときの かわり（2P が いない・1P の 物が つながっていない・2P の 物だけ ある）', () => {
  function sub() {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.router.setChoice({ p1: 0, p2: 1 });
    return m;
  }

  it('2P の 物で 1P が 動く。padIndex(1) は その 番号。その ＋ は スタートメニュー（参加しない）', () => {
    const { router, set, poll, p1 } = sub();
    set(null, fakePad(1, { axes: STICK_UP }));
    poll();
    expect(p1.isHeld('moveForward')).toBe(true);
    expect(router.padIndex(1)).toBe(1);
    set(null, fakePad(1, { buttons: [START] }));
    const r = poll();
    expect(r.joinRequested).toBe(false);
    expect(p1.isHeld('openStartMenu')).toBe(true);
  });

  it('1P の 物が つながると そのステップに かわりの 入力が 全部 はなれ、1P は つながった 物で 動く', () => {
    const { router, set, poll, p1 } = sub();
    set(null, fakePad(1, { axes: STICK_UP, buttons: [ZR] }));
    poll();
    expect(p1.isHeld('primary')).toBe(true);
    set(fakePad(0), fakePad(1, { axes: STICK_UP, buttons: [ZR] }));
    poll();
    expect(held(p1)).toEqual([]);
    expect(router.padIndex(1)).toBe(0);
    set(fakePad(0, { axes: STICK_UP }), fakePad(1));
    poll();
    expect(p1.isHeld('moveForward')).toBe(true);
  });

  it('1P が パッドなしに 決まっている とき（{p1:null,p2:1}）は かわりを しない', () => {
    const { router, set, poll, p1 } = make();
    set(null, fakePad(1, { axes: STICK_UP }));
    router.setChoice({ p1: null, p2: 1 });
    poll();
    expect(held(p1)).toEqual([]);
    expect(router.padIndex(1)).toBeNull();
  });

  it('2P が 参加したら かわりは おわる（その 物は 2P の パッド）', () => {
    const { router, set, poll, p1, p2 } = sub();
    set(null, fakePad(1, { axes: STICK_UP }));
    poll();
    router.setJoined(true);
    set(null, fakePad(1));
    poll();
    set(null, fakePad(1, { axes: STICK_UP }));
    poll();
    expect(p2.isHeld('moveForward')).toBe(true);
    expect(p1.isHeld('moveForward')).toBe(false);
    expect(router.padIndex(1)).toBeNull();
    expect(router.padIndex(2)).toBe(1);
  });
});

describe('AC57: 2P が 参加中に 決める（2P は やめない）', () => {
  function joined() {
    const m = make();
    m.set(fakePad(0), fakePad(1), fakePad(2));
    m.poll();
    m.router.setChoice({ p1: 0, p2: 1 });
    m.router.setJoined(true);
    m.set(fakePad(0), fakePad(1, { buttons: [ZR], axes: STICK_UP }), fakePad(2));
    m.poll();
    return m;
  }

  it('2P の 物が かわる: そのステップに 2P の 入力が 全部 はなれ、新しい 物の ボタンを 全部 はなすまで 2P は ボタンを 受けない。はなして 押しなおすと 動く', () => {
    const { router, set, poll, p2 } = joined();
    expect(p2.isHeld('primary')).toBe(true);
    expect(router.setChoice({ p1: 0, p2: 2 })).toBe(true);
    // 最初の poll から 新しい 物（番号 2）は ZR を 押したまま。古い 物（番号 1）は 押したまま
    set(fakePad(0), fakePad(1, { buttons: [ZR], axes: STICK_UP }), fakePad(2, { buttons: [ZR] }));
    poll();
    expect(p2.isHeld('primary'), '古い 入力は はなれ、新しい 物の ボタンは はなすまで 受けない').toBe(false);
    expect(router.padIndex(2)).toBe(2);
    set(fakePad(0), fakePad(1), fakePad(2, { buttons: [ZR], axes: STICK_UP }));
    poll();
    expect(p2.isHeld('primary'), 'ボタンは まだ はなしていない').toBe(false);
    expect(p2.isHeld('moveForward'), 'スティックは すぐ 効く').toBe(true);
    set(fakePad(0), fakePad(1), fakePad(2));
    poll();
    set(fakePad(0), fakePad(1), fakePad(2, { buttons: [ZR] }));
    poll();
    expect(p2.isHeld('primary')).toBe(true);
  });

  it('新しい 物が つながっていない → padLost が true', () => {
    const { router, set, poll, p2 } = joined();
    expect(router.setChoice({ p1: 0, p2: 3 })).toBe(true);
    set(fakePad(0), fakePad(1), fakePad(2));
    poll();
    expect(router.padLost()).toBe(true);
    expect(held(p2)).toEqual([]);
    expect(router.padIndex(2)).toBeNull();
  });

  it('1P の 物が かわる: 1P の パッドの 入力が 全部 はなれ（キーは そのまま）、新しい 物の ボタンを はなすまで 受けない', () => {
    const { router, set, poll, p1 } = joined();
    set(fakePad(0, { buttons: [ZR] }), fakePad(1), fakePad(2));
    poll();
    expect(p1.isHeld('primary')).toBe(true);
    p1.press('moveRight'); // キーボード
    expect(router.setChoice({ p1: 2, p2: 1 })).toBe(true);
    set(fakePad(0, { buttons: [ZR] }), fakePad(1), fakePad(2, { buttons: [ZR] }));
    poll();
    expect(p1.isHeld('primary'), '古い パッドの 入力は はなれ、新しい 物は ボタンを はなすまで 受けない').toBe(false);
    expect(p1.isHeld('moveRight'), 'キーは そのまま').toBe(true);
    expect(router.padIndex(1)).toBe(2);
    set(fakePad(0), fakePad(1), fakePad(2, { buttons: [ZR], axes: STICK_UP }));
    poll();
    expect(p1.isHeld('primary')).toBe(false);
    expect(p1.isHeld('moveForward'), 'スティックは すぐ 効く').toBe(true);
    set(fakePad(0), fakePad(1), fakePad(2));
    poll();
    set(fakePad(0), fakePad(1), fakePad(2, { buttons: [ZR] }));
    poll();
    expect(p1.isHeld('primary')).toBe(true);
  });

  it('1P が パッドなしに なる: 1P の パッドの 入力が 全部 はなれ、以後 どの パッドも 1P を 動かさない（キーは そのまま）', () => {
    const { router, set, poll, p1 } = joined();
    set(fakePad(0, { buttons: [ZR], axes: STICK_UP }), fakePad(1), fakePad(2));
    poll();
    p1.press('moveRight');
    expect(router.setChoice({ p1: null, p2: 1 })).toBe(true);
    poll();
    expect(held(p1)).toEqual(['moveRight']);
    expect(router.padIndex(1)).toBeNull();
  });

  it('かわらない 人は 何も 起きない（2P の 入力が そのまま 続く）', () => {
    const { router, set, poll, p2 } = joined();
    expect(router.setChoice({ p1: 2, p2: 1 })).toBe(true);
    set(fakePad(0), fakePad(1, { buttons: [ZR], axes: STICK_UP }), fakePad(2));
    poll();
    expect(p2.isHeld('primary')).toBe(true);
    expect(p2.isHeld('moveForward')).toBe(true);
  });
});

describe('AC58: つなぎなおし（決めた 番号に つながった 物の ボタンだけ）', () => {
  it('2P の 物（番号 1）が ぬけて padLost → 1P の 物・ほかの 番号の ボタンでは もどらない。番号 1 の ボタンで もどる', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1), fakePad(2));
    m.poll();
    m.router.setChoice({ p1: 0, p2: 1 });
    m.router.setJoined(true);
    m.poll();
    m.set(fakePad(0), null, fakePad(2));
    m.poll();
    expect(m.router.padLost()).toBe(true);
    m.set(fakePad(0, { buttons: [ZR] }), null, fakePad(2));
    m.poll();
    expect(m.router.padLost(), '1P の 物では もどらない').toBe(true);
    m.set(fakePad(0), null, fakePad(2, { buttons: [ZR] }));
    m.poll();
    expect(m.router.padLost(), 'ほかの 番号では もどらない').toBe(true);
    m.set(fakePad(0), fakePad(1), fakePad(2)); // つながった だけ
    m.poll();
    expect(m.router.padLost()).toBe(true);
    m.set(fakePad(0), fakePad(1, { buttons: [ZR] }), fakePad(2));
    m.poll();
    expect(m.router.padLost()).toBe(false);
    expect(m.router.padIndex(2)).toBe(1);
  });

  it('参加中に 1P の パッドが ぬけても、2P の パッドを 1P に しない', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.router.setChoice({ p1: 0, p2: 1 });
    m.router.setJoined(true);
    m.poll();
    m.set(null, fakePad(1, { axes: STICK_UP }));
    m.poll();
    expect(m.router.padIndex(1)).toBeNull();
    expect(m.router.padIndex(2)).toBe(1);
    expect(m.p1.isHeld('moveForward')).toBe(false);
    expect(m.router.padLost()).toBe(false);
  });

  it('2P が パッドなしの とき: 1P でない 番号の いちばん 小さい つながっている 物の ＋ で 参加できる', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1), fakePad(2));
    m.router.setChoice({ p1: 0, p2: null });
    m.poll();
    m.set(fakePad(0), fakePad(1), fakePad(2, { buttons: [START] }));
    expect(m.poll().joinRequested).toBe(false);
    m.set(fakePad(0), fakePad(1), fakePad(2));
    m.poll();
    m.set(fakePad(0), fakePad(1, { buttons: [START] }), fakePad(2));
    expect(m.poll().joinRequested).toBe(true);
  });

  it('1P が 2 番の とき、2P の 候補は 番号 0', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1), fakePad(2));
    m.router.setChoice({ p1: 2, p2: null });
    m.poll();
    m.set(fakePad(0, { buttons: [START] }), fakePad(1), fakePad(2));
    expect(m.poll().joinRequested).toBe(true);
  });
});

describe('§2.7: 決めた ＋ は だれの 操作にも ならない・待ちの あいだは ほかの ＋ は 何も しない', () => {
  it('待ちの あいだ（setPicking）: 1P の ＋ は スタートメニューを 開かず、2P の 候補の ＋ も 参加の 求めに ならない。もどすと 効く', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.router.setPicking(1);
    m.set(fakePad(0, { buttons: [START] }), fakePad(1));
    expect(m.poll().joinRequested).toBe(false);
    expect(m.p1.isHeld('openStartMenu')).toBe(false);
    m.set(fakePad(0), fakePad(1, { buttons: [START] }));
    expect(m.poll().joinRequested).toBe(false);
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.router.setPicking(null);
    m.set(fakePad(0), fakePad(1, { buttons: [START] }));
    expect(m.poll().joinRequested).toBe(true);
  });

  it('決めた ＋（2P の 候補に なった 物）は 押しっぱなしの あいだ 参加の 求めに ならない。はなして 押しなおすと なる', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.router.setChoice({ p1: 1, p2: 0 });
    m.set(fakePad(0, { buttons: [START] }), fakePad(1));
    expect(m.poll().joinRequested).toBe(false);
    expect(m.poll().joinRequested).toBe(false);
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.set(fakePad(0, { buttons: [START] }), fakePad(1));
    expect(m.poll().joinRequested).toBe(true);
  });

  it('決めた ＋（1P に なった 物）は 押しっぱなしの あいだ スタートメニューを 開かない。はなして 押しなおすと 開く', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.router.setChoice({ p1: 1, p2: 0 });
    m.set(fakePad(0), fakePad(1, { buttons: [START] }));
    m.poll();
    expect(m.p1.isHeld('openStartMenu')).toBe(false);
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.set(fakePad(0), fakePad(1, { buttons: [START] }));
    m.poll();
    expect(m.p1.isHeld('openStartMenu')).toBe(true);
  });
});

describe('AC50: えらぶ 流れ（PadPicker + ルーター）', () => {
  it('2P の 行で コントローラー 1（番号 0）を 待ち → 番号 1 の ＋ では 決まらない → 番号 0 の ＋ で {p1:1,p2:0}', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    const { router } = m;
    const picker = new PadPicker({
      getPads: () => router.getPads(),
      choice: () => router.effectiveChoice(),
      commit: (c) => void router.setChoice(c),
      padIndex: (w) => router.padIndex(w),
      setPicking: (i) => router.setPicking(i),
    });
    picker.start(2, 0);
    expect(picker.pending()).toEqual({ who: 2, index: 0 });
    m.set(fakePad(0), fakePad(1, { buttons: [START] }));
    m.poll();
    picker.step();
    expect(picker.pending(), '番号 1 の ＋ では 決まらない').toEqual({ who: 2, index: 0 });
    expect(router.choice()).toBeNull();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    picker.step();
    m.set(fakePad(0, { buttons: [START] }), fakePad(1));
    m.poll();
    picker.step();
    expect(picker.pending()).toBeNull();
    expect(router.choice()).toEqual({ p1: 1, p2: 0 });
    expect(saved(m.storage)).toEqual({ p1: 1, p2: 0 });
    expect(router.padIndex(1)).toBe(1);
    expect(router.padIndex(2)).toBeNull();
    expect(picker.notice()).toBe('swapped');
  });
});
