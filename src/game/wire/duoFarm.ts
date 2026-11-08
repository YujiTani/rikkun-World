// COOP-1 5a（docs/design/COOP-1.md §3.7）: 2P の 畑を つなぐ。中身は duo/p2Farm.ts（口）と ui/duoFarmHud.ts（半分の 絵）。
// duoPlay.ts には この 1 か所だけ つなぐ（5b が m4 の 行を さわる ので 5a の 行は ここに まとめる）。
import type { BlockId, DigVitalsPort, FarmAim, FarmHintKind, Vec3 } from '../../contracts';
import { VEG_ITEM, cropKindOfBlock } from '../../contracts';
import { createP2Farm, type P2Farm } from '../../duo/p2Farm';
import type { InventoryImpl } from '../../inventory/Inventory';
import { DuoFarmHud } from '../../ui/duoFarmHud';
import type { WiredLoop } from './save';

export interface DuoFarmCtx {
  deps: WiredLoop;
  /** 2P の もちもの */
  inventory: InventoryImpl;
  /** 2P の ハート（2P の combat） */
  vitals: DigVitalsPort;
  /** 2P の ねらい（`dig.target()`。あとから 作る ほる係を 関数で 包む） */
  target: () => { block: Vec3; id: BlockId } | null;
  /** 2P の 入力が 通る か（もちもの画面が 開いていない・倒れていない）。しるしを 出して よい とき */
  playing: () => boolean;
}

export interface DuoFarm {
  /** 2P の ほる係の m4 に 広げる */
  m4: P2Farm['m4'];
  /** 合図の チップ（`FarmFx.hintFor(2)` の 行き先） */
  hint: { show(kind: FarmHintKind): void };
  /** `duo.farmHint(2)`: 出ている 合図 */
  hintKind(): FarmHintKind | null;
  /** `duo.farmAim(2)`: 2P の ねらいの しるしの 中身 */
  aim(): FarmAim | null;
  /** 毎ステップ（2P の ほる係の 更新の あと） */
  step(): void;
  /** やめる とき: 半分の チップ・しるしを 取りのぞく */
  dispose(): void;
}

export function wireDuoFarm(c: DuoFarmCtx): DuoFarm {
  const { deps } = c;
  const p2 = createP2Farm({
    farm: deps.farm,
    pet: deps.pet,
    world: deps.world,
    inventory: c.inventory,
    vitals: c.vitals,
    settings: deps.m7,
    tick: () => deps.game.tick,
    live: () => deps.live,
    aimed: () => c.target()?.block ?? null,
  });
  const hud = new DuoFarmHud(deps.hud);
  return {
    m4: p2.m4,
    hint: hud,
    hintKind: () => hud.hint.model.current(),
    aim: () => p2.aim(),
    step() {
      // 1P の しるしと 同じ 決まり（「ヒントを 出す」設定の とき）。名前は 作物の 名前、はたけなら「はたけ」
      const a = deps.hintSettings.actionHint && c.playing() ? p2.aim() : null;
      const t = a ? c.target() : null;
      const ck = t ? cropKindOfBlock(t.id) : null;
      hud.step(a, ck ? deps.nameOf(VEG_ITEM[ck.kind]) : a ? 'はたけ' : '');
    },
    dispose: () => hud.dispose(),
  };
}
