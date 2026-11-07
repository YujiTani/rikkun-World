import { describe, expect, it } from 'vitest';
import type { ArmorSlot, DamageKind, ItemId, Vec3, YokaiKind } from '../contracts';
import { createW2Settings } from '../contracts';
import { ArmorSystemImpl } from '../craft/ArmorSystem';
import { CRAFT_DEFAULTS, NINJA_GEAR, SAMURAI_GEAR } from '../craft/config';
import { NINJA_TUNING } from '../craft/ninjaTuning';
import { knockbackMulOf } from '../craft/samuraiPower';
import { fallDamage } from '../combat/config';
import { InventoryImpl } from '../inventory/Inventory';
import { createRng } from '../world/gen/random';
import { makeP2Combat, type P2CombatKit } from './p2CombatKit';
import { takeDropBag } from './p2Bag';
import { createP2Partner } from './p2Partner';

/**
 * COOP-1 作業 4b（docs/design/COOP-1.md 1.10 §3.5・AC83・AC90）の 先行テスト（赤）。2P が 妖怪から うける ダメージを そうびが ふせぐ。
 * 2P の 体力の 持ち主は 1P と 同じ PlayerCombatImpl（`armor: p2.armor` を わたす）なので、式は 1P と **同じ 部品**（ArmorSystemImpl.cut・PlayerCombatImpl.hurt・
 * takeDropBag・knockbackMulOf）。この ファイルは「2P の そうびが その 部品に つながって いる」ことを 見る（式を 2P 用に コピーして いない ことも）。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/p2Life.ts   HitSource の 'yokai' に `damageKind?: DamageKind` を 足す。
 *     life.damage(amount, { type: 'yokai', kind, from, damageKind }) は combat.damage(amount, kind, from, damageKind ?? 'normal') を 呼ぶ（いまは 種類が 落ちて 'normal' 固定）。
 *   src/yokai/ai/target.ts   YokaiPartner を こう 変える:
 *     hurt(amount: number, kind: YokaiKind, from: Vec3, damageKind?: DamageKind): boolean   … 4 つめの 引数を 足す。currentTarget の damage が `partner.hurt(amount, by, from, kind)` と 4 つとも わたす。
 *     armor?: { equipped(slot: ArmorSlot): ItemId | null }                                    … ねらわれる 2P の そうび（忍び装束の 判定が 読む。src/yokai/ai/senseDuo.test.ts）。
 *   src/duo/p2Partner.ts   createP2Partner(d: P2PartnerDeps): YokaiPartner    … wire/duoPlay.ts の build() の `const yokai: YokaiPartner = {…}` を 外に 出した 物（TODO を なくす）
 *     P2PartnerDeps = {
 *       position: () => Vec3;                 // 2P の 足もと（読むたびに いまの 位置。コピーを 作らない）
 *       targetable: () => boolean;            // joined && !life.down && padPresent
 *       life: Pick<P2Life, 'damage'>;
 *       armor: { equipped(slot: ArmorSlot): ItemId | null };   // p2.armor
 *     }
 *     hurt(amount, kind, from, damageKind) = life.damage(amount, { type: 'yokai', kind, from, damageKind }).applied > 0
 *     armor = d.armor（そのまま）、position・targetable は 読む たびに d の 関数を 呼ぶ（getter）。
 *   配線: wire/duoPlay.ts の build() が `yokai = createP2Partner({ position: () => ctl.state.position, targetable: () => c.joined() && !life.down && c.padPresent(), life, armor: p2.armor })`。
 *   ※ 1P の 道（PlayerCombatImpl.damage(amount, by, from, kind)）は 今のまま。1 人の ときの 遊び・乱数の 順は かわらない。
 */

const MAX = makeP2Combat().cfg.playerMaxHp;
/** そうびの たいきゅうが 1 回の ふせぎで へる 量の わりざん（設定 toolWear.armorDiv） */
const DIV = createW2Settings().toolWear.armorDiv;
const SLOTS: readonly ArmorSlot[] = ['head', 'body', 'arms', 'legs'];

