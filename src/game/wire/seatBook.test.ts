import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { LockController } from '../../input/lockController';
import { wireSeat } from './seat';

/**
 * COOP-1 5d（docs/design/COOP-1.md 1.15 §3.7 (e)・§8 の 5d・AC166・AC140・AC161・AC171）: 2P の ほんだな。
 * 実装の 前に 書いた 赤の テスト。2P が ほんだなを ねらって ZL → `m4.furniture.use('read', x, y, z)`（2P の m4 は who 2 の 包みで 呼ぶ）→ 本が もくじで 開く。
 *
 * ---- 開発への つなぎ目の 約束（`src/game/wire/seat.ts` を 直す。名前は 開発が かえて よい。かえたら 依頼文と 仕様に 書く）----
 *   SeatWireDeps に 足す:
 *     owner: { claim(who: 1 | 2): boolean; release(): void }   // modalOwner（src/game/wire/modalOwner.ts）。開いた 人の 取り合い
 *     inGesture?: () => boolean                                 // modalLock へ そのまま（AC171。マウスの ✕ で とじた とき かけなおす）
 *   SeatWireDeps.book.open は `open(who?: 1 | 2): void`（省くと 1P。本の 中身は who に よらず 同じ もくじ）
 *   返す port.use の 形: `use(kind: FurnUse, x, y, z, who: 1 | 2 = 1): void`
 *     'read'（ほんだな）: 本が もう 開いて いれば 何も しない。owner.claim(who) が false なら 何も しない〔錠も さわらない〕。
 *                         取れたら modalLock.open()（マウスを はなす）→ book.open(who)。
 *     'sit'・'bath'  : who が 1 の ときだけ 今の SeatSystem.use。who が 2 の ときは 5e まで 何も しない（world を 読みにも 行かない）。
 *   book.visibleHook(false)（本が しまわれた）: どちらが 開いた 本でも owner.release() を 1 回。錠は modal.close(開いた 人) で（AC171: 2P が パッドで とじたら 待ち、クリックの 中なら その場で かけなおす）。
 *   案内画面の 本の ボタン（player.ts の playOverlay）も 同じ owner.claim(1) を 通す（ここでは 見ない。今の E2E が 見る）。
 */

type Who = 1 | 2;

function make(opts: { claim?: boolean; gesture?: boolean } = {}) {
  const lock = new LockController();
  lock.setReal(true);
  const calls = { request: 0, release: 0, claim: [] as Who[], ownerRelease: 0, open: [] as Array<Who | undefined>, getBlock: 0, bookActive: false };
  const book = {
    open: (who?: Who) => {
      calls.open.push(who);
      calls.bookActive = true;
    },
    active: () => calls.bookActive,
    visibleHook: null as ((visible: boolean) => void) | null,
  };
  const gesture = { on: opts.gesture ?? false };
  const seat = wireSeat({
    game: { input: { releaseAll: () => {} }, scene: new Scene(), onUpdate: () => {} } as never,
    world: {
      getBlock: () => {
        calls.getBlock++;
        return 'air';
      },
    } as never,
    controller: { state: { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } }, motion: { stopNow: false, hoverY: null, faceDeg: null } } as never,
    combat: { flinching: () => false, heal: () => 0, dead: () => false } as never,
    rig: { eyeDrop: () => 0 },
    book,
    lock,
    pointerLock: {
      request: () => void calls.request++,
      release: () => {
        calls.release++;
        lock.setReal(false);
      },
    },
    owner: {
      claim: (who: Who) => {
        calls.claim.push(who);
        return opts.claim ?? true;
      },
      release: () => void calls.ownerRelease++,
    },
    inGesture: () => gesture.on,
  } as never) as unknown as {
    port: { use(kind: string, x: number, y: number, z: number, who?: Who): void };
  };
  /** 本が しまわれた（Book の visibleHook が 呼ばれる） */
  const closeBook = (): void => {
    calls.bookActive = false;
    book.visibleHook?.(false);
  };
  return { seat, calls, lock, book, closeBook, gesture };
}

