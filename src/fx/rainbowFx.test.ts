import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RainbowFx } from './rainbowFx';
import { FxBatch, rgbOf } from './fxPaint';
import { BODY, LENGTHS, TECHS, STEP_OF, colorKeys, installFakeDocument, keyOf, makeCamera, newMeshes, readVerts, trianglesAreFlat } from './legendFxTestKit';

/** LEGEND-FX AC5（虹の 粒・フレアの 数・単色）・AC6（粒が 出ていない 間は ブルーム 0）・AC8・AC9（描画 2 以下・三角形 400 以下）。 */
beforeAll(() => {
  installFakeDocument();
});
afterEach(() => vi.restoreAllMocks());

type Tech = (typeof TECHS)[number];
const SPEC = ['#FF1F3D', '#FF8A00', '#FFE600', '#00E060', '#00B4FF', '#2E5CFF', '#B030FF'].map((h) => keyOf(rgbOf(h)));

const make = () => {
  const scene = new THREE.Scene();
  const before = new Set<THREE.Object3D>(scene.children);
  const fx = new RainbowFx(scene, makeCamera(), LENGTHS);
  return { fx, meshes: () => newMeshes(scene, before) };
};
const queue = (fx: RainbowFx, tech: Tech) => fx.queue({ tech, step: STEP_OF[tech], uDeg: 0, pos: BODY });
const flares = (fx: RainbowFx) => (fx as unknown as { insts: { fSet: Uint8Array }[] }).insts.reduce((n, i) => n + i.fSet.reduce((a, b) => a + b, 0), 0);
/** 粒の 種類ごとの 呼び出しを 数える（disc = 円・band = 線。ほかの 描き方が 呼ばれたら その 名前も） */
function spyKinds() {
  const calls: Record<string, number> = {};
  for (const name of ['disc', 'band', 'quad', 'ribbon', 'strip', 'bandG', 'discG'] as const) {
    const proto = FxBatch.prototype as unknown as Record<string, (...a: unknown[]) => void>;
    const orig = proto[name];
    if (!orig) continue; // 使われなく なって 消えた 描き方（bandG・discG）
    vi.spyOn(proto, name).mockImplementation(function (this: unknown, ...a: unknown[]) {
      calls[name] = (calls[name] ?? 0) + 1;
      return orig.apply(this, a);
    });
  }
  return calls;
}

interface Rec {
  flares: number;
  active: boolean;
  draws: number;
  tris: number;
  bloom: number;
  verts: ReturnType<typeof readVerts>[];
}
function swing(tech: Tech, opts: { idle?: number; hit?: boolean } = {}) {
  const { fx, meshes } = make();
  for (let i = 0; i < (opts.idle ?? 0); i++) fx.step();
  queue(fx, tech);
  const rec: Rec[] = [];
  for (let i = 0; i < 100; i++) {
    if (opts.hit && i === 30) fx.hit({ x: 0, y: 1, z: -2 });
    fx.step();
    rec.push({ flares: flares(fx), active: fx.active(), draws: fx.info().draws, tris: fx.info().tris, bloom: fx.info().bloomPasses, verts: meshes().map(readVerts) });
  }
  return { rec, fx, meshes };
}

describe('AC5: 虹の 粒', () => {
  it.each([['thrust', 1], ['kiriage', 1], ['kesa', 2]] as const)('%s: わざの 終わりに フレアが %i 回', (tech, n) => {
    const { rec } = swing(tech);
    expect(rec.at(-1)!.flares).toBe(n);
  });
  it('フレアは 振っている 間ではなく、わざの 終わりに 出る（刀身の 粒が 先・フレアが あと）', () => {
    const { rec } = swing('kesa');
    const firstParticles = rec.findIndex((r) => r.draws > 0);
    const firstFlare = rec.findIndex((r) => r.flares > 0);
    expect(firstParticles).toBeGreaterThanOrEqual(0);
    expect(firstFlare).toBeGreaterThan(firstParticles);
  });
  it('粒は 線と 円の 2 種だけ（円 = disc・線 = band。ほかの 描き方は 使わない）', () => {
    const calls = spyKinds();
    swing('kesa', { hit: true });
    expect(calls.disc ?? 0).toBeGreaterThan(0);
    expect(calls.band ?? 0).toBeGreaterThan(0);
    expect(Object.keys(calls).filter((k) => !['disc', 'band'].includes(k) && calls[k]), '図形を 描く 呼びだし').toEqual([]);
  });
  it('1 粒は 単色（三角形の 3 頂点が 同じ 色）で、色は 虹の 7 色の どれか。いろいろな 色が まざる', () => {
    const keys = new Set<string>();
    for (const tech of TECHS) {
      const { rec } = swing(tech, { hit: true });
      for (const r of rec) for (const v of r.verts) {
        expect(trianglesAreFlat(v)).toBe(true);
        for (const k of colorKeys(v)) keys.add(k);
      }
    }
    for (const k of keys) expect(SPEC, `色 ${k}`).toContain(k);
    expect(keys.size, '7 色の うち').toBeGreaterThanOrEqual(5);
  });
  it('振っている 間 刀身に 粒が 流れる（粒の 数は 一定 = 同じ ステップで 円 12・線 8）', () => {
    const calls = spyKinds();
    const { fx } = make();
    queue(fx, 'thrust');
    // 刀身の 粒は 窓の まえから（T ≧ −6）。まだ フレアの ない うちの 1 ステップを 見る
    const startup = 2 + 2;
    for (let i = 0; i < startup + 1; i++) fx.step();
    const before = { ...calls };
    fx.step();
    expect((calls.disc ?? 0) - (before.disc ?? 0)).toBe(12);
    expect((calls.band ?? 0) - (before.band ?? 0)).toBe(8);
  });
  it('当てた 妖怪の 胸に 虹色の 点（1 体ごと）', () => {
    const { rec } = swing('thrust', { hit: true });
    const { rec: base } = swing('thrust');
    expect(rec[31]!.tris).toBeGreaterThan(base[31]!.tris);
  });
});

