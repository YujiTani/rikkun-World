import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts';
import { setupDuo } from '../animals/duoKit';
import { CoopMenuModel } from '../ui/coopMenuModel';
import { createP2CoopMenu, p2AnimalsDown, p2AnimalsLeave, type P2CoopMenuDeps } from './p2CoopMenu';

/**
 * COOP-1 5c（仕様 1.16 AC138・AC158 の 後半）の 先行テスト（赤）。2P の とりごやの メニュー係と、倒れた／やめた／ぬけた の 配線。
 * 4a の `closeInvHand`（src/duo/invClose.ts）と 同じ 形: DOM を 持たない 小さな 核。画面（`duo-coop-menu-p2`）と
 * フック（`duo.coopMenu(2)`・`duo.coopMenuPress(2, …)`）は ui/duoAnimalHud.ts と game/wire/duoPlay.ts が この 核を つなぐ。
 *
 * ---- 実装への 約束（新しい ファイル src/duo/p2CoopMenu.ts）----
 *   createP2CoopMenu(d: P2CoopMenuDeps): P2CoopMenu
 *     P2CoopMenuDeps = {
 *       base: Omit<CoopMenuDeps, 'inReach' | 'onOpen' | 'onClose'>   … 小屋の 中身（meatList・eggs・busy・exists・collect・startMeat）。2P の 人に 入る 先は 呼ぶ 側が 決める
 *       coopPos(coop: number): { x: number; z: number } | null      … 小屋の まん中の マス。小屋が 消えたら null
 *       pos(): Vec3 | null                                            … 2P の 場所。いなければ null
 *       reach: number                                                 … とどく 距離（設定 coopMenuReach。5.0）
 *       alive(): boolean                                              … 倒れて いない
 *       padOn(): boolean                                              … 2P の パッドが つながって いる
 *       onOpen?(): void; onClose?(): void
 *     }
 *     P2CoopMenu = {
 *       open(coop: number): boolean       … ZL で 小屋を ねらった とき。2P の パッドが 無い・倒れて いる・小屋が 遠い・えらべる 子が 0 なら false
 *       isOpen(): boolean
 *       info(): CoopMenuInfo              … `duo.coopMenu(2)` の 答え（1P の `ui.coopMenu()` と 同じ 形）
 *       input(src: 'pad2' | 'mouse1' | 'key1', name: string): boolean
 *                                          … 'pad2' だけが 押せる（名前は coopMenuPad.ts の coopPadNames。A）。1P の マウス・キーは false で 何も 起きない
 *       back(src: 'pad2' | 'mouse1' | 'key1'): boolean   … B（coopPadBack）。'pad2' だけ
 *       step(): void                       … 毎ステップ。2P の 場所から reach を こえた・小屋が 消えた・倒れた・パッドが ぬけた で とじる（CoopMenuModel.update と 同じ とじ方）
 *       quit(): void                       … やめた。とじる
 *     }
 *     世界は 止めない・1P の 錠（modalLock）は 使わない: P2CoopMenuDeps に その 口が 無い（open が 止めたり ロックしたり する 道が 無い）。
 *     1P の `CoopMenuModel` とは 別の 物（1P の メニューは この 核の ぼうさく に 影響されない）。
 *   p2AnimalsDown(d: { animals: { dropCarried(spot: Vec3): unknown }; menu: P2CoopMenu; feet(): Vec3 }): void
 *       2P が 倒れた ステップに 1 回（game/step.ts の 1P の death の 行〈animals.dropCarried〉と 同じ 位置づけ）。
 *       だっこ中の 羽を 2P の 足もとに おろし（出来事 putDown は by: 2）、メニューを とじる。
 *   p2AnimalsLeave(d: { animals: { leave(at: Vec3): unknown }; menu: P2CoopMenu; feet(): Vec3 }): void
 *       2P が やめた ステップ（保存の 前）に 1 回。`animals.leave(足もと)` ＝ AnimalManager.leave(2, at)、メニューを とじる。
 *   パッドが ぬけた: メニューだけ 閉じる（step() の padOn）。だっこ・小屋・むしは そのまま。
 */

interface Rig {
  s: ReturnType<typeof setupDuo>;
  menu: ReturnType<typeof createP2CoopMenu>;
  log: string[];
  st: { alive: boolean; pad: boolean; gone: boolean };
  coopId: number;
  p1Model: CoopMenuModel;
}

