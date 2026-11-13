import { describe, expect, it } from 'vitest';
import type { MedalTier } from '../contracts';
import { ITEM_INFO } from '../craft/info';
import { itemDef } from '../content/items/registry';
import { itemType } from '../inventory/items';
import { DAMA, DAMA_HOUR, OBAKO_PRICE_REF } from './damaTuning';
import { DAMA_TEXT } from './damaText';
import {
  DamaService,
  damaForGashadokuro,
  damaForMedal,
  damaForYokai,
  hourEstimate,
  legacyDama,
  type DamaPorts,
} from './dama';

/**
 * TOWN-1 区切り 1A（docs/design/TOWN-1.md §2.3・§2.4・§4.1・§4.6・§5）のユニットテスト。
 * 数は 決め打ちせず 表（DAMA・DAMA_HOUR）から 読む（#311）。
 * AC1（数）・AC2（だれが もらう）・AC3（いっぱい）・AC4（実績）・AC5（あずかり）・AC28（保存）・AC31（見つもり）・AC50（文）。
 */

// ---------------------------------------------------------------- 道具: 小さな 持ち物（定員つき）と 足もと
function bag(room: number) {
  let n = 0;
  return {
    inv: {
      add: (_item: string, c: number): number => {
        const put = Math.min(room - n, c);
        n += put;
        return c - put;
      },
      count: (): number => n,
    },
    get n() {
      return n;
    },
    set room(v: number) {
      room = v;
    },
  };
}

interface Rig {
  s: DamaService;
  bags: { 1: ReturnType<typeof bag>; 2: ReturnType<typeof bag> };
  floor: { 1: number; 2: number };
  joined: { v: boolean };
}
function rig(room = 9999): Rig {
  const bags = { 1: bag(room), 2: bag(room) };
  const floor = { 1: 0, 2: 0 };
  const joined = { v: true };
  const ports: DamaPorts = {
    inventory: (who) => (who === 1 ? bags[1].inv : joined.v ? bags[2].inv : null),
    dropAtFeet: (who, count) => {
      floor[who] += count;
    },
  };
  return { s: new DamaService(ports, 11), bags, floor, joined };
}

// ---------------------------------------------------------------- AC1: ようかいダマの 数（§4.1 の 表）
describe('AC1: 妖怪の ようかいダマの 数', () => {
  it('ふつうの 妖怪は 表の はんい（1〜3）で、同じ シード・同じ 妖怪なら いつも 同じ 数', () => {
    for (let id = 1; id <= 200; id++) {
      const n = damaForYokai(11, id, 'none');
      expect(n).toBeGreaterThanOrEqual(DAMA.normal.min);
      expect(n).toBeLessThanOrEqual(DAMA.normal.max);
      expect(damaForYokai(11, id, 'none')).toBe(n);
    }
  });
  it('1,000 ひきで 表の 数が それぞれ 1/3 ± 0.05（へいきん 2）', () => {
    const span = DAMA.normal.max - DAMA.normal.min + 1;
    const cnt = new Map<number, number>();
    let sum = 0;
    for (let id = 1; id <= 1000; id++) {
      const n = damaForYokai(7, id, 'none');
      cnt.set(n, (cnt.get(n) ?? 0) + 1);
      sum += n;
    }
    for (let v = DAMA.normal.min; v <= DAMA.normal.max; v++) expect(Math.abs((cnt.get(v) ?? 0) / 1000 - 1 / span)).toBeLessThan(0.05);
    expect(sum / 1000).toBeCloseTo((DAMA.normal.min + DAMA.normal.max) / 2, 1);
  });
  it('おやぶん・たいしょう・ヌシ・がしゃどくろ・4 大妖怪は 表の 数（二つ名は シードに よらない）', () => {
    for (const id of [1, 2, 99]) {
      expect(damaForYokai(11, id, 'oyabun')).toBe(DAMA.title.oyabun);
      expect(damaForYokai(11, id, 'taisho')).toBe(DAMA.title.taisho);
      expect(damaForYokai(11, id, 'nushi')).toBe(DAMA.title.nushi);
    }
    expect(damaForGashadokuro()).toBe(DAMA.gashadokuro);
    expect(DAMA.title.oyabun).toBeLessThan(DAMA.title.taisho);
    expect(DAMA.title.taisho).toBeLessThan(DAMA.title.nushi);
    expect(DAMA.gashadokuro).toBe(300); // 決定「300個くらい」
  });
  it('二つ名は 二つ名が つかない 大妖怪より 少ない（二つ名と 大妖怪は 重ならない）', () => {
    expect(DAMA.daiyokai4).toBeGreaterThan(DAMA.title.nushi);
    expect(DAMA.gashadokuro).toBeGreaterThan(DAMA.daiyokai4);
  });
});

