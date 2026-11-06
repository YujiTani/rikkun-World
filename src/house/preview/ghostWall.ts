// HOUSE-1B 見本の かべ 1 まい（AC59）。② なかの 見本で カメラがわ（手前）に なると、引っこまずに 白っぽい 半透明に なる（yuzu 2026-10-30 22:11）。
// かべの 形・高さは ずっと 同じ（回しても 見おろす 角度を かえても 出たり 引っこんだり しない）。かわるのは「白へ まぜる 量」と「透け方」だけ。
// 窓・戸は かべと 同じ メッシュ なので 同じ 透け方。材料は かべごとに 1 つ（ほかの 面と 同じ 絵の 板。穴〔窓・戸〕は alphaTest で 抜ける）。
// 描画回数は かべ 1 まい 1 回の まま（① 6 回・② 5 回）。数は tuning.ts の WALL_GHOST に 1 か所。
import { Mesh, MeshBasicMaterial, type DataTexture } from 'three';
import { WALLS, type Wall } from '../editor/tuning';
import type { PreviewMode } from './mesh';
import { WALL_GHOST } from './tuning';
import { OUTWARD } from './view';

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** かべの 白っぽさ 0〜1（0 ＝ ふつうの かべ、1 ＝ 白っぽい 半透明）。dot ＝ かべの 外向きと カメラの 向きの 内積。from 以下で 0、to 以上で 1、あいだは なめらか */
export function ghostLevel(dot: number): number {
  const k = Math.min(1, Math.max(0, (dot - WALL_GHOST.from) / (WALL_GHOST.to - WALL_GHOST.from)));
  return k * k * (3 - 2 * k);
}

/** 白っぽさ k から、白へ まぜる 量（0 ＝ そのまま、WALL_GHOST.white ＝ いちばん 白い） */
export function ghostWhite(k: number): number {
  return k * WALL_GHOST.white;
}

/** 白っぽさ k から、不透明さ（1 ＝ 透けない、WALL_GHOST.alpha ＝ いちばん 透ける） */
export function ghostAlpha(k: number): number {
  return 1 - k * (1 - WALL_GHOST.alpha);
}

/**
 * かべ 4 まいの 白っぽさ（yawDeg ＝ 見る 向き）。見おろす 角度には よらない。① そとの 見本は いつも 0（不透明）。
 * out ＝ 毎コマ 新しく 作らない ための 置き場（なければ 新しく 作る）
 */
export function wallGhostLevels(yawDeg: number, mode: PreviewMode, out: Record<Wall, number> = { front: 0, right: 0, back: 0, left: 0 }): Record<Wall, number> {
  const y = rad(yawDeg);
  const sx = Math.sin(y);
  const sz = Math.cos(y);
  for (const w of WALLS) out[w] = mode === 'outside' ? 0 : ghostLevel(sx * OUTWARD[w][0] + sz * OUTWARD[w][1]);
  return out;
}

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

  /** いまの 白へ まぜる 量と 不透明さ（テスト・確かめ用） */
  get look(): { white: number; alpha: number } {
    return { white: this.white.value, alpha: this.alpha.value };
  }

  /** k ＝ 白っぽさ 0〜1。半透明の かべは ほかの 物の あとに 描く（うしろが 見える ように）。高さ・位置は さわらない */
  set(k: number): void {
    this.white.value = ghostWhite(k);
    this.alpha.value = ghostAlpha(k);
    const ghost = k > 0.001;
    this.material.depthWrite = !ghost;
    this.mesh.renderOrder = ghost ? 1 : 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
