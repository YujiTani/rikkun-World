import type { ArmorSlot, BladeTech, ItemId, Vec3, VoxelWorld, W2Settings, YokaiWorld } from '../contracts';
import { tekkoBladeMulOf } from '../craft/samuraiPower';
import type { ImpactLevel } from '../fx/impact';
import { createLegendSystem, type LegendEvent, type LegendLoopHandle, type LegendLoopName, type LegendSoundName, type LegendStepCtx, type LegendSystem } from '../legend/LegendSystem';
import { legendMoveMulOf } from '../legend/defs';
import { feedLegendImpact, newLegendImpactState } from '../legend/legendImpact';
import { createWaveSystem, type WaveSystem, type WaveView3D } from '../legend/WaveSystem';
import { bindWho } from './credit';

/**
 * COOP-1 4d-2（docs/design/COOP-1.md 1.13 §3.6 (b)・§8・§10、AC103〜AC105）: 2P の レジェンダリーの わざ（雷神剣・風神剣・虹の 刀の ため → 雷・真空波・らせん・シャイニング）。
 * 1P と **同じ 部品**（`createLegendSystem`・`createWaveSystem`）を もう 1 つ 作って 2P の 入力・そうび・カメラに つなぐ（式の コピーなし）。three・DOM を 使わない。
 * テストは p2Legend.test.ts（約束は 頭に 書いて ある）。ほる・ふりわけ（ZR だけ → ため、run＋ZR → パリィ）は 1P と 同じ DigSystemImpl が 決める。
 */

/** 2P の 刀の 今の ようす（真空波の 出し方に 使う。2P の blade.state() から） */
export interface P2BladeNow {
  item: ItemId | null;
  tech: BladeTech | null;
  phase: string;
  frame: number;
  startup: number;
  dirDeg: number;
}

export interface P2LegendDeps {
  world: VoxelWorld;
  /** **素の** 妖怪の 世界。中で `bindWho(…, 2)` して 使う → わざの damage は 6 番目の 引数 who=2（倒した けいけんちは 2P） */
  yokai: () => YokaiWorld;
  settings: Pick<W2Settings, 'legendary' | 'legendaryChargeWalk' | 'shiningCamDistance'>;
  tick: () => number;
  /** 2P の そうび（手甲の 倍率 = `tekkoBladeMulOf`。1P の combat.ts と 同じ 部品） */
  armor: { equipped(slot: ArmorSlot): ItemId | null };
  /** 雷・ドーム・らせんが 1 体 以上に 当たった（1P の onWear・onSpiralHit と 同じ 数え方）。2P の 手の 刀を へらす */
  wear: (n: number) => void;
  /** 2P の カメラの 口（4d-1 の パリィの よせと 同じ 口を 取りあう。書き方は step の 説明） */
  camFx: { setDistance(d: number | null): void };
  /** 2P の 手ごたえの 口（shared.impactFor(2)） */
  impact: { hit(level: ImpactLevel): void };
  /** 2P の カメラの ふだんの きょり（シャイニングの もどり先。DUO_TUNING.cameraSplit） */
  baseDistance: () => number;
  /** 2P の 足もと（らせんは ここ + y 1.4 から とぶ。1P の launchSpiral と 同じ 高さ） */
  position: () => Vec3;
  /** 2P の カメラ（真空波の 絵の 向き face は これで きまる。1P の game.camera ではない） */
  view?: () => WaveView3D | null;
  sound?: (name: LegendSoundName) => void;
  /** 真空波の 「ヒュオッ」 */
  waveSound?: (variant: number) => void;
  /** 続く 音（ため・ため続け・ドーム吸い）。止める 手は 中で おぼえる */
  loop?: (name: LegendLoopName) => LegendLoopHandle | void;
  /** らせんの かぜの 音 */
  spiralSound?: () => LegendLoopHandle | void;
  reducedMotion?: () => boolean;
  seed?: number;
}

export interface P2Legend {
  /** 2P の わざの しくみ（`createLegendSystem` の 2 つ目）。2P の DigSystem（m4.legend）に わたす */
  readonly legend: LegendSystem;
  /** 2P の 波（真空波・らせん。who: 2） */
  readonly waves: WaveSystem;
  /**
   * 毎ステップ 1 回（2P の dig.update の あと）。波を すすめ → わざの 出来事を 取り出して 手ごたえに 流し → カメラの 口を 書く。取り出した 出来事を 返す（絵が 読む。次の step まで 有効）。
   * カメラの 口: 4d-1 の パリィの よせ〈createParryZoom.step〉の **あとに** 呼ぶ。わざは 値が ある 間と、なくなった 最初の 1 ステップ（null）だけ 書く。
   * それ 以外は 呼ばない（毎ステップ null を 書くと パリィの よせを 消す）。1P の step.ts の「わざ → よせ → ふだん」と 同じ 優先
   */
  step(b: P2BladeNow): readonly LegendEvent[];
  /** 2P の PlayerCombatImpl に わたす 口（シャイニング中の 受ける ダメージの 倍率・落下なし） */
  readonly combat: { takenMul(): number; noFall(): boolean };
  /** シャイニング中 true（2P の もちもの画面・持ちかえの 止めに 使う） */
  locked(): boolean;
  /** 2P が やめた とき（Live を 捨てる 前に 1 回）。ため・シャイニング中でも すぐ 消す。2 回 呼んでも こわれない */
  dispose(): void;
}

