import { describe, expect, it } from 'vitest';
import type { AnimalEvent } from '../contracts';
import { OFFSET, normalize, r6, setupDuo, type DuoS, type Who } from './duoKit';

/**
 * COOP-1 5c（docs/design/COOP-1.md 1.15 §3.7 (d)・§8・§9.11・§10・§12.0、AC152・AC153・AC158・AC139）の 先行テスト（赤）。
 * 「だっこ・なげる・おろす」を 人ごとに。にわとり・小屋は 世界に 1 つ（本物の `AnimalManager` 1 つを 2 人で 使う）。
 * 数は ぜんぶ 設定（createLiveSettings）から 読む。1P と 2P で 同じ 部品を 使う 約束 = 同じ 場面を 1P と 2P で 動かして 結果を くらべる
 * （2P の 場所は 1P の +OFFSET。式の コピーが あれば 食いちがう）。
 *
 * ---- 実装への 約束（仕様 §8「5c（1.15）」の とおり。道具の 側の 約束は src/animals/duoKit.ts の 頭）----
 *   AnimalManager の 人の ある 口は 最後に 省ける `who: 1 | 2 = 1`（省くと 今と 同じ 動き）:
 *     carrying(who)・carryHold(id, heldTicks, who)・putDown(spot, who)・putDownWhy(who)・dropCarried(spot, who)・
 *     throwSpot(aim, who)・startThrow(aim, who)・throwTo(x, y, z, who)・emitHint(h, who)
 *   - だっこは 人ごとに 1 羽（`carriedId` を 人ごと）。だっこ中の 羽は だっこ した 人の 足もと（`playerOf(who)`）に ついて いく。
 *   - 着地点・なげる とびかた・そっと おろす・さくの 先・小屋の 上限（coopMax・animalFriendMax）の 計算は 1P と 同じ 部品。人の 場所だけ だっこ した 人。
 *   - 2P の 口を 通した 出来事（carry・toss・putDown・hint）には `by: 2` が つく。1P の 物には `by` の キーが ない（`'by' in e` が false）。
 *   - 合図（hint）は 人ごと: 2P の 合図は `lastHint()`（1P の 物）を 書かない。出来事 `{ type: 'hint', hint, by: 2 }` だけ。
 *   - 2P が いない（playerOf(2) が null）とき who 2 の 口は 何も しない（null / false）。
 */

const wildCarry = (s: DuoS, w: Who) => {
  const id = s.wild(w);
  s.m.carryHold(id, 0, w); // 新しい 押しの はじまり（rightFirst と 同じ）
  return id;
};
const lift = (s: DuoS, w: Who, dx = -1, dz = 0) => {
  const id = s.friend(w, dx, dz);
  expect(s.m.carryHold(id, s.hold, w), `${w}P の だっこ`).toBe('lifted');
  return id;
};
const byOf = (e: AnimalEvent): unknown => ('by' in e ? (e as { by?: unknown }).by : undefined);

