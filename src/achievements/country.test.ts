import { describe, expect, it } from 'vitest';
import type { WorldRegions } from '../contracts';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { COUNTRY_KINDS } from '../world/gen/biome';
import { AchievementSystem, type StepContext } from './AchievementSystem';
import { ACHIEVEMENT_DEFS } from './defs';
import { AchievementsPageModel } from './pageModel';

/** #291 COUNTRY-1 AC14〜AC18（docs/design/COUNTRY-1.md §4.3・§5） */
const mk = () => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
const ctx = (o: Partial<StepContext> = {}): StepContext => ({
  tick: 0, day: 0, mode: 'play', screenSteps: 1, position: { x: 0, y: 10, z: 0 }, velocityY: 0, onGround: true, inWater: false,
  dead: false, yokai: [], level: 1, armor: [null, null, null, null], regions: null, peak: null, ...o,
});
const LEGACY = ['mountain', 'forest', 'meadow', 'flat', 'spring', 'pond', 'river'].map((n) => `visit.${n}.1`).concat('visit.all.9');
const roundTrip = (s: AchievementSystem) => {
  const t = mk();
  t.deserialize(JSON.parse(JSON.stringify(s.serialize())));
  return t;
};

describe('実績の表（AC16）', () => {
  it('国 12 ＋ ぜんぶ 1 ＋ うみ・てっぺん。古い 8 つは legacy。ぜんぶで 278（main の GOLD-1 ＋4 込み）', () => {
    expect(ACHIEVEMENT_DEFS.length).toBe(282); // #293 の defeat.gashadokuro ＋1 込み
    for (const k of COUNTRY_KINDS) {
      const d = ACHIEVEMENT_DEFS.find((x) => x.id === `visit.country.${k}.1`)!;
      expect(d, k).toBeTruthy();
      expect(d.category).toBe('places');
      expect(d.small).toBe(false);
      expect(d.medal).toBe('gold');
      expect(d.name).toMatch(/^はじめて .+ に きた！$/);
    }
    const all = ACHIEVEMENT_DEFS.find((d) => d.id === 'visit.countries.12')!;
    expect(all.small).toBe(false);
    expect(all.name).toBe('ぜんぶの くに に いった！');
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'visit.country.susuki.1')!.name).toBe('はじめて すすきの はら に きた！');
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'visit.sea.1')!.legacy).toBeFalsy();
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'visit.peak.1')!.legacy).toBeFalsy();
    expect(ACHIEVEMENT_DEFS.filter((d) => d.legacy).map((d) => d.id).sort()).toEqual([...LEGACY].sort());
  });
  it('regions の 円・長方形の中を ぜんぶ 歩いても 古い 8 つは 0 こ・visit:all は ふえない。うみ は 取れる', () => {
    const regions: WorldRegions = {
      center: { x: 64, z: 64 }, startH0: 10,
      mountain: { cx: 90, cz: 90, r: 10, peak: { x: 90, z: 90, h: 30 } }, rock: { cx: 0, cz: 0, r: 3 }, forest: { cx: 30, cz: 30, r: 8 },
      flat: { x0: 50, z0: 50, x1: 60, z1: 60 }, spring: { cx: 64, cz: 64, r: 3 }, river: [{ x0: 1, z0: 1, x1: 5, z1: 5 }],
      meadow: { cx: 100, cz: 20, r: 6 }, pond: { cx: 20, cz: 100, r: 5 },
    };
    const s = mk();
    const spots: Array<[number, number, number]> = [[30, 10, 30], [90, 40, 90], [100, 10, 20], [55, 10, 55], [64, 10, 64], [20, 10, 100], [3, 10, 3]];
    for (const [x, y, z] of spots) s.update(ctx({ regions, position: { x, y, z } }));
    for (const id of LEGACY) expect(s.isUnlocked(id), id).toBe(false);
    expect(s.isUnlocked('visit.peak.1')).toBe(false); // 古い regions の 頂上では 取れない
    expect(s.stat('visit:all')).toBe(0);
    s.update(ctx({ regions, position: { x: 0, y: 10, z: 0 }, inWater: true }));
    expect(s.isUnlocked('visit.sea.1')).toBe(true);
    // legacy は 記録が とどいても 取れない
    s.record('visit:mountain', 1);
    s.record('visit:all', 9);
    for (const id of LEGACY) expect(s.isUnlocked(id), id).toBe(false);
  });
});

