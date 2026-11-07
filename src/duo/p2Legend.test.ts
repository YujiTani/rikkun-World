import { describe, expect, it } from 'vitest';
import type { ItemId, Vec3 } from '../contracts';
import { NINJA_TUNING } from '../craft/ninjaTuning';
import { tekkoBladeMulOf } from '../craft/samuraiPower';
import { impactOf } from '../fx/impact';
import { legendDefOf } from '../legend/defs';
import { createWaveSystem } from '../legend/WaveSystem';
import { BLADE_ITEMS } from '../tools/bladeSets';
import { P2CamFx } from './camFx';
import { makeP2Combat } from './p2CombatKit';
import {
  CHARGE_KINDS,
  GROUND8,
  POS,
  S,
  TEKKO_ID,
  chargeAndRelease,
  chargeTicksOf,
  itemByCharge,
  karakasa,
  makeRef,
  wearing,
} from './p2LegendKit';
import { loopSpy, makeP2, type P2Rig } from './p2LegendRig';
import { baseCamDistance, pickLegend } from './rules';
import { DUO_TUNING } from './tuning';

/**
 * COOP-1 4d-2（docs/design/COOP-1.md 1.13 §3.6 (b)・§8・§9.10・§12.0、AC103・AC104・AC105・AC113 の この 子の 部分）の 先行テスト（赤）。
 * 2P の レジェンダリーの わざ（雷神剣・風神剣・虹の 刀の ため → 雷・真空波・らせん・シャイニング）。
 * 「1P と 2P で 同じ」: 2P の わざは 1P と **同じ 部品**（`createLegendSystem`・`createWaveSystem`）を もう 1 つ 作って 使う（式の コピーなし）。
 * このファイルは「2P 用の 組み立て」を 見る。1P と くらべる ときの 相手は makeRef（p2LegendKit.ts。createLegendSystem に 同じ 設定・同じ 入力）。
 *
 * ---- 実装への 約束（新しい ファイル src/duo/p2Legend.ts。three・DOM を 使わない）----
 *   createP2Legend(d: P2LegendDeps): P2Legend
 *     P2LegendDeps = {
 *       world: VoxelWorld;                          世界（1P の 部品と 同じ）
 *       yokai: () => YokaiWorld;                    **素の** 妖怪の 世界（shared.yokaiManager）。中で `bindWho(…, 2)` して 使う → 雷・ドーム・真空波・らせんの damage は 6 番目の 引数 who=2
 *       settings: W2Settings;                       1P と 同じ 設定（legendary・legendaryChargeWalk・shiningCamDistance）
 *       tick: () => number;                         game.tick
 *       armor: { equipped(slot: ArmorSlot): ItemId | null };   2P の そうび（p2.armor）。手甲の 倍率は `tekkoBladeMulOf(armor, item)`（powerMul に わたす。1P の combat.ts と 同じ 部品）
 *       wear: (n: number) => void;                  雷・ドーム・らせんが 1 体 以上に 当たった とき（1P の onWear・onSpiralHit と 同じ 数え方）2P の 手の 刀を へらす（p2.inventory.wearHeld）
 *       camFx: { setDistance(d: number | null): void };       2P の カメラの 口（shared.duoCamFx(2)）。4d-1 の パリィの よせ〈createParryZoom〉と **同じ 口を 取りあう**。書き方は 下の「カメラの 口の 優先」
 *       impact: { hit(level: ImpactLevel): void };            2P の 手ごたえの 口（shared.impactFor(2)）
 *       baseDistance: () => number;                 2P の カメラの ふだんの きょり（DUO_TUNING.cameraSplit）。LegendDeps.baseDistance に そのまま わたす
 *       position: () => Vec3;                       2P の 足もと（らせんは ここ + y 1.4 から とぶ。1P の launchSpiral と 同じ）
 *       view?: () => WaveView3D | null;             2P の カメラ（vr.camera2 を 包む `createWaveView3D(camera2)`）。**WaveDeps.view に そのまま わたす** → 2P の 真空波の 絵の 向き face は 2P の view で きまる（1P の game.camera ではない。AC106 前半）
 *       sound?; loop?: (name) => LegendLoopHandle | void;  spiralSound?: () => LegendLoopHandle | void;  reducedMotion?; seed?
 *                                                   loop は LegendDeps.loop・spiralSound は WaveDeps.spiralSound に そのまま。dispose が 止める ために、返された 手は 中で おぼえる
 *     }
 *     P2Legend = {
 *       legend: LegendSystem;       `createLegendSystem` の 2 つ目。2P の DigSystem（m4.legend）に わたす。2P の 雷神剣は これで ためる
 *       waves: WaveSystem;          `createWaveSystem({ who: 2, … })`。出来事は legend.emit に つなぐ（1P と 同じ）。launchSpiral は 中で つなぐ
 *       step(b: P2BladeNow): readonly LegendEvent[];
 *            毎ステップ 1 回（2P の dig.update の あと）。waves.step ＋ legend の 出来事を 取り出して
 *            `feedLegendImpact(impact, events, 状態)`（src/legend/legendImpact.ts。1P と 同じ 部品）に 流す ＋ カメラの 口（下の「カメラの 口の 優先」）。
 *            取り出した 出来事を 返す（2P の 絵〈ThunderFx など〉が 読む。次の step まで 有効）
 *       combat: { takenMul(): number; noFall(): boolean };    2P の PlayerCombatImpl に わたす（legend.takenMul・legend.noFall）
 *       locked(): boolean;          legend.locked()（シャイニング中 true）。2P の もちもの画面・持ちかえの 止めに 使う
 *       dispose(): void;            2P が やめた とき（Live を 捨てる 前に 1 回。§10）: ためている・シャイニング中でも すぐ 消える。
 *                                   ための ループ音〈chargeRise・chargeHold〉・domePull・らせんの 音の 手を 止め（legend を item=null・active=false・onGround=true で 2 回 step して 終わらせ〈落下ダメージなしは 着地の 判定を 1 ステップ あとに 見る ので 2 回〉、
 *                                   かつ おぼえた 手を stop）、waves.clear()、camFx.setDistance(null) の 最後の 1 回。dispose の あとは locked()=false・takenMul=1・noFall=false・waves.list()=[]・
 *                                   legend.state().move/charge=null。2 回 呼んでも こわれない。
 *     }
 *   WaveSystem.clear(): void      （src/legend/WaveSystem.ts に 足す。waveWho.test.ts）全部の 波を 消し、らせんの 音を 止める。出来事〈waveEnd〉は 出さない。
 *
 *   カメラの 口の 優先（4d-1 の パリィの よせ と 同じ 口〈shared.duoCamFx(2).setDistance〉を 取りあう。1P の step.ts:74「わざ ?? よせ ?? ふだん」と 同じ 優先）:
 *     - p2Legend.step は 2P の パリィの よせ〈4d-1 の createParryZoom.step〉を 呼んだ **あと** に 呼ぶ（duoPlay.ts の つなぐ 順。わざが 勝つ）。
 *     - わざは **値が ある 間（legend.camDistance() が null でない ステップ）だけ setDistance(値)**、値が なくなった **最初の 1 ステップだけ setDistance(null)**。
 *       それ以外の ステップ（ためている・ふつうの 刀・わざが ない）は **setDistance を 呼ばない**（毎ステップ null を 書かない → パリィの よせを 消さない）。
 *   1P の 配線の 約束:
 *     - `baseCamDistance(duoCamDistance: number | null): number`（src/duo/rules.ts）= duoCamDistance ?? DUO_TUNING.cameraSolo。1P の LegendDeps.baseDistance（combat.ts）と
 *       camFx1 の baseDistance（player.ts）が **同じ この 関数**を `() => baseCamDistance(shared.duoCamDistance)` で 使う（下の「1P の 配線」）。
 *     - `pickLegend<T>(who: 1 | 2, joined: boolean, one: T, two: T | null): T | null`（src/duo/rules.ts）= who 1 は one、who 2 は joined なら two・いなければ null。
 *       `shared.legendFor(who)`（§8）と `duo.legend(who)` は これで 作る（2P が いなければ null。1P は 今の 物）。
 *   絵（AC106 前半。ThunderFx・RainbowFx は WebGL が 要る ので ユニットでは 見ない → E2E duoLegend.spec.ts〈duo.thunder(2)〉と e2e-perf/duoLegend.perf.ts）:
 *     - src/game/wire/combat.ts の「作り方の 関数」`createLegendFx(o: { scene; camera: THREE.PerspectiveCamera; seed; w2 }): { thunderFx: ThunderFx; rainbowFx: RainbowFx }`
 *       （今 combat.ts に 直接 書いてある `new ThunderFx(…)`・`new RainbowFx(…)` を 関数に する）。1P は game.camera、2P は 2P の 区画の カメラ〈DuoViewRenderer.camera2〉で 2 回目を 作る。
 *       2P の 分は duoPlay.ts の Live に 1 行（`fx: LegendFx`）。2P の 雷神剣の 絵・波の 絵・ための 光は この fx と 2P の カメラで 作る（板は 2P の カメラを 向く）。
 *     - 2P の ふつうの 虹の 刀の 斬撃〈ui.ts の rainbowFx.queue・hit・cancel〉も 2P の 刀の 出来事から 2P 用の rainbowFx へ（1P の rainbowFx には 入れない）。
 *     - 2 人の ときは 全面の 光の 道を 通らない（4d-0）ので、雷の 板〈ThunderFx の fxScene〉は 今 どこにも 描かれない。決め（実コードを 読んだ）:
 *         `ThunderFx.renderInPane(renderer: WebGLRenderer, camera: Camera): void` を 足す（世界を 絵に しない・うつす 板を 使わない・深さの 書きもどしを しない。fxScene だけを
 *         いまの 区画の 描き先に 重ねる。深さは その 区画の 深さバッファを そのまま 使う〈やわらかい 深さは なし〉。active() が false の ときは 何も 描かない）。
 *         `DuoViewRenderer`（src/duo/viewRender.ts）の コンストラクターに 5 つ目の `afterPane: (cam: THREE.Camera) => void` を 足し、各区画の `r.render(this.scene, cam)` の **すぐ あと**
 *         （同じ viewport・scissor の 中）に 呼ぶ。wire/duo.ts が 1P の thunderFx と 2P の thunderFx の 両方の renderInPane をそこで 呼ぶ
 *         （雷は 世界の 中に 出て 両方の 半分から 見える。板の 向きは 出した 人の カメラ）。虹の 斬撃の 板は 世界の scene の 中に あるので 区画の 描画で そのまま 出る
 *         〈虹の 発光の ブルームは 全面の 光の 道の 物なので 2 人の ときは 使わず、うすい 光 duo-flash が かわり〉。
 *     - 試験の 口 `duo.thunder(who): ThunderHook | null`（`thunderFx.hook({ renderer, camera })` の 2P 版。2P が いなければ who 2 は null）。
 *   入力の ふりわけ（パリィ・ため・ふつうの 刀）: 2P も 1P と **同じ** DigSystemImpl・digInput.ts（`routeAttackInput`）を 使う ので 新しく 書かない。`LegendStepCtx.startOk` も 同じ 部品が 決める。
 *     後から マージする 方（4d-1 か 4d-2）が src/duo/p2Dig.test.ts に 1 本 足す: 「刀〈雷神剣〉を 持って ZR だけ → ため。run ＋ ZR → パリィで ためは 始まらない
 *     （legend.state().charge が null のまま）」。duo.ts の 2P の ホットバー操作の **あとに** `selLock.step(p2legend.locked(), p2.inventory)` を 呼ぶ 順（legendLock.test.ts）。
 *     P2BladeNow = { item: ItemId | null; tech: BladeTech | null; phase: string; frame: number; startup: number; dirDeg: number }   （2P の blade.state() から。真空波〈風神剣の ふつうの わざ〉用）
 *   入力の ふりわけ（パリィ・ため・ふつうの 刀）は 4d-1 と 重なる つなぎ目: `LegendStepCtx.startOk` は 呼ぶ 側（2P の DigSystem の digInput）が 決める。このファイルは 見ない。
 *   p2CombatKit.ts の makeP2Combat は `ports?: { takenMul?; noFall? }` を 足した（PlayerCombatImpl の 既存の 口）。
 *
 * 足りない 口（報告に 書いた）: LegendDeps.baseDistance（src/legend/baseDistance.test.ts）・WaveDeps.who と WaveView.who（waveWho.test.ts）・feedLegendImpact（legendImpact.test.ts）。
 */

