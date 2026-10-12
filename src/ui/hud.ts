
/** 画面の上に重ねる文字（HTML で作るので漢字にルビがふれる） */
export function mountHud(parent: HTMLElement): void {
  const title = document.createElement('div');
  title.id = 'title';
  title.textContent = 'りっくんワールド';
  parent.appendChild(title);
}
