import { describe, expect, it } from 'vitest';
import { ArmorSystemImpl } from '../craft/ArmorSystem';
import { CRAFT_DEFAULTS, NINJA_GEAR, SAMURAI_GEAR } from '../craft/config';
import { DuoSession } from './session';
import { P2State, readP2Save } from './p2State';
import type { P2Save } from './types';

/**
 * COOP-1 作業 4b（docs/design/COOP-1.md 1.10 §3.5・§6・AC83）の 先行テスト（赤）。2P の そうび: 着る・ハートの 絵・セーブ。
 * ふせぐ・こわれる・袋は src/duo/p2Guard.test.ts、音・お知らせは src/duo/p2Wear.test.ts。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/p2State.ts
 *     new P2State(opts?: { onLevelUp?; armorConfig?: Pick<CraftConfig, 'armorValue'>; armorWear?: ArmorWearOptions })
 *       … 引数なしで 作れる まま（今の テストが たくさん ある）。armorConfig の 既定は CRAFT_DEFAULTS。
 *     p2.armor: ArmorSystemImpl      … p2.inventory に つながった 2P 用の そうび。1P の `new ArmorSystemImpl(inventory, craftConfig, …)` と **同じ クラス・同じ 数の 表**。
 *     p2.serialize(): P2Save         … `{ inventory, level, armor: p2.armor.serialize() }`（armor は いつも 入る。はだかでも `{ head: null, … }`）。`SAVE_VERSION` は 上げない。
 *     p2.deserialize(d)              … `armor.deserialize(d.armor)`。**armor が ない 保存・形が おかしい 保存は はだか**（前に 着ていた 物も 脱がせる）。
 *     p2.clear()                     … そうびも はだかに もどす（へった 量も 新品に）。
 *     readP2Save(data): P2Save | null … 返す 値に `armor`（データに あれば そのまま・なければ undefined）を ふくむ。
 *   src/duo/types.ts  P2Save に `armor?: unknown` を 足す（1P の `armor` と 同じ 形）。
 *   配線（テストの 外。コードレビューで 見る）:
 *     - wire/duoPlay.ts の build(): PlayerCombatImpl に `armor: p2.armor` を わたす（src/duo/p2CombatKit.ts と 同じ 作り）。
 *     - 2P の ハート: 毎ステップ `ui.updateArmor(p2.armor.snapshot().hudIcons)`（DuoHud に 足す。中で hearts2.setArmor。1P の step.ts:364 と 同じ）。
 *     - 開発の 口（§12.0。`?duo=dev` の ときだけ）: `duo.armor(who)` = その 人の ArmorSnapshot（1P は `armor.snapshot()` と 同じ・2P が いなければ who 2 は null。ふつうの URL でも 見られる）、
 *       `duo.equip(who, head, body, arms?, legs?)` = `armor.set(...)` と 同じ。DuoPlayHook に 足す（src/duo/types.ts）。
 */