const FORWARD3: Vec3 = { x: POS.x, y: POS.y, z: POS.z - 3 };

/** p2 と ref を 同じ 入力で 1 ステップずつ 進め、毎ステップ 一致を 確かめる */
function lockstep(kind: (typeof CHARGE_KINDS)[number], opts: { arms?: ItemId | null; list?: () => ReturnType<typeof karakasa>[] } = {}) {
  const item = itemByCharge(kind);
  const list = () => opts.list?.() ?? [karakasa(1, GROUND8), karakasa(2, { x: POS.x + 2, y: POS.y, z: POS.z })];
  const a = makeP2({ item, list: list(), arms: opts.arms });
  const b = makeRef({ item, list: list(), arms: opts.arms });
  const mism: string[] = [];
  let n = 0;
  const step = (c: Parameters<P2Rig['step']>[0] = {}) => {
    n += 1;
    const ra = a.step(c);
    const rb = b.step(c);
    if (JSON.stringify(ra.r) !== JSON.stringify(rb)) mism.push(`${n}: step の 返り値`);
    if (JSON.stringify(a.p2.legend.state()) !== JSON.stringify(b.sys.state())) mism.push(`${n}: state()`);
    if (JSON.stringify(a.p2.legend.motion()) !== JSON.stringify(b.sys.motion())) mism.push(`${n}: motion()`);
    if (a.p2.legend.locked() !== b.sys.locked()) mism.push(`${n}: locked()`);
  };
  return { a, b, step, mism, item };
}

