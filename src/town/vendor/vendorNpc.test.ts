import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../contracts';
import { townBuildingCells } from '../townBuildings';
import { TownPlan, type TownInfo } from '../townPlan';
import { BUILDING_SITES, NPC_SITES, STALL_SITES } from '../townSites';
import type { Facing } from '../townTuning';
import { VENDOR_TALK_ID, vendorRay, withVendorTalk, type VendorTalkHub } from './vendorTalk';
import type { VendorNpc } from './vendorDesk';
import { VENDOR_TRI_LIMIT, smithArmModel, vendorModel } from '../vendorNpcSpec';

/**
 * TOWN-1 1E: かじやさん・やたいの 3 人（`town.info().npcs` の smith・stall・dango・gohan）と AC49（かざりの やたいは 話せない）。
 * 人の 前 2 マス（かじや ＝ 戸口の ほう、やたい ＝ 前の 立つ マスの ほう）から 何にも じゃま されずに 話しかけられる。
 */
const cells = townBuildingCells();
const solid = (u: number, v: number, dy: number): boolean => cells.some((c) => c.u === u && c.v === v && c.dy === dy);
const FACINGS: Facing[] = ['n', 'e', 's', 'w'];
const VENDORS: VendorNpc[] = ['smith', 'stall', 'dango', 'gohan'];
const stallOf = (n: VendorNpc): 'kaitori' | 'dango' | 'gohan' => (n === 'stall' ? 'kaitori' : (n as 'dango' | 'gohan'));

/** e2e/helpers/town1e.ts の vendorStand と 同じ 考え方（人の「前」へ 2 マス） */
function stand(info: TownInfo, npc: VendorNpc): { npc: Vec3; stand: Vec3 } {
  const n = info.npcs.find((x) => x.kind === npc)!.pos;
  const to = npc === 'smith' ? info.buildings.find((b) => b.kind === 'kajiya')!.door : info.stalls.find((s) => s.kind === stallOf(npc) && s.talk)!.pos;
  const dx = to.x - n.x;
  const dz = to.z - n.z;
  const alongX = Math.abs(dx) >= Math.abs(dz);
  return { npc: n, stand: { x: Math.floor(n.x) + 0.5 + (alongX ? 2 * Math.sign(dx) : 0), y: n.y, z: Math.floor(n.z) + 0.5 + (alongX ? 0 : 2 * Math.sign(dz)) } };
}

