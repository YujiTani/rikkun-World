import { Mesh, type Data3DTexture, type Group, type MeshBasicMaterial } from 'three';
import { sectionSortKey } from './drawOrder';
import { CHUNK_SIZE } from '../VoxelWorld';
import { RENDER_CONFIG } from './config';
import type { MeshData } from './meshChunk';
import type { RebuildLogEntry } from './rendererTypes';
import { bytesOf, toGeometry, trisOf, voxelGeometry } from './rendererGeometry';
import type { SecState } from './sectionState';
import type { SectionMeshData } from './voxel/sectionMesher';
import { createOccupancyTexture, createVoxelMaterial, type VoxelShared } from './voxel/voxelMaterial';

const LOG_CAP = 20000;

/** SectionMeshStore が 使う絵の材料（RenderMaterials の一部） */
interface StoreMaterials {
  readonly voxelShared: VoxelShared;
  readonly boxMaterial: MeshBasicMaterial;
  readonly opaqueMaterial: MeshBasicMaterial;
  readonly waterMaterial: MeshBasicMaterial;
}

/**
 * セクションのメッシュを group に 取りつける・捨てる（WorldRenderer から分けた。4-7）。
 * ジオメトリのバイト数・捨てた数・角の暗がり（AO）のメモリ・作り直しの記録を 数える。
 */
export class SectionMeshStore {
  /** セクションのジオメトリの合計（バイト） */
  bytes = 0;
  disposed = 0;
  /** 角の暗がり（AO）の「うまり」のメモリ（バイト）と、持っているセクションの数 */
  aoBytes = 0;
  aoSections = 0;
  /** update のたびに 1 増える（作り直しの記録に入れる） */
  frame = 0;
  /** build 1 回で rebuildLog に足した数と、小ブロックを作ったか（count の時計用） */
  logged = 0;
  loggedMicro = false;
  readonly log: RebuildLogEntry[] = [];

  /** onChange: メッシュを足す・捨てるたびに (cx, cz) で呼ぶ */
  constructor(
    private readonly group: Group,
    private readonly mats: StoreMaterials,
    private readonly onChange: (cx: number, cz: number) => void,
  ) {}

  install(st: SecState, data: SectionMeshData, tier: 'micro' | 'box'): void {
    const oldMeshes = [st.voxel, st.extras, st.water];
    const oldMat = st.voxMat;
    const oldTex = st.aoTex;
    let voxel: Mesh | null = null;
    let extras: Mesh | null = null;
    let water: Mesh | null = null;
    const org = [st.cx * CHUNK_SIZE, st.sy * 16, st.cz * CHUNK_SIZE] as const;
    let voxMat: MeshBasicMaterial | null = null;
    let aoTex: Data3DTexture | null = null;
    if (data.pieces.length > 0) {
      if (data.occupancy) {
        aoTex = createOccupancyTexture(data.occupancy);
        voxMat = createVoxelMaterial(this.mats.voxelShared, aoTex);
      }
      voxel = new Mesh(voxelGeometry(data.pieces[0]), voxMat ?? this.mats.boxMaterial);
      voxel.scale.setScalar(1 / 9);
      voxel.position.set(org[0], org[1], org[2]);
      voxel.userData.sortKey = sectionSortKey(st.cx, st.sy, st.cz, 0);
      voxel.matrixAutoUpdate = false;
      voxel.updateMatrix();
      this.group.add(voxel);
    }
    if (data.extras.faceCount > 0) extras = this.atlasMesh(data.extras, this.mats.opaqueMaterial, 0, sectionSortKey(st.cx, st.sy, st.cz, 1));
    if (data.water.faceCount > 0) water = this.atlasMesh(data.water, this.mats.waterMaterial, RENDER_CONFIG.waterRenderOrder, sectionSortKey(st.cx, st.sy, st.cz, 2));
    this.bytes -= st.bytes;
    for (const m of oldMeshes) if (m) this.disposeMesh(m);
    oldMat?.dispose();
    oldTex?.dispose();
    this.aoBytes += (aoTex ? data.occupancy!.length : 0) - (st.occ ? st.occ.length : 0);
    this.aoSections += (aoTex ? 1 : 0) - (st.occ ? 1 : 0);
    st.voxMat = voxMat;
    st.aoTex = aoTex;
    st.occ = aoTex ? data.occupancy : null;
    st.voxel = voxel;
    st.extras = extras;
    st.water = water;
    st.bytes = (voxel ? bytesOf(voxel.geometry) : 0) + (extras ? bytesOf(extras.geometry) : 0) + (water ? bytesOf(water.geometry) : 0);
    st.tris = trisOf(voxel) + trisOf(extras) + trisOf(water);
    this.bytes += st.bytes;
    st.faceless = !voxel && !extras && !water;
    st.evicted = false;
    this.onChange(st.cx, st.cz);
    if (voxel) this.pushLog(st, tier);
    if (water) this.pushLog(st, 'water');
    this.logged = (voxel ? 1 : 0) + (water ? 1 : 0);
    this.loggedMicro = voxel !== null && tier === 'micro';
  }

  atlasMesh(data: MeshData, material: MeshBasicMaterial, order: number, sortKey: number): Mesh {
    const mesh = new Mesh(toGeometry(data), material);
    mesh.renderOrder = order;
    mesh.userData.sortKey = sortKey;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
    return mesh;
  }

  private pushLog(st: SecState, kind: 'micro' | 'box' | 'water'): void {
    if (this.log.length >= LOG_CAP) this.log.splice(0, LOG_CAP / 4);
    this.log.push({ x: st.cx, y: st.sy, z: st.cz, kind, frame: this.frame });
  }

  private disposeMesh(m: Mesh): void {
    this.group.remove(m);
    m.geometry.dispose();
    this.disposed++;
  }

  /** セクションのメッシュを捨てる（built は そのまま） */
  dropMeshes(st: SecState): void {
    if (!st.voxel && !st.extras && !st.water) return;
    this.onChange(st.cx, st.cz);
    for (const m of [st.voxel, st.extras, st.water]) if (m) this.disposeMesh(m);
    st.voxel = st.extras = st.water = null;
    st.voxMat?.dispose();
    st.aoTex?.dispose();
    if (st.occ) {
      this.aoBytes -= st.occ.length;
      this.aoSections--;
    }
    st.voxMat = null;
    st.aoTex = null;
    st.occ = null;
    this.bytes -= st.bytes;
    st.bytes = 0;
    st.tris = 0;
  }
}
