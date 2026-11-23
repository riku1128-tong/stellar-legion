#!/usr/bin/env node
'use strict';
// 武装・機体・出撃の設定を JSON で出し入れする（Node.js で動かす。ふだんは設定ページ settings.html を使えばよい）
//  node tools/settings.js export          … いまの js/weapons.js, js/units.js, js/army.js を JSON で出す
//  node tools/settings.js apply <file>    … 設定の値（JSON）から 3 つのファイルを書き直す
//  node tools/settings.js check           … ファイル → JSON → ファイルで中身が変わらないか確かめる
//  node tools/settings.js image <ID> <png> <高さ> <幅の上限>
//                                         … 絵を assets/<ID>.png に置き、asset-overrides.js に登録する
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

function texts(values, game) {
  return {
    'weapons.js': F.weaponsFile(values, game),
    'units.js': F.unitsFile(values, game),
    'army.js': F.armyFile(values, game),
  };
}

function installImage(sprite, png, height, maxWidth) {
  const buf = fs.readFileSync(png);
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG ではありません: ' + png);
  height = Math.round(Number(height));
  maxWidth = Math.round(Number(maxWidth));
  if (!(height >= 6 && height <= 200) || !(maxWidth >= 6 && maxWidth <= 300)) throw new Error('大きさがおかしい: ' + height + ' / ' + maxWidth);
  const file = JS('asset-overrides.js');
  const next = F.upsertAssetOverride(fs.readFileSync(file, 'utf8'), sprite, height, maxWidth);
  const SL = loadGame({ 'asset-overrides.js': next });
  if (!SL.ASSET_OVERRIDES[sprite]) throw new Error('asset-overrides.js に登録できませんでした');
  fs.writeFileSync(path.join(ROOT, 'assets', sprite + '.png'), buf);
  fs.writeFileSync(file, next);
}

function main() {
  const [cmd, a1, a2, a3, a4] = process.argv.slice(2);
  if (cmd === 'export') {
    process.stdout.write(JSON.stringify(F.exportFromSL(loadGame()), null, 2) + '\n');
  } else if (cmd === 'apply') {
    if (!a1) throw new Error('使い方: node tools/settings.js apply <file.json>');
    const raw = JSON.parse(fs.readFileSync(a1, 'utf8'));
    const values = raw.values || raw;
    const { game } = F.exportFromSL(loadGame());
    const errs = F.validate(values, game);
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
    installImage(a1, a2, a3, a4);
    console.log('assets/' + a1 + '.png を置き、js/asset-overrides.js に登録しました');
  } else if (cmd === 'check') {
    const { game, values } = F.exportFromSL(loadGame());
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
