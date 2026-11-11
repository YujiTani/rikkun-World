import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import type { BowStepContext, ItemId, Vec3, YokaiKnock, YokaiRayHit, YokaiWorld } from '../contracts';
import { createW2Settings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createBowSystem } from '../tools/bow/BowSystem';
import { buildBig, worldHits } from './gashaBig';
import { BigHit, type BoxLike } from './gashaBigHit';

/**
 * 黒龍（まっすぐ つらぬく や）が がしゃどくろに 当たる（オーナーの 報告）。
 * 矢は raycastAll を 使う ので、がしゃどくろの 当たり（YokaiManager への 割りこみ）も raycastAll に 重なって いる こと。
 */

/** 本物の 妖怪が 1 体も いない 世界（raycast と raycastAll を 両方 持つ。YokaiManager と 同じ 形） */
class EmptyYokai implements YokaiWorld {
  real: { id: number; x: number } | null = null; // 本物の 妖怪 1 体（x の 位置。z 方向の 線に かかる）
  dmg: { id: number; amount: number }[] = [];
  list() { return []; }
  raycast(o: Vec3, _d: Vec3, max: number): YokaiRayHit | null { return this.raycastAll(o, _d, max)[0] ?? null; }
  raycastAll(o: Vec3, _d: Vec3, max: number): readonly YokaiRayHit[] {
    if (!this.real) return [];
    const t = o.z - this.real.x;
    return t > 0 && t <= max ? [{ id: this.real.id, kind: 'karakasa', distance: t }] : [];
  }
  damage(id: number, amount: number, _from: Vec3, _k?: YokaiKnock) { this.dmg.push({ id, amount }); return amount; }
  occupies() { return false; }
  drainEvents() { return []; }
}

function rig(withReal = false) {
  const model = buildBig();
  const off = { x: 12, z: 0 };
  const boxes: BoxLike[] = worldHits(model).map((h) => ({ name: h.name, c: [h.center[0] + off.x, h.center[1], h.center[2] + off.z], ax: [...h.axes[0], ...h.axes[1], ...h.axes[2]], half: h.half }));
  const yokai = new EmptyYokai();
  const bh = new BigHit({ scene: new Scene(), angry: () => {}, sources: { yokai: () => yokai } });
  bh.bind(boxes, model);
  const hand = boxes.find((b) => b.name === 'handL')!;
  const eye: Vec3 = { x: hand.c[0]!, y: hand.c[1]!, z: hand.c[2]! + hand.half[2]! + 20 };
  if (withReal) yokai.real = { id: 5, x: eye.z - 10 };
  let ya = 50, tick = 0, held = false, prev = false;
  const inv = {
    count: (i: ItemId) => (i === 'ya' ? ya : 0),
    remove: (i: ItemId, n: number) => { if (i !== 'ya') return 0; const k = Math.min(n, ya); ya -= k; return k; },
    add: (i: ItemId, n: number) => { if (i === 'ya') ya += n; return 0; },
    canAdd: () => true,
  };
  const bow = createBowSystem({ world: new ArrayVoxelWorld(), yokai: () => yokai, settings: createW2Settings(), inventory: inv, onShot: () => {}, tick: () => tick });
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      const ctx: BowStepContext = { item: 'kokuryu', pressed: held && !prev, held, eye, dir: { x: 0, y: 0, z: -1 }, position: { x: eye.x, y: eye.y - 1.6, z: eye.z }, active: true };
      prev = held;
      bow.update(ctx);
      tick++;
    }
  };
  const fire = () => { held = true; step(40); held = false; step(60); };
  return { bh, yokai, fire };
}

describe('黒龍 × がしゃどくろ', () => {
  it('まっすぐな や（raycastAll）が がしゃどくろの からだに 当たり、ダメージが とどく', () => {
    const r = rig();
    r.fire();
    expect(r.bh.hits).toBeGreaterThan(0);
    expect(r.bh.hp).toBeLessThan(r.bh.maxHp);
    expect(r.yokai.dmg).toEqual([]); // 本物の 妖怪には とどかない（仮の id は がしゃどくろが 受ける）
  });
  it('本物の 妖怪は つらぬいて、そのうえで うしろの がしゃどくろにも 当たる（近い 順・各 1 回）', () => {
    const r = rig(true);
    r.fire();
    expect(r.yokai.dmg.map((d) => d.id)).toEqual([5]);
    expect(r.bh.hp).toBeLessThan(r.bh.maxHp);
  });
});