/** 妖怪の こうげきを うけた ときに へる ハート（その 1 回の applied） */
function hit(r: P2CombatKit, amount: number, kind: DamageKind = 'normal', by: YokaiKind = 'karakasa'): number {
  return r.life.damage(amount, { type: 'yokai', kind: by, from: r.from(), damageKind: kind }).applied;
}

/** 表から 読んだ 「その 種類を へらす 量」（そうびの 合計） */
function cutOf(items: Array<ItemId | null>, kind: DamageKind): number {
  return items.reduce((s, it) => s + (it ? (CRAFT_DEFAULTS.armorValue[it]?.[kind] ?? 0) : 0), 0);
}

/** h マス 落ちて 着地する（p2Life.test.ts の ② と 同じ 動かし方） */
function fallBy(r: P2CombatKit, h: number): void {
  r.run(1);
  r.player.onGround = false;
  const top = r.player.position.y;
  while (r.player.position.y > top - h + 1e-9) {
    r.player.position.y = Math.max(top - h, r.player.position.y - 0.4);
    r.run(1);
  }
  r.player.onGround = true;
  r.run(1);
}

describe('AC83 2P の ふせぐ（ふつう）: 受ける ダメージ = max(1, 元 − まもり)', () => {
  it('はだかは そのまま、よろいで 2、よろい＋こてで 3 へる。表から 読んだ 数と 同じ', () => {
    const naked = makeP2Combat();
    expect(hit(naked, 7)).toBe(7);
    const one = makeP2Combat();
    one.armor.set(null, 'yoroi');
    expect(cutOf([null, 'yoroi'], 'normal')).toBeGreaterThan(0);
    expect(hit(one, 7)).toBe(7 - cutOf([null, 'yoroi'], 'normal'));
    const two = makeP2Combat();
    two.armor.set(null, 'yoroi', 'kote');
    expect(hit(two, 7)).toBe(7 - cutOf([null, 'yoroi', 'kote'], 'normal'));
  });

  it('へらしても 最低 1（ハート 半分）。ダメージ 1 は よろいを 着ても 1', () => {
    const r = makeP2Combat();
    r.armor.set('kabuto', 'yoroi', 'kote', 'suneate');
    expect(hit(r, 1)).toBe(1);
    const r2 = makeP2Combat();
    r2.armor.set(null, 'yoroi', 'kote');
    expect(hit(r2, cutOf([null, 'yoroi', 'kote'], 'normal'))).toBe(1);
  });

  it('忍び・侍の そうびでも 表から 読んだ 式（max(1, 元 − まもり)）と 同じ 数', () => {
    for (const dmg of [1, 2, 3, 5, 9]) {
      const r = makeP2Combat();
      const items: Array<ItemId | null> = [NINJA_GEAR.head, SAMURAI_GEAR.body, SAMURAI_GEAR.arms, null];
      r.armor.set(items[0], items[1], items[2], items[3]);
      const want = Math.max(1, dmg - cutOf(items, 'normal'));
      expect(hit(r, dmg), `ダメージ ${dmg}`).toBe(want);
    }
  });
});

