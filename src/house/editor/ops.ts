// HOUSE-1B エディターの 操作の 入口（窓口の `edit(op)` と ボタンの `press(id)`）。DOM・three なし。
// 画面の ボタンも 窓口も 同じ ここを 通る ので、画面と 窓口が くい違わない。ボタンの 一覧は buttons.ts。
import type { EditorController } from './controller';
import { editorButtons } from './buttons';
import { FURN_ORDER, K_LANTERN, isFurnKind } from './furniture';
import { KANA_CHARS, toKatakana } from './model';
import { ROOF_KINDS, SIZES, SUFFIXES, WINDOW_KINDS, type Rot } from './tuning';

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isRot = (v: unknown): v is Rot => v === 0 || v === 1 || v === 2 || v === 3;

/** 窓口 `edit(op)`（仕様 §6.1）。できたら true。形の ちがう op・知らない op は false */
export function editOp(ctl: EditorController, raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const o = raw as Record<string, unknown>;
  switch (o.op) {
    case 'size': {
      const w = o.w === undefined ? undefined : o.w;
      const d = o.d === undefined ? undefined : o.d;
      if ((w !== undefined && !isInt(w)) || (d !== undefined && !isInt(d)) || (w === undefined && d === undefined)) return false;
      return ctl.setSize({ ...(w !== undefined ? { w: w as number } : {}), ...(d !== undefined ? { d: d as number } : {}) });
    }
    case 'windows':
      return (o.delta === 1 || o.delta === -1) && ctl.windows(o.delta);
    case 'windowKind':
      return WINDOW_KINDS.some((k) => k === o.kind) && ctl.setWindowKind(o.kind as (typeof WINDOW_KINDS)[number]);
    case 'roof':
      return ROOF_KINDS.some((k) => k === o.kind) && ctl.setRoof(o.kind as (typeof ROOF_KINDS)[number]);
    case 'place':
      return isFurnKind(o.kind) && isInt(o.x) && isInt(o.z) && (o.rot === undefined || isRot(o.rot)) && ctl.place(o.kind, o.x, o.z, (o.rot ?? 0) as Rot);
    case 'remove':
      return isInt(o.x) && isInt(o.z) && ctl.remove(ctl.indexAt(o.x, o.z));
    case 'rotate':
      return isInt(o.x) && isInt(o.z) && (o.dir === 'right' || o.dir === 'left') && ctl.rotate(ctl.indexAt(o.x, o.z), o.dir);
    case 'select': {
      if (!isInt(o.x) || !isInt(o.z)) return false;
      const at = ctl.indexAt(o.x, o.z);
      if (at < 0) {
        ctl.clearPlaced();
        return false;
      }
      ctl.selectPlaced(at);
      return true;
    }
    case 'light':
      // ちょうちんは はずせない（何も かわらない）。ふきだしだけ
      if (o.kind !== K_LANTERN) return false;
      ctl.lightTouched();
      return false;
    case 'char':
      return typeof o.ch === 'string' && ctl.char(o.ch);
    case 'erase':
      return ctl.erase();
    case 'suffix':
      return typeof o.back === 'string' && ctl.suffix(o.back);
    case 'undo':
      return ctl.undo();
    case 'redo':
      return ctl.redo();
    default:
      return false;
  }
}

/** ボタンの id に 値まで 入れた 形へ（仕様 §6.1 の 2 引数の 形 press('windowKind', 'shoji') も 同じ ボタン） */
function normalize(id: string, arg: unknown): string {
  return (id === 'windowKind' || id === 'roof') && typeof arg === 'string' ? `${id}-${arg}` : id;
}

/** 数字 1 つ を 後ろに 持つ id（width-7 → 7） */
function tail(id: string, head: string): string | null {
  return id.startsWith(head) ? id.slice(head.length) : null;
}

/**
 * ボタンを 押す。いま 画面に 見えていて 押せる ボタンだけ はたらく（押せない・見えない・知らない id は 何も おきない = false）。
 * `close`（✕）は 呼ぶ 側（HouseTalk）が 受けもつ。
 */
export function pressEditor(ctl: EditorController, rawId: string, arg?: unknown): boolean {
  const id = normalize(rawId, arg);
  const b = editorButtons(ctl).find((x) => x.id === id);
  if (!b || !b.enabled) return false;
  ctl.hideBubble(); // つぎに 何か 押したら ふきだしは すぐ 消える（そのまま ふきだしが 出る 押し方なら 新しい ふきだし）
  switch (id) {
    case 'undo': return ctl.undo();
    case 'redo': return ctl.redo();
    case 'new': ctl.openReset(); return true;
    case 'need': ctl.openNeed(); return true;
    case 'needClose': ctl.closeNeed(); return true;
    case 'prev': return ctl.prev();
    case 'next': return ctl.next();
    case 'done': ctl.done(); return true;
    case 'yes': ctl.confirmYes(); return true;
    case 'no': ctl.confirmNo(); return true;
    case 'take': return ctl.takeSelected();
    case 'turnRight': return ctl.turnSelected('right');
    case 'turnLeft': return ctl.turnSelected('left');
    case 'light': ctl.lightTouched(); return true;
    case 'windowsDown': return ctl.windows(-1);
    case 'windowsUp': return ctl.windows(1);
    case 'dakuten': return ctl.mark('dakuten');
    case 'handakuten': return ctl.mark('handakuten');
    case 'katakana': ctl.setKatakana(!ctl.katakana); return true;
    case 'erase': return ctl.erase();
    default: break;
  }
  const size = tail(id, 'width-') ?? tail(id, 'depth-');
  if (size !== null) {
    const n = Number(size);
    return SIZES.some((x) => x === n) && ctl.setSize(id.startsWith('width-') ? { w: n } : { d: n });
  }
  const kind = tail(id, 'windowKind-');
  if (kind !== null) return WINDOW_KINDS.some((k) => k === kind) && ctl.setWindowKind(kind as (typeof WINDOW_KINDS)[number]);
  const roof = tail(id, 'roof-');
  if (roof !== null) return ROOF_KINDS.some((k) => k === roof) && ctl.setRoof(roof as (typeof ROOF_KINDS)[number]);
  const furn = tail(id, 'furniture-');
  if (furn !== null) {
    const k = FURN_ORDER.find((x) => x === furn);
    if (!k) return false;
    ctl.selectPalette(ctl.sel.palette === k ? null : k);
    return true;
  }
  const ch = tail(id, 'char-');
  if (ch !== null && KANA_CHARS.includes(ch)) return ctl.char(ctl.katakana ? toKatakana(ch) : ch);
  const suf = tail(id, 'suffix-');
  if (suf !== null) {
    const back = SUFFIXES[Number(suf)];
    return back !== undefined && ctl.suffix(back);
  }
  return false;
}
