import type { ChunkColumn, SectionData } from '../contracts';
import { BLOCK_TYPES } from '../world/blocks/blockTypes';
import { localIndex, sectionGet, sectionToArray } from '../world/sections';

/**
 * 保存に だけ 別の ブロックで 書く マス（遊んでいる 世界は かえない）。
 * 例: がしゃどくろの 間欠泉の 管理が 作った `geyser_dirt` は、ボスを 保存しないので、持ち主の いない つちが のこらない ように
 *     元の ブロック（prev）で 書く。プレイヤーが 置いた `geyser_dirt` は ここに 入らないので そのまま 保存される。
 * live = いま 世界に ある ブロック。そのマスが live の ときだけ 置きかえる（掘られた・かわった マスには さわらない）。
 */
export interface SaveBlockOverride {
  x: number;
  y: number;
  z: number;
  live: string;
  save: string;
}

const indexOfId = (id: string): number => BLOCK_TYPES.findIndex((t) => t.id === id);

/** 列を 保存用に うつす。置きかえが ない 列は そのもの（同じ オブジェクト）。あれば 触る セクションだけ 写して 書きかえる */
export function columnForSave(col: ChunkColumn, overrides: readonly SaveBlockOverride[]): ChunkColumn {
  let sections: SectionData[] | null = null;
  for (const o of overrides) {
    if (o.x >> 4 !== col.cx || o.z >> 4 !== col.cz) continue;
    const sy = o.y >> 4;
    const src = (sections ?? col.sections)[sy];
    if (!src) continue;
    const i = localIndex(o.x & 15, o.y & 15, o.z & 15);
    const live = indexOfId(o.live);
    const save = indexOfId(o.save);
    if (live < 0 || save < 0 || sectionGet(src, i) !== live) continue;
    if (!sections) sections = col.sections.slice();
    // 写して 書きかえる（元の セクションは かえない。palette・uniform も full に して 1 マスだけ かえる）
    const data = Uint8Array.from(sectionToArray(src));
    data[i] = save;
    sections[sy] = { kind: 'full', data };
  }
  return sections ? { ...col, sections } : col;
}

/** pagehide の 保険の 変えたマスの 記録 [x,y,z,番号]… にも 同じ 置きかえを する（番号は 今の BLOCK_TYPES の 番号） */
export function pendingCellsForSave(cells: readonly number[], overrides: readonly SaveBlockOverride[]): readonly number[] {
  if (overrides.length === 0) return cells;
  const map = new Map<string, number>();
  for (const o of overrides) {
    const live = indexOfId(o.live);
    const save = indexOfId(o.save);
    if (live >= 0 && save >= 0) map.set(`${o.x},${o.y},${o.z},${live}`, save);
  }
  const out = cells.slice();
  for (let i = 0; i + 3 < out.length; i += 4) {
    const s = map.get(`${out[i]},${out[i + 1]},${out[i + 2]},${out[i + 3]}`);
    if (s !== undefined) out[i + 3] = s;
  }
  return out;
}