/** 2P の 歩く 倍率: パリィ × わざ（ため中の 歩き・足どめ）× 手に 持つ 物の 速さ（風神剣 1.2 倍。1P の step.ts と 同じ `legendMoveMulOf`） */
export function p2SpeedMul(parryMul: number, legendMul: number, settings: Pick<W2Settings, 'legendary'>, held: ItemId | null): number {
  return parryMul * legendMul * legendMoveMulOf(settings, held);
}

const NONE: readonly LegendEvent[] = [];

export function createP2Legend(d: P2LegendDeps): P2Legend {
  let disposed = false;
  /** 妖怪の 世界は 差しかわる こと が ある ので、もとの 物が かわったら 包みなおす */
  let rawY: YokaiWorld | null = null;
  let boundY: YokaiWorld | null = null;
  const yokai = (): YokaiWorld => {
    const raw = d.yokai();
    if (raw !== rawY || !boundY) {
      rawY = raw;
      boundY = bindWho(raw, 2);
    }
    return boundY;
  };
  const armorMul = (item: ItemId | null): number => tekkoBladeMulOf(d.armor, item);

  // dispose が 止める 音の 手（ため・ドーム吸いは 名前ごとに 最後の 1 つ。らせんの 音は 最後の 1 つ）
  const loops = new Map<LegendLoopName, LegendLoopHandle>();
  let spiralHandle: LegendLoopHandle | null = null;

  const body: Vec3 = { x: 0, y: 0, z: 0 };
  const bodyNow = (): Vec3 => {
    const p = d.position();
    body.x = p.x;
    body.y = p.y + 1.4;
    body.z = p.z;
    return body;
  };

  const waves = createWaveSystem({
    world: d.world,
    yokai,
    settings: d.settings,
    tick: d.tick,
    emit: (e) => legend.emit(e),
    sound: d.waveSound,
    spiralSound: d.spiralSound
      ? () => {
          const h = d.spiralSound!();
          spiralHandle = h || null;
          return h;
        }
      : undefined,
    onSpiralHit: () => d.wear(1),
    powerMul: armorMul,
    reducedMotion: d.reducedMotion,
    view: d.view,
    seed: d.seed,
    who: 2,
  });

  const legend: LegendSystem = createLegendSystem({
    world: d.world,
    yokai,
    settings: d.settings,
    tick: d.tick,
    onWear: () => d.wear(1),
    sound: d.sound,
    loop: d.loop
      ? (name) => {
          const h = d.loop!(name);
          if (h) loops.set(name, h);
          else loops.delete(name);
          return h;
        }
      : undefined,
    // らせんの かぜは F6 に 2P の 足もと + 1.4 から（1P の launchSpiral と 同じ 高さ）
    launchSpiral: (a) => waves.launchSpiral({ item: a.item, dirDeg: a.dirDeg, body: bodyNow() }),
    powerMul: armorMul,
    seed: d.seed,
    baseDistance: d.baseDistance,
  });

  const impactState = newLegendImpactState();
  /** カメラの 口に 値を 書いた 後で、まだ null を 書いて いない */
  let camWrote = false;

  const idle: LegendStepCtx = {
    item: null,
    power: null,
    active: false,
    pressed: false,
    held: false,
    startOk: false,
    bladeBusy: false,
    bladeAccepts: false,
    bladeChainOpen: false,
    eye: { x: 0, y: 0, z: 0 },
    dir: { x: 0, y: 0, z: -1 },
    position: { x: 0, y: 0, z: 0 },
    yawDeg: 0,
    inWater: false,
    onGround: true,
  };

  return {
    legend,
    waves,
    step(b) {
      if (disposed) return NONE;
      waves.step({ item: b.item, tech: b.tech, phase: b.phase, frame: b.frame, startup: b.startup, dirDeg: b.dirDeg, body: bodyNow() });
      const evs = legend.drainEvents();
      feedLegendImpact(d.impact, evs, impactState);
      const cd = legend.camDistance();
      if (cd !== null) {
        d.camFx.setDistance(cd);
        camWrote = true;
      } else if (camWrote) {
        d.camFx.setDistance(null);
        camWrote = false;
      }
      return evs;
    },
    combat: {
      takenMul: () => (disposed ? 1 : legend.takenMul()),
      noFall: () => !disposed && legend.noFall(),
    },
    locked: () => !disposed && legend.locked(),
    dispose() {
      if (disposed) return;
      // 持ちかえ・倒れた と 同じ あとしまつ。落下ダメージなしは 着地の 判定を 1 ステップ あとに 見る ので 2 回
      const p = d.position();
      idle.position.x = p.x;
      idle.position.y = p.y;
      idle.position.z = p.z;
      legend.step(idle);
      legend.step(idle);
      legend.drainEvents();
      for (const h of loops.values()) h.stop(0.1);
      loops.clear();
      spiralHandle?.stop(0.1);
      spiralHandle = null;
      waves.clear();
      d.camFx.setDistance(null);
      camWrote = false;
      disposed = true;
    },
  };
}
