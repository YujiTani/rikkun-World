// 上空の 視点の 絵（HOUSE-1C PR-2 #340。仕様 §3.4）: 真上から 見る カメラ・置ける 場所の 緑・わく。みずもりの 高い・低いの 色も ここ。
// three を 使う 係（ルールは src/house/build/*.ts の ほかの 係と おなじ: ゲームの 数は tuning.ts）。毎フレーム 新しい 物は 作らない。
import * as THREE from 'three';
import { LEVEL, SKY } from './tuning';
import type { LevelCell } from './level';

/** 置ける 場所の 緑の タイルの 上限（外の 箱の 面積の 合計。これ以上は 描かない） */
const TILE_MAX = 6000;
/** タイルを 地面より 少し 上に（ブロック。ちらつき よけ） */
const LIFT = 0.03;
/** 色（置ける ＝ 緑、わく ＝ 明るい 緑〔置けない ときは 赤〕、ふち ＝ 白〔置けない ときは 赤〕）と 高い・低い */
const COLOR = { site: 0x5fdc6a, ok: 0x9dff8a, bad: 0xff7a6a, edge: 0xffffff, high: 0xe5483c, low: 0x3c8fe5 } as const;
/** 色の こさ */
const ALPHA = { site: 0.22, cursor: 0.3, level: 0.5 } as const;
/** わくの ふちの 太さ（ブロック） */
const EDGE = 0.16;

export interface SkyCursor {
  x: number;
  z: number;
  ok: boolean;
}

