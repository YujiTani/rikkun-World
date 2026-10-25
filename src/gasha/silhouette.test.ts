import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, ShaderLib } from 'three';
import { hazePatch } from './gashaBig';
import { TUNE as BIG } from './gashaBigTuning';
import { RELEASE } from './releaseTuning';
import { applySilhouette, silhouetteShader, updateSilhouette } from './silhouette';

const BASE = ShaderLib.basic.fragmentShader;
const run = (m: MeshBasicMaterial): { fragmentShader: string; uniforms: Record<string, { value: unknown }> } => {
  const sh = { fragmentShader: BASE, uniforms: {} as Record<string, { value: unknown }> };
  (m.onBeforeCompile as unknown as (s: typeof sh, r: unknown) => void)(sh, null);
  return sh;
};

describe('霧の 外の シルエット（体の 材料の シェーダー）', () => {
  it('試作の 霞み（hazePatch）の シェーダーに 距離で 暗い 色へ まぜる 行を 足す（霧の 中だけ。描画は ふえない）', () => {
    const m = new MeshBasicMaterial();
    hazePatch(m);
    const before = run(m).fragmentShader;
    expect(before).toContain('uHaze');
    const after = silhouetteShader(before);
    expect(after).toContain('uniform vec3 uSilCol;');
    expect(after).toContain('uniform vec3 uSilRange;');
    expect(after).toContain('smoothstep(uSilRange.x, uSilRange.y, vFogDepth) * uSilRange.z');
    // 霞みの 行は のこり、同じ #ifdef USE_FOG の 中に ある
    expect(after.indexOf('uHaze.z);')).toBeLessThan(after.indexOf('uSilCol,'));
    expect(after.indexOf('uSilCol,')).toBeLessThan(after.indexOf('#endif', after.indexOf('uSilCol,')));
    expect(silhouetteShader(after)).toBe(after); // 2 回 かけても かわらない
  });

  it('霞みの 無い シェーダーは かえない', () => {
    expect(silhouetteShader(BASE)).toBe(BASE);
  });

  it('体の 材料だけ に かかり、uniform が 入る。材料の 数・メッシュの 数は ふえない', () => {
    const g = new Group();
    const body = new MeshBasicMaterial(), plain = new MeshBasicMaterial();
    hazePatch(body);
    g.add(new Mesh(new BoxGeometry(), body), new Mesh(new BoxGeometry(), body), new Mesh(new BoxGeometry(), plain));
    const meshes = (): number => { let n = 0; g.traverse((o) => { if ((o as Mesh).isMesh) n++; }); return n; };
    const n0 = meshes();
    expect(applySilhouette(g)).toBe(1); // 同じ 材料は 1 回だけ
    expect(meshes()).toBe(n0);
    const sh = run(body);
    expect(sh.fragmentShader).toContain('uSilCol');
    expect(sh.uniforms.uSilCol).toBeDefined();
    expect(sh.uniforms.uSilRange).toBeDefined();
    expect(sh.uniforms.uHaze).toBeDefined(); // 元の 霞みの uniform も のこる
    expect(plain.onBeforeCompile.toString()).not.toContain('uSilCol');
    expect(applySilhouette(g)).toBe(0); // 2 回目は かけない
  });

  it('調整表の 色・距離・濃さが uniform に 入る。off なら 濃さ 0、霞みは 調整表の hazeMax に する', () => {
    const g = new Group();
    const m = new MeshBasicMaterial();
    hazePatch(m);
    g.add(new Mesh(new BoxGeometry(), m));
    applySilhouette(g);
    const S = RELEASE.silhouette;
    const sh = run(m);
    updateSilhouette();
    const col = sh.uniforms.uSilCol!.value as { x: number; y: number; z: number };
    const range = sh.uniforms.uSilRange!.value as { x: number; y: number; z: number };
    expect(col.x).toBeCloseTo(((S.color >> 16) & 255) / 255, 5);
    expect(range.x).toBe(S.nearBlocks);
    expect(range.y).toBe(S.farBlocks);
    expect(range.z).toBe(S.strength);
    expect(BIG.look.hazeMax).toBe(S.hazeMax);
    S.on = false;
    try {
      updateSilhouette();
      expect((run(m).uniforms.uSilRange!.value as { z: number }).z).toBe(0);
    } finally { S.on = true; updateSilhouette(); }
  });

  it('シルエットは 近い ところ（nearBlocks 未満）では かからず、遠いほど 濃い（調整表の 値）', () => {
    const S = RELEASE.silhouette;
    expect(S.nearBlocks).toBeLessThan(S.farBlocks);
    expect(S.farBlocks).toBeLessThanOrEqual(RELEASE.spawn.minDistance); // 出る 距離（150〜）では 最大の 濃さ
    expect(S.strength).toBeGreaterThan(0.5);
    expect(S.strength).toBeLessThanOrEqual(1);
  });
});