// ---------------------------------------------------------------- AC2: だれが もらう
describe('AC2: 当てた 人 ぜんいんが もらう', () => {
  const kill = (r: Rig, hit1: boolean, hit2: boolean) => r.s.fromYokai({ id: 5, kind: 'karakasa', title: 'none', hit1, hit2 });
  it('2 人とも 当てた → 2 人とも 同じ 数', () => {
    const r = rig();
    kill(r, true, true);
    expect(r.s.count(1)).toBe(damaForYokai(11, 5, 'none'));
    expect(r.s.count(2)).toBe(r.s.count(1));
  });
  it('1P だけ → 2P は ふえない / 2P だけ → 1P は ふえない', () => {
    const a = rig();
    kill(a, true, false);
    expect(a.s.count(1)).toBeGreaterThan(0);
    expect(a.s.count(2)).toBe(0);
    const b = rig();
    kill(b, false, true);
    expect(b.s.count(1)).toBe(0);
    expect(b.s.count(2)).toBeGreaterThan(0);
  });
  it('だれも 当てずに 消えた（朝に 帰った・水や 落下）→ 0', () => {
    const r = rig();
    kill(r, false, false);
    expect(r.s.count(1)).toBe(0);
    expect(r.s.count(2)).toBe(0);
    expect(r.floor).toEqual({ 1: 0, 2: 0 });
  });
  it('2P が 参加して いなければ 2P には わたさない（1P は もらう）', () => {
    const r = rig();
    r.joined.v = false;
    kill(r, true, true);
    expect(r.s.count(1)).toBeGreaterThan(0);
    expect(r.bags[2].n).toBe(0);
    expect(r.floor[2]).toBe(0);
  });
  it('がしゃどくろも 当てた 人 ぜんいんに 表の 数', () => {
    const r = rig();
    r.s.fromGashadokuro({ hit1: true, hit2: true });
    expect([r.s.count(1), r.s.count(2)]).toEqual([DAMA.gashadokuro, DAMA.gashadokuro]);
    const q = rig();
    q.s.fromGashadokuro({ hit1: false, hit2: true });
    expect([q.s.count(1), q.s.count(2)]).toEqual([0, DAMA.gashadokuro]);
  });
});

// ---------------------------------------------------------------- AC3: もちものが いっぱい
describe('AC3: もちものが いっぱいの とき 足もとに 落ちる', () => {
  it('入らない 分は その 人の 足もとに 落ち、入った 分だけ ふえる（何も なくならない）', () => {
    const r = rig(3);
    r.s.give(1, 5);
    expect(r.s.count(1)).toBe(3);
    expect(r.floor[1]).toBe(2);
    expect(r.s.count(1) + r.floor[1]).toBe(5);
    expect(r.floor[2]).toBe(0);
  });
  it('ぜんぶ 入らない ときは ぜんぶ 足もとへ。2P も 同じ（2P の 足もとへ）', () => {
    const r = rig(0);
    r.s.give(2, 4);
    expect(r.floor[2]).toBe(4);
    expect(r.floor[1]).toBe(0);
  });
  it('ひろうと 数が ふえる（足もとの 物は ふつうの アイテムなので 持ち物の add で 入る）', () => {
    const r = rig(3);
    r.s.give(1, 5);
    r.bags[1].room = 99;
    expect(r.bags[1].inv.add('yokai_orb', r.floor[1])).toBe(0);
    expect(r.s.count(1)).toBe(5);
  });
});