export class SkyScene {
  readonly group = new THREE.Group();
  private readonly tiles: THREE.InstancedMesh;
  private readonly fill: THREE.Mesh;
  private readonly fillMat = new THREE.MeshBasicMaterial({ color: COLOR.ok, transparent: true, opacity: ALPHA.cursor, depthWrite: false });
  private readonly edgeMat = new THREE.MeshBasicMaterial({ color: COLOR.edge });
  private readonly edges: THREE.Mesh[] = [];
  private readonly levelTiles: THREE.InstancedMesh;
  private shownSites: unknown = null;
  private levelCount = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly v = new THREE.Vector3();
  private readonly savedPos = new THREE.Vector3();
  private readonly savedUp = new THREE.Vector3();
  private readonly savedQuat = new THREE.Quaternion();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const tileMat = new THREE.MeshBasicMaterial({ color: COLOR.site, transparent: true, opacity: ALPHA.site, depthWrite: false });
    this.tiles = new THREE.InstancedMesh(plane, tileMat, TILE_MAX);
    this.tiles.count = 0;
    this.tiles.frustumCulled = false;
    this.fill = new THREE.Mesh(plane, this.fillMat);
    this.fill.visible = false;
    const lm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: ALPHA.level, depthWrite: false, depthTest: false });
    this.levelTiles = new THREE.InstancedMesh(plane, lm, (LEVEL.half * 2 + 1) ** 2);
    this.levelTiles.count = 0;
    this.levelTiles.frustumCulled = false;
    this.levelTiles.renderOrder = 10;
    // 色は 1 つずつ（高い ＝ 赤、低い ＝ 青）。instanceColor を 先に 作る
    this.levelTiles.setColorAt(0, this.color.set(COLOR.high));
    const box = new THREE.BoxGeometry(1, 0.04, 1);
    for (let i = 0; i < 4; i++) {
      const e = new THREE.Mesh(box, this.edgeMat);
      e.visible = false;
      this.edges.push(e);
    }
    this.group.add(this.tiles, this.fill, ...this.edges, this.levelTiles);
    this.group.visible = false;
  }

  /** 上空の 視点の 間の 絵（置ける 場所〔sites 〔北西の すみ〕・外の 大きさ〕・わく）。sites が 前と 同じ 配列なら 作りなおさない */
  show(sites: readonly { x: number; y: number; z: number }[], outW: number, outD: number, cursor: SkyCursor | null): void {
    if (sites !== this.shownSites) {
      this.shownSites = sites;
      this.buildTiles(sites, outW, outD);
    }
    this.group.visible = true;
    if (!cursor) {
      this.fill.visible = false;
      for (const e of this.edges) e.visible = false;
      return;
    }
    const near = sites.find((s) => s.x === cursor.x && s.z === cursor.z);
    const fy = (near?.y ?? sites[0]?.y ?? 0) + 1 + LIFT * 2;
    this.fillMat.color.set(cursor.ok ? COLOR.ok : COLOR.bad);
    this.edgeMat.color.set(cursor.ok ? COLOR.edge : COLOR.bad);
    this.fill.visible = true;
    this.fill.scale.set(outW, 1, outD);
    this.fill.position.set(cursor.x + outW / 2, fy, cursor.z + outD / 2);
    const cx = cursor.x + outW / 2;
    const cz = cursor.z + outD / 2;
    this.edge(0, outW + EDGE, EDGE, cx, fy + LIFT, cursor.z);
    this.edge(1, outW + EDGE, EDGE, cx, fy + LIFT, cursor.z + outD);
    this.edge(2, EDGE, outD + EDGE, cursor.x, fy + LIFT, cz);
    this.edge(3, EDGE, outD + EDGE, cursor.x + outW, fy + LIFT, cz);
  }

  /** 上空の 視点を おわる（絵を かくす） */
  hide(): void {
    this.shownSites = null;
    this.tiles.count = 0;
    this.fill.visible = false;
    for (const e of this.edges) e.visible = false;
    this.group.visible = this.levelCount > 0;
  }

  /** みずもりの 色（base の 高さの 面に 赤＝高い・青＝低い。同じ なら 出さない）。空なら かくす */
  showLevel(cells: readonly LevelCell[], baseY: number): void {
    let n = 0;
    for (const c of cells) {
      if (c.state === 'ok') continue;
      this.dummy.position.set(c.x + 0.5, baseY + 1 + LIFT * 3, c.z + 0.5);
      this.dummy.updateMatrix();
      this.levelTiles.setMatrixAt(n, this.dummy.matrix);
      this.levelTiles.setColorAt(n, this.color.set(c.state === 'high' ? COLOR.high : COLOR.low));
      n++;
    }
    this.levelCount = n;
    this.levelTiles.count = n;
    this.levelTiles.instanceMatrix.needsUpdate = true;
    if (this.levelTiles.instanceColor) this.levelTiles.instanceColor.needsUpdate = true;
    this.group.visible = n > 0 || this.fill.visible;
  }

  private edge(i: number, w: number, d: number, x: number, y: number, z: number): void {
    const e = this.edges[i]!;
    e.visible = true;
    e.scale.set(w, 1, d);
    e.position.set(x, y, z);
  }

  private buildTiles(sites: readonly { x: number; y: number; z: number }[], outW: number, outD: number): void {
    // 置ける 場所の 外の 箱の 面積の ぜんぶ（かさなりは 1 回）。座標 → 1 つ
    const seen = new Set<number>();
    let n = 0;
    for (const s of sites) {
      for (let dz = 0; dz < outD; dz++) {
        for (let dx = 0; dx < outW; dx++) {
          const key = (s.x + dx) * 100003 + (s.z + dz);
          if (seen.has(key) || n >= TILE_MAX) continue;
          seen.add(key);
          this.dummy.position.set(s.x + dx + 0.5, s.y + 1 + LIFT, s.z + dz + 0.5);
          this.dummy.updateMatrix();
          this.tiles.setMatrixAt(n++, this.dummy.matrix);
        }
      }
    }
    this.tiles.count = n;
    this.tiles.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ カメラ

  /** カメラを 真上の 視点へ（プレイヤーの 上）。north（−z）が 画面の 上 */
  enter(px: number, py: number, pz: number): void {
    const c = this.camera;
    this.savedPos.copy(c.position);
    this.savedUp.copy(c.up);
    this.savedQuat.copy(c.quaternion);
    c.position.set(px, py + SKY.height, pz);
    c.up.set(0, 0, -1);
    c.lookAt(px, py, pz);
    c.updateMatrixWorld(true);
  }

  /** カメラを もとへ */
  leave(): void {
    const c = this.camera;
    c.position.copy(this.savedPos);
    c.up.copy(this.savedUp);
    c.quaternion.copy(this.savedQuat);
    c.updateMatrixWorld(true);
  }

  /** 世界の 点 (x, y, z) が 画面の どこか（CSS px）。上空の カメラで 数える（enter・leave で はさむ 呼ぶ 側） */
  project(x: number, y: number, z: number, out: { x: number; y: number }): { x: number; y: number } {
    this.v.set(x, y, z).project(this.camera);
    out.x = (this.v.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
    return out;
  }

  /** 画面の 位置(CSS px)の 下の 高さ y の 地面の 点（上空の カメラ。enter・leave で はさむ） */
  ground(cx: number, cy: number, y: number, out: { x: number; z: number }): { x: number; z: number } {
    this.v.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1, 0.5).unproject(this.camera);
    const p = this.camera.position;
    const t = (y - p.y) / (this.v.y - p.y);
    out.x = p.x + (this.v.x - p.x) * t;
    out.z = p.z + (this.v.z - p.z) * t;
    return out;
  }

  dispose(): void {
    this.tiles.geometry.dispose();
    this.group.removeFromParent();
  }
}
