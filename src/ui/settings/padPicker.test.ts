import { describe, expect, it } from 'vitest';
import type { PadChoice } from '../../input/gamepad/padChoice';
import { fakePad } from '../../input/gamepad/testPad';
import { PadPicker, type PadPickerHost, type PickCancel } from './padPicker';

/**
 * COOP-1 作業 2.5（#401。docs/design/COOP-1.md §2.7・§9.6）の 先行テスト（赤）。AC50（流れ）・AC51・AC56・AC60（ユニット）。
 * 部品の 形は src/ui/settings/padPicker.ts の 先頭の 約束。
 */

const START = 9;
const BACK = 1; // standard の みぎの面（もどる）
const DPAD_UP = 12;
const L3 = 10; // スティックの おしこみ
const ZR = 7;

function make(initial: PadChoice = { p1: 0, p2: 1 }) {
  let pads: (Gamepad | null)[] = [fakePad(0), fakePad(1)];
  let choice = initial;
  const commits: PadChoice[] = [];
  const picking: Array<number | null> = [];
  let idx1: number | null = initial.p1;
  let idx2: number | null = null;
  const host: PadPickerHost = {
    getPads: () => pads,
    choice: () => choice,
    commit: (c) => {
      commits.push(c);
      choice = c;
    },
    padIndex: (who) => (who === 1 ? idx1 : idx2),
    setPicking: (i) => void picking.push(i),
  };
  const picker = new PadPicker(host);
  return {
    picker,
    commits,
    picking,
    set: (...p: (Gamepad | null)[]) => {
      pads = p;
    },
    setIdx: (a: number | null, b: number | null) => {
      idx1 = a;
      idx2 = b;
    },
    steps: (n: number) => {
      for (let i = 0; i < n; i++) picker.step();
    },
  };
}

describe('AC50: えらぶ 流れ', () => {
  it('2P の 行の コントローラー 1（番号 0）を おす → 待ち。ルーターに「ほかの ＋ は 何もしない」を 頼む', () => {
    const m = make();
    m.picker.start(2, 0);
    expect(m.picker.pending()).toEqual({ who: 2, index: 0 });
    expect(m.picking.at(-1)).toBe(0);
  });

  it('えらんだ 物の ＋ では 決まるが、ほかの コントローラーの ＋ では 決まらない（待ちは そのまま）', () => {
    const m = make();
    m.picker.start(2, 0);
    m.set(fakePad(0), fakePad(1, { buttons: [START] }));
    m.steps(2);
    expect(m.commits).toEqual([]);
    expect(m.picker.pending()).toEqual({ who: 2, index: 0 });
    m.set(fakePad(0), fakePad(1));
    m.steps(1);
    m.set(fakePad(0, { buttons: [START] }), fakePad(1));
    m.steps(1);
    expect(m.commits).toEqual([{ p1: 1, p2: 0 }]);
    expect(m.picker.pending()).toBeNull();
    expect(m.picking.at(-1)).toBeNull();
    expect(m.picker.notice()).toBe('swapped');
  });

  it('入れかえに ならない ときは 「きまったよ！」（decided）', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1), fakePad(2));
    m.picker.start(2, 2);
    m.steps(1);
    m.set(fakePad(0), fakePad(1), fakePad(2, { buttons: [START] }));
    m.steps(1);
    expect(m.commits).toEqual([{ p1: 0, p2: 2 }]);
    expect(m.picker.notice()).toBe('decided');
  });

  it('もう 決まっている 物を おしても 待ちに しない', () => {
    const m = make();
    m.picker.start(1, 0);
    m.picker.start(2, 1);
    expect(m.picker.pending()).toBeNull();
  });

  it('マウスで べつの えらぶ ボタンを おすと 待ちは そちらに うつる', () => {
    const m = make();
    m.picker.start(2, 0);
    m.picker.start(1, 1);
    expect(m.picker.pending()).toEqual({ who: 1, index: 1 });
    expect(m.picking.at(-1)).toBe(1);
  });

  it('えらんだ 物の ＋ 以外の ボタンは 光るだけで 決まらない', () => {
    const m = make();
    m.picker.start(2, 0);
    m.set(fakePad(0, { buttons: [ZR, L3] }), fakePad(1));
    m.steps(3);
    expect(m.commits).toEqual([]);
    expect(m.picker.pending()).toEqual({ who: 2, index: 0 });
    expect(m.picker.isLit(0)).toBe(true);
  });
});

