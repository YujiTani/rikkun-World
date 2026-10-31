import * as THREE from 'three';
import type { Vec3 } from '../contracts';
import { createRng } from '../world/gen/random';
import { CRAFT_UI_SETTINGS, type CraftUiSettings } from './craftConfig';
import { SmokePool, type FurnaceFxEntry } from './furnaceFxModel';

/**
 * おふろの 湯気（HOUSE-1D #341。仕様 docs/design/HOUSE-1.md §2.12「湯気だけ〔はげしい 演出なし〕」）。
 * かまどの けむり（SmokePool）と 同じ 小さな 白い つぶを、数も 動きも ずっと おだやかに。入って いる 間だけ 出る。
 * 描画は InstancedMesh 1 つ（つぶが 1 つでも 見えて いる 間だけ +1 回。なければ 0 回）。毎フレーム new しない。
 */

/** 湯気の 数（1 か所の 表） */
export const STEAM_TUNING = {
  /** 1 秒に 出す 数（こ） */
  perSecond: 3,
  /** ういて いる 時間（秒） */
  life: 1.8,
  /** 上がる 速さ（マス/秒。かまどの けむり 0.9 より ゆっくり） */
  rise: 0.35,
  /** いちどに 出せる 数（こ） */
  max: 10,
  /** お湯の 面から 出る 高さ（マス） */
  startAbove: 0.1,
  /** つぶの 色の うすさ（0〜1。かまどの けむり 0.6 より うすい） */
  opacity: 0.45,
} as const;

const CFG: CraftUiSettings = {
  ...CRAFT_UI_SETTINGS,
  smokePerSecond: STEAM_TUNING.perSecond,
  smokeLife: STEAM_TUNING.life,
  smokeRise: STEAM_TUNING.rise,
  smokeMax: STEAM_TUNING.max,
};

/** SmokePool は 「(x+0.5, y+1.05, z+0.5)」に 出す。お湯の 面の まん中から 出す ために ずらす 量 */
const POOL_OFFSET_Y = 1.05;

export class BathSteam {
  readonly pool = new SmokePool(createRng(7117), CFG);
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly entry: FurnaceFxEntry = { x: 0, y: 0, z: 0, burning: false, waiting: null };
  private readonly entries: readonly FurnaceFxEntry[] = [this.entry];
  /** いま 見えて いる つぶの 数（テスト用） */
  shown = 0;

  constructor(scene: THREE.Object3D) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: STEAM_TUNING.opacity, depthWrite: false }),
      STEAM_TUNING.max,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** 1 ステップ（dt は 秒）。spot ＝ お湯の 面の まん中（入って いなければ null。のこった つぶは そのまま きえる まで 上がる） */
  update(dt: number, spot: Vec3 | null): void {
    const e = this.entry;
    e.burning = spot !== null;
    if (spot) {
      e.x = spot.x - 0.5;
      e.y = spot.y + STEAM_TUNING.startAbove - POOL_OFFSET_Y;
      e.z = spot.z - 0.5;
    }
    this.pool.update(dt, this.entries);
    let n = 0;
    for (const p of this.pool.puffs) {
      if (!p.active) continue;
      const k = p.age / p.life;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.setScalar(p.size * (1 + k * 1.2));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n++, this.dummy.matrix);
    }
    this.shown = n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
