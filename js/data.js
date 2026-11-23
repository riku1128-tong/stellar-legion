'use strict';
// 勢力・武装・機体・戦艦・編成のデータ。数値を変えるとゲームバランスが変わる。

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
//  kind:
//    bullet / shell / missile … 実弾。ammo（残弾）を使う。戦艦で補給できる
//    beam / charge            … ビーム。energy（ビームエネルギー）を使う。撃たずにいると回復する
//    melee                    … 格闘。弾もエネルギーも使わない
//  dmg: 威力, speed: 弾速, cooldown: 連射間隔(秒), range: 射程, count/arc: 同時に撃つ数と広がり（ラジアン）
//  missile の turn: 0 ならまっすぐ飛ぶ、0 より大きいと目標を追う（値が大きいほどよく曲がる）
//  charge の charge: 撃てるまでにボタンを押し続ける秒数。離すと発射
//  melee の style: slash（突進して斬る）/ spin（突進しながら回転して周りを斬る）/ whip（遠くまで伸びて当たった敵をしびれさせる）
//  melee の reach: 機体の中心から刃先までの距離（当たり判定。絵の刃もこの長さで描く）
//         arc: slash が振り抜く角度の半分（ラジアン）。この範囲にいる敵に当たる
//         blade: 刃の見た目（len: 刃の長さ, color: 'beam' なら勢力のビームの色, head: 'axe' なら斧の形, pole: 柄の長さ）
SL.WEAPONS = {
  // --- 実弾 ---（look: 弾の見た目。tracer = 曳光弾, shell = 砲弾, rocket = ロケット弾, missile / homing = ミサイル）
  rifle:       { name: 'MACHINE RIFLE',  short: 'RIFL', kind: 'bullet',  dmg: 7,   speed: 340, cooldown: 0.30, ammo: 60,  range: 280, spread: 0.06, r: 2, look: 'tracer' },
  vulcan:      { name: 'VULCAN',         short: 'VULC', kind: 'bullet',  dmg: 3.5, speed: 380, cooldown: 0.09, ammo: 160, range: 240, spread: 0.10, r: 1.5, look: 'tracerSmall' },
  cannon:      { name: 'CANNON',         short: 'CANN', kind: 'shell',   dmg: 20,  speed: 280, cooldown: 1.3,  ammo: 30,  range: 440, spread: 0.04, splash: 22, r: 3, look: 'shell' },
  bazooka:     { name: 'BAZOOKA',        short: 'BAZK', kind: 'shell',   dmg: 26,  speed: 230, cooldown: 1.2,  ammo: 12,  range: 300, spread: 0.03, splash: 20, r: 3, look: 'rocket' },
  missile3:    { name: '3WAY MISSILE',   short: '3WAY', kind: 'missile', dmg: 12,  speed: 170, maxSpeed: 330, turn: 0,   cooldown: 1.0, ammo: 8, range: 340, count: 3, arc: 0.5, life: 1.6, r: 2, look: 'missile' },
  missile5:    { name: '5WAY MISSILE',   short: '5WAY', kind: 'missile', dmg: 11,  speed: 160, maxSpeed: 310, turn: 0,   cooldown: 1.4, ammo: 6, range: 320, count: 5, arc: 0.9, life: 1.6, r: 2, look: 'missile' },
  homing:      { name: 'HOMING MISSILE', short: 'HOMG', kind: 'missile', dmg: 16,  speed: 140, maxSpeed: 300, turn: 3.6, cooldown: 1.1, ammo: 8, range: 400, count: 2, arc: 1.2, life: 2.8, r: 2, look: 'homing' },
  // --- ビーム ---
  beam_rifle:  { name: 'BEAM RIFLE',     short: 'BEAM', kind: 'beam',    dmg: 14,  speed: 480, cooldown: 0.45, energy: 12, range: 400, spread: 0.03, len: 12, w: 2 },
  spread_beam: { name: 'SPREAD BEAM',    short: 'SPRD', kind: 'beam',    dmg: 11,  speed: 380, cooldown: 1.6,  energy: 30, range: 360, spread: 0.02, count: 5, arc: 0.5, len: 14, w: 3 },
  mega_cannon: { name: 'MEGA BEAM CANNON', short: 'MEGA', kind: 'charge', dmg: 55, cooldown: 1.0,  energy: 55, charge: 1.4, range: 460, width: 9, dur: 0.4 },
  // --- 格闘 ---
  saber:       { name: 'BEAM SABER',     short: 'SABR', kind: 'melee', style: 'slash', dmg: 32, cooldown: 0.75, reach: 36, arc: 1.35, lunge: 230, lungeTime: 0.24,
                 blade: { len: 28, color: 'beam' } },
  heat_axe:    { name: 'HEAT AXE',       short: 'AXE',  kind: 'melee', style: 'slash', dmg: 38, cooldown: 0.85, reach: 36, arc: 1.35, lunge: 210, lungeTime: 0.24,
                 blade: { len: 26, color: '#ff9a3a', head: 'axe' } },
  naginata:    { name: 'NAGINATA',       short: 'NAGI', kind: 'melee', style: 'spin',  dmg: 28, cooldown: 1.1,  reach: 46, lunge: 140, lungeTime: 0.36,
                 blade: { len: 12, color: 'beam', pole: 32 } },
  shock_whip:  { name: 'SHOCK WHIP',     short: 'WHIP', kind: 'melee', style: 'whip',  dmg: 12, cooldown: 2.4,  reach: 48, stun: 0.8 },
};