describe('AC6: 虹が 出て いない 間は ブルームを 回さない', () => {
  it('何も していない: 虹は active でなく、描画 0・三角形 0・ブルームの パス 0', () => {
    const { fx } = make();
    for (let i = 0; i < 5; i++) {
      fx.step();
      expect(fx.active()).toBe(false);
      expect(fx.info()).toMatchObject({ draws: 0, tris: 0, bloomPasses: 0, active: 0 });
    }
  });
  it('粒が 出ている 間だけ active（= 世界の 描きを ブルームの 道に する）。おわったら もどる', () => {
    const { rec } = swing('kesa');
    expect(rec.some((r) => r.active)).toBe(true);
    for (const r of rec) expect(r.active, '描いて いる ときだけ').toBe(r.draws > 0);
    expect(rec.at(-1)!.active).toBe(false);
  });
  it('注文を とりけす（cancel）と はじまって いない 虹は 出ない', () => {
    const { fx } = make();
    queue(fx, 'kesa');
    fx.step();
    fx.cancel();
    for (let i = 0; i < 100; i++) {
      fx.step();
      expect(fx.active()).toBe(false);
    }
  });
});

describe('AC9: 描画 2 以下・三角形 400 以下・何も していない 時は 0', () => {
  it.each(TECHS)('%s: 1 振り（当たりの 点も ふくむ）の 最大で 描画 2 以下・三角形 400 以下', (tech) => {
    const { rec } = swing(tech, { hit: true });
    expect(Math.max(...rec.map((r) => r.draws))).toBeLessThanOrEqual(2);
    expect(Math.max(...rec.map((r) => r.tris))).toBeLessThanOrEqual(400);
  });
});

describe('AC8: シード付き・点滅しない', () => {
  const flat = (rec: Rec[]) => rec.map((r) => r.verts.map((v) => [v.n, Array.from(v.pos), Array.from(v.col)]));
  it('同じ 入力の コマ送りで 同じ 粒の 数・位置・色', () => {
    expect(flat(swing('kesa', { hit: true }).rec)).toEqual(flat(swing('kesa', { hit: true }).rec));
  });
  // けさの 2 つ目の フレアは 場所・大きさ・時間を シードで ずらす（オーナー決定）ので、2 回目の 振りと 数が ちがって よい。つき・きりあげで 見る
  it.each(['thrust', 'kiriage'] as const)('%s: 粒の 数は 年れい（ステップ）だけで きまる。2 回目の 振り（シードが ちがう）でも 同じ ならび', (tech) => {
    const { fx, meshes } = make();
    const seqs: number[][] = [];
    for (let round = 0; round < 2; round++) {
      queue(fx, tech);
      const s: number[] = [];
      for (let i = 0; i < 100; i++) {
        fx.step();
        s.push(meshes().reduce((n, m) => n + readVerts(m).n, 0));
      }
      seqs.push(s);
    }
    expect(seqs[1]).toEqual(seqs[0]);
  });
  it('待ってから 振っても 同じ ならび', () => {
    expect(swing('kiriage', { idle: 11 }).rec.map((r) => r.tris)).toEqual(swing('kiriage').rec.map((r) => r.tris));
  });
  it('出ている 間の 粒の 数は 一度に とぎれない（途中で 0 に もどって また 出る 点滅を しない）', () => {
    const { rec } = swing('thrust');
    const on = rec.map((r) => r.draws > 0);
    const a = on.indexOf(true);
    const b = on.lastIndexOf(true);
    expect(on.slice(a, b + 1).every(Boolean)).toBe(true);
  });
});
