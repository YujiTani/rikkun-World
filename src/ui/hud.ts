import { ruby } from './text';

/** 画面の上に重ねる文字（HTML で作るので漢字にルビがふれる） */
export function mountHud(parent: HTMLElement): void {
  const title = document.createElement('div');
  title.id = 'title';
  title.innerHTML = `りっくんワールド <small>${ruby('準備中', 'じゅんびちゅう')}</small>`;
  parent.appendChild(title);
}
