// START-1 §4.1: スタートメニューを 出すか。
// 出す: URL に なにも ない、または menu=1 が ある。出さない: menu=1 以外の 指定が 1 つでも ある・?menu=0・環境変数 off（menu=1 が あれば 出す）。

export function shouldShowStartMenu(search: string, envStartMenu: string | undefined): boolean {
  const q = new URLSearchParams(search);
  if (q.get('menu') === '1') return true;
  if (envStartMenu === 'off') return false;
  return [...q.keys()].length === 0;
}
