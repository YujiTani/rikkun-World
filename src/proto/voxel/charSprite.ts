import { CanvasTexture, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, SRGBColorSpace, type Scene } from 'three';

/**
 * 新しいキャラ（ピンクのパーカー）の 8 方向ドット絵を、板（スプライト）で立てる。
 * コマ表 public/proto/char_atlas.png = 1152×1024、128×128 のコマ。横 9 列（列 0 = 立ち、1〜8 = 歩く）× 縦 8 行（行 = 向き）。
 *
 * 行と向き（スクショで確かめた。「見ている人から見て、キャラがどちらを向いているか」）:
 *   行 0 = 正面（こちらを向く） / 行 1 = 正面から右へ 45 度 / 行 2 = 右向きの横 / 行 3 = 右むきの うしろ 45 度
 *   行 4 = うしろ向き / 行 5 = 左むきの うしろ 45 度 / 行 6 = 左向きの横 / 行 7 = 正面から左へ 45 度
 * キャラが +z を向いているとき、カメラが -x 側（キャラの右手側）へまわるほど 行が 0→1→2… と進み、+x 側（左手側）が 行 6。
 */
export const ATLAS_COLS = 9;
export const ATLAS_ROWS = 8;
export const CELL = 128;
export const CHAR_HEIGHT_BLOCKS = 1.8;

/**
 * キャラの向き (fx, fz) と、キャラからカメラへの水平の向き (dx, dz) から、コマ表の行（0〜7）を選ぶ。
 * 角度 a = 正面から数えた カメラの位置（atan2(fx*dz - fz*dx, f・d)）。a = 0 → 行 0、+45 度ごとに +1、-90 度（キャラの左手側にカメラ）→ 行 6。
 */
export function charRow(fx: number, fz: number, dx: number, dz: number): number {
  const a = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
  const k = Math.round(a / (Math.PI / 4));
  return ((k % 8) + 8) % 8;
}

export class CharSprite {
  private readonly mesh: Mesh;
  private readonly tex: CanvasTexture;
  private readonly facing: { x: number; z: number };
  private row = -1;

  /** (x, y, z) = 足もと。facing = キャラが向いている水平の向き */
  constructor(scene: Scene, x: number, y: number, z: number, facing: { x: number; z: number }) {
    this.facing = facing;
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_COLS * CELL;
    canvas.height = ATLAS_ROWS * CELL;
    this.tex = new CanvasTexture(canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.magFilter = NearestFilter;
    this.tex.minFilter = NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.repeat.set(1 / ATLAS_COLS, 1 / ATLAS_ROWS);
    // 板: コマの中の絵（足から頭まで）が ちょうど 1.8 ブロックになる大きさ（読みこみ後に合わせる）。はじめは コマ全体 = 2 ブロック
    const geo = new PlaneGeometry(1, 1);
    const mat = new MeshBasicMaterial({ map: this.tex, transparent: true, alphaTest: 0.5, depthWrite: true });
    this.mesh = new Mesh(geo, mat);
    this.mesh.position.set(x, y + 1, z);
    this.mesh.visible = false;
    scene.add(this.mesh);

    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      // 立ちのコマ（行 0・列 0）の 絵のある範囲（透明でない行）から、板の大きさと足の位置を決める
      const d = ctx.getImageData(0, 0, CELL, CELL).data;
      let top = CELL;
      let bottom = -1;
      for (let py = 0; py < CELL; py++) {
        for (let px = 0; px < CELL; px++) {
          if (d[(py * CELL + px) * 4 + 3] > 128) {
            top = Math.min(top, py);
            bottom = Math.max(bottom, py);
          }
        }
      }
      if (bottom < 0) {
        top = 0;
        bottom = CELL - 1;
      }
      const figure = bottom - top + 1; // ドット数
      const blocksPerDot = CHAR_HEIGHT_BLOCKS / figure;
      const size = CELL * blocksPerDot;
      this.mesh.scale.set(size, size, 1);
      // コマの下から (CELL - 1 - bottom) ドット あいているぶん、板を下げて 足が地面に つくようにする
      this.mesh.position.y = y + size / 2 - (CELL - 1 - bottom) * blocksPerDot;
      this.tex.needsUpdate = true;
      this.mesh.visible = true;
      this.row = -1;
    };
    img.src = '/proto/char_atlas.png';
  }

  /** カメラを向ける（横だけ回す）＋ 見ている向きの行を選ぶ */
  face(camX: number, camZ: number): void {
    const dx = camX - this.mesh.position.x;
    const dz = camZ - this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
    const row = charRow(this.facing.x, this.facing.z, dx, dz);
    if (row === this.row) return;
    this.row = row;
    this.tex.offset.set(0, 1 - (row + 1) / ATLAS_ROWS); // 列 0（立ち）
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v;
  }

  /** 絵を読みこみ終えて 立っているか */
  get ready(): boolean {
    return this.mesh.visible;
  }

  get currentRow(): number {
    return this.row;
  }

  get position(): { x: number; y: number; z: number } {
    return this.mesh.position;
  }
}
