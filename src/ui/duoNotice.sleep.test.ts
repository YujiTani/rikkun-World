import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GADGET_TUNING } from '../content/items/gadgetTuning';
import { SLEEP_ASK_TEXT } from '../time/sleep';
import { DuoNotices } from './duoNotice';
import { findUnrubiedKanji } from './text';

/** COOP-1 5e（AC173）: ふとんの「ねたがっているよ」の 札・待ち中の うすい 暗さ・2P の「よる に ねようね」。DOM は 小さい 偽物（node） */
interface FakeEl {
  className: string;
  textContent: string;
  hidden: boolean;
  attrs: Record<string, string>;
  style: { opacity: string };
  removed: boolean;
  setAttribute(k: string, v: string): void;
  append(...c: FakeEl[]): void;
  remove(): void;
  children: FakeEl[];
}
function fakeEl(): FakeEl {
  const e: FakeEl = {
    className: '',
    textContent: '',
    hidden: false,
    attrs: {},
    style: { opacity: '' },
    removed: false,
    children: [],
    setAttribute(k, v) {
      e.attrs[k] = v;
    },
    append(...c) {
      e.children.push(...c);
    },
    remove() {
      e.removed = true;
    },
  };
  return e;
}

describe('AC173 ねたがっているよ の 札', () => {
  let hud: FakeEl;
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: () => fakeEl() });
    hud = fakeEl();
  });
  afterEach(() => vi.unstubAllGlobals());
  const shown = (id: string): FakeEl | undefined => hud.children.find((c) => c.attrs['data-testid'] === id && !c.hidden && !c.removed);

  it('ひらがなだけ。who ごとの 半分に 出て、消せる', () => {
    expect(findUnrubiedKanji(SLEEP_ASK_TEXT)).toEqual([]);
    expect(SLEEP_ASK_TEXT).toBe('おともだちが いっしょに ねたがっているよ');
    const n = new DuoNotices(hud as never);
    n.setSleepAsk(2, true);
    expect(shown('duo-sleep-ask-p2')?.textContent).toBe(SLEEP_ASK_TEXT);
    expect(shown('duo-sleep-ask-p1')).toBeUndefined();
    n.setSleepAsk(2, false);
    expect(shown('duo-sleep-ask-p2')).toBeUndefined();
    n.setSleepAsk(1, true);
    expect(shown('duo-sleep-ask-p1')).toBeDefined();
  });

  it('うすい 暗さ: 値で 出し、0 で 消す', () => {
    const n = new DuoNotices(hud as never);
    n.setSleepDim(1, GADGET_TUNING.futon.sleepWaitDim);
    expect(shown('duo-sleep-dim-p1')?.style.opacity).toBe(String(GADGET_TUNING.futon.sleepWaitDim));
    expect(shown('duo-sleep-dim-p2')).toBeUndefined();
    n.setSleepDim(1, 0);
    expect(shown('duo-sleep-dim-p1')).toBeUndefined();
  });

  it('2P の「よる に ねようね」は 表の 秒数で 消える。dispose で 全部 消える', () => {
    const n = new DuoNotices(hud as never);
    n.showGadgetNote('よる に ねようね');
    expect(shown('duo-gadget-note-p2')?.textContent).toBe('よる に ねようね');
    n.step(GADGET_TUNING.futon.noticeSeconds - 0.1);
    expect(shown('duo-gadget-note-p2')).toBeDefined();
    n.step(0.2);
    expect(shown('duo-gadget-note-p2')).toBeUndefined();
    n.showGadgetNote('よる に ねようね');
    n.setSleepAsk(2, true);
    n.setSleepDim(2, 0.3);
    n.dispose();
    expect(hud.children.every((c) => c.removed)).toBe(true);
  });
});
