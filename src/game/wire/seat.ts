// 家具の はたらき（HOUSE-1D・#341）のつなぎ: いす・まるいすで 座る／おふろに 入る（湯気つき）／ほんだなで あそびかたの ほんを ひらく。
// 戦闘（wireFighters）の中で 1 回だけ 作る。右クリックの 実行（DigSystem の m4.furniture）・毎ステップ（step.ts）・窓口（house.seat）が 使う。
import type { PlayerCombatImpl } from '../../combat';
import { BathSteam } from '../../fx/bathSteam';
import { SeatSystem } from '../../house/seat';
import type { Game } from '../Game';
import type { FurnUse } from '../../world/blocks/furnUse';

interface SeatWireDeps {
  game: Pick<Game, 'input' | 'scene' | 'onUpdate'>;
  world: ConstructorParameters<typeof SeatSystem>[0]['world'];
  controller: ConstructorParameters<typeof SeatSystem>[0]['controller'];
  combat: PlayerCombatImpl;
  rig: { eyeDrop: () => number };
  /** あそびかたの ほん（BOOK-1） */
  book: { open(): void; active(): boolean; visibleHook: ((visible: boolean) => void) | null };
  lock: { setInventoryOpen(open: boolean): void; simulate(locked: boolean): void; isSimulated(): boolean; beginRelock(): void };
  pointerLock: { request(): void; release(): void };
}

export function wireSeat(d: SeatWireDeps) {
  const seat = new SeatSystem({ world: d.world, controller: d.controller, actions: d.game.input, combat: d.combat });
  d.rig.eyeDrop = () => seat.eyeDrop();
  // 湯気：入って いる 間だけ お湯の 面から（つぶが 見えて いる 間だけ 描く）
  const steam = new BathSteam(d.game.scene);
  d.game.onUpdate((dt) => steam.update(dt, seat.bathSpot()));

  // ほんだな：ふつうの 本の ボタンと 同じ 本を ① もくじで ひらく。ひらく 間は マウスを はなし、とじたら 遊びに もどす（建築士さんの メニューと 同じ 錠の あつかい）
  let fromShelf = false;
  d.book.visibleHook = (visible) => {
    if (visible || !fromShelf) return;
    fromShelf = false;
    if (d.lock.isSimulated()) {
      d.lock.simulate(true);
      d.lock.setInventoryOpen(false);
    } else {
      d.lock.beginRelock();
      d.lock.setInventoryOpen(false);
      d.pointerLock.request();
    }
    d.game.input.releaseAll();
  };
  const readBook = (): void => {
    if (d.book.active()) return;
    fromShelf = true;
    d.lock.setInventoryOpen(true);
    d.game.input.releaseAll();
    if (d.lock.isSimulated()) d.lock.simulate(false);
    d.pointerLock.release();
    d.book.open();
  };

  return {
    seat,
    /** DigSystem の右クリックの 実行（m4.furniture） */
    port: {
      use: (kind: FurnUse, x: number, y: number, z: number): void => {
        if (kind === 'read') readBook();
        else seat.use(x, y, z);
      },
    },
  };
}