describe('AC83 2P の そうび: 2P 用の しくみ', () => {
  it('p2.armor は ArmorSystemImpl で、1P と 同じ 数の 表（CRAFT_DEFAULTS.armorValue）を 使う', () => {
    const p2 = new P2State();
    expect(p2.armor).toBeInstanceOf(ArmorSystemImpl);
    // はだかから はじまる
    for (const slot of ['head', 'body', 'arms', 'legs'] as const) expect(p2.armor.equipped(slot)).toBeNull();
    // 同じ 表: 鉄の よろいの ふつうの まもりが 1P と 同じ 数
    p2.armor.set(null, 'yoroi');
    const one = new ArmorSystemImpl(p2.inventory, { armorValue: CRAFT_DEFAULTS.armorValue });
    one.set(null, 'yoroi');
    for (const k of ['normal', 'ball', 'fall'] as const) expect(p2.armor.valueOf(k)).toBe(one.valueOf(k));
    expect(p2.armor.valueOf('normal')).toBeGreaterThan(0);
  });

  it('2 人の P2State は そうびを わけあわない（1 つの P2State の そうびは ほかに うつらない）', () => {
    const a = new P2State();
    const b = new P2State();
    a.armor.set('kabuto', null);
    expect(b.armor.equipped('head')).toBeNull();
  });

  it('手に 持った 物を 着る（tryEquip）: 2P の もちものから なくなり、その 部位に 入る', () => {
    const p2 = new P2State();
    p2.inventory.setSlot(0, { item: 'kabuto', count: 1 });
    p2.inventory.select(0);
    expect(p2.armor.tryEquip('kabuto')).toBe(true);
    expect(p2.armor.equipped('head')).toBe('kabuto');
    expect(p2.inventory.count('kabuto')).toBe(0);
  });

  it('もちものの マスから 着る（equipFromSlot）・そうびの マスを クリック（click）。前に 着ていた 物は もちものへ もどる', () => {
    const p2 = new P2State();
    p2.inventory.setSlot(3, { item: 'yoroi', count: 1 });
    expect(p2.armor.equipFromSlot(3)).toBe(true);
    expect(p2.armor.equipped('body')).toBe('yoroi');
    p2.inventory.setSlot(3, { item: SAMURAI_GEAR.body, count: 1 });
    expect(p2.armor.equipFromSlot(3)).toBe(true);
    expect(p2.armor.equipped('body')).toBe(SAMURAI_GEAR.body);
    expect(p2.inventory.count('yoroi'), '前の よろいは もちものへ').toBe(1);
    // click: カーソルで つかんで そうびの マスに おく／とる
    p2.armor.click('body'); // カーソルが 空 → 着ている 物を つかむ
    expect(p2.armor.equipped('body')).toBeNull();
    expect(p2.inventory.cursor()?.item).toBe(SAMURAI_GEAR.body);
    p2.armor.click('head'); // 合わない 物は 入らない
    expect(p2.armor.equipped('head')).toBeNull();
    p2.armor.click('body');
    expect(p2.armor.equipped('body')).toBe(SAMURAI_GEAR.body);
  });

  it('ハートの 右に 出す 絵（1P は ui/hearts.ts の setArmor で ハートの 右。2P も 同じ Hearts.setArmor）: snapshot().hudIcons は 着ている 物を あたま・からだ・うで・あしの 順（1P の setArmor に わたす 物と 同じ）', () => {
    const p2 = new P2State();
    expect(p2.armor.snapshot().hudIcons).toEqual([]);
    p2.armor.set('kabuto', 'yoroi', 'kote', 'suneate');
    expect(p2.armor.snapshot().hudIcons).toEqual(['kabuto', 'yoroi', 'kote', 'suneate']);
    p2.armor.set(null, 'yoroi', null, 'suneate');
    expect(p2.armor.snapshot().hudIcons).toEqual(['yoroi', 'suneate']);
  });
});