describe('AC51: 待ちを やめる（何も かわらない）', () => {
  const reasons: PickCancel[] = ['back', 'esc', 'mouse', 'dpad'];
  for (const r of reasons) {
    it(`cancel('${r}') → 待ちが おわり、決まらない。お知らせも 出ない`, () => {
      const m = make();
      m.picker.start(2, 0);
      m.picker.cancel(r);
      expect(m.picker.pending()).toBeNull();
      expect(m.commits).toEqual([]);
      expect(m.picker.notice()).toBeNull();
      expect(m.picking.at(-1)).toBeNull();
    });
  }

  it('1P の パッドの もどる（みぎの面）を おす → やめる', () => {
    const m = make();
    m.picker.start(2, 0);
    m.set(fakePad(0), fakePad(1));
    m.steps(1);
    m.set(fakePad(0, { buttons: [BACK] }), fakePad(1));
    m.steps(1);
    expect(m.picker.pending()).toBeNull();
    expect(m.commits).toEqual([]);
  });

  it('1P の パッドの 十字を おす → やめる（えらんだ 物が 1P の パッド そのものでも 同じ。光るのも する）', () => {
    const m = make();
    m.picker.start(2, 0); // 番号 0 は 1P の パッド
    m.steps(1);
    m.set(fakePad(0, { buttons: [DPAD_UP] }), fakePad(1));
    m.steps(1);
    expect(m.picker.pending()).toBeNull();
    expect(m.commits).toEqual([]);
    expect(m.picker.isLit(0)).toBe(true);
  });

  it('えらんだ コントローラーが ぬけたら やめる', () => {
    const m = make();
    m.picker.start(2, 1);
    m.set(fakePad(0), null);
    m.steps(1);
    expect(m.picker.pending()).toBeNull();
    expect(m.commits).toEqual([]);
  });

  it('900 ステップで 時間切れ（899 では まだ 待ち）。ヘルプ帯は timeout', () => {
    const m = make();
    m.picker.start(2, 0);
    m.steps(899);
    expect(m.picker.pending()).toEqual({ who: 2, index: 0 });
    expect(m.picker.notice()).toBeNull();
    m.steps(1);
    expect(m.picker.pending()).toBeNull();
    expect(m.picker.notice()).toBe('timeout');
    expect(m.commits).toEqual([]);
  });

  it('お知らせは 約 3 秒（固定ステップ 180 回）で きえる', () => {
    const m = make();
    m.picker.start(2, 0);
    m.steps(900);
    m.steps(170);
    expect(m.picker.notice()).toBe('timeout');
    m.steps(20);
    expect(m.picker.notice()).toBeNull();
  });

  it('世界が 止まっている あいだ（せってい画面）は 1/60 秒ごとに 1 回 数える', () => {
    const m = make();
    m.picker.start(2, 0);
    expect(m.picker.advanceTime(1 / 120)).toBe(0);
    expect(m.picker.advanceTime(1 / 120)).toBe(1);
    expect(m.picker.advanceTime(3 / 60)).toBe(3);
    for (let i = 0; i < 894; i++) m.picker.advanceTime(1 / 60);
    expect(m.picker.pending(), '合わせて 898 ステップ').not.toBeNull();
    m.picker.advanceTime(2 / 60);
    expect(m.picker.pending()).toBeNull();
    expect(m.picker.notice()).toBe('timeout');
  });
});

