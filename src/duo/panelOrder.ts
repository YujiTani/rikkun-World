// COOP-1 4c（docs/design/COOP-1.md §3.3「同じ ステップは 1P が 先」・§8 の 4c の 宿題 3・AC93・AC94）: たんす・かまどの 中身に かける 操作の 順番。DOM を 使わない。
// パネルの 操作〔1P・2P の パッドと キー〕は ぜんぶ ここへ あずけ、flush を 1 ステップに 1 回（入力を 読んだ あと・FurnaceWorld／StorageSystem の update の 前）。
// 1P の マウスは すぐ 実行（ステップの あいだに 来るので どちらでも 1P が 先）。

type Op = () => void;

/** 1P の パッドの けっていを PanelOrder へ あずけるか。あずけるのは「2 人で あそび中・ゲームの 更新が 回って いる（flush が 走る）・もちものの 画面」の ときだけ。ポーズ・せってい・本などの メニューは すぐ やる（flush が 走らない ため） */
export function panelOpDeferred(joined: boolean, updating: boolean, menuRootId: string): boolean {
  return joined && updating && menuRootId === 'inventory-screen';
}

export class PanelOrder {
  private p1: Op[] = [];
  private p2: Op[] = [];

  /** その ステップに やる 操作を 預かる（すぐには やらない） */
  submit(who: 1 | 2, op: Op): void {
    (who === 1 ? this.p1 : this.p2).push(op);
  }

  /** 1 ステップに 1 回。1P の 物ぜんぶ → 2P の 物ぜんぶ の 順に（同じ 人の 中は 預けた 順）。やった 数を 返す。操作の 中で 預けた 物は 次の flush で */
  flush(): number {
    const a = this.p1;
    const b = this.p2;
    if (a.length === 0 && b.length === 0) return 0;
    this.p1 = []; // 操作が なにか あった ステップだけ 作る（なければ 上で かえる）
    this.p2 = [];
    for (const op of a) op();
    for (const op of b) op();
    return a.length + b.length;
  }
}