describe('AC103: 2P の わざは 1P と 同じ 流れ・同じ ための 長さ（同じ 部品）', () => {
  it.each(CHARGE_KINDS)('%s: ためる → はなす → わざが おわる まで、state()・motion()・locked() が 1P の 部品と ステップごとに 同じ', (kind) => {
    const t = lockstep(kind);
    const ticks = chargeTicksOf(t.item);
    chargeAndRelease(t.step, ticks, 330);
    expect(t.mism).toEqual([]);
    // 本当に わざが 出た（空回りで 一致して いるのでは ない）
    expect(t.a.p2.legend.peekEvents().map((e) => e.type)).toContain('chargeReady');
    expect(t.a.p2.legend.peekEvents().map((e) => e.type)).toContain(kind === 'lightning' ? 'lightningStrike' : kind === 'spiral' ? 'spiralStart' : 'shiningStart');
  });

  it.each(CHARGE_KINDS)('%s: ための 長さは 設定の chargeTicks（ためF が chargeTicks で ready。1 つ 手前では まだ）', (kind) => {
    const item = itemByCharge(kind);
    const ticks = chargeTicksOf(item);
    const t = makeP2({ item });
    t.step({ pressed: true, held: true });
    for (let i = 1; i < ticks - 1; i++) t.step({ held: true });
    expect(t.p2.legend.state().charge).toEqual({ ticks: ticks - 1, ready: false });
    t.step({ held: true });
    expect(t.p2.legend.state().charge).toEqual({ ticks, ready: true });
  });

  it('ための 長さに 足りないで はなす と ふつうの わざ（fireTech）。ため中の 歩きは 設定 legendaryChargeWalk（1P と 同じ）', () => {
    const item = itemByCharge('lightning');
    const t = makeP2({ item });
    t.step({ pressed: true, held: true });
    t.step({ held: true });
    expect(t.p2.legend.motion().speedMul).toBe(S.legendaryChargeWalk);
    expect(t.step({ held: false }).r.fireTech).toBe(true);
  });

  it('1P と 2P の 部品は 別の 入れもの: 2P が ためても 1P の 部品は ためない（逆も）', () => {
    const item = itemByCharge('lightning');
    const a = makeP2({ item });
    const b = makeRef({ item });
    a.step({ pressed: true, held: true });
    expect(a.p2.legend.state().charge).not.toBeNull();
    expect(b.sys.state().charge).toBeNull();
    b.step({ pressed: true, held: true });
    b.step({ held: true });
    expect(b.sys.state().charge?.ticks).toBe(2);
    expect(a.p2.legend.state().charge?.ticks).toBe(1);
  });
});

