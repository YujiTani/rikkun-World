import type { Action } from '../../input/actions';
import { DEFAULT_KEY_BINDINGS, DEFAULT_MOUSE_BINDINGS, MODIFIER_KEY_BINDINGS } from '../../input/actions';

export interface ControlRow {
  category: string;
  label: string;
  /** null はスティックなど、ボタンに割り当てない行 */
  action: Action | null;
  rebind: boolean;
  /** コントローラー列の固定文（スティック・かまえ） */
  fixedPad?: string;
  /** キー列に足す文（ホイールなど） */
  keysExtra?: string;
  note?: string;
}

function codeLabel(code: string): string {
  if (code === 'Space') return 'Space';
  if (code === 'Escape') return 'Esc';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/** 今のキー・マウス割り当てから表示文を作る（表が実装とずれないように） */
export function keyLabelFor(action: Action): string {
  const labels: string[] = [];
  const add = (s: string): void => {
    if (!labels.includes(s)) labels.push(s);
  };
  for (const [code, a] of Object.entries(DEFAULT_KEY_BINDINGS)) if (a === action) add(codeLabel(code));
  for (const [btn, a] of Object.entries(DEFAULT_MOUSE_BINDINGS)) {
    if (a === action) add(btn === '0' ? 'ひだりクリック' : 'みぎクリック');
  }
  for (const [k, a] of Object.entries(MODIFIER_KEY_BINDINGS)) {
    if (a === action) add(k === 'Shift+KeyQ' ? 'Shift＋Q' : k);
  }
  return labels.join('・') || '—';
}

export function rowKeys(row: ControlRow): string {
  if (!row.action) return row.keysExtra ?? '—';
  const base = keyLabelFor(row.action);
  if (!row.keysExtra) return base;
  if (base === '—') return row.keysExtra;
  return `${base}・${row.keysExtra}`;
}

export const CONTROL_ROWS: readonly ControlRow[] = [
  { category: 'あるく', label: 'あるく', action: null, rebind: false, fixedPad: 'ひだりスティック', keysExtra: 'W A S D' },
  { category: 'あるく', label: 'ジャンプ', action: 'jump', rebind: true },
  { category: 'あるく', label: 'はしる', action: 'run', rebind: true },
  { category: 'みる', label: 'みる', action: null, rebind: false, fixedPad: 'みぎスティック', keysExtra: 'マウス' },
  { category: 'みる', label: 'みかた', action: 'toggleView', rebind: true, note: 'みた目の きりかえは まだ' },
  { category: 'たたかう', label: 'ほる/こうげき', action: 'primary', rebind: true },
  { category: 'たたかう', label: 'おく/たべる', action: 'secondary', rebind: true },
  { category: 'たたかう', label: 'てにもつ まえ', action: 'hotbarPrev', rebind: true, keysExtra: 'ホイール' },
  { category: 'たたかう', label: 'てにもつ つぎ', action: 'hotbarNext', rebind: true, keysExtra: 'ホイール' },
  { category: 'メニュー', label: 'もちもの/クラフト', action: 'toggleInventory', rebind: true },
  { category: 'メニュー', label: 'スタートメニュー', action: 'openStartMenu', rebind: true, keysExtra: 'Esc' },
  { category: 'メニュー', label: 'できごと', action: 'openLog', rebind: true },
  { category: 'メニュー', label: 'すてる', action: 'drop', rebind: true },
  { category: 'メニュー', label: 'まとめて すてる', action: 'dropStack', rebind: true },
  { category: 'メニュー', label: 'メニューで きめる', action: null, rebind: false, fixedPad: 'したの B', keysExtra: 'Enter' },
  { category: 'メニュー', label: 'メニューで もどる', action: null, rebind: false, fixedPad: 'みぎの A', keysExtra: 'Esc' },
  { category: 'メニュー', label: 'かまえ', action: 'stanceNext', rebind: false, fixedPad: 'なし' },
];

export function labelOfAction(action: Action): string {
  return CONTROL_ROWS.find((r) => r.action === action)?.label ?? 'そのそうさ';
}