describe('AC152 だっこは 人ごと', () => {
  it('2P が なかまを ZL 長おしで だっこ: carrying(2) が その id・carrying(1) と carrying() は null・出来事 carry は by: 2', () => {
    const s = setupDuo();
    const id = s.friend(2);
    s.m.events();
    expect(s.m.carryHold(id, s.hold - 1, 2)).toBe('wait');
    expect(s.m.carrying(2)).toBeNull();
    expect(s.m.carryHold(id, s.hold, 2)).toBe('lifted');
    expect(s.m.carrying(2)).toBe(id);
    expect(s.m.carrying(1)).toBeNull();
    expect(s.m.carrying()).toBeNull();
    expect(s.ev('carry')).toEqual([{ type: 'carry', id, by: 2 }]);
  });

  it('1P の だっこの 出来事には by の キーが ない。carrying() は carrying(1) と 同じ', () => {
    const s = setupDuo();
    const id = s.friend(1);
    s.m.events();
    expect(s.m.carryHold(id, s.hold)).toBe('lifted');
    const e = s.m.events().filter((x) => x.type === 'carry');
    expect(e).toHaveLength(1);
    expect('by' in e[0]!).toBe(false);
    expect(s.m.carrying()).toBe(id);
    expect(s.m.carrying(1)).toBe(id);
    expect(s.m.carrying(2)).toBeNull();
  });

  it('だっこ中の 羽は 毎ステップ だっこ した 人の 足もと（2P が 動けば ついて いく。1P の 場所には 行かない）', () => {
    const s = setupDuo();
    const id = lift(s, 2);
    s.step(2);
    const r = s.one(id);
    expect(r.carried).toBe(true);
    expect(r.x).toBeCloseTo(s.pl2.cur!.position.x, 6);
    expect(r.z).toBeCloseTo(s.pl2.cur!.position.z, 6);
    s.stand(2, s.pl2.cur!.position.x + 7, s.pl2.cur!.position.z + 5);
    s.step(1);
    expect(s.one(id).x).toBeCloseTo(s.pl2.cur!.position.x, 6);
    expect(s.one(id).z).toBeCloseTo(s.pl2.cur!.position.z, 6);
    expect(Math.hypot(s.one(id).x - s.p1.position.x, s.one(id).z - s.p1.position.z)).toBeGreaterThan(OFFSET - 1);
  });

  it('2 人で 別の 羽を 同時に だっこ できる（2 羽）。それぞれ 自分の 足もとに', () => {
    const s = setupDuo();
    const a = lift(s, 1);
    const b = lift(s, 2);
    s.step(2);
    expect(s.m.carrying(1)).toBe(a);
    expect(s.m.carrying(2)).toBe(b);
    expect(s.one(a).x).toBeCloseTo(s.p1.position.x, 6);
    expect(s.one(b).x).toBeCloseTo(s.pl2.cur!.position.x, 6);
  });

  it('もう 1 人が だっこ中の 羽は だっこ できない（何も 起きない。carrying は かわらない）', () => {
    const s = setupDuo();
    // 1P が だっこ中の 羽を 2P が（2P が 羽の すぐ 近くに 来て）押しつづける
    const a = lift(s, 1);
    s.stand(2, s.p1.position.x + 1, s.p1.position.z);
    expect(s.m.carryHold(a, s.hold, 2)).toBeNull();
    expect(s.m.carrying(2)).toBeNull();
    expect(s.m.carrying(1)).toBe(a);
    // 2P が だっこ中の 羽を 1P が
    const s2 = setupDuo();
    const b = lift(s2, 2);
    s2.stand(1, s2.pl2.cur!.position.x - 1, s2.pl2.cur!.position.z);
    expect(s2.m.carryHold(b, s2.hold, 1)).toBeNull();
    expect(s2.m.carrying(1)).toBeNull();
    expect(s2.m.carrying(2)).toBe(b);
    // だっこ中の 羽は ねらえない（rayHit）。えさも あげられない
    const p = s2.one(b);
    expect(s2.m.rayHit({ x: p.x - 3, y: p.y + 0.4, z: p.z }, { x: 1, y: 0, z: 0 }, 6)).toBeNull();
    expect(s2.m.feed(b, 'mushi')).toBeNull();
  });

  it('同じ ステップに 2 人が 同じ 羽を だっこ しようと した → 先に 呼ばれた 1P。2P は 何も 起きない', () => {
    const s = setupDuo();
    const id = s.friend(1);
    s.stand(2, s.p1.position.x + 1, s.p1.position.z);
    s.m.events();
    expect(s.m.carryHold(id, s.hold, 1)).toBe('lifted');
    expect(s.m.carryHold(id, s.hold, 2)).toBeNull();
    expect(s.m.carrying(1)).toBe(id);
    expect(s.m.carrying(2)).toBeNull();
    expect(s.ev('carry')).toHaveLength(1);
  });

  it('やせいを 押しつづけると carryWild の 合図に なる（lifted には ならない）。2P でも 1 回の 押しで 1 回', () => {
    const s = setupDuo();
    const id = wildCarry(s, 2);
    expect(s.m.carryHold(id, s.hold - 1, 2)).toBe('wait');
    expect(s.m.carryHold(id, s.hold, 2)).toBe('wild');
    expect(s.m.carryHold(id, s.hold, 2)).toBeNull();
    expect(s.m.carrying(2)).toBeNull();
    // 1P が 先に 合図を 出していても 2P の 押しは 2P の 分として 数える
    const t = setupDuo();
    const w1 = wildCarry(t, 1);
    expect(t.m.carryHold(w1, t.hold, 1)).toBe('wild');
    const w2 = wildCarry(t, 2);
    expect(t.m.carryHold(w2, t.hold, 2)).toBe('wild');
  });

  it('合図は 人ごと: emitHint(h, 2) は 出来事 hint を by: 2 で 出し、lastHint()（1P の 物）を 書かない', () => {
    const s = setupDuo();
    s.m.events();
    s.m.emitHint('carryWild', 2);
    expect(s.m.events()).toEqual([{ type: 'hint', hint: 'carryWild', by: 2 }]);
    expect(s.m.lastHint()).toBeNull();
    s.m.emitHint('cantPutHere', 1);
    const e = s.m.events();
    expect(e).toEqual([{ type: 'hint', hint: 'cantPutHere' }]);
    expect('by' in e[0]!).toBe(false);
    expect(s.m.lastHint()).toBe('cantPutHere');
    s.m.emitHint('fullHint');
    expect(s.m.lastHint()).toBe('fullHint');
  });

  it('2P が いない（playerOf(2) が null）とき who 2 の 口は 何も しない', () => {
    const s = setupDuo({ p2: false });
    const id = s.friend(1);
    expect(s.m.carryHold(id, s.hold, 2)).toBeNull();
    expect(s.m.carrying(2)).toBeNull();
    expect(s.m.throwSpot(s.aimEast(1, null), 2)).toBeNull();
    expect(s.m.startThrow(s.aimEast(1, null), 2)).toBe(false);
    expect(s.m.putDown({ x: 22.5, y: 9, z: 20.5 }, 2)).toBe(false);
    expect(s.m.carryHold(id, s.hold)).toBe('lifted');
    expect(s.m.carrying(1)).toBe(id);
  });
});

