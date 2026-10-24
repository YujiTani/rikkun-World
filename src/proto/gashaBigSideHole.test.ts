// 体の 左がわの 小さな 穴の ユニットテスト
import { describe, expect, it } from 'vitest';
import { TUNE as T } from './gashaBigTuning';
import { buildBig, worldHits, type WorldHit } from './gashaBig';
import { rayBox, type BoxLike } from './gashaBigHit';

/** 体の 左がわの 小さな 穴（オーナー 2026-10-24 11:25）: 地面から 弓で 穴を 通せば 登らなくても コアに 当たる。穴が なければ 当たらない */
function boxes(): { hits: BoxLike[]; core: WorldHit } {
  const model = buildBig();
  model.group.position.set(0, 0, 0);
  model.group.scale.setScalar(model.scale);
  const raw = worldHits(model);
  const hits: BoxLike[] = raw.map((h) => ({ name: h.name, c: h.center, ax: [...h.axes[0], ...h.axes[1], ...h.axes[2]], half: h.half }));
  return { hits, core: raw.find((h) => h.name === 'core')! };
}

/** 線 o → 目標点（そのさき）で いちばん 先に 当たる 箱の 名前 */
function firstHit(hits: BoxLike[], o: number[], t: number[]): string | null {
  const d = [t[0]! - o[0]!, t[1]! - o[1]!, t[2]! - o[2]!];
  const L = Math.hypot(d[0]!, d[1]!, d[2]!);
  d[0]! /= L; d[1]! /= L; d[2]! /= L;
  let best: { t: number; n: string } | null = null;
  for (const b of hits) { if (b.name === 'holeGuard') continue; /* 矢は 見えない 壁を とおる */ const s = rayBox(b, o[0]!, o[1]!, o[2]!, d[0]!, d[1]!, d[2]!, L + 6); if (s != null && (!best || s < best.t)) best = { t: s, n: b.name }; }
  return best?.n ?? null;
}

/** 地面（コアより 約 8 ブロック 下）の 左がわから、穴の あたりに ねらいを ふって 最初に コアに 当たる ねらいの 数と 全体の 数 */
function scan(hits: BoxLike[], core: WorldHit, dx: number, dz: number): { ok: number; total: number } {
  const o = [core.center[0] + dx, core.center[1] - 8.4 + 1.6, core.center[2] + dz];
  let ok = 0, total = 0;
  for (let y = -4; y <= 4; y += 0.2) for (let z = -3.5; z <= 3.5; z += 0.2) {
    total++;
    if (firstHit(hits, o, [core.center[0] + 3.0, core.center[1] + y, core.center[2] + z]) === 'core') ok++;
  }
  return { ok, total };
}

describe('体の 左がわの 小さな 穴（core.sideHole）', () => {
  it('調整表: 穴は 約 2 ブロック 四方（もとの 座標 w 3.6 × h 4.2）。数は 調整表の core の 節', () => {
    const H = T.core.sideHole;
    expect(H.enabled).toBe(true);
    expect(H.w * 0.605).toBeGreaterThanOrEqual(1);
    expect(H.w * 0.605).toBeLessThanOrEqual(2.4);
    expect(H.h * 0.512).toBeGreaterThanOrEqual(1);
    expect(H.h * 0.512).toBeLessThanOrEqual(2.4);
  });

  it('地面から 穴を 通す 線は 最初に コアに 当たる（体の 左がわ 20〜35 ブロック はなれた 地面から）', () => {
    const { hits, core } = boxes();
    for (const dx of [22, 26, 32]) {
      const r = scan(hits, core, dx, 0);
      expect(r.ok, `左へ ${dx}`).toBeGreaterThan(0);
      expect(r.ok / r.total, `左へ ${dx}`).toBeLessThan(0.1); // 小さくて 当てにくい
    }
  });

  it('穴を 通さない 線（コアの まんなかを 直接 ねらう）は 道の かべに ふさがれる。穴を なくすと 通る ねらいが へる', () => {
    const { hits, core } = boxes();
    const o = [core.center[0] + 26, core.center[1] - 6.8, core.center[2]];
    expect(firstHit(hits, o, core.center as number[])).not.toBe('core');
    const saved = T.core.sideHole.enabled;
    try {
      T.core.sideHole.enabled = false;
      const b2 = boxes();
      const without = scan(b2.hits, b2.core, 26, 0).ok;
      T.core.sideHole.enabled = true;
      const b1 = boxes();
      const withHole = scan(b1.hits, b1.core, 26, 0).ok;
      // 穴を 開けると 通る ねらいが ふえる（穴の ない ときの 数は 板の つなぎめの 細い すきまを ぬける ぶん）
      expect(withHole).toBeGreaterThan(without + 15);
    } finally { T.core.sideHole.enabled = saved; }
  });

  it('穴には 入れない: 見えない 壁（holeGuard）が 穴を ふさぐ。矢の 当たりには ならない（部位 cloud・倍率 0）', async () => {
    const { hits } = boxes();
    const g = hits.find((b) => b.name === 'holeGuard');
    expect(g).toBeDefined();
    const { partOf, mulOf } = await import('./gashaBigHit');
    expect(mulOf(partOf('holeGuard'))).toBe(0);
  });

  it('穴の まわりの かべ 4 つは うすい 箱を 作らない（箱の 名前 chestMid1*）', () => {
    const { hits } = boxes();
    const names = hits.map((b) => b.name).filter((n) => n.startsWith('chestMid1') && !n.endsWith('R'));
    expect(names).toContain('chestMid1');
    expect(names).toContain('chestMid1Front');
    expect(names).not.toContain('chestMid1Up'); // 天井まで あけて ある ので 上の かべは ない
  });
});
