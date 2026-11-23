'use strict';
// 武装の設定ファイル（どの機体が何を持つかは js/units.js）
// 設定ページ（アーティファクト「STELLAR LEGION 兵器と出撃」）で値を変えて、この中身をまるごと貼り替えてもよい。
//
// kind（武装の種類）:
//   bullet / shell / missile … 実弾。ammo（残弾）を使う。戦艦で補給できる
//   beam / charge            … ビーム。energy（ビームエネルギー）を使う。撃たずにいると回復する
//   melee                    … 格闘。弾もエネルギーも使わない
// 主な項目:
//   dmg: 威力, speed: 弾速, cooldown: 連射間隔(秒), range: 射程, spread: ばらつき（ラジアン）
//   count / arc: 同時に撃つ数と広がり（ラジアン）, splash: 爆発の半径
//   missile の maxSpeed: 最高速度, turn: 曲がる強さ（0 ならまっすぐ飛ぶ）, life: 飛んでいる秒数
//   charge の charge: 撃てるまでにボタンを押し続ける秒数, width: ビームの太さ, dur: ビームが残る秒数
//   melee の reach: 機体の中心から刃先までの距離, arc: 振り抜く角度の半分（ラジアン）,
//            lunge: 踏み込む速さ, lungeTime: 踏み込む秒数, stun: しびれさせる秒数
//   name / short / look / r / len / w / blade は見た目（表示名、弾の形、刃の形など）
SL.WEAPONS = {
  // --- 実弾 ---
  rifle: { name: 'MACHINE RIFLE', short: 'RIFL', kind: 'bullet', dmg: 7, speed: 340, cooldown: 0.3, ammo: 60, range: 280, spread: 0.06, r: 2, look: 'tracer' },
  vulcan: { name: 'VULCAN', short: 'VULC', kind: 'bullet', dmg: 3.5, speed: 380, cooldown: 0.09, ammo: 160, range: 240, spread: 0.1, r: 1.5, look: 'tracerSmall' },
  cannon: { name: 'CANNON', short: 'CANN', kind: 'shell', dmg: 20, speed: 280, cooldown: 1.3, ammo: 30, range: 440, spread: 0.04, splash: 22, r: 3, look: 'shell' },
  bazooka: { name: 'BAZOOKA', short: 'BAZK', kind: 'shell', dmg: 26, speed: 230, cooldown: 1.2, ammo: 12, range: 300, spread: 0.03, splash: 20, r: 3, look: 'rocket' },
  missile3: { name: '3WAY MISSILE', short: '3WAY', kind: 'missile', dmg: 12, speed: 170, maxSpeed: 330, turn: 0, cooldown: 1, ammo: 8, range: 340, count: 3, arc: 0.5, life: 1.6, r: 2, look: 'missile' },
  missile5: { name: '5WAY MISSILE', short: '5WAY', kind: 'missile', dmg: 11, speed: 160, maxSpeed: 310, turn: 0, cooldown: 1.4, ammo: 6, range: 320, count: 5, arc: 0.9, life: 1.6, r: 2, look: 'missile' },
  homing: { name: 'HOMING MISSILE', short: 'HOMG', kind: 'missile', dmg: 16, speed: 140, maxSpeed: 300, turn: 3.6, cooldown: 1.1, ammo: 8, range: 400, count: 2, arc: 1.2, life: 2.8, r: 2, look: 'homing' },
  // --- ビーム ---
  beam_rifle: { name: 'BEAM RIFLE', short: 'BEAM', kind: 'beam', dmg: 14, speed: 480, cooldown: 0.45, energy: 12, range: 400, spread: 0.03, len: 12, w: 2 },
  spread_beam: { name: 'SPREAD BEAM', short: 'SPRD', kind: 'beam', dmg: 11, speed: 380, cooldown: 1.6, energy: 30, range: 360, spread: 0.02, count: 5, arc: 0.5, len: 14, w: 3 },
  mega_cannon: { name: 'MEGA BEAM CANNON', short: 'MEGA', kind: 'charge', dmg: 55, cooldown: 1, energy: 55, charge: 1.4, range: 460, width: 9, dur: 0.4 },
  // --- 格闘 ---
  saber: { name: 'BEAM SABER', short: 'SABR', kind: 'melee', style: 'slash', dmg: 32, cooldown: 0.75, reach: 36, arc: 1.35, lunge: 230, lungeTime: 0.24, blade: { len: 28, color: '#ff5fd2' } },
  heat_axe: { name: 'HEAT AXE', short: 'AXE', kind: 'melee', style: 'slash', dmg: 38, cooldown: 0.85, reach: 36, arc: 1.35, lunge: 210, lungeTime: 0.24, blade: { len: 26, color: '#ff9a3a', head: 'axe' } },
  naginata: { name: 'NAGINATA', short: 'NAGI', kind: 'melee', style: 'spin', dmg: 28, cooldown: 1.1, reach: 46, lunge: 140, lungeTime: 0.36, blade: { len: 12, color: 'beam', pole: 32 } },
  shock_whip: { name: 'SHOCK WHIP', short: 'WHIP', kind: 'melee', style: 'whip', dmg: 12, cooldown: 2.4, reach: 48, stun: 0.8 },
};
