import { beforeAll, describe, expect, it, vi } from 'vitest';

// DOM 環境がないので、AimMarks が使う分だけの 小さな にせ物を用意する
class FakeEl {
  id = '';
  className = '';
  hidden = false;
  textContent = '';
  dataset: Record<string, string> = {};
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  private cls = new Set<string>();
  classList = {
    toggle: (n: string, on: boolean) => void (on ? this.cls.add(n) : this.cls.delete(n)),
    contains: (n: string) => this.cls.has(n) || this.className.split(' ').includes(n),
  };
  append(...els: FakeEl[]): void {
    for (const e of els) {
      e.parent = this;
      this.children.push(e);
    }
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
}

let AimMarks: typeof import('./aimMarks').AimMarks;
let ORDER: typeof import('./aimMarks').STANCE_LINE_ORDER;
let body: FakeEl;

beforeAll(async () => {
  body = new FakeEl();
  vi.stubGlobal('document', { createElement: () => new FakeEl(), body });
  const mod = await import('./aimMarks');
  AimMarks = mod.AimMarks;
  ORDER = mod.STANCE_LINE_ORDER;
});

const mk = () => new AimMarks(body as unknown as HTMLElement);
const litIdx = (el: unknown): number[] =>
  (el as FakeEl).children.map((c, i) => (c.classList.contains('on') ? i : -1)).filter((i) => i >= 0);

describe('AimMarks (AC35)', () => {
  it('上・中・下の順で、今のかまえだけ明るい', () => {
    expect(ORDER).toEqual(['jodan', 'chudan', 'gedan']);
    const m = mk();
    expect(m.stanceEl.hidden).toBe(true);
    m.update({ stance: 'chudan', bowStage: 0 });
    expect(m.stanceEl.hidden).toBe(false);
    expect(litIdx(m.stanceEl)).toEqual([1]);
    m.update({ stance: 'jodan', bowStage: 0 });
    expect(litIdx(m.stanceEl)).toEqual([0]);
    m.update({ stance: 'gedan', bowStage: 0 });
    expect(litIdx(m.stanceEl)).toEqual([2]);
    expect(m.state().stance).toBe('gedan');
    m.update({ stance: null, bowStage: 0 });
    expect(m.stanceEl.hidden).toBe(true);
    expect(m.state().stance).toBeNull();
  });

  it('弓は段の数だけ色がつき、はなすと消える', () => {
    const m = mk();
    expect(m.bowEl.hidden).toBe(true);
    for (const n of [1, 2, 3] as const) {
      m.update({ stance: null, bowStage: n });
      expect(m.bowEl.hidden).toBe(false);
      expect(litIdx(m.bowEl)).toEqual([...Array(n).keys()]);
      expect(m.state().bowLit).toBe(n);
    }
    m.update({ stance: null, bowStage: 0 });
    expect(m.bowEl.hidden).toBe(true);
    expect(m.state().bowLit).toBe(0);
  });

  it('字を使わない・dispose で消える', () => {
    const m = mk();
    expect(m.stanceEl.textContent).toBe('');
    expect(m.bowEl.textContent).toBe('');
    m.dispose();
    expect(body.children.includes(m.stanceEl as unknown as FakeEl)).toBe(false);
    expect(body.children.includes(m.bowEl as unknown as FakeEl)).toBe(false);
  });
});