describe('AC166 ほんだな（2P）', () => {
  it('2P が ほんだなに ZL: 取り合いに 2 で 申し出て、本が 2 の 持ち主で 開く。マウスを はなす（マウスの クリックが きく ように）', () => {
    const { seat, calls, lock } = make();
    seat.port.use('read', 3, 4, 5, 2);
    expect(calls.claim).toEqual([2]);
    expect(calls.open).toEqual([2]);
    expect(calls.release, 'マウスを はなす').toBe(1);
    expect(lock.locked()).toBe(false);
    expect(lock.overlayVisible()).toBe(false);
  });

  it('1P が 右クリック（who を 省く）: 今まで どおり 1 の 持ち主で 開く', () => {
    const { seat, calls } = make();
    seat.port.use('read', 3, 4, 5);
    expect(calls.claim).toEqual([1]);
    expect(calls.open.map((w) => w ?? 1)).toEqual([1]);
    expect(calls.release).toBe(1);
  });

  it('もう 本が 開いて いたら 何も しない（申し出も 錠も さわらない）', () => {
    const { seat, calls } = make();
    seat.port.use('read', 3, 4, 5, 1);
    seat.port.use('read', 3, 4, 5, 2);
    expect(calls.open).toHaveLength(1);
    expect(calls.claim).toEqual([1]);
    expect(calls.release).toBe(1);
  });

  it('取り合いに 負けた（別の 画面を もう 開いて いる）: 本は 開かず、錠も さわらない', () => {
    const { seat, calls, lock } = make({ claim: false });
    seat.port.use('read', 3, 4, 5, 2);
    expect(calls.claim).toEqual([2]);
    expect(calls.open).toEqual([]);
    expect(calls.release).toBe(0);
    expect(lock.locked()).toBe(true);
  });

  it('2P の いす・おふろへの ZL は 5e まで 何も しない（世界を 読みにも 行かない）。1P は 今まで どおり', () => {
    const { seat, calls } = make();
    seat.port.use('sit', 1, 2, 3, 2);
    seat.port.use('bath', 1, 2, 3, 2);
    expect(calls.getBlock).toBe(0);
    expect(calls.claim).toEqual([]);
    seat.port.use('sit', 1, 2, 3, 1);
    seat.port.use('bath', 1, 2, 3);
    expect(calls.getBlock, '1P の いす・おふろは 世界を 読んで 座る 係へ').toBe(2);
  });
});

describe('AC140・AC171 しまう とき', () => {
  it('2P が 開いた 本を 2P の パッドの B で しまう（クリックの 外）: 持ち主を はずし、1P の 錠は かけなおさない（待ち）', () => {
    const { seat, calls, closeBook, lock } = make({ gesture: false });
    seat.port.use('read', 3, 4, 5, 2);
    closeBook();
    expect(calls.ownerRelease).toBe(1);
    expect(calls.request, '1P の 錠は その場で 求めない').toBe(0);
    expect(lock.overlayVisible()).toBe(false);
    expect(lock.realtimeAllowed()).toBe(true);
    expect(lock.playInputEnabled()).toBe(false);
  });

  it('2P が マウスの ✕ で しまう（クリックの 中）: 今の まま その場で かけなおす', () => {
    const { seat, calls, closeBook } = make({ gesture: true });
    seat.port.use('read', 3, 4, 5, 2);
    closeBook();
    expect(calls.ownerRelease).toBe(1);
    expect(calls.request).toBe(1);
  });

  it('1P が 開いて しまう: 今まで どおり その場で かけなおす（クリックの 外でも）', () => {
    const { seat, calls, closeBook } = make({ gesture: false });
    seat.port.use('read', 3, 4, 5, 1);
    closeBook();
    expect(calls.ownerRelease).toBe(1);
    expect(calls.request).toBe(1);
  });

  it('しまった あとは また どちらでも 開ける（二重に 申し出ない）', () => {
    const { seat, calls, closeBook } = make();
    seat.port.use('read', 3, 4, 5, 2);
    closeBook();
    seat.port.use('read', 3, 4, 5, 1);
    expect(calls.claim).toEqual([2, 1]);
    expect(calls.open).toHaveLength(2);
  });
});
