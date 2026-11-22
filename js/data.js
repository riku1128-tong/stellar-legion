'use strict';
// 勢力・武装・機体・編成のデータ。数値を変えるとゲームバランスが変わる。

// 勢力（index 0 = 左側 / 1P 側、1 = 右側 / 2P 側）
SL.FACTIONS = [
  {
    prefix: 'az', name: 'AZURE UNION',
    color: '#5ab4ff',   // ミニマップや HUD での勢力の色
    beam: '#8ff4ff',    // ビームの色
    palette: { main: '#3f7fe0', light: '#e4ecf6', dark: '#1f3f80', accent: '#ffd23a', visor: '#6ff6ff', metal: '#9aa4b4', outline: '#0b1020' },
  },
  {
    prefix: 'cr', name: 'CRIMSON EMPIRE',
    color: '#ff6060',
    beam: '#ff6ad5',
    palette: { main: '#4f9a48', light: '#93cf7c', dark: '#2a5528', accent: '#ff8a2a', visor: '#ff4fd8', metal: '#8a8c98', outline: '#120a0e', red: '#d23a3a' },
  },
];

// 武装
//  kind: beam / bullet / missile / shell / melee
//  dmg: 威力, speed: 弾速, cooldown: 連射間隔(秒), ammo: 最大弾数, regen: 1 発回復する秒数, range: 射程
SL.WEAPONS = {
  beam_rifle:  { name: 'BEAM RIFLE', short: 'BEAM', kind: 'beam',    dmg: 13,  speed: 460, cooldown: 0.42, ammo: 14,  regen: 2.5,  range: 330, spread: 0.03, len: 12, w: 2 },
  rifle:       { name: 'RIFLE',      short: 'RIFL', kind: 'bullet',  dmg: 7,   speed: 330, cooldown: 0.34, ammo: 40,  regen: 1.2,  range: 270, spread: 0.06, r: 2 },
  machinegun:  { name: 'VULCAN',     short: 'VULC', kind: 'bullet',  dmg: 3.5, speed: 380, cooldown: 0.09, ammo: 120, regen: 0.35, range: 240, spread: 0.10, r: 1.5 },
  missile:     { name: 'MISSILE',    short: 'MSL',  kind: 'missile', dmg: 15,  speed: 150, maxSpeed: 300, turn: 3.2, cooldown: 1.2, ammo: 8, regen: 6, range: 380, salvo: 2, life: 2.6, r: 2 },
  cannon:      { name: 'CANNON',     short: 'CANN', kind: 'shell',   dmg: 20,  speed: 280, cooldown: 1.3,  ammo: 24,  regen: 3,    range: 440, spread: 0.04, splash: 22, r: 3 },
  bazooka:     { name: 'BAZOOKA',    short: 'BAZK', kind: 'shell',   dmg: 26,  speed: 230, cooldown: 1.2,  ammo: 10,  regen: 4,    range: 300, spread: 0.03, splash: 20, r: 3 },
  spread_beam: { name: 'MEGA BEAM',  short: 'MEGA', kind: 'beam',    dmg: 11,  speed: 380, cooldown: 1.7,  ammo: 30,  regen: 2,    range: 360, spread: 0.02, count: 5, arc: 0.5, len: 14, w: 3 },
  saber:       { name: 'BEAM SABER', short: 'SABR', kind: 'melee',   dmg: 34,  cooldown: 0.75, reach: 16, lunge: 230, lungeTime: 0.22, ammo: Infinity },
  heat_axe:    { name: 'HEAT AXE',   short: 'AXE',  kind: 'melee',   dmg: 36,  cooldown: 0.85, reach: 17, lunge: 210, lungeTime: 0.24, ammo: Infinity },
};

// 役割ごとの AI の性格
//  prefRange: 敵との好みの距離, melee: 格闘を仕掛ける確率
SL.ROLES = {
  commander: { prefRange: 140, melee: 0.35 },
  grunt:     { prefRange: 125, melee: 0.25 },
  artillery: { prefRange: 270, melee: 0 },
  fighter:   { prefRange: 90,  melee: 0 },
  heavy:     { prefRange: 160, melee: 0.3 },
  giant:     { prefRange: 230, melee: 0 },
};