describe('1E の 街の 人', () => {
  it('表に 1 人ずつ。かじやさんは かじやの 四角の 中', () => {
    for (const k of VENDORS) expect(NPC_SITES.filter((n) => n.kind === k).length, k).toBe(1);
    const s = NPC_SITES.find((n) => n.kind === 'smith')!;
    const kj = BUILDING_SITES.find((b) => b.kind === 'kajiya')!;
    expect(s.u).toBeGreaterThanOrEqual(kj.u0);
    expect(s.u).toBeLessThanOrEqual(kj.u1);
    expect(s.v).toBeGreaterThanOrEqual(kj.v0);
    expect(s.v).toBeLessThanOrEqual(kj.v1);
  });

  it('足もとは ゆか、からだの 2 マスと 前の 2 マス（話しかける 立ち場所）までは あいて いる', () => {
    for (const n of NPC_SITES.filter((x) => VENDORS.includes(x.kind as VendorNpc))) {
      const f = n.feetDy;
      expect(solid(n.u, n.v, f - 1), `${n.kind} の ゆか`).toBe(true);
      for (let v = n.v; v <= n.v + 2; v++) for (const dy of [f, f + 1]) expect(solid(n.u, v, dy), `${n.kind} v ${v} dy ${dy}`).toBe(false);
      expect(solid(n.u, n.v + 2, f - 1), `${n.kind} の 立ち場所の ゆか`).toBe(true);
    }
  });

  it('やたいの 3 人: 前の カウンターの となり（u±1）の 上（dy 1）も あいて いる（かたごしの カメラの 線が 物に じゃま されない）', () => {
    for (const n of NPC_SITES.filter((x) => x.kind === 'stall' || x.kind === 'dango' || x.kind === 'gohan')) {
      for (const du of [-1, 1]) for (let v = n.v + 1; v <= n.v + 2; v++) expect(solid(n.u + du, v, n.feetDy + 1), `${n.kind} u${du} v ${v}`).toBe(false);
    }
  });

  it('形の 三角形は 上限 いか（かじやさんは うでと つちを 足して）', () => {
    for (const k of ['smith', 'stall', 'dango', 'gohan'] as const) {
      const t = vendorModel(k).tris + (k === 'smith' ? smithArmModel().tris : 0);
      expect(t, k).toBeGreaterThan(0);
      expect(t, k).toBeLessThanOrEqual(VENDOR_TRI_LIMIT);
    }
  });

  it('AC34: かじやさんは buildings の kajiya の 中（4 つの 向き）。人は みな 手前を 向く', () => {
    for (const facing of FACINGS) {
      const info = new TownPlan({ v: 1, x0: 1000, z0: -2000, facing, groundY: 40 }, null).info();
      const b = info.buildings.find((x) => x.kind === 'kajiya')!;
      const p = info.npcs.find((n) => n.kind === 'smith')!.pos;
      expect(p.x, facing).toBeGreaterThan(b.min.x);
      expect(p.x, facing).toBeLessThan(b.max.x + 1);
      expect(p.z, facing).toBeGreaterThan(b.min.z);
      expect(p.z, facing).toBeLessThan(b.max.z + 1);
      expect(p.y, facing).toBe(b.min.y + 1);
      for (const k of ['stall', 'dango', 'gohan'] as const) expect(info.npcs.find((n) => n.kind === k)!.pos.y, `${facing} ${k}`).toBe(info.groundY + 1);
    }
  });

  it('前の 立ち場所から 人の からだの まん中を ねらうと その 人に 当たる（4 つの 向き）', () => {
    for (const facing of FACINGS) {
      const info = new TownPlan({ v: 1, x0: 1000, z0: -2000, facing, groundY: 40 }, null).info();
      const hub: VendorTalkHub = { at: (n) => info.npcs.find((x) => x.kind === n)?.pos ?? null, talk: () => true };
      for (const k of VENDORS) {
        const { npc, stand: s } = stand(info, k);
        const eye = { x: s.x, y: s.y + 1.62, z: s.z };
        const d = { x: npc.x - eye.x, y: npc.y + 0.9 - eye.y, z: npc.z - eye.z };
        const len = Math.hypot(d.x, d.y, d.z);
        const hit = vendorRay(hub, eye, { x: d.x / len, y: d.y / len, z: d.z / len }, 4.5);
        expect(hit?.npc, `${facing} ${k}`).toBe(k);
      }
    }
  });
});

describe('AC49 かざりの やたい', () => {
  it('話せる やたい（talk true）には かならず npcs の 人が 1 人 そばに いる。かざりの やたいの そばには いない', () => {
    const info = new TownPlan({ v: 1, x0: 0, z0: 0, facing: 's', groundY: 40 }, null).info();
    for (const s of info.stalls) {
      const near = info.npcs.filter((n) => Math.hypot(n.pos.x - s.pos.x, n.pos.z - s.pos.z) <= 3.5);
      expect(near.length, `${s.kind} ${s.talk}`).toBe(s.talk ? 1 : 0);
    }
    expect(STALL_SITES.filter((s) => !s.talk).length).toBeGreaterThan(0);
  });

  it('かざりの やたいを ねらっても 話す 口に 当たらない（「はなす」が 出ない・右クリックで 開かない）', () => {
    const info = new TownPlan({ v: 1, x0: 0, z0: 0, facing: 's', groundY: 40 }, null).info();
    let opened = 0;
    const port = withVendorTalk({ rayHit: () => null, talk: () => false }, () => ({ at: (n) => info.npcs.find((x) => x.kind === n)?.pos ?? null, talk: () => ((opened += 1), true) }), 1);
    for (const s of info.stalls.filter((x) => !x.talk)) {
      // 立つ マスから 店の ほう（北 ＝ −z）を 見わたす
      for (const ang of [-0.6, -0.3, 0, 0.3, 0.6]) {
        const eye = { x: s.pos.x, y: s.pos.y + 1.62, z: s.pos.z };
        const h = port.rayHit(eye, { x: Math.sin(ang), y: -0.2, z: -Math.cos(ang) }, 4.5);
        expect(h, s.kind).toBeNull();
      }
    }
    expect(opened).toBe(0);
    expect(port.talk(VENDOR_TALK_ID.dango)).toBe(true);
    expect(opened).toBe(1);
  });
});
