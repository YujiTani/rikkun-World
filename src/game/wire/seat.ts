// 家具の はたらき（HOUSE-1D・#341）のつなぎ: いす・まるいすで 座る／おふろに 入る（湯気つき）／ほんだなで あそびかたの ほんを ひらく。
// 戦闘（wireFighters）の中で 1 回だけ 作る。右クリックの 実行（DigSystem の m4.furniture）・毎ステップ（step.ts）・窓口（house.seat）が 使う。
import type { PlayerCombatImpl } from '../../combat';
import { BathSteam } from '../../fx/bathSteam';
import { SeatSystem } from '../../house/seat';
import type { Game } from '../Game';
import { modalLock } from './modalLock';
import type { ModalOwner, Who } from './modalOwner';
import type { FurnUse } from '../../world/blocks/furnUse';

interface SeatWireDeps {
  game: Pick<Game, 'input' | 'scene' | 'onUpdate'>;
  world: ConstructorParameters<typeof SeatSystem>[0]['world'];
  controller: ConstructorParameters<typeof SeatSystem>[0]['controller'];
  combat: PlayerCombatImpl;
  rig: { eyeDrop: () => number };
  /** あそびかたの ほん（BOOK-1）。open(who) の who は 本の 中身には 関わらない（2P が 開いても 同じ もくじ） */
  book: { open(who?: Who): void; active(): boolean; visibleHook: ((visible: boolean) => void) | null };
  lock: ModalLockLock;
  pointerLock: { request(): void; release(): void };
  /** COOP-1 5d: 開いた 人の 取り合い（modalOwner） */
  owner: Pick<ModalOwner, 'claim' | 'release'>;
  /** ユーザーの 操作の 中か（modalLock へ そのまま。省くと navigator.userActivation） */
  inGesture?: () => boolean;
}

type ModalLockLock = Parameters<typeof modalLock>[0]['lock'];

/** 2P の いす・おふろに わたす 2P の 体・入力・ハート（参加する たびに 作りなおす） */
type Seat2Deps = Pick<ConstructorParameters<typeof SeatSystem>[0], 'controller' | 'actions' | 'combat'>;

export function wireSeat(d: SeatWireDeps) {
  /** 2P の いす・おふろ（参加している あいだ だけ。COOP-1 5e） */
  let seat2: SeatSystem | null = null;
  let steam2: BathSteam | null = null;
  // 1 マスに 1 人: もう 1 人が 座って いる マスには 座れない（1P の 後に 2P が 呼ばれる ので 同じ ステップは 1P が 先）
  const seat = new SeatSystem({ world: d.world, controller: d.controller, actions: d.game.input, combat: d.combat, occupied: (x, y, z) => seat2?.holds(x, y, z) === true });
  d.rig.eyeDrop = () => seat.eyeDrop();
  // 湯気：入って いる 間だけ お湯の 面から（つぶが 見えて いる 間だけ 描く）。人ごとに 1 つ（2 人が 別の おふろに 入れば 2 つ）
  const steam = new BathSteam(d.game.scene);
  d.game.onUpdate((dt) => steam.update(dt, seat.bathSpot()));
  const seatFor = (who: Who): SeatSystem | null => (who === 1 ? seat : seat2);

  // ほんだな：ふつうの 本の ボタンと 同じ 本を ① もくじで ひらく。ひらく 間は マウスを はなし、とじたら 遊びに もどす（建築士さんの メニューと 同じ 錠の あつかい）
  const modal = modalLock({ game: d.game, lock: d.lock, pointerLock: d.pointerLock, ...(d.inGesture ? { inGesture: d.inGesture } : {}) });
  /** ほんだなから 開いた 人（案内画面の ボタンから 開いた 本は null。そちらは 錠に さわらない） */
  let shelfOpener: Who | null = null;
  d.book.visibleHook = (visible) => {
    if (visible) return;
    d.owner.release(); // どちらが 開いた 本でも 持ち主を はずす
    if (shelfOpener === null) return;
    const opener = shelfOpener;
    shelfOpener = null;
    modal.close(opener); // 2P が パッドの B で しまったら 1P の 錠は かけなおし待ち（AC171）
  };
  const readBook = (who: Who): void => {
    if (d.book.active() || !d.owner.claim(who)) return;
    shelfOpener = who;
    modal.open();
    d.book.open(who);
  };

  return {
    seat,
    seatFor,
    /** 2P が 参加した: 2P の 体・入力・ハートで もう 1 つ 作る（湯気の もう 1 つは はじめて 作る とき だけ） */
    attach2(s2: Seat2Deps): SeatSystem {
      seat2 = new SeatSystem({ world: d.world, ...s2, occupied: (x, y, z) => seat.holds(x, y, z) });
      if (!steam2) {
        const st = (steam2 = new BathSteam(d.game.scene));
        d.game.onUpdate((dt) => st.update(dt, seat2?.bathSpot() ?? null));
      }
      return seat2;
    },
    /** 2P が やめた: その ステップで 立たせて すてる */
    detach2(): void {
      seat2?.dismiss();
      seat2 = null;
    },
    /** かけなおし待ちの 窓口（1P の 半分の「ゲームに 戻る」・クリックで かける） */
    modal,
    /** DigSystem の右クリックの 実行（m4.furniture）。who ＝ 使った 人。いす・おふろは その人の SeatSystem で（2P が いなければ 何も しない） */
    port: {
      use: (kind: FurnUse, x: number, y: number, z: number, who: Who = 1): void => {
        if (kind === 'read') readBook(who);
        else seatFor(who)?.use(x, y, z);
      },
    },
  };
}
