import { BufferAttribute, BufferGeometry, type Mesh } from 'three';
import type { SectionData } from '../../contracts';
import { isCrossIndex } from '../blocks/blockTypes';
import { sectionGet } from '../sections';
import type { MeshData } from './meshChunk';
import type { VoxelPiece } from './voxel/sectionMesher';

/** WorldRenderer の ジオメトリまわりの小さな関数（WorldRenderer.ts から分けた。4-7） */

export function toGeometry(data: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(data.positions), 3));
  if (data.uvs.length > 0) g.setAttribute('uv', new BufferAttribute(new Float32Array(data.uvs), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(data.colors), 3));
  g.setAttribute('aLight', new BufferAttribute(new Float32Array(data.lights), 2));
  g.setAttribute('aDark', new BufferAttribute(new Float32Array(data.darks), 1));
  g.setIndex(new BufferAttribute(new Uint32Array(data.indices), 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export function voxelGeometry(p: VoxelPiece): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(p.positions, 3));
  g.setAttribute('aData', new BufferAttribute(p.data, 4, false));
  g.setAttribute('aLight', new BufferAttribute(p.light, 2, true));
  g.setIndex(new BufferAttribute(p.indices, 1));
  g.computeBoundingSphere();
  return g;
}

export function bytesOf(g: BufferGeometry): number {
  let n = g.index ? g.index.array.byteLength : 0;
  for (const k of Object.keys(g.attributes)) n += (g.attributes[k] as BufferAttribute).array.byteLength;
  return n;
}

export function trisOf(m: Mesh | null): number {
  const idx = m?.geometry.getIndex();
  return idx ? idx.count / 3 : 0;
}

export function sectionAllAir(s: SectionData): boolean {
  if (s.kind === 'uniform') return s.block === 0;
  for (let i = 0; i < 4096; i++) if (sectionGet(s, i) !== 0) return false;
  return true;
}

export function sectionHasCross(s: SectionData): boolean {
  if (s.kind === 'uniform') return isCrossIndex(s.block);
  if (s.kind === 'palette') {
    for (const b of s.palette) if (isCrossIndex(b)) return true;
    return false;
  }
  for (let i = 0; i < 4096; i++) if (isCrossIndex(s.data[i])) return true;
  return false;
}
