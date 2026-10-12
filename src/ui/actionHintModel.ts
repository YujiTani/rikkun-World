import { escapeHtml, ruby } from './text';
import type { ItemId } from '../contracts';
import type { LeftClickKind, RightClickPreview } from '../dig/rightClick';

export interface ActionHintLines {
  right?: string;
  left?: string;
}

/**
 * 照準の下に出す文（「右」「左」だけ漢字（表示のとき ruby でふりがな）。名前は items の名前をそのまま使う）。
 * 新しい動きを足すときは、ここに kind の文を 1 行足す。
 */
export function actionHintLines(
  right: RightClickPreview | null,
  left: LeftClickKind | null,
  nameOf: (item: ItemId) => string,
): ActionHintLines {
  const out: ActionHintLines = {};
  if (right) {
    const name = right.item ? nameOf(right.item) : '';
    switch (right.kind) {
      case 'storage':
        out.right = '右クリック: たんす を ひらく';
        break;
      case 'furnace':
        out.right = '右クリック: かまど を ひらく';
        break;
      case 'armor':
        out.right = `右クリック: ${name} を きる`;
        break;
      case 'place':
        out.right = `右クリック: ${name} を おく`;
        break;
    }
  }
  if (left === 'dig') out.left = '左クリック: ほる';
  else if (left === 'shoot') out.left = '左クリック: や を うつ';
  return out;
}

/** 表示用の HTML（先頭の 右・左 にふりがな） */
export function actionHintHtml(text: string): string {
  const e = escapeHtml(text);
  if (e.startsWith('右')) return ruby('右', 'みぎ') + e.slice(1);
  if (e.startsWith('左')) return ruby('左', 'ひだり') + e.slice(1);
  return e;
}
