import type { ItemId } from '../contracts';
import type { LeftClickKind, RightClickPreview } from '../dig/rightClick';

/** ヒント 1 つ: どのボタンで・どの絵で・どの 1 語か */
export interface ActionHintItem {
  /** すること の絵にする アイテム */
  icon: ItemId;
  /** ひらがなの 1 語 */
  word: string;
}

export interface ActionHintLines {
  right?: ActionHintItem;
  left?: ActionHintItem;
}

export interface ActionHintCtx {
  held: ItemId | null;
  /** 持っているものが ツルハシ か（ほる の絵に使う） */
  heldIsPickaxe: boolean;
  /** 持っているものが 武器 か（たたく の絵に使う） */
  heldIsBlade: boolean;
}

/**
 * 照準の下に出す 絵と 1 語。新しい動きを足すときは、ここに kind の絵と語を 1 行足す
 * （たがやす = くわ、まく = たね、たべる = やさい、しゅうかく = かご など）。
 */
export function actionHintLines(right: RightClickPreview | null, left: LeftClickKind | null, c: ActionHintCtx): ActionHintLines {
  const out: ActionHintLines = {};
  if (right) {
    switch (right.kind) {
      case 'storage':
        out.right = { icon: 'tansu', word: 'ひらく' };
        break;
      case 'furnace':
        out.right = { icon: 'furnace', word: 'ひらく' };
        break;
      case 'armor':
        out.right = { icon: right.item!, word: 'きる' };
        break;
      case 'till':
        out.right = { icon: 'kuwa', word: 'たがやす' };
        break;
      case 'plant':
        out.right = { icon: right.item!, word: 'まく' };
        break;
      case 'seedHint':
        out.right = { icon: 'kuwa', word: 'たがやそう' };
        break;
      case 'eat':
        out.right = { icon: right.item!, word: 'たべる' };
        break;
      // M7-2（§3.1）: 持っている じょうろ の 絵（ながい じょうろ なら その 絵）
      case 'fill':
        out.right = { icon: right.item!, word: 'くむ' };
        break;
      case 'pour':
        out.right = { icon: right.item!, word: 'みずやり' };
        break;
      case 'fillHint':
        out.right = { icon: right.item!, word: 'くもう' };
        break;
      case 'pet':
        out.right = { icon: right.item!, word: 'なでる' };
        break;
      case 'place':
        out.right = { icon: right.item!, word: 'おく' };
        break;
    }
  }
  // 刀を 持っているとき: ほる・わざ も「きる」に そろえる（オーナー決定）
  if (c.heldIsBlade && c.held && (left === 'dig' || left === 'hit')) out.left = { icon: c.held, word: 'きる' };
  else if (left === 'dig') out.left = { icon: c.held && c.heldIsPickaxe ? c.held : 'wood_pickaxe', word: 'ほる' };
  else if (left === 'hit') out.left = { icon: c.held && c.heldIsBlade ? c.held : 'bokuto', word: 'たたく' };
  else if (left === 'harvest') out.left = { icon: 'tomato', word: 'とる' };
  else if (left === 'shoot') out.left = { icon: 'yumi', word: 'うつ' };
  return out;
}
