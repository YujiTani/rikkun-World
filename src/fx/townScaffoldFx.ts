import * as THREE from 'three';
import { scaffoldBoxes, SCAFFOLD_BOX_TOTAL, type Corner } from '../town/townScaffold';
import type { ScaffoldRect, ScaffoldSet } from '../town/townScaffoldSet';
import { BoxBuf, type BoxTex } from './repairBoxes';
import { RepairAtlas } from './repairAtlas';

/**
 * TOWN-1 1.4 §2.16 の 9・設計 repair-final: 竹の 足場 ＋ 藍の のぼり。まとまりごとに 1 組、ぜんぶ 1 つの メッシュ・1 つの 材質（描画 +1）。
 * ブロックでは ない（ぶつからない・こわせない・チャンクを 作りなおさない）。一覧が かわった とき（朝・もどしきった とき）だけ 作りなおす。
 */
const TEX_NAMES: Record<string, string> = { town_take: 'take', town_wara: 'wara', town_nobori: 'nobori', rusu_board: 'board' };

function scaffoldAtlas(): RepairAtlas {
  return new RepairAtlas(64, 64, [
    { name: 'take', x: 0, y: 0, w: 16, h: 16, url: 'town_take.png', color: '#6FA04A' },
    { name: 'wara', x: 16, y: 0, w: 16, h: 16, url: 'town_wara.png', color: '#D8BE7A' },
    { name: 'nobori', x: 32, y: 0, w: 12, h: 36, url: 'town_nobori.png', color: '#2F4780' },
    { name: 'ai', x: 48, y: 0, w: 16, h: 16, color: '#2F4780' },
  ]);
}

/** 設計の 絵の 名前（`T:town_take`）→ はり方 */
export function texOf(spec: string, edge = 'ai'): BoxTex {
  const [kind, n] = spec.split(':') as [string, string];
  return { kind, name: TEX_NAMES[n] ?? n, edge };
}

export interface ScaffoldFxDeps {
  /** 列 (x, z) の 地面の 足もとの y（地面の 上面。立てる 高さ）。aroundY（こわれた マスの いちばん 下）の 近くで さがす。分からなければ null */
  groundAt(x: number, z: number, aroundY: number): number | null;
  /** こやの 位置（のぼりは こやに いちばん 近い かどに 立てる） */
  home(): { x: number; z: number };
}

export class TownScaffoldFx {
  readonly mesh: THREE.Mesh;
  private readonly atlas = scaffoldAtlas();
  /** 面の 明るさは 頂点の 色に ふくめて ある（BoxBuf）。材質は 1 つ */
  private readonly material = new THREE.MeshBasicMaterial({ vertexColors: true });
  private version = -1;
  /** いま 描いて いる 足場の 数・箱の 数・三角形（テスト窓口 用） */
  shown = 0;
  boxes = 0;
  triangles = 0;

  constructor(
    scene: THREE.Object3D,
    private readonly d: ScaffoldFxDeps,
  ) {
    this.material.map = this.atlas.texture;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  /** 夜に 暗くなる 材料（`Lighting.register(fx.material, 'doll')`） */
  get bodyMaterial(): THREE.Material {
    return this.material;
  }

  /** 毎フレーム: 一覧が かわって いたら 作りなおす */
  sync(set: ScaffoldSet): void {
    if (set.version === this.version) return;
    this.version = set.version;
    const list = set.list();
    this.mesh.geometry.dispose();
    this.shown = 0;
    this.boxes = 0;
    if (list.length === 0) {
      this.mesh.geometry = new THREE.BufferGeometry();
      this.mesh.visible = false;
      this.triangles = 0;
      return;
    }
    const buf = new BoxBuf(this.atlas);
    for (const r of list) {
      if (this.boxes >= SCAFFOLD_BOX_TOTAL) break; // 足場 ぜんぶで 6,000 こまで
      this.boxes += this.addOne(buf, r);
      this.shown++;
    }
    this.mesh.geometry = buf.build();
    this.triangles = buf.triangles();
    this.mesh.visible = true;
  }

  private addOne(buf: BoxBuf, r: ScaffoldRect): number {
    const x0 = r.min.x - 1;
    const z0 = r.min.z - 1;
    const w = r.max.x - r.min.x + 1;
    const dd = r.max.z - r.min.z + 1;
    // 足もと: わくの かど 4 つの 地面の いちばん ひくい 所
    const X1 = w + 2;
    const Z1 = dd + 2;
    let base = Infinity;
    for (const [cx, cz] of [[x0, z0], [x0 + X1 - 1, z0], [x0, z0 + Z1 - 1], [x0 + X1 - 1, z0 + Z1 - 1]] as const) {
      const g = this.d.groundAt(cx, cz, r.min.y);
      if (g !== null && g < base) base = g;
    }
    if (!Number.isFinite(base)) base = r.min.y;
    const h = r.max.y + 1 - base + 1;
    // のぼりは こやに いちばん 近い かど
    const home = this.d.home();
    const cornerX: 0 | 1 = Math.abs(x0 - home.x) <= Math.abs(x0 + X1 - home.x) ? 0 : 1;
    const cornerZ: 0 | 1 = Math.abs(z0 - home.z) <= Math.abs(z0 + Z1 - home.z) ? 0 : 1;
    const corner: Corner = { x: cornerX, z: cornerZ };
    const { boxes } = scaffoldBoxes(w, dd, h, corner);
    const o: [number, number, number] = [x0, base, z0];
    for (const b of boxes) {
      const tex = texOf(b.tex);
      if (b.kind === 'brace') {
        buf.brace(o, b.from!, b.to!, b.thick!, tex);
        continue;
      }
      const bx = b.box!;
      if (b.kind === 'post') {
        // 柱は 自分の 地面から 立てて、上の 高さを そろえる
        const g = this.d.groundAt(x0 + Math.floor(bx[0] / 16), z0 + Math.floor(bx[2] / 16), r.min.y) ?? base;
        buf.box(o, [bx[0], Math.max(0, (g - base) * 16), bx[2], bx[3], bx[4], bx[5]], tex);
      } else buf.box(o, bx, tex);
    }
    return boxes.length;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }
}