describe('AC103: 強さは 1P と 同じ 式 × 2P の 手甲（2P の そうびを 見る）', () => {
  /** 最初の damage の ダメージ量 */
  const firstDamage = (calls: { amount: number }[]): number => calls[0]!.amount;

  it.each(['lightning', 'shining'] as const)('%s: 手甲なし は 1P の 部品と 同じ・手甲あり は 1P の 部品に 同じ 手甲を つけた 数と 同じで、なしの 手甲の 倍率（調整表）倍', (kind) => {
    const item = itemByCharge(kind);
    const list = () => [karakasa(1, kind === 'lightning' ? GROUND8 : { x: POS.x + 2, y: POS.y, z: POS.z })];
    const ticks = chargeTicksOf(item);
    const run = (arms: ItemId | null) => {
      const a = makeP2({ item, list: list(), arms });
      const b = makeRef({ item, list: list(), arms });
      chargeAndRelease((c) => a.step(c), ticks, 60);
      chargeAndRelease((c) => b.step(c), ticks, 60);
      return { p2: firstDamage(a.y.calls), ref: firstDamage(b.y.calls) };
    };
    const bare = run(null);
    const tekko = run(TEKKO_ID);
    expect(bare.p2).toBe(bare.ref);
    expect(tekko.p2).toBe(tekko.ref);
    expect(tekko.p2).toBeCloseTo(bare.p2 * NINJA_TUNING.tekkoBladeMul, 1);
    expect(tekko.p2).toBeGreaterThan(bare.p2);
    // 倍率の 部品は 1P と 同じ（刀の 武器にだけ かかる）
    expect(tekkoBladeMulOf(wearing(TEKKO_ID), item)).toBe(NINJA_TUNING.tekkoBladeMul);
  });

  it('らせん: とんだ かぜの ダメージも 手甲で 倍（出した とき 1 回 読む）。1P の 部品の 波と 同じ 数', () => {
    const item = itemByCharge('spiral');
    const ticks = chargeTicksOf(item);
    const hitDamage = (arms: ItemId | null): { p2: number; ref: number } => {
      const a = makeP2({ item, list: [karakasa(1, FORWARD3)], arms });
      chargeAndRelease((c) => a.step(c), ticks, 70);
      // 1P の 部品: 波の 係を 同じ 設定・同じ 出し方で 作る
      const calls: number[] = [];
      const armor = wearing(arms);
      let tk = 1;
      const w = createWaveSystem({
        world: a.world,
        yokai: () => ({ list: () => [karakasa(1, FORWARD3)], damage: (_id: number, amount: number) => (calls.push(amount), amount) }) as never,
        settings: S,
        tick: () => tk,
        emit: () => {},
        powerMul: (i) => tekkoBladeMulOf(armor, i),
        seed: 1,
      });
      w.launchSpiral({ item, dirDeg: 0, body: { x: POS.x, y: POS.y + 1.4, z: POS.z } });
      for (let i = 0; i < 70; i++) {
        tk += 1;
        w.step({ item, tech: null, phase: 'idle', frame: 0, startup: 0, dirDeg: 0, body: { x: POS.x, y: POS.y + 1.4, z: POS.z } });
      }
      return { p2: firstDamage(a.y.calls), ref: calls[0]! };
    };
    const bare = hitDamage(null);
    const tekko = hitDamage(TEKKO_ID);
    expect(bare.p2, 'かぜが 当たった').toBeGreaterThan(0);
    expect(bare.p2).toBe(bare.ref);
    expect(tekko.p2).toBe(tekko.ref);
    expect(tekko.p2).toBeGreaterThan(bare.p2);
  });

  it('らせんの かぜは 2P の 足もと + y 1.4 から とぶ（1P の launchSpiral と 同じ 高さ）で、波は 2P の 物（who 2）', () => {
    const item = itemByCharge('spiral');
    const t = makeP2({ item, list: [karakasa(1, FORWARD3)] });
    chargeAndRelease((c) => t.step(c), chargeTicksOf(item), 12);
    const sp = t.p2.waves.list().find((w) => w.kind === 'spiral');
    expect(sp, 'らせんの かぜが とんでいる').toBeDefined();
    expect(sp!.who).toBe(2);
    expect(sp!.position.y).toBeCloseTo(POS.y + 1.4, 6);
    expect(sp!.position.x).toBeCloseTo(POS.x, 6);
  });

  it('風神剣の ふつうの わざの 真空波も 2P の 物（who 2）。当たりは 2P の 手柄', () => {
    const item = itemByCharge('spiral');
    const t = makeP2({ item, list: [karakasa(1, { x: POS.x, y: POS.y, z: POS.z - 1.5 })] });
    // 刀の わざの 当たりの はじめの F（frame = startup + 1）に 波が 出る（1P と 同じ 条件）
    t.step({}, { item, tech: 'thrust', phase: 'active', frame: 5, startup: 4, dirDeg: 0 });
    const w = t.p2.waves.list().find((x) => x.kind === 'wave');
    expect(w, '真空波が 出た').toBeDefined();
    expect(w!.who).toBe(2);
    for (let i = 0; i < 12; i++) t.step({}, { item, tech: null, phase: 'idle', frame: 0, startup: 0, dirDeg: 0 });
    expect(t.y.calls.length).toBeGreaterThan(0);
    expect(t.y.calls.every((c) => c.who === 2)).toBe(true);
  });
});

describe('AC103: 2P の わざで 倒した 妖怪の けいけんちは 2P（damage の who=2。1P は かわらない）', () => {
  it.each(CHARGE_KINDS)('%s: 妖怪の 世界へ の damage は ぜんぶ 6 番目の 引数 who=2', (kind) => {
    const item = itemByCharge(kind);
    const list = [karakasa(1, GROUND8), karakasa(2, FORWARD3), karakasa(3, { x: POS.x + 2, y: POS.y, z: POS.z })];
    const t = makeP2({ item, list });
    chargeAndRelease((c) => t.step(c), chargeTicksOf(item), 300);
    expect(t.y.calls.length, '当たった').toBeGreaterThan(0);
    expect(t.y.calls.map((c) => c.who)).toEqual(t.y.calls.map(() => 2));
  });

  it.each(['lightning', 'shining'] as const)('%s: 1 人の ときの 1P の 部品は 今の まま（who を わたさない。波は waveWho.test.ts）', (kind) => {
    const item = itemByCharge(kind);
    const list = [karakasa(1, GROUND8), karakasa(3, { x: POS.x + 2, y: POS.y, z: POS.z })];
    const t = makeRef({ item, list });
    chargeAndRelease((c) => t.step(c), chargeTicksOf(item), 300);
    expect(t.y.calls.length).toBeGreaterThan(0);
    expect(t.y.calls.every((c) => c.who === undefined && c.argc === 4)).toBe(true);
  });
});