describe('AC152 同じ 場面を 1P と 2P で 動かすと 結果が 同じ（同じ 部品）', () => {
  /** だっこ → 歩く → なげる → 着地まで。出来事を その 人の 場所の ぶん ずらして 読む */
  const scene = (w: Who) => {
    const s = setupDuo();
    const dx = w === 2 ? OFFSET : 0;
    const id = lift(s, w);
    s.m.events();
    s.stand(w, s.who(w).position.x + 2, s.who(w).position.z);
    s.step(3);
    const aim = s.aimEast(w, { x: Math.floor(s.who(w).position.x) + 3, y: 9, z: Math.floor(s.who(w).position.z) });
    const spot = s.m.throwSpot(aim, w)!;
    const ok = s.m.startThrow(aim, w);
    s.step(150);
    const end = s.one(id);
    return { dx, spot: r6({ ...spot, x: spot.x - dx }), ok, ev: normalize(s.m.events(), dx), end: r6({ x: end.x - dx, y: end.y, z: end.z, carried: end.carried }), carrying: s.m.carrying(w) };
  };
  it('なげて 着地まで: 着地点・出来事の 列・さいごの 場所が 同じ', () => {
    const a = scene(1);
    const b = scene(2);
    expect(b.ok).toBe(true);
    expect(b.spot).toEqual(a.spot);
    expect(b.ev).toEqual(a.ev);
    expect(b.end).toEqual(a.end);
    expect(b.carrying).toBeNull();
    expect(a.ev.some((e) => (e as { type: string }).type === 'putDown')).toBe(true);
  });
});

