import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ItemId, WearEvent } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { drainSounds } from '../fx/soundLog';
import { playWearSound } from '../fx/weaponSounds';
import { WeaponFx } from '../fx/weaponFx';
import { P2State } from './p2State';
import { createP2Wear } from './p2Wear';

/**
 * COOP-1 作業 4b（docs/design/COOP-1.md 1.10 §3.5・AC92）の 先行テスト（赤）。2P の 道具・そうびが へった／こわれた ときの 音と お知らせ。
 * いま 2P の もちものの `drainWearEvents()` を だれも 読まず、出来事が たまり続けて 音も お知らせも 出ない。1P は `WeaponFx` が 毎ステップ 読んで 鳴らす。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/fx/weaponSounds.ts   playWearSound(sound: Pick<SoundFx, 'playTones'>, e: WearEvent): void
 *     wearLow → `playWeapon(sound, 'wearLow')`／ toolBreak → `playWeapon(sound, 'toolBreak')`。（今の WeaponFx.onWear の 音の 部分 そのまま。WeaponFx も これを 呼ぶ。1P の 音は かわらない）
 *   src/duo/p2Wear.ts       createP2Wear(d: P2WearDeps): { step(): void }
 *     P2WearDeps = {
 *       inventory: Pick<Inventory, 'drainWearEvents'>;   // 2P の もちもの（p2.inventory）
 *       armor: Pick<ArmorSystem, 'drainWearEvents'>;     // 2P の そうび（p2.armor）
 *       sound: Pick<SoundFx, 'playTones'>;               // 1P と 同じ 音の 窓口（fxSound）。数の 上限は 2 人で 1 つ
 *       notice: Pick<WearNotice, 'low' | 'broken'>;      // 2P の 半分に 出す お知らせ（WearNotice を 2P の 半分に もう 1 つ。`#wear-hint`・`#wear-log` の id は 2P 用に かえる）
 *       nameOf(item: ItemId): string;                    // 1P と 同じ（アイテムの 名前）
 *     }
 *     step() = 毎ステップ 1 回。`inventory.drainWearEvents()` を 先に、`armor.drainWearEvents()` を あとに 取り出し、**かならず 両方 空に する**。
 *       出来事ごとに `playWearSound` ＋ wearLow なら `notice.low(item, nameOf(item))`・toolBreak なら `notice.broken(item, nameOf(item))`。
 *       （1P の WeaponFx.onWear と 同じ。かけらの つぶ（burst）は 2P では 出さない。2P の 実績は 今まで どおり 共有しない）
 *   配線: wire/duoPlay.ts の step() が `l.wear.step()` を 毎ステップ 呼ぶ（Live に 持たせる。2P の 半分の WearNotice は ui/duoHud.ts か wire/duoInventory.ts が 持ち、`step()` を 毎ステップ 呼ぶ）。
 *   見た目（2P の 半分の お知らせの 位置・重ならない）は UI 検査（e2e/ui-gate.spec.ts の duo-inv-items）が 見る。
 */

const sound = { playTones: () => undefined } as never;
function setup() {
  const p2 = new P2State();
  const calls: string[] = [];
  const notice = {
    low: (item: ItemId, name: string) => void calls.push(`low:${item}:${name}`),
    broken: (item: ItemId, name: string) => void calls.push(`broken:${item}:${name}`),
  };
  const wear = createP2Wear({ inventory: p2.inventory, armor: p2.armor, sound, notice, nameOf: (i) => `名前-${i}` });
  return { p2, calls, wear };
}
/** 道具 1 つが のこり n に なる ように して、1 回 へらす（のこり わずか／こわれる を 起こす） */
function wearTool(inv: InventoryImpl, item: ItemId, left: number): void {
  inv.setSlot(0, { item, count: 1 });
  inv.select(0);
  inv.setDurability(0, left);
  inv.wearHeld(1);
}