describe('AC103: 2P の 刀の たいきゅう・手ごたえ（1P と 同じ 部品・同じ 数え方）', () => {
  it('雷が 1 体 以上に 当たると 2P の 刀が 1 だけ へる。外れると へらない', () => {
    const item = itemByCharge('lightning');
    const hit = makeP2({ item, list: [karakasa(1, GROUND8)] });
    chargeAndRelease((c) => hit.step(c), chargeTicksOf(item), 60);
    expect(hit.wears).toEqual([1]);
    const miss = makeP2({ item, list: [] });
    chargeAndRelease((c) => miss.step(c), chargeTicksOf(item), 60);
    expect(miss.wears).toEqual([]);
  });

  it('雷が 当たると 2P の 手ごたえ（impact）に 大が 1 回。当たらないと 出ない', () => {
    const item = itemByCharge('lightning');
    const hit = makeP2({ item, list: [karakasa(1, GROUND8)] });
    chargeAndRelease((c) => hit.step(c), chargeTicksOf(item), 60);
    expect(hit.levels).toEqual([impactOf({ kind: 'charged' })]);
    const miss = makeP2({ item, list: [] });
    chargeAndRelease((c) => miss.step(c), chargeTicksOf(item), 60);
    expect(miss.levels).toEqual([]);
  });

  it('らせんの かぜが 当たった 手ごたえは くり返しの 段（echo）', () => {
    const item = itemByCharge('spiral');
    const t = makeP2({ item, list: [karakasa(1, FORWARD3)] });
    chargeAndRelease((c) => t.step(c), chargeTicksOf(item), 70);
    expect(t.levels).toEqual([impactOf({ kind: 'repeat' })]);
  });

  it('ドーム（シャイニング）: はじめの 当たりだけ 大、2 回目から echo。1 回の わざで たいきゅうは 1', () => {
    const item = itemByCharge('shining');
    const t = makeP2({ item, list: [karakasa(1, { x: POS.x + 2, y: POS.y, z: POS.z })] });
    chargeAndRelease((c) => t.step(c), chargeTicksOf(item), 300);
    expect(t.levels[0]).toBe(impactOf({ kind: 'charged' }));
    expect(t.levels.length).toBeGreaterThan(1);
    expect(t.levels.slice(1).every((l) => l === impactOf({ kind: 'repeat' }))).toBe(true);
    expect(t.wears).toEqual([1]);
  });

  it('step() は その ステップの 出来事を 返す（2P の 絵が 読む）。雷の ステップに lightningStrike', () => {
    const item = itemByCharge('lightning');
    const t = makeP2({ item, list: [karakasa(1, GROUND8)] });
    const seen: string[] = [];
    chargeAndRelease(
      (c) => {
        for (const e of t.step(c).events) seen.push(e.type);
      },
      chargeTicksOf(item),
      60,
    );
    expect(seen.filter((x) => x === 'lightningStrike')).toHaveLength(1);
    expect(seen).toContain('lightningStart');
  });
});

