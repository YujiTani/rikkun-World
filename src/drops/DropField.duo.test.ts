import { describe, expect, it } from 'vitest';
import type { BlockId, Inventory, Vec3, VoxelWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { createRng } from '../world/gen/random';
import { DROP, DropField } from './DropField';

/**
 * COOP-1 作業 3a（#416）の 先行テスト（赤）。AC42: 落ちている 物は 先に ふれた 人の 持ち物に 入る。その 人が いっぱいなら もう 1 人が ひろえる。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/drops/DropField.ts  `DropFieldDeps.partner?: () => { position: Vec3; inventory: Inventory } | null`
 *     … 仲間（2P）の 足もとの 位置と 持ち物。なければ（null も）1 人のときと 同じ。
 *     update(canPickup) の 中で、落ちている 物ごとに 先に 1P（今までの 口 `player`・`inventory`）を ためし、1P が 1 つも ひろえない（遠い・いっぱい）なら 仲間を ためす。
 *     ひろえる 距離・高さ・待ち（pickupAt）は 1P と 同じ。同じ ステップに 2 人とも ふれたら 1P。
 *     `onPickup` の 4 つめの 引数に 拾った人（1 | 2）を 足す（2P の ログは 出さない配線のため）。
 *     `onFull`（いっぱいの しらせ）は 2 人とも 入らなかった ときだけ。
 */

class W implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
  isLoaded(): boolean {
    return true;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: 64, z1: 64 };
  }
  b = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64) return 'outside';
    return this.b.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.b.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'outside' && b !== 'air' && b !== 'water';
  }
}

const AT: Vec3 = { x: 10.5, y: 9, z: 10.5 };
const FAR: Vec3 = { x: 50, y: 9, z: 50 };

type Where = 'near' | 'far';
/** near = 落ちた 物の 真上（ひろえる）、far = 遠く。物は 散って 落ちる ので、落ち着いた あとに 場所を 決める（settle） */
function rig(w1: Where, w2: Where | null) {
  const world = new W();
  for (let x = 0; x < 30; x++) for (let z = 0; z < 30; z++) world.setBlock(x, 8, z, 'stone');
  const inv1 = new InventoryImpl();
  const inv2 = new InventoryImpl();
  const pos1 = { ...FAR };
  const pos2 = w2 ? { ...FAR } : null;
  const log: Array<{ item: string; count: number; who: unknown }> = [];
  let full = 0;
  const f = new DropField({
    world,
    inventory: inv1,
    player: () => pos1,
    rng: createRng(3),
    partner: () => (pos2 ? { position: pos2, inventory: inv2 as Inventory } : null),
    onPickup: (item, count, _fromYokai, who) => void log.push({ item, count, who }),
    onFull: () => full++,
  });
  const moveNear = (p: Vec3): void => {
    const at = f.list()[0]!.position;
    p.x = at.x;
    p.y = at.y;
    p.z = at.z;
  };
  const settle = (n = DROP.pickupDelay + 200) => {
    for (let i = 0; i < n; i++) f.update(false);
    if (w1 === 'near') moveNear(pos1);
    if (w2 === 'near' && pos2) moveNear(pos2);
  };
  const drop = (count = 3) => f.scatter({ ...AT }, [{ item: 'dirt', count }]);
  return { f, inv1, inv2, pos1, pos2, moveNear, log, full: () => full, settle, drop };
}

