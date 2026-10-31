// 画面を ひらく 間 マウスを はなし、とじたら 遊びに もどす 錠の あつかい（たんす・とりごやの メニュー・建築士さんの メニュー・ほんだなの 本が ぜんぶ 同じ）。
// 時間と 妖怪の 停止は それぞれの 画面の 窓が 受けもつ。

interface ModalLockDeps {
  game: { input: { releaseAll(): void } };
  lock: { setInventoryOpen(open: boolean): void; simulate(locked: boolean): void; isSimulated(): boolean; beginRelock(): void };
  pointerLock: { request(): void; release(): void };
}

export function modalLock(d: ModalLockDeps): { open(): void; close(): void } {
  return {
    /** 画面が ひらく: マウスが 出る。入力は はなす */
    open: () => {
      d.lock.setInventoryOpen(true);
      d.game.input.releaseAll();
      if (d.lock.isSimulated()) d.lock.simulate(false);
      d.pointerLock.release();
    },
    /** 画面が とじる: ロックを かけ直す（テストの 擬似ロックなら そのまま 戻す） */
    close: () => {
      if (d.lock.isSimulated()) {
        d.lock.simulate(true);
        d.lock.setInventoryOpen(false);
      } else {
        d.lock.beginRelock();
        d.lock.setInventoryOpen(false);
        d.pointerLock.request();
      }
      d.game.input.releaseAll();
    },
  };
}