function rig(opts: { kids?: boolean } = {}): Rig {
  const s = setupDuo();
  const c = s.coop(60, 60);
  s.stand(2, 60.5, 66.5); // 2P は 小屋の すぐ 近く
  if (opts.kids !== false) {
    s.kid(c);
    s.kid(c, {}, 1, 0);
  }
  const st = { alive: true, pad: true, gone: false };
  const log: string[] = [];
  const deps: P2CoopMenuDeps = {
    base: {
      meatList: (id) => s.m.meatList(id),
      eggs: () => 2,
      busy: () => null,
      exists: (id) => !st.gone && s.m.coops().some((k) => k.id === id),
      collect: (id) => void s.m.collectCoop(id, 2),
      startMeat: (id, kid) => s.m.meat(id, kid, 2).ok,
    },
    coopPos: (id) => (st.gone ? null : (s.m.coops().find((k) => k.id === id) ?? null)),
    pos: () => s.pl2.cur?.position ?? null,
    reach: 5.0,
    alive: () => st.alive,
    padOn: () => st.pad,
    onOpen: () => log.push('open'),
    onClose: () => log.push('close'),
  };
  const menu = createP2CoopMenu(deps);
  const p1Model = new CoopMenuModel({
    meatList: (id) => s.m.meatList(id),
    eggs: () => 2,
    busy: () => null,
    exists: () => true,
    inReach: () => true,
    collect: () => {},
    startMeat: () => false,
    onOpen: () => {},
    onClose: () => {},
  });
  return { s, menu, log, st, coopId: c.id, p1Model };
}

describe('AC138 2P の とりごやの メニュー: ひらく', () => {
  it('ZL で 子の いる 小屋を ねらうと ひらく（duo.coopMenu(2).open）。ページは top・小屋の id つき', () => {
    const r = rig();
    expect(r.menu.open(r.coopId)).toBe(true);
    expect(r.menu.isOpen()).toBe(true);
    expect(r.menu.info()).toMatchObject({ open: true, coop: r.coopId, page: 'top' });
    expect(r.log).toEqual(['open']);
  });
  it('えらべる 子が 0 わ の 小屋は ひらかない', () => {
    const r = rig({ kids: false });
    expect(r.menu.open(r.coopId)).toBe(false);
    expect(r.menu.isOpen()).toBe(false);
  });
  it('2P の パッドが 無い・倒れて いる・小屋から とおい とき は ひらかない', () => {
    const a = rig();
    a.st.pad = false;
    expect(a.menu.open(a.coopId)).toBe(false);
    const b = rig();
    b.st.alive = false;
    expect(b.menu.open(b.coopId)).toBe(false);
    const c = rig();
    c.s.stand(2, 100.5, 100.5);
    expect(c.menu.open(c.coopId)).toBe(false);
    for (const r of [a, b, c]) expect(r.menu.isOpen()).toBe(false);
  });
  it('1P の メニューとは 別の 物: 2P が ひらいても 閉じても 1P の メニューは かわらない', () => {
    const r = rig();
    expect(r.p1Model.open(r.coopId)).toBe(true);
    r.menu.open(r.coopId);
    r.menu.quit();
    expect(r.p1Model.info().open).toBe(true);
    r.p1Model.close();
    r.menu.open(r.coopId);
    expect(r.p1Model.info().open).toBe(false);
    expect(r.menu.isOpen()).toBe(true);
  });
});

describe('AC138 入力: 2P の パッドだけが 押せる（1P の マウス・キーは きかない）', () => {
  it('pad2 の A（名前）で 押せる。meat → card:<id> → ok の じゅんで いただきます が はじまる（2P の 物として）', () => {
    const r = rig();
    r.menu.open(r.coopId);
    expect(r.menu.input('pad2', 'meat')).toBe(true);
    expect(r.menu.info().page).toBe('pick');
    const kid = r.menu.info().kids[0]!;
    r.menu.input('pad2', `card:${kid}`);
    expect(r.menu.info().page).toBe('confirm');
    r.menu.input('pad2', 'ok');
    expect(r.s.m.events().some((e) => e.type === 'meatStart' && (e as { by?: number }).by === 2)).toBe(true);
  });
  it('1P の マウス・キーは 何を 押しても false。ページも 子も かわらない', () => {
    const r = rig();
    r.menu.open(r.coopId);
    const before = JSON.stringify(r.menu.info());
    for (const src of ['mouse1', 'key1'] as const) {
      for (const name of ['meat', 'collect', 'close']) expect(r.menu.input(src, name)).toBe(false);
      expect(r.menu.back(src)).toBe(false);
    }
    expect(JSON.stringify(r.menu.info())).toBe(before);
    expect(r.menu.isOpen()).toBe(true);
  });
  it('B（pad2）: pick → top、top では とじる', () => {
    const r = rig();
    r.menu.open(r.coopId);
    r.menu.input('pad2', 'meat');
    expect(r.menu.back('pad2')).toBe(true);
    expect(r.menu.info().page).toBe('top');
    expect(r.menu.back('pad2')).toBe(true);
    expect(r.menu.isOpen()).toBe(false);
    expect(r.log).toEqual(['open', 'close']);
  });
  it('collect（pad2）は 2P の もちものへ（collectCoop who 2）。1P へは 入らない', () => {
    const r = rig();
    r.s.m.events();
    r.menu.open(r.coopId);
    r.menu.input('pad2', 'collect');
    expect(r.s.added.every((a) => a.who === 2)).toBe(true);
  });
});

