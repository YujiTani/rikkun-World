// GFX-1: せっていの「がめん」が 呼ぶ 窓口。おもさ・くわしくを かえて、保存して、すぐ 効かせる。
// 効かせる 先（renderer・Game・ShadowSystem）は apply で 受ける（three に 依らない ので ユニットテストできる）。
import { clearGfxDetail, ringNoteNeeded, saveGfxPart, WEIGHT_SPEC, type GfxStore, type Res, type RingKind, type Weight } from './gfxPref';
import { SHADOW_STORAGE_KEY } from '../world/render/shadow/shadowPref';
import { saveWeight } from './weightPref';

export interface GfxState {
  weight: Weight;
  /** 今の かげ（オン = true） */
  shadow: boolean;
  /** かげを あとから 作って よいか（?shadow=0 は false） */
  shadowAllowed: boolean;
  /** がめんの こまかさの 上限 */
  res: Res;
  /** 今の ちかくの こまかさ（F4 で かわった 値も 読む） */
  microR: number;
  /** 今の 輪（起動の とき 決まった） */
  ring: RingKind;
  /** つぎに あそぶ ときの 輪（今の おもさの 輪） */
  ringNext: RingKind;
  /** 「とおくの ひろさは つぎに あそぶ ときから」の お知らせを 出すか */
  ringNote: boolean;
}

export interface GfxPort {
  state(): GfxState;
  setWeight(w: Weight): void;
  setShadow(on: boolean): void;
  setRes(r: Res): void;
  setMicro(r: number): void;
}

export function createGfx(d: {
  store: GfxStore | null;
  weight: Weight;
  res: Res;
  ring: RingKind;
  shadowAllowed: boolean;
  live: { micro(): number; shadow(): boolean };
  apply: {
    micro(r: number): void;
    res(r: Res): void;
    /** persist = false は おもさで そろえる とき（かげの 保存は おもさの ほうで 消す） */
    shadow(on: boolean, persist: boolean): void;
  };
}): GfxPort {
  let weight = d.weight;
  let res = d.res;
  /** 遊びの 途中で おもさを 押した（押すまでは お知らせを 出さない） */
  let pressed = false;
  return {
    state: () => ({
      weight,
      shadow: d.live.shadow(),
      shadowAllowed: d.shadowAllowed,
      res,
      microR: d.live.micro(),
      ring: d.ring,
      ringNext: WEIGHT_SPEC[weight].ring,
      ringNote: pressed && ringNoteNeeded(d.ring, weight),
    }),
    setWeight(w) {
      weight = w;
      pressed = true;
      saveWeight(d.store, w);
      clearGfxDetail(d.store, SHADOW_STORAGE_KEY);
      const spec = WEIGHT_SPEC[w];
      res = spec.res;
      d.apply.micro(spec.microR);
      d.apply.res(spec.res);
      if (d.shadowAllowed) d.apply.shadow(spec.shadow, false);
    },
    setShadow(on) {
      if (d.shadowAllowed) d.apply.shadow(on, true);
    },
    setRes(r) {
      res = r;
      saveGfxPart(d.store, { res: r });
      d.apply.res(r);
    },
    setMicro(r) {
      saveGfxPart(d.store, { micro: r });
      d.apply.micro(r);
    },
  };
}
