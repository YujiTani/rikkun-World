/**
 * 1P の もちもの画面の「窓の 大きさ」の 聞き耳（resize・毎コマの くらべ・枠の ResizeObserver）。
 * 2P の 画面は 聞き耳を もたない。大きさが かわったら host.fit() で ちぢめ（2 人用は 位置を）なおす。
 */
export interface WindowFitHost {
  frame: HTMLElement;
  isOpen(): boolean;
  fit(): void;
  /** 前に fit した ときの 窓の 大きさ / 枠の 大きさ（`${w}x${h}`） */
  fitWin(): string;
  fitSize(): string;
}

export function listenWindowFit(host: WindowFitHost): () => void {
  const onResize = (): void => {
    host.fit();
    // 窓の大きさが 反映される のが 遅れる ことが あるので、すぐ後にも もう一度 合わせる
    requestAnimationFrame(() => {
      if (host.isOpen()) host.fit();
    });
    window.setTimeout(() => {
      if (host.isOpen()) host.fit();
    }, 40);
  };
  window.addEventListener('resize', onResize);
  // resize の 知らせが 遅れても、ひらいている あいだは 窓の 大きさを 毎コマ みて すぐ 合わせる（数の くらべだけ）
  let pollId = 0;
  const poll = (): void => {
    pollId = requestAnimationFrame(poll);
    if (host.isOpen() && `${window.innerWidth}x${window.innerHeight}` !== host.fitWin()) host.fit();
  };
  pollId = requestAnimationFrame(poll);
  // 窓の大きさで 文字・マスの大きさが 後から かわっても、枠の大きさが かわったら すぐ ちぢめなおす
  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      if (host.isOpen() && `${host.frame.offsetWidth}x${host.frame.offsetHeight}` !== host.fitSize()) host.fit();
    });
    observer.observe(host.frame);
  }
  return () => {
    window.removeEventListener('resize', onResize);
    observer?.disconnect();
    cancelAnimationFrame(pollId);
  };
}