describe('AC153 なげる・おろす・小屋', () => {
  it('throwSpot(aim, 2) は 2P の ねらいと 2P の 場所から 決まる（throwRange・そっと おろす・前 3 マス）。だっこ して いない 人は null', () => {
    const s = setupDuo();
    lift(s, 2);
    expect(s.m.throwSpot(s.aimEast(1, null), 1), '1P は だっこ して いない').toBeNull();
    expect(s.m.throwSpot(s.aimEast(1, null))).toBeNull();
    const range = s.settings.throwRange;
    const px = s.pl2.cur!.position.x;
    const pz = s.pl2.cur!.position.z;
    // 範囲の 中: ねらった マスの まん中
    const near = s.m.throwSpot(s.aimEast(2, { x: Math.floor(px) + 2, y: 9, z: Math.floor(pz) }), 2)!;
    expect(near).toMatchObject({ x: Math.floor(px) + 2.5, y: 9, z: Math.floor(pz) + 0.5, ok: true, toss: true });
    // 範囲の 外: 2P から 向きそのままで range の 所（1P の 場所 から では ない）
    const far = s.m.throwSpot(s.aimEast(2, { x: Math.floor(px) + Math.ceil(range) + 4, y: 9, z: Math.floor(pz) }), 2)!;
    expect(far.ok).toBe(true);
    expect(Math.hypot(far.x - px, far.z - pz)).toBeLessThanOrEqual(range + 1);
    expect(far.x).toBeGreaterThan(px);
    // 何も ねらわない: 前 3 マス
    const none = s.m.throwSpot(s.aimEast(2, null), 2)!;
    expect(none.x).toBeCloseTo(Math.floor(px + 3) + 0.5, 6);
    // 自分の 足もと: そっと おろす
    expect(s.m.throwSpot(s.aimEast(2, { x: Math.floor(px), y: 9, z: Math.floor(pz) }), 2)).toMatchObject({ ok: true, toss: false });
  });

  it('startThrow(aim, 2): 出来事 toss と 着地の putDown が by: 2。2P の 羽だけが とぶ（1P の だっこは そのまま）', () => {
    const s = setupDuo();
    const a = lift(s, 1);
    const b = lift(s, 2);
    s.m.events();
    const px = Math.floor(s.pl2.cur!.position.x);
    const pz = Math.floor(s.pl2.cur!.position.z);
    const aim = s.aimEast(2, { x: px + 3, y: 9, z: pz });
    expect(s.m.startThrow(aim, 2)).toBe(true);
    s.step(150);
    const ev = s.m.events();
    const toss = ev.filter((e) => e.type === 'toss');
    const put = ev.filter((e) => e.type === 'putDown');
    expect(toss).toHaveLength(1);
    expect(byOf(toss[0]!)).toBe(2);
    expect(put).toHaveLength(1);
    expect(byOf(put[0]!)).toBe(2);
    expect(s.m.carrying(2)).toBeNull();
    expect(s.m.carrying(1), '1P の だっこは そのまま').toBe(a);
    expect(s.one(b).x).toBeCloseTo(px + 3.5, 1);
  });

  it('そっと おろす（足もとの マス）: PUT_DOWN の あと putDown が by: 2', () => {
    const s = setupDuo();
    const id = lift(s, 2);
    s.m.events();
    const px = Math.floor(s.pl2.cur!.position.x);
    const pz = Math.floor(s.pl2.cur!.position.z);
    expect(s.m.startThrow(s.aimEast(2, { x: px, y: 9, z: pz }), 2)).toBe(true);
    s.step(60);
    const put = s.m.events().filter((e) => e.type === 'putDown');
    expect(put).toHaveLength(1);
    expect(byOf(put[0]!)).toBe(2);
    expect(s.m.carrying(2)).toBeNull();
    expect(s.one(id).carried).toBe(false);
  });

  it('putDown(spot, 2) は 2P の 羽だけ おろし、出来事は by: 2。だっこ して いない 人は false', () => {
    const s = setupDuo();
    lift(s, 1);
    const b = lift(s, 2);
    const spot = { x: s.pl2.cur!.position.x + 1.5, y: 9, z: s.pl2.cur!.position.z };
    expect(s.m.putDown(spot, 2)).toBe(true);
    expect(s.m.carrying(2)).toBeNull();
    expect(s.m.carrying(1)).not.toBeNull();
    const put = s.m.events().filter((e) => e.type === 'putDown');
    expect(put).toEqual([{ type: 'putDown', id: b, x: spot.x, y: spot.y, z: spot.z, by: 2 }]);
    expect(s.m.putDown(spot, 2)).toBe(false);
  });

  it('throwTo(x, y, z, 2): 2P の 足もと から 点へ とぶ（by: 2）', () => {
    const s = setupDuo();
    const id = lift(s, 2);
    s.m.events();
    const px = s.pl2.cur!.position.x;
    expect(s.m.throwTo(px + 3, 9, s.pl2.cur!.position.z, 2)).toBe(true);
    s.step(150);
    const toss = s.m.events().filter((e) => e.type === 'toss');
    expect(toss).toHaveLength(1);
    expect(byOf(toss[0]!)).toBe(2);
    expect(s.one(id).x).toBeCloseTo(px + 3, 1);
  });

  it('いっぱいの 小屋の 中へ: 2P の 着地点は ok false・coopFull。なげても おろさず coopFull の 合図が by: 2（1P の lastHint は 書かない）', () => {
    const s = setupDuo();
    const c = s.coop(50 + OFFSET, 50);
    s.stand(2, 46.5 + OFFSET, 50.5);
    lift(s, 2);
    const inside = { x: 50 + OFFSET, y: 9, z: 50 };
    expect(s.m.throwSpot(s.aimEast(2, inside), 2)).toMatchObject({ ok: true, home: c.id });
    for (let i = 0; i < s.settings.coopMax; i++) s.m.spawn(c.x + 0.5 - 1 + (i % 3), 9, c.z + 0.5 - 1 + Math.floor(i / 3), { home: c.id });
    expect(s.m.throwSpot(s.aimEast(2, inside), 2)).toMatchObject({ ok: false, why: 'coopFull', home: c.id });
    s.m.events();
    expect(s.m.startThrow(s.aimEast(2, inside), 2)).toBe(false);
    expect(s.m.putDownWhy(2)).toBe('coopFull');
    expect(s.m.putDownWhy(1), '1P の 理由には ならない').toBeNull();
    expect(s.m.putDownWhy()).toBeNull();
    expect(s.m.events().filter((e) => e.type === 'hint')).toEqual([{ type: 'hint', hint: 'coopFull', by: 2 }]);
    expect(s.m.lastHint()).toBeNull();
    expect(s.m.carrying(2), 'だっこは つづく').not.toBeNull();
  });

  it('小屋の 子を 外へ: なかまが animalFriendMax わ なら friendFull（2P の 着地点・合図 by: 2）', () => {
    const s = setupDuo();
    const c = s.coop(50 + OFFSET, 50);
    s.stand(2, 50.5 + OFFSET, 50.5);
    const kid = s.m.spawn(50.5 + OFFSET, 9, 50.5, { home: c.id, stage: 'adult' })!;
    s.step(2);
    for (let i = 0; i < s.settings.animalFriendMax; i++) s.m.spawn(30.5 + i, 9, 90.5, { friend: true, follow: s.full });
    expect(s.m.carryHold(kid, s.hold, 2)).toBe('lifted');
    const out = s.aimEast(2, { x: 53 + OFFSET, y: 9, z: 50 });
    expect(s.m.throwSpot(out, 2)).toMatchObject({ ok: false, why: 'friendFull' });
    s.m.events();
    expect(s.m.startThrow(out, 2)).toBe(false);
    expect(s.m.putDownWhy(2)).toBe('friendFull');
    expect(s.m.events().filter((e) => e.type === 'hint')).toEqual([{ type: 'hint', hint: 'friendFull', by: 2 }]);
  });

  it('小屋の 中へ なげると 小屋の 子（出来事 home）。2P の なげた 子も 1P と 同じ', () => {
    const s = setupDuo();
    const c = s.coop(50 + OFFSET, 50);
    s.stand(2, 46.5 + OFFSET, 50.5);
    const id = s.friend(2, -1, 0, { stage: 'adult' });
    expect(s.m.carryHold(id, s.hold, 2)).toBe('lifted');
    expect(s.m.startThrow(s.aimEast(2, { x: 50 + OFFSET, y: 9, z: 50 }), 2)).toBe(true);
    s.step(200);
    expect(s.one(id).home).toBe(c.id);
    expect(s.ev('home')).toHaveLength(1);
  });

  it('dropCarried(spot, 2): その 場に おろす（出来事 putDown は by: 2）。1P の だっこは そのまま', () => {
    const s = setupDuo();
    const a = lift(s, 1);
    const b = lift(s, 2);
    s.m.events();
    const spot = { ...s.pl2.cur!.position };
    s.m.dropCarried(spot, 2);
    expect(s.m.carrying(2)).toBeNull();
    expect(s.m.carrying(1)).toBe(a);
    expect(s.m.events().filter((e) => e.type === 'putDown')).toEqual([{ type: 'putDown', id: b, x: spot.x, y: spot.y, z: spot.z, by: 2 }]);
    expect(s.one(b).carried).toBe(false);
  });
});

