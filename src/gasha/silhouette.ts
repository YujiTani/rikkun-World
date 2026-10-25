/**
 * #293 リリース: 霧の 外でも がしゃどくろの 体だけ 見える（決定「霧の 外でも 影が 見える」）。
 * 体の 材料は 試作の 霞み（gashaBig.ts の hazePatch。遠いほど 空の 色に 溶ける）が かかって いて、遠く（150〜250 ブロック）では 空に 溶けて ほぼ 見えない。
 * そこで 遠いほど 空に 溶けず、暗い 単色（シルエット）に 近づける: 体の 材料の シェーダーに「カメラからの 距離で 暗い 色へ まぜる」1 行を 足す。
 *  ・メッシュ・材料・描画回数は ふえない（数行の シェーダーの 変更 だけ）。体は 描画の 範囲（チャンク）と 関係なく 描かれる ので、地面が 描かれない 遠くでも 見える。
 *  ・色・距離・濃さは releaseTuning.ts の silhouette。試作の 霞みは hazeMax = 0 に して けんかしない ようにする（release 側だけ。試作ページは そのまま）。
 */
import { Vector3, type Material, type MeshBasicMaterial, type Object3D } from 'three';
import { TUNE as BIG } from './gashaBigTuning';
import { RELEASE } from './releaseTuning';

const silCol = { value: new Vector3(0.12, 0.14, 0.2) };
const silRange = { value: new Vector3(60, 150, 0.88) };
const MARK = 'uSilCol';

/** hazePatch の 霞みの 行の あとに、距離で 暗い 色へ まぜる 行を 足す。霞みの 無い シェーダー・足した あとの シェーダーは かえない */
export function silhouetteShader(frag: string): string {
  if (frag.includes(MARK) || !frag.includes('* uHaze.z);')) return frag;
  return frag
    .replace('uniform vec3 uHaze;', 'uniform vec3 uHaze;\nuniform vec3 uSilCol;\nuniform vec3 uSilRange;')
    .replace('* uHaze.z);', '* uHaze.z);\n gl_FragColor.rgb = mix(gl_FragColor.rgb, uSilCol, smoothstep(uSilRange.x, uSilRange.y, vFogDepth) * uSilRange.z);');
}

/** 体の 材料（hazePatch が かかった もの）に シルエットを 足す。足した 材料の 数を 返す（もう 足した 材料は 数えない） */
export function applySilhouette(root: Object3D): number {
  let n = 0;
  const seen = new Set<Material>();
  root.traverse((o) => {
    const raw = (o as { material?: Material | Material[] }).material;
    if (!raw) return;
    for (const mat of Array.isArray(raw) ? raw : [raw]) {
      const m = mat as MeshBasicMaterial;
      if (seen.has(m) || typeof m.onBeforeCompile !== 'function') continue;
      seen.add(m);
      const probe = { uniforms: {} as Record<string, unknown>, fragmentShader: 'uniform vec3 uHaze;\n#ifdef USE_FOG\n#include <fog_pars_fragment>\n#endif\nvoid main(){\n#include <fog_fragment>\n}' };
      const orig = m.onBeforeCompile;
      (orig as unknown as (s: typeof probe, r: unknown) => void).call(m, probe, null);
      if (!probe.fragmentShader.includes('uHaze.z);') || (m.userData as { silhouette?: boolean }).silhouette) continue; // 体の 材料だけ（目・光輪などは そのまま）
      (m.userData as { silhouette?: boolean }).silhouette = true;
      m.onBeforeCompile = (sh, r) => {
        (orig as unknown as (s: typeof sh, r: unknown) => void).call(m, sh, r);
        sh.uniforms.uSilCol = silCol;
        sh.uniforms.uSilRange = silRange;
        sh.fragmentShader = silhouetteShader(sh.fragmentShader);
      };
      m.needsUpdate = true;
      n++;
    }
  });
  return n;
}

/** 調整表の 値を uniform に 入れる（毎コマ 呼んで よい）。霞みは 調整表の hazeMax に する（release 側 だけ） */
export function updateSilhouette(): void {
  const S = RELEASE.silhouette;
  silCol.value.set(((S.color >> 16) & 255) / 255, ((S.color >> 8) & 255) / 255, (S.color & 255) / 255);
  silRange.value.set(S.nearBlocks, S.farBlocks, S.on ? S.strength : 0);
  if (S.on) BIG.look.hazeMax = S.hazeMax;
}
