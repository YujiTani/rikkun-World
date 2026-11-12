import { SEA_Y, type BlockId } from '../../contracts';
import type { CountryKind } from './config';
import { subSeed, valueNoise } from './random';
import { V2_SURFACE, type MountainKind } from './mountainV2Table';

/**
 * ?mountain=v2: 山の 地面の 材料（形とは べつの 層）。かたむきで かえる。
 * となりの列との高さの差が steep 以上 = 岩、ゆるい・平らな所 = くさ。雪の線（snowFrom）より上の ゆるい面は ぜんぶ ゆき。
 * rockFrom より 上は ゆるい面でも 岩（まわり flatR マスが 平らな 広い 所だけ くさ）。
 * 岩は 高さの帯と ノイズで いし・つち・せきたん を 2〜3 割 まぜる（新しいブロックは 足さない）。
 * heightAt = (x, z) の 生成の高さ（山の形 ＋ 自然地形）
 */
export function v2TopBlock(seed: number, kind: CountryKind, x: number, z: number, h: number, heightAt: (x: number, z: number) => number): BlockId {
  const S = V2_SURFACE[kind as MountainKind];
  const rel = h - SEA_Y;
  const snowy = rel >= S.snowFrom;
  let steep = 0;
  for (let k = 0; k < 4; k++) steep = Math.max(steep, Math.abs(heightAt(x + (k === 0 ? 1 : k === 1 ? -1 : 0), z + (k === 2 ? 1 : k === 3 ? -1 : 0)) - h));
  let rock = steep >= (snowy ? S.steepSnow : S.steep);
  if (!rock && !snowy && rel >= S.rockFrom) {
    for (let k = 0; k < 4 && !rock; k++) rock = Math.abs(heightAt(x + (k === 0 ? S.flatR : k === 1 ? -S.flatR : 0), z + (k === 2 ? S.flatR : k === 3 ? -S.flatR : 0)) - h) > 1;
  }
  if (rock) {
    const n = valueNoise(subSeed(seed, 916), x + h * 2.3, z - h * 1.7, 9);
    return n > 0.5 + S.rockHalf ? 'dirt' : n < 0.5 - S.rockHalf ? 'coal_ore' : 'stone';
  }
  return snowy ? 'snow' : 'grass';
}
