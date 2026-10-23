import { describe, expect, it } from 'vitest';
import type { AchievementModalPort, AchievementShow, StorageEvent, WorldRegions } from '../contracts';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { ACHIEVEMENT_DEFS } from './defs';
import { AchievementSystem, type StepContext } from './AchievementSystem';
import { AchievementsPageModel } from './pageModel';

const mk = (over: Partial<typeof M6_SETTING_DEFAULTS> = {}) => {
  const s = { ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0, ...over };
  return new AchievementSystem(() => s);
};

const ctx = (o: Partial<StepContext> = {}): StepContext => ({
  tick: 0,
  day: 0,
  mode: 'play',
  screenSteps: 1,
  position: { x: 0, y: 10, z: 0 },
  velocityY: 0,
  onGround: true,
  inWater: false,
  dead: false,
  yokai: [],
  level: 1,
  armor: [null, null, null, null],
  regions: null,
  ...o,
});

class FakeModal implements AchievementModalPort {
  shows: AchievementShow[] = [];
  openNow = false;
  private cb: (s: string[]) => void = () => {};
  open(s: AchievementShow): boolean {
    if (this.openNow) return false;
    this.openNow = true;
    this.shows.push(s);
    return true;
  }
  isOpen(): boolean {
    return this.openNow;
  }
  onClosed(fn: (s: string[]) => void): void {
    this.cb = fn;
  }
  close(): void {
    this.openNow = false;
    this.cb(this.shows[this.shows.length - 1].ids);
  }
}
const attach = (sys: AchievementSystem) => {
  const m = new FakeModal();
  sys.attach(m, { bannerShowing: () => false, levelUpShowing: () => false });
  return m;
};

describe('実績の表', () => {
  it('278 こ（COUNTRY-1 で ＋13: 国 12 ＋ ぜんぶの くに 1。古い 8 つは legacy で のこる）・id かぶりなし・小 88（GOLD-1 で ＋4・小 ＋0。LIVE-3 で ＋1・小 ＋1（animal.eatMeat）。WEAPON-7 の 4 ＋ PR3 の 2 を 足した。LIVE-2 版 3 で ＋11・小 ＋3。LIVE-1 版 3.2 で ＋6・小 ＋1。LIVE-1 の 12・3 を 足した。M6 の 180・61 ＋ M7 の 27・11 ＋ WEAPON-2 の 4・1 ＋ M7-2 の 11・5 ＋ BUCKET-1 の 2・1 ＋ WEAPON-6 の 1・1）', () => {
    expect(ACHIEVEMENT_DEFS.length).toBe(279);
    expect(new Set(ACHIEVEMENT_DEFS.map((d) => d.id)).size).toBe(279);
    expect(ACHIEVEMENT_DEFS.filter((d) => d.small).length).toBe(89);
    expect(ACHIEVEMENT_DEFS.filter((d) => d.category === 'farm').length).toBe(64);
    expect(ACHIEVEMENT_DEFS.filter((d) => d.category === 'farm' && d.small).length).toBe(18);
  });
  it('メダルと名前', () => {
    const med = (id: string) => ACHIEVEMENT_DEFS.find((d) => d.id === id)?.medal;
    expect(med('break.dirt.1')).toBe('bronze');
    expect(med('break.dirt.10')).toBe('silver');
    expect(med('break.dirt.100')).toBe('gold');
    expect(med('break.all.5000')).toBe('rainbow');
    expect(med('place.furnace.1')).toBe('gold');
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'break.dirt.1')?.name).toBe('はじめて つち ブロック を こわした！');
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'break.dirt.10')?.name).toBe('つち ブロック を 10 こ こわした！');
    // WEAPON-7 §2.7: 名前に 漢字を 書くなら ［漢字｜よみ］。ふりがなの ない 漢字は 0（前は「漢字なし」）
    expect(ACHIEVEMENT_DEFS.filter((d) => /[一-鿿]/.test(d.name.replace(/［[^｜］]*｜[^］]*］/g, ''))).map((d) => d.id)).toEqual([]);
  });
});