describe('AC158 倒れた・やめた・ぬけた・セーブ', () => {
  it('2P が だっこ中に セーブ: 羽は 2P の 足もとの 場所で 書く。保存の 形は かえない（キーは だっこ して いない なかまと 同じ）。読みなおすと だれも だっこ して いない', () => {
    const s = setupDuo();
    const id = lift(s, 2);
    const other = s.friend(1, -3, 0);
    s.step(2);
    const save = s.m.serialize();
    expect(save.v).toBe(4);
    const rows = (save as unknown as { friends: Record<string, unknown>[] }).friends;
    expect(rows).toHaveLength(2);
    const px = s.pl2.cur!.position.x;
    const carriedRow = rows.find((r) => Math.abs((r.x as number) - px) < 1e-6)!;
    expect(carriedRow, '羽は 2P の 足もと').toBeTruthy();
    expect(carriedRow.z).toBeCloseTo(s.pl2.cur!.position.z, 6);
    const plain = rows.find((r) => r !== carriedRow)!;
    expect(Object.keys(carriedRow).sort()).toEqual(Object.keys(plain).sort());
    expect(id).not.toBe(other);

    const t = setupDuo();
    t.m.deserialize(JSON.parse(JSON.stringify(save)));
    expect(t.m.carrying(1)).toBeNull();
    expect(t.m.carrying(2)).toBeNull();
    expect(t.m.list().some((a) => a.carried)).toBe(false);
    expect(t.m.list().some((a) => Math.abs(a.x - px) < 1e-6)).toBe(true);
  });

  it('1P が だっこ中の セーブ・読みなおしは 今までどおり（1P の 足もと。だれも だっこ して いない）', () => {
    const s = setupDuo();
    lift(s, 1);
    s.step(1);
    const save = s.m.serialize();
    const t = setupDuo();
    t.m.deserialize(JSON.parse(JSON.stringify(save)));
    expect(t.m.carrying()).toBeNull();
    expect(t.m.list().filter((a) => a.carried)).toHaveLength(0);
    expect(t.m.list().some((a) => Math.abs(a.x - 20.5) < 1e-6 && Math.abs(a.z - 20.5) < 1e-6)).toBe(true);
  });

  it('leave(2, at): 2P の だっこを その 足もとに おろし（putDown by: 2）、1P の だっこは そのまま', () => {
    const s = setupDuo();
    const a = lift(s, 1);
    const b = lift(s, 2);
    s.m.events();
    const at = { ...s.pl2.cur!.position };
    s.m.leave(2, at);
    expect(s.m.carrying(2)).toBeNull();
    expect(s.m.carrying(1)).toBe(a);
    const put = s.m.events().filter((e) => e.type === 'putDown');
    expect(put).toHaveLength(1);
    expect(put[0]).toMatchObject({ id: b, by: 2 });
    expect(s.one(b).x).toBeCloseTo(at.x, 6);
    expect(s.one(b).z).toBeCloseTo(at.z, 6);
  });

  it('leave(2, at): まだ 届いて いない むし（あみの 30 ステップの とちゅう）は 2P の いた 足もとに 落ち、あとから 2P の もちものに 入らない。1P の むしは そのまま 1P へ', () => {
    const s = setupDuo();
    s.settings.bugChance = 1;
    s.m.swingNet({ x: 10, y: 12, z: 10 }, 2);
    s.m.swingNet({ x: 90, y: 12, z: 90 }, 1);
    s.step(5);
    const at = { ...s.pl2.cur!.position };
    s.m.leave(2, at);
    expect(s.dropped).toHaveLength(1);
    expect(s.dropped[0]!.item).toBe('mushi');
    expect(s.dropped[0]!.at.x).toBeCloseTo(at.x, 0);
    expect(s.dropped[0]!.at.z).toBeCloseTo(at.z, 0);
    s.step(60);
    expect(s.added.filter((x) => x.who === 2)).toHaveLength(0);
    expect(s.added.filter((x) => x.who === 1)).toEqual([{ item: 'mushi', who: 1 }]);
  });

  it('leave(2, at) の あと 2P が いなくなっても（playerOf(2) が null）だっこ・小屋・ほかの 羽は こわれない', () => {
    const s = setupDuo();
    const a = lift(s, 1);
    const b = lift(s, 2);
    s.m.leave(2, { ...s.pl2.cur!.position });
    s.pl2.cur = null;
    s.step(10);
    expect(s.m.carrying(1)).toBe(a);
    expect(s.m.carrying(2)).toBeNull();
    expect(s.m.list().some((x) => x.id === b)).toBe(true);
  });
});

