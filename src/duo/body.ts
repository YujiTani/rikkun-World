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
/** 色案 B で 今の 1.5 倍（0.17 → 0.255・0.3 → 0.45）。COOP-1 §11.1 */
const MARK = { radius: 0.255, height: 0.45, bobTiles: 0.05, bobSteps: 90 } as const;
/** キャラの 板が 使えない（?char=block）ときの 箱の 体（マス） */
const BOX = { w: 0.6, h: 1.7, d: 0.4 } as const;

export interface DuoBodyDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  lighting: Lighting;
  /** 板の キャラ（参加のたびに 読む）。null = 箱の 体 */
  kind: () => CharKind | null;
  basePath: (kind: CharKind) => string;
  initTexture?: (t: THREE.Texture) => void;
}

export class DuoBody {
  readonly group = new THREE.Group();
  private mark: THREE.Mesh | null = null;
  private box: THREE.Mesh | null = null;
  private readonly input = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: false,
    inWater: false,
    running: false,
    facingDeg: 0,
    weapon: 'none' as const,
    blade: null,
    bow: null,
  };
  private kindNow: CharKind | null = null;
  private sprite: CharSprite | null = null;
  private inScene = false;
  private stepCount = 0;

  constructor(private readonly d: DuoBodyDeps) {
    this.group.name = 'duoBody';
  }

  get visible(): boolean {
    return this.inScene;
  }

  /** 世界に 入れる（はじめてなら キャラの 板も ここで 作る） */
  show(): void {
    if (this.inScene) return;
    const kind = this.d.kind();
    this.build(kind);
    this.d.scene.add(this.group);
    this.inScene = true;
  }

  /** ▼ と（板が 使えない とき）箱は ここで 作る。板は キャラが かわっていたら かえる */
  private build(kind: CharKind | null): void {
    if (!this.mark) {
      const mark = new THREE.Mesh(
        new THREE.ConeGeometry(MARK.radius, MARK.height, 4),
        new THREE.MeshBasicMaterial({ color: DUO_COLORS.p2 }),
      );
      mark.rotation.x = Math.PI; // 先を 下に（▼）
      mark.userData.noDim = true; // 夜でも 色を 暗くしない
      mark.name = 'duoMark';
      this.mark = mark;
      this.group.add(mark);
    }
    if (kind === null && !this.box) {
      this.box = new THREE.Mesh(new THREE.BoxGeometry(BOX.w, BOX.h, BOX.d), new THREE.MeshBasicMaterial({ color: 0xcfd8ff }));
      this.box.position.y = BOX.h / 2;
      this.group.add(this.box);
    }
    if (this.box) this.box.visible = kind === null;
    if (kind !== null) {
      if (!this.sprite) {
        this.sprite = createCharSprite({
          parent: this.group,
          camera: this.d.camera,
          lighting: this.d.lighting,
          kind,
          basePath: this.d.basePath(kind),
          initTexture: this.d.initTexture,
        });
      } else if (this.kindNow !== kind) this.sprite.setChar(kind, this.d.basePath(kind));
    }
    this.kindNow = kind;
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
    if (this.mark) this.mark.position.y = DUO_TUNING.markHeightTiles + bob;
    if (!this.sprite || this.kindNow === null) return;
    const i = this.input;
    Object.assign(i.position, s.position);
    Object.assign(i.velocity, s.velocity);
    i.onGround = s.onGround;
    i.inWater = s.inWater;
    i.running = s.running;
    i.facingDeg = s.facingDeg;
    this.sprite.step(i);
    this.sprite.render();
  }

  dispose(): void {
    this.hide();
    this.sprite?.dispose();
    this.sprite = null;
    this.mark?.geometry.dispose();
    (this.mark?.material as THREE.Material | undefined)?.dispose();
  }
}