describe('AC104: わざの カメラ（2P の シャイニング。引きは 2P の カメラだけ）', () => {
  const shiningDef = (): { rise: number; hold: number; fall: number } => {
    const d = legendDefOf(S, itemByCharge('shining'))!.charge!;
    if (d.kind !== 'shining') throw new Error('shining');
    return { rise: d.riseSteps, hold: d.holdSteps, fall: d.fallSteps };
  };

  it('camFx.setDistance は 値が ある 間だけ 書く: ためている あいだは 呼ばない・シャイニング中は 14 まで 引き、終わった 最初の 1 ステップだけ null', () => {
    const item = itemByCharge('shining');
    const t = makeP2({ item });
    let withValue = 0;
    chargeAndRelease(
      (c) => {
        t.step(c);
        if (t.p2.legend.camDistance() !== null) withValue += 1;
      },
      chargeTicksOf(item),
      330,
    );
    const ticks = chargeTicksOf(item);
    const calls = t.cam.calls;
    expect(calls.length, '値の ある ステップ + 終わりの null 1 回').toBe(withValue + 1);
    expect(calls.filter((d) => d === null), 'null は 終わりの 1 回だけ').toHaveLength(1);
    expect(calls.at(-1)).toBeNull();
    expect(t.tick(), 'ステップは ためる ぶんも ある').toBeGreaterThan(ticks);
    const vals = calls.filter((d): d is number => d !== null);
    expect(vals.length).toBeGreaterThan(0);
    expect(Math.max(...vals)).toBeCloseTo(S.shiningCamDistance, 1);
    expect(Math.min(...vals), '2P の ふだんの きょり より 近く ならない（4.0 に とばない）').toBeGreaterThanOrEqual(DUO_TUNING.cameraSplit - 1e-9);
    // 終わりに ぴょんと とばない: 最後の 値は ふだんの きょりに ほとんど 着いている
    expect(Math.abs(vals.at(-1)! - DUO_TUNING.cameraSplit)).toBeLessThan(0.05);
  });

  it('わざが ない ステップは setDistance を 呼ばない（ふつうの 刀・ためている・何も ない）', () => {
    const item = itemByCharge('lightning');
    const t = makeP2({ item, list: [karakasa(1, GROUND8)] });
    for (let i = 0; i < 20; i++) t.step({});
    chargeAndRelease((c) => t.step(c), chargeTicksOf(item), 60);
    expect(t.cam.calls, '雷には きょりの 引きが ない').toEqual([]);
  });

  it('パリィの よせ〈4d-1〉と 口を 取りあわない: よせが 毎ステップ 先に 書き、わざが あとから 書く。わざの ない ステップは よせが のこり、わざの 間は わざが 勝ち、終わりの 1 ステップだけ null', () => {
    const item = itemByCharge('shining');
    const ZOOM = 4.4;
    let eff: number | null = null; // 2P の カメラの 口に 最後に 書かれた 値（P2CamFx.setDistance と 同じ「上書き」）
    const t = makeP2({ item, camFx: { setDistance: (d) => void (eff = d) } });
    const eff_ = (c: Parameters<P2Rig['step']>[0] = {}) => {
      eff = ZOOM; // 4d-1 の createParryZoom.step が 先に 書く
      t.step(c);
      return eff;
    };
    const seen: Array<number | null> = [];
    const ticks = chargeTicksOf(item);
    seen.push(eff_({ pressed: true, held: true }));
    for (let i = 1; i < ticks; i++) seen.push(eff_({ held: true }));
    expect(seen.every((d) => d === ZOOM), 'ためている あいだ: パリィの よせが のこる').toBe(true);
    seen.length = 0;
    seen.push(eff_({ held: false }));
    for (let i = 0; i < 330; i++) seen.push(eff_({}));
    const moved = seen.filter((d) => d !== ZOOM);
    expect(moved.length, 'シャイニング中は わざが 勝つ').toBeGreaterThan(100);
    expect(moved.filter((d) => d === null), '終わりに null が ちょうど 1 回').toHaveLength(1);
    expect(seen.at(-1), '終わった あとは また よせが のこる').toBe(ZOOM);
  });

  it('本物の P2CamFx: 2P の きょり（duo.camDistance(2)）は 14 まで 引いて 5.0 へ もどる', () => {
    const item = itemByCharge('shining');
    const fx2 = new P2CamFx({ baseDistance: () => DUO_TUNING.cameraSplit });
    const t = makeP2({ item, camFx: fx2 });
    const seen: number[] = [];
    chargeAndRelease(
      (c) => {
        t.step(c);
        seen.push(fx2.distance());
      },
      chargeTicksOf(item),
      330,
    );
    expect(Math.max(...seen)).toBeCloseTo(S.shiningCamDistance, 1);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(DUO_TUNING.cameraSplit - 1e-9);
    expect(seen.at(-1)).toBe(DUO_TUNING.cameraSplit);
  });

  it('引きの 曲がり方は 1 人の ときの 1P と 同じ: (きょり − ふだん) ÷ (14 − ふだん) が 毎ステップ 同じ', () => {
    const item = itemByCharge('shining');
    const ticks = chargeTicksOf(item);
    const solo = makeRef({ item, base: () => DUO_TUNING.cameraSolo });
    const duo = makeP2({ item });
    const level = (d: number | null, base: number) => ((d ?? base) - base) / (S.shiningCamDistance - base);
    const a: number[] = [];
    const b: number[] = [];
    chargeAndRelease(
      (c) => {
        solo.step(c);
        a.push(level(solo.sys.camDistance(), DUO_TUNING.cameraSolo));
      },
      ticks,
      300,
    );
    chargeAndRelease(
      (c) => {
        duo.step(c);
        b.push(level(duo.p2.legend.camDistance(), DUO_TUNING.cameraSplit));
      },
      ticks,
      300,
    );
    expect(b.length).toBe(a.length);
    a.forEach((v, i) => expect(b[i]!, `${i} ステップ`).toBeCloseTo(v, 6));
    expect(Math.max(...a)).toBeCloseTo(1, 6);
  });

  it('シャイニングの 途中で 倒れた（active=false）: 1P の 中断と 同じに わざが 消え、きょりは 40 ステップで ふだん（5.0）へ。5.0 より 小さく ならず 4.0 に とばない', () => {
    const item = itemByCharge('shining');
    const sh = shiningDef();
    const t = makeP2({ item });
    chargeAndRelease((c) => t.step(c), chargeTicksOf(item), sh.rise + 10);
    expect(t.p2.legend.state().move).toBe('shining');
    t.cam.calls.length = 0;
    const down = t.step({ active: false });
    expect(down.r.busy).toBe(false);
    expect(t.p2.legend.state().move).toBeNull();
    const seq: Array<number | null> = [t.cam.calls.at(-1) ?? null];
    for (let i = 0; i < 45; i++) {
      t.step({ active: false });
      seq.push(t.cam.calls.at(-1) ?? null);
    }
    const vals = seq.filter((d): d is number => d !== null);
    expect(vals.length).toBeGreaterThan(5);
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(DUO_TUNING.cameraSplit - 1e-9);
    vals.forEach((v, i) => i > 0 && expect(v, `${i}: もどる あいだは 引く 方に もどらない`).toBeLessThanOrEqual(vals[i - 1]! + 1e-9));
    expect(seq.at(-1), '40 ステップ すぎたら ふだん（null）').toBeNull();
  });
});