describe('AC83・AC90 2P の ふせぐ ひのたま（種類 ball）', () => {
  it('かぶとで ひのたまが 表の 数だけ へる。よろいは ひのたまを へらさない・かぶとは ふつうの こうげきを へらさない', () => {
    const a = makeP2Combat();
    a.armor.set('kabuto', null);
    const cutBall = cutOf(['kabuto'], 'ball');
    expect(cutBall).toBeGreaterThan(0);
    expect(hit(a, 6, 'ball', 'chochin')).toBe(6 - cutBall);
    const b = makeP2Combat();
    b.armor.set(null, 'yoroi');
    expect(hit(b, 6, 'ball', 'chochin'), 'よろいは ひのたまを へらさない').toBe(6);
    const c = makeP2Combat();
    c.armor.set('kabuto', null);
    expect(hit(c, 6, 'normal'), 'かぶとは ふつうを へらさない').toBe(6);
  });

  it('陣笠・黒頭巾も ひのたまを ふせぐ。種類を わたさないと ふつうとして あつかう（いまの 落とし穴が 直った）', () => {
    for (const head of [SAMURAI_GEAR.head, NINJA_GEAR.head]) {
      const r = makeP2Combat();
      r.armor.set(head, null);
      expect(hit(r, 6, 'ball', 'chochin'), head).toBe(6 - cutOf([head], 'ball'));
    }
    const r = makeP2Combat();
    r.armor.set('kabuto', null);
    expect(r.life.damage(6, { type: 'yokai', kind: 'chochin', from: r.from() }).applied, 'damageKind なし = ふつう').toBe(6);
  });

  it('1P と 同じ: かぶとを 着た 2P が ひのたまを うけた ときの 数 = 1P が 同じ 物を 着て うけた ときの 数', () => {
    const r = makeP2Combat();
    r.armor.set('kabuto', null);
    const got = hit(r, 5, 'ball', 'chochin');
    // 1P と 同じ ArmorSystemImpl が 返す カット量から 組んだ 数
    const ref = new ArmorSystemImpl(new InventoryImpl(), { armorValue: CRAFT_DEFAULTS.armorValue });
    ref.set('kabuto', null);
    expect(got).toBe(Math.max(1, 5 - ref.valueOf('ball')));
  });
});

describe('AC83 2P の ふせぐ（落ちる）: 落下ダメージは 0 まで へる', () => {
  const H = 5; // 安全な 高さを こえて 落ちる マス数
  it('はだか: 落ちた 高さぶん。すねあて（落ちる 表の 数）で へる。それ以上 へらせる そうび（足袋）なら 0', () => {
    const over = makeP2Combat({ y: 60 });
    const h = over.cfg.safeFallHeight + H;
    const raw = fallDamage(h, over.cfg.safeFallHeight, over.cfg.fallDamagePerBlock);
    fallBy(over, h);
    expect(over.life.hp).toBe(MAX - raw);

    const shin = makeP2Combat({ y: 60 });
    shin.armor.set(null, null, null, 'suneate');
    fallBy(shin, h);
    expect(shin.life.hp).toBe(MAX - Math.max(0, raw - cutOf([null, null, null, 'suneate'], 'fall')));

    const tabi = makeP2Combat({ y: 60 });
    tabi.armor.set(null, null, null, NINJA_GEAR.legs);
    fallBy(tabi, h);
    expect(tabi.life.hp, '足袋は 落ちる いたみを ぜんぶ ふせぐ').toBe(MAX);
  });
});

describe('AC83 2P の そうびの たいきゅう（へる・0 で こわれて マスが 空に なる）', () => {
  it('ふせいだ ぶんだけ へる: max(1, 切り捨て(ダメージ ÷ armorDiv))。ふせがなかった 部位は へらない', () => {
    const r = makeP2Combat();
    r.armor.set('kabuto', 'yoroi');
    const before = r.armor.durability('body')!;
    hit(r, 9);
    expect(r.armor.durability('body')?.left).toBe(before.left - Math.max(1, Math.floor(9 / DIV)));
    expect(r.armor.durability('head')?.left, 'かぶとは ふつうを ふせがない').toBe(r.armor.durability('head')?.max);
  });

  it('のこり 1 で ふせぐと こわれる: その 1 回は ふつうに ふせぐ。そうびの マスが 空になり、toolBreak が 1 つ 出る。次の 1 回は はだか', () => {
    const r = makeP2Combat();
    r.armor.set(null, 'yoroi');
    r.armor.setDurability('body', 1);
    expect(hit(r, 5)).toBe(5 - cutOf([null, 'yoroi'], 'normal'));
    expect(r.armor.equipped('body')).toBeNull();
    const ev = r.armor.drainWearEvents();
    expect(ev.filter((e) => e.type === 'toolBreak')).toEqual([expect.objectContaining({ type: 'toolBreak', item: 'yoroi', slot: 'body' })]);
    r.run(r.cfg.hurtInvincibleTicks + 1);
    expect(hit(r, 5), 'こわれた あとは はだか').toBe(5);
  });

  it('へった 量は 袋にも セーブにも ついていく（倒れた とき へった 量つきで 落ちる）', () => {
    const r = makeP2Combat({ rng: () => 0 });
    r.armor.set(null, 'yoroi');
    r.armor.setDurability('body', 30);
    const before = r.armor.equippedStack('body')!;
    expect(before.wear).toBeGreaterThan(0);
    r.life.damage(MAX + 5, { type: 'yokai', kind: 'karakasa', from: r.from() }); // たおれる 一撃も ふせいだ ぶんは へる
    // へった 量は 落とし物の 保存の 形（drops.serialize）に ある（見える 形 list() には ない）
    const saved = r.drops.serialize().find((d) => d.item === 'yoroi');
    expect(saved?.wear).toBe(before.wear! + Math.max(1, Math.floor((MAX + 5) / DIV)));
  });
});

