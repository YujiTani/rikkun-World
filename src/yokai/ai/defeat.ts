import type { Inventory, ItemId, ItemStack, Vec3, W2Settings } from '../../contracts';
import { isSamuraiGear } from '../../craft/SamuraiBook';
import { samuraiSelectable } from '../../craft/samuraiDrop';
import { pickNushiDrop, rollPower } from '../../legend/defs';
import type { Rng } from '../../world/gen/random';
import type { StaggerBook } from '../stagger';
import { KIND_TRAITS } from '../traits';
import { YOKAI_DROPS } from './config';
import type { Ent } from './entity';
import type { YokaiEvents } from './events';
import type { YokaiManagerOptions } from './managerTypes';

interface DefeatDeps {
  /** ドロップを 地面に ばらまく窓口（なければ そのまま持ち物に入れる） */
  drops: { scatter(position: Vec3, stacks: ItemStack[], opts?: { kind?: 'death' | 'yokai' }): number } | undefined;
  inventory: Pick<Inventory, 'add'>;
  stag: Pick<StaggerBook, 'remove'>;
  events: Pick<YokaiEvents, 'emit' | 'tick'>;
  /** onDefeat・harapan・samurai・onLegendDrop を 呼ぶときに 読む（つなぎ込みが あとから 書きかえても 効く） */
  opts: Pick<YokaiManagerOptions, 'onDefeat' | 'harapan' | 'samurai' | 'onLegendDrop'>;
  rng: Rng;
  nushiRng: Rng;
  settings: W2Settings;
}

/**
 * たおす係: 経験値・ドロップ（ふつうの表・はらぱんみみず・ヌシのレジェンダリー）と、たおれた出来事。
 * 乱数を引く順番は、ふつうの表 → はらぱんみみず → ヌシの表。
 */
export class YokaiDefeat {
  constructor(private readonly d: DefeatDeps) {}

  /** byPlayer が false（落下など）なら、ドロップも経験値もなし */
  defeat(e: Ent, byPlayer = true): void {
    const { d } = this;
    d.stag.remove(e.id);
    e.state = 'dying';
    e.model.die();
    if (byPlayer) d.opts.onDefeat?.(e.kind, { xp: e.xp, title: e.title, m: e.m });
    // 水の 中の 妖怪の ドロップは 水にういて ひろいにくいので、たおした ときに そのまま 持ち物に 入る（子どもが 追いかけなくていい）
    const direct = KIND_TRAITS[e.kind].swims;
    let total = 0;
    // 二つ名は 表を引く回数がふえる（おやぶん 2・たいしょう 3・ヌシ 4）
    for (let roll = 0; roll < (byPlayer ? e.dropRolls : 0); roll++) {
      for (const row of YOKAI_DROPS[e.kind]) {
        if (d.rng() >= row.chance) continue;
        const count = 1 + Math.floor(d.rng() * row.max);
        const left = d.drops && !direct
          ? count - d.drops.scatter({ x: e.x, y: e.y, z: e.z }, [{ item: row.item, count }], { kind: 'yokai' })
          : d.inventory.add(row.item, count);
        const added = count - left;
        total += added;
        d.events.emit({ type: 'drop', tick: d.events.tick(), id: e.id, kind: e.kind, item: row.item, count, added }, true);
      }
    }
    // GOLD-1 §4.7: はらぱんみみず（地下 の 妖怪 だけ。べつ の 乱数 の 流れ）
    if (byPlayer && d.opts.harapan?.(e.y)) {
      const at = { x: e.x, y: e.y, z: e.z };
      const left = d.drops ? 1 - d.drops.scatter(at, [{ item: 'harapan_mimizu', count: 1 }], { kind: 'yokai' }) : d.inventory.add('harapan_mimizu', 1);
      d.events.emit({ type: 'drop', tick: d.events.tick(), id: e.id, kind: e.kind, item: 'harapan_mimizu', count: 1, added: 1 - left }, true);
    }
    if (byPlayer && e.title === 'nushi') this.dropLegendary(e);
    d.events.emit({
      type: 'defeat',
      tick: d.events.tick(),
      id: e.id,
      kind: e.kind,
      position: { x: e.x, y: e.y, z: e.z },
      reward: total,
      title: e.title,
    });
  }

  /**
   * WEAPON-7 §2.3: ヌシを プレイヤーが たおした → 今の ドロップの あとに、ヌシの 表（設定 `nushiDrops`）から かならず 1 本。
   * weight で ランダム（持っている か・前に 何が 出たかは 見ない）。表が 空なら 何も 出さない
   */
  private dropLegendary(e: Ent): void {
    const { d } = this;
    const sm = d.opts.samurai?.() ?? { book: [], have: [] };
    const item: ItemId | null = pickNushiDrop(d.settings.nushiDrops, d.nushiRng, samuraiSelectable(sm.book, sm.have));
    if (item === null) return;
    const at = { x: e.x, y: e.y, z: e.z };
    // WEAPON-9 §5.1: 虹は 落ちる たびに 強さ 4〜10（1 本ごと。表の 乱数と 同じ 列から 1 つ）
    // SAMURAI-1: 侍装備に 強さの くじは 使わない（rollPower は 虹だけ）
    const power = isSamuraiGear(item) ? undefined : (rollPower(d.settings, item, d.nushiRng) ?? undefined);
    const left = d.drops ? 1 - d.drops.scatter(at, [{ item, count: 1, ...(power ? { power } : {}) }], { kind: 'yokai' }) : d.inventory.add(item, 1, { power });
    d.events.emit({ type: 'drop', tick: d.events.tick(), id: e.id, kind: e.kind, item, count: 1, added: 1 - left }, true);
    d.opts.onLegendDrop?.({ item, yokaiId: e.id, kind: e.kind, position: at });
  }
}
