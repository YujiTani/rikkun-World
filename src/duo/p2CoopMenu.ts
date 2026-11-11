// COOP-1 5c（仕様 1.16 §3.7 (d)・AC138・AC158）: 2P の とりごやの メニュー係。DOM を 持たない 小さな 核。
import type { Vec3 } from '../contracts';
import { CoopMenuModel, coopMenuReach, type CoopMenuDeps, type CoopMenuInfo } from '../ui/coopMenuModel';
import { coopPadBack, coopPadFocus, coopPadPress } from '../ui/coopMenuPad';

/** 入力の 出どころ。2P の メニューを 押せるのは 'pad2'（2P の パッド）だけ */
export type CoopMenuSrc = 'pad2' | 'mouse1' | 'key1';

export interface P2CoopMenuDeps {
  /** 小屋の 中身（meatList・eggs・busy・exists・collect・startMeat）。2P の 人に 入る 先は 呼ぶ 側が きめる */
  base: Omit<CoopMenuDeps, 'inReach' | 'onOpen' | 'onClose'>;
  /** 小屋の まん中の マス。小屋が 消えたら null */
  coopPos(coop: number): { x: number; z: number } | null;
  /** 2P の 場所。いなければ null */
  pos(): Vec3 | null;
  /** とどく 距離（マス。設定 coopMenuReach） */
  reach: number;
  /** 倒れて いない */
  alive(): boolean;
  /** 2P の パッドが つながって いる */
  padOn(): boolean;
  onOpen?(): void;
  onClose?(): void;
}

export interface P2CoopMenu {
  /** 画面（ui/coopMenu.ts）が 読む モデル。ひらく・押す・とじる は この 核を 通す */
  readonly model: CoopMenuModel;
  open(coop: number): boolean;
  isOpen(): boolean;
  info(): CoopMenuInfo;
  /** A: 名前（coopPadNames）を 押す。'pad2' だけ */
  input(src: CoopMenuSrc, name: string): boolean;
  /** B。'pad2' だけ */
  back(src: CoopMenuSrc): boolean;
  /** えらびが うごいた（頭の ▼） */
  focus(name: string | null): void;
  /** 世界に ▼ を 出す 子 */
  pick(): number | null;
  /** 画面を 作りなおす 目印 */
  version(): number;
  /** 毎ステップ: 遠い・小屋が 消えた・倒れた・パッドが ぬけた で とじる */
  step(): void;
  quit(): void;
}

/**
 * 1P の `coopModal`・世界を 止める 錠は 使わない（その 口が `P2CoopMenuDeps` に 無い）。1P の `CoopMenuModel` とは 別の 物。
 * reach の 判定は `CoopMenuModel.inReach` の 1 本（open も step も ここを 通る）。
 */
export function createP2CoopMenu(d: P2CoopMenuDeps): P2CoopMenu {
  const reachOk = (coop: number): boolean => {
    const p = d.pos();
    const c = d.coopPos(coop);
    return p !== null && c !== null && coopMenuReach(c, p.x, p.z, d.reach);
  };
  const model = new CoopMenuModel({
    ...d.base,
    inReach: reachOk,
    onOpen: () => d.onOpen?.(),
    onClose: () => d.onClose?.(),
  });
  const usable = (): boolean => d.padOn() && d.alive();
  return {
    model,
    open(coop) {
      if (!usable() || !reachOk(coop)) return false;
      return model.open(coop);
    },
    isOpen: () => model.info().open,
    info: () => model.info(),
    input(src, name) {
      if (src !== 'pad2' || !model.info().open) return false;
      coopPadPress(model, name);
      return true;
    },
    back(src) {
      if (src !== 'pad2' || !model.info().open) return false;
      coopPadBack(model);
      return true;
    },
    focus: (name) => coopPadFocus(model, name),
    pick: () => model.pick(),
    version: () => model.version,
    step() {
      if (!model.info().open) return;
      if (!usable()) model.close();
      else model.update();
    },
    quit: () => model.close(),
  };
}

/** 2P が 倒れた ステップに 1 回: だっこ中の 羽を 足もとに おろし、メニューを とじる */
export function p2AnimalsDown(d: { animals: { dropCarried(spot: Vec3): unknown }; menu: P2CoopMenu; feet(): Vec3 }): void {
  d.animals.dropCarried(d.feet());
  d.menu.quit();
}

/** 2P が やめた ステップ（保存の 前）に 1 回: 2P の だっこ・むし・おにくを かたづけ、メニューを とじる */
export function p2AnimalsLeave(d: { animals: { leave(at: Vec3): unknown }; menu: P2CoopMenu; feet(): Vec3 }): void {
  d.animals.leave(d.feet());
  d.menu.quit();
}
