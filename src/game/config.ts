import { SEA_Y } from '../contracts';
import { GEN_CONFIG } from '../world/gen/config';

/** 景色の数値（M1-01 §3「空」「かすみ」「世界の外の海」）。ここ 1 か所にまとめる。 */
export const SCENERY_CONFIG = {
  /** 空の色（かすみも同じ色） */
  skyColor: 0x8fd3ff,
  /** かすみ: 40 マス先から薄くなり、80 マス先で空と同じ色（M5 §4-7。描くチャンクは 88 以内） */
  fogNear: 40,
  fogFar: 80,
  /** 世界の外の見た目だけの海 */
  ocean: {
    /** 海の面の高さ（みず ブロックの上面 = y SEA_Y の上 = SEA_Y + 1） */
    surfaceY: SEA_Y + 1,
    /** 海の底の面の高さ（仮の海のふち（S6）の底 = SEA_Y − 4 の すなの上） */
    floorY: SEA_Y - GEN_CONFIG.edge.deep + 1,
    /** 世界の外へ広げる距離（カメラの far より遠く） */
    extent: 700,
    /** プレイヤーのまわりの、海の板をあけておく はば（片側）。持つ列（10 列 = 160）より内、描く輪（6 列 = 96）より外。世界の みず と かさならないように */
    hole: 128,
    /** 世界の中の みず（すなの上の 60% すける青）に合わせた色（上から見て境目が目立たないように） */
    color: 0x7ca0c0,
  },
} as const;
