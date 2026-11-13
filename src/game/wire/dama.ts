// ようかいダマ（TOWN-1 1A）の つなぎ: 係を 作る・妖怪／がしゃどくろ／実績から わたす・保存・テストの 窓口。
import type { AchievementSystem } from '../../achievements/AchievementSystem';
import type { Inventory, ItemStack, Vec3 } from '../../contracts';
import { DamaService, type LegacyAch } from '../../dama/dama';
import { DAMA } from '../../dama/damaTuning';
import { ACHIEVEMENT_DEFS } from '../../achievements/defs';

interface DamaWireDeps {
  seed: number;
  /** 1P の もちもの・足もと */
  inventory: Inventory;
  playerPos: () => Vec3;
  /** 仲間（2P）。参加して いなければ null（わたさない） */
  mate: () => { position: Vec3; inventory: Inventory } | null;
  /** 足もとに 落とす（DropField.scatter） */
  scatter: (at: Vec3, stacks: readonly ItemStack[]) => void;
}

/** 係を 作る。人ごとの もちものと 足もとを つなぐ（1P と 2P は who だけが ちがう） */
export function createDamaService(d: DamaWireDeps): DamaService {
  return new DamaService(
    {
      inventory: (who) => (who === 1 ? d.inventory : (d.mate()?.inventory ?? null)),
      dropAtFeet: (who, count) => {
        const at = who === 1 ? d.playerPos() : d.mate()?.position;
        if (at) d.scatter({ x: at.x, y: at.y, z: at.z }, [{ item: 'yokai_orb', count }]);
      },
    },
    d.seed,
  );
}

/** 前の セーブで とって ある 実績の 行（あずかりの 計算）。しずかに とる 実績は quiet */
export function legacyList(sys: Pick<AchievementSystem, 'list'>): LegacyAch[] {
  const quiet = new Map(ACHIEVEMENT_DEFS.map((a) => [a.id, DAMA.quietStats.includes(a.stat)]));
  return sys.list().map((a) => ({ id: a.id, medal: a.medal, unlocked: a.unlocked, quiet: quiet.get(a.id) ?? false }));
}

/** `window.__rikkun.dama`（TOWN-1 §6.1）。p ＝ 1 | 2 */
export function createDamaHook(svc: DamaService) {
  return {
    /** その 人の もちものの ようかいダマの 合計（2P が いなければ null） */
    count: (p: 1 | 2): number | null => (p === 2 && !svc.joined(2) ? null : svc.count(p)),
    /** テストの 準備: n こ わたす（入らない 分は 足もとへ） */
    give: (p: 1 | 2, n: number) => svc.give(p, n),
    /** 前の セーブの あずかり（ない ときは null） */
    legacy: () => svc.legacy(),
  };
}
