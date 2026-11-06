import { describe, expect, it } from 'vitest';
import { ActionState, EXTRA_KEY_BINDINGS, bindKeyboardAndMouse } from './actions';

/** BOOK-1: ← → Backspace は 遊びの 入力に くわえて 本の Action（pagePrev・pageNext・bookBack）にも なる。キーの くり返しは 動かさない */
function rig(opts?: Parameters<typeof bindKeyboardAndMouse>[3]) {
  const target = new EventTarget();
  const state = new ActionState();
  const counts: Record<string, number> = {};
  state.onPress((a) => (counts[a] = (counts[a] ?? 0) + 1));
  bindKeyboardAndMouse(target as unknown as Window, state, undefined, opts);
  const prevented: string[] = [];
  const key = (type: string, code: string, extra: Record<string, unknown> = {}) =>
    target.dispatchEvent(Object.assign(new Event(type), { code, shiftKey: false, repeat: false, preventDefault() { prevented.push(`${type}:${code}`); } }, extra));
  return { state, counts, key, prevented };
}

describe('BOOK-1 本の キー（Action 経由）', () => {
  it('割り当て: ← pagePrev・→ pageNext・Backspace bookBack（Enter・NumpadEnter の confirm は 上空の 視点用〔HOUSE-1C PR-2〕）', () => {
    expect(EXTRA_KEY_BINDINGS).toEqual({ ArrowLeft: 'pagePrev', ArrowRight: 'pageNext', Backspace: 'bookBack', Enter: 'confirm', NumpadEnter: 'confirm' });
  });
  it('Enter は confirm を 押すが、ふだんは preventDefault しない（HTML の ボタンを Enter で 押せる）。preventExtra が 真の ときだけ 止める', () => {
    const a = rig();
    a.key('keydown', 'Enter');
    expect(a.counts.confirm).toBe(1);
    expect(a.prevented).toEqual([]);
    a.key('keydown', 'NumpadEnter');
    expect(a.prevented).toEqual([]);
    const b = rig({ preventExtra: () => true });
    b.key('keydown', 'Enter');
    expect(b.prevented).toEqual(['keydown:Enter']);
  });
  it('← は moveLeft と pagePrev の 両方。はなすと 両方 はなす', () => {
    const { state, counts, key } = rig();
    key('keydown', 'ArrowLeft');
    expect([counts.moveLeft, counts.pagePrev]).toEqual([1, 1]);
    expect(state.isHeld('pagePrev')).toBe(true);
    key('keyup', 'ArrowLeft');
    expect([state.isHeld('moveLeft'), state.isHeld('pagePrev')]).toEqual([false, false]);
  });
  it('repeat: true の keydown では どの Action も 押されない', () => {
    const { counts, key } = rig();
    key('keydown', 'ArrowRight', { repeat: true });
    key('keydown', 'Escape', { repeat: true });
    expect(counts).toEqual({});
  });
  it('Backspace: 本が 出ている ときだけ ブラウザの「前へ」を 止める。ほかの キーは 今までどおり', () => {
    let open = false;
    const { key, prevented, counts } = rig({ preventExtra: () => open });
    key('keydown', 'Backspace');
    expect(prevented).toEqual([]);
    expect(counts.bookBack).toBe(1);
    key('keyup', 'Backspace');
    open = true;
    key('keydown', 'Backspace');
    expect(prevented).toEqual(['keydown:Backspace']);
    key('keydown', 'KeyW');
    expect(prevented).toContain('keydown:KeyW');
  });
});
