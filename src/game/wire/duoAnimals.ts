// COOP-1 5c（docs/design/COOP-1.md §3.7 (d)・§8）: 2P の にわとり・とりごやを つなぐ。
// 中身は duo/p2Animals.ts（口の 包み）・duo/p2CoopMenu.ts（メニューの 核）・ui/duoAnimalHud.ts（半分の 絵）。
// duoPlay.ts には この 1 か所だけ つなぐ（m4 の 3 つと、毎ステップ・倒れた・やめた）。
import type { AnimalEvent, ItemId, NatsukiView, ThrowAim, Vec3 } from '../../contracts';
import type { DigSystemImpl } from '../../dig/DigSystem';
import type { DigM4Deps } from '../../dig/digPorts';
import { invPadCommand } from '../../duo/invRules';
import { createP2Animals } from '../../duo/p2Animals';
import type { P2AnimalsPort } from '../../duo/p2AnimalsPort';
import { createP2CoopMenu, p2AnimalsDown, p2AnimalsLeave, type P2CoopMenu } from '../../duo/p2CoopMenu';
import type { Action } from '../../input/actions';
import { DuoAnimalHud } from '../../ui/duoAnimalHud';
import { COOP_MENU_REACH, type CoopMenuButton, type CoopMenuInfo } from '../../ui/coopMenuModel';
import { coopMenuBase, coopMenuView, emptyKitSize } from './coopMenuView';
import type { WiredLoop } from './save';

export interface DuoAnimalsCtx {
  deps: WiredLoop;
  /** 2P の 足もと（毎回 読む） */
  position: () => Vec3;
  /** 2P の ほる係（あとから 作る ほる係を 関数で 包む） */
  dig: () => DigSystemImpl;
  /** 倒れて いる */
  down: () => boolean;
  /** 2P の パッドが つながって いる */
  padOn: () => boolean;
  /** 2P の 入力が 通る か（もちもの画面が 開いていない・倒れていない・メニューも 開いていない） */
  playing: () => boolean;
  /** 2P の もちもの画面が 開いている（メニューを ひらかない・とじる） */
  invOpen: () => boolean;
  /** 2P の つくる（あつめた たまごの「ひろった」を 実績へ） */
  craft2: () => { notifyPickup(item: ItemId, count: number): void };
}

export interface DuoAnimals {
  /** 2P の ほる係の m4 に 広げる（`animals`・`live`・`coopMenu`） */
  m4: Pick<DigM4Deps, 'animals' | 'live' | 'coopMenu'>;
  /** 他の 係に 見せる 口（出来事の 配り・こたつの わく・着地点の 丸） */
  port: P2AnimalsPort;
  /** `duo.coopMenu(2)` */
  menuInfo(): CoopMenuInfo;
  /** メニューが ひらいて いる（2P の 遊びの 入力を 止め、パッドを メニューの わりあてに する） */
  menuOpen(): boolean;
  /** `duo.coopMenuPress(2, …)`（`?duo=dev` の ときだけ 呼ぶ） */
  menuPress(button: CoopMenuButton, id?: number): void;
  /** 2P の パッドの 十字・A・B（メニューが ひらいて いる ときだけ きく） */
  pad(action: Action): void;
  /** 毎ステップ（2P の ほる係の 更新の あと） */
  step(): void;
  /** 倒れた ステップ に 1 回 */
  down(): void;
  /** やめた ステップ（保存の 前）に 1 回 */
  leave(): void;
  dispose(): void;
}

