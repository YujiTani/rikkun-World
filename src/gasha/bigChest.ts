/**
 * #293 リリース: がしゃどくろを たおした ごほうびの 大きな 宝箱。
 *  ・ChestLogic: せり上がる → とじた まま → 近づくと ふたが ひらいて 中身が 1 回だけ とびだす（時間の 流れだけ。three に 頼らない）。
 *  ・createChestMesh: 箱と ふたの 2 つの 箱の かたまり（頂点色。描画 2 回）。原点は 底の まんなか、前は +z、ふたの ちょうつがいは うしろ。
 * 大きさ・時間・近さは releaseTuning.ts の chest。
 * 宝箱は まだ ゲームに 無かった ので、ここで 最小限 作った（ほかの 宝箱が できたら そちらに 寄せる）。
 */
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RELEASE } from './releaseTuning';

export type ChestTune = (typeof RELEASE)['chest'];
export type ChestPhase = 'rising' | 'closed' | 'opening' | 'open';

const easeOut = (u: number): number => 1 - (1 - u) * (1 - u);

export class ChestLogic {
  phase: ChestPhase = 'rising';
  /** いまの 局面に なってから の 秒 */
  t = 0;
  /** せり上がり 0〜1 */
  rise = 0;
  /** ふたの 角度（度） */
  lidDeg = 0;
  private dropped = false;

  constructor(private readonly tune: ChestTune = RELEASE.chest) {}

  /** dt 秒 すすめる。near = プレイヤーが 近い か。中身が とびだす 瞬間だけ dropNow = true */
  step(dt: number, near: boolean): { dropNow: boolean } {
    const C = this.tune;
    this.t += dt;
    let dropNow = false;
    if (this.phase === 'rising') {
      this.rise = Math.min(1, C.riseSec > 0 ? this.t / C.riseSec : 1);
      if (this.rise >= 1) { this.phase = 'closed'; this.t = 0; }
    } else if (this.phase === 'closed') {
      if (near) { this.phase = 'opening'; this.t = 0; }
    }
    if (this.phase === 'opening') {
      const u = Math.min(1, C.openSec > 0 ? this.t / C.openSec : 1);
      this.lidDeg = easeOut(u) * C.openAngleDeg;
      if (!this.dropped && this.t >= C.dropDelaySec) { this.dropped = true; dropNow = true; }
      if (u >= 1) { this.phase = 'open'; this.t = 0; this.lidDeg = C.openAngleDeg; }
    }
    return { dropNow };
  }

  /** ひらいた 後の 時間（光の 演出用）。ひらいていない 間は 0 */
  get glow01(): number {
    const C = this.tune;
    if (this.phase === 'opening') return 1;
    if (this.phase === 'open') return Math.max(0, 1 - this.t / Math.max(0.01, C.glowSec));
    return 0;
  }
}

/** 近い か（よこの 距離 openRadius いない、上下 openHeight いない） */
export function chestNear(player: { x: number; y: number; z: number }, chest: { x: number; y: number; z: number }, tune: ChestTune = RELEASE.chest): boolean {
  return Math.hypot(player.x - chest.x, player.z - chest.z) <= tune.openRadius && Math.abs(player.y - chest.y) <= tune.openHeight;
}

// ---------------------------------------------------------------- 形
const WOOD = 0x8a5a2b, WOOD_DK = 0x6b4220, GOLD = 0xf2c230, GOLD_DK = 0xc99a1a, INK = 0x2a1e1a;
const LIGHT = new Vector3(-0.35, 0.8, 0.5).normalize();
const shade = (nx: number, ny: number, nz: number): number => Math.min(1, 0.56 + 0.44 * Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z) * 1.15);

/** 色つきの 箱（面の 向きで 明るさを かえる）。中心 (cx, cy, cz)、大きさ (w, h, d) */
function colorBox(w: number, h: number, d: number, cx: number, cy: number, cz: number, color: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d).toNonIndexed();
  g.translate(cx, cy, cz);
  const n = g.getAttribute('normal'), cols: number[] = [];
  const r = ((color >> 16) & 255) / 255, gr = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
  for (let i = 0; i < n.count; i++) {
    const s = shade(n.getX(i), n.getY(i), n.getZ(i));
    cols.push(r * s, gr * s, b * s);
  }
  g.setAttribute('color', new Float32BufferAttribute(cols, 3));
  return g;
}

export interface ChestMesh {
  group: Group;
  /** rise = せり上がり 0〜1、lidDeg = ふたの 角度（度） */
  setPose(rise: number, lidDeg: number): void;
  dispose(): void;
}

export function createChestMesh(tune: ChestTune = RELEASE.chest): ChestMesh {
  const { width: W, depth: D, bodyHeight: BH, lidHeight: LH } = tune;
  const band = 0.34, trim = 0.05;
  // 箱: 木の 本体、金の 帯 2 本、金の ふち、前の 錠前
  const body = mergeGeometries([
    colorBox(W, BH, D, 0, BH / 2, 0, WOOD),
    colorBox(W + 2 * trim, 0.22, D + 2 * trim, 0, 0.11, 0, GOLD_DK),
    colorBox(band, BH, D + 2 * trim, -W * 0.3, BH / 2, 0, GOLD),
    colorBox(band, BH, D + 2 * trim, W * 0.3, BH / 2, 0, GOLD),
    colorBox(W + 2 * trim, 0.14, D + 2 * trim, 0, BH - 0.07, 0, GOLD_DK),
    colorBox(0.62, 0.7, 0.14, 0, BH - 0.2, D / 2 + 0.07, GOLD),
    colorBox(0.14, 0.26, 0.16, 0, BH - 0.28, D / 2 + 0.14, INK),
  ])!;
  // ふた: ちょうつがい（うしろの 上）を 原点に、前へ のびる。下の 平らな 箱 + 上の せまい 箱 で まるみを 出す
  const lid = mergeGeometries([
    colorBox(W + 0.1, LH * 0.55, D + 0.1, 0, LH * 0.275, D / 2 + 0.05, WOOD_DK),
    colorBox(W - 0.5, LH * 0.45, D - 0.4, 0, LH * 0.55 + LH * 0.225, D / 2 + 0.05, WOOD),
    colorBox(band, LH * 0.55 + 0.04, D + 0.16, -W * 0.3, LH * 0.275, D / 2 + 0.05, GOLD),
    colorBox(band, LH * 0.55 + 0.04, D + 0.16, W * 0.3, LH * 0.275, D / 2 + 0.05, GOLD),
    colorBox(W + 0.16, 0.12, 0.14, 0, LH * 0.5, D + 0.1, GOLD_DK),
  ])!;
  const mat = new MeshBasicMaterial({ vertexColors: true });
  const group = new Group();
  const rig = new Group();
  const bodyMesh = new Mesh(body, mat);
  const lidMesh = new Mesh(lid, mat);
  const pivot = new Group();
  pivot.position.set(0, BH, -D / 2 - 0.05);
  pivot.add(lidMesh);
  rig.add(bodyMesh, pivot);
  group.add(rig);
  const total = BH + LH;
  return {
    group,
    setPose(rise, lidDeg) {
      const r = Math.max(0, Math.min(1, rise));
      rig.position.y = -(1 - r) * total;
      pivot.rotation.x = (-lidDeg * Math.PI) / 180;
    },
    dispose() {
      body.dispose(); lid.dispose(); mat.dispose();
    },
  };
}
