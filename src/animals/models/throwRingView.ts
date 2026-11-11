import * as THREE from 'three';
import { RING_TEX, rasterRing, type RingState } from './throwRing';

/** 世界に 出す 着地点の 丸の 最大数（2 人とも だっこ中 のとき 2 つ。COOP-1 5c） */
const RING_MAX = 2;

/**
 * 着地点の 丸を 描く 係（`AnimalRenderer` から 分けた。1P・2P の 順に 最大 `RING_MAX` 個）。
 * 絵（ふつう・いえ の しるし）は 2 つ とも 共有。使わない 丸は 隠して 使いまわす
 */
export class ThrowRingView {
  private readonly meshes: THREE.Mesh[] = [];
  private tex: { plain: THREE.DataTexture; home: THREE.DataTexture } | null = null;
  private seen = false;
  /** この フレームに 描いた 丸の 数（描画 +1 ずつ・三角形 +2 ずつ） */
  used = 0;

  constructor(private readonly parent: THREE.Group) {}

  /** 目 から 丸 への 線 が 地形 に ふさがれて いない（さく の 板 ごし でも 見せる） */
  setSeen(seen: boolean): void {
    this.seen = seen;
  }

  /** 毎フレーム: `states`（`ringStates()` の 答え）の とおりに 丸を 置く */
  update(states: readonly RingState[]): void {
    this.used = 0;
    for (let i = 0; i < states.length && i < RING_MAX; i++) {
      const st = states[i]!;
      const mesh = this.meshes[i] ?? this.make(i);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      const t = this.textures();
      const map = st.home ? t.home : t.plain;
      if (mat.map !== map) {
        mat.map = map;
        mat.needsUpdate = true;
      }
      // 地形 に ふさがれて いない とき は 深さ を 見ず 最後 に 描く（さく の 板 ごし でも 見える）。描画 の 数 は ふえない
      mat.depthTest = !this.seen;
      mesh.renderOrder = this.seen ? 999 : 3;
      mesh.visible = true;
      mesh.scale.set(st.diameter, st.diameter, 1);
      mesh.position.set(st.x, st.y, st.z);
      this.used++;
    }
    for (let i = this.used; i < this.meshes.length; i++) this.meshes[i]!.visible = false;
  }

  private textures(): { plain: THREE.DataTexture; home: THREE.DataTexture } {
    if (this.tex) return this.tex;
    const mk = (home: boolean): THREE.DataTexture => {
      const t = new THREE.DataTexture(rasterRing(home), RING_TEX, RING_TEX, THREE.RGBAFormat);
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      return t;
    };
    this.tex = { plain: mk(false), home: mk(true) };
    return this.tex;
  }

  private make(i: number): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({ map: this.textures().plain, transparent: true, depthWrite: false, fog: false });
    mat.userData.noDim = true;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    this.parent.add(mesh);
    this.meshes[i] = mesh;
    return mesh;
  }

  dispose(): void {
    if (this.tex) {
      this.tex.plain.dispose();
      this.tex.home.dispose();
    }
    for (const m of this.meshes) {
      (m.material as THREE.Material).dispose();
      m.geometry.dispose();
    }
  }
}
