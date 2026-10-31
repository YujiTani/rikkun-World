import { DataTexture } from 'three';
import { describe, expect, it } from 'vitest';
import { WALLS } from '../editor/tuning';
import { GhostWall, ghostAlpha, ghostLevel, ghostWhite, wallGhostLevels } from './ghostWall';
import { WALL_GHOST } from './tuning';
import { OUTWARD } from './view';

/** HOUSE-1B AC59: ② なかの 見本の 手前の かべは 白っぽい 半透明（引っこめない）。白と 不透明さの 計算・かべの 高さ・① は いつも 不透明 */

/** 白へ まぜる 量と 不透明さ（level 0〜1 から） */
const ghostLook = (level: number): { white: number; alpha: number } => ({ white: ghostWhite(level), alpha: ghostAlpha(level) });

const dotOf = (yawDeg: number, wall: (typeof WALLS)[number]): number => {
  const y = (yawDeg * Math.PI) / 180;
  return Math.sin(y) * OUTWARD[wall][0] + Math.cos(y) * OUTWARD[wall][1];
};

describe('AC59 白の まぜ方と 不透明さ（かべの 外向きと カメラの 向きの 内積 dot）', () => {
  it('仕様 2.4 の 数（試作 第 3 版）: 0.1 以下で 白 0・不透明さ 1、0.45 以上で 白 0.7・不透明さ 0.5', () => {
    expect(WALL_GHOST).toEqual({ from: 0.1, to: 0.45, white: 0.7, alpha: 0.5 });
    for (const dot of [-1, -0.3, 0, 0.1]) expect(ghostLook(ghostLevel(dot)), `dot ${dot}`).toEqual({ white: 0, alpha: 1 });
    for (const dot of [0.45, 0.6, 1]) {
      const l = ghostLook(ghostLevel(dot));
      expect(l.white, `dot ${dot}`).toBeCloseTo(0.7, 10);
      expect(l.alpha, `dot ${dot}`).toBeCloseTo(0.5, 10);
    }
  });

  it('あいだは なめらか（とばない・もどらない）: まん中で ちょうど 半分、0.001 きざみで 隣との 差が 小さく 単調', () => {
    const mid = ghostLook(ghostLevel((0.1 + 0.45) / 2));
    expect(mid.white).toBeCloseTo(0.35, 10);
    expect(mid.alpha).toBeCloseTo(0.75, 10);
    let prev = ghostLook(ghostLevel(-1));
    for (let dot = -1; dot <= 1.0001; dot += 0.001) {
      const l = ghostLook(ghostLevel(dot));
      expect(l.white).toBeGreaterThanOrEqual(prev.white - 1e-12);
      expect(l.alpha).toBeLessThanOrEqual(prev.alpha + 1e-12);
      expect(Math.abs(l.white - prev.white), `dot ${dot.toFixed(3)}`).toBeLessThan(0.02);
      expect(Math.abs(l.alpha - prev.alpha), `dot ${dot.toFixed(3)}`).toBeLessThan(0.015);
      prev = l;
    }
  });
});

describe('AC59 見本の 向き（angle）ごとの かべ 4 まい', () => {
  it('① そとの 見本の かべは どの 向きでも 白 0・不透明さ 1', () => {
    for (let yaw = 0; yaw < 360; yaw++) {
      for (const w of WALLS) expect(ghostLook(wallGhostLevels(yaw, 'outside')[w]), `yaw ${yaw} ${w}`).toEqual({ white: 0, alpha: 1 });
    }
  });

  it('② なかの 見本: 手前（カメラがわ）の かべだけ 白っぽく なる。むこうの かべは ふつう。まえから 見る（yaw 0）と まえの かべ', () => {
    const front = wallGhostLevels(0, 'inside');
    expect(front.front).toBe(1);
    expect(front.back).toBe(0);
    expect(front.left).toBe(0);
    expect(front.right).toBe(0);
    const right = wallGhostLevels(90, 'inside');
    expect(right).toMatchObject({ right: 1, left: 0, front: 0, back: 0 });
    // 家の かどから 見る（yaw 45）と 手前の 2 まいが 白っぽい（dot 0.707 ≧ 0.45）
    expect(wallGhostLevels(45, 'inside')).toMatchObject({ front: 1, right: 1, back: 0, left: 0 });
  });

  it('yaw を 0〜359 まで 1 ずつ 回しても、レベルは 0〜1 で、とび（1 度で 0.1 より 大きい 差）が ない。いつも 1 まい 以上は 手前', () => {
    let prev = wallGhostLevels(359, 'inside');
    for (let yaw = 0; yaw < 360; yaw++) {
      const now = wallGhostLevels(yaw, 'inside');
      for (const w of WALLS) {
        expect(now[w], `yaw ${yaw} ${w}`).toBeGreaterThanOrEqual(0);
        expect(now[w], `yaw ${yaw} ${w}`).toBeLessThanOrEqual(1);
        expect(Math.abs(now[w] - prev[w]), `yaw ${yaw} ${w}`).toBeLessThan(0.1);
        expect(now[w]).toBeCloseTo(ghostLevel(dotOf(yaw, w)), 10);
      }
      expect(Math.max(...WALLS.map((w) => now[w])), `yaw ${yaw}`).toBeGreaterThan(0.9);
      prev = now;
    }
  });
});

describe('AC59 かべの 高さ・形は どの 向き・見おろす 角度でも かわらない（引っこまない）', () => {
  it('GhostWall.set(k) は 白と 透け方 だけを かえる。k が 0〜1 の どこでも 高さ（scale.y）・位置（position.y）・見える かどうかは そのまま', () => {
    const wall = new GhostWall(new DataTexture(new Uint8Array(4), 1, 1));
    for (let i = 0; i <= 100; i++) {
      wall.set(i / 100);
      expect(wall.mesh.scale.toArray(), `k ${i / 100}`).toEqual([1, 1, 1]);
      expect(wall.mesh.position.toArray(), `k ${i / 100}`).toEqual([0, 0, 0]);
      expect(wall.mesh.visible, `k ${i / 100}`).toBe(true);
    }
    wall.dispose();
  });

  it('GhostWall: k ＝ 0 は 不透明（深さを 書く・先に 描く）、k > 0 は 半透明（深さを 書かない・あとに 描く）。見た目は ghostLook と 同じ', () => {
    const wall = new GhostWall(new DataTexture(new Uint8Array(4), 1, 1));
    wall.set(0);
    expect(wall.look).toEqual({ white: 0, alpha: 1 });
    expect(wall.material.depthWrite).toBe(true);
    expect(wall.mesh.renderOrder).toBe(0);
    expect(wall.material.transparent, 'シェーダーを 作りなおさない ため いつも true').toBe(true);
    wall.set(0.6);
    expect(wall.look).toEqual(ghostLook(0.6));
    expect(wall.material.depthWrite).toBe(false);
    expect(wall.mesh.renderOrder).toBe(1);
    expect(wall.material.transparent).toBe(true);
    wall.dispose();
  });
});