describe('AC138 とじる: 2P の 場所・小屋・倒れた・やめた・パッド（1P の メニューは そのまま）', () => {
  it('2P が 小屋から reach を こえて はなれると とじる（近い 間は 開いたまま）', () => {
    const r = rig();
    r.menu.open(r.coopId);
    r.menu.step();
    expect(r.menu.isOpen()).toBe(true);
    r.s.stand(2, 60.5, 67.5);
    r.menu.step();
    expect(r.menu.isOpen()).toBe(true); // ふちから reach 内
    r.s.stand(2, 60.5, 60.5 + 2.5 + 5.0 + 0.5);
    r.menu.step();
    expect(r.menu.isOpen()).toBe(false);
    expect(r.log).toEqual(['open', 'close']);
  });
  it('1P が 小屋から 遠くても 2P の メニューは 2P の 場所だけで 決まる', () => {
    const r = rig();
    r.s.stand(1, 5.5, 5.5);
    r.menu.open(r.coopId);
    r.menu.step();
    expect(r.menu.isOpen()).toBe(true);
  });
  it('小屋が 消えたら とじる', () => {
    const r = rig();
    r.menu.open(r.coopId);
    r.st.gone = true;
    r.menu.step();
    expect(r.menu.isOpen()).toBe(false);
  });
  it('倒れたら とじる', () => {
    const r = rig();
    r.menu.open(r.coopId);
    r.st.alive = false;
    r.menu.step();
    expect(r.menu.isOpen()).toBe(false);
  });
  it('パッドが ぬけたら メニューだけ とじる。だっこ中の 羽は そのまま', () => {
    const r = rig();
    const id = r.s.friend(2, 1, 0);
    r.s.m.carryHold(id, r.s.hold, 2);
    r.s.step(1);
    r.menu.open(r.coopId);
    r.st.pad = false;
    r.menu.step();
    expect(r.menu.isOpen()).toBe(false);
    expect(r.s.m.carrying(2)).toBe(id);
  });
  it('やめたら とじる（quit）。2 回 呼んでも onClose は 1 回', () => {
    const r = rig();
    r.menu.open(r.coopId);
    r.menu.quit();
    r.menu.quit();
    expect(r.menu.isOpen()).toBe(false);
    expect(r.log).toEqual(['open', 'close']);
  });
  it('2P の とじる 条件では 1P の メニューは とじない', () => {
    const r = rig();
    r.p1Model.open(r.coopId);
    r.menu.open(r.coopId);
    r.st.alive = false;
    r.menu.step();
    expect(r.menu.isOpen()).toBe(false);
    expect(r.p1Model.info().open).toBe(true);
  });
});

describe('AC158 配線: 倒れた・やめた とき（2P）', () => {
  const feetOf = (r: Rig): (() => Vec3) => () => ({ ...r.s.pl2.cur!.position });

  it('p2AnimalsDown: だっこ中の 羽を 2P の 足もとに おろす（putDown by: 2）。メニューは とじる。1P の だっこは そのまま', () => {
    const r = rig();
    const mine = r.s.friend(2, 1, 0);
    const yours = r.s.friend(1, 1, 0);
    r.s.m.carryHold(mine, r.s.hold, 2);
    r.s.m.carryHold(yours, r.s.hold, 1);
    r.s.step(1);
    r.menu.open(r.coopId);
    r.s.m.events();
    p2AnimalsDown({ animals: { dropCarried: (spot) => r.s.m.dropCarried(spot, 2) }, menu: r.menu, feet: feetOf(r) });
    expect(r.s.m.carrying(2)).toBeNull();
    expect(r.s.m.carrying(1)).toBe(yours);
    expect(r.menu.isOpen()).toBe(false);
    const put = r.s.m.events().filter((e) => e.type === 'putDown');
    expect(put).toHaveLength(1);
    expect((put[0] as { by?: number }).by).toBe(2);
    expect(Math.abs((put[0] as { x: number }).x - r.s.pl2.cur!.position.x)).toBeLessThan(2);
  });

  it('p2AnimalsDown: だっこして いなくても こわれない（何も おろさず メニューだけ とじる）', () => {
    const r = rig();
    r.menu.open(r.coopId);
    r.s.m.events();
    p2AnimalsDown({ animals: { dropCarried: (spot) => r.s.m.dropCarried(spot, 2) }, menu: r.menu, feet: feetOf(r) });
    expect(r.menu.isOpen()).toBe(false);
    expect(r.s.m.events().filter((e) => e.type === 'putDown')).toEqual([]);
  });

  it('p2AnimalsLeave: leave(足もと) を 1 回 呼び、メニューを とじる。2P の だっこは 足もとに おりる', () => {
    const r = rig();
    const mine = r.s.friend(2, 1, 0);
    r.s.m.carryHold(mine, r.s.hold, 2);
    r.s.step(1);
    r.menu.open(r.coopId);
    const calls: Vec3[] = [];
    p2AnimalsLeave({
      animals: {
        leave: (at) => {
          calls.push({ ...at });
          return r.s.m.leave(2, at);
        },
      },
      menu: r.menu,
      feet: feetOf(r),
    });
    expect(calls).toHaveLength(1);
    expect(r.menu.isOpen()).toBe(false);
    expect(r.s.m.carrying(2)).toBeNull();
  });
});