describe('AC92 playWearSound: 1P の WeaponFx と 同じ 音', () => {
  const EVENTS: WearEvent[] = [
    { type: 'wearLow', tick: 1, item: 'katana', slot: 0 },
    { type: 'toolBreak', tick: 2, item: 'katana', slot: 0 },
    { type: 'toolBreak', tick: 3, item: 'yoroi', slot: 'body' },
    { type: 'wearLow', tick: 4, item: 'kabuto', slot: 'head' },
  ];
  /** 1P の WeaponFx に 同じ 出来事を わたして 鳴った 音の 名前 */
  function ones(e: WearEvent): string[] {
    const fx = new WeaponFx({
      scene: new THREE.Scene(),
      sound: { play: () => undefined, playTones: () => undefined } as never,
      blade: { drainEvents: () => [], state: () => ({}), shape: () => ({}) } as never,
      bow: { drainEvents: () => [] },
      inventory: { drainWearEvents: () => [e] },
      armor: { drainWearEvents: () => [] },
      bladeHud: { update: () => {}, techStarted: () => {}, stanceChanged: () => {} },
      notice: { low: () => {}, broken: () => {} },
      nameOf: () => '',
      handPos: () => ({ x: 0, y: 1, z: 0 }),
    });
    drainSounds();
    fx.step();
    return drainSounds();
  }

  it('wearLow・toolBreak とも、同じ 出来事で 1P の WeaponFx が 鳴らす 名前と 同じ（1 つずつ）', () => {
    for (const e of EVENTS) {
      const want = ones(e);
      expect(want.length, `${e.type} は 1 つ 以上 鳴る`).toBeGreaterThan(0);
      drainSounds();
      playWearSound(sound, e);
      expect(drainSounds(), `${e.type} ${e.item}`).toEqual(want);
    }
  });
});

describe('AC92 2P の 道具・そうびが へった／こわれた: 音と お知らせ（毎ステップ 読み出す）', () => {
  it('道具が のこり わずかに なると wearLow の 音が 1 つ・お知らせ low が 1 つ。次の ステップでは 出ない', () => {
    const { p2, calls, wear } = setup();
    wearTool(p2.inventory, 'katana', 26);
    drainSounds();
    wear.step();
    expect(drainSounds().filter((n) => n === 'wearLow')).toHaveLength(1);
    expect(calls).toEqual(['low:katana:名前-katana']);
    wear.step();
    wear.step();
    expect(drainSounds().filter((n) => n === 'wearLow')).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });

  it('道具が こわれると toolBreak の 音と お知らせ broken。1P と 同じ 名前の 音', () => {
    const { p2, calls, wear } = setup();
    wearTool(p2.inventory, 'katana', 1);
    drainSounds();
    wear.step();
    expect(drainSounds().filter((n) => n === 'toolBreak')).toHaveLength(1);
    expect(calls).toEqual(['broken:katana:名前-katana']);
  });

  it('そうびが こわれると 同じ 音と お知らせ（2P の そうび p2.armor の 出来事）', () => {
    const { p2, calls, wear } = setup();
    p2.armor.set(null, 'yoroi');
    p2.armor.setDurability('body', 1);
    p2.armor.cut('normal', 5); // よろいが ふせぐ → のこり 1 だったので こわれる
    expect(p2.armor.equipped('body')).toBeNull();
    drainSounds();
    wear.step();
    expect(drainSounds().filter((n) => n === 'toolBreak')).toHaveLength(1);
    expect(calls).toEqual(['broken:yoroi:名前-yoroi']);
  });

  it('1 ステップに 道具と そうびの 両方が 出ても、道具 → そうびの 順で 全部 出る', () => {
    const { p2, calls, wear } = setup();
    wearTool(p2.inventory, 'katana', 1);
    p2.armor.set('kabuto', null);
    p2.armor.setDurability('head', 1);
    p2.armor.cut('ball', 5);
    wear.step();
    expect(calls).toEqual(['broken:katana:名前-katana', 'broken:kabuto:名前-kabuto']);
  });

  it('出来事は 毎ステップ 読み出されて たまらない: step() の あと 2P の もちもの・そうびの 出来事の 入れものは 空', () => {
    const { p2, wear } = setup();
    for (let i = 0; i < 5; i++) {
      wearTool(p2.inventory, 'katana', 1);
      p2.armor.set(null, 'yoroi');
      p2.armor.setDurability('body', 1);
      p2.armor.cut('normal', 5);
      wear.step();
      expect(p2.inventory.drainWearEvents(), `${i} 回目 もちもの`).toEqual([]);
      expect(p2.armor.drainWearEvents(), `${i} 回目 そうび`).toEqual([]);
    }
  });

  it('何も おきない ステップは 何も 鳴らさない・何も 出さない', () => {
    const { calls, wear } = setup();
    drainSounds();
    for (let i = 0; i < 10; i++) wear.step();
    expect(drainSounds()).toEqual([]);
    expect(calls).toEqual([]);
  });
});
