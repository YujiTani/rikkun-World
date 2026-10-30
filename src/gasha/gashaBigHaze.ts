/**
 * #308 gashaBig.ts を 分けた もの: 空気遠近法（遠い 部位ほど 空の 色に 霞む）。体・置いた ブロック・こけが 材料に 足す。
 */
import { Vector3, type MeshBasicMaterial } from 'three';
import { TUNE as T } from './gashaBigTuning';


/** 遠い 部位ほど 空の 色（scene.fog の 色）に 溶ける（空気遠近法）。強さは 調整表 look.haze*。uniform は 毎コマ updateHaze() で 入れる */
const hazeU = { value: new Vector3(35, 160, 0.6) };
export function updateHaze(): void { hazeU.value.set(T.look.hazeNear, T.look.hazeFar, T.look.hazeMax); }
export function hazePatch(m: MeshBasicMaterial): void {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHaze = hazeU;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nuniform vec3 uHaze;')
      .replace('#include <fog_fragment>', '#ifdef USE_FOG\n gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(uHaze.x, uHaze.y, vFogDepth) * uHaze.z);\n#endif');
  };
}
