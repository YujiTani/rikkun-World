import { describe, expect, it } from 'vitest';
import { CoopMenuModel, type CoopMenuDeps, coopMenuReach } from './coopMenuModel';

/**
 * LIVE-3 とりごや の メニュー（docs/design/LIVE-3.md §2.3・§5）。3 ページ: top → pick → confirm。
 * DOM なし。かたちは `ui.coopMenu()` の 窓口 と 同じ。
 */
function make(o: { kids?: number[]; eggs?: number; busy?: number | null; far?: boolean } = {}) {
  const st = { kids: o.kids ?? [11, 12, 13], eggs: o.eggs ?? 3, busy: o.busy ?? null, far: o.far === true, exists: true };
  const log: string[] = [];
  const deps: CoopMenuDeps = {
    meatList: () => st.kids.slice(),
    eggs: () => st.eggs,
    busy: () => st.busy,
    exists: () => st.exists,
    inReach: () => !st.far,
    collect: (coop) => {
      log.push(`collect:${coop}`);
      st.eggs = 0;
    },
    startMeat: (coop, id) => {
      log.push(`meat:${coop}:${id}`);
      return st.kids.includes(id) && st.busy === null;
    },
    onOpen: () => log.push('open'),
    onClose: () => log.push('close'),
  };
  const m = new CoopMenuModel(deps);
  return { m, st, log };
}

describe('開く・とじる', () => {
  it('open: page top・eggs・meatDisabled false。とじる と 何も おきない', () => {
    const { m, log } = make();
    expect(m.info()).toMatchObject({ open: false, coop: null, page: 'top', kids: [], selected: null });
    m.open(5);
    expect(m.info()).toMatchObject({ open: true, coop: 5, page: 'top', eggs: 3, meatDisabled: false, selected: null });
    m.press('close');
    expect(m.info().open).toBe(false);
    expect(log).toEqual(['open', 'close']);
    expect(m.pick()).toBeNull();
  });
  it('えらべる 子 が 0 わ の 小屋 は ひらかない', () => {
    const { m, log } = make({ kids: [] });
    expect(m.open(5)).toBe(false);
    expect(m.info().open).toBe(false);
    expect(log).toEqual([]);
  });
  it('update: はなれたら とじる・小屋 が 無く なったら とじる', () => {
    const a = make();
    a.m.open(1);
    a.st.far = true;
    a.m.update();
    expect(a.m.info().open).toBe(false);
    const b = make();
    b.m.open(1);
    b.st.exists = false;
    b.m.update();
    expect(b.m.info().open).toBe(false);
  });
  it('とどく きょり: 小屋 の ふち から 5.0 まで', () => {
    const c = { x: 10, z: 10 };
    expect(coopMenuReach(c, 10.5, 10.5 + 2.5 + 4.9, 5)).toBe(true);
    expect(coopMenuReach(c, 10.5, 10.5 + 2.5 + 5.1, 5)).toBe(false);
    expect(coopMenuReach(c, 10.5 + 2.5 + 3.4, 10.5 + 2.5 + 3.4, 5)).toBe(true); // 斜め: ふち から の 長さ 4.8
    expect(coopMenuReach(c, 10.5 + 2.5 + 3.7, 10.5 + 2.5 + 3.7, 5)).toBe(false); // 5.2
    expect(coopMenuReach(c, 10.5, 10.5, 5)).toBe(true);
  });
});

