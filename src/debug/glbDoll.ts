// キャラの見た目の URL 指定。
// ?char=block ... キャラの板を出さず、箱人形（今の三人称の見た目）で遊ぶ（CHAR-1 §4.9。描画回数を比べるため。ふだんは使わない）。
// 試しの ?char=（kitty・sprite・kittywalk など）は CHAR-1 第 5 版で なくした。

export function charParam(search: string): string | null {
  const v = new URLSearchParams(search).get('char');
  return v && /^[a-z0-9_-]+$/i.test(v) ? v : null;
}

/** ?char=block のとき true */
export function useBlockDoll(search: string): boolean {
  return charParam(search) === 'block';
}