export function wireDuoAnimals(c: DuoAnimalsCtx): DuoAnimals {
  const { deps } = c;
  const { animals, hud, shared, live, world, fxSound } = deps;
  const feet = (): Vec3 => ({ ...c.position() });
  const coopRow = (id: number) => animals.coops().find((x) => x.id === id) ?? null;
  const menu: P2CoopMenu = createP2CoopMenu({
    base: coopMenuBase(animals, 2, (item, n) => c.craft2().notifyPickup(item, n)),
    coopPos: coopRow,
    pos: c.position,
    reach: COOP_MENU_REACH,
    alive: () => !c.down() && !c.invOpen(), // メニュー中は playing が false に なる ので、ここでは 見ない
    padOn: c.padOn,
  });
  const view = coopMenuView(animals, shared.pickMux(2), fxSound);
  const ui = new DuoAnimalHud(hud, menu.model, view);

  // こたつの 天板の わく（毎ステップ 使いまわす 入れもの）
  const aimBox = { x: 0, z: 0, holdingEgg: false, y: 0, size: 1 as 1 | 2 };
  const kit: ReturnType<P2AnimalsPort['kitAim']> = { eye: { x: 0, z: 0 }, aim: null };

  const port: P2AnimalsPort = {
    feed: (events: readonly AnimalEvent[]) => ui.feed(events, c.dig().animalTarget()),
    kitAim() {
      const p = c.position();
      const a = c.dig().aimedKit();
      kit.eye.x = p.x;
      kit.eye.z = p.z;
      const k = a.kit;
      const size = k && a.holdingEgg ? emptyKitSize(world, k) : null;
      if (k && size !== null) {
        aimBox.x = k.x;
        aimBox.z = k.z;
        aimBox.y = k.y;
        aimBox.holdingEgg = true;
        aimBox.size = size;
        kit.aim = aimBox;
      } else kit.aim = null;
      return kit;
    },
    throwAim: (): ThrowAim => c.dig().throwAim(),
  };

  return {
    m4: {
      animals: createP2Animals(animals),
      live: () => ({ netSwingTicks: live.netSwingTicks, carryHoldTicks: live.carryHoldTicks, coopCountMax: live.coopCountMax, coopMax: live.coopMax, kitEggMax: live.kitEggMax }),
      coopMenu: (id) => {
        if (menu.isOpen() || !menu.open(id)) return; // もう ひらいて いれば そのまま（ZL を 押しなおしても ページは もどらない）
        view.tick();
        ui.syncMenu();
      },
    },
    port,
    menuInfo: () => menu.info(),
    menuOpen: () => menu.isOpen(),
    menuPress(button, id) {
      // 画面の ボタンと 同じ（ページの 名前に 直して 核に わたす）。hover は えらびを うごかす だけ
      if (button === 'hover') menu.focus(id === undefined ? null : `card:${id}`);
      else menu.input('pad2', button === 'card' ? `card:${id ?? -1}` : button);
      ui.syncMenu();
    },
    pad(action) {
      if (!menu.isOpen()) return;
      const cmd = invPadCommand(action);
      if (cmd === null) return;
      if (cmd === 'press') {
        const n = ui.padFocus();
        if (n !== null && menu.input('pad2', n)) view.tick();
      } else if (cmd === 'close') {
        if (menu.back('pad2')) view.tick();
      } else {
        ui.padMove(cmd);
        menu.focus(ui.padFocus());
      }
      ui.syncMenu();
    },
    step() {
      const dig = c.dig();
      const t = dig.animalTarget();
      animals.setTargeted(t, 2);
      menu.step();
      // 1P の パネルと 同じ 決まり（「ヒントを 出す」設定の とき・ねらった 子が 大人の なかま）
      const nat: NatsukiView | null = t !== null && deps.hintSettings.actionHint && c.playing() ? animals.natsukiView(t) : null;
      ui.step(c.playing() ? dig.carryProgress() : 0, nat, animals.meatSay(2));
    },
    down: () => p2AnimalsDown({ animals: { dropCarried: (spot) => animals.dropCarried(spot, 2) }, menu, feet }),
    leave: () => p2AnimalsLeave({ animals: { leave: (at) => animals.leave(2, at) }, menu, feet }),
    dispose() {
      menu.quit();
      shared.pickMux(2)(null); // 2P の ▼ を 消す
      animals.setTargeted(null, 2);
      ui.dispose();
    },
  };
}