describe('ページ 1', () => {
  it('collect: たまご を あつめる。ひらいた まま・0 こ なら 押せない', () => {
    const { m, log, st } = make({ eggs: 3 });
    m.open(5);
    m.press('collect');
    expect(log).toContain('collect:5');
    expect(m.info()).toMatchObject({ open: true, page: 'top', eggs: 0 });
    m.press('collect');
    expect(log.filter((l) => l.startsWith('collect'))).toHaveLength(1);
    expect(st.eggs).toBe(0);
  });
  it('meat: ページ 2。kids は 一覧 と 同じ。演出 中 の 小屋 は meatDisabled で 押せない', () => {
    const { m } = make({ kids: [11, 12] });
    m.open(5);
    m.press('meat');
    expect(m.info()).toMatchObject({ page: 'pick', kids: [11, 12], selected: null });
    const b = make({ busy: 11 });
    b.m.open(5);
    expect(b.m.info().meatDisabled).toBe(true);
    b.m.press('meat');
    expect(b.m.info().page).toBe('top');
  });
  it('meat: その あいだ に えらべる 子 が 0 わ に なっていた → ページ 1 の まま', () => {
    const { m, st } = make();
    m.open(5);
    st.kids = [];
    m.press('meat');
    expect(m.info().page).toBe('top');
  });
});

describe('ページ 2・3', () => {
  it('hover で ▼（pick）。もどる で ページ 1 と ▼ なし', () => {
    const { m } = make();
    m.open(5);
    m.press('meat');
    expect(m.pick()).toBeNull();
    m.press('hover', 12);
    expect(m.pick()).toBe(12);
    m.press('hover', 13);
    expect(m.pick()).toBe(13);
    m.press('hover');
    expect(m.pick()).toBeNull();
    m.press('hover', 99); // 一覧 に 無い id は 無視
    expect(m.pick()).toBeNull();
    m.press('hover', 11);
    m.press('back');
    expect(m.info().page).toBe('top');
    expect(m.pick()).toBeNull();
  });
  it('card → confirm（selected・▼ は のこる）。やめる → pick・子 は かわらない。とじる → 何も おきない', () => {
    const { m, log } = make();
    m.open(5);
    m.press('meat');
    m.press('card', 12);
    expect(m.info()).toMatchObject({ page: 'confirm', selected: 12 });
    expect(m.pick()).toBe(12);
    m.press('cancel');
    expect(m.info()).toMatchObject({ page: 'pick', selected: null });
    m.press('card', 13);
    m.press('close');
    expect(m.info().open).toBe(false);
    expect(log.some((l) => l.startsWith('meat'))).toBe(false);
  });
  it('一覧 に 無い id の card は 無視', () => {
    const { m } = make();
    m.open(5);
    m.press('meat');
    m.press('card', 99);
    expect(m.info().page).toBe('pick');
  });
  it('ok: メニュー が とじて startMeat。演出 の 子 が えらべなく なって いたら 何も せず ページ 2 に もどる（0 わ なら ページ 1）', () => {
    const a = make();
    a.m.open(5);
    a.m.press('meat');
    a.m.press('card', 12);
    a.m.press('ok');
    expect(a.log).toContain('meat:5:12');
    expect(a.m.info().open).toBe(false);
    expect(a.m.pick()).toBeNull();

    const b = make();
    b.m.open(5);
    b.m.press('meat');
    b.m.press('card', 12);
    b.st.kids = [11, 13];
    b.m.press('ok');
    expect(b.log.some((l) => l.startsWith('meat'))).toBe(false);
    expect(b.m.info()).toMatchObject({ open: true, page: 'pick', kids: [11, 13], selected: null });

    const c = make();
    c.m.open(5);
    c.m.press('meat');
    c.m.press('card', 12);
    c.st.kids = [];
    c.m.press('ok');
    expect(c.m.info()).toMatchObject({ open: true, page: 'top', kids: [] });
  });
  it('ページ 2 を 出す とき は 毎回 えらべる 子 を 出し直す', () => {
    const { m, st } = make();
    m.open(5);
    m.press('meat');
    st.kids = [11];
    m.press('back');
    m.press('meat');
    expect(m.info().kids).toEqual([11]);
  });
  it('ボタン の 順番 ちがい: top で ok/card/cancel/back は 無視', () => {
    const { m, log } = make();
    m.open(5);
    for (const b of ['ok', 'card', 'cancel', 'back'] as const) m.press(b, 11);
    expect(m.info().page).toBe('top');
    expect(log.some((l) => l.startsWith('meat'))).toBe(false);
  });
});
