import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { TUNE as T } from './gashaBigTuning';
import { startGashaBig, type GashaBigHandle } from './gashaBig';

/** #293: 体の 上に 置く ブロック。本物の 体（がしゃどくろ）に にせの プレイヤーで ねらって 置く */
function make(pl = { x: 0, y: 0, z: 0 }): { h: GashaBigHandle; top: (name: string) => { x: number; y: number; z: number }; step: (n: number) => void; pl: { x: number; y: number; z: number } } {
  const ups: ((dt: number) => void)[] = [];
  const h = startGashaBig({
    scene: new Scene(), camera: new PerspectiveCamera(),
    player: () => ({ x: pl.x, y: pl.y, z: pl.z, yawDeg: 0 }),
    groundY: () => 0,
    addPlayerSolid: () => {},
    onUpdate: (fn) => { ups.push(fn); },
  });
  h.walk(false);
  h.refreshColliders();
  // 箱の 上の 面の まんなか（ねらう 点）。箱の 上 = 軸 1 の プラス
  const top = (name: string) => {
    const c = h.colliders().find((x) => x.name === name)!;
    const a = c.axes[1];
    return { x: c.center[0] + a[0] * c.half[1], y: c.center[1] + a[1] * c.half[1], z: c.center[2] + a[2] * c.half[1] };
  };
  return { h, top, pl, step: (n) => { for (let i = 0; i < n; i++) for (const f of ups) f(1 / 60); } };
}

