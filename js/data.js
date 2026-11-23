'use strict';
// 勢力・機体・戦艦・陣形のデータ。
// 武装の性能は js/weapons.js、機体は js/units.js、何を何体出すかは js/army.js にある。

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

// 機体の定義は js/units.js（SL.UNIT_TYPES）。ここでは足りない項目を埋めて、武装を組み立てる
//  t.slots: [主射撃, 副射撃, 格闘] の { id, def }。def は武装の性能に、機体ごとの値（dmg / ammo / energy）を重ねたもの
//  box: 絵の長い辺を、戦艦の絵の長い辺の何倍にするか（0 なら絵のまま）。当たり判定と格闘の届く距離も同じ割合で大きくなる
SL.SIZES = {
  S: { box: 0 },  // ふつう（絵も当たり判定も機体の設定のまま）
  M: { box: 1 },  // 戦艦くらい
  L: { box: 2 },  // 戦艦の 2 倍
};
SL.SLOT_FIELDS = ['dmg', 'ammo', 'energy'];
for (const id in SL.UNIT_TYPES) {
  const t = SL.UNIT_TYPES[id];
  t.faction = t.faction || id.split('_')[0];
  t.size = SL.SIZES[t.size] ? t.size : 'S';
  t.radius = t.radius || 8;
  t.sprite = t.sprite || id;
  if (t.transform && !t.transform.sprite) t.transform.sprite = t.faction + '_raider_jet';
  const list = t.weapons || [];
  t.slots = [0, 1, 2].map((k) => {
    const s = list[k];
    if (!s) return null;
    const wid = typeof s === 'string' ? s : s.id;
    const base = SL.WEAPONS[wid];
    if (!base) {
      console.warn('[STELLAR LEGION] 知らない武装です: ' + wid + '（' + id + '）。「なし」として扱います');
      return null;
    }
    const def = Object.assign({}, base);
    if (typeof s === 'object') for (const f of SL.SLOT_FIELDS) if (typeof s[f] === 'number') def[f] = s[f];
    return { id: wid, def };
  });
}

// 勢力（'az' / 'cr'）の機体の ID を、ファイルに書いた順に返す
SL.typesOf = function (prefix) {
  return Object.keys(SL.UNIT_TYPES).filter((id) => SL.UNIT_TYPES[id].faction === prefix);
};

// 戦艦（各チーム 1 隻。攻撃はしない。中に入った味方の機体を修理・補給する）
//  radius: 当たり判定, dockR: この距離まで入ると「戦艦の中」になる
SL.SHIPS = [
  { name: 'AURORA',   sprite: 'az_ship', hp: 3000, radius: 34, dockR: 26, x: 150,                       y: SL.CONFIG.FIELD_H / 2 },
  { name: 'BEHEMOTH', sprite: 'cr_ship', hp: 3000, radius: 34, dockR: 26, x: SL.CONFIG.FIELD_W - 150,   y: SL.CONFIG.FIELD_H / 2 },
];

// 陣形：役割ごとに列を作って並べる。fx は敵の方向が +（チーム 1 では左右反転する）
//  x: 列の位置, gap: 縦の間隔, per: 1 列に並べる数（あふれたら後ろの列へ）
SL.ROLE_ORDER = ['commander', 'raider', 'heavy', 'grunt', 'special', 'artillery', 'giant'];
SL.FORMATION = {
  commander: { x: 70,   gap: 60,  per: 3 },
  raider:    { x: 50,   gap: 300, per: 4 },
  heavy:     { x: 30,   gap: 110, per: 3 },
  grunt:     { x: 10,   gap: 55,  per: 5 },
  special:   { x: -100, gap: 110, per: 4 },
  artillery: { x: -150, gap: 180, per: 4 },
  giant:     { x: -205, gap: 120, per: 3 },
};
SL.ARMY_MAX = 30;
SL.FORMATION_SCALE = 1.3; // 戦場ではこの倍率で陣形を広げる（出撃画面では縮めて見せる）

// 出撃の設定（{ 機体の ID: 体数 }）から、編成と陣形の一覧を作る。並び順は Tab で乗り換える順番でもある
//  役割ごとに列を作る。同じ役割の機体が何種類あっても、続けて同じ列に並べる
//  （古い書き方の { 役割: 体数 } も読める。その役割の最初の機体として数える）
SL.buildArmy = function (counts, prefix) {
  counts = counts || {};
  const types = SL.typesOf(prefix);
  const firstOfRole = {};
  const list = [];
  for (const role of SL.ROLE_ORDER) {
    const c = SL.FORMATION[role];
    const ids = [];
    for (const id of types) {
      if (SL.UNIT_TYPES[id].role !== role) continue;
      let n = counts[id];
      if (n === undefined && !firstOfRole[role]) n = counts[role];
      firstOfRole[role] = true;
      n = Math.max(0, Math.min(SL.ARMY_MAX, Math.floor(Number(n) || 0)));
      for (let i = 0; i < n; i++) ids.push(id);
    }
    ids.length = Math.min(ids.length, Math.max(0, SL.ARMY_MAX - list.length));
    const n = ids.length;
    ids.forEach((type, i) => {
      const col = Math.floor(i / c.per);
      const inCol = Math.min(c.per, n - col * c.per);
      const row = i % c.per;
      list.push({ type, role, fx: c.x - col * 35, fy: (row - (inCol - 1) / 2) * c.gap });
    });
  }
  if (list.length === 0 && types.length) { // 0 体にはしない
    list.push({ type: types[0], role: SL.UNIT_TYPES[types[0]].role, fx: 10, fy: 0 });
  }
  return list;
};

SL.armyFor = function (team, countsByFaction) {
  const counts = countsByFaction || SL.ARMY_COUNTS || {};
  const prefix = SL.FACTIONS[team].prefix;
  return SL.buildArmy(counts[prefix], prefix);
};
