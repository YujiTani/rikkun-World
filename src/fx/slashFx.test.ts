import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { SlashFx, type SlashInfo } from './slashFx';
import { SLASH3, frameSteps, rowOf, spawnDelayOf } from './nijiSlashModel';
import { BODY, TECHS, STEP_OF, installFakeDocument, makeCamera } from './legendFxTestKit';

/**
 * LEGEND-FX AC1・AC2・AC8・AC9（白い 斬撃の 土台）。docs/tickets/LEGEND-FX.md。
 * 板が 出る ステップ・コマ・当たりの 火花は SlashFx の 窓口（slashes・info）に 聞く。絵は 読まない。
 */
let srcs: string[] = [];
beforeAll(() => {
  srcs = installFakeDocument().srcs;
});

const make = () => {
  const scene = new THREE.Scene();
  const camera = makeCamera();
  return { scene, camera, fx: new SlashFx(scene, camera) };
};
const req = (tech: (typeof TECHS)[number], uDeg = 0) => ({ tech, step: STEP_OF[tech], uDeg, pos: BODY });

describe('AC1: 白い 斬撃の 板', () => {
  it('絵は 白い 斬撃（slash_white3.png）の 6×6 コマ・1 コマ 192×132', () => {
    make();
    expect(srcs.some((s) => s.endsWith('slash_white3.png'))).toBe(true);
    expect(srcs.some((s) => s.endsWith('slash_white3_reduced.png'))).toBe(true);
    expect(SLASH3.frameSize.map((x) => x * 3), '素材の 表は 3 分の 1 の 大きさ').toEqual([192, 132]);
    const png = readFileSync(new URL('../../public/models/fx/slash_white3.png', import.meta.url));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([192 * 6, 132 * 6]);
  });

  it.each(TECHS)('%s: 注文から spawnDelay ステップ あとに 板が 1 まい 出て、決めの コマまで 見え、おわると 消える', (tech) => {
    const { fx } = make();
    const d = spawnDelayOf(tech, STEP_OF[tech]);
    fx.queueSlash(req(tech));
    const total = frameSteps(tech).reduce((a, b) => a + b, 0);
    let first = -1;
    let last = -1;
    const draws: number[] = [];
    for (let i = 1; i <= d + total + 5; i++) {
      fx.step(false);
      const vis = fx.slashes().length;
      draws.push(fx.info().slashDraws);
      if (vis && first < 0) first = i;
      if (vis) last = i;
      expect(fx.info().slashDraws, `${i} 歩目の 板の 描画`).toBe(vis);
    }
    expect(first, '出はじめる ステップ').toBe(d + 1);
    expect(Math.abs(last - first + 1 - total), '見えている ステップ数 = コマ表の 合計（ばらつき ±1）').toBeLessThanOrEqual(1);
    expect(draws.at(-1)).toBe(0);
    expect(fx.slashes(), '終わったら 何も 出ない').toEqual([]);
  });

  it('わざごとに 形が かわる（つき・きりあげ・けさ で 絵の 行が ちがう）', () => {
    const rowsFor = (view: 'side' | 'flat') => new Set(TECHS.map((t) => rowOf(t, view)));
    for (const v of ['side', 'flat'] as const) expect(rowsFor(v).size, v).toBe(3);
    const seen = TECHS.map((tech) => {
      const { fx } = make();
      fx.queueSlash(req(tech));
      for (let i = 0; i <= spawnDelayOf(tech, STEP_OF[tech]); i++) fx.step(false);
      return fx.slashes()[0]!;
    });
    expect(seen.map((s) => s.tech)).toEqual(TECHS);
    expect(new Set(seen.map((s) => `${s.view}:${s.row}`)).size, '3 つの わざの 行').toBe(3);
  });

  it('注文を やめる（cancelSlash）と まだ 出ていない 板は 出ない', () => {
    const { fx } = make();
    fx.queueSlash(req('kesa'));
    for (let i = 0; i < 5; i++) fx.step(false);
    fx.cancelSlash();
    for (let i = 0; i < 80; i++) {
      fx.step(false);
      expect(fx.slashes()).toEqual([]);
    }
  });
});