// 役割ごとの AI の性格
//  prefRange: 敵との好みの距離, melee: 格闘を仕掛ける確率
SL.ROLES = {
  commander: { prefRange: 140, melee: 0.35 },
  raider:    { prefRange: 130, melee: 0.3 },
  heavy:     { prefRange: 170, melee: 0.25 },
  grunt:     { prefRange: 125, melee: 0.25 },
  special:   { prefRange: 110, melee: 0.5 },
  artillery: { prefRange: 270, melee: 0 },
  giant:     { prefRange: 230, melee: 0 },
};

// 機体。weapons は [主射撃 J, 副射撃 K, 格闘 L]（無い枠は null）
//  speed: 巡航速度（基本的にこの速さで一定。ブースト中だけ速くなる）
//  radius: 当たり判定の半径（画像の大きさとは別）, sprite: 絵の ID（asset-overrides.js で差し替え可能）
//  energy: ビームエネルギーの最大値（省略すると CONFIG.ENERGY_MAX）
//  transform: 変形できる機体だけ。移動モードの絵、速さの倍率、曲がりやすさの倍率
SL.UNIT_TYPES = {
  // --- アズール連合（ビーム兵器が多い） ---
  az_commander: { name: 'VANGUARD',   role: 'commander', hp: 380,  speed: 120, radius: 9,  sprite: 'az_commander', weapons: ['beam_rifle', 'homing', 'saber'] },
  az_raider:    { name: 'FALCON',     role: 'raider',    hp: 260,  speed: 115, radius: 8,  sprite: 'az_raider',    weapons: ['beam_rifle', 'missile3', 'saber'],
                  transform: { sprite: 'az_raider_jet', speed: 1.7, turn: 0.7 } },
  az_heavy:     { name: 'BASTION',    role: 'heavy',     hp: 460,  speed: 85,  radius: 10, sprite: 'az_heavy',     weapons: ['mega_cannon', 'missile5', 'saber'] },
  az_grunt:     { name: 'GUARD',      role: 'grunt',     hp: 200,  speed: 105, radius: 8,  sprite: 'az_grunt',     weapons: ['rifle', null, 'saber'] },
  az_special:   { name: 'GLAIVE',     role: 'special',   hp: 230,  speed: 110, radius: 8,  sprite: 'az_special',   weapons: ['rifle', 'missile3', 'naginata'] },
  az_artillery: { name: 'MORTAR',     role: 'artillery', hp: 260,  speed: 75,  radius: 10, sprite: 'az_artillery', weapons: ['cannon', 'beam_rifle', null] },
  az_giant:     { name: 'CITADEL',    role: 'giant',     hp: 1000, speed: 50,  radius: 22, sprite: 'az_giant',     weapons: ['spread_beam', 'missile5', null], energy: 160 },
  // --- クリムゾン帝国（実弾と格闘が多い） ---
  cr_commander: { name: 'TRIBUNE',    role: 'commander', hp: 360,  speed: 125, radius: 9,  sprite: 'cr_commander', weapons: ['beam_rifle', 'missile3', 'naginata'] },
  cr_raider:    { name: 'WASP',       role: 'raider',    hp: 250,  speed: 118, radius: 8,  sprite: 'cr_raider',    weapons: ['vulcan', 'homing', 'heat_axe'],
                  transform: { sprite: 'cr_raider_jet', speed: 1.7, turn: 0.7 } },
  cr_heavy:     { name: 'JUGGERNAUT', role: 'heavy',     hp: 480,  speed: 80,  radius: 10, sprite: 'cr_heavy',     weapons: ['bazooka', 'missile5', 'heat_axe'] },
  cr_grunt:     { name: 'LEGIONARY',  role: 'grunt',     hp: 205,  speed: 100, radius: 8,  sprite: 'cr_grunt',     weapons: ['rifle', null, 'heat_axe'] },
  cr_special:   { name: 'STINGER',    role: 'special',   hp: 230,  speed: 110, radius: 8,  sprite: 'cr_special',   weapons: ['rifle', 'missile3', 'shock_whip'] },
  cr_artillery: { name: 'HOWITZER',   role: 'artillery', hp: 270,  speed: 72,  radius: 10, sprite: 'cr_artillery', weapons: ['cannon', 'beam_rifle', null] },
  cr_giant:     { name: 'LEVIATHAN',  role: 'giant',     hp: 980,  speed: 52,  radius: 22, sprite: 'cr_giant',     weapons: ['spread_beam', 'homing', null], energy: 160 },
};

