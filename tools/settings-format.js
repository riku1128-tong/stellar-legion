'use strict';
// 設定ファイル（js/weapons.js, js/units.js, js/army.js）の中身を組み立てる。
// 設定ページ（アーティファクト「STELLAR LEGION 兵器と出撃」）と tools/settings.js の両方で使う。
//  values = {
//    weapons: [{ id, name, kind, dmg, ... }],                       … 武装の性能（並び順もこのとおり）
//    units:   [{ id, name, faction, role, size, hp, ..., weapons }], … 機体（並び順もこのとおり）
//    army:    { az: { 機体ID: 体数 }, cr: {...} },                    … 出撃する体数
//  }
//  game = { factions: [{ prefix }], roleOrder: [...], formation, armyMax }（並び順と陣形に使う）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SLSettingsFormat = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FACTION_LABELS = { az: 'アズール連合', cr: 'クリムゾン帝国' };
  const ROLE_LABELS = {
    commander: '隊長機', raider: '遊撃機', heavy: '重装機', grunt: '量産機',
    special: '格闘機', artillery: '砲撃機', giant: '巨大機',
  };
  const KIND_LABELS = {
    bullet: '実弾', shell: '砲弾', missile: 'ミサイル', beam: 'ビーム', charge: 'チャージ', melee: '格闘',
  };
  const SIZE_LABELS = { S: 'S（ふつう）', M: 'M（戦艦くらい）', L: 'L（戦艦の 2 倍）' };
  const GROUPS = [
    { label: '実弾', kinds: ['bullet', 'shell', 'missile'] },
    { label: 'ビーム', kinds: ['beam', 'charge'] },
    { label: '格闘', kinds: ['melee'] },
  ];
  const RANGED = ['bullet', 'shell', 'missile', 'beam'];
  // 機体ごとに変えられる武装の値
  const SLOT_FIELDS = ['dmg', 'ammo', 'energy'];

  // ファイルに書くときの項目の順番（ここに無い項目は後ろに名前順で並べる）
  const KEY_ORDER = [
    'id', 'name', 'short', 'faction', 'kind', 'style', 'role', 'size', 'hp', 'dmg', 'speed', 'maxSpeed', 'turn',
    'cooldown', 'ammo', 'energy', 'charge', 'range', 'reach', 'spread', 'count', 'arc', 'splash', 'life', 'width',
    'dur', 'lunge', 'lungeTime', 'stun', 'radius', 'r', 'len', 'w', 'look', 'sprite', 'blade',
  ];
  const IDENT = /^[A-Za-z_$][\w$]*$/;

  function num(v) {
    return String(Number(Number(v).toFixed(6)));
  }
  function orderKeys(keys) {
    const known = KEY_ORDER.filter((k) => keys.indexOf(k) >= 0);
    const rest = keys.filter((k) => KEY_ORDER.indexOf(k) < 0).sort();
    return known.concat(rest);
  }
  function key(k) {
    return IDENT.test(k) ? k : lit(k);
  }
  function props(v) {
    return orderKeys(Object.keys(v).filter((k) => v[k] !== undefined)).map((k) => key(k) + ': ' + lit(v[k]));
  }
  // JavaScript の値の書き方にする（文字列は '…'、オブジェクトは { a: 1 } の 1 行）
  function lit(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return num(v);
    if (typeof v === 'boolean') return String(v);
    if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    if (Array.isArray(v)) return '[' + v.map(lit).join(', ') + ']';
    const p = props(v);
    return p.length ? '{ ' + p.join(', ') + ' }' : '{}';
  }

  // 書き出す武装の中身（id を外し、意味のない既定値は省く）
  function weaponBody(w) {
    const out = {};
    for (const k of Object.keys(w)) if (k !== 'id') out[k] = w[k];
    if (RANGED.indexOf(w.kind) >= 0) {
      if (!(out.count > 1)) {
        delete out.count;
        delete out.arc;
      }
      if (out.spread === 0) delete out.spread;
    }
    if (w.kind === 'missile' && out.turn === undefined) out.turn = 0;
    return out;
  }

  // 機体の武装の枠：武装の名前だけ、または { id, dmg, ammo, energy }（武装の値を機体ごとに変えるとき）
  function slotBody(s) {
    if (!s) return null;
    if (typeof s === 'string') return s;
    const out = { id: s.id };
    for (const k of SLOT_FIELDS) if (typeof s[k] === 'number') out[k] = s[k];
    return Object.keys(out).length === 1 ? s.id : out;
  }

  const WEAPONS_HEADER = [
    "'use strict';",
    '// 武装の設定ファイル（どの機体が何を持つかは js/units.js）',
    '// 設定ページ（アーティファクト「STELLAR LEGION 兵器と出撃」）で値を変えて、この中身をまるごと貼り替えてもよい。',
    '//',
    '// kind（武装の種類）:',
    '//   bullet / shell / missile … 実弾。ammo（残弾）を使う。戦艦で補給できる',
    '//   beam / charge            … ビーム。energy（ビームエネルギー）を使う。撃たずにいると回復する',
    '//   melee                    … 格闘。弾もエネルギーも使わない',
    '// 主な項目:',
    '//   dmg: 威力, speed: 弾速, cooldown: 連射間隔(秒), range: 射程, spread: ばらつき（ラジアン）',
    '//   count / arc: 同時に撃つ数と広がり（ラジアン）, splash: 爆発の半径',
    '//   missile の maxSpeed: 最高速度, turn: 曲がる強さ（0 ならまっすぐ飛ぶ）, life: 飛んでいる秒数',
    '//   charge の charge: 撃てるまでにボタンを押し続ける秒数, width: ビームの太さ, dur: ビームが残る秒数',
    '//   melee の reach: 機体の中心から刃先までの距離, arc: 振り抜く角度の半分（ラジアン）,',
    '//            lunge: 踏み込む速さ, lungeTime: 踏み込む秒数, stun: しびれさせる秒数',
    '//   name / short / look / r / len / w / blade は見た目（表示名、弾の形、刃の形など）',
  ];

  const UNITS_HEADER = [
    "'use strict';",
    '// 機体の設定ファイル（武装の性能は js/weapons.js、出撃する体数は js/army.js）',
    '// 設定ページ（アーティファクト「STELLAR LEGION 兵器と出撃」）で機体を足したり値を変えたりして、',
    '// この中身をまるごと貼り替えてもよい。',
    '//',
    '//   name: 表示名（英大文字）, faction: 勢力（az / cr）',
    '//   role: AI の動き方と陣形の列（commander 隊長機, raider 遊撃機, heavy 重装機, grunt 量産機,',
    '//         special 格闘機, artillery 砲撃機, giant 巨大機）',
    '//   size: 大きさ（S = ふつう, M = 戦艦くらい, L = 戦艦の 2 倍）。M と L は当たり判定と格闘の届く距離も大きくなる',
    '//   hp: 耐久力, speed: 巡航速度, energy: ビームエネルギーの最大値（省略すると 100）',
    '//   radius: S のときの当たり判定の半径（絵の大きさとは別）',
    "//   sprite: 絵の ID（js/asset-overrides.js の表の名前。新しい ID なら、役割に合った仮の図形で出る）",
    '//   transform: Shift で変形できる機体だけ。sprite: 移動モードの絵, speed: 速さの倍率, turn: 曲がりやすさの倍率',
    '//   weapons: [主射撃 J, 副射撃 K, 格闘 L]。無い枠は null。',
    "//            武装の値を機体ごとに変えるときは { id: 'rifle', dmg: 9, ammo: 80 } のように書く（dmg / ammo / energy）",
  ];

  const ARMY_HEADER = [
    "'use strict';",
    '// 出撃の設定ファイル：各勢力から、どの機体を何体出すか（機体の ID: 体数）',
    '//  az = アズール連合（左）, cr = クリムゾン帝国（右）。機体の ID は js/units.js の名前',
    '//  1 勢力 1〜30 体。陣形は役割と体数に合わせて自動で組まれる。戦艦は別に 1 隻ずつ出る。',
    '// 設定ページ（アーティファクト「STELLAR LEGION 兵器と出撃」）で値を変えて、この中身をまるごと貼り替えてもよい。',
  ];

  function weaponsFile(values) {
    const lines = WEAPONS_HEADER.slice();
    lines.push('SL.WEAPONS = {');
    const used = {};
    const put = (w) => {
      used[w.id] = true;
      lines.push('  ' + key(w.id) + ': ' + lit(weaponBody(w)) + ',');
    };
    for (const g of GROUPS) {
      const list = values.weapons.filter((w) => g.kinds.indexOf(w.kind) >= 0);
      if (!list.length) continue;
      lines.push('  // --- ' + g.label + ' ---');
      list.forEach(put);
    }
    const rest = values.weapons.filter((w) => !used[w.id]);
    if (rest.length) {
      lines.push('  // --- その他 ---');
      rest.forEach(put);
    }
    lines.push('};', '');
    return lines.join('\n');
  }

  function unitsFile(values, game) {
    const lines = UNITS_HEADER.slice();
    lines.push('SL.UNIT_TYPES = {');
    const prefixes = game.factions.map((f) => f.prefix);
    const groups = prefixes.map((p) => ({ p, list: values.units.filter((u) => u.faction === p) }));
    const rest = values.units.filter((u) => prefixes.indexOf(u.faction) < 0);
    if (rest.length) groups.push({ p: null, list: rest });
    for (const g of groups) {
      if (!g.list.length) continue;
      lines.push('  // --- ' + (g.p ? FACTION_LABELS[g.p] || g.p : 'その他') + ' ---');
      for (const u of g.list) {
        const main = {};
        for (const k of ['name', 'faction', 'role', 'size', 'hp', 'speed', 'energy', 'radius', 'sprite']) {
          if (u[k] !== undefined && u[k] !== null) main[k] = u[k];
        }
        lines.push('  ' + key(u.id) + ': {');
        lines.push('    ' + props(main).join(', ') + ',');
        if (u.transform) lines.push('    transform: ' + lit({ sprite: u.transform.sprite, speed: u.transform.speed, turn: u.transform.turn }) + ',');
        lines.push('    weapons: [' + [0, 1, 2].map((k) => lit(slotBody((u.weapons || [])[k]))).join(', ') + '],');
        lines.push('  },');
      }
    }
    lines.push('};', '');
    return lines.join('\n');
  }

  function armyFile(values, game) {
    const lines = ARMY_HEADER.slice();
    lines.push('SL.ARMY_COUNTS = {');
    for (const f of game.factions) {
      const c = values.army[f.prefix] || {};
      lines.push('  ' + key(f.prefix) + ': {');
      for (const u of values.units.filter((x) => x.faction === f.prefix)) {
        const n = Math.max(0, Math.floor(Number(c[u.id]) || 0));
        lines.push('    ' + key(u.id) + ': ' + n + ',  // ' + u.name + ' ' + (ROLE_LABELS[u.role] || u.role));
      }
      lines.push('  },');
    }
    lines.push('};', '');
    return lines.join('\n');
  }

  // 出撃の設定から陣形を作る（js/data.js の SL.buildArmy と同じ並べ方）
  //  役割ごとに列を作る。同じ役割の機体が何種類あっても、続けて同じ列に並べる
  function buildArmy(counts, prefix, values, game) {
    counts = counts || {};
    const types = values.units.filter((u) => u.faction === prefix);
    const list = [];
    for (const role of game.roleOrder) {
      const c = game.formation[role];
      const ids = [];
      for (const u of types.filter((t) => t.role === role)) {
        const n = Math.max(0, Math.floor(Number(counts[u.id]) || 0));
        for (let i = 0; i < n; i++) ids.push(u.id);
      }
      ids.length = Math.min(ids.length, Math.max(0, game.armyMax - list.length));
      const n = ids.length;
      ids.forEach((id, i) => {
        const col = Math.floor(i / c.per);
        const inCol = Math.min(c.per, n - col * c.per);
        const row = i % c.per;
        list.push({ type: id, role, fx: c.x - col * 35, fy: (row - (inCol - 1) / 2) * c.gap });
      });
    }
    if (list.length === 0 && types.length) list.push({ type: types[0].id, role: types[0].role, fx: 10, fy: 0 });
    return list;
  }

  // ---------------- 読み込んだゲーム（SL）から値を取り出す ----------------
  //  data.js が足した項目（slots など）は外し、ファイルに書く形にそろえる
  function exportFromSL(SL) {
    const C = SL.CONFIG;
    const sprites = {};
    for (const id of Object.keys(SL.ASSET_OVERRIDES || {})) sprites[id] = true;
    for (const id of Object.keys(SL.UNIT_TYPES)) {
      const t = SL.UNIT_TYPES[id];
      sprites[t.sprite] = true;
      if (t.transform) sprites[t.transform.sprite] = true;
    }
    for (const s of SL.SHIPS) delete sprites[s.sprite];
    const spriteSizes = {};
    const map = SL.ASSET_OVERRIDES || {};
    for (const id of Object.keys(map)) {
      const spec = map[id];
      if (spec && typeof spec === 'object' && spec.height) spriteSizes[id] = { height: spec.height, maxWidth: spec.maxWidth || Math.round(spec.height * 1.5) };
    }
    const game = {
      factions: SL.FACTIONS.map((f) => ({ prefix: f.prefix, name: f.name, label: FACTION_LABELS[f.prefix] || f.name, color: f.color })),
      roleOrder: SL.ROLE_ORDER.slice(),
      roles: SL.ROLES,
      formation: SL.FORMATION,
      formationScale: SL.FORMATION_SCALE,
      armyMax: SL.ARMY_MAX,
      sizes: SL.SIZES,
      field: { w: C.FIELD_W, h: C.FIELD_H, edge: 60 },
      spawn: C.SPAWN,
      ships: SL.SHIPS.map((s) => ({ name: s.name, sprite: s.sprite, x: s.x, y: s.y, radius: s.radius })),
      sprites: Object.keys(sprites),
      spriteSizes,
      energyMax: C.ENERGY_MAX,
      damageScale: C.DAMAGE_SCALE,
    };
    const units = Object.keys(SL.UNIT_TYPES).map((id) => {
      const t = SL.UNIT_TYPES[id];
      const u = { id, name: t.name, faction: t.faction, role: t.role, size: t.size, hp: t.hp, speed: t.speed, radius: t.radius, sprite: t.sprite };
      if (t.energy) u.energy = t.energy;
      if (t.transform) u.transform = { sprite: t.transform.sprite, speed: t.transform.speed, turn: t.transform.turn };
      u.weapons = [0, 1, 2].map((k) => (t.weapons || [])[k] || null);
      return u;
    });
    const values = {
      weapons: Object.keys(SL.WEAPONS).map((id) => Object.assign({ id }, SL.WEAPONS[id])),
      units,
      army: SL.ARMY_COUNTS,
    };
    return JSON.parse(JSON.stringify({ game, values }));
  }

  // ---------------- 値の検査（おかしければ理由の一覧を返す） ----------------
  function validate(values, game) {
    const errs = [];
    const KINDS = Object.keys(KIND_LABELS);
    const NAME = /^[A-Z0-9 !?.,;\-+/()<>=%*_[\]]+$/;
    const pos = (v) => typeof v === 'number' && isFinite(v) && v > 0;
    const weapons = {};
    if (!Array.isArray(values.weapons)) errs.push('weapons が配列ではありません');
    for (const w of values.weapons || []) {
      if (!/^[a-z_][a-z0-9_]*$/.test(w.id || '')) errs.push('武装の ID がおかしい: ' + w.id);
      if (weapons[w.id]) errs.push('武装の ID が重複: ' + w.id);
      weapons[w.id] = w;
      if (KINDS.indexOf(w.kind) < 0) errs.push(w.id + ': kind がおかしい: ' + w.kind);
      if (!NAME.test(w.name || '')) errs.push(w.id + ': 名前は英大文字・数字・記号で書く: ' + w.name);
      for (const k of Object.keys(w)) {
        if (typeof w[k] === 'number' && !isFinite(w[k])) errs.push(w.id + '.' + k + ' が数ではありません');
      }
      if (!pos(w.dmg) || !pos(w.cooldown)) errs.push(w.id + ': dmg と cooldown は 0 より大きくする');
    }
    const prefixes = game.factions.map((f) => f.prefix);
    const units = {};
    if (!Array.isArray(values.units)) errs.push('units が配列ではありません');
    for (const u of values.units || []) {
      const tag = '機体 ' + u.id;
      if (!/^[a-z][a-z0-9_]*$/.test(u.id || '')) errs.push('機体の ID がおかしい: ' + u.id);
      if (units[u.id]) errs.push('機体の ID が重複: ' + u.id);
      units[u.id] = u;
      if (prefixes.indexOf(u.faction) < 0) errs.push(tag + ': 勢力がおかしい: ' + u.faction);
      if (game.roleOrder.indexOf(u.role) < 0) errs.push(tag + ': 役割がおかしい: ' + u.role);
      if (!game.sizes[u.size]) errs.push(tag + ': サイズは S / M / L: ' + u.size);
      if (!NAME.test(u.name || '')) errs.push(tag + ': 名前は英大文字・数字・記号で書く: ' + u.name);
      if (!pos(u.hp) || !pos(u.speed) || !pos(u.radius)) errs.push(tag + ': hp / speed / radius は 0 より大きくする');
      if (u.energy !== undefined && !pos(u.energy)) errs.push(tag + ': energy は 0 より大きくする');
      if (!/^[A-Za-z0-9_]+$/.test(u.sprite || '')) errs.push(tag + ': 絵の ID がおかしい: ' + u.sprite);
      if (u.transform && (!pos(u.transform.speed) || !pos(u.transform.turn) || !/^[A-Za-z0-9_]+$/.test(u.transform.sprite || ''))) {
        errs.push(tag + ': 変形の設定がおかしい');
      }
      const slots = u.weapons || [];
      if (!Array.isArray(slots) || slots.length > 3) { errs.push(tag + ': weapons は 3 枠まで'); continue; }
      slots.forEach((s, k) => {
        if (!s) return;
        const wid = typeof s === 'string' ? s : s.id;
        const w = weapons[wid];
        if (!w) { errs.push(tag + ': 知らない武装 ' + wid); return; }
        if (k === 2 && w.kind !== 'melee') errs.push(tag + ': L（格闘）に格闘以外の ' + wid);
        if (k < 2 && w.kind === 'melee') errs.push(tag + ': ' + 'JK'[k] + '（射撃）に格闘の ' + wid);
        if (typeof s === 'object') {
          for (const f of Object.keys(s)) {
            if (f === 'id') continue;
            if (SLOT_FIELDS.indexOf(f) < 0) errs.push(tag + ': 機体ごとに変えられない項目 ' + f);
            else if (!(typeof s[f] === 'number' && s[f] >= 0 && isFinite(s[f]))) errs.push(tag + ': ' + wid + ' の ' + f + ' がおかしい');
          }
        }
      });
    }
    for (const f of game.factions) {
      const c = (values.army || {})[f.prefix] || {};
      let total = 0;
      for (const id of Object.keys(c)) {
        const n = c[id];
        if (!units[id] || units[id].faction !== f.prefix) errs.push(f.prefix + ': 出撃にこの勢力の機体ではない ' + id);
        else if (!Number.isInteger(n) || n < 0) errs.push(f.prefix + '.' + id + ' の体数がおかしい: ' + n);
        else total += n;
      }
      if (total < 1 || total > game.armyMax) errs.push(f.prefix + ' の合計が ' + total + ' 体（1〜' + game.armyMax + ' 体にする）');
    }
    return errs;
  }

  // ---------------- 絵の登録（js/asset-overrides.js の表に 1 行足す、または書き換える） ----------------
  function upsertAssetOverride(text, sprite, height, maxWidth) {
    if (!/^[A-Za-z0-9_]+$/.test(sprite || '')) throw new Error('絵の ID がおかしい: ' + sprite);
    const entry = "{ src: 'assets/" + sprite + ".png', height: " + Math.round(height) + ', maxWidth: ' + Math.round(maxWidth) + ' }';
    const lines = String(text).replace(/\r\n/g, '\n').split('\n');
    const start = lines.findIndex((l) => l.indexOf('SL.ASSET_OVERRIDES') === 0);
    if (start < 0) throw new Error('asset-overrides.js に SL.ASSET_OVERRIDES の表が見つかりません');
    const re = new RegExp('^(\\s*' + sprite + '\\s*:\\s*)\\{[^}]*\\}(.*)$');
    for (let i = start; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (m) {
        lines[i] = m[1] + entry + m[2];
        return lines.join('\n');
      }
    }
    let end = lines.length - 1;
    while (end > start && lines[end].trim() !== '};') end--;
    if (end <= start) throw new Error('asset-overrides.js の表の終わりが見つかりません');
    lines.splice(end, 0, '  ' + sprite + ': ' + entry + ',  // 設定ページで取り込んだ絵');
    return lines.join('\n');
  }

  return {
    FACTION_LABELS, ROLE_LABELS, KIND_LABELS, SIZE_LABELS, GROUPS, RANGED, SLOT_FIELDS,
    lit, weaponsFile, unitsFile, armyFile, buildArmy, exportFromSL, validate, upsertAssetOverride,
  };
});
