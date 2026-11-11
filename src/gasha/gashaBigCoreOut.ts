/**
 * FIX-3: とどめの あと、倒れおわったら 大きな コアが 体の 外へ 出て、がしゃどくろの 近くの 地面の 上に 置かれる。
 * 地面に 立った まま 刀で たたける（当たりの 箱を ワールドの 位置に 置く。名前 outCore）。赤く 光り、脈うつ。
 *  ・coreSpot: 置く 場所の 計算（純粋）。体の 中心から プレイヤーの 方へ outBlocks。プレイヤーが それより 近ければ プレイヤーの 足もと。高さは その 点の 地面の 上に 乗る 高さ。
 *  ・CoreOut: 見た目（八面体 2 つ = しん ＋ 光）と 当たりの 箱。
 */
import { Color, Group, Mesh, MeshBasicMaterial, OctahedronGeometry, type Scene } from 'three';
import { TUNE as T } from './gashaBigTuning';
import type { BoxLike } from './gashaBigHit';

/** ブロックの 高さ(いちばん 上の ブロックの y)から、その 上の 面までの 足し(ブロック。1 マス) */
const SURFACE_ABOVE_TOP = 1;
/** 体の 中の コアと 同じ 色づかい(しん, まわりの 光)。赤く なる 前の 色 */
const BASE_COLORS = [0xcffaff, 0x8aeaff] as const;
/** 光の まわりの 大きさ(しんに 対する 倍) と 透明さ */
const GLOW = { scale: 1.45, alpha: 0.3 } as const;
/** 脈うつ ときの ふくらみ(割合) */
const PULSE_SCALE = 0.08;

/** 置き場所の 数（調整表 finish.core の 一部） */
export interface CoreSpotTune { outBlocks: number; size: number; stepBlocks: number; maxOutBlocks: number }

/**
 * 外へ 出た コアの 中心。boss = 体の 中心の 水平の 位置、yaw = 体の 向き（ラジアン。前 = (sin, cos)。プレイヤーが 真上で 方向が とれない とき だけ 使う）、
 * groundTop(x, z) = その 列の いちばん 上の ブロックの 高さ、overlaps(x, y, z) = その 中心に コアを 置くと 体の 箱と かさなるか。
 * 体の 中心から プレイヤーの 方向へ outBlocks から はじめ、かさなる あいだ stepBlocks ずつ 外へ ずらす（maxOutBlocks まで。見つからなければ 最後の 場所）。
 */
export function coreSpot(boss: { x: number; z: number }, yaw: number, player: { x: number; z: number }, groundTop: (x: number, z: number) => number, overlaps: (x: number, y: number, z: number) => boolean, K: CoreSpotTune): { x: number; y: number; z: number } {
  const dx = player.x - boss.x, dz = player.z - boss.z, d = Math.hypot(dx, dz);
  const ux = d > 1e-3 ? dx / d : Math.sin(yaw), uz = d > 1e-3 ? dz / d : Math.cos(yaw);
  const at = (r: number): { x: number; y: number; z: number } => {
    const x = boss.x + ux * r, z = boss.z + uz * r;
    return { x, y: groundTop(x, z) + SURFACE_ABOVE_TOP + K.size / 2, z };
  };
  let r = K.outBlocks, p = at(r);
  while (overlaps(p.x, p.y, p.z) && r + K.stepBlocks <= K.maxOutBlocks) { r += K.stepBlocks; p = at(r); }
  return p;
}

export class CoreOut {
  private readonly group = new Group();
  private readonly mats: MeshBasicMaterial[] = [];
  private readonly baseColors = BASE_COLORS.map((c) => new Color(c));
  private readonly redColors = T.finish.core.redColor.map((c) => new Color(c));
  private readonly hitBox: { name: string; c: number[]; ax: number[]; half: number[] } = { name: 'outCore', c: [0, 0, 0], ax: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: [0, 0, 0] };
  private size = 0;
  center = { x: 0, y: 0, z: 0 };

  constructor(private readonly scene: Scene) {
    for (const [i, a] of ([1, GLOW.alpha] as const).entries()) {
      const m = new MeshBasicMaterial({ color: BASE_COLORS[i], fog: false, transparent: a < 1, opacity: a, depthWrite: a >= 1 });
      m.userData.noDim = true;
      const mesh = new Mesh(new OctahedronGeometry(0.5 * (i === 0 ? 1 : GLOW.scale)), m);
      mesh.frustumCulled = false; mesh.renderOrder = i === 0 ? 0 : 3;
      this.group.add(mesh);
      this.mats.push(m);
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  /** 置く（中心 c。一辺 size）。当たりの 箱も ここに 合わせる */
  place(c: { x: number; y: number; z: number }, size: number): void {
    this.center = { ...c };
    this.size = size;
    this.group.position.set(c.x, c.y, c.z);
    this.group.scale.setScalar(size);
    this.group.visible = true;
    this.hitBox.c[0] = c.x; this.hitBox.c[1] = c.y; this.hitBox.c[2] = c.z;
    this.hitBox.half[0] = this.hitBox.half[1] = this.hitBox.half[2] = size / 2;
  }

  /** 当たりの 箱（BigHit.setExtra に わたす）。置く 前は null */
  box(): BoxLike | null {
    return this.group.visible ? this.hitBox : null;
  }

  /** 赤さ k(0〜1) と 脈の 明るさ pulse(0〜1) */
  setRed(k: number, pulse: number): void {
    const kk = Math.min(1, Math.max(0, k));
    this.mats.forEach((m, i) => {
      m.color.copy(this.baseColors[i]!).lerp(this.redColors[i] ?? this.redColors[0]!, kk);
      if (kk > 0) m.color.multiplyScalar(1 + 0.5 * pulse); // ゆらゆら 明るく なる（体の 中の コアと 同じ）
    });
    this.group.scale.setScalar(this.size * (1 + PULSE_SCALE * (pulse - 0.5) * 2 * kk));
  }

  visible(): boolean { return this.group.visible; }

  /** かくす（片づけ・こわれた とき） */
  clear(): void { this.group.visible = false; }

  dispose(): void {
    this.scene.remove(this.group);
    for (const c of this.group.children) (c as Mesh).geometry.dispose();
    for (const m of this.mats) m.dispose();
  }
}