describe('AC83 2P が 倒れると 袋に そうびも 入る（1P の die() と 同じ道 takeDropBag）', () => {
  const FULL: Array<ItemId | null> = ['kabuto', 'yoroi', 'kote', 'suneate'];

  it('かならず おとす 乱数: 4 つとも 袋に 入り、そうびの マスは 空になる', () => {
    const r = makeP2Combat({ rng: () => 0 });
    r.armor.set(FULL[0]!, FULL[1]!, FULL[2]!, FULL[3]!);
    r.life.damage(MAX + 5, { type: 'yokai', kind: 'karakasa', from: r.from() });
    expect(r.life.down).toBe(true);
    const inBag = r.drops.list().flatMap((d) => d.slots.map((s) => s.item));
    for (const it of FULL) expect(inBag, String(it)).toContain(it);
    for (const slot of SLOTS) expect(r.armor.equipped(slot), slot).toBeNull();
  });

  it('ぜったい おとさない 乱数: そうびは そのまま。おまもりを 持っていても そのまま', () => {
    const r = makeP2Combat({ rng: () => 1 });
    r.armor.set(FULL[0]!, FULL[1]!, FULL[2]!, FULL[3]!);
    r.life.damage(MAX + 5, { type: 'yokai', kind: 'karakasa', from: r.from() });
    expect(r.life.down).toBe(true);
    FULL.forEach((it, i) => expect(r.armor.equipped(SLOTS[i]!)).toBe(it));
  });

  it('同じ シードなら 1P の takeDropBag と 同じ 落ち方（乱数の 順: もちもの → あたま → からだ → うで → あし）', () => {
    for (const seed of [1, 2, 3, 9, 20]) {
      const r = makeP2Combat({ rng: createRng(seed) });
      r.armor.set(FULL[0]!, FULL[1]!, FULL[2]!, FULL[3]!);
      // 同じ もちもの・同じ そうびで takeDropBag を 直接 呼んだ 結果
      const inv = new InventoryImpl();
      inv.setSlot(0, { item: 'dirt', count: 3 });
      inv.select(0);
      const arm = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
      arm.set(FULL[0]!, FULL[1]!, FULL[2]!, FULL[3]!);
      const ref = takeDropBag(inv, arm, createRng(seed), r.cfg.dropChance);
      r.life.damage(MAX + 5, { type: 'yokai', kind: 'karakasa', from: r.from() });
      const got = r.drops.list().flatMap((d) => d.slots.map((s) => s.item)).sort();
      expect(got, `シード ${seed}`).toEqual(ref.stacks.map((s) => s.item).sort());
      SLOTS.forEach((slot) => expect(r.armor.equipped(slot) === null, `${slot} シード ${seed}`).toBe(arm.equipped(slot) === null));
    }
  });
});

