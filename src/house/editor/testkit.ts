// HOUSE-1B ユニットテスト用の 道具（EditorController を 小さな 持ち主で 作る）。本番の コードからは 使わない。
import { EditorController, type EditorHost, type SheetPort } from './controller';
import { emptyState, type EditorState } from './model';

export interface Kit {
  ctl: EditorController;
  holder: { draft: EditorState };
  /** onMade が 呼ばれた 回数 */
  made: { n: number };
  /** make() に わたされた 作りかけ（作った 順） */
  sheets: EditorState[];
}

/** 作りかけは まっさら。sheet は problem を 差しかえられる（既定は いつも 通る） */
export function makeController(over: { problem?: SheetPort['problem']; have?: EditorHost['have'] } = {}): Kit {
  const holder = { draft: emptyState() };
  const made = { n: 0 };
  const sheets: EditorState[] = [];
  const ctl = new EditorController({
    holder,
    have: over.have ?? (() => 0),
    sheet: { problem: over.problem ?? (() => null), make: (d) => void sheets.push(structuredClone(d) as EditorState) },
    onMade: () => void made.n++,
  });
  return { ctl, holder, made, sheets };
}
