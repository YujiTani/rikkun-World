import { describe, expect, it } from 'vitest';
import type { MedalTier } from '../contracts';
import { ITEM_INFO } from '../craft/info';
import { itemDef } from '../content/items/registry';
import { itemType } from '../inventory/items';
import { DAMA, DAMA_HOUR } from './damaTuning';
import { SHOP_BOXES } from '../town/shop/shopTable';
import { shopTexts } from '../town/shop/shopText';
import { vendorTexts } from '../town/vendor/vendorText';
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

// ---------------------------------------------------------------- 道具: さいふの 係（1.6〔1F〕。もちものは 持たない）
/**
 * 1.6〔1F〕の 約束（実装は これに 合わせる。TOWN-1.md §2.3b・§3.4・§4.6・§4.12・§6.1）:
 *   new DamaService({ joined(who), screenOpen?(who), onGot?(who, n) }, seed)   もちもの・足もとの ポートは なくなる
 *   count(who)  さいふの 数（2P が いなくても のこる）  /  give(who, n) → { added, over }（2P が いなければ { 0, 0 }）
 *   spend(who, n) → boolean  /  max() → 上限（§4.12）  /  step()  1 ステップ すすめる（「＋」の のこりを へらす）
 *   hud(who) → { shown, total, text, plus, plusText, left } | null（2P が いなければ null）
 *   absorb({ p1, p2, world })  古い セーブの うつしかえ・もちものに のこった yokai_orb の 回収（上限で とまる・「＋」は 出さない）
 *   migrated() → boolean  さいふの 記録が ある（うつしかえ ずみ）か。古い セーブを deserialize した 直後は false、absorb で true
 *   serialize() / deserialize(data, achievements)  さいふの 数・うつしかえ ずみの 印も 入る
 */