describe('AC90 羽織の とばされにくさ: 2P も 同じ 倍率（knockbackMulOf）', () => {
  /** 北から こうげきを うけて、のけぞりが おわるまで 進めた 横の 距離 */
  function moved(r: P2CombatKit): number {
    const p0 = { ...r.player.position };
    r.life.damage(2, { type: 'yokai', kind: 'karakasa', from: r.from() });
    r.run(20);
    return Math.hypot(r.player.position.x - p0.x, r.player.position.z - p0.z);
  }

  it('羽織を 着た 2P は、はだかの 2P の 横の 距離 × 調整表の 倍率 しか 飛ばされない。上への はねは どちらも 同じ', () => {
    const a = makeP2Combat();
    const ma = moved(a);
    const b = makeP2Combat();
    b.armor.set(null, SAMURAI_GEAR.body);
    const mb = moved(b);
    const mul = NINJA_TUNING.knockbackMul[SAMURAI_GEAR.body]!;
    expect(mul).toBeLessThan(1);
    expect(ma).toBeCloseTo(a.cfg.knockback, 1);
    expect(Math.abs(mb - ma * mul)).toBeLessThanOrEqual(0.05);
    expect(knockbackMulOf(b.armor)).toBe(mul);
  });

  it('羽織で なければ かわらない（よろい）', () => {
    const a = makeP2Combat();
    const b = makeP2Combat();
    b.armor.set(null, 'yoroi');
    expect(Math.abs(moved(a) - moved(b))).toBeLessThanOrEqual(0.05);
  });
});

describe('AC83・AC90 ようかい → 2P の みち: createP2Partner が ダメージの 種類と そうびを わたす', () => {
  function partner(r: P2CombatKit) {
    return { p: createP2Partner({ position: () => r.player.position, targetable: () => true, life: r.life, armor: r.armor }) };
  }

  it('hurt(amount, kind, from, "ball") は ひのたまとして そうびを とおる（かぶとで へる）。ふつうなら へらない', () => {
    const r = makeP2Combat();
    r.armor.set('kabuto', null);
    const { p } = partner(r);
    expect(p.hurt(6, 'chochin', r.from(), 'ball')).toBe(true);
    expect(r.life.hp).toBe(MAX - (6 - cutOf(['kabuto'], 'ball')));
    const r2 = makeP2Combat();
    r2.armor.set('kabuto', null);
    expect(partner(r2).p.hurt(6, 'karakasa', r2.from(), 'normal')).toBe(true);
    expect(r2.life.hp).toBe(MAX - 6);
    const r3 = makeP2Combat();
    r3.armor.set('kabuto', null);
    expect(partner(r3).p.hurt(6, 'karakasa', r3.from()), '種類を 省くと ふつう').toBe(true);
    expect(r3.life.hp).toBe(MAX - 6);
  });

  it('むてきの あいだ・倒れている ときは false（当たらなかった）', () => {
    const r = makeP2Combat();
    const { p } = partner(r);
    expect(p.hurt(2, 'karakasa', r.from(), 'normal')).toBe(true);
    expect(p.hurt(2, 'karakasa', r.from(), 'normal'), 'むてきの あいだ').toBe(false);
    const d = makeP2Combat();
    const q = partner(d).p;
    d.life.damage(MAX + 5, { type: 'yokai', kind: 'karakasa', from: d.from() });
    expect(d.life.down).toBe(true);
    expect(q.hurt(2, 'karakasa', d.from(), 'normal'), '倒れている').toBe(false);
  });

  it('armor は p2.armor そのもの（着替えると すぐ かわる）。position・targetable は 読むたびに 呼ぶ', () => {
    const r = makeP2Combat();
    let up = true;
    let pos: Vec3 = { x: 1, y: 2, z: 3 };
    const p = createP2Partner({ position: () => pos, targetable: () => up, life: r.life, armor: r.armor });
    expect(p.armor?.equipped('head')).toBeNull();
    r.armor.set('kabuto', null);
    expect(p.armor?.equipped('head')).toBe('kabuto');
    expect(p.position).toEqual({ x: 1, y: 2, z: 3 });
    pos = { x: 4, y: 5, z: 6 };
    expect(p.position).toEqual({ x: 4, y: 5, z: 6 });
    expect(p.targetable).toBe(true);
    up = false;
    expect(p.targetable).toBe(false);
  });
});