// ---------------------------------------------------------------- AC4: 実績
describe('AC4: 実績の ようかいダマ', () => {
  const MEDALS: MedalTier[] = ['bronze', 'silver', 'gold', 'rainbow'];
  const def = (id: string, medal: MedalTier) => ({ id, medal });
  it('メダルごとに 表の 数・しずかに とった 実績は 0', () => {
    for (const m of MEDALS) expect(damaForMedal(m)).toBe(DAMA.medal[m]);
    expect(DAMA.quiet).toBe(0);
    const r = rig();
    r.s.fromAchievement(def('a.1', 'gold'), true);
    expect(r.s.count(1)).toBe(DAMA.quiet);
    expect(r.s.given()).not.toContain('a.1'); // しずかな 分は わたした ことに しない（あずかりにも 数えない）
  });
  it('1P だけ（2P いない）は 1P だけ・2P 参加中は 2 人とも 同じ 数', () => {
    const r = rig();
    r.joined.v = false;
    expect(r.s.fromAchievement(def('a.1', 'silver'), false)).toBe(DAMA.medal.silver);
    expect([r.s.count(1), r.bags[2].n]).toEqual([DAMA.medal.silver, 0]);
    r.joined.v = true;
    r.s.fromAchievement(def('a.2', 'rainbow'), false);
    expect([r.s.count(1), r.s.count(2)]).toEqual([DAMA.medal.silver + DAMA.medal.rainbow, DAMA.medal.rainbow]);
  });
  it('同じ 実績の ダマは 1 回だけ（わたした 記録）', () => {
    const r = rig();
    r.s.fromAchievement(def('a.1', 'bronze'), false);
    expect(r.s.fromAchievement(def('a.1', 'bronze'), false)).toBe(0);
    expect(r.s.count(1)).toBe(DAMA.medal.bronze);
  });
});

// ---------------------------------------------------------------- AC5（1A の 分）: あずかり
describe('AC5: 前の セーブの あずかり（計算と 保存まで）', () => {
  const ach = (id: string, medal: MedalTier, unlocked = true) => ({ id, medal, unlocked, quiet: false });
  it('どう 2・きん 1 → どう×2 ＋ きん×1（表の 数）', () => {
    const list = [ach('a', 'bronze'), ach('b', 'bronze'), ach('c', 'gold'), ach('d', 'silver', false)];
    expect(legacyDama(list)).toBe(2 * DAMA.medal.bronze + DAMA.medal.gold);
  });
  it('しずかに とる 実績（はじまりの はらっぱ）は 数えない', () => {
    expect(legacyDama([{ id: 'q', medal: 'gold', unlocked: true, quiet: true }])).toBe(0);
  });
  it('記録の ない セーブ（null・{}）を 開くと あずかり ＝ 計算の 数。2P の 記録は 今から。数が 0 なら null', () => {
    const r = rig();
    r.s.deserialize(null, [ach('a', 'bronze'), ach('c', 'gold')]);
    expect(r.s.legacy()).toBe(DAMA.medal.bronze + DAMA.medal.gold);
    expect(r.s.count(1)).toBe(0); // 1A では わたさない（ものしりさん 1D）
    const q = rig();
    q.s.deserialize(undefined, []);
    expect(q.s.legacy()).toBeNull();
  });
  it('わたした 実績は あずかりに 入れない・古い セーブの 実績は ぜんぶ「わたした」ことに する（あとから 二重に もらわない）', () => {
    const r = rig();
    r.s.deserialize(null, [ach('a', 'bronze')]);
    expect(r.s.given()).toContain('a');
    expect(r.s.fromAchievement({ id: 'a', medal: 'bronze' }, false)).toBe(0);
  });
  it('記録の ある セーブでは あずかりを 計算しなおさない', () => {
    const r = rig();
    r.s.deserialize({ v: 1, given: ['x'], legacy: 7 }, [ach('a', 'gold')]);
    expect(r.s.legacy()).toBe(7);
    expect(r.s.given()).toEqual(['x']);
  });
});

