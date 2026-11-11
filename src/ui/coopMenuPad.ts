// COOP-1 5c（仕様 §3.7 (d)・AC138）: とりごやの メニューを パッド（十字・A・B）で 動かす 小さな 核。DOM を 使わない。
import type { CoopMenuInfo, CoopMenuModel } from './coopMenuModel';

const CARD = 'card:';

/** いま えらべる 名前の 一覧（画面に 出る じゅん。えらべない 物は 入れない）。ひらいて いなければ [] */
export function coopPadNames(info: CoopMenuInfo): string[] {
  if (!info.open) return [];
  switch (info.page) {
    case 'top':
      return [...(info.eggs > 0 ? ['collect'] : []), ...(info.meatDisabled ? [] : ['meat']), 'close'];
    case 'pick':
      return ['back', ...info.kids.map((k) => `${CARD}${k}`), 'close'];
    case 'confirm':
      return ['cancel', 'ok', 'close'];
    default: {
      const never: never = info.page;
      return never;
    }
  }
}

function cardId(name: string): number | null {
  if (!name.startsWith(CARD)) return null;
  const id = Number(name.slice(CARD.length));
  return Number.isInteger(id) ? id : null;
}

/** A: 名前の ボタンを 押したのと 同じ。知らない 名前・今の ページに ない 名前は 何も しない */
export function coopPadPress(m: CoopMenuModel, name: string): void {
  if (!coopPadNames(m.info()).includes(name)) return;
  const id = cardId(name);
  if (id !== null) {
    m.press('card', id);
    return;
  }
  switch (name) {
    case 'collect':
    case 'meat':
    case 'back':
    case 'cancel':
    case 'ok':
    case 'close':
      m.press(name);
      return;
    default:
      return;
  }
}

/** えらびが うごいた とき: 'card:<id>' なら その子に ▼、ほかは はずす */
export function coopPadFocus(m: CoopMenuModel, name: string | null): void {
  const id = name === null ? null : cardId(name);
  m.press('hover', id ?? undefined);
}

/** B: pick → top。top・confirm は とじる。ひらいて いなければ 何も しない */
export function coopPadBack(m: CoopMenuModel): void {
  const info = m.info();
  if (!info.open) return;
  m.press(info.page === 'pick' ? 'back' : 'close');
}