// 戦艦（各チーム 1 隻。攻撃はしない。中に入った味方の機体を修理・補給する）
//  radius: 当たり判定, dockR: この距離まで入ると「戦艦の中」になる
SL.SHIPS = [
  { name: 'AURORA',   sprite: 'az_ship', hp: 3000, radius: 34, dockR: 26, x: 150,                       y: SL.CONFIG.FIELD_H / 2 },
  { name: 'BEHEMOTH', sprite: 'cr_ship', hp: 3000, radius: 34, dockR: 26, x: SL.CONFIG.FIELD_W - 150,   y: SL.CONFIG.FIELD_H / 2 },
];

// 1 軍 16 機の編成と陣形。fx は敵の方向が +（チーム 1 では左右反転する）
// 並び順は Tab で乗り換えるときの順番でもある
SL.ARMY = [
  { role: 'commander', fx: 70,   fy: 0 },
  { role: 'raider',    fx: 50,   fy: -150 },
  { role: 'raider',    fx: 50,   fy: 150 },
  { role: 'heavy',     fx: 30,   fy: -55 },
  { role: 'grunt',     fx: 10,   fy: -110 },
  { role: 'grunt',     fx: 10,   fy: 110 },
  { role: 'grunt',     fx: -30,  fy: -55 },
  { role: 'grunt',     fx: -30,  fy: 55 },
  { role: 'grunt',     fx: -60,  fy: 0 },
  { role: 'grunt',     fx: -75,  fy: -110 },
  { role: 'grunt',     fx: -75,  fy: 110 },
  { role: 'special',   fx: -100, fy: -55 },
  { role: 'special',   fx: -100, fy: 55 },
  { role: 'artillery', fx: -150, fy: -90 },
  { role: 'artillery', fx: -150, fy: 90 },
  { role: 'giant',     fx: -205, fy: 0 },
];
