// START-1 §4.1（2.4）: スタートメニューを 出すか。
// いつも 出す。出さない: ?menu=0、または 環境変数 off（?menu=1 が あれば 環境変数 off でも 出す）。

export function shouldShowStartMenu(search: string, envStartMenu: string | undefined): boolean {
  const menu = new URLSearchParams(search).get('menu');
  if (menu === '1') return true;
  if (menu === '0') return false;
  return envStartMenu !== 'off';
}
