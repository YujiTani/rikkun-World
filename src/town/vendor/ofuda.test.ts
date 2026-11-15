import { describe, expect, it } from 'vitest';
import type { ItemId, Vec3 } from '../../contracts';
import { InventoryImpl } from '../../inventory/Inventory';
import { OfudaService, ofudaDest } from './ofuda';
import { OFUDA_TUNING } from './vendorTable';

/** TOWN-1 1E AC32: かえりの おふだ（ため 60 ステップ → ひろばの そば。つかった 人 だけ。わかない はんいの 中では つかえない） */
const OFUDA = 'kaeri_ofuda' as ItemId;
const G = 10; // 地面の y（足もとは 11）
const PLAZA: Vec3 = { x: 100.5, y: G + 1, z: 200.5 };

function rig() {
  const inv = { 1: new InventoryImpl(), 2: new InventoryImpl() };
  const pos: Record<1 | 2, Vec3> = { 1: { x: 300.5, y: G + 1, z: 200.5 }, 2: { x: PLAZA.x, y: PLAZA.y, z: PLAZA.z } };
  const dead = { 1: false, 2: false };
  const solid = new Set<string>();
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const said: (1 | 2)[] = [];
  const arrived: (1 | 2)[] = [];
  const svc = new OfudaService({
    inventory: (w) => inv[w],
    pos: (w) => pos[w],
    alive: (w) => !dead[w],
    inSafe: (x, z) => Math.abs(x - PLAZA.x) < 58 && Math.abs(z - PLAZA.z) < 58,
    plaza: () => PLAZA,
    open: (x, y, z) => y > G && !solid.has(key(x, y, z)),
    ground: (x, y, z) => y === G || solid.has(key(x, y, z)),
    bodyAt: (who, x, y, z) => {
      const o = pos[who === 1 ? 2 : 1];
      return Math.floor(o.x) === x && Math.floor(o.z) === z && Math.floor(o.y) <= y + 1 && Math.floor(o.y) + 2 > y;
    },
    move: (w, p) => {
      pos[w] = { ...p };
    },
    refused: (w) => void said.push(w),
    arrived: (w) => void arrived.push(w),
  });
  inv[1].setSlot(0, { item: OFUDA, count: 3 });
  inv[1].select(0);
  inv[2].setSlot(0, { item: OFUDA, count: 3 });
  inv[2].select(0);
  const run = (n: number): void => {
    for (let i = 0; i < n; i++) svc.step();
  };
  return { inv, pos, dead, solid, key, svc, run, said, arrived };
}

const flat = (p: Vec3, q: Vec3): number => Math.hypot(p.x - q.x, p.z - q.z);