describe('AC56: パッド 0 本', () => {
  it('えらぶ ボタンは なく、isNone が true。つなぐと 次の ステップから ボタンが 出る', () => {
    const m = make();
    m.set();
    m.steps(1);
    expect(m.picker.isNone()).toBe(true);
    expect(m.picker.buttons(1)).toEqual([]);
    expect(m.picker.buttons(2)).toEqual([]);
    m.set(fakePad(0), fakePad(1));
    m.steps(1);
    expect(m.picker.isNone()).toBe(false);
    expect(m.picker.buttons(1).map((b) => b.name)).toEqual(['コントローラー 1', 'コントローラー 2']);
    expect(m.picker.buttons(2).map((b) => b.index)).toEqual([0, 1]);
  });

  it('決まっている 物だけ chosen。待ちの 物だけ pending（1 行で 1 つだけ 決まる）', () => {
    const m = make();
    expect(m.picker.buttons(1).map((b) => b.chosen)).toEqual([true, false]);
    expect(m.picker.buttons(2).map((b) => b.chosen)).toEqual([false, true]);
    m.picker.start(2, 0);
    expect(m.picker.buttons(2).map((b) => b.pending)).toEqual([true, false]);
    expect(m.picker.buttons(1).map((b) => b.pending)).toEqual([false, false]);
  });

  it('[null, b] は 名前「コントローラー 1」・番号 1', () => {
    const m = make();
    m.set(null, fakePad(1));
    expect(m.picker.buttons(1)).toMatchObject([{ index: 1, name: 'コントローラー 1' }]);
  });
});

describe('AC60: 光る', () => {
  it('ボタンを おしている あいだ 光る。ほかの コントローラーは 光らない', () => {
    const m = make();
    m.set(fakePad(0, { buttons: [ZR] }), fakePad(1));
    m.steps(1);
    expect(m.picker.isLit(0)).toBe(true);
    expect(m.picker.isLit(1)).toBe(false);
    m.steps(40);
    expect(m.picker.isLit(0), 'おしている あいだは ずっと').toBe(true);
    expect(m.picker.buttons(1)[0]!.lit).toBe(true);
    expect(m.picker.buttons(2)[0]!.lit).toBe(true);
    expect(m.picker.buttons(1)[1]!.lit).toBe(false);
  });

  it('十字・肩・＋−・スティックの おしこみも 光る', () => {
    for (const b of [DPAD_UP, 4, START, 8, L3, 11, 0]) {
      const m = make();
      m.set(fakePad(0, { buttons: [b] }), fakePad(1));
      m.steps(1);
      expect(m.picker.isLit(0), `ボタン ${b}`).toBe(true);
    }
  });

  it('はなして 30 ステップ目までは 光り、31 ステップ目に 消える', () => {
    const m = make();
    m.set(fakePad(0, { buttons: [ZR] }), fakePad(1));
    m.steps(3);
    m.set(fakePad(0), fakePad(1));
    for (let i = 1; i <= 30; i++) {
      m.steps(1);
      expect(m.picker.isLit(0), `はなして ${i} ステップ目`).toBe(true);
    }
    m.steps(1);
    expect(m.picker.isLit(0), 'はなして 31 ステップ目').toBe(false);
  });

  it('スティックを いっぱいに たおしただけでは 光らない', () => {
    const m = make();
    m.set(fakePad(0, { axes: [1, -1, 1, -1] }), fakePad(1));
    m.steps(5);
    expect(m.picker.isLit(0)).toBe(false);
    expect(m.picker.buttons(1)[0]!.lit).toBe(false);
  });

  it('光る 色は 今 その 物で 動いている 人（1P=p1・2P=p2・だれも 動いていない=white）。1 本のときの かわりは 1P の 色', () => {
    const m = make();
    m.set(fakePad(0, { buttons: [ZR] }), fakePad(1, { buttons: [ZR] }), fakePad(2, { buttons: [ZR] }));
    m.setIdx(0, 1);
    m.steps(1);
    expect(m.picker.litColor(0)).toBe('p1');
    expect(m.picker.litColor(1)).toBe('p2');
    expect(m.picker.litColor(2)).toBe('white');
    m.setIdx(1, null); // 1P の 物が つながっていない → 2P の 物で 1P を うごかす
    expect(m.picker.litColor(1)).toBe('p1');
  });

  it('光っていない 物の 色は null', () => {
    const m = make();
    m.steps(1);
    expect(m.picker.litColor(0)).toBeNull();
  });
});
