// 画面を ひらく 間 マウスを はなし、とじたら 遊びに もどす 錠の あつかい（たんす・とりごやの メニュー・建築士さんの メニュー・ほんだなの 本が ぜんぶ 同じ）。
// 時間と 妖怪の 停止は それぞれの 画面の 窓が 受けもつ。
//
// COOP-1 5d（AC171）: 2P が パッドの B などで とじた とき（ユーザーの 操作の 外）は、1P の マウスの 錠を その場で かけなおせない
// （ブラウザが 断る）。「かけなおし待ち」に して、1P の 次の クリック・キーの 中で かけなおす。待ちの あいだも 2P は 遊べる。

interface ModalLockDeps {
  game: { input: { releaseAll(): void } };
  lock: {
    setInventoryOpen(open: boolean): void;
    simulate(locked: boolean): void;
    isSimulated(): boolean;
    beginRelock(): void;
    isPadActive(): boolean;
    locked(): boolean;
  };
  pointerLock: { request(): void; release(): void };
  /** いま ユーザーの 操作（クリック・キー）の 中か。省くと navigator.userActivation.isActive（ない ブラウザは true） */
  inGesture?: () => boolean;
}

/** ブラウザの 「ユーザーの 操作の 中か」。userActivation の ない ブラウザは true（今までと 同じ） */
function browserInGesture(): boolean {
  if (typeof navigator === 'undefined') return true;
  const ua = (navigator as { userActivation?: { isActive: boolean } }).userActivation;
  return ua ? ua.isActive : true;
}

export interface ModalLock {
  open(): void;
  /** opener: 開いた 人。省く／1 は その場で かけなおす。2 は 操作の 外なら かけなおし待ち */
  close(opener?: 1 | 2): void;
  /** かけなおし待ちの あいだ true（1P の 半分に 「ゲームに 戻る」を 出す 目印） */
  relockPending(): boolean;
  /** ユーザーの 操作（クリック・キー）が 来た。待ちの あいだなら その 場で 錠を 1 回 求める */
  onGesture(): void;
}

export function modalLock(d: ModalLockDeps): ModalLock {
  const inGesture = d.inGesture ?? browserInGesture;
  let pending = false;
  const relock = (): void => {
    d.lock.beginRelock();
    d.lock.setInventoryOpen(false);
    d.pointerLock.request();
  };
  return {
    /** 画面が ひらく: マウスが 出る。入力は はなす */
    open: () => {
      pending = false;
      d.lock.setInventoryOpen(true);
      d.game.input.releaseAll();
      if (d.lock.isSimulated()) d.lock.simulate(false);
      d.pointerLock.release();
    },
    /** 画面が とじる: ロックを かけ直す（テストの 擬似ロックなら そのまま 戻す） */
    close: (opener = 1) => {
      if (d.lock.isSimulated()) {
        d.lock.simulate(true);
        d.lock.setInventoryOpen(false);
      } else if (opener === 2 && !d.lock.isPadActive() && !d.lock.locked() && !inGesture()) {
        // 待ち: 画面を 出さず、1P の 遊びの 入力だけ 止めたまま（inventoryOpen の まま）。2P は 遊べる
        pending = true;
      } else {
        relock();
      }
      d.game.input.releaseAll();
    },
    relockPending: () => {
      // 待ちの あいだに 1P が パッドに 持ちかえた: 錠は いらない ので 待ちを とく（遊びの 入力を もどす）
      if (pending && d.lock.isPadActive()) {
        pending = false;
        d.lock.setInventoryOpen(false);
      }
      return pending;
    },
    onGesture: () => {
      if (!pending) return;
      pending = false;
      relock();
    },
  };
}