describe('AC83 2P の そうび: セーブ（p2.armor）', () => {
  it('serialize は { inventory, level, armor } 。armor は 1P の armor.serialize() と 同じ 形（へった 量も）', () => {
    const p2 = new P2State();
    p2.armor.set('kabuto', null, NINJA_GEAR.arms, null);
    p2.armor.setDurability('head', 100);
    const s = p2.serialize();
    expect(Object.keys(s).sort()).toEqual(['armor', 'inventory', 'level']);
    const one = new ArmorSystemImpl(p2.inventory, { armorValue: CRAFT_DEFAULTS.armorValue });
    one.set('kabuto', null, NINJA_GEAR.arms, null);
    one.setDurability('head', 100);
    expect(s.armor).toEqual(one.serialize());
  });

  it('はだかでも armor は 入る（{ head: null, body: null, arms: null, legs: null }）', () => {
    const s = new P2State().serialize();
    expect(s.armor).toEqual({ head: null, body: null, arms: null, legs: null });
  });

  it('読み直すと もどる: 着ている 物と へった 量が 同じ。JSON を とおしても 同じ', () => {
    const a = new P2State();
    a.armor.set('kabuto', 'yoroi', 'kote', 'suneate');
    a.armor.setDurability('body', 40);
    const saved = JSON.parse(JSON.stringify(a.serialize())) as P2Save;
    const b = new P2State();
    b.deserialize(saved);
    for (const slot of ['head', 'body', 'arms', 'legs'] as const) expect(b.armor.equipped(slot)).toBe(a.armor.equipped(slot));
    expect(b.armor.durability('body')).toEqual(a.armor.durability('body'));
    expect(b.armor.durability('body')?.left).toBe(40);
  });

  it('armor の ない 保存（前の 版）は 読めて はだか。前に 着ていた 物も 脱がせる', () => {
    const p2 = new P2State();
    p2.armor.set('kabuto', 'yoroi');
    p2.inventory.add('dirt', 3);
    const old = { inventory: new P2State().serialize().inventory, level: { level: 3, xp: 5 } }; // armor の キーが ない
    expect(() => p2.deserialize(old)).not.toThrow();
    for (const slot of ['head', 'body', 'arms', 'legs'] as const) expect(p2.armor.equipped(slot), slot).toBeNull();
    expect(p2.level).toEqual({ level: 3, xp: 5 });
  });

  it('armor の 形が おかしい 保存（null・数・文字・部位が 合わない 物）も こわれず はだか', () => {
    for (const bad of [null, 5, 'x', [], { head: 'dirt', body: 'kabuto', arms: 3, legs: {} }]) {
      const p2 = new P2State();
      p2.armor.set('kabuto', 'yoroi');
      const base = new P2State().serialize();
      expect(() => p2.deserialize({ ...base, armor: bad }), JSON.stringify(bad)).not.toThrow();
      for (const slot of ['head', 'body', 'arms', 'legs'] as const) expect(p2.armor.equipped(slot), `${JSON.stringify(bad)} ${slot}`).toBeNull();
    }
  });

  it('clear() で はだかに もどる（保存にも 何も 残らない）', () => {
    const p2 = new P2State();
    p2.armor.set('kabuto', 'yoroi');
    p2.armor.setDurability('head', 10);
    p2.clear();
    for (const slot of ['head', 'body', 'arms', 'legs'] as const) expect(p2.armor.equipped(slot), slot).toBeNull();
    expect(p2.serialize().armor).toEqual({ head: null, body: null, arms: null, legs: null });
  });

  it('readP2Save は armor を そのまま 返す。ない ときは undefined（形が 正しい 保存として 読める）', () => {
    const base = new P2State().serialize();
    expect(readP2Save({ ...base, armor: { head: 'kabuto' } })?.armor).toEqual({ head: 'kabuto' });
    const old = readP2Save({ inventory: base.inventory, level: base.level });
    expect(old).not.toBeNull();
    expect(old?.armor).toBeUndefined();
  });

  it('参加→やめる→参加: 着ていた 物を 保存して、次に 参加した ときに もどる。やめた あいだは はだか（p2 は からに なる）', () => {
    const store: { saved: P2Save | null } = { saved: null };
    const p2 = new P2State();
    const session = new DuoSession({ p2, saveP2: (s) => void (store.saved = s), loadP2: () => store.saved });
    session.join();
    p2.armor.set('kabuto', 'yoroi');
    p2.armor.setDurability('body', 77);
    session.leave('quit');
    expect(p2.armor.equipped('head'), 'やめたら からに').toBeNull();
    expect((store.saved?.armor as { head: string }).head).toBe('kabuto');
    session.join();
    expect(p2.armor.equipped('head')).toBe('kabuto');
    expect(p2.armor.equipped('body')).toBe('yoroi');
    expect(p2.armor.durability('body')?.left).toBe(77);
  });

  it('「よみこむ」（leave import）は 保存しない（今の 2P の そうびを 書かない）。ファイルの p2 の armor は のこる', () => {
    const file = new P2State();
    file.armor.set(null, 'yoroi');
    const fileSave = file.serialize();
    const store: { saved: P2Save | null } = { saved: fileSave };
    const p2 = new P2State();
    const session = new DuoSession({ p2, saveP2: (s) => void (store.saved = s), loadP2: () => store.saved });
    session.join();
    expect(p2.armor.equipped('body'), 'ファイルの そうびで はじまる').toBe('yoroi');
    p2.armor.set('kabuto', null);
    session.leave('import');
    expect(store.saved).toBe(fileSave);
  });
});
