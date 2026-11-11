// COOP-1 5c: 2P の にわとり（wire/duoAnimals.ts）が、他の 係（出来事の 配り・こたつの わく・着地点の 丸）に 見せる 口。型だけ。
import type { AnimalEvent, ThrowAim } from '../contracts';

export interface P2AnimalsPort {
  /** 出来事を 1 回 取り出した ときに 流す（2P の 合図の チップ・なつきの パネルの 動き。`by: 2` の 物だけ 拾う） */
  feed(events: readonly AnimalEvent[]): void;
  /** 2P の こたつの 天板の わくの もと（目の 水平位置・ねらい。`KitIconCtx.eye2`・`aim2`） */
  kitAim(): { eye: { x: number; z: number }; aim: { x: number; z: number; holdingEgg: boolean; y: number; size: 1 | 2 } | null };
  /** 2P の なげる ねらい（着地点の 丸 `animals.throwSpot(aim, 2)` に わたす） */
  throwAim(): ThrowAim;
}
