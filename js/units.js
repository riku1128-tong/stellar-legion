'use strict';
// 機体の設定ファイル（武装の性能は js/weapons.js、出撃する体数は js/army.js）
// 設定ページ（アーティファクト「STELLAR LEGION 兵器と出撃」）で機体を足したり値を変えたりして、
// この中身をまるごと貼り替えてもよい。
//
//   name: 表示名（英大文字）, faction: 勢力（az / cr）
//   role: AI の動き方と陣形の列（commander 隊長機, raider 遊撃機, heavy 重装機, grunt 量産機,
//         special 格闘機, artillery 砲撃機, giant 巨大機）
//   size: 大きさ（S = ふつう, M = 戦艦くらい, L = 戦艦の 2 倍）。M と L は当たり判定と格闘の届く距離も大きくなる
//   hp: 耐久力, speed: 巡航速度, energy: ビームエネルギーの最大値（省略すると 100）
//   radius: S のときの当たり判定の半径（絵の大きさとは別）
//   sprite: 絵の ID（js/asset-overrides.js の表の名前。新しい ID なら、役割に合った仮の図形で出る）
//   transform: Shift で変形できる機体だけ。sprite: 移動モードの絵, speed: 速さの倍率, turn: 曲がりやすさの倍率
//   weapons: [主射撃 J, 副射撃 K, 格闘 L]。無い枠は null。
//            武装の値を機体ごとに変えるときは { id: 'rifle', dmg: 9, ammo: 80 } のように書く（dmg / ammo / energy）
SL.UNIT_TYPES = {
  // --- アズール連合 ---
  az_commander: {
    name: 'VANGUARD', faction: 'az', role: 'commander', size: 'S', hp: 380, speed: 120, radius: 9, sprite: 'az_commander',
    weapons: ['beam_rifle', 'homing', 'saber'],
  },
  az_raider: {
    name: 'FALCON', faction: 'az', role: 'raider', size: 'S', hp: 260, speed: 115, radius: 8, sprite: 'az_raider',
    transform: { speed: 1.7, turn: 0.7, sprite: 'az_raider_jet' },
    weapons: ['beam_rifle', 'missile3', 'saber'],
  },
  az_heavy: {
    name: 'BASTION', faction: 'az', role: 'heavy', size: 'S', hp: 460, speed: 85, radius: 10, sprite: 'az_heavy',
    weapons: ['mega_cannon', 'missile5', 'saber'],
  },
  az_grunt: {
    name: 'GUARD', faction: 'az', role: 'grunt', size: 'S', hp: 200, speed: 105, radius: 8, sprite: 'az_grunt',
    weapons: ['rifle', null, 'saber'],
  },
  az_special: {
    name: 'GLAIVE', faction: 'az', role: 'special', size: 'S', hp: 230, speed: 110, radius: 8, sprite: 'az_special',
    weapons: ['rifle', 'missile3', 'naginata'],
  },
  az_artillery: {
    name: 'MORTAR', faction: 'az', role: 'artillery', size: 'S', hp: 260, speed: 75, radius: 10, sprite: 'az_artillery',
    weapons: ['cannon', 'beam_rifle', null],
  },
  az_giant: {
    name: 'CITADEL', faction: 'az', role: 'giant', size: 'S', hp: 1000, speed: 50, energy: 160, radius: 22, sprite: 'az_giant',
    weapons: ['spread_beam', 'missile5', null],
  },
  // --- クリムゾン帝国 ---
  cr_commander: {
    name: 'TRIBUNE', faction: 'cr', role: 'commander', size: 'S', hp: 360, speed: 125, radius: 9, sprite: 'cr_commander',
    weapons: ['beam_rifle', 'missile3', 'naginata'],
  },
  cr_raider: {
    name: 'WASP', faction: 'cr', role: 'raider', size: 'S', hp: 250, speed: 118, radius: 8, sprite: 'cr_raider',
    transform: { speed: 1.7, turn: 0.7, sprite: 'cr_raider_jet' },
    weapons: ['vulcan', 'homing', 'heat_axe'],
  },
  cr_heavy: {
    name: 'JUGGERNAUT', faction: 'cr', role: 'heavy', size: 'S', hp: 480, speed: 80, radius: 10, sprite: 'cr_heavy',
    weapons: ['bazooka', 'missile5', 'heat_axe'],
  },
  cr_grunt: {
    name: 'LEGIONARY', faction: 'cr', role: 'grunt', size: 'S', hp: 205, speed: 100, radius: 8, sprite: 'cr_grunt',
    weapons: ['rifle', null, 'heat_axe'],
  },
  cr_special: {
    name: 'STINGER', faction: 'cr', role: 'special', size: 'S', hp: 230, speed: 110, radius: 8, sprite: 'cr_special',
    weapons: ['rifle', 'missile3', 'shock_whip'],
  },
  cr_artillery: {
    name: 'HOWITZER', faction: 'cr', role: 'artillery', size: 'S', hp: 270, speed: 72, radius: 10, sprite: 'cr_artillery',
    weapons: ['cannon', 'beam_rifle', null],
  },
  cr_giant: {
    name: 'LEVIATHAN', faction: 'cr', role: 'giant', size: 'S', hp: 980, speed: 52, energy: 160, radius: 22, sprite: 'cr_giant',
    weapons: ['spread_beam', 'homing', null],
  },
};