describe('AC42: 落ちている 物は 先に ふれた 人の 持ち物に 入る', () => {
  it('2P だけが ふれる 所に いれば 2P の 持ち物に 入る（1P の 持ち物は ふえない）', () => {
    const r = rig('far', 'near');
    r.drop();
    r.settle();
    for (let i = 0; i < 5; i++) r.f.update(true);
    expect(r.inv2.count('dirt')).toBe(3);
    expect(r.inv1.count('dirt')).toBe(0);
    expect(r.f.size()).toBe(0);
    expect(r.log[0]).toMatchObject({ item: 'dirt', count: 3, who: 2 });
  });
  it('1P だけが ふれる 所に いれば 1P（今までどおり）', () => {
    const r = rig('near', 'far');
    r.drop();
    r.settle();
    for (let i = 0; i < 5; i++) r.f.update(true);
    expect(r.inv1.count('dirt')).toBe(3);
    expect(r.inv2.count('dirt')).toBe(0);
    expect(r.log[0]).toMatchObject({ who: 1 });
  });
  it('2 人とも ふれる 所に いれば 同じ ステップなら 1P。1 つの 物を 2 人で わけ取りしない', () => {
    const r = rig('near', 'near');
    r.drop();
    r.settle();
    for (let i = 0; i < 5; i++) r.f.update(true);
    expect(r.inv1.count('dirt')).toBe(3);
    expect(r.inv2.count('dirt')).toBe(0);
  });
  it('先に ふれた 人が 取る: 2P が 先に 着いて ひろったら、あとから 来た 1P には もう ない', () => {
    const r = rig('far', 'near');
    r.drop();
    r.settle();
    const at = { ...r.f.list()[0]!.position };
    r.f.update(true);
    expect(r.inv2.count('dirt')).toBe(3);
    Object.assign(r.pos1, at);
    for (let i = 0; i < 5; i++) r.f.update(true);
    expect(r.inv1.count('dirt')).toBe(0);
    expect(r.inv2.count('dirt')).toBe(3);
  });
  it('2P が ひろった 袋の id が update() の 戻り値に 入る（ひろう 音・ログの もとに なる。3c の 見張り。今の 実装で 緑）', () => {
    const r = rig('far', 'near');
    r.drop();
    r.settle();
    const id = r.f.list()[0]!.id;
    expect(r.f.update(true)).toEqual([id]);
    expect(r.inv2.count('dirt')).toBe(3);
    expect(r.f.update(true)).toEqual([]);
  });
  it('拾えない あいだ（canPickup=false）は 2P も 拾わない', () => {
    const r = rig('far', 'near');
    r.drop();
    r.settle();
    for (let i = 0; i < 5; i++) r.f.update(false);
    expect(r.inv2.count('dirt')).toBe(0);
    expect(r.f.size()).toBe(1);
  });
});

describe('AC42: その 人が いっぱいなら もう 1 人が ひろえる', () => {
  /** 持ち物を 別の 物で いっぱいに する */
  function fill(inv: InventoryImpl): void {
    let guard = 0;
    while (inv.add('stone', 64) < 64 && guard++ < 200) {
      /* 入る だけ 入れる */
    }
  }
  it('1P が いっぱい → 2 人とも ふれていても 2P が ひろう。onFull は 呼ばれない', () => {
    const r = rig('near', 'near');
    fill(r.inv1);
    r.drop();
    r.settle();
    for (let i = 0; i < 5; i++) r.f.update(true);
    expect(r.inv1.count('dirt')).toBe(0);
    expect(r.inv2.count('dirt')).toBe(3);
    expect(r.full()).toBe(0);
  });
  it('2P が いっぱい → 2P だけ ふれる 所でも 1P が ふれていれば 1P が ひろう', () => {
    const r = rig('near', 'near');
    fill(r.inv2);
    r.drop();
    r.settle();
    for (let i = 0; i < 5; i++) r.f.update(true);
    expect(r.inv1.count('dirt')).toBe(3);
  });
  it('2 人とも いっぱいなら 落ちたまま。onFull が 呼ばれる', () => {
    const r = rig('near', 'near');
    fill(r.inv1);
    fill(r.inv2);
    r.drop();
    r.settle();
    for (let i = 0; i < 5; i++) r.f.update(true);
    expect(r.f.size()).toBe(1);
    expect(r.full()).toBeGreaterThan(0);
  });
  it('一部だけ 入る ときは 入る だけ 1P、のこりは 2P（どちらも ふれていて 1P の 空きが 少ない）', () => {
    const r = rig('near', 'near');
    fill(r.inv1);
    r.inv1.setSlot(0, { item: 'dirt', count: DROP_STACK_MINUS_ONE });
    r.drop(3);
    r.settle();
    for (let i = 0; i < 5; i++) r.f.update(true);
    expect(r.inv1.count('dirt') + r.inv2.count('dirt')).toBe(DROP_STACK_MINUS_ONE + 3);
    expect(r.inv2.count('dirt')).toBeGreaterThan(0);
  });
});

/** 1 マスの 上限（InventoryImpl の 64）より 1 少ない。dirt が 1 つだけ 入る 空き */
const DROP_STACK_MINUS_ONE = 63;
