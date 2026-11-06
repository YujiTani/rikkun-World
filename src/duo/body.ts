/**
 * COOP-1 §3: 2P の 体。1P と 同じ 見た目（キャラの 板）＋ 頭の 上の 2P の 色の ▼。
 * 参加したとき だけ 世界に 入れ、やめたら 取りだす（1 人のときの 描画の 数を 変えない。AC14）。
 */
import * as THREE from 'three';
import { createCharSprite, type CharKind, type CharSprite } from '../char';
import type { Lighting } from '../sky/lighting';
import type { PlayerState } from '../contracts';
import { DUO_COLORS, DUO_TUNING } from './tuning';

/** ▼ の 大きさ（マス）と ゆらぎ */
const MARK = { radius: 0.17, height: 0.3, bobTiles: 0.05, bobSteps: 90 } as const;
/** キャラの 板が 使えない（?char=block）ときの 箱の 体（マス） */
const BOX = { w: 0.6, h: 1.7, d: 0.4 } as const;

export interface DuoBodyDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  lighting: Lighting;
  /** 板の キャラ。null = 箱の 体 */
  kind: CharKind | null;
  basePath: (kind: CharKind) => string;
  initTexture?: (t: THREE.Texture) => void;
}

export class DuoBody {
  readonly group = new THREE.Group();
  private readonly mark: THREE.Mesh;
  private sprite: CharSprite | null = null;
  private inScene = false;
  private stepCount = 0;

  constructor(private readonly d: DuoBodyDeps) {
    this.group.name = 'duoBody';
    const mark = new THREE.Mesh(
      new THREE.ConeGeometry(MARK.radius, MARK.height, 4),
      new THREE.MeshBasicMaterial({ color: DUO_COLORS.p2 }),
    );
    mark.rotation.x = Math.PI; // 先を 下に（▼）
    mark.userData.noDim = true; // 夜でも 色を 暗くしない
    mark.name = 'duoMark';
    this.mark = mark;
    this.group.add(mark);
    if (d.kind === null) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(BOX.w, BOX.h, BOX.d), new THREE.MeshBasicMaterial({ color: 0xcfd8ff }));
      box.position.y = BOX.h / 2;
      this.group.add(box);
    }
  }

  get visible(): boolean {
    return this.inScene;
  }

  /** 世界に 入れる（はじめてなら キャラの 板も ここで 作る） */
  show(): void {
    if (this.inScene) return;
    if (!this.sprite && this.d.kind !== null) {
      this.sprite = createCharSprite({
        parent: this.group,
        camera: this.d.camera,
        lighting: this.d.lighting,
        kind: this.d.kind,
        basePath: this.d.basePath(this.d.kind),
        initTexture: this.d.initTexture,
      });
    }
    this.d.scene.add(this.group);
    this.inScene = true;
  }

  /** 世界から 取りだす（板の 絵は 持ったまま。次の 参加で すぐ 出せる） */
  hide(): void {
    if (!this.inScene) return;
    this.d.scene.remove(this.group);
    this.inScene = false;
  }

  /** 1 ステップ: 足もとの 位置・歩きの コマ・▼ */
  step(s: PlayerState): void {
    if (!this.inScene) return;
    this.stepCount++;
    this.group.position.set(s.position.x, s.position.y, s.position.z);
    this.group.updateMatrixWorld(true);
    const bob = Math.sin((this.stepCount / MARK.bobSteps) * Math.PI * 2) * MARK.bobTiles;
    this.mark.position.y = DUO_TUNING.markHeightTiles + bob;
    this.sprite?.step({
      position: s.position,
      velocity: s.velocity,
      onGround: s.onGround,
      inWater: s.inWater,
      running: s.running,
      facingDeg: s.facingDeg,
      weapon: 'none',
      blade: null,
      bow: null,
    });
    this.sprite?.render();
  }

  dispose(): void {
    this.hide();
    this.sprite?.dispose();
    this.sprite = null;
    this.mark.geometry.dispose();
    (this.mark.material as THREE.Material).dispose();
  }
}