describe('体の 上に ブロックを 置く（#293）', () => {
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); });
  afterEach(() => { vi.unstubAllGlobals(); });

  const aimDown = (h: GashaBigHandle, p: { x: number; y: number; z: number }) => h.bodyBlocks.aim({ x: p.x, y: p.y + 2, z: p.z }, { x: 0, y: -1, z: 0 }, 10);

  it('ねらった 体の マスの 上に 置ける。置いた マスは 固く、体の 関節（ねらった 箱の 関節）に くっつく。数の 上限・こわすと 1 つ もどる・置きなおすと 消える', () => {
    const { h, top } = make();
    const p = top('chestCoreFloor');
    const a = aimDown(h, p);
    expect(a).not.toBeNull();
    expect(a!.placed).toBeNull();
    expect(h.bodyBlocks.accepts('stone')).toBe(true);
    expect(h.bodyBlocks.accepts('torch')).toBe(false);
    expect(h.bodyBlocks.canPlace(a!.place, 'stone')).toBe(true);
    expect(h.bodyBlocks.place(a!.place, 'stone')).toBe(true);
    expect(h.bodyBlocks.count).toBe(1);
    expect(h.solidAt(a!.place.x, a!.place.y, a!.place.z)).toBe(true);
    expect(h.bodyBlocks.canPlace(a!.place, 'stone')).toBe(false); // もう ある
    // 置いた ブロックを ねらうと「置いた ブロック」と わかる
    const b = aimDown(h, p);
    expect(b!.placed).toBe('stone');
    expect(b!.cell).toEqual(a!.place);
    // 続けて 上に つむ（その 上の 面を ねらって 置く）
    expect(h.bodyBlocks.place(b!.place, 'dirt')).toBe(true);
    expect(h.bodyBlocks.count).toBe(2);
    expect(h.solidAt(b!.place.x, b!.place.y, b!.place.z)).toBe(true);
    // こわすと 持ち物に もどす ブロックの 種類が わかる。2 度目は なし
    expect(h.bodyBlocks.remove(a!.place)).toBe('stone');
    expect(h.solidAt(a!.place.x, a!.place.y, a!.place.z)).toBe(false);
    expect(h.bodyBlocks.remove(a!.place)).toBeNull();
    expect(h.bodyBlocks.count).toBe(1);
    // 体の 本体は こわせない
    expect(h.bodyBlocks.remove({ x: Math.floor(p.x), y: Math.floor(p.y) - 1, z: Math.floor(p.z) })).toBeNull();
    // 置きなおすと ぜんぶ 消える
    h.place();
    expect(h.bodyBlocks.count).toBe(0);
  });

  it('置いた ブロックは 部位（関節）に ついて 体と いっしょに うごく', () => {
    const { h, top } = make();
    const p = top('chestCoreFloor');
    const a = aimDown(h, p)!;
    h.bodyBlocks.place(a.place, 'stone');
    const joint = h.bodyBlocks.list()[0]!.joint;
    expect(joint).not.toBe('');
    const g = h.joints()[joint as keyof ReturnType<GashaBigHandle['joints']>]!;
    const k = 1 / (h.info().scale as number); // 世界の 1 ブロック（関節の 座標では 1 / 拡大）
    g.position.x += 4 * k;
    h.refreshColliders();
    // 体ごと +4 動いた ので、置いた ブロックも +4
    expect(h.solidAt(a.place.x + 4, a.place.y, a.place.z)).toBe(true);
    // ねらうと 動いた 先の マスが「置いた ブロック」
    const b = h.bodyBlocks.aim({ x: a.place.x + 4.5, y: a.place.y + 2, z: a.place.z + 0.5 }, { x: 0, y: -1, z: 0 }, 10);
    expect(b).toMatchObject({ placed: 'stone', cell: { x: a.place.x + 4, y: a.place.y, z: a.place.z } });
  });

  it('数の 上限は 調整表（placed.max）', () => {
    const { h, top } = make();
    const saved = T.placed.max;
    T.placed.max = 2;
    try {
      const p = top('chestCoreFloor');
      let a = aimDown(h, p)!;
      expect(h.bodyBlocks.place(a.place, 'stone')).toBe(true);
      a = aimDown(h, p)!;
      expect(h.bodyBlocks.place(a.place, 'stone')).toBe(true);
      a = aimDown(h, p)!;
      expect(h.bodyBlocks.canPlace(a.place, 'stone')).toBe(false);
      expect(h.bodyBlocks.place(a.place, 'stone')).toBe(false);
      expect(h.bodyBlocks.count).toBe(2);
    } finally { T.placed.max = saved; }
  });

  it('ガラスの 雲の マスは ほって 割れる（ねらうと glass。1 こだけ 割れて、時間で もどる。アイテムの もとの ブロックは なし）', () => {
    const { h, step } = make();
    h.refreshColliders();
    const cl = h.colliders().find((c) => c.name === 'shoulderL3')!;
    // 雲の 上から 下へ ねらう（上に 別の 雲が ある ので、横から 見える 縁の ほうを さがす）
    let found: ReturnType<GashaBigHandle['bodyBlocks']['aim']> = null;
    for (let dz = -1; dz <= 1 && !found; dz++) for (let dx = -1; dx <= 1 && !found; dx++) {
      const x = cl.center[0] + dx, z = cl.center[2] + dz;
      for (let y0 = Math.ceil(cl.center[1] + 14); y0 > cl.center[1] && !found; y0--) {
        const a = h.bodyBlocks.aim({ x, y: y0, z }, { x: 0, y: -1, z: 0 }, 40);
        if (a?.glass) found = a;
      }
    }
    expect(found, '雲の マスを ねらえる').not.toBeNull();
    const before = h.glassInfo();
    expect(h.bodyBlocks.remove(found!.cell)).toBeNull(); // ガラスは アイテムを 返さない
    expect(h.glassInfo().broken).toBe(before.broken + 1);
    // 時間で もどる
    step(Math.ceil((T.glass.regenDelaySec + 2) * 60));
    expect(h.glassInfo().broken).toBe(before.broken);
  });

  it('ガラスは プレイヤーが 重なって いる 間は もどらない（とじこめない）。はなれたら もどる', () => {
    const { h, step, pl } = make();
    const cell = h.colliders().find((c) => c.name === 'shoulderL3')!;
    const info0 = h.glassInfo();
    expect(h.breakGlass({ x: cell.center[0], y: cell.center[1] + cell.half[1] - 0.5, z: cell.center[2] }, 0.6, 1)).toBe(1);
    // 割れた マスの 中に 立つ
    const mid = { x: cell.center[0], y: cell.center[1] + cell.half[1] - 0.5, z: cell.center[2] };
    // 割れた ガラスの 中心を 探す（いちばん 近い 割れた マス）: breakGlass の 結果から 逆に たどれない ので、かわりに 近くに 立つ
    pl.x = mid.x; pl.y = mid.y - 0.5; pl.z = mid.z;
    step(Math.ceil((T.glass.regenDelaySec + 3) * 60));
    expect(h.glassInfo().broken).toBe(info0.broken + 1);
    pl.x += 20; pl.z += 20; // はなれる
    step(Math.ceil((T.glass.regenGapSec + 1) * 60));
    expect(h.glassInfo().broken).toBe(info0.broken);
  });

  it('足もとの 真下の 体の 上面（丸い 影の 高さ）: 体の 本体の 上・置いた ブロックの 上で 上面の 高さが 返る。体から はなれると null', () => {
    const { h } = make();
    const c = h.colliders().find((x) => x.name === 'chestCoreFloor')!;
    const n = c.axes[1];
    const topY = c.center[1] + c.half[1] / n[1];
    const y = h.bodyBlocks.surfaceBelow(c.center[0], topY + 0.2, c.center[2]);
    expect(y).not.toBeNull();
    expect(y!).toBeCloseTo(topY, 2);
    // 置いた ブロックの 上
    const a = h.bodyBlocks.aim({ x: c.center[0], y: topY + 2, z: c.center[2] }, { x: 0, y: -1, z: 0 }, 10)!;
    h.bodyBlocks.place(a.place, 'stone');
    const y2 = h.bodyBlocks.surfaceBelow(a.place.x + 0.5, a.place.y + 1.1, a.place.z + 0.5);
    expect(y2!).toBeCloseTo(a.place.y + 1, 1);
    // 空の 上（体の 真上 7 ブロック より 高い）
    expect(h.bodyBlocks.surfaceBelow(c.center[0], topY + 20, c.center[2])).toBeNull();
    expect(h.bodyBlocks.surfaceBelow(1000, 100, 1000)).toBeNull();
  });

  it('ボスから 遠い(perf.farDist より 遠い)ときは ねらい・足もとの 影の 計算を すぐ やめる(null)。近ければ 今までどおり', () => {
    const { h, top } = make();
    const p = top('chestCoreFloor');
    expect(aimDown(h, p)).not.toBeNull();
    expect(h.bodyBlocks.surfaceBelow(p.x, p.y + 1, p.z)).not.toBeNull();
    const keep = T.perf.farDist;
    try {
      T.perf.farDist = 0.5; // 体の 中心から 0.5 ブロックより 遠いと「遠い」
      expect(aimDown(h, p)).toBeNull();
      expect(h.bodyBlocks.surfaceBelow(p.x, p.y + 1, p.z)).toBeNull();
    } finally { T.perf.farDist = keep; }
    expect(aimDown(h, p)).not.toBeNull();
    expect(keep).toBeGreaterThanOrEqual(60);
  });

  it('プレイヤーが 遠いと(perf.farDist より 遠い)たたきつけの 予告の 半円・岩など 攻撃の 見た目を 出さない。近ければ 出る', () => {
    const run = (dz: number): number => {
      const { h, step, pl } = make();
      pl.z += dz; // 置いた あとで プレイヤーを 動かす(置く ときは プレイヤーの 前に 出る)
      h.attack('slam2');
      let peak = 0;
      for (let i = 0; i < 40; i++) {
        step(15);
        const fx = (h.attackInfo() as { fx: { warn: boolean; rocks: number; cracks: number } }).fx;
        peak = Math.max(peak, (fx.warn ? 1 : 0) + fx.rocks + fx.cracks);
      }
      return peak;
    };
    const near = run(0), far = run(900);
    expect(far).toBe(0);
    expect(near).toBeGreaterThan(0);
  });
});
