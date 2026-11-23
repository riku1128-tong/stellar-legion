#!/usr/bin/env node
'use strict';
// 武装・機体・出撃の設定を JSON で出し入れする（設定ページとのやりとり用。Node.js で動かす）
//  node tools/settings.js export          … いまの js/weapons.js, js/units.js, js/army.js を JSON で出す
//  node tools/settings.js apply <file>    … 設定ページの値（JSON）から 3 つのファイルを書き直す
//  node tools/settings.js check           … ファイル → JSON → ファイルで中身が変わらないか確かめる
//  node tools/settings.js image <ID> <png> <高さ> <幅の上限>
//                                         … 設定ページで取り込んだ絵を assets/<ID>.png に置き、asset-overrides.js に登録する
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const F = require('./settings-format.js');

const ROOT = path.join(__dirname, '..');
const JS = (f) => path.join(ROOT, 'js', f);
const FILES = ['weapons.js', 'units.js', 'army.js'];

// ゲームのデータファイルを読み込む（ブラウザの代わりに小さな箱の中で動かす）
function loadGame(overrides) {
  const warnings = [];
  const ctx = {
    console: { log() {}, warn: (m) => warnings.push(String(m)), error: (m) => warnings.push(String(m)) },
    URLSearchParams, location: { search: '' },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['config.js', 'weapons.js', 'units.js', 'army.js', 'data.js', 'asset-overrides.js']) {
    const src = overrides && overrides[f] !== undefined ? overrides[f] : fs.readFileSync(JS(f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  ctx.SL.__warnings = warnings;
  return ctx.SL;
}

// asset-overrides.js の表から、絵ごとのゲームでの大きさ（高さと幅の上限）を取り出す
function spriteSizes(SL) {
  const out = {};
  const map = SL.ASSET_OVERRIDES || {};
  for (const id of Object.keys(map)) {
    const spec = map[id];
    if (spec && typeof spec === 'object' && spec.height) out[id] = { height: spec.height, maxWidth: spec.maxWidth || Math.round(spec.height * 1.5) };
  }
  return out;
}

// 取り込んだ絵を assets/<ID>.png に置き、asset-overrides.js の表に登録する
function installImage(sprite, png, height, maxWidth) {
  if (!/^[A-Za-z0-9_]+$/.test(sprite || '')) throw new Error('絵の ID がおかしい: ' + sprite);
  const buf = fs.readFileSync(png);
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG ではありません: ' + png);
  height = Math.round(Number(height));
  maxWidth = Math.round(Number(maxWidth));
  if (!(height >= 6 && height <= 200) || !(maxWidth >= 6 && maxWidth <= 300)) throw new Error('大きさがおかしい: ' + height + ' / ' + maxWidth);
  fs.writeFileSync(path.join(ROOT, 'assets', sprite + '.png'), buf);
  const file = JS('asset-overrides.js');
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const entry = "{ src: 'assets/" + sprite + ".png', height: " + height + ', maxWidth: ' + maxWidth + ' }';
  const lines = src.split('\n');
  const start = lines.findIndex((l) => l.startsWith('SL.ASSET_OVERRIDES'));
  const re = new RegExp('^(\\s*' + sprite + '\\s*:\\s*)\\{[^}]*\\}(.*)$');
  let done = false;
  for (let i = start; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) { lines[i] = m[1] + entry + m[2]; done = true; break; }
  }
  if (!done) {
    let end = lines.length - 1;
    while (end > start && lines[end].trim() !== '};') end--;
    lines.splice(end, 0, '  ' + sprite + ': ' + entry + ',  // 設定ページで取り込んだ絵');
  }
  fs.writeFileSync(file, lines.join('\n'));
  // 書き直した表が読み込めるか確かめる
  const SL = loadGame();
  if (!SL.ASSET_OVERRIDES[sprite]) throw new Error('asset-overrides.js に登録できませんでした');
}

function exportSettings(SL) {
  const C = SL.CONFIG;
  const sprites = {};
  for (const id of Object.keys(SL.ASSET_OVERRIDES || {})) sprites[id] = true;
  for (const id of Object.keys(SL.UNIT_TYPES)) {
    const t = SL.UNIT_TYPES[id];
    sprites[t.sprite] = true;
    if (t.transform) sprites[t.transform.sprite] = true;
  }
  for (const s of SL.SHIPS) delete sprites[s.sprite];
  const game = {
    factions: SL.FACTIONS.map((f) => ({ prefix: f.prefix, name: f.name, label: F.FACTION_LABELS[f.prefix] || f.name, color: f.color })),
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
    spriteSizes: spriteSizes(SL),
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

// 設定ページの値を確かめる（おかしければ理由を返す）
function validate(values, game) {
  const errs = [];
  const KINDS = Object.keys(F.KIND_LABELS);
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
      if (!w) return errs.push(tag + ': 知らない武装 ' + wid);
      if (k === 2 && w.kind !== 'melee') errs.push(tag + ': L（格闘）に格闘以外の ' + wid);
      if (k < 2 && w.kind === 'melee') errs.push(tag + ': ' + 'JK'[k] + '（射撃）に格闘の ' + wid);
      if (typeof s === 'object') {
        for (const f of Object.keys(s)) {
          if (f === 'id') continue;
          if (F.SLOT_FIELDS.indexOf(f) < 0) errs.push(tag + ': 機体ごとに変えられない項目 ' + f);
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

function texts(values, game) {
  return {
    'weapons.js': F.weaponsFile(values, game),
    'units.js': F.unitsFile(values, game),
    'army.js': F.armyFile(values, game),
  };
}

function main() {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === 'export') {
    process.stdout.write(JSON.stringify(exportSettings(loadGame()), null, 2) + '\n');
  } else if (cmd === 'apply') {
    if (!file) throw new Error('使い方: node tools/settings.js apply <file.json>');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const values = raw.values || raw;
    const { game } = exportSettings(loadGame());
    const errs = validate(values, game);
    if (errs.length) {
      console.error('設定に問題があるので書き込みませんでした:\n  ' + errs.join('\n  '));
      process.exit(1);
    }
    const out = texts(values, game);
    // 書き込む前に、新しい中身でゲームのデータが読み込めるか確かめる
    const SL = loadGame(out);
    if (SL.__warnings.length) {
      console.error('読み込むと警告が出るので書き込みませんでした:\n  ' + SL.__warnings.join('\n  '));
      process.exit(1);
    }
    for (const f of FILES) fs.writeFileSync(JS(f), out[f]);
    console.log('js/' + FILES.join(', js/') + ' を書き直しました');
  } else if (cmd === 'image') {
    const [, sprite, png, height, maxWidth] = process.argv.slice(2);
    installImage(sprite, png, height, maxWidth);
    console.log('assets/' + sprite + '.png を置き、js/asset-overrides.js に登録しました');
  } else if (cmd === 'check') {
    const { game, values } = exportSettings(loadGame());
    const out = texts(values, game);
    let ok = true;
    for (const f of FILES) {
      const cur = fs.readFileSync(JS(f), 'utf8').replace(/\r\n/g, '\n');
      if (cur === out[f]) { console.log(f + ': OK'); continue; }
      ok = false;
      const a = cur.split('\n'), b = out[f].split('\n');
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) { console.log(f + ':' + (i + 1) + '\n  file: ' + a[i] + '\n  page: ' + b[i]); break; }
      }
    }
    process.exit(ok ? 0 : 1);
  } else {
    console.log('使い方: node tools/settings.js export | apply <file.json> | check | image <ID> <png> <高さ> <幅の上限>');
  }
}

main();
