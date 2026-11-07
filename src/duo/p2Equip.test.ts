import { describe, expect, it } from 'vitest';
import { ArmorSystemImpl } from '../craft/ArmorSystem';
import { CRAFT_DEFAULTS, SAMURAI_GEAR } from '../craft/config';
import { InventoryImpl } from '../inventory/Inventory';
import { equipSlotOfFocus, p2ArmorUi, pressEquip } from './p2Equip';
import { P2State } from './p2State';

/**
 * COOP-1 作業 4b（docs/design/COOP-1.md 1.10 §3.3・§3.5・AC83）の 先行テスト（赤）。**2P の パネルの そうびの マスが p2.armor に つながる**。
 * 「2P は パッドで そうびの マスに おいて 着る」（クリック・ダブルクリックは 1P の パネルだけ）。いま 2P の パネルには 何も 着られない `NO_ARMOR` が
 * わたされている（src/game/wire/duoInventory.ts:63。4a の 置き場）。ここを p2.armor に つなぐ。DOM は ユニットで 試せないので、決まりの 核を 外に 出す。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/p2Equip.ts
 *     equipSlotOfFocus(focus: string | null): ArmorSlot | null
 *       `duo.inv(2).focus` の 名前（`equip:head`・`equip:body`・`equip:arms`・`equip:legs`）→ その 部位。ほかの 名前（slot:3・tab:items・equip: ・equip:foo）・null → null。
 *     pressEquip(focus: string | null, armor: Pick<ArmorUi, 'click'>): boolean
 *       2P の パッドで「決める」を 押した ときの そうびの マスの 動き。focus が そうびの マスなら `armor.click(部位)` を 1 回 呼んで true、ちがえば 何も せず false。
 *       （`armor.click` は 1 人の 全面で マスを クリックした ときと 同じ ArmorSystemImpl.click〔カーソルの 物を 着る・空なら 着ている 物を つかむ・合わない 物は 入らない〕）
 *     p2ArmorUi(p2: Pick<P2State, 'armor'>): ArmorUi
 *       2P の パネル（InventoryScreen の m4.armor）に わたす 物 = `p2.armor` そのもの（1P の armor ではなく、`NO_ARMOR` でもない）。
 *   配線: wire/duoInventory.ts の `NO_ARMOR` を なくし、`armor: p2ArmorUi(shared.p2)` を わたす。wire/duo.ts の padInv2 は cmd === 'press' で、
 *     2P の えらび（`duo.inv(2).focus`）が そうびの マスなら `pressEquip(focus, shared.p2.armor)`、そうでなければ 今までどおり `screen.padPress()`。
 *   見た目（マスの 絵・大きさ）は UI 検査（e2e/ui-gate.spec.ts の duo-inv-items）が 見る。
 */

describe('AC83 そうびの マスの 名前', () => {
  it('equip:head・equip:body・equip:arms・equip:legs が 部位に なる。ほかは null', () => {
    expect(equipSlotOfFocus('equip:head')).toBe('head');
    expect(equipSlotOfFocus('equip:body')).toBe('body');
    expect(equipSlotOfFocus('equip:arms')).toBe('arms');
    expect(equipSlotOfFocus('equip:legs')).toBe('legs');
    for (const bad of [null, '', 'slot:3', 'tab:items', 'equip:', 'equip:foo', 'equip:Body', 'close', 'quit']) expect(equipSlotOfFocus(bad), String(bad)).toBeNull();
  });
});