describe('AC105: シャイニング中の 2P（もちもの画面・持ちかえ・とばされにくさ・落ちない）', () => {
  const total = (): number => {
    const d = legendDefOf(S, itemByCharge('shining'))!.charge!;
    if (d.kind !== 'shining') throw new Error('shining');
    return d.riseSteps + d.holdSteps + d.fallSteps;
  };

  it('locked() は シャイニングの F1〜(上がる+とどまる+おりる) の あいだ だけ true。ためている あいだ・おわった あとは false（1P の 部品と 同じ）', () => {
    const item = itemByCharge('shining');
    const t = lockstep('shining');
    const ticks = chargeTicksOf(item);
    let lockedSteps = 0;
    let wasLocked = false;
    chargeAndRelease(t.step, ticks, 330, () => {
      const st = t.a.p2.legend.state();
      const expect_ = st.move === 'shining' && st.moveF <= total();
      expect(t.a.p2.locked(), `F${st.moveF}`).toBe(expect_);
      if (expect_) lockedSteps += 1;
      if (t.a.p2.locked()) wasLocked = true;
    });
    expect(t.mism).toEqual([]);
    expect(wasLocked).toBe(true);
    expect(lockedSteps).toBe(total());
    expect(t.a.p2.locked()).toBe(false);
  });

  it('シャイニングを 持たない 2P（雷神剣・ふつうの 刀）は ためている あいだも 雷の あいだも locked() は false（もちもの画面は 開く）', () => {
    const item = itemByCharge('lightning');
    const t = makeP2({ item, list: [karakasa(1, GROUND8)] });
    chargeAndRelease((c) => t.step(c), chargeTicksOf(item), 60, () => expect(t.p2.locked()).toBe(false));
  });

  it('2P の シャイニング中も 1P の 部品は locked() false（1P は もちもの画面を 開ける。逆も）', () => {
    const item = itemByCharge('shining');
    const t = lockstep('shining');
    // 2P だけ シャイニング。1P の 部品は ふつうの 刀を 持つだけ
    const plain = [...BLADE_ITEMS].find((i) => !S.legendary.some((d) => d.item === i))!; // ためわざの ない ふつうの 刀（設定の 表から）
    const other = makeRef({ item: plain });
    chargeAndRelease(
      (c) => {
        t.a.step(c);
        other.step({});
        expect(other.sys.locked()).toBe(false);
      },
      chargeTicksOf(item),
      60,
    );
    expect(t.a.p2.locked()).toBe(true);
  });

  it('combat の 口: シャイニング中の 受ける ダメージの 倍率は 設定の takenMul・落下ダメージなし。おわると 1・落ちる（着地して から）', () => {
    const item = itemByCharge('shining');
    const def = legendDefOf(S, item)!.charge!;
    const mul = def.kind === 'shining' ? def.takenMul : 1;
    const t = makeP2({ item });
    expect(t.p2.combat.takenMul()).toBe(1);
    expect(t.p2.combat.noFall()).toBe(false);
    chargeAndRelease((c) => t.step(c), chargeTicksOf(item), 5);
    expect(t.p2.combat.takenMul()).toBe(mul);
    expect(t.p2.combat.noFall()).toBe(true);
    for (let i = 0; i < 330; i++) t.step({});
    expect(t.p2.combat.takenMul()).toBe(1);
    expect(t.p2.combat.noFall(), 'おわって 着地したら 落下ダメージは ふつうに もどる').toBe(false);
  });

  it('2P の PlayerCombat に combat の 口を つなぐ と、シャイニング中は 1/3（切り上げ）しか へらず、おわると そのまま', () => {
    const item = itemByCharge('shining');
    const t = makeP2({ item });
    const kit = makeP2Combat({ ports: t.p2.combat });
    const lose = (dmg: number): number => {
      kit.run(120); // 無敵の 時間を すぎる
      const before = kit.life.hp;
      kit.life.damage(dmg, { type: 'yokai', from: kit.from() });
      return before - kit.life.hp;
    };
    expect(lose(4)).toBe(4);
    chargeAndRelease((c) => t.step(c), chargeTicksOf(item), 5);
    expect(t.p2.locked()).toBe(true);
    expect(lose(4), 'シャイニング中').toBe(Math.ceil(4 * (1 / 3)));
    for (let i = 0; i < 330; i++) t.step({});
    expect(lose(4), 'おわった あと').toBe(4);
  });
});

describe('AC106 前半: 2P の 真空波の 絵の 向き face は 2P の カメラ（view）で きまる', () => {
  const FUJIN = itemByCharge('spiral');
  /** 北向きの 真空波を 出して 数ステップ すすめ、その face を 返す。view は 2P の カメラの にせもの */
  const faceWith = (forward: Vec3 | null): number | null => {
    const view = forward ? () => ({ forward, project: () => false }) : undefined;
    const t = makeP2({ item: FUJIN, list: [], ...(view ? { view } : {}) });
    t.step({}, { item: FUJIN, tech: 'thrust', phase: 'active', frame: 5, startup: 4, dirDeg: 0 });
    for (let i = 0; i < 3; i++) t.step({}, { item: FUJIN, tech: null, phase: 'idle', frame: 0, startup: 0, dirDeg: 0 });
    const w = t.p2.waves.list().find((x) => x.kind === 'wave');
    return w ? w.face : null;
  };

  it('2P の カメラが 波の 進む 向きを 向いて いれば 2（上）・背を 向けて いれば 6（下）。view を 渡さなければ 0', () => {
    expect(faceWith({ x: 0, y: 0, z: -1 })).toBe(2);
    expect(faceWith({ x: 0, y: 0, z: 1 })).toBe(6);
    expect(faceWith(null)).toBe(0);
  });

  it('向きは 渡した view だけで きまる（view が 変わると 同じ 波でも 向きが 変わる）', () => {
    let fwd: Vec3 = { x: 0, y: 0, z: -1 };
    const t = makeP2({ item: FUJIN, list: [], view: () => ({ forward: fwd, project: () => false }) });
    t.step({}, { item: FUJIN, tech: 'thrust', phase: 'active', frame: 5, startup: 4, dirDeg: 0 });
    t.step({}, { item: FUJIN, tech: null, phase: 'idle', frame: 0, startup: 0, dirDeg: 0 });
    expect(t.p2.waves.list().find((x) => x.kind === 'wave')!.face).toBe(2);
    fwd = { x: 0, y: 0, z: 1 };
    t.step({}, { item: FUJIN, tech: null, phase: 'idle', frame: 0, startup: 0, dirDeg: 0 });
    expect(t.p2.waves.list().find((x) => x.kind === 'wave')!.face).toBe(6);
  });
});