describe('visit.peak は 山の国の 頂上（AC18）', () => {
  it('頂上から 横 3 以内で 足の高さ ≥ h で 取れる。それより遠い・低いと 取れない', () => {
    const peak = { x: 500, z: 700, h: 120 };
    const s = mk();
    s.update(ctx({ peak, position: { x: 504, y: 125, z: 700 } }));
    s.update(ctx({ peak, position: { x: 501, y: 119, z: 700 } }));
    expect(s.isUnlocked('visit.peak.1')).toBe(false);
    s.update(ctx({ peak, position: { x: 502, y: 120, z: 702 } }));
    expect(s.isUnlocked('visit.peak.1')).toBe(true);
    const t = mk();
    t.update(ctx({ peak: null, position: { x: 500, y: 200, z: 700 } }));
    expect(t.isUnlocked('visit.peak.1')).toBe(false);
  });
});

describe('見つけた国の並び（AC14・AC15）', () => {
  it('enterCountry: 新しければ true・もう あれば false。記録と実績が そろう。ふつうは pending に入る', () => {
    const s = mk();
    expect(s.found()).toEqual([]);
    expect(s.enterCountry('mori', false)).toBe(true);
    expect(s.enterCountry('mori', false)).toBe(false);
    expect(s.found()).toEqual(['mori']);
    expect(s.stat('country:mori')).toBe(1);
    expect(s.stat('country:all')).toBe(1);
    expect(s.isUnlocked('visit.country.mori.1')).toBe(true);
    expect(s.pendingIds()).toContain('visit.country.mori.1');
    expect(s.enterCountry('nanika', false)).toBe(false);
  });
  it('silent: 実績は 取るが pending に 入らない・見せたことに なる', () => {
    const s = mk();
    expect(s.enterCountry('hana', true)).toBe(true);
    expect(s.isUnlocked('visit.country.hana.1')).toBe(true);
    expect(s.pendingIds()).toEqual([]);
    expect(s.events().every((e) => e.type !== 'unlock' || e.silent)).toBe(true);
  });
  it('12 国 そろうと visit.countries.12 が 1 回だけ。主役は 先に取った方', () => {
    const s = mk();
    s.setFound(COUNTRY_KINDS.filter((k) => k !== 'yuki'));
    expect(s.pendingIds()).toEqual([]);
    expect(s.isUnlocked('visit.countries.12')).toBe(false);
    s.enterCountry('yuki', false);
    expect(s.pendingIds()).toEqual(['visit.country.yuki.1', 'visit.countries.12']);
    expect(s.enterCountry('yuki', false)).toBe(false);
    expect(s.unlockedCount()).toBe(13);
  });
  it('setFound: 並びを 入れかえ、記録を そろえる（しずか）。空にしても 取った実績は 消えない。harappa は 足さない', () => {
    const s = mk();
    s.setFound(['take', 'mori']);
    expect(s.found()).toEqual(['take', 'mori']);
    expect(s.stat('country:all')).toBe(2);
    expect(s.pendingIds()).toEqual([]);
    expect(s.isUnlocked('visit.country.take.1')).toBe(true);
    s.setFound([]);
    expect(s.found()).toEqual([]);
    expect(s.stat('country:take')).toBe(0);
    expect(s.stat('country:all')).toBe(0);
    expect(s.isUnlocked('visit.country.take.1')).toBe(true);
  });
  it('syncSilently: はらっぱ を 先頭に しずかに 足す。reset では 足さない', () => {
    const s = mk();
    s.reset();
    expect(s.found()).toEqual([]);
    s.enterCountry('mori', true);
    s.syncSilently({ level: 1, armor: [null, null, null, null] });
    expect(s.found()).toEqual(['harappa', 'mori']);
    expect(s.isUnlocked('visit.country.harappa.1')).toBe(true);
    expect(s.pendingIds()).toEqual([]);
    s.syncSilently({ level: 1, armor: [null, null, null, null] });
    expect(s.found()).toEqual(['harappa', 'mori']);
  });
  it('AC14: セーブして 開きなおすと 同じ並び', () => {
    const s = mk();
    s.syncSilently({ level: 1, armor: [null, null, null, null] });
    s.enterCountry('yuki', false);
    s.enterCountry('hana', false);
    const t = roundTrip(s);
    expect(t.found()).toEqual(['harappa', 'yuki', 'hana']);
    expect(t.stat('country:all')).toBe(3);
    expect(t.isUnlocked('visit.country.yuki.1')).toBe(true);
  });
  it('AC14: 古いセーブ 3 つの形', () => {
    // (1) foundCountries も country:* も ない
    const a = mk();
    a.deserialize({ v: 1, stats: { 'break:dirt': 3 }, unlocked: {}, seen: [], viewed: [], pending: [] });
    expect(a.found()).toEqual([]);
    a.syncSilently({ level: 1, armor: [null, null, null, null] });
    expect(a.found()).toEqual(['harappa']);
    expect(a.isUnlocked('visit.country.harappa.1')).toBe(true);
    expect(a.pendingIds()).toEqual([]);
    // (2) foundCountries が ある（ふえた 記録は 並びに あわせる）
    const b = mk();
    b.deserialize({ v: 1, stats: { 'country:all': 7, 'country:yuki': 1 }, foundCountries: ['mori', 'take', 'bogus', 'mori'], unlocked: {}, seen: [], viewed: [], pending: [] });
    expect(b.found()).toEqual(['mori', 'take']);
    expect(b.stat('country:yuki')).toBe(0);
    expect(b.stat('country:all')).toBe(2);
    expect(b.stat('country:mori')).toBe(1);
    // (3) foundCountries が なく country:* だけ → COUNTRY_KINDS の順
    const c = mk();
    c.deserialize({ v: 1, stats: { 'country:yuki': 1, 'country:mori': 1 }, unlocked: {}, seen: [], viewed: [], pending: [] });
    expect(c.found()).toEqual(['mori', 'yuki']);
    c.syncSilently({ level: 1, armor: [null, null, null, null] });
    expect(c.found()).toEqual(['harappa', 'mori', 'yuki']);
    expect(() => mk().deserialize({ foundCountries: 5 })).not.toThrow();
    expect(() => mk().deserialize({ foundCountries: [1, null, 'mori'] })).not.toThrow();
  });
  it('AC15: foundCountries が あって harappa が ない セーブは ロードのあと syncSilently で 先頭に 足す', () => {
    const s = mk();
    s.deserialize({ v: 1, stats: {}, foundCountries: ['take', 'mori'], unlocked: {}, seen: [], viewed: [], pending: [] });
    s.syncSilently({ level: 1, armor: [null, null, null, null] });
    expect(s.found()).toEqual(['harappa', 'take', 'mori']);
  });
});