// 機体。weapons は [主射撃, 副射撃, 格闘]（無い枠は null）
//  radius: 当たり判定の半径（画像の大きさとは別）, sprite: 絵の ID（asset-overrides.js で差し替え可能）
SL.UNIT_TYPES = {
  // --- アズール連合 ---
  az_commander: { name: 'VANGUARD',   role: 'commander', hp: 380,  speed: 120, accel: 5.0, radius: 9,  sprite: 'az_commander', weapons: ['beam_rifle', 'missile', 'saber'] },
  az_grunt:     { name: 'GUARD',      role: 'grunt',     hp: 200,  speed: 102, accel: 4.5, radius: 8,  sprite: 'az_grunt',     weapons: ['rifle', null, 'saber'] },
  az_artillery: { name: 'MORTAR',     role: 'artillery', hp: 260,  speed: 70,  accel: 3.0, radius: 10, sprite: 'az_artillery', weapons: ['cannon', 'missile', null] },
  az_fighter:   { name: 'SWIFT',      role: 'fighter',   hp: 150,  speed: 178, accel: 3.5, radius: 7,  sprite: 'az_fighter',   weapons: ['machinegun', 'missile', null] },
  az_heavy:     { name: 'BASTION',    role: 'heavy',     hp: 460,  speed: 80,  accel: 3.5, radius: 10, sprite: 'az_heavy',     weapons: ['bazooka', null, 'saber'] },
  az_giant:     { name: 'CITADEL',    role: 'giant',     hp: 1000, speed: 45,  accel: 2.0, radius: 22, sprite: 'az_giant',     weapons: ['spread_beam', 'missile', null] },
  // --- クリムゾン帝国 ---
  cr_commander: { name: 'TRIBUNE',    role: 'commander', hp: 360,  speed: 128, accel: 5.2, radius: 9,  sprite: 'cr_commander', weapons: ['beam_rifle', 'missile', 'heat_axe'] },
  cr_grunt:     { name: 'LEGIONARY',  role: 'grunt',     hp: 205,  speed: 96,  accel: 4.3, radius: 8,  sprite: 'cr_grunt',     weapons: ['rifle', null, 'heat_axe'] },
  cr_artillery: { name: 'HOWITZER',   role: 'artillery', hp: 270,  speed: 68,  accel: 3.0, radius: 10, sprite: 'cr_artillery', weapons: ['cannon', 'missile', null] },
  cr_fighter:   { name: 'WASP',       role: 'fighter',   hp: 145,  speed: 185, accel: 3.6, radius: 7,  sprite: 'cr_fighter',   weapons: ['machinegun', 'missile', null] },
  cr_heavy:     { name: 'JUGGERNAUT', role: 'heavy',     hp: 480,  speed: 76,  accel: 3.4, radius: 10, sprite: 'cr_heavy',     weapons: ['bazooka', null, 'heat_axe'] },
  cr_giant:     { name: 'LEVIATHAN',  role: 'giant',     hp: 980,  speed: 48,  accel: 2.0, radius: 22, sprite: 'cr_giant',     weapons: ['spread_beam', 'missile', null] },
};

// 1 軍 16 機の編成と陣形。fx は敵の方向が +（チーム 1 では左右反転する）
SL.ARMY = [
  { role: 'commander', fx: 70,   fy: 0 },
  { role: 'heavy',     fx: 30,   fy: -55 },
  { role: 'grunt',     fx: 10,   fy: -110 },
  { role: 'grunt',     fx: 10,   fy: 110 },
  { role: 'grunt',     fx: -30,  fy: -55 },
  { role: 'grunt',     fx: -30,  fy: 55 },
  { role: 'grunt',     fx: -60,  fy: 0 },
  { role: 'grunt',     fx: -75,  fy: -110 },
  { role: 'grunt',     fx: -75,  fy: 110 },
  { role: 'grunt',     fx: -100, fy: -55 },
  { role: 'grunt',     fx: -100, fy: 55 },
  { role: 'artillery', fx: -150, fy: -90 },
  { role: 'artillery', fx: -150, fy: 90 },
  { role: 'fighter',   fx: 40,   fy: -165 },
  { role: 'fighter',   fx: 40,   fy: 165 },
  { role: 'giant',     fx: -205, fy: 0 },
];