describe('AC139・AC146 1 人の ときは かわらない', () => {
  /** 2P が いない 作り（playerOf なし・今までの 1 人の 作り方）と、2P が 来て いるだけで 何も しない 作りで、1P の 動きが ぴったり 同じ */
  const run = (o: { p2?: boolean; legacy?: boolean }) => {
    const s = setupDuo({ ...o, seed: 11 });
    const c = s.coop(50, 50);
    s.stand(1, 46.5, 50.5);
    const id = s.friend(1, -1, 0, { stage: 'adult' });
    s.m.events();
    s.m.carryHold(id, s.hold);
    s.m.startThrow(s.aimEast(1, { x: 50, y: 9, z: 50 }));
    s.step(120);
    s.m.swingNet({ x: 10, y: 12, z: 10 });
    s.step(40);
    s.m.collectCoop(c.id);
    return { ev: s.m.events(), list: s.m.list(), save: s.m.serialize(), added: s.added };
  };
  it('出来事・羽の 状態・保存・入れた 物が 同じ（乱数の 順も かわらない）', () => {
    const base = run({ legacy: true, p2: false });
    expect(run({ p2: false })).toEqual(base);
    expect(run({ p2: true })).toEqual(base);
  });
  it('1 人の ときの 出来事に by の キーは ひとつも ない', () => {
    const r = run({ legacy: true, p2: false });
    expect(r.ev.length).toBeGreaterThan(0);
    for (const e of r.ev) expect('by' in e, e.type).toBe(false);
  });
});