describe('AC83 2P の パネルの そうびは p2.armor', () => {
  it('p2ArmorUi(p2) は p2.armor そのもの。着替えが すぐ 見える', () => {
    const p2 = new P2State();
    const ui = p2ArmorUi(p2);
    expect(ui).toBe(p2.armor);
    p2.armor.set(null, 'yoroi');
    expect(ui.equipped('body')).toBe('yoroi');
    expect(ui.equippedStack?.('body')).toEqual({ item: 'yoroi', count: 1 });
  });

  it('パッドで もちものの マスを つかみ → そうびの マスで 決める → 2P の そうびに 入る（もちものから なくなる）', () => {
    const p2 = new P2State();
    p2.inventory.setSlot(3, { item: 'yoroi', count: 1 });
    p2.inventory.click(3); // 決める（もちものの マス）→ カーソルに つかむ
    expect(p2.inventory.cursor()?.item).toBe('yoroi');
    expect(pressEquip('equip:body', p2ArmorUi(p2))).toBe(true); // 決める（そうびの マス）
    expect(p2.armor.equipped('body')).toBe('yoroi');
    expect(p2.inventory.cursor()).toBeNull();
    expect(p2.inventory.count('yoroi')).toBe(0);
  });

  it('1P の そうびには さわらない（1P の ArmorSystemImpl は そのまま）', () => {
    const p2 = new P2State();
    const inv1 = new InventoryImpl();
    const one = new ArmorSystemImpl(inv1, { armorValue: CRAFT_DEFAULTS.armorValue });
    one.set(null, null, SAMURAI_GEAR.arms, null);
    p2.inventory.setCursor({ item: 'yoroi', count: 1 });
    pressEquip('equip:body', p2ArmorUi(p2));
    expect(one.equipped('body')).toBeNull();
    expect(one.equipped('arms')).toBe(SAMURAI_GEAR.arms);
    expect(p2.armor.equipped('arms'), '2P に 1P の 手甲が うつらない').toBeNull();
  });

  it('合わない マス（かぶとを からだに）は 入らず、カーソルに のこる。合う マス（あたま）なら 入る', () => {
    const p2 = new P2State();
    p2.inventory.setCursor({ item: 'kabuto', count: 1 });
    expect(pressEquip('equip:body', p2ArmorUi(p2))).toBe(true);
    expect(p2.armor.equipped('body')).toBeNull();
    expect(p2.inventory.cursor()?.item).toBe('kabuto');
    pressEquip('equip:head', p2ArmorUi(p2));
    expect(p2.armor.equipped('head')).toBe('kabuto');
    expect(p2.inventory.cursor()).toBeNull();
  });

  it('着ている 物の マスで 決める（カーソルが 空）→ カーソルに つかむ → もちものの マスで 決めて もどす（ぬぐ）', () => {
    const p2 = new P2State();
    p2.armor.set('kabuto', null);
    pressEquip('equip:head', p2ArmorUi(p2));
    expect(p2.armor.equipped('head')).toBeNull();
    expect(p2.inventory.cursor()?.item).toBe('kabuto');
    p2.inventory.click(5);
    expect(p2.inventory.slots()[5]?.item).toBe('kabuto');
    expect(p2.inventory.cursor()).toBeNull();
  });

  it('着ている 物が ある マスに ほかの 物を 決める → 入れかわる（へった 量も ついていく）', () => {
    const p2 = new P2State();
    p2.armor.set(null, 'yoroi');
    p2.armor.setDurability('body', 30);
    const worn = p2.armor.equippedStack('body')!;
    p2.inventory.setCursor({ item: SAMURAI_GEAR.body, count: 1 });
    pressEquip('equip:body', p2ArmorUi(p2));
    expect(p2.armor.equipped('body')).toBe(SAMURAI_GEAR.body);
    expect(p2.inventory.cursor()).toEqual(worn);
  });

  it('そうびの マスでない 名前・null では 何も しない（false）', () => {
    const p2 = new P2State();
    p2.inventory.setCursor({ item: 'yoroi', count: 1 });
    for (const f of [null, 'slot:2', 'tab:craft', 'close']) expect(pressEquip(f, p2ArmorUi(p2)), String(f)).toBe(false);
    expect(p2.armor.equipped('body')).toBeNull();
    expect(p2.inventory.cursor()?.item).toBe('yoroi');
  });
});
