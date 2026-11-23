'use strict';
// お試し設定：設定ページ（settings.html）の「このブラウザで試す」で開いたとき（?try=1）だけ、
// このブラウザに保存した武装・機体・出撃・絵で遊ぶ。公開しているゲームのファイルは変わらない。
// js/army.js の後、js/data.js の前に読み込む（data.js が機体の武装を組み立てる前に入れ替えるため）
(function () {
  if (!/[?&]try=1(&|$)/.test(location.search)) return;
  let d = null;
  try {
    d = JSON.parse(window.localStorage.getItem('stellar-legion-settings-trial') || 'null');
  } catch (e) {
    d = null;
  }
  if (!d || !Array.isArray(d.weapons) || !Array.isArray(d.units) || !d.army || typeof d.army !== 'object') {
    SL.TRIAL = { error: 'NO TRIAL SETTINGS IN THIS BROWSER - USING THE NORMAL SETTINGS' };
    return;
  }
  const weapons = {};
  for (const w of d.weapons) {
    const o = Object.assign({}, w);
    delete o.id;
    weapons[w.id] = o;
  }
  const units = {};
  for (const u of d.units) {
    const o = Object.assign({}, u);
    delete o.id;
    units[u.id] = o;
  }
  SL.WEAPONS = weapons;
  SL.UNIT_TYPES = units;
  SL.ARMY_COUNTS = d.army;
  SL.TRIAL = { images: d.images || {}, savedAt: d.savedAt || 0 };
})();