describe('P2Legend.dispose: 2P が やめた とき（ためている・シャイニング中・かぜが とんでいる 間でも すぐ 消える）', () => {
  const NEAR = { x: POS.x + 2, y: POS.y, z: POS.z };

  it('ためている とちゅう: ための ループ音を 止め、ためも 消え、カメラの 口の 最後の 書きこみは null', () => {
    const item = itemByCharge('lightning');
    const loops = loopSpy();
    const t = makeP2({ item, loops });
    t.step({ pressed: true, held: true });
    for (let i = 0; i < 5; i++) t.step({ held: true });
    expect(t.p2.legend.state().charge).not.toBeNull();
    expect(loops.running().length, '音が 鳴っている').toBeGreaterThan(0);
    t.p2.dispose();
    expect(loops.running(), '全部 止めた').toEqual([]);
    expect(t.p2.legend.state().charge).toBeNull();
    expect(t.cam.calls.at(-1)).toBeNull();
  });

  it('シャイニング中: すぐ locked()=false・takenMul=1・noFall=false・わざ なし。吸いこみ音も 止まる', () => {
    const item = itemByCharge('shining');
    const loops = loopSpy();
    const t = makeP2({ item, list: [karakasa(1, NEAR)], loops });
    chargeAndRelease((c) => t.step(c), chargeTicksOf(item), 20);
    expect(t.p2.locked()).toBe(true);
    expect(t.p2.combat.takenMul()).toBeLessThan(1);
    t.p2.dispose();
    expect(t.p2.locked()).toBe(false);
    expect(t.p2.combat.takenMul()).toBe(1);
    expect(t.p2.combat.noFall()).toBe(false);
    expect(t.p2.legend.state().move).toBeNull();
    expect(t.p2.legend.state().charge).toBeNull();
    expect(loops.running()).toEqual([]);
    expect(t.cam.calls.at(-1), '引いた カメラは ふだんへ（口を 手ばなす）').toBeNull();
  });

  it('らせんの かぜが とんでいる 間: 波が 全部 消え、かぜの 音が 止まる', () => {
    const item = itemByCharge('spiral');
    const loops = loopSpy();
    const t = makeP2({ item, loops });
    chargeAndRelease((c) => t.step(c), chargeTicksOf(item), 8);
    expect(t.p2.waves.list().length, 'かぜが とんでいる').toBeGreaterThan(0);
    expect(loops.running()).toContain('spiralWind');
    t.p2.dispose();
    expect(t.p2.waves.list()).toEqual([]);
    expect(loops.running()).toEqual([]);
  });

  it('2 回 呼んでも こわれない・あとから step しても 何も おこらない（わざが 生き返らない）', () => {
    const item = itemByCharge('shining');
    const t = makeP2({ item });
    chargeAndRelease((c) => t.step(c), chargeTicksOf(item), 10);
    t.p2.dispose();
    expect(() => t.p2.dispose()).not.toThrow();
    for (let i = 0; i < 5; i++) t.step({ active: false });
    expect(t.p2.locked()).toBe(false);
  });
});

describe('1P の 配線の 約束（src/duo/rules.ts。1P の combat.ts・player.ts・shared.legendFor が 同じ 関数を 使う）', () => {
  it('baseCamDistance: 2 人の ときは その きょり（5.0）・1 人の ときは 1P ひとりの きょり（cameraSolo）', () => {
    expect(baseCamDistance(null)).toBe(DUO_TUNING.cameraSolo);
    expect(baseCamDistance(DUO_TUNING.cameraSplit)).toBe(DUO_TUNING.cameraSplit);
  });

  it('1P の 部品に baseDistance: () => baseCamDistance(duoCamDistance) を わたすと、2 人の 間の シャイニングは 5.0 より 近く ならない・1 人の ときは 4.0 まで', () => {
    const item = itemByCharge('shining');
    const ticks = chargeTicksOf(item);
    const minDist = (dist: number | null): number => {
      const ref = makeRef({ item, base: () => baseCamDistance(dist) });
      let m = Infinity;
      chargeAndRelease(
        (c) => {
          ref.step(c);
          m = Math.min(m, ref.sys.camDistance() ?? baseCamDistance(dist));
        },
        ticks,
        330,
      );
      return m;
    };
    expect(minDist(DUO_TUNING.cameraSplit)).toBeGreaterThanOrEqual(DUO_TUNING.cameraSplit - 1e-9);
    expect(minDist(null)).toBeGreaterThanOrEqual(DUO_TUNING.cameraSolo - 1e-9);
    expect(minDist(null)).toBeLessThan(DUO_TUNING.cameraSplit);
  });

  it('pickLegend(who, joined, 1P の, 2P の): 1P は いつも 1P の・2P は 参加して いれば 2P の・いなければ null', () => {
    expect(pickLegend(1, false, 'one', null)).toBe('one');
    expect(pickLegend(1, true, 'one', 'two')).toBe('one');
    expect(pickLegend(2, true, 'one', 'two')).toBe('two');
    expect(pickLegend(2, false, 'one', 'two')).toBeNull();
    expect(pickLegend(2, true, 'one', null)).toBeNull();
  });
});
