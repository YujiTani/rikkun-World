import type { ChunkColumn, SectionData } from '../contracts';
import { BLOCK_TYPES, isOpaqueIndex, isSolidIndex } from './blocks/blockTypes';
import { OPACITY } from './light/opacity';

/** 列の辞書のキー（数 1 つ）。VOX-plan §2 */
export function columnKey(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

/** 光も通さない 本当に ふさがったブロック（「見えない」印の判定用） */
export const SEALS: Uint8Array = Uint8Array.from(BLOCK_TYPES, (_, i) => (isOpaqueIndex(i) && isSolidIndex(i) && OPACITY[i] === 15 ? 1 : 0));

/** 1 列（16×WORLD_HEIGHT×16）。ChunkColumn の形で持つ */
export class Column implements ChunkColumn {
  readonly sections: SectionData[];
  /** セクションごとの「見えない」印: -1 = 計算しなおし待ち、0 = 見える、1 = 見えない */
  readonly hidden: Int8Array;
  constructor(
    readonly cx: number,
    readonly cz: number,
    sections: SectionData[],
  ) {
    this.sections = sections;
    this.hidden = new Int8Array(sections.length).fill(-1);
    this.exp = new Array<Uint8Array | null>(sections.length).fill(null);
    this.fast = new Array<Uint8Array | null>(sections.length).fill(null);
    this.uni = new Int16Array(sections.length);
    for (let sy = 0; sy < sections.length; sy++) this.sync(sy);
  }
  /** 読み出しを速くする写し: full なら その配列、それ以外は null（sections と同じものを指す） */
  readonly fast: (Uint8Array | null)[];
  /** 描画側に「変わった」と伝える印（World が持つ一覧に入っているか・どのセクションか） */
  colDirty = false;
  secListed = false;
  secBits = 0;
  /** secBits のうち、ブロックを変えたことでついた分（光だけの変化とは分けて、描画が「プレイヤーが変えた所」を先に作れるように） */
  blockBits = 0;
  /** 保存のための印（World が持つ一覧に入っているか） */
  saveDirty = false;
  /** uniform なら その番号、palette なら -2、full なら -1 */
  readonly uni: Int16Array;
  /** 「空」の高さ: 16×16 の各マスの topY（最初に必要になった時の値。ほっても かえない）。exposure 用 */
  sky: Int16Array | null = null;
  /** sky の最大 */
  skyMax = -1;
  /** 空にとどいている地下の空気のマス（セクションごとの 4096 ビット。無ければ null） */
  readonly exp: (Uint8Array | null)[];

  /** sections[sy] を入れかえたら呼ぶ */
  sync(sy: number): void {
    const s = this.sections[sy];
    this.fast[sy] = s.kind === 'full' ? s.data : null;
    this.uni[sy] = s.kind === 'uniform' ? s.block : s.kind === 'full' ? -1 : -2;
  }
}