describe('AC2: 当てた 火花（1 体ごとに 1 回）', () => {
  it('hit() 1 回 = 火花が 1 つ。見えている 間は 描画 1・おわると 0', () => {
    const { fx } = make();
    fx.hit({ x: 0, y: 1, z: -2 }, 'kesa', 0);
    expect((fx as unknown as { hits: unknown[] }).hits).toHaveLength(1);
    fx.step(false);
    expect(fx.info().sparkDraws).toBe(1);
    expect(fx.info().sparkQuads).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) fx.step(false);
    expect(fx.info().sparkDraws).toBe(0);
    expect(fx.info().sparkQuads).toBe(0);
    expect((fx as unknown as { hits: unknown[] }).hits).toHaveLength(0);
  });

  it('3 体に 当てたら 火花は 3 つ・描画は 1 のまま・板の 数は 1 体の 3 倍まで', () => {
    const one = make();
    one.fx.hit({ x: 0, y: 1, z: -2 }, 'thrust', 0);
    one.fx.step(false);
    const three = make();
    for (const x of [-2, 0, 2]) three.fx.hit({ x, y: 1, z: -2 }, 'thrust', 0);
    expect((three.fx as unknown as { hits: unknown[] }).hits).toHaveLength(3);
    three.fx.step(false);
    expect(three.fx.info().sparkDraws).toBe(1);
    expect(three.fx.info().sparkQuads).toBeLessThanOrEqual(one.fx.info().sparkQuads * 3);
    expect(three.fx.info().sparkQuads).toBeGreaterThan(one.fx.info().sparkQuads);
  });

  it('板が 出る ステップでは ない（hit を よばない かぎり 火花は 出ない）', () => {
    const { fx } = make();
    fx.queueSlash(req('kesa'));
    for (let i = 0; i < 60; i++) {
      fx.step(false);
      expect(fx.info().sparkDraws).toBe(0);
    }
  });
});

describe('AC9: 数の 上限・何もしていない 時は 0', () => {
  it('何も していない: 板 0・火花 0', () => {
    const { fx } = make();
    for (let i = 0; i < 10; i++) fx.step(false);
    expect(fx.info()).toMatchObject({ slash: false, slashDraws: 0, sparkDraws: 0, sparkQuads: 0 });
    expect(fx.slashes()).toEqual([]);
  });

  it('1 振り・同時に 20 体に 当てても 板 1 ＋ 火花 1 = 描画 2 以下・火花の 三角形は 8 体ぶんで 頭うち', () => {
    const { fx } = make();
    fx.queueSlash(req('kesa'));
    for (let h = 0; h < 20; h++) fx.hit({ x: h, y: 1, z: -2 }, 'kesa', 0);
    expect((fx as unknown as { hits: unknown[] }).hits.length).toBeLessThanOrEqual(8);
    let maxDraws = 0;
    let maxQuads = 0;
    for (let i = 0; i < 80; i++) {
      fx.step(false);
      const f = fx.info();
      maxDraws = Math.max(maxDraws, f.slashDraws + f.sparkDraws);
      maxQuads = Math.max(maxQuads, f.sparkQuads);
    }
    expect(maxDraws).toBeLessThanOrEqual(2);
    expect(maxQuads * 2, '火花の 三角形').toBeLessThanOrEqual(8 * 9 * 2);
  });
});

describe('AC8: 決定的・点滅しない', () => {
  const run = (reduced = false) => {
    const { fx } = make();
    const out: { slash: SlashInfo[]; quads: number }[] = [];
    fx.queueSlash(req('kiriage', 37));
    for (let i = 0; i < 70; i++) {
      if (i === 15) fx.hit({ x: 0.5, y: 1, z: -2 }, 'kiriage', 37);
      fx.step(reduced);
      out.push({ slash: fx.slashes(), quads: fx.info().sparkQuads });
    }
    return out;
  };
  it('同じ 入力の コマ送りで 同じ 板（コマ・位置・向き）と 同じ 火花の 数', () => {
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
  it('一度 出たら おわるまで とぎれず、コマは 前に しか 進まない（点滅しない）', () => {
    const rec = run();
    const vis = rec.map((r) => r.slash.length > 0);
    const a = vis.indexOf(true);
    const b = vis.lastIndexOf(true);
    expect(vis.slice(a, b + 1).every(Boolean)).toBe(true);
    const frames = rec.filter((r) => r.slash.length).map((r) => r.slash[0]!.frame);
    for (let i = 1; i < frames.length; i++) expect(frames[i]!).toBeGreaterThanOrEqual(frames[i - 1]!);
  });
});