describe('むかしの ばしょ（AC17）', () => {
  it('restoreLegacy → 保存・開きなおしても へらない。ページには 取った むかしの分だけ・N にも 数える', () => {
    const s = mk();
    s.restoreLegacy(['visit.forest.1', 'visit.all.9', 'visit.nothing.1', 'visit.sea.1']);
    expect(s.isUnlocked('visit.forest.1')).toBe(true);
    expect(s.isUnlocked('visit.all.9')).toBe(true);
    expect(s.isUnlocked('visit.sea.1')).toBe(false); // legacy でない物は 対象外
    expect(s.pendingIds()).toEqual([]);
    const t = roundTrip(s);
    expect(t.isUnlocked('visit.forest.1')).toBe(true);
    expect(t.isUnlocked('visit.all.9')).toBe(true);
    const p = new AchievementsPageModel(t);
    p.setTab('achievements');
    p.setCategory('ばしょ');
    const ui = p.ui(true);
    expect(ui.total).toBe(282 - 8 + 2);
    const ids = ui.rows.map((r) => r.id);
    expect(ids.filter((i) => LEGACY.includes(i))).toEqual(['visit.forest.1', 'visit.all.9']);
    expect(ids.slice(-2)).toEqual(['visit.forest.1', 'visit.all.9']); // いちばん下
    expect(ui.rows.slice(-2).every((r) => r.legacy)).toBe(true);
    expect(ui.rows.filter((r) => !r.legacy)).toHaveLength(15);
    // 何も 取っていなければ 取れる 数だけ
    const q = new AchievementsPageModel(mk());
    q.setTab('achievements');
    expect(q.ui(true).total).toBe(274);
  });
});