// ---------------------------------------------------------------- AC28: 保存
describe('AC28: 保存（1A の 分: わたした 記録・あずかり）', () => {
  it('serialize → deserialize で 同じ（記録つきなので 古い セーブ あつかいに ならない）', () => {
    const r = rig();
    r.s.fromAchievement({ id: 'a.1', medal: 'gold' }, false);
    r.s.setLegacy(14);
    const data = r.s.serialize();
    const q = rig();
    q.s.deserialize(JSON.parse(JSON.stringify(data)), [{ id: 'zz', medal: 'gold', unlocked: true, quiet: false }]);
    expect(q.s.given()).toEqual(['a.1']);
    expect(q.s.legacy()).toBe(14);
  });
  it('こわれた データは 古い セーブと 同じ あつかい（落ちない）', () => {
    const q = rig();
    q.s.deserialize({ v: 1, given: 'x', legacy: 'y' }, []);
    expect(q.s.given()).toEqual([]);
    expect(q.s.legacy()).toBeNull();
  });
});

// ---------------------------------------------------------------- AC31: たまる 速さ
describe('AC31: 1 時間の 見つもり（表から 計算）', () => {
  it('食事・おふだを 引いても おおばこ 1 回（ねだん）以上', () => {
    expect(hourEstimate().left).toBeGreaterThanOrEqual(OBAKO_PRICE_REF);
  });
  it('入る 合計は 表の 数から（妖怪 ひき数 × へいきん ＋ 二つ名 ＋ 実績 ＋ めあて）', () => {
    const avg = (DAMA.normal.min + DAMA.normal.max) / 2;
    const e = hourEstimate();
    expect(e.income).toBe(DAMA_HOUR.yokai * avg + DAMA_HOUR.titled * DAMA.title.oyabun + DAMA_HOUR.achievement.count * DAMA_HOUR.achievement.average + DAMA_HOUR.meate.count * DAMA_HOUR.meate.average);
    expect(e.left).toBe(e.income - DAMA_HOUR.spend.food - DAMA_HOUR.spend.ofuda);
  });
  it('がしゃどくろは おおばこの ねだん × 3 以上', () => {
    expect(DAMA.gashadokuro).toBeGreaterThanOrEqual(OBAKO_PRICE_REF * 3);
  });
});

// ---------------------------------------------------------------- AC50: 文
describe('AC50: 画面の 文は 「ようかいダマ」と 書く（「ダマ」だけの 略は なし）', () => {
  const rubyOff = (s: string): string => s.replace(/［([^｜］]*)｜[^］]*］/g, '$1');
  const lone = (s: string): boolean => /(?<!ようかい)ダマ/.test(rubyOff(s));
  it('文の 表・もちものの 名前・図鑑・説明・「どこで」に ひとりぼっちの「ダマ」が ない。名前は「ようかいダマ」', () => {
    const texts: string[] = [...Object.values(DAMA_TEXT)];
    texts.push(itemType('yokai_orb' as never)!.name);
    texts.push((itemDef('yokai_orb') as { zukan: string }).zukan);
    const info = ITEM_INFO.yokai_orb!;
    texts.push(info.use, info.how);
    for (const t of texts) expect(lone(t), t).toBe(false);
    expect(itemType('yokai_orb' as never)!.name).toBe('ようかいダマ');
    expect(DAMA_TEXT.name).toBe('ようかいダマ');
  });
});