describe('記録', () => {
  it('こわす・おく・つくる・拾う', () => {
    const s = mk();
    const b = { x: 0, y: 0, z: 0 };
    s.feedDig([{ type: 'break', tick: 1, block: b, id: 'dirt', gotItem: true, count: 1 }, { type: 'place', tick: 2, block: b, id: 'log' }]);
    s.feedCraft([
      { type: 'craft', tick: 3, recipe: 'ya', item: 'ya', count: 4 },
      { type: 'pickup', tick: 3, item: 'paper', count: 3 },
      { type: 'bakeDone', tick: 4, recipe: 'iron_ingot', item: 'iron_ingot', count: 1, position: b },
    ]);
    const st = s.stats();
    expect(st['break:dirt']).toBe(1);
    expect(st['break:*']).toBe(1);
    expect(st['place:log']).toBe(1);
    expect(st['craft:ya']).toBe(1);
    expect(st['craftItems:ya']).toBe(4);
    expect(st['obtain:paper']).toBe(3);
    expect(st['pickup:*']).toBe(3);
    expect(st['bake:iron_ingot']).toBe(1);
    expect(s.events().some((e) => e.type === 'unlock' && e.id === 'break.dirt.1')).toBe(true);
    expect(s.isFirstMade('craft', 'ya')).toBe(false);
    expect(s.isFirstMade('craft', 'bokuto')).toBe(true);
  });
  it('たたかう: ひんし・つづけて・ふせぐ・死', () => {
    const s = mk();
    s.feedDefeat({ kind: 'karakasa', tick: 0, with: 'katana', hp: 3 });
    s.feedDefeat({ kind: 'karakasa', tick: 300, with: 'katana', hp: 4 });
    expect(s.stat('defeatLow')).toBe(1);
    expect(s.stat('defeatWith:katana')).toBe(2);
    s.feedDefeat({ kind: 'karakasa', tick: 600, with: 'hand', hp: 4 });
    expect(s.stat('chain')).toBe(1);
    const t = mk();
    t.feedDefeat({ kind: 'karakasa', tick: 0, with: 'hand', hp: 9 });
    t.feedDefeat({ kind: 'karakasa', tick: 300, with: 'hand', hp: 9 });
    t.feedDefeat({ kind: 'karakasa', tick: 601, with: 'hand', hp: 9 });
    expect(t.stat('chain')).toBe(0);
    s.feedCombat([{ type: 'playerHit', tick: 1, by: 'karakasa', amount: 1, blocked: true }, { type: 'death', tick: 2, dropped: [] }]);
    expect(s.stat('guard')).toBe(1);
    expect(s.stat('death')).toBe(1);
    expect(s.isUnlocked('defeat.with.katana.1')).toBe(true);
  });
  it('すてた・しまった', () => {
    const s = mk();
    const ev: StorageEvent[] = [{ type: 'drop', tick: 0, item: 'dirt', count: 5 }, { type: 'store', tick: 0, item: 'dirt', count: 2 }, { type: 'storeFull', tick: 0 }];
    s.feedStorage(ev);
    expect(s.stat('drop:*')).toBe(5);
    expect(s.isUnlocked('store.first.1') && s.isUnlocked('store.full.1') && s.isUnlocked('drop.first.1')).toBe(true);
  });
  it('レベル・防具・歩く・ジャンプ・遊んだ時間', () => {
    const s = mk();
    s.update(ctx({ level: 2, armor: ['kabuto', 'yoroi', 'kote', 'suneate'] }));
    expect(s.isUnlocked('level.2.1' as never) || s.isUnlocked('level.2')).toBe(true);
    expect(s.isUnlocked('level.3')).toBe(false);
    expect(s.isUnlocked('wear.all.1')).toBe(true);
    for (let i = 1; i <= 1500; i++) s.update(ctx({ position: { x: i * 0.07, y: 10, z: 0 } }));
    expect(Math.abs(s.stat('walk') - 105)).toBeLessThanOrEqual(1);
    expect(s.isUnlocked('walk.100')).toBe(true);
    s.update(ctx({ position: { x: 200, y: 10, z: 0 } }));
    const w = s.stat('walk');
    s.update(ctx({ position: { x: 250, y: 10, z: 0 } }));
    expect(s.stat('walk')).toBe(w);
    s.update(ctx({ onGround: false, velocityY: 5 }));
    expect(s.stat('jump')).toBe(1);
    const p = mk();
    for (let i = 0; i < 600; i++) p.update(ctx());
    for (let i = 0; i < 100; i++) p.update(ctx({ mode: 'inventory', screenSteps: 4 }));
    for (let i = 0; i < 50; i++) p.update(ctx({ mode: 'guide', screenSteps: 0 }));
    expect(p.stat('playTicks')).toBe(1000);
  });
  it('record で 段階を取る', () => {
    const s = mk();
    s.record('break:dirt', 1);
    s.record('break:dirt', 9);
    expect(s.isUnlocked('break.dirt.10')).toBe(true);
    s.record('level', 3);
    expect(s.isUnlocked('level.3')).toBe(true);
  });
  it('上限', () => {
    const s = mk();
    s.record('walk', 3_000_000_000);
    expect(s.stat('walk')).toBe(2_000_000_000);
  });
  it('つくるの まとめ', () => {
    const s = mk();
    for (const r of ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe']) s.feedCraft([{ type: 'craft', tick: 0, recipe: r, item: r as never, count: 1 }]);
    expect(s.isUnlocked('craft.pickaxes.3')).toBe(true);
  });
});

describe('M5 の場所', () => {
  const regions: WorldRegions = {
    center: { x: 64, z: 64 },
    startH0: 10,
    mountain: { cx: 90, cz: 90, r: 10, peak: { x: 90, z: 90, h: 30 } },
    rock: { cx: 0, cz: 0, r: 3 },
    forest: { cx: 30, cz: 30, r: 8 },
    flat: { x0: 50, z0: 50, x1: 60, z1: 60 },
    spring: { cx: 64, cz: 64, r: 3 },
    river: [{ x0: 1, z0: 1, x1: 5, z1: 5 }],
    meadow: { cx: 100, cz: 20, r: 6 },
    pond: { cx: 20, cz: 100, r: 5 },
  };
  it('regions では うみ だけ（COUNTRY-1: 古い 7 つと visit.all は 取れない）。てっぺん は ctx.peak（4 つの山の国の 頂上）', () => {
    const s = mk();
    s.update(ctx({ regions, position: { x: 30, y: 10, z: 30 } }));
    expect(s.isUnlocked('visit.forest.1')).toBe(false);
    const spots: Array<[number, number, number, boolean?]> = [[90, 40, 90], [100, 10, 20], [55, 10, 55], [64, 10, 64], [20, 10, 100], [3, 10, 3], [0, 10, 0, true]];
    for (const [x, y, z, w] of spots) s.update(ctx({ regions, position: { x, y, z }, inWater: !!w }));
    expect(s.isUnlocked('visit.peak.1')).toBe(false);
    expect(s.isUnlocked('visit.sea.1')).toBe(true);
    expect(s.isUnlocked('visit.all.9')).toBe(false);
    s.update(ctx({ regions, peak: { x: 300, z: 300, h: 50 }, position: { x: 301, y: 50, z: 300 } }));
    expect(s.isUnlocked('visit.peak.1')).toBe(true);
  });
});

describe('おめでとう画面を出すきまり', () => {
  const smalls = (s: AchievementSystem, n: number) => {
    const ks = ['grass', 'dirt', 'stone', 'sand', 'log', 'leaves'];
    for (let i = 0; i < n; i++) s.record(`break:${ks[i]}`, 1);
  };
  it('ちいさい 4 こでは 出ず 5 こで出る・まとめ方', () => {
    const s = mk();
    const m = attach(s);
    smalls(s, 4);
    s.update(ctx());
    expect(m.shows.length).toBe(0);
    expect(s.pendingCount()).toBe(4);
    smalls(s, 5);
    s.update(ctx());
    expect(m.shows.length).toBe(1);
    m.close();
    expect(s.pendingCount()).toBe(0);
    expect(s.list().filter((r) => r.unlocked).every((r) => r.seen)).toBe(true);
  });
  it('大きい実績ですぐ・主役はいちばん高いメダル・5 行と ほか', () => {
    const s = mk();
    const m = attach(s);
    s.record('break:dirt', 1);
    s.record('break:grass', 10);
    s.record('place:*', 1);
    s.record('place:*', 99);
    s.record('craft:*', 10);
    s.update(ctx());
    const show = m.shows[0];
    expect(show).toBeTruthy();
    expect(s.list().find((r) => r.id === show.mainId)?.medal).toBe('gold');
    expect(show.more).toBe(Math.max(0, show.ids.length - 1 - 5));
  });
  it('とじたあと 待ち時間', () => {
    const s = mk({ achieveCooldown: 1800, achieveCooldownEarly: 5400, achieveEarlyTicks: 100 });
    const m = attach(s);
    s.record('defeat:*', 1);
    s.update(ctx());
    expect(m.shows.length).toBe(1);
    for (let i = 0; i < 200; i++) s.update(ctx());
    m.close();
    s.record('defeat:*', 9);
    for (let i = 0; i < 1799; i++) s.update(ctx());
    expect(m.shows.length).toBe(1);
    s.update(ctx());
    s.update(ctx());
    expect(m.shows.length).toBe(2);
  });
  it('しずか: 妖怪が近い・ダメージ直後は出ない。1800 でむりやり出す', () => {
    const s = mk();
    const m = attach(s);
    const near = [{ position: { x: 6, y: 10, z: 0 } }];
    s.record('defeat:*', 1);
    s.update(ctx({ yokai: near }));
    expect(m.shows.length).toBe(0);
    s.update(ctx());
    expect(m.shows.length).toBe(1);
    m.close();
    const t = mk();
    const m2 = attach(t);
    t.record('defeat:*', 1);
    for (let i = 0; i < 1799; i++) t.update(ctx({ yokai: near }));
    expect(m2.shows.length).toBe(0);
    for (let i = 0; i < 3; i++) t.update(ctx({ yokai: near }));
    expect(m2.shows.length).toBe(1);
    const h = mk();
    const m3 = attach(h);
    h.feedCombat([{ type: 'playerHit', tick: 0, by: 'karakasa', amount: 1 }]);
    h.record('defeat:*', 1);
    for (let i = 0; i < 119; i++) h.update(ctx());
    expect(m3.shows.length).toBe(0);
    h.update(ctx());
    h.update(ctx());
    expect(m3.shows.length).toBe(1);
  });
  it('やられ画面・案内画面では出ない', () => {
    const s = mk();
    const m = attach(s);
    s.record('defeat:*', 1);
    s.update(ctx({ dead: true }));
    s.update(ctx({ mode: 'guide', screenSteps: 0 }));
    expect(m.shows.length).toBe(0);
    s.update(ctx());
    expect(m.shows.length).toBe(1);
  });
  it('ちいさい 1 こ だけでも 18000 ステップで出る', () => {
    const s = mk();
    const m = attach(s);
    s.record('break:dirt', 1);
    for (let i = 0; i < 17999; i++) s.update(ctx());
    expect(m.shows.length).toBe(0);
    s.update(ctx());
    s.update(ctx());
    expect(m.shows.length).toBe(1);
  });
});

describe('保存・ロード', () => {
  it('同じに もどる・見せていない列も続く', () => {
    const s = mk();
    s.record('break:dirt', 10);
    s.record('walk', 5);
    const data = JSON.parse(JSON.stringify(s.serialize()));
    const t = mk();
    t.deserialize(data);
    expect(t.list()).toEqual(s.list());
    expect(t.stats()).toEqual(s.stats());
    expect(t.pendingIds()).toEqual(s.pendingIds());
  });
  it('古い保存: 0 から・今の状態は しずかに', () => {
    const s = mk();
    s.record('break:dirt', 3);
    s.deserialize(undefined);
    s.events();
    expect(s.stat('break:dirt')).toBe(0);
    s.syncSilently({ level: 5, armor: [null, null, null, null] });
    expect(s.isUnlocked('level.5')).toBe(true);
    expect(s.pendingCount()).toBe(0);
    expect(s.events().every((e) => e.type !== 'unlock' || e.silent)).toBe(true);
  });
});

describe('じっせき ページの きまり', () => {
  it('？？？・赤い点・あたらしい は 離れると消える', () => {
    const s = mk();
    const p = new AchievementsPageModel(s);
    s.record('break:dirt', 1);
    s.record('place:dirt', 1);
    p.setTab('achievements');
    let ui = p.ui(true);
    expect(ui.categories.length).toBe(9);
    expect(ui.total).toBe(271); // 279 − 取っていない むかしの 8（COUNTRY-1 §5.2）
    expect(ui.tabDot).toBe(true);
    expect(ui.rows.some((r) => r.isNew)).toBe(true);
    expect(ui.rows.filter((r) => !r.shown).length).toBeGreaterThan(0);
    p.setCategory('おく');
    ui = p.ui(true);
    expect(ui.categories.find((c) => c.id === 'break')?.dot).toBe(false);
    expect(ui.categories.find((c) => c.id === 'place')?.dot).toBe(true);
    p.setTab('items');
    ui = p.ui(true);
    expect(ui.tabDot).toBe(false);
    expect(ui.badge.count).toBeGreaterThan(0);
  });
});

describe('ACH-NEXT: じっせき ページの 次の 1 段（#264）', () => {
  const setup = () => {
    const s = mk();
    const p = new AchievementsPageModel(s);
    p.setTab('achievements');
    return { s, p, row: (id: string) => p.ui(true).rows.find((r) => r.id === id)! };
  };
  it('段を取る → すぐ上の段だけ next・shown。2 段先と 1 段も取っていないシリーズは 隠す', () => {
    const { s, row } = setup();
    s.record('break:dirt', 1);
    expect(row('break.dirt.1')).toMatchObject({ unlocked: true, shown: true, next: false });
    expect(row('break.dirt.10')).toMatchObject({ unlocked: false, shown: true, next: true, isNew: false });
    expect(row('break.dirt.100')).toMatchObject({ unlocked: false, shown: false, next: false });
    expect(row('break.stone.1')).toMatchObject({ unlocked: false, shown: false, next: false });
    expect(row('break.stone.10')).toMatchObject({ shown: false, next: false });
  });
  it('次の段の行に 進み具合（いまの数・目標）が 出る。今の数は 目標で 頭打ち', () => {
    const { s, row } = setup();
    s.record('break:dirt', 3);
    expect(row('break.dirt.10')).toMatchObject({ next: true, progress: { now: 3, goal: 10 } });
    // 取った行・隠す行には 進み具合は つかない
    expect(row('break.dirt.1').progress).toBeUndefined();
    expect(row('break.dirt.100').progress).toBeUndefined();
    expect(row('break.stone.1').progress).toBeUndefined();
    // 次の段（goal 100）で 数が 多くても 目標で 頭打ち
    s.record('break:dirt', 7);
    expect(row('break.dirt.100')).toMatchObject({ next: true, progress: { now: 10, goal: 100 } });
  });
  it('一気に 2 段 取ると、次の段は その 1 つ上だけ', () => {
    const { s, row } = setup();
    s.record('break:dirt', 10);
    expect(row('break.dirt.1')).toMatchObject({ unlocked: true, next: false });
    expect(row('break.dirt.10')).toMatchObject({ unlocked: true, next: false, isNew: true });
    expect(row('break.dirt.100')).toMatchObject({ next: true, shown: true });
  });
  it('段を取ると 次の段は 普通の取った行になり、さらに 1 つ上が 次の段になる', () => {
    const { s, row } = setup();
    s.record('break:dirt', 1);
    expect(row('break.dirt.10').next).toBe(true);
    s.record('break:dirt', 9);
    expect(row('break.dirt.10')).toMatchObject({ unlocked: true, next: false, shown: true });
    expect(row('break.dirt.100')).toMatchObject({ unlocked: false, next: true, shown: true });
  });
  it('1 段だけの シリーズは 次の段なし。どの行も next でない', () => {
    const { s, p } = setup();
    s.record('place:furnace', 1);
    p.setCategory('おく');
    const rows = p.ui(true).rows;
    expect(rows.find((r) => r.id === 'place.furnace.1')).toMatchObject({ unlocked: true, next: false });
    expect(rows.some((r) => r.next)).toBe(false);
  });
  it('どの分類でも「取った」か「次の段」の行だけ shown。ほかは 隠す', () => {
    const { s, p } = setup();
    s.record('break:dirt', 1);
    s.record('place:dirt', 1);
    for (const c of ['こわす', 'おく', 'つくる']) {
      p.setCategory(c);
      for (const r of p.ui(true).rows) expect(r.shown, `${c} ${r.id}`).toBe(r.unlocked || r.next);
    }
  });
});

describe('WEAPON-2 の 実績 4 こ', () => {
  it('道具が こわれると tool.broken.1、防具は armor.broken.1（道具には 数えない）', () => {
    const a = mk();
    a.feedWear([{ type: 'wearLow', slot: 0 }]);
    expect(a.stat('toolBroken')).toBe(0);
    a.feedWear([{ type: 'toolBreak', slot: 3 }]);
    expect(a.stat('toolBroken')).toBe(1);
    expect(a.isUnlocked('tool.broken.1')).toBe(true);
    a.feedWear([{ type: 'toolBreak', slot: 'body' }]);
    expect(a.stat('toolBroken')).toBe(1);
    expect(a.stat('armorBroken')).toBe(1);
    expect(a.isUnlocked('armor.broken.1')).toBe(true);
    a.feedWorn(1000);
    expect(a.isUnlocked('tool.wearAll.1000')).toBe(true);
  });
  it('名前に 漢字なし', () => {
    for (const id of ['tool.broken.1', 'tool.broken.10', 'tool.wearAll.1000', 'armor.broken.1'])
      expect(ACHIEVEMENT_DEFS.find((d) => d.id === id)?.name).toMatch(/^[^一-鿿]+$/);
  });
});


describe('WEAPON-6 AC11b 実績 blade.combo3.1', () => {
  const hit = (step: number) => ({ type: 'techHit', step });
  const start = (step: number) => ({ type: 'techStart', step });
  const got = (s: AchievementSystem) => s.list().find((r) => r.id === 'blade.combo3.1')!;
  it('名前・小。1 回の 3 段で 1・2・3 段目が どれも 当たったら 手に入る', () => {
    const s = mk();
    expect(got(s).name).toBe('はじめて 3 だん わざ を ぜんぶ あてた！');
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'blade.combo3.1')!.small).toBe(true);
    s.feedBlade([start(1), hit(1), start(2), hit(2), start(3), hit(3)]);
    expect(got(s).unlocked).toBe(true);
  });
  it('3 段目だけ 外した・2 段目だけ 外した → 入らない。前の 段の 当たりは 持ちこさない', () => {
    const s = mk();
    s.feedBlade([start(1), hit(1), start(2), hit(2), start(3)]);
    s.feedBlade([start(1), hit(1), start(2), start(3), hit(3)]);
    s.feedBlade([start(1), start(2), hit(2), start(3), hit(3)]);
    expect(got(s).unlocked).toBe(false);
  });
});