type Who = 1 | 2;
interface Rig {
  s: DamaService;
  joined: { v: boolean };
  open: { 1: boolean; 2: boolean };
  got: { who: Who; n: number }[];
}
function rig(): Rig {
  const joined = { v: true };
  const open = { 1: false, 2: false };
  const got: { who: Who; n: number }[] = [];
  const ports: DamaPorts = {
    joined: (who) => who === 1 || joined.v,
    screenOpen: (who) => open[who],
    onGot: (who, n) => void got.push({ who, n }),
  };
  return { s: new DamaService(ports, 11), joined, open, got };
}
/** 「＋」が きえる まで すすめる（のこり 分。hud の left を 読む） */
function runOut(r: Rig, who: Who): void {
  for (let i = 0; i < 100_000 && r.s.hud(who)?.plus != null; i++) r.s.step();
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
  });
  it('2P が 参加して いなければ 2P には わたさない（1P は もらう）', () => {
    const r = rig();
    r.joined.v = false;
    kill(r, true, true);
    expect(r.s.count(1)).toBeGreaterThan(0);
    expect(r.s.count(2), '参加して いない 2P の さいふは ふえない').toBe(0);
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

// ---------------------------------------------------------------- AC3（1.6）: さいふは もちものと 関係なく ふえる
describe('AC3（1.6）: もちものが いっぱいでも さいふは ふえる（足もとに 落とさない）', () => {
  it('give は いつでも ぜんぶ さいふへ・おくれた 分は ない（added ＝ n・over ＝ 0）。1P・2P とも', () => {
    const r = rig();
    expect(r.s.give(1, 7)).toEqual({ added: 7, over: 0 });
    expect(r.s.give(2, 4)).toEqual({ added: 4, over: 0 });
    expect([r.s.count(1), r.s.count(2)]).toEqual([7, 4]);
  });
  it('妖怪・がしゃどくろ・実績は 表の 数だけ さいふが ふえる（もちものの 空きに よらない）', () => {
    const r = rig();
    r.s.fromYokai({ id: 5, kind: 'karakasa', title: 'none', hit1: true, hit2: false });
    expect(r.s.count(1)).toBe(damaForYokai(11, 5, 'none'));
    r.s.fromAchievement({ id: 'a.1', medal: 'bronze' }, false);
    expect(r.s.count(1)).toBe(damaForYokai(11, 5, 'none') + DAMA.medal.bronze);
  });
  it('0 以下・小数は 切りすてて 何も ふやさない', () => {
    const r = rig();
    expect(r.s.give(1, 0)).toEqual({ added: 0, over: 0 });
    expect(r.s.give(1, -3)).toEqual({ added: 0, over: 0 });
    expect(r.s.give(1, 2.9)).toEqual({ added: 2, over: 0 });
  });
});

// ---------------------------------------------------------------- AC62・AC63: さいふ・上限
describe('AC62・AC63: さいふで 数える・上限', () => {
  it('give(p, 5) → count が 5 ふえる。1P と 2P は 別々', () => {
    const r = rig();
    r.s.give(1, 5);
    expect([r.s.count(1), r.s.count(2)]).toEqual([5, 0]);
  });
  it('上限 − 2 で give(1, 5) → { added: 2, over: 3 }・count ＝ max・「＋」は 2', () => {
    const r = rig();
    r.s.give(1, r.s.max() - 2);
    runOut(r, 1);
    expect(r.s.give(1, 5)).toEqual({ added: 2, over: 3 });
    expect(r.s.count(1)).toBe(r.s.max());
    expect(r.s.hud(1)!.plus).toBe(2);
  });
  it('上限で give(1, 4) → { added: 0, over: 4 }・「＋」は 出ない（plus は null の まま）', () => {
    const r = rig();
    r.s.give(1, r.s.max());
    runOut(r, 1);
    expect(r.s.give(1, 4)).toEqual({ added: 0, over: 4 });
    expect(r.s.hud(1)!.plus).toBeNull();
    expect(r.s.hud(1)!.plusText).toBeNull();
  });
  it('上限から へらす → 上限 − 2（spend は ふつうに できる）', () => {
    const r = rig();
    r.s.give(1, r.s.max() + 10);
    expect(r.s.spend(1, 2)).toBe(true);
    expect(r.s.count(1)).toBe(r.s.max() - 2);
  });
  it('spend: たりなければ false・何も かわらない。ぴったりは true で 0', () => {
    const r = rig();
    r.s.give(1, 3);
    expect(r.s.spend(1, 4)).toBe(false);
    expect(r.s.count(1)).toBe(3);
    expect(r.s.spend(1, 3)).toBe(true);
    expect(r.s.count(1)).toBe(0);
  });
  it('上限は 6 けた（999,999）より 小さく ない', () => {
    expect(rig().s.max()).toBeGreaterThanOrEqual(999_999);
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
    expect([r.s.count(1), r.s.count(2)]).toEqual([DAMA.medal.silver, 0]);
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
    expect(hourEstimate().left).toBeGreaterThanOrEqual(SHOP_BOXES.obako.price);
  });
  it('入る 合計は 表の 数から（妖怪 ひき数 × へいきん ＋ 二つ名 ＋ 実績 ＋ めあて）', () => {
    const avg = (DAMA.normal.min + DAMA.normal.max) / 2;
    const e = hourEstimate();
    expect(e.income).toBe(DAMA_HOUR.yokai * avg + DAMA_HOUR.titled * DAMA.title.oyabun + DAMA_HOUR.achievement.count * DAMA_HOUR.achievement.average + DAMA_HOUR.meate.count * DAMA_HOUR.meate.average);
    expect(e.left).toBe(e.income - DAMA_HOUR.spend.food - DAMA_HOUR.spend.ofuda);
  });
  it('がしゃどくろは おおばこの ねだん × 3 以上', () => {
    expect(DAMA.gashadokuro).toBeGreaterThanOrEqual(SHOP_BOXES.obako.price * 3);
  });
});

// ---------------------------------------------------------------- AC50: 文
describe('AC50: 画面の 文は 「ようかいダマ」と 書く（「ダマ」だけの 略は なし）', () => {
  const rubyOff = (s: string): string => s.replace(/［([^｜］]*)｜[^］]*］/g, '$1');
  const lone = (s: string): boolean => /(?<!ようかい)ダマ/.test(rubyOff(s));
  it('文の 表・もちものの 名前・図鑑・説明・「どこで」に ひとりぼっちの「ダマ」が ない。名前は「ようかいダマ」', () => {
    const texts: string[] = [...Object.values(DAMA_TEXT), ...shopTexts(), ...vendorTexts()]; // 1C: よろずやの 画面の 文・1E: かじや・やたい・食事・おふだ
    texts.push(itemType('yokai_orb' as never)!.name);
    texts.push((itemDef('yokai_orb') as { zukan: string }).zukan);
    const info = ITEM_INFO.yokai_orb!;
    texts.push(info.use, info.how);
    for (const t of texts) expect(lone(t), t).toBe(false);
    expect(itemType('yokai_orb' as never)!.name).toBe('ようかいダマ');
    expect(DAMA_TEXT.name).toBe('ようかいダマ');
  });
});

// ---------------------------------------------------------------- AC28・AC67（1.6）: さいふの 保存
describe('AC28・AC67（1.6）: さいふの 保存', () => {
  const roundTrip = (r: Rig): Rig => {
    const q = rig();
    q.s.deserialize(JSON.parse(JSON.stringify(r.s.serialize())), []);
    return q;
  };
  it('1P 123・2P 45 で 保存 → 開きなおす → 123・45。うつしかえ ずみ', () => {
    const r = rig();
    r.s.give(1, 123);
    r.s.give(2, 45);
    const q = roundTrip(r);
    expect([q.s.count(1), q.s.count(2)]).toEqual([123, 45]);
    expect(q.s.migrated()).toBe(true);
  });
  it('べつの 世界（なにも 入れて いない）は 0・0', () => {
    const r = rig();
    expect([r.s.count(1), r.s.count(2)]).toEqual([0, 0]);
  });
  it('2P が やめる → 2P の 数は のこる（ふえない）→ 保存 → 開く → 2P が 参加 → 45。いない 間の 妖怪・実績で 2P は ふえない', () => {
    const r = rig();
    r.s.give(2, 45);
    r.joined.v = false;
    expect(r.s.hud(2), '2P が いなければ hud は null').toBeNull();
    r.s.fromYokai({ id: 5, kind: 'karakasa', title: 'none', hit1: true, hit2: true });
    r.s.fromAchievement({ id: 'a.1', medal: 'gold' }, false);
    expect(r.s.give(2, 9)).toEqual({ added: 0, over: 0 });
    expect(r.s.count(2)).toBe(45);
    const q = roundTrip(r);
    q.joined.v = false;
    expect(q.s.hud(2)).toBeNull();
    q.joined.v = true;
    expect(q.s.count(2)).toBe(45);
  });
  it('こわれた さいふの 記録（負・文字・無限）は 0 に する（落ちない）', () => {
    const q = rig();
    q.s.deserialize({ v: 1, given: [], legacy: null, wallet: { n1: -5, n2: 'x', moved: true } }, []);
    expect(q.s.count(1)).toBe(0);
    expect(q.s.count(2)).toBe(0);
  });
});

// ---------------------------------------------------------------- AC66: 古い セーブの うつしかえ
describe('AC66: 古い セーブの うつしかえ（1 回 だけ）', () => {
  const OLD = { p1: 3 + 20 + 0, p2: 7, world: 4 + 2 + 6 }; // 1P ホットバー 3・カバン 20 ／ 2P カバン 7 ／ 地面 4・ぶくろ 2・たんす 6
  const oldSave = (): Rig => {
    const r = rig();
    r.s.deserialize({ v: 1, given: [], legacy: null }, []); // さいふの 記録の ない 古い セーブ
    return r;
  };
  it('記録の ない セーブは うつしかえ まだ。absorb で 1P ＝ 3＋20＋4＋2＋6 ＝ 35・2P ＝ 7（2P が 参加して いなくても）', () => {
    const r = oldSave();
    r.joined.v = false;
    expect(r.s.migrated()).toBe(false);
    r.s.absorb(OLD);
    expect(r.s.count(1)).toBe(OLD.p1 + OLD.world);
    expect(r.s.count(1)).toBe(35);
    r.joined.v = true;
    expect(r.s.count(2)).toBe(7);
    expect(r.s.migrated()).toBe(true);
  });
  it('「＋」は 出ない（もらった のでは ない）', () => {
    const r = oldSave();
    r.s.absorb(OLD);
    expect(r.s.hud(1)!.plus).toBeNull();
    expect(r.got, 'もらった 音の 口も 鳴らさない').toEqual([]);
  });
  it('そのまま 保存 → 開きなおす → 35・7 の まま（ふえない）。同じ 古い セーブを もう 1 回 はじめから 開いても 35・7', () => {
    const r = oldSave();
    r.s.absorb(OLD);
    const q = rig();
    q.s.deserialize(JSON.parse(JSON.stringify(r.s.serialize())), []);
    expect(q.s.migrated()).toBe(true);
    expect([q.s.count(1), q.s.count(2)]).toEqual([35, 7]);
    const again = oldSave();
    again.s.absorb(OLD);
    expect([again.s.count(1), again.s.count(2)]).toEqual([35, 7]);
  });
  it('合計が 上限を こえる 古い セーブは max で とまる', () => {
    const r = oldSave();
    r.s.absorb({ p1: 900_000, p2: 0, world: 900_000 });
    expect(r.s.count(1)).toBe(r.s.max());
  });
  it('記録の ある セーブで もちものに のこった yokai_orb が 見つかっても 回収する（印は 見ない・「＋」なし）', () => {
    const r = rig();
    r.s.give(1, 10);
    runOut(r, 1);
    r.s.absorb({ p1: 5, p2: 0, world: 0 });
    expect(r.s.count(1)).toBe(15);
    expect(r.s.hud(1)!.plus).toBeNull();
  });
  it('あずかり（legacy）と 実績を わたした 記録は うつしかえで かわらない', () => {
    const r = rig();
    r.s.deserialize(null, [{ id: 'a', medal: 'gold', unlocked: true, quiet: false }]);
    const lg = r.s.legacy();
    const given = r.s.given();
    r.s.absorb(OLD);
    expect(r.s.legacy()).toBe(lg);
    expect(r.s.given()).toEqual(given);
  });
});

// ---------------------------------------------------------------- AC68: すみの 数と「＋」
describe('AC68: すみの 数と「＋」', () => {
  it('いつも shown・text ＝ count の 3 けた「,」（0 でも 出る）', () => {
    const r = rig();
    expect(r.s.hud(1)).toMatchObject({ shown: true, total: 0, text: '0', plus: null, plusText: null, left: 0 });
    r.s.give(1, 1234);
    expect(r.s.hud(1)).toMatchObject({ total: 1234, text: '1,234' });
  });
  it('give(1, 5) → その ステップで plusText "+5"・left ＝ 表の 長さ。60 ステップ 後に give(1, 3) → plus 8・left は もどる', () => {
    const r = rig();
    r.s.give(1, 5);
    const L = r.s.hud(1)!.left;
    expect(L, '§4.12 の 長さ').toBeGreaterThan(60);
    expect(r.s.hud(1)).toMatchObject({ plus: 5, plusText: '+5' });
    for (let i = 0; i < 60; i++) r.s.step();
    expect(r.s.hud(1)!.left).toBe(L - 60);
    r.s.give(1, 3);
    expect(r.s.hud(1)).toMatchObject({ plus: 8, plusText: '+8', left: L });
  });
  it('さいごに もらって L−1 ステップ目は plus 8・L ステップ目で null（shown は true・text は のこる）', () => {
    const r = rig();
    r.s.give(1, 8);
    const L = r.s.hud(1)!.left;
    for (let i = 0; i < L - 1; i++) r.s.step();
    expect(r.s.hud(1)!.plus).toBe(8);
    r.s.step();
    expect(r.s.hud(1)).toMatchObject({ shown: true, plus: null, plusText: null, left: 0, text: '8' });
    r.s.give(1, 2);
    expect(r.s.hud(1)!.plus, 'きえたら つぎは 0 から').toBe(2);
  });
  it('「＋」の 字は 3 けたごとに「,」（+1,234）', () => {
    const r = rig();
    r.s.give(1, 1234);
    expect(r.s.hud(1)!.plusText).toBe('+1,234');
  });
  it('へる（こうかん）→ text だけ かわり「＋」は 出ない・出て いる「＋」も かわらない', () => {
    const r = rig();
    r.s.give(1, 10);
    runOut(r, 1);
    r.s.spend(1, 4);
    expect(r.s.hud(1)).toMatchObject({ text: '6', plus: null });
    r.s.give(1, 3);
    r.s.spend(1, 2);
    expect(r.s.hud(1)).toMatchObject({ text: '7', plus: 3 });
  });
  it('画面を 開いて いる 間は shown false・とじると true（「＋」の のこりは 進む）', () => {
    const r = rig();
    r.s.give(1, 5);
    r.open[1] = true;
    expect(r.s.hud(1)!.shown).toBe(false);
    expect(r.s.hud(1)!.text).toBe('5');
    r.s.step();
    r.open[1] = false;
    expect(r.s.hud(1)).toMatchObject({ shown: true, plus: 5 });
  });
  it('2 人で 1P だけ 画面を 開く → hud(1).shown false・hud(2).shown true', () => {
    const r = rig();
    r.open[1] = true;
    expect(r.s.hud(1)!.shown).toBe(false);
    expect(r.s.hud(2)!.shown).toBe(true);
  });
  it('2 人で give(1, 5) → hud(2).plus は null の まま', () => {
    const r = rig();
    r.s.give(1, 5);
    expect(r.s.hud(2)!.plus).toBeNull();
    expect(r.s.hud(1)!.plus).toBe(5);
  });
  it('妖怪・実績・がしゃどくろも おなじ「＋」（がしゃどくろ 300 も 同じ 形）', () => {
    const r = rig();
    r.s.fromGashadokuro({ hit1: true, hit2: false });
    expect(r.s.hud(1)!.plus).toBe(DAMA.gashadokuro);
  });
});

// ---------------------------------------------------------------- AC70: 文
describe('AC70（1.6）: すみの 札の 字', () => {
  it('hud の text・plusText は 数・「,」・「+」だけ（999,999 でも）', () => {
    const r = rig();
    r.s.give(1, r.s.max());
    const h = r.s.hud(1)!;
    expect(h.text).toMatch(/^[0-9,]+$/);
    expect(h.plusText).toMatch(/^\+[0-9,]+$/);
    expect(h.text).toBe('999,999');
  });
});
