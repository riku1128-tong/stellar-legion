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
    name: 'RX-78-2', faction: 'az', role: 'commander', size: 'S', hp: 580, speed: 140, energy: 150, radius: 9, sprite: 'az_commander',
    weapons: ['beam_rifle', 'homing', 'saber'],
  },
  az_raider: {
    name: 'CORE-FIGHTER', faction: 'az', role: 'raider', size: 'S', hp: 260, speed: 115, radius: 8, sprite: 'az_raider',
    weapons: ['beam_rifle', 'missile3', 'saber'],
  },
  az_raider_2: {
    name: 'BALL', faction: 'az', role: 'raider', size: 'S', hp: 160, speed: 115, energy: 80, radius: 8, sprite: 'az_BALL',
    weapons: ['beam_rifle', null, null],
  },
  az_heavy: {
    name: 'GUN-CANON', faction: 'az', role: 'heavy', size: 'S', hp: 460, speed: 85, radius: 10, sprite: 'az_heavy',
    weapons: ['mega_cannon', 'missile5', 'saber'],
  },
  az_grunt: {
    name: 'GIM', faction: 'az', role: 'grunt', size: 'S', hp: 200, speed: 105, radius: 8, sprite: 'az_grunt',
    weapons: ['rifle', null, 'saber'],
  },
  az_artillery: {
    name: 'GUN-TANK', faction: 'az', role: 'artillery', size: 'S', hp: 260, speed: 75, radius: 10, sprite: 'az_artillery',
    weapons: ['cannon', 'beam_rifle', null],
  },
  // --- クリムゾン帝国 ---
  cr_commander: {
    name: 'SHA-GELGOOG', faction: 'cr', role: 'commander', size: 'S', hp: 360, speed: 250, radius: 9, sprite: 'cr_commander',
    weapons: ['beam_rifle', 'missile3', 'naginata'],
  },
  cr_commander_3: {
    name: 'SHA-ZAKU-II', faction: 'cr', role: 'commander', size: 'S', hp: 300, speed: 300, energy: 150, radius: 9, sprite: 'cr_SHA_ZAKUII',
    weapons: ['beam_rifle', 'missile3', 'heat_axe'],
  },
  cr_commander_2: {
    name: 'SHA-ZGOK', faction: 'cr', role: 'commander', size: 'S', hp: 460, speed: 200, radius: 9, sprite: 'cr_SHA_ZGOCK',
    weapons: ['beam_rifle', 'missile3', 'heat_axe'],
  },
  cr_commander_4: {
    name: 'ZGOK', faction: 'cr', role: 'grunt', size: 'S', hp: 310, speed: 90, radius: 9, sprite: 'cr_ZGOCK',
    weapons: ['beam_rifle', 'missile3', 'heat_axe'],
  },
  cr_heavy: {
    name: 'GYAN', faction: 'cr', role: 'heavy', size: 'S', hp: 480, speed: 80, radius: 10, sprite: 'cr_heavy',
    weapons: ['bazooka', 'missile5', 'heat_axe'],
  },
  cr_heavy_2: {
    name: 'AGGAI', faction: 'cr', role: 'heavy', size: 'S', hp: 480, speed: 80, radius: 10, sprite: 'cr_AGGAI',
    weapons: ['bazooka', 'missile5', 'heat_axe'],
  },
  cr_grunt: {
    name: 'ZAKU-II', faction: 'cr', role: 'grunt', size: 'S', hp: 205, speed: 100, radius: 8, sprite: 'cr_grunt',
    weapons: ['rifle', null, 'heat_axe'],
  },
  cr_grunt_2: {
    name: 'GELGOOG', faction: 'cr', role: 'special', size: 'S', hp: 245, speed: 120, energy: 120, radius: 8, sprite: 'cr_GELGOOG',
    weapons: ['rifle', 'vulcan', 'naginata'],
  },
  cr_special: {
    name: 'GUFU', faction: 'cr', role: 'special', size: 'S', hp: 230, speed: 110, radius: 8, sprite: 'cr_special',
    weapons: ['rifle', 'missile3', 'shock_whip'],
  },
  cr_artillery: {
    name: 'DOM', faction: 'cr', role: 'artillery', size: 'S', hp: 270, speed: 72, radius: 10, sprite: 'cr_artillery',
    weapons: ['cannon', 'beam_rifle', 'heat_axe'],
  },
  cr_artillery_2: {
    name: 'GOGG', faction: 'cr', role: 'artillery', size: 'S', hp: 270, speed: 72, radius: 10, sprite: 'cr_GOGG',
    weapons: ['beam_rifle', 'spread_beam', null],
  },
  cr_giant: {
    name: 'ZEONG', faction: 'cr', role: 'giant', size: 'M', hp: 980, speed: 52, energy: 160, radius: 22, sprite: 'cr_giant',
    weapons: ['mega_cannon', 'homing', null],
  },
  cr_unit_2: {
    name: 'HELMES', faction: 'cr', role: 'giant', size: 'M', hp: 1005, speed: 60, energy: 160, radius: 22, sprite: 'cr_HELMES',
    weapons: ['mega_cannon', 'spread_beam', null],
  },
  cr_unit_3: {
    name: 'PYSCHO-GUMDAM', faction: 'cr', role: 'giant', size: 'L', hp: 3310, speed: 20, energy: 1000, radius: 9, sprite: 'cr_PSYCHO',
    transform: { speed: 3, turn: 0.7, sprite: 'cr_PSYCHO2' },
    weapons: [{ id: 'mega_cannon', dmg: 155, energy: 100 }, { id: 'vulcan', dmg: 13.5, ammo: 560 }, { id: 'saber', dmg: 100 }],
  },
};
