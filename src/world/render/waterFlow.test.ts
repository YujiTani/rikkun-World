import { MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { FLOW_STRIPE, flowStripe } from '../blocks/waterFlow';
import { applyWaterFlow } from './waterWave';

/** 水 11 回め: 落ちる水（横の 面）の 下へ 流れる すじ。式は 純関数 `flowStripe` と shader で 同じ 定数 */
describe('flowStripe（横の 面の すじ）', () => {
  it('0〜1 で、同じ 引数なら 同じ 値', () => {
    for (let i = 0; i < 200; i++) {
      const v = flowStripe(i * 0.37, i * 0.21, i * 0.05);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBe(flowStripe(i * 0.37, i * 0.21, i * 0.05));
    }
  });
  it('時間が たつと 下へ ずれる: (u, y, t) と (u, y - speed*dt, t + dt) が 同じ', () => {
    const dt = 0.4;
    for (let i = 0; i < 50; i++) {
      const u = i * 0.31;
      const y = 10 + i * 0.17;
      expect(flowStripe(u, y - FLOW_STRIPE.speed * dt, 1 + dt)).toBeCloseTo(flowStripe(u, y, 1), 6);
    }
  });
  it('すじは まばら（うすい 所と こい 所が ある）', () => {
    let on = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (flowStripe((i % 63) * 0.13, Math.floor(i / 63) * 0.11, 0) > 0.5) on++;
    expect(on / n).toBeGreaterThan(0.1);
    expect(on / n).toBeLessThan(0.5);
  });
});

describe('applyWaterFlow（material の shader）', () => {
  it('時間の uniform を つかい、横の 面だけ（法線の y が 小さい）に すじを 足す。描画回数は ふえない（material 1 つの まま）', () => {
    const m = new MeshBasicMaterial();
    applyWaterFlow(m);
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>' };
    m.onBeforeCompile(shader as never, null as never);
    expect(shader.uniforms.uWaveTime).toBeDefined();
    expect(shader.vertexShader).toContain('vFlowPos');
    expect(shader.fragmentShader).toContain('dFdx');
    expect(shader.fragmentShader).toContain('uWaveTime');
    expect(m.customProgramCacheKey()).toContain('flow');
  });
});
