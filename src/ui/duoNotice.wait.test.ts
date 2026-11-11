import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INPUT_CONFIG } from '../input/config';
import { DuoNotices } from './duoNotice';
import { findUnrubiedKanji } from './text';

/**
 * COOP-1 5d（docs/design/COOP-1.md 1.15 §3.7 (e)・§12.0 の `duo-wait-p1`・AC161）: 「ちょっと まってね」を 開いて いない 人の 半分に 出す。
 * 実装の 前に 書いた 赤の テスト。DOM は 小さい 偽物（node）。
 *
 * ---- 開発への つなぎ目の 約束（`src/ui/duoNotice.ts`）----
 *   DuoNotices.setWait(who: 1 | 2, on: boolean)   〔今は setWait(on)。2P の 半分〔右〕= who 2 → data-testid="duo-wait"（今の まま）、1P の 半分〔左〕= who 1 → data-testid="duo-wait-p1"〕
 *   DuoNotices.setRelockHint(on: boolean)  … 2P が パッドで とじた あと 1P の 錠が かけなおし待ちの あいだ 1P の 半分に data-testid="duo-relock-p1"。字は INPUT_CONFIG.textResume〔ゲームに 戻る〕を ふりがな つき〔innerHTML。漢字は ruby〕で。
 *   字は どちらも「ちょっと まってね」。出していない ときは 要素が ないか hidden。dispose で 全部 消える。呼び出しは src/game/wire/duo.ts の noticeStep〔modalOwner の 行き先〕。
 */

interface FakeEl {
  className: string;
  textContent: string;
  innerHTML: string;
  hidden: boolean;
  attrs: Record<string, string>;
  children: FakeEl[];
  removed: boolean;
  setAttribute(k: string, v: string): void;
  append(...c: FakeEl[]): void;
  remove(): void;
  classList: { add(...c: string[]): void };
}

function fakeEl(): FakeEl {
  const e: FakeEl = {
    className: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    attrs: {},
    children: [],
    removed: false,
    setAttribute(k, v) {
      e.attrs[k] = v;
    },
    append(...c) {
      e.children.push(...c);
    },
    remove() {
      e.removed = true;
    },
    classList: { add: (...c) => void (e.className += ` ${c.join(' ')}`) },
  };
  return e;
}

describe('AC161 ちょっと まってね（人ごとの 半分）', () => {
  let hud: FakeEl;
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: () => fakeEl() });
    hud = fakeEl();
  });
  afterEach(() => vi.unstubAllGlobals());

  const shown = (testid: string): FakeEl | undefined => hud.children.find((c) => c.attrs['data-testid'] === testid && !c.hidden && !c.removed);
  const notices = () => new DuoNotices(hud as never);

  it('who 2: duo-wait（2P の 半分）だけ。duo-wait-p1 は 出ない', () => {
    const n = notices();
    n.setWait(2, true);
    expect(shown('duo-wait')?.textContent).toBe('ちょっと まってね');
    expect(shown('duo-wait-p1')).toBeUndefined();
  });

  it('who 1: duo-wait-p1（1P の 半分）だけ。duo-wait は 出ない', () => {
    const n = notices();
    n.setWait(1, true);
    expect(shown('duo-wait-p1')?.textContent).toBe('ちょっと まってね');
    expect(shown('duo-wait')).toBeUndefined();
  });

  it('消す: 次の 呼びで hidden。もう 片方には 響かない。出しなおせる', () => {
    const n = notices();
    n.setWait(1, true);
    n.setWait(2, true);
    n.setWait(1, false);
    expect(shown('duo-wait-p1')).toBeUndefined();
    expect(shown('duo-wait')).toBeDefined();
    n.setWait(1, true);
    expect(shown('duo-wait-p1')).toBeDefined();
  });

  it('dispose で 両方 なくなる', () => {
    const n = notices();
    n.setWait(1, true);
    n.setWait(2, true);
    n.dispose();
    expect(shown('duo-wait-p1')).toBeUndefined();
    expect(shown('duo-wait')).toBeUndefined();
  });

  it('duo-relock-p1: setRelockHint(true) で 出て、字は 案内の textResume（漢字は ふりがな つき）。false で 消える', () => {
    const n = notices();
    expect(shown('duo-relock-p1')).toBeUndefined();
    n.setRelockHint(true);
    const el = shown('duo-relock-p1');
    expect(el).toBeDefined();
    const text = (el!.innerHTML || el!.textContent).replace(/<rt>.*?<\/rt>|<[^>]+>/g, '');
    expect(text).toBe(INPUT_CONFIG.textResume);
    expect(findUnrubiedKanji(el!.innerHTML || el!.textContent)).toEqual([]);
    n.setRelockHint(false);
    expect(shown('duo-relock-p1')).toBeUndefined();
  });
});
