// HOUSE-1B 試作: なかの 見本の かべ 1 まい。カメラがわ（手前）に なると、引っこまずに 白っぽい 半透明に なる（yuzu 2026-10-30 22:11）。
// かべの 形は ずっと 同じ（回しても 出たり 引っこんだり しない）。かわるのは「白へ まぜる 量」と「透け方」だけ。
// 材料は かべごとに 1 つ（ほかの 面と 同じ 絵の 板。穴（窓・戸）は alphaTest で 抜ける）。描画回数は かべ 1 まい 1 回の まま。
import { Mesh, MeshBasicMaterial, type DataTexture } from 'three';
import { WALL_GHOST } from './tuning';

export class GhostWall {
  readonly material: MeshBasicMaterial;
  readonly mesh: Mesh;
  /** シェーダーの 値（白へ まぜる 量・不透明さ）。かべごとに 別の 入れ物 */
  private readonly white = { value: 0 };
  private readonly alpha = { value: 1 };

  constructor(atlas: DataTexture) {
    // transparent は 常に true（false ⇄ true で シェーダーを 作りなおさない ため）。透けない（0）ときは 深さも 書く
    this.material = new MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, transparent: true });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uWhite = this.white;
      shader.uniforms.uAlpha = this.alpha;
      shader.fragmentShader = `uniform float uWhite;\nuniform float uAlpha;\n${shader.fragmentShader}`.replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\n\tgl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), uWhite);\n\tgl_FragColor.a *= uAlpha;',
      );
    };
    this.material.customProgramCacheKey = () => 'house-preview-ghost-wall';
    this.mesh = new Mesh(undefined, this.material);
    this.mesh.frustumCulled = false;
  }

  /** k ＝ 白っぽさ 0〜1（0 ＝ ふつうの かべ、1 ＝ 白っぽい 半透明）。半透明の かべは ほかの 物の あとに 描く（うしろが 見える ように） */
  set(k: number): void {
    this.white.value = k * WALL_GHOST.white;
    this.alpha.value = 1 - k * (1 - WALL_GHOST.alpha);
    const ghost = k > 0.001;
    this.material.depthWrite = !ghost;
    this.mesh.renderOrder = ghost ? 1 : 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
