import type { ItemId } from '../contracts';
import type { LeftClickKind, RightClickPreview } from '../dig/rightClick';

/** ヒント 1 つ: どのボタンで・どの絵で・どの 1 語か */
export interface ActionHintItem {
  /**
   * すること の絵にする アイテム（'heart' = ハート。LIVE-1 の なでる）。
   * 版 3.2: 'full' = おなかいっぱい・'carry' = だっこ・'chicken' = おろす（専用 の 絵 が できるまで にわとり で かわり）
   */
  icon: ItemId | 'heart' | 'full' | 'carry' | 'chicken';
  /** ひらがなの 1 語 */
  word: string;
  /** LIVE-2: 入らない 所 など（絵 を うすく する。押しても 合図 だけ） */
  disabled?: boolean;
}

export interface ActionHintLines {
  right?: ActionHintItem;
  left?: ActionHintItem;
  /** 版 3.2 §3.1: だっこ の わ の たまり 0〜1（なかま を 右クリック 押しつづけ。40 ステップ で 1 しゅう）。わ が なければ 無い */
  progress?: number;
}

export interface ActionHintCtx {
  held: ItemId | null;
  /** 持っているものが ツルハシ か（ほる の絵に使う） */
  heldIsPickaxe: boolean;
  /** 持っているものが 武器 か（たたく の絵に使う） */
  heldIsBlade: boolean;
  /** 版 3.2: `DigSystem.carryProgress()`（0 = わ なし） */
  carryProgress?: number;
  /** 版 3.2: だっこ中（左クリック は 止まって いる ので 左の 案内 を 出さない） */
  carrying?: boolean;
  /**
   * LIVE-2.1: だっこ中 の 着地点 の 答え（`animals.throwSpot()` の `ok`・`toss`）。
   * 渡せば 語 は `なげる`（`toss` false = 1 マス より 近い は `おろす`）、なげられない 所（`ok` false）は うすく
   */
  throwSpot?: { ok: boolean; toss: boolean } | null;
}

/**
 * 照準の下に出す 絵と 1 語。新しい動きを足すときは、ここに kind の絵と語を 1 行足す
 * （たがやす = くわ、まく = たね、たべる = やさい、しゅうかく = かご など）。
 */
export function actionHintLines(right: RightClickPreview | null, left: LeftClickKind | null, c: ActionHintCtx): ActionHintLines {
  const out: ActionHintLines = {};
  if (right) {
    switch (right.kind as string) {
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
      // LIVE-1（§3.1）: あげる = 持っている やさい の 絵、なでる = ハート
      case 'feed':
        out.right = { icon: right.item!, word: 'あげる' };
        break;
      case 'animalPet':
        out.right = { icon: 'heart', word: 'なでる' };
        break;
      // 版 3.2（§3.1）: おなかいっぱい = まってね、あみ = とる、だっこ中 = おろす。netHint は 合図 の チップ だけ（照準 の 下 には 出さない）
      case 'animalFull':
        out.right = { icon: 'full', word: 'まってね' };
        break;
      case 'net':
        out.right = { icon: 'mushi_ami', word: 'とる' };
        break;
      case 'putDown': {
        // LIVE-2.1（§3.1）: 着地点 が 答え に ある とき は なげる（d が 1 より 近い 時 は おろす）。なげられない 所 は うすく
        const ts = c.throwSpot;
        if (ts) out.right = ts.toss ? { icon: 'chicken', word: 'なげる', ...(ts.ok ? {} : { disabled: true }) } : { icon: 'chicken', word: 'おろす' };
        else out.right = { icon: 'chicken', word: 'おろす' };
        break;
      }
      // LIVE-2（§2.11）: こたつ = egg／kin_tamago ＋ いれる、入って いる = こたつ ＋ まってね。小屋 = あつめる、置く = toriya ＋ おく（入らない 所 は うすく）
      // kitNeedEgg・kitMax・coopNoEgg は 照準 の 下 に 出さず、クリック した ときの 合図 の チップ だけ
      case 'kitPut':
        out.right = { icon: right.item!, word: 'いれる' };
        break;
      case 'kitWait':
        out.right = { icon: 'nukunuku', word: 'まってね' };
        break;
      // LIVE-2.1: 3 こ 入って いる こたつ に たまご = いっぱい（3 こ より 少なければ kitPut の いれる）
      case 'kitFull':
        out.right = { icon: right.item ?? 'egg', word: 'いっぱい' };
        break;
      case 'coopCollect':
        out.right = { icon: 'egg', word: 'あつめる' };
        break;
      case 'coopPlace':
        out.right = { icon: 'toriya', word: 'おく' };
        break;
      case 'coopNoRoom':
      case 'coopMax':
        out.right = { icon: 'toriya', word: 'おく', disabled: true };
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
      // BUCKET-1（§3.1）: 持っている バケツ の 絵。4g（bucketNo）は 出さない
      case 'bucketFill':
        out.right = { icon: right.item!, word: 'くむ' };
        break;
      case 'bucketPlace':
        out.right = { icon: right.item!, word: 'おく' };
        break;
      case 'bucketHint':
        out.right = { icon: right.item!, word: 'くもう' };
        break;
      case 'place':
        out.right = { icon: right.item!, word: 'おく' };
        break;
    }
  }
  // 版 3.2: なかま を 押しつづけ て いる あいだ は 語 が だっこ・わ が たまる（あげる・なでる・まってね の かわり）
  if (c.carryProgress && c.carryProgress > 0) {
    out.right = { icon: 'carry', word: 'だっこ' };
    out.progress = Math.min(1, c.carryProgress);
  }
  if (c.carrying) return out;
  // 刀を 持っているとき: ほる・わざ も「きる」に そろえる（オーナー決定）
  if (c.heldIsBlade && c.held && (left === 'dig' || left === 'hit')) out.left = { icon: c.held, word: 'きる' };
  else if (left === 'dig') out.left = { icon: c.held && c.heldIsPickaxe ? c.held : 'wood_pickaxe', word: 'ほる' };
  else if (left === 'hit') out.left = { icon: c.held && c.heldIsBlade ? c.held : 'bokuto', word: 'たたく' };
  else if (left === 'harvest') out.left = { icon: 'tomato', word: 'とる' };
  else if (left === 'shoot') out.left = { icon: 'yumi', word: 'うつ' };
  return out;
}
