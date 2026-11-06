import { describe, expect, it } from 'vitest';
import type { BlockId, ItemStack } from '../contracts';
import { CRAFT_DEFAULTS } from '../craft/config';
import { ArmorSystemImpl } from '../craft/ArmorSystem';
import { GADGET_ID } from '../content/items/gadgetTuning';
import { createCombatConfig } from '../combat/config';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import { DropField } from '../drops/DropField';
import { InventoryImpl } from '../inventory/Inventory';
import { createRng } from '../world/gen/random';
import { P2Life } from './p2Life';
import { takeDropBag } from './p2Bag';
import { hitsTarget } from './rules';
import { DUO_TUNING } from './tuning';

/**
 * COOP-1 作業 3a（#416）の 先行テスト（赤）。AC37（仲間には 当たらない）・AC43（2P が 倒れて 戻る）・AC44（1P が 倒れている あいだに 2P も 倒れた）・おとしもの袋。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   2P の 体力の 持ち主は「2P 用の PlayerCombatImpl」ひとつ（案 ア。PO 決定）。落ちる・マグマ・回復・おまもり・袋は 1P と 同じ 道（PlayerCombatImpl の 中）。
 *     - 2P 用 PlayerCombatImpl の 作り方: player = 2P の 位置、inventory = p2.inventory、armor = 2P の 物（なければ なし）、drops = 世界の DropField、
 *       config = { ...createCombatConfig(), respawnDelayTicks: DUO_TUNING.p2ReturnSteps }、spawn = () => 1P の 横（§9.5 の 出る所 `joinSpot()`）。
 *     - 2P の PlayerCombatImpl の できごと（death・respawn など やられた 画面の 元）は 1P の 画面に つながない（takeHookEvents も 1P の 物と 別）。
 *     - 袋を 出すのは PlayerCombatImpl.die() の 中の 1 か所だけ（P2Life は 袋を 出さない）。
 *   src/duo/rules.ts  `hitsTarget(attacker: 1 | 2, target: HitTarget): boolean`
 *     HitTarget = { type: 'player'; who: 1 | 2 } | { type: 'yokai' } | { type: 'animal' }
 *     こうげき（刀・弓・パンチ・火の玉の はね返しの あたり）が その あいてに 当たるか。プレイヤー（自分も 仲間も）には いつも false、妖怪・動物は true。
 *     配線: 刀・弓・パンチの あたり判定の 前に これを 通す（仲間の 体は あたり判定に 入れない）。
 *   src/duo/p2Life.ts  `class P2Life`（2P 用 PlayerCombatImpl を 包む 係。DOM・Three.js なし）
 *     new P2Life({ combat: PlayerCombatImpl; p1Down: () => boolean; onReturn?: () => void; onDown?: () => void })
 *       onDown = 倒れた ステップに 1 回（ダメージでも 落ちても。「たおれちゃった」を 出す 配線。袋は ここでは 出さない）。
 *       onReturn = 戻った ステップに 1 回（戻る 場所は combat の spawn = 1P の 横）。
 *     hp（= combat.hp()）・maxHp・down（= combat.dead()）・returnLeft（戻るまでの のこり ステップ。倒れていないとき 0。1P が 倒れていて 待っているときも 0）
 *     damage(amount: number, from: HitSource): { applied: number; knock: boolean }
 *       HitSource = { type: 'yokai' } | { type: 'player'; who: 1 | 2 }。player なら 何もせず { applied: 0, knock: false }（AC37）。
 *       yokai は combat.damage（防具・おまもりを 通る）。倒れている あいだは { applied: 0 }。applied = へった hp。
 *     fill(): combat.heal(満タン)（レベルアップ時。倒れているときは 何もしない）
 *     step(): 毎ステップ これを 呼ぶ（combat.update() は P2Life.step の 中で 呼ぶ）。倒れてから DUO_TUNING.p2ReturnSteps 回目の update で combat が 戻す。
 *       ただし 戻る ステップで p1Down() が true の あいだは update を 呼ばずに 待つ（AC44）。1P が 起きたら 次の step() で 戻る。
 *   src/duo/p2Bag.ts  `takeDropBag(inv: Inventory, armor: CombatArmorPort | undefined, rng: Rng, dropChance: number): { stacks: ItemStack[]; dropped: number[]; protectedBy?: 'omamori' }`
 *     PlayerCombatImpl.die() の 中の 輪（おまもり → 選んでいる マス以外の マスごと → そうび 1 マスずつ。乱数の 順も その まま）を 外に 出した 物。
 *     1P の die() も これを 呼ぶ。結果は 1P の die() と 同じ（dropped = death の できごとの dropped、stacks = 落ちた 物）。
 *   配線の きまり（テストは 口の ある所だけ）: ① P2Life.down の あいだ 2P の 入力は ぜんぶ はなす（歩く・ほる・おく・こうげき・ホットバー）
 *     ② 2P が たおした ときの feedDefeat の with（なにで）・hp は 2P の もの（who=2 なら 2P の 持ち物の 手・2P の ハート）。
 *     ③ 妖怪の partner.targetable = !P2Life.down && パッドが ある。
 */