describe('AC32 かえりの おふだ', () => {
  it('街から 100 マス はなれた 所で つかう → 59 ステップでは うつらない、60 ステップで plaza の そば・おふだ −1', () => {
    const r = rig();
    const start = { ...r.pos[1] };
    r.svc.use(1);
    expect(r.svc.state(1).charging).toBe(OFUDA_TUNING.chargeSteps);
    r.run(OFUDA_TUNING.chargeSteps - 1);
    expect(r.svc.state(1).charging).toBe(1);
    expect(r.pos[1]).toEqual(start);
    expect(r.inv[1].count(OFUDA), 'ため の 間は へらない').toBe(3);
    r.run(1);
    expect(r.svc.state(1).charging).toBeNull();
    expect(flat(r.pos[1], PLAZA)).toBeLessThan(OFUDA_TUNING.searchRadius);
    expect(r.pos[1].y).toBe(G + 1);
    expect(r.inv[1].count(OFUDA)).toBe(2);
    expect(r.arrived).toEqual([1]);
  });

  it('2 人の とき もう 1 人（plaza に 立って いる）と 重ならない・もう 1 人は うごかない', () => {
    const r = rig();
    const p2 = { ...r.pos[2] };
    r.svc.use(1);
    r.run(OFUDA_TUNING.chargeSteps);
    expect(flat(r.pos[1], r.pos[2])).toBeGreaterThan(0.4);
    expect(r.pos[2]).toEqual(p2);
  });

  it('ため の 間に 歩いても・ダメージを うけても やめない。やられたら うつらず へらない', () => {
    const r = rig();
    r.svc.use(1);
    r.run(20);
    r.pos[1] = { x: 310.5, y: G + 1, z: 205.5 }; // 歩いた
    r.run(OFUDA_TUNING.chargeSteps - 20);
    expect(flat(r.pos[1], PLAZA)).toBeLessThan(OFUDA_TUNING.searchRadius);
    const r2 = rig();
    r2.svc.use(1);
    r2.run(30);
    r2.dead[1] = true;
    r2.run(40);
    expect(r2.svc.state(1).charging).toBeNull();
    expect(r2.pos[1].x).toBe(300.5);
    expect(r2.inv[1].count(OFUDA)).toBe(3);
  });

  it('わかない はんい（inSafe）の 中では へらず うつらず ため も はじまらない（ふきだし）', () => {
    const r = rig();
    r.pos[1] = { x: PLAZA.x + 20, y: G + 1, z: PLAZA.z };
    r.svc.use(1);
    expect(r.svc.state(1).charging).toBeNull();
    r.run(OFUDA_TUNING.chargeSteps + 5);
    expect(r.pos[1].x).toBe(PLAZA.x + 20);
    expect(r.inv[1].count(OFUDA)).toBe(3);
    expect(r.said).toEqual([1]);
  });

  it('手に もって いなければ 何も しない。2P が つかっても 1P は うごかない', () => {
    const r = rig();
    r.inv[1].select(1);
    r.svc.use(1);
    expect(r.svc.state(1).charging).toBeNull();
    r.pos[2] = { x: 400.5, y: G + 1, z: 200.5 };
    const p1 = { ...r.pos[1] };
    r.svc.use(2);
    r.run(OFUDA_TUNING.chargeSteps);
    expect(flat(r.pos[2], PLAZA)).toBeLessThan(OFUDA_TUNING.searchRadius);
    expect(r.pos[1]).toEqual(p1);
    expect(r.inv[2].count(OFUDA)).toBe(2);
    expect(r.inv[1].count(OFUDA)).toBe(3);
  });

  it('ため の とちゅうで おふだを ぜんぶ なくしたら うつらない', () => {
    const r = rig();
    r.svc.use(1);
    r.inv[1].remove(OFUDA, 3);
    r.run(OFUDA_TUNING.chargeSteps);
    expect(r.pos[1].x).toBe(300.5);
  });
});

describe('おふだの 行き先', () => {
  const ports = (solid: Set<string>, body: Set<string>) => ({
    open: (x: number, y: number, z: number) => y > G && !solid.has(`${x},${y},${z}`),
    ground: (x: number, y: number, z: number) => y === G || solid.has(`${x},${y},${z}`),
    body: (x: number, y: number, z: number) => body.has(`${x},${z}`) && y >= G + 1 && y <= G + 2,
  });
  it('plaza が あいて いれば plaza', () => {
    expect(ofudaDest(PLAZA, ports(new Set(), new Set()))).toEqual(PLAZA);
  });
  it('plaza に 人・ブロックが あれば 水平 8 マス いないの ほかの 立てる マス（マスの まん中）', () => {
    const solid = new Set([`100,${G + 1},199`, `100,${G + 2},199`, `100,${G + 3},199`]);
    const body = new Set(['100,200', '101,200', '99,200']);
    const p = ofudaDest(PLAZA, ports(solid, body));
    expect(flat(p, PLAZA)).toBeLessThan(OFUDA_TUNING.searchRadius);
    expect(flat(p, PLAZA)).toBeGreaterThan(0.5);
    expect(p.x % 1).toBe(0.5);
    expect(p.z % 1).toBe(0.5);
    expect(body.has(`${Math.floor(p.x)},${Math.floor(p.z)}`)).toBe(false);
  });
  it('1 段 高い 所（ふんすいの ふち）でも 立てる', () => {
    const solid = new Set<string>();
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) solid.add(`${100 + dx},${G + 1},${200 + dz}`);
    const p = ofudaDest(PLAZA, ports(solid, new Set()));
    expect(p.y).toBe(G + 2);
  });
});
