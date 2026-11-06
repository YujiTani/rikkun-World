/**
 * COOP-1 作業 2.5（#401。docs/design/COOP-1.md §2.7・§9.6）: 「つかう コントローラー」の えらびを あつかう 部品。
 *
 * ---- developer への つなぎ目の 約束 ----
 *   PAD_CHOICE_KEY      localStorage の キー(この 機械に 1 つ。世界の セーブには 入れない)
 *   PadChoice           { p1, p2 } 番号は Gamepad.index(0〜3 の 整数)。null = パッドなし
 *   readPadChoice       保存を 読む。なし・JSON でない・形が ちがう・知らない 値(0〜3 の 整数 以外)・2 つが 同じ 番号・両方 null・
 *                       storage が 投げる・storage が null → null(はじめの 動き)。エラーは 投げない。何も 書かない
 *   writePadChoice      決めた ときだけ 呼ぶ。storage が 投げても 投げ返さない
 *   defaultPadChoice    はじめの 動き: 1P = 番号の いちばん 小さい つながっている 物、2P = その つぎ。足りない 方は null
 *   decidePadChoice     1P か 2P に index を 決める(AC49)。相手と 同じ なら 相手は「のこりの つながっている 物の いちばん 小さい 番号」(なければ null)
 *   listPads            つながっている コントローラーの 一覧。名前は 並び(index の 小さい 順)で「コントローラー 1」「コントローラー 2」…
 */

export const PAD_CHOICE_KEY = 'rikkun.duo.pads.v1';

export interface PadChoice {
  p1: number | null;
  p2: number | null;
}

export interface PadDecision {
  choice: PadChoice;
  /** もう 片方が 自動で かわった(ヘルプ帯は「1P と 2P を いれかえたよ」) */
  swapped: boolean;
}

export interface PadListItem {
  /** Gamepad.index */
  index: number;
  /** 「コントローラー 1」 */
  name: string;
}

const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3;
const isSlot = (v: unknown): v is number | null => v === null || isIndex(v);

export function readPadChoice(storage: Storage | null): PadChoice | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PAD_CHOICE_KEY);
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
    const { p1, p2 } = v as Record<string, unknown>;
    if (!isSlot(p1) || !isSlot(p2)) return null;
    if (p1 === p2) return null; // 同じ 番号・両方 null は こわれた 値
    return { p1, p2 };
  } catch {
    return null;
  }
}

export function writePadChoice(storage: Storage | null, choice: PadChoice): void {
  if (!storage) return;
  try {
    storage.setItem(PAD_CHOICE_KEY, JSON.stringify({ p1: choice.p1, p2: choice.p2 }));
  } catch {
    // 書けなくても 遊びは つづける
  }
}

export function defaultPadChoice(connected: readonly number[]): PadChoice {
  return { p1: connected[0] ?? null, p2: connected[1] ?? null };
}

export function decidePadChoice(current: PadChoice, who: 1 | 2, index: number, connected: readonly number[]): PadDecision {
  const before = who === 1 ? current.p2 : current.p1;
  const other = before !== index ? before : (connected.find((c) => c !== index) ?? null);
  const choice: PadChoice = who === 1 ? { p1: index, p2: other } : { p1: other, p2: index };
  return { choice, swapped: other !== before };
}

export function listPads(pads: ReadonlyArray<Gamepad | null>): PadListItem[] {
  const out: PadListItem[] = [];
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p && p.connected) out.push({ index: i, name: `コントローラー ${out.length + 1}` });
  }
  return out;
}