/** 戻るまでの ステップ数（仕様 §9.5。3 秒）。表から 読む */
const RET = DUO_TUNING.p2ReturnSteps;
const CFG = createCombatConfig();

class W {
  readonly size = { x: 64, y: 96, z: 64 };
  isLoaded(): boolean {
    return true;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: 64, z1: 64 };
  }
  getBlock(_x: number, y: number): BlockId | 'outside' {
    return y < 8 ? 'stone' : 'air';
  }
  setBlock(): boolean {
    return true;
  }
  isSolid(_x: number, y: number): boolean {
    return y < 8;
  }
}

/** 2P 用の PlayerCombatImpl（案 ア）と それを 包む P2Life。1P は 別の 場所 P1 に いる */
function make(p1Down = false, o: { y?: number; rng?: () => number } = {}) {
  const world = new W();
  const inv = new InventoryImpl();
  inv.setSlot(0, { item: 'dirt', count: 3 });
  inv.setSlot(1, { item: 'stone', count: 4 });
  inv.setSlot(2, { item: 'torch', count: 5 });
  inv.select(0);
  const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
  const P1 = { x: 30.5, y: 8, z: 30.5 };
  const player = { position: { x: 10.5, y: o.y ?? 8, z: 10.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  const drops = new DropField({ world: world as never, inventory: inv, player: () => player.position });
  const combat = new PlayerCombatImpl({
    world: world as never,
    player: { get: () => player, set: (v) => Object.assign(player.position, v.position ?? {}) },
    inventory: inv,
    yokai: () => ({ occupies: () => false }) as never,
    spawn: () => ({ x: P1.x + 2, y: P1.y, z: P1.z, yawDeg: 0, pitchDeg: 0 }),
    config: { ...CFG, respawnDelayTicks: RET },
    rng: o.rng ?? (() => 0), // 0 = かならず 落とす
    drops,
    armor,
  });
  const st = { p1Down, returned: 0, downed: 0 };
  const life = new P2Life({ combat, p1Down: () => st.p1Down, onReturn: () => st.returned++, onDown: () => st.downed++ });
  const run = (n: number) => {
    for (let i = 0; i < n; i++) life.step();
  };
  return { life, st, run, combat, inv, drops, player, P1 };
}
const MAX = CFG.playerMaxHp;

describe('AC37: どちらの こうげきも 仲間には ダメージ 0・のけぞりなし', () => {
  it.each([1, 2] as const)('%iP の こうげきは プレイヤーに 当たらない（hitsTarget）', (who) => {
    expect(hitsTarget(who, { type: 'player', who: 1 })).toBe(false);
    expect(hitsTarget(who, { type: 'player', who: 2 })).toBe(false);
  });
  it('妖怪・動物には 当たる', () => {
    for (const who of [1, 2] as const) {
      expect(hitsTarget(who, { type: 'yokai' })).toBe(true);
      expect(hitsTarget(who, { type: 'animal' })).toBe(true);
    }
  });
  it('2P に 1P の こうげきが 来ても ハートは へらず のけぞらない', () => {
    const { life } = make();
    expect(life.hp).toBe(MAX);
    const r = life.damage(7, { type: 'player', who: 1 });
    expect(r).toEqual({ applied: 0, knock: false });
    expect(life.hp).toBe(MAX);
    expect(life.down).toBe(false);
  });
  it('2P 自身の こうげきも 自分には 当たらない。妖怪の こうげきは ふつうに 当たる（対照）', () => {
    const { life } = make();
    expect(life.damage(3, { type: 'player', who: 2 })).toEqual({ applied: 0, knock: false });
    const r = life.damage(3, { type: 'yokai' });
    expect(r.applied).toBeGreaterThan(0);
    expect(life.hp).toBe(MAX - r.applied);
  });
});

describe('AC43: 2P の ハートが 0 → 3 秒（DUO_TUNING.p2ReturnSteps）後に 満タンで 戻る。1P は 倒れた 画面に ならない', () => {
  it('0 で 倒れ、RET - 1 ステップでは まだ 倒れたまま、RET ステップ目に 満タンで 戻る（onReturn は 1 回）', () => {
    const { life, run, st } = make();
    life.damage(MAX, { type: 'yokai' });
    expect(life.hp).toBe(0);
    expect(life.down).toBe(true);
    expect(life.returnLeft).toBe(RET);
    run(RET - 1);
    expect(life.down).toBe(true);
    expect(st.returned).toBe(0);
    expect(life.hp).toBe(0);
    run(1);
    expect(life.down).toBe(false);
    expect(life.hp).toBe(MAX);
    expect(life.returnLeft).toBe(0);
    expect(st.returned).toBe(1);
    run(300);
    expect(st.returned).toBe(1);
  });
  it('倒れている あいだに 追いうちを 受けても のびない・ふえない（hp は 0 のまま、戻る時間は そのまま）', () => {
    const { life, run } = make();
    life.damage(MAX + 5, { type: 'yokai' });
    run(100);
    expect(life.damage(4, { type: 'yokai' }).applied).toBe(0);
    expect(life.returnLeft).toBe(RET - 100);
    run(RET - 100);
    expect(life.down).toBe(false);
  });
  it('倒れているあいだに fill()（レベルアップ）しても 起きない。戻ってからなら 満タンに できる', () => {
    const { life, run } = make();
    life.damage(MAX, { type: 'yokai' });
    life.fill();
    expect(life.down).toBe(true);
    expect(life.hp).toBe(0);
    run(RET);
    life.damage(5, { type: 'yokai' });
    life.fill();
    expect(life.hp).toBe(MAX);
  });
  it('戻ったあと また 倒れたら また RET ステップ', () => {
    const { life, run, st } = make();
    life.damage(MAX, { type: 'yokai' });
    run(RET);
    run(CFG.respawnInvincibleTicks); // 戻った あとの むてきが 終わってから
    life.damage(MAX, { type: 'yokai' });
    expect(life.returnLeft).toBe(RET);
    run(RET);
    expect(st.returned).toBe(2);
  });
  it('倒れたのは 2P だけ: 1P の 状態（p1Down）には さわらない', () => {
    const { life, run, st } = make();
    life.damage(MAX, { type: 'yokai' });
    run(RET);
    expect(st.p1Down).toBe(false);
  });
});

describe('AC44: 1P が 倒れている あいだに 2P も 倒れたら、2P は 1P が 起きたあとに 1P の 横に 戻る', () => {
  it('1P が 倒れたまま RET ステップを こえても 2P は 戻らない。1P が 起きたら すぐ（次の ステップで）戻る', () => {
    const { life, run, st } = make(true);
    life.damage(MAX, { type: 'yokai' });
    run(RET + 400);
    expect(life.down).toBe(true);
    expect(st.returned).toBe(0);
    expect(life.returnLeft).toBe(0);
    st.p1Down = false;
    run(1);
    expect(life.down).toBe(false);
    expect(life.hp).toBe(MAX);
    expect(st.returned).toBe(1);
  });
  it('1P が RET ステップより 前に 起きたら ふつうに RET ステップ目に 戻る', () => {
    const { life, run, st } = make(true);
    life.damage(MAX, { type: 'yokai' });
    run(50);
    st.p1Down = false;
    run(RET - 51);
    expect(life.down).toBe(true);
    run(1);
    expect(life.down).toBe(false);
    expect(st.returned).toBe(1);
  });
});

describe('AC43（追加）: 2P の 体力の 持ち主は 1P と 同じ PlayerCombatImpl（おまもり・落ちる・袋）', () => {
  it('① おまもりを 持っていれば 倒れても 何も 落とさない（おまもりは やぶれた おまもりに かわる）', () => {
    const r = make();
    r.inv.setSlot(3, { item: GADGET_ID.omamori, count: 1 });
    r.life.damage(MAX, { type: 'yokai' });
    expect(r.life.down).toBe(true);
    expect(r.drops.size()).toBe(0);
    expect(r.inv.count('stone')).toBe(4);
    expect(r.inv.count(GADGET_ID.omamori)).toBe(0);
    expect(r.inv.count(GADGET_ID.omamoriTorn)).toBe(1);
  });
  it('② 落ちた ダメージで 倒れても onDown は 1 回・袋は 1 回だけ・RET ステップ後に 1P の 横に 満タンで 戻る', () => {
    const r = make(false, { y: 60 });
    // 高さ h だけ 落ちて 着地（1 ステップ 0.4）。致命的な 高さ
    const h = CFG.safeFallHeight + MAX / CFG.fallDamagePerBlock + 5;
    r.run(1);
    r.player.onGround = false;
    const top = r.player.position.y;
    while (r.player.position.y > top - h + 1e-9) {
      r.player.position.y = Math.max(top - h, r.player.position.y - 0.4);
      r.run(1);
    }
    r.player.onGround = true;
    r.run(1);
    expect(r.life.down).toBe(true);
    expect(r.st.downed).toBe(1);
    expect(r.drops.size(), '選んでいる マス以外の 2 マスぶん を 1 回だけ').toBe(2);
    r.run(RET + 2);
    expect(r.life.down).toBe(false);
    expect(r.life.hp).toBe(r.life.maxHp);
    expect(r.st.returned).toBe(1);
    expect(r.st.downed).toBe(1);
    expect(Math.hypot(r.player.position.x - r.P1.x, r.player.position.z - r.P1.z), '1P の 横').toBeLessThan(4);
  });
});

describe('§2.6 おとしもの袋: takeDropBag は 1P の die() と 同じ 結果', () => {
  function inv() {
    const i = new InventoryImpl();
    i.setSlot(0, { item: 'dirt', count: 3 });
    i.setSlot(1, { item: 'stone', count: 4 });
    i.setSlot(2, { item: 'torch', count: 5 });
    i.select(0);
    return i;
  }
  /** 1P の die()（PlayerCombatImpl）で 同じ 持ち物・同じ シードを 使った 結果 */
  function viaDie(seed: number, chance: number) {
    const i = inv();
    const world = new W();
    const player = { position: { x: 10.5, y: 8, z: 10.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
    const drops = new DropField({ world: world as never, inventory: i, player: () => player.position });
    const combat = new PlayerCombatImpl({
      world: world as never,
      player: { get: () => player, set: () => {} },
      inventory: i,
      yokai: () => ({ occupies: () => false }) as never,
      spawn: () => ({ x: 1, y: 8, z: 1, yawDeg: 0, pitchDeg: 0 }),
      config: { ...CFG, dropChance: chance },
      rng: createRng(seed),
      drops,
    });
    combat.damage(MAX + 100, 'karakasa', { x: 0, y: 8, z: 0 });
    const death = combat.takeHookEvents().find((e) => e.type === 'death') as { dropped: number[] };
    return { dropped: death.dropped, items: drops.list().flatMap((d) => d.slots.map((s) => s.item)).sort(), left: i.slots().map((s) => s?.item ?? null) };
  }
  it.each([[1, 1], [2, 0], [9, 0.5], [4, 0.5]] as const)('シード %i・dropChance %f: dropped と 落ちた 物と のこりの 持ち物が 1P の die() と 同じ', (seed, chance) => {
    const a = viaDie(seed, chance);
    const i = inv();
    const bag = takeDropBag(i, undefined, createRng(seed), chance);
    expect(bag.dropped).toEqual(a.dropped);
    expect(bag.stacks.map((s: ItemStack) => s.item).sort()).toEqual(a.items);
    expect(i.slots().map((s) => s?.item ?? null)).toEqual(a.left);
    expect(bag.protectedBy).toBeUndefined();
  });
  it('おまもりを 持っていれば 何も 落とさず protectedBy = omamori（おまもりは やぶれる）', () => {
    const i = inv();
    i.setSlot(3, { item: GADGET_ID.omamori, count: 1 });
    const bag = takeDropBag(i, undefined, () => 0, 1);
    expect(bag.stacks).toEqual([]);
    expect(bag.protectedBy).toBe('omamori');
    expect(i.count(GADGET_ID.omamoriTorn)).toBe(1);
    expect(i.count('stone')).toBe(4);
  });
});

describe('戻る ステップ数の 表', () => {
  it('3 秒 = 180 ステップ（仕様 §9.5）', () => {
    expect(DUO_TUNING.p2ReturnSteps).toBe(180);
  });
});
