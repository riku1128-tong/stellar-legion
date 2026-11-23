'use strict';
// 設定ページ（settings.html）の動き：機体・武装・出撃・絵の編集、このブラウザへの保存、お試し、GitHub への反映
(function () {
  'use strict';
  const FMT = window.SLSettingsFormat;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const decimals = (step) => (String(step).split('.')[1] || '').length;
  const round = (v, d) => Number(Number(v).toFixed(d));
  const fmt = (v, d) => (Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toLocaleString('ja-JP');
  const NAME_CHARS = /[^A-Z0-9 !?.,;\-+/()<>=%*_[\]]/g;

  // ---------------- 項目の定義 ----------------
  const ROLE_HINTS = {
    commander: 'バランス型。最初に操作する機体',
    raider: 'すばやく回り込む',
    heavy: '打たれ強く、前に出る',
    grunt: '標準的な動き',
    special: '近づいて格闘を仕掛ける',
    artillery: '遠くから撃つ。格闘しない',
    giant: '後ろの列から撃つ。格闘しない',
  };
  const ROLE_GLYPH = { commander: '隊', raider: '遊', heavy: '重', grunt: '量', special: '格', artillery: '砲', giant: '巨' };
  const SIZE_HINTS = { S: 'ふつう', M: '戦艦くらい', L: '戦艦の 2 倍' };
  const STYLE_LABELS = { slash: '斬る', spin: '回転', whip: 'ムチ' };

  const WF = {
    dmg: { label: '威力', min: 0.5, max: 500, step: 0.5 },
    cooldown: { label: '連射間隔', unit: '秒', min: 0.03, max: 10, step: 0.01 },
    ammo: { label: '弾数', unit: '発', min: 1, max: 999, step: 1 },
    energy: { label: '消費エネルギー', min: 1, max: 300, step: 1 },
    speed: { label: '弾速', unit: 'px/秒', min: 40, max: 1000, step: 10 },
    maxSpeed: { label: '最高速度', unit: 'px/秒', min: 40, max: 1000, step: 10 },
    turn: { label: '追尾の強さ', unit: '0 でまっすぐ', min: 0, max: 10, step: 0.1 },
    range: { label: '射程', unit: 'px', min: 40, max: 1200, step: 10 },
    life: { label: '飛ぶ時間', unit: '秒', min: 0.2, max: 8, step: 0.1 },
    spread: { label: 'ばらつき', unit: 'rad', min: 0, max: 0.6, step: 0.01, deg: true },
    count: { label: '同時に撃つ数', unit: '発', min: 1, max: 9, step: 1 },
    arc: { label: '広がり', unit: 'rad', min: 0, max: 3.14, step: 0.05, deg: true },
    splash: { label: '爆発の半径', unit: 'px', min: 0, max: 150, step: 1 },
    charge: { label: 'ためる時間', unit: '秒', min: 0.1, max: 5, step: 0.1 },
    width: { label: 'ビームの太さ', unit: 'px', min: 1, max: 40, step: 1 },
    dur: { label: 'ビームが残る時間', unit: '秒', min: 0.05, max: 3, step: 0.05 },
    reach: { label: '届く距離', unit: 'px', min: 10, max: 160, step: 1 },
    lunge: { label: '踏み込む速さ', unit: 'px/秒', min: 0, max: 600, step: 10 },
    lungeTime: { label: '踏み込む時間', unit: '秒', min: 0.05, max: 1.5, step: 0.01 },
    stun: { label: 'しびれる時間', unit: '秒', min: 0, max: 5, step: 0.1 },
  };
  const MELEE_ARC = { label: '振る角度（片側）', unit: 'rad', min: 0.2, max: 3.14, step: 0.05, deg: true };
  const KIND_FIELDS = {
    bullet: ['dmg', 'cooldown', 'ammo', 'speed', 'range', 'spread', 'count', 'arc'],
    shell: ['dmg', 'cooldown', 'ammo', 'speed', 'range', 'spread', 'splash', 'count', 'arc'],
    missile: ['dmg', 'cooldown', 'ammo', 'speed', 'maxSpeed', 'turn', 'range', 'life', 'count', 'arc'],
    beam: ['dmg', 'cooldown', 'energy', 'speed', 'range', 'spread', 'count', 'arc'],
    charge: ['dmg', 'cooldown', 'energy', 'charge', 'range', 'width', 'dur'],
    slash: ['dmg', 'cooldown', 'reach', 'arc', 'lunge', 'lungeTime'],
    spin: ['dmg', 'cooldown', 'reach', 'lunge', 'lungeTime'],
    whip: ['dmg', 'cooldown', 'reach', 'stun'],
  };
  const DEFAULTS = { count: 1, arc: 0, spread: 0, turn: 0, stun: 0 };
  const UF = {
    hp: { label: 'HP', min: 10, max: 30000, step: 10 },
    speed: { label: '速さ', unit: 'px/秒', min: 20, max: 300, step: 1 },
    energy: { label: 'ビームエネルギー', unit: '最大', min: 10, max: 1000, step: 5 },
    radius: { label: '当たり判定の半径', unit: 'px・S のとき', min: 3, max: 60, step: 1 },
  };
  const TF = {
    speed: { label: '移動モードの速さ', unit: '倍', min: 0.5, max: 3, step: 0.1 },
    turn: { label: '曲がりやすさ', unit: '倍', min: 0.2, max: 2, step: 0.1 },
  };
  const SLOT_KEYS = [
    { key: 'J', label: '主射撃' },
    { key: 'K', label: '副射撃' },
    { key: 'L', label: '格闘' },
  ];

  // ---------------- 状態 ----------------
  const S = {
    game: null, files: null, draft: null,
    got: { game: false, files: false, draft: false },
    view: 'units', open: new Set(), confirm: null, peek: {}, copied: {},
    images: [], gotImages: false,
  };
  let dirty = false, saveTimer = 0;
  const readOnly = false;

  // ---------------- 値の読み書き ----------------
  const weaponById = (id, v) => ((v || S.draft).weapons || []).find((w) => w.id === id) || null;
  const unitById = (id, v) => ((v || S.draft).units || []).find((u) => u.id === id) || null;
  const baseOf = (scope, id) => (S.files ? (scope === 'w' ? weaponById(id, S.files) : unitById(id, S.files)) : null);
  const tone = (kind) => (kind === 'melee' ? 'melee' : kind === 'beam' || kind === 'charge' ? 'beam' : 'solid');
  const kindKey = (w) => (w.kind === 'melee' ? w.style || 'slash' : w.kind);
  const wField = (w, f) => (w.kind === 'melee' && f === 'arc' ? MELEE_ARC : WF[f]);
  const wValue = (w, f) => (w[f] !== undefined ? w[f] : DEFAULTS[f] !== undefined ? DEFAULTS[f] : w.kind === 'missile' && f === 'life' ? w.range / w.speed : 0);
  const slotId = (s) => (!s ? null : typeof s === 'string' ? s : s.id);
  const slotVal = (s, f) => {
    const w = weaponById(slotId(s));
    if (s && typeof s === 'object' && typeof s[f] === 'number') return s[f];
    return w ? w[f] : undefined;
  };
  const hasOverride = (s, f) => !!(s && typeof s === 'object' && typeof s[f] === 'number');

  // 値を比べる（キーの順番と小数の誤差は気にしない）
  function canon(v) {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') {
      const o = {};
      Object.keys(v).sort().forEach((k) => { if (v[k] !== undefined) o[k] = canon(v[k]); });
      return o;
    }
    if (typeof v === 'number') return round(v, 6);
    return v;
  }
  const same = (a, b) => JSON.stringify(canon(a === undefined ? null : a)) === JSON.stringify(canon(b === undefined ? null : b));
  const normSlot = (s) => (!s ? null : typeof s === 'string' ? s : Object.keys(s).length === 1 ? s.id : s);

  function changedKeys(a, b, slots) {
    const keys = new Set(Object.keys(a || {}).concat(Object.keys(b || {})));
    keys.delete('id');
    let n = 0;
    keys.forEach((k) => {
      if (slots && k === 'weapons') {
        for (let i = 0; i < 3; i++) if (!same(normSlot((a.weapons || [])[i]), normSlot((b.weapons || [])[i]))) n++;
      } else if (!same(a[k], b[k])) n++;
    });
    return n;
  }
  function countChanges(list, baseList, slots) {
    if (!S.files) return 0;
    let n = 0;
    const seen = new Set();
    for (const x of list) {
      const b = baseList.find((y) => y.id === x.id);
      seen.add(x.id);
      n += b ? changedKeys(x, b, slots) : 1;
    }
    for (const b of baseList) if (!seen.has(b.id)) n++;
    return n;
  }
  function changes() {
    const d = S.draft, f = S.files;
    const out = { weapons: 0, units: 0, army: 0 };
    if (!f) return out;
    out.weapons = countChanges(d.weapons, f.weapons, false);
    out.units = countChanges(d.units, f.units, true);
    for (const fac of S.game.factions) {
      const a = d.army[fac.prefix] || {}, b = f.army[fac.prefix] || {};
      new Set(Object.keys(a).concat(Object.keys(b))).forEach((k) => { if ((a[k] || 0) !== (b[k] || 0)) out.army++; });
    }
    return out;
  }
  function fieldChanged(scope, id, f, cur) {
    if (!S.files) return false;
    const b = baseOf(scope, id);
    if (!b) return true;
    return !same(cur, scope === 'w' ? wValue(b, f) : b[f]);
  }
  const total = (prefix) => Object.values(S.draft.army[prefix] || {}).reduce((a, n) => a + (n || 0), 0);
  const unitsOf = (prefix) => S.draft.units.filter((u) => u.faction === prefix);
  const usersOf = (wid) => S.draft.units.filter((u) => (u.weapons || []).some((s) => slotId(s) === wid));

  // ---------------- 描画 ----------------
  function render(only) {
    if (!S.ready) return;
    const active = document.activeElement && document.activeElement.id;
    if (only === 'images') { refreshCutTargets(); renderChrome(); return; }
    const views = only ? [only] : ['units', 'weapons', 'army'];
    for (const v of views) {
      const el = $('#view-' + v);
      if (v === 'units') el.innerHTML = unitsHtml();
      if (v === 'weapons') el.innerHTML = weaponsHtml();
      if (v === 'army') el.innerHTML = armyHtml();
    }
    renderChrome();
    if (views.indexOf('army') >= 0) requestAnimationFrame(drawField);
    if (active) {
      const el = document.getElementById(active);
      if (el && el !== document.activeElement) el.focus({ preventScroll: true });
    }
  }
  const renderCurrent = () => render(S.view);

  function renderChrome() {
    const c = changes();
    for (const k of ['units', 'weapons', 'army']) $('#badge-' + k).textContent = c[k] ? String(c[k]) : '';
    const waiting = S.images.filter((x) => x.status !== 'applied').length;
    $('#badge-images').textContent = waiting ? String(waiting) : '';
    renderFiles(c, waiting);
  }

  function resetHtml(what, label) {
    if (!S.files) return '';
    if (S.confirm === 'reset:' + what) {
      return `<div class="confirm"><span>${esc(label)}をゲームのファイルの値に戻します。</span>
        <button class="btn danger small" id="yes-reset-${what}" data-act="reset" data-what="${what}">戻す</button>
        <button class="btn ghost small" id="no-reset-${what}" data-act="cancel">やめる</button></div>`;
    }
    return `<button class="btn ghost small" id="ask-reset-${what}" data-act="ask" data-key="reset:${what}">ファイルの値に戻す</button>`;
  }

  function numField(id, scope, f, def, value, opts) {
    opts = opts || {};
    const extra = [];
    if (def.deg) extra.push('≈ ' + Math.round((value * 180) / Math.PI) + '°');
    if (opts.was !== undefined) extra.push('元 <s>' + esc(fmtNum(opts.was)) + '</s>');
    if (opts.hint) extra.push(esc(opts.hint));
    return `<label class="f${opts.changed ? ' changed' : ''}" for="${id}">
      <span class="fl">${esc(def.label)}${def.unit ? `<small>${esc(def.unit)}</small>` : ''}</span>
      <input type="number" id="${id}" ${opts.data || ''} data-scope="${scope}" data-f="${f}" min="${def.min}" max="${def.max}" step="${def.step}" value="${fmtNum(value)}" inputmode="decimal"${opts.disabled ? ' disabled' : ''}>
      <span class="fx">${extra.join('　')}</span></label>`;
  }
  const fmtNum = (v) => (typeof v === 'number' ? String(round(v, 4)) : '');

  // ----- 機体 -----
  function unitsHtml() {
    const g = S.game;
    let h = `<div class="view-head"><p class="lead">機体ごとの性能・大きさ・変形・武装です。行をクリックすると開きます。武装の威力と弾数は、その機体だけ変えることもできます（ほかの機体は武装タブの値のまま）。</p>${resetHtml('units', '機体の設定')}</div>`;
    g.factions.forEach((fac, team) => {
      const list = unitsOf(fac.prefix);
      h += `<section class="fac-block ${team ? 'fac-crimson' : 'fac-azure'}">
        <div class="fac-head"><h2 class="sec"><span class="fac-dot"></span>${esc(fac.label)}<small>${esc(fac.name)}</small></h2>
        <button class="btn small" id="add-${fac.prefix}" data-act="add-unit" data-fac="${fac.prefix}">機体を追加</button></div>
        <div class="bays">${list.map(unitHtml).join('')}</div></section>`;
    });
    h += `<datalist id="sprite-list">${spriteIds().map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>`;
    return h;
  }
  function spriteIds() {
    const set = new Set(S.game.sprites || []);
    for (const u of S.draft.units) { set.add(u.sprite); if (u.transform) set.add(u.transform.sprite); }
    return Array.from(set).filter(Boolean);
  }
  function unitHtml(u) {
    const id = u.id;
    const base = baseOf('u', id);
    const ch = !base || changedKeys(u, base, true) > 0;
    const count = (S.draft.army[u.faction] || {})[id] || 0;
    const mini = SLOT_KEYS.map((k, i) => {
      const w = weaponById(slotId((u.weapons || [])[i]));
      return `<em>${k.key}</em><span>${w ? esc(w.short || w.name) : '—'}</span>`;
    }).join(' ');
    const open = S.open.has('u:' + id);
    return `<details class="bay" id="bay-${id}" data-key="u:${id}"${open ? ' open' : ''}>
      <summary>
        <span class="caret" aria-hidden="true"></span>
        <span><span class="uname${ch && S.files ? ' changed' : ''}">${esc(u.name)}</span><span class="urole">${esc(FMT.ROLE_LABELS[u.role] || u.role)}・<code>${esc(id)}</code></span></span>
        <span class="umeta"><span>HP <b>${fmt(u.hp)}</b></span><span class="slots-mini">${mini}</span></span>
        <span class="sum-right">${u.transform ? '<span class="chip tf-chip">変形</span>' : ''}<span class="size-chip" title="大きさ">${esc(u.size)}</span><span class="chip count-chip${count ? '' : ' zero'}">出撃 ${count}</span></span>
      </summary>
      ${open ? unitBody(u, base) : ''}
    </details>`;
  }
  function unitBody(u, base) {
    const id = u.id;
    const g = S.game;
    const data = `data-id="${id}"`;
    const was = (f, cur) => (base && !same(base[f], cur) ? base[f] : undefined);
    const energy = u.energy !== undefined ? u.energy : g.energyMax;
    const roleOpts = g.roleOrder.map((r) => `<option value="${r}"${r === u.role ? ' selected' : ''}>${esc(FMT.ROLE_LABELS[r] || r)} — ${esc(ROLE_HINTS[r] || '')}</option>`).join('');
    const sizeSeg = ['S', 'M', 'L'].map((z) => `<label><input type="radio" name="size-${id}" id="u--${id}--size-${z}" ${data} data-scope="u" data-f="size" value="${z}"${u.size === z ? ' checked' : ''}><b>${z}</b><small>${SIZE_HINTS[z]}</small></label>`).join('');
    const tf = u.transform;
    const tfBase = base && base.transform;
    let h = `<div class="bay-body">
      <div class="part"><h3>基本</h3>
        <div class="two">
          <label class="f stack${fieldChanged('u', id, 'name', u.name) ? ' changed' : ''}" for="u--${id}--name"><span class="fl">名前<small>英大文字・数字</small></span>
            <input type="text" id="u--${id}--name" ${data} data-scope="u" data-f="name" maxlength="14" value="${esc(u.name)}" style="width:170px">
            <span class="fx">${base && base.name !== u.name ? '元 <s>' + esc(base.name) + '</s>' : ''}</span></label>
          <label class="f stack${fieldChanged('u', id, 'role', u.role) ? ' changed' : ''}" for="u--${id}--role"><span class="fl">役割<small>AI の動きと陣形の列</small></span>
            <select id="u--${id}--role" ${data} data-scope="u" data-f="role">${roleOpts}</select></label>
        </div>
        <div class="fields">
          ${numField('u--' + id + '--hp', 'u', 'hp', UF.hp, u.hp, { data, changed: fieldChanged('u', id, 'hp', u.hp), was: was('hp', u.hp) })}
          ${numField('u--' + id + '--speed', 'u', 'speed', UF.speed, u.speed, { data, changed: fieldChanged('u', id, 'speed', u.speed), was: was('speed', u.speed) })}
          ${numField('u--' + id + '--energy', 'u', 'energy', UF.energy, energy, { data, changed: base ? !same(base.energy === undefined ? g.energyMax : base.energy, energy) : !!S.files, was: base && !same(base.energy === undefined ? g.energyMax : base.energy, energy) ? (base.energy === undefined ? g.energyMax : base.energy) : undefined })}
          ${numField('u--' + id + '--radius', 'u', 'radius', UF.radius, u.radius, { data, changed: fieldChanged('u', id, 'radius', u.radius), was: was('radius', u.radius) })}
        </div>
      </div>
      <div class="part"><h3>大きさ</h3>
        <div class="seg" role="radiogroup" aria-label="大きさ">${sizeSeg}</div>
        <p class="note">M と L は絵の長い辺を戦艦の絵にそろえます（L は 2 倍）。当たり判定と格闘の届く距離も同じ割合で大きくなります。</p>
      </div>
      <div class="part"><h3>変形</h3>
        <label class="check" for="u--${id}--tf"><input type="checkbox" id="u--${id}--tf" ${data} data-scope="u" data-f="transform"${tf ? ' checked' : ''}> Shift で変形できる</label>
        ${tf ? `<div class="fields">
          ${numField('u--' + id + '--tf-speed', 'tf', 'speed', TF.speed, tf.speed, { data, changed: !tfBase || !same(tfBase.speed, tf.speed), was: tfBase && !same(tfBase.speed, tf.speed) ? tfBase.speed : undefined })}
          ${numField('u--' + id + '--tf-turn', 'tf', 'turn', TF.turn, tf.turn, { data, changed: !tfBase || !same(tfBase.turn, tf.turn), was: tfBase && !same(tfBase.turn, tf.turn) ? tfBase.turn : undefined })}
          <label class="f stack" for="u--${id}--tf-sprite"><span class="fl">移動モードの絵</span>
            <input type="text" id="u--${id}--tf-sprite" ${data} data-scope="tf" data-f="sprite" list="sprite-list" value="${esc(tf.sprite)}" style="width:160px"></label>
        </div>
        <p class="note">移動モードでは速く動けますが、格闘（L）は使えません。</p>` : '<p class="note">変形しない機体です。</p>'}
      </div>
      <div class="part"><h3>武装</h3>${[0, 1, 2].map((k) => slotHtml(u, k, base)).join('')}</div>
      <div class="part"><h3>見た目</h3>
        <label class="f stack" for="u--${id}--sprite" style="max-width:320px"><span class="fl">絵の ID</span>
          <input type="text" id="u--${id}--sprite" ${data} data-scope="u" data-f="sprite" list="sprite-list" value="${esc(u.sprite)}" style="width:180px"></label>
        <div class="look-row">${lookStatus(u.sprite)}<button class="btn ghost small" id="cutfor-${id}" data-act="cut-for" data-sprite="${esc(u.sprite)}">この絵を切り抜いて取り込む</button></div>
        <p class="note">一覧にない ID にすると、役割に合った仮の図形で出ます。「絵」タブで画像を取り込むと、その ID の絵になります。</p>
      </div>
      <div class="bay-actions">
        <button class="btn ghost small" id="dup-${id}" data-act="dup-unit" data-id="${id}">この機体を複製</button>
        ${deleteUnitHtml(u)}
      </div>
    </div>`;
    return h;
  }
  function lookStatus(sprite) {
    const img = S.images.find((x) => x.sprite === sprite);
    if (!img) return '';
    return `<span class="qthumb" style="width:40px;height:40px"><img src="${esc(img.dataUrl)}" alt="" style="max-width:36px;max-height:36px"></span><span class="note">${img.status === 'applied' ? '取り込んだ絵（公開ゲームに反映済み）' : '取り込んだ絵（まだ公開ゲームに入っていません）'}</span>`;
  }
  function deleteUnitHtml(u) {
    if (unitsOf(u.faction).length <= 1) return '<span class="note">勢力に 1 機しかないので削除できません</span>';
    if (S.confirm === 'del-unit:' + u.id) {
      return `<span class="confirm"><span>${esc(u.name)} を削除します（出撃の数からも消えます）。</span>
        <button class="btn danger small" id="yes-del-${u.id}" data-act="del-unit" data-id="${u.id}">削除する</button>
        <button class="btn ghost small" id="no-del-${u.id}" data-act="cancel">やめる</button></span>`;
    }
    return `<button class="btn danger small" id="ask-del-${u.id}" data-act="ask" data-key="del-unit:${u.id}">この機体を削除</button>`;
  }
  function slotHtml(u, k, base) {
    const id = u.id;
    const s = (u.weapons || [])[k] || null;
    const wid = slotId(s);
    const w = weaponById(wid);
    const bs = base ? (base.weapons || [])[k] || null : null;
    const slotChanged = S.files && (!base || slotId(bs) !== wid);
    const melee = k === 2;
    const opts = ['<option value="">なし</option>'].concat(FMT.GROUPS.map((g) => {
      const list = S.draft.weapons.filter((x) => g.kinds.indexOf(x.kind) >= 0 && (melee ? x.kind === 'melee' : x.kind !== 'melee'));
      if (!list.length) return '';
      return `<optgroup label="${esc(g.label)}">${list.map((x) => `<option value="${esc(x.id)}"${x.id === wid ? ' selected' : ''}>${esc(x.name)}（${esc(FMT.KIND_LABELS[x.kind])}）</option>`).join('')}</optgroup>`;
    })).join('');
    let nums = '';
    if (w) {
      const fields = ['dmg'].concat(w.kind === 'melee' ? [] : w.ammo !== undefined ? ['ammo'] : w.energy !== undefined ? ['energy'] : []);
      nums = '<div class="slot-nums">' + fields.map((f) => {
        const v = slotVal(s, f);
        const ov = hasOverride(s, f);
        const label = f === 'dmg' ? '威力' : f === 'ammo' ? '弾数' : '消費エネルギー';
        const def = Object.assign({}, WF[f], { label, unit: '' });
        const bv = bs && slotId(bs) === wid ? (hasOverride(bs, f) ? bs[f] : w[f]) : undefined;
        return numField(`u--${id}--s${k}-${f}`, 'slot', f, def, v, {
          data: `data-id="${id}" data-k="${k}"`,
          changed: ov,
          hint: ov ? 'この機体だけ（武装の値 ' + fmtNum(w[f]) + '）' : '武装の値のまま',
          was: bv !== undefined && !same(bv, v) ? bv : undefined,
        });
      }).join('') + '</div>';
    }
    return `<div class="slot">
      <div class="key"><kbd>${SLOT_KEYS[k].key}</kbd><span>${SLOT_KEYS[k].label}</span></div>
      <div class="slot-main">
        <label class="f${slotChanged ? ' changed' : ''}" for="u--${id}--s${k}" style="grid-template-columns:minmax(0,1fr)"><span class="fl" hidden>${SLOT_KEYS[k].label}</span>
          <select id="u--${id}--s${k}" data-id="${id}" data-k="${k}" data-scope="slot" data-f="id" aria-label="${SLOT_KEYS[k].label}">${opts}</select></label>
        ${nums}
      </div></div>`;
  }

  // ----- 武装 -----
  function weaponsHtml() {
    const g = S.game;
    let h = `<div class="view-head"><p class="lead">武装ごとの性能です。同じ武装を持つ機体すべてに効きます（機体タブで、その機体だけ威力や弾数を変えた分は除く）。威力は全体のダメージ倍率 ${esc(g.damageScale)} をかける前の値です。</p>${resetHtml('weapons', '武装の性能')}</div>`;
    for (const grp of FMT.GROUPS) {
      const list = S.draft.weapons.filter((w) => grp.kinds.indexOf(w.kind) >= 0);
      if (!list.length) continue;
      h += `<section class="view"><h2 class="sec">${esc(grp.label)}<small>${list.length} 種</small></h2><div class="cards">${list.map(cardHtml).join('')}</div></section>`;
    }
    return h;
  }
  function cardHtml(w) {
    const id = w.id;
    const base = baseOf('w', id);
    const data = `data-id="${id}"`;
    const fields = KIND_FIELDS[kindKey(w)] || [];
    const multi = (w.count || 1) > 1;
    const users = usersOf(id);
    const usersHtml = users.length
      ? '持っている機体: ' + users.map((u) => `<span class="u-${esc(u.faction)}">${esc(u.name)}</span>`).join('・')
      : 'どの機体も持っていません';
    const fh = fields.map((f) => {
      const def = wField(w, f);
      const v = wValue(w, f);
      const off = w.kind !== 'melee' && f === 'arc' && !multi;
      const bv = base ? wValue(base, f) : undefined;
      return numField(`w--${id}--${f}`, 'w', f, def, v, {
        data, disabled: off, changed: fieldChanged('w', id, f, v),
        was: bv !== undefined && !same(bv, v) ? bv : undefined,
        hint: off ? '同時に撃つ数が 2 以上のとき' : '',
      });
    }).join('');
    const blade = w.kind === 'melee' && w.blade ? bladeHtml(w, base) : '';
    const kindLabel = w.kind === 'melee' ? '格闘・' + (STYLE_LABELS[w.style] || w.style) : FMT.KIND_LABELS[w.kind] || w.kind;
    return `<article class="wcard" data-tone="${tone(w.kind)}" id="card-${id}">
      <div class="wcard-head"><div><h3 class="wname">${esc(w.name)}</h3><code class="wid">${esc(id)}</code></div><span class="chip">${esc(kindLabel)}</span></div>
      <p class="users">${usersHtml}</p>
      <div class="fields">${fh}</div>
      ${blade}
      <p class="derived">${derived(w).join('')}</p>
      <details data-key="names:${id}"${S.open.has('names:' + id) ? ' open' : ''}><summary>表示名・複製・削除</summary>
        <div class="two">
          <label class="f${fieldChanged('w', id, 'name', w.name) ? ' changed' : ''}" for="w--${id}--name"><span class="fl">名前</span><input type="text" id="w--${id}--name" ${data} data-scope="w" data-f="name" maxlength="18" value="${esc(w.name)}" style="width:170px"></label>
          <label class="f${fieldChanged('w', id, 'short', w.short) ? ' changed' : ''}" for="w--${id}--short"><span class="fl">短い名前<small>4 文字まで</small></span><input type="text" id="w--${id}--short" ${data} data-scope="w" data-f="short" maxlength="4" value="${esc(w.short || '')}" style="width:80px"></label>
        </div>
        <div class="card-actions" style="margin-top:10px">
          <button class="btn ghost small" id="dupw-${id}" data-act="dup-weapon" data-id="${id}">複製して新しい武装を作る</button>
          ${deleteWeaponHtml(w, users)}
        </div>
      </details>
    </article>`;
  }
  function bladeHtml(w, base) {
    const id = w.id;
    const isBeam = w.blade.color === 'beam';
    const color = isBeam ? '#8ff4ff' : w.blade.color;
    const ch = base && base.blade ? !same(base.blade.color, w.blade.color) : !!S.files;
    return `<div class="blade-row${ch ? ' changed' : ''}">
      <label class="f${ch ? ' changed' : ''}" for="w--${id}--bladeColor" style="grid-template-columns:auto auto"><span class="fl">刃の色</span>
        <input type="color" id="w--${id}--bladeColor" data-id="${id}" data-scope="w" data-f="bladeColor" value="${esc(/^#[0-9a-f]{6}$/i.test(color) ? color : '#ff5fd2')}"${isBeam ? ' disabled' : ''}></label>
      <label class="check" for="w--${id}--bladeBeam"><input type="checkbox" id="w--${id}--bladeBeam" data-id="${id}" data-scope="w" data-f="bladeBeam"${isBeam ? ' checked' : ''}> 勢力のビームの色にする</label>
    </div>`;
  }
  function deleteWeaponHtml(w, users) {
    if (users.length) return '<span class="note">機体が持っているので削除できません</span>';
    if (S.confirm === 'del-weapon:' + w.id) {
      return `<span class="confirm"><span>${esc(w.name)} を削除します。</span>
        <button class="btn danger small" id="yes-delw-${w.id}" data-act="del-weapon" data-id="${w.id}">削除する</button>
        <button class="btn ghost small" id="no-delw-${w.id}" data-act="cancel">やめる</button></span>`;
    }
    return `<button class="btn danger small" id="ask-delw-${w.id}" data-act="ask" data-key="del-weapon:${w.id}">削除</button>`;
  }
  function derived(w) {
    const E = S.game.energyMax;
    const n = w.kind !== 'melee' && (w.count || 1) > 1 ? w.count : 1;
    const out = [];
    if (w.kind === 'charge') {
      out.push(`<b>1 発 ${fmt(w.dmg, 1)}</b>`, `<span>ためて ${fmt(w.charge, 1)} 秒</span>`);
    } else {
      out.push(`<b>秒あたりの威力 ${fmt((w.dmg * n) / w.cooldown, 1)}</b>`);
    }
    if (w.ammo) out.push(`<span>撃ち切るまで ${fmt(w.ammo * w.cooldown, 1)} 秒</span>`);
    if (w.energy) out.push(`<span>エネルギー満タン（${E}）で ${Math.floor(E / w.energy)} 発</span>`);
    if (w.style === 'whip') out.push(`<span>当たると ${fmt(w.stun || 0, 1)} 秒しびれる</span>`);
    return out;
  }

  // ----- 出撃 -----
  function armyHtml() {
    const g = S.game;
    let h = `<div class="view-head"><p class="lead">各勢力から出撃させる機体と数です。1 勢力 1〜${g.armyMax} 体。陣形は役割と数に合わせて自動で組まれます。戦艦は別に 1 隻ずつ出ます。</p>${resetHtml('army', '出撃の数')}</div><div class="army-grid">`;
    g.factions.forEach((fac, team) => {
      const p = fac.prefix;
      const t = total(p);
      const counts = S.draft.army[p] || {};
      const baseC = S.files ? S.files.army[p] || {} : null;
      const hp = unitsOf(p).reduce((a, u) => a + (counts[u.id] || 0) * u.hp, 0);
      const list = unitsOf(p).slice().sort((a, b) => g.roleOrder.indexOf(a.role) - g.roleOrder.indexOf(b.role));
      h += `<section class="army-fac ${team ? 'fac-crimson' : 'fac-azure'}">
        <div class="army-head"><h2 class="sec"><span class="fac-dot"></span>${esc(fac.label)}</h2>
        <div class="total${t >= g.armyMax ? ' full' : ''}"><b>${t}</b> / ${g.armyMax} 体</div></div>
        <ul class="rows">${list.map((u) => {
          const n = counts[u.id] || 0;
          const ch = baseC && (baseC[u.id] || 0) !== n;
          const id = `a--${p}--${u.id}`;
          const others = t - n;
          return `<li class="row"><span class="glyph" aria-hidden="true">${ROLE_GLYPH[u.role] || '?'}</span>
            <span class="row-name"><strong class="${ch ? 'changed' : ''}">${esc(u.name)}</strong><span>${esc(FMT.ROLE_LABELS[u.role] || u.role)}・${esc(u.size)}・HP ${fmt(u.hp)}${ch ? '・元 ' + (baseC[u.id] || 0) + ' 体' : ''}</span></span>
            <span class="step">
              <button type="button" id="${id}-dn" data-act="step" data-fac="${p}" data-id="${u.id}" data-d="-1" aria-label="${esc(u.name)} を 1 体減らす"${n <= 0 || t <= 1 ? ' disabled' : ''}>−</button>
              <input type="number" id="${id}" data-scope="a" data-fac="${p}" data-id="${u.id}" min="0" max="${g.armyMax - others}" step="1" value="${n}" aria-label="${esc(u.name)} の数">
              <button type="button" id="${id}-up" data-act="step" data-fac="${p}" data-id="${u.id}" data-d="1" aria-label="${esc(u.name)} を 1 体増やす"${t >= g.armyMax ? ' disabled' : ''}>＋</button>
            </span></li>`;
        }).join('')}</ul>
        <p class="hp-sum">軍の HP 合計 ${fmt(hp)}</p>
      </section>`;
    });
    h += `</div><figure class="field"><canvas id="field" role="img" aria-label="開始時の陣形"></canvas>
      <figcaption>${g.roleOrder.map((r) => `<span class="lg"><i>${ROLE_GLYPH[r]}</i>${esc(FMT.ROLE_LABELS[r])}</span>`).join('')}<span class="lg"><i class="lead1">隊</i>黄色の枠: 最初に操作する機体</span><span>戦場全体（${g.field.w}×${g.field.h}）と、試合開始時の並び</span></figcaption></figure>`;
    return h;
  }

  function drawField() {
    const cv = $('#field');
    if (!cv || !S.ready || S.view !== 'army') return;
    const g = S.game;
    const W = cv.parentElement.clientWidth - 24;
    if (W <= 0) return;
    const H = Math.round((W * g.field.h) / g.field.w);
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.height = H + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const col = (n) => css.getPropertyValue(n).trim();
    const k = W / g.field.w;
    ctx.fillStyle = col('--hull-2');
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = col('--seam');
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 200; x < g.field.w; x += 200) { ctx.moveTo(Math.round(x * k) + 0.5, 0); ctx.lineTo(Math.round(x * k) + 0.5, H); }
    for (let y = 200; y < g.field.h; y += 200) { ctx.moveTo(0, Math.round(y * k) + 0.5); ctx.lineTo(W, Math.round(y * k) + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = col('--dim');
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(Math.round(W / 2) + 0.5, 0);
    ctx.lineTo(Math.round(W / 2) + 0.5, H);
    ctx.stroke();
    ctx.setLineDash([]);
    const facCol = [col('--azure'), col('--crimson')];
    // 戦艦
    g.ships.forEach((s, team) => {
      const L = Math.max(30, 130 * k), T = Math.max(10, 44 * k);
      const x = s.x * k, y = s.y * k, dir = team === 0 ? 1 : -1;
      ctx.fillStyle = facCol[team];
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(x - (L / 2) * dir, y - T / 2);
      ctx.lineTo(x + (L / 2 - T / 2) * dir, y - T / 2);
      ctx.lineTo(x + (L / 2) * dir, y);
      ctx.lineTo(x + (L / 2 - T / 2) * dir, y + T / 2);
      ctx.lineTo(x - (L / 2) * dir, y + T / 2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = facCol[team];
      ctx.stroke();
      ctx.fillStyle = col('--dim');
      ctx.font = '11px ' + col('--f-pixel');
      ctx.textAlign = 'center';
      ctx.fillText(s.name, x, y + T / 2 + 13);
    });
    // 機体
    g.factions.forEach((fac, team) => {
      const army = FMT.buildArmy(S.draft.army[fac.prefix], fac.prefix, S.draft, g);
      const dir = team === 0 ? 1 : -1;
      const sp = g.spawn[team];
      const lead = Math.max(0, army.findIndex((s) => s.role === 'commander'));
      army.forEach((s, i) => {
        const u = unitById(s.type);
        const zk = u && u.size === 'L' ? 2.2 : u && u.size === 'M' ? 1.5 : 1;
        const box = Math.round(Math.max(10, Math.min(18, 30 * k)) * zk);
        const x = clamp(sp.x + s.fx * dir * g.formationScale, g.field.edge, g.field.w - g.field.edge) * k;
        const y = clamp(sp.y + s.fy * g.formationScale, g.field.edge, g.field.h - g.field.edge) * k;
        ctx.fillStyle = col('--hull-3');
        ctx.fillRect(Math.round(x - box / 2), Math.round(y - box / 2), box, box);
        ctx.strokeStyle = i === lead ? col('--signal') : facCol[team];
        ctx.lineWidth = i === lead ? 2 : 1;
        ctx.strokeRect(Math.round(x - box / 2) + 0.5, Math.round(y - box / 2) + 0.5, box - 1, box - 1);
        ctx.fillStyle = col('--text');
        ctx.font = Math.round(box * 0.68) + 'px ' + col('--f-display');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ROLE_GLYPH[s.role] || '?', x, y + 1);
        ctx.textBaseline = 'alphabetic';
      });
    });
  }

  // ----- ファイル -----
  function fileTexts() {
    return {
      weapons: FMT.weaponsFile(S.draft, S.game),
      units: FMT.unitsFile(S.draft, S.game),
      army: FMT.armyFile(S.draft, S.game),
    };
  }
  function renderFiles(c, waiting) {
    const box = $('#files');
    const info = [
      { k: 'weapons', path: 'js/weapons.js', sub: '武装の性能', n: c.weapons },
      { k: 'units', path: 'js/units.js', sub: '機体（大きさ・変形・武装）', n: c.units },
      { k: 'army', path: 'js/army.js', sub: '出撃する機体と数', n: c.army },
    ];
    const texts = fileTexts();
    box.innerHTML = info.map((f) => `<div class="file">
      <div class="file-head"><code>${f.path}</code><span class="diff${f.n ? ' has' : ''}">${S.files ? (f.n ? 'ファイルと ' + f.n + ' か所ちがう' : 'ファイルと同じ') : ''}</span><span class="file-sub">${f.sub}</span></div>
      <div class="file-actions">
        <button class="btn small" id="copy-${f.k}" data-act="copy" data-file="${f.k}">中身をコピー</button>
        <button class="btn ghost small" id="peek-${f.k}" data-act="peek" data-file="${f.k}" aria-expanded="${S.peek[f.k] ? 'true' : 'false'}">${S.peek[f.k] ? '中身を閉じる' : '中身を見る'}</button>
        <span class="copy-note" id="note-${f.k}">${esc(S.copied[f.k] || '')}</span>
      </div>
      ${S.peek[f.k] ? `<pre class="peek" id="pre-${f.k}" tabindex="0">${esc(texts[f.k])}</pre>` : ''}
    </div>`).join('') + `<div class="file">
      <div class="file-head"><code>assets/*.png</code><span class="diff${waiting ? ' has' : ''}">${waiting ? 'まだ入れていない絵 ' + waiting + ' 枚' : 'ファイルと同じ'}</span><span class="file-sub">「絵」タブで取り込んだ絵</span></div>
    </div>`;
  }

  // ---------------- 操作 ----------------
  function cleanName(t, max, commit, fallback) {
    let s = t.value.toUpperCase().replace(NAME_CHARS, '').slice(0, max);
    if (commit) s = s.replace(/\s+/g, ' ').trim() || fallback;
    if (t.value !== s) t.value = s;
    return s;
  }
  function readNum(t, commit, cur) {
    const min = Number(t.min), max = Number(t.max), step = Number(t.step);
    let v = parseFloat(t.value);
    if (!isFinite(v)) {
      if (commit) t.value = fmtNum(cur);
      return null;
    }
    if (commit) {
      v = round(clamp(v, min, max), Math.max(decimals(step), 0));
      t.value = fmtNum(v);
    } else if (v < min || v > max) {
      return null;
    }
    return v;
  }
  function setSlot(u, k, s) {
    const list = (u.weapons || [null, null, null]).slice();
    while (list.length < 3) list.push(null);
    list[k] = normSlot(s);
    u.weapons = list;
  }

  function edit(t, commit) {
    const sc = t.dataset.scope;
    if (!sc || !S.draft || readOnlyUI()) return false;
    const f = t.dataset.f;
    if (sc === 'w') {
      const w = weaponById(t.dataset.id);
      if (!w) return false;
      if (f === 'name') { w.name = cleanName(t, 18, commit, w.id.toUpperCase()); return true; }
      if (f === 'short') { w.short = cleanName(t, 4, commit, w.id.slice(0, 4).toUpperCase()); return true; }
      if (f === 'bladeColor') { if (!commit) return false; w.blade = Object.assign({}, w.blade, { color: t.value }); return true; }
      if (f === 'bladeBeam') {
        const prev = w.blade.color !== 'beam' ? w.blade.color : S.lastBlade || '#ff5fd2';
        if (w.blade.color !== 'beam') S.lastBlade = w.blade.color;
        w.blade = Object.assign({}, w.blade, { color: t.checked ? 'beam' : prev });
        return true;
      }
      const v = readNum(t, commit, wValue(w, f));
      if (v === null || same(wValue(w, f), v)) return false;
      w[f] = v;
      if (f === 'count' && v > 1 && w.arc === undefined) w.arc = 0.5;
      return true;
    }
    if (sc === 'u') {
      const u = unitById(t.dataset.id);
      if (!u) return false;
      if (f === 'name') { u.name = cleanName(t, 14, commit, u.id.toUpperCase().slice(0, 14)); return true; }
      if (f === 'role') { u.role = t.value; return true; }
      if (f === 'size') { if (!t.checked) return false; u.size = t.value; return true; }
      if (f === 'sprite') {
        const s = t.value.replace(/[^A-Za-z0-9_]/g, '');
        if (s !== t.value) t.value = s;
        if (!s) { if (commit) t.value = u.sprite; return false; }
        u.sprite = s;
        return true;
      }
      if (f === 'transform') {
        if (t.checked) u.transform = Object.assign({ sprite: u.faction + '_raider_jet', speed: 1.7, turn: 0.7 }, S.lastTf && S.lastTf[u.id]);
        else { S.lastTf = S.lastTf || {}; S.lastTf[u.id] = u.transform; delete u.transform; }
        return true;
      }
      const cur = f === 'energy' ? (u.energy !== undefined ? u.energy : S.game.energyMax) : u[f];
      const v = readNum(t, commit, cur);
      if (v === null || same(cur, v)) return false;
      if (f === 'energy' && v === S.game.energyMax) delete u.energy;
      else u[f] = v;
      return true;
    }
    if (sc === 'tf') {
      const u = unitById(t.dataset.id);
      if (!u || !u.transform) return false;
      if (f === 'sprite') {
        const s = t.value.replace(/[^A-Za-z0-9_]/g, '');
        if (s !== t.value) t.value = s;
        if (!s) { if (commit) t.value = u.transform.sprite; return false; }
        u.transform.sprite = s;
        return true;
      }
      const v = readNum(t, commit, u.transform[f]);
      if (v === null || same(u.transform[f], v)) return false;
      u.transform[f] = v;
      return true;
    }
    if (sc === 'slot') {
      const u = unitById(t.dataset.id);
      const k = Number(t.dataset.k);
      if (!u) return false;
      const s = (u.weapons || [])[k] || null;
      if (f === 'id') { if (!commit) return false; setSlot(u, k, t.value || null); return true; }
      const w = weaponById(slotId(s));
      if (!w) return false;
      const v = readNum(t, commit, slotVal(s, f));
      if (v === null || same(slotVal(s, f), v)) return false;
      const o = typeof s === 'object' && s ? Object.assign({}, s) : { id: w.id };
      if (same(w[f], v)) delete o[f];
      else o[f] = v;
      setSlot(u, k, o);
      return true;
    }
    if (sc === 'a') {
      let v = parseInt(t.value, 10);
      if (!isFinite(v)) { if (commit) t.value = (S.draft.army[t.dataset.fac] || {})[t.dataset.id] || 0; return false; }
      return setCount(t.dataset.fac, t.dataset.id, v);
    }
    return false;
  }
  function setCount(p, id, v) {
    const c = S.draft.army[p] || (S.draft.army[p] = {});
    const cur = c[id] || 0;
    const others = total(p) - cur;
    v = clamp(Math.round(v), 0, S.game.armyMax - others);
    if (others + v < 1) v = 1;
    if (v === cur) return false;
    c[id] = v;
    return true;
  }

  function newId(prefix, base) {
    const ids = new Set(S.draft.units.map((u) => u.id).concat(S.draft.weapons.map((w) => w.id)));
    let stem = (base || prefix + '_unit').replace(/_\d+$/, '');
    let n = 2;
    while (ids.has(stem + '_' + n)) n++;
    return stem + '_' + n;
  }
  function act(btn) {
    const a = btn.dataset.act;
    if (a === 'ask') { S.confirm = btn.dataset.key; renderCurrent(); return; }
    if (a === 'cancel') { S.confirm = null; renderCurrent(); return; }
    if (a === 'copy') return copyFile(btn.dataset.file, btn);
    if (a === 'peek') { S.peek[btn.dataset.file] = !S.peek[btn.dataset.file]; renderChrome(); return; }
    if (a === 'cut-for') { S.cutPreset = btn.dataset.sprite; location.hash = 'images'; return; }
    if (a === 'img-ask') { S.confirm = 'img:' + btn.dataset.sprite; renderQueue(); return; }
    if (a === 'img-cancel') { S.confirm = null; renderQueue(); return; }
    if (a === 'img-del') return removeImage(btn.dataset.sprite);
    if (readOnlyUI()) return;
    if (a === 'reset') {
      const what = btn.dataset.what;
      S.draft[what] = clone(S.files[what]);
      if (what === 'units') S.draft.army = fixArmy(S.draft.army);
      S.confirm = null;
      changed(true);
      return;
    }
    if (a === 'step') { if (setCount(btn.dataset.fac, btn.dataset.id, ((S.draft.army[btn.dataset.fac] || {})[btn.dataset.id] || 0) + Number(btn.dataset.d))) changed(true); return; }
    if (a === 'add-unit' || a === 'dup-unit') {
      const src = a === 'dup-unit' ? unitById(btn.dataset.id) : unitsOf(btn.dataset.fac).find((u) => u.role === 'grunt') || unitsOf(btn.dataset.fac)[0];
      const p = src.faction;
      const u = clone(src);
      u.id = newId(p, a === 'dup-unit' ? src.id : p + '_unit');
      u.name = (a === 'dup-unit' ? (src.name + ' II') : 'NEW UNIT').slice(0, 14);
      S.draft.units.splice(S.draft.units.indexOf(src) + (a === 'dup-unit' ? 1 : S.draft.units.filter((x) => x.faction === p).length), 0, u);
      // 並びを勢力ごとにそろえる
      S.draft.units = S.game.factions.flatMap((f) => S.draft.units.filter((x) => x.faction === f.prefix));
      const army = S.draft.army[p] || (S.draft.army[p] = {});
      army[u.id] = total(p) < S.game.armyMax ? 1 : 0;
      S.open.add('u:' + u.id);
      changed(true);
      requestAnimationFrame(() => { const el = $('#bay-' + u.id); if (el) { el.scrollIntoView({ block: 'nearest' }); const n = $('#u--' + u.id + '--name'); if (n) n.focus({ preventScroll: true }); } });
      return;
    }
    if (a === 'del-unit') {
      const u = unitById(btn.dataset.id);
      if (!u || unitsOf(u.faction).length <= 1) return;
      S.draft.units = S.draft.units.filter((x) => x !== u);
      delete (S.draft.army[u.faction] || {})[u.id];
      if (total(u.faction) < 1) { const first = unitsOf(u.faction)[0]; S.draft.army[u.faction][first.id] = 1; }
      S.confirm = null;
      changed(true);
      return;
    }
    if (a === 'dup-weapon') {
      const src = weaponById(btn.dataset.id);
      const w = clone(src);
      w.id = newId('', src.id);
      w.name = (src.name + ' II').slice(0, 18);
      S.draft.weapons.splice(S.draft.weapons.indexOf(src) + 1, 0, w);
      S.open.add('names:' + w.id);
      changed(true);
      requestAnimationFrame(() => { const el = $('#card-' + w.id); if (el) el.scrollIntoView({ block: 'nearest' }); });
      return;
    }
    if (a === 'del-weapon') {
      const w = weaponById(btn.dataset.id);
      if (!w || usersOf(w.id).length) return;
      S.draft.weapons = S.draft.weapons.filter((x) => x !== w);
      S.confirm = null;
      changed(true);
    }
  }
  function fixArmy(army) {
    const out = {};
    for (const f of S.game.factions) {
      out[f.prefix] = {};
      for (const u of S.draft.units.filter((x) => x.faction === f.prefix)) out[f.prefix][u.id] = (army[f.prefix] || {})[u.id] || 0;
      if (!Object.values(out[f.prefix]).some(Boolean)) { const first = S.draft.units.find((x) => x.faction === f.prefix); if (first) out[f.prefix][first.id] = 1; }
    }
    return out;
  }

  function copyFile(k, btn) {
    const text = fileTexts()[k];
    const note = (msg) => { S.copied[k] = msg; const el = $('#note-' + k); if (el) el.textContent = msg; setTimeout(() => { if (S.copied[k] === msg) { S.copied[k] = ''; const e2 = $('#note-' + k); if (e2) e2.textContent = ''; } }, 3000); };
    const fallback = () => {
      S.peek[k] = true;
      renderChrome();
      const pre = $('#pre-' + k);
      if (pre) {
        const r = document.createRange();
        r.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        pre.focus();
      }
      note('選択しました。Ctrl+C でコピーしてください');
    };
    try {
      navigator.clipboard.writeText(text).then(() => note('コピーしました'), fallback);
    } catch (e) {
      fallback();
    }
  }

  function changed(full) {
    if (full) render();
    else renderChrome();
    scheduleSave();
  }
  const readOnlyUI = () => readOnly;

  // ---------------- 保存（このブラウザの中） ----------------
  const DRAFT_KEY = 'stellar-legion-settings-draft';
  const TRIAL_KEY = 'stellar-legion-settings-trial';
  const TOKEN_KEY = 'stellar-legion-github-token';
  const store = {
    get(k, session) {
      try { return (session ? window.sessionStorage : window.localStorage).getItem(k); } catch (e) { return null; }
    },
    set(k, v, session) { (session ? window.sessionStorage : window.localStorage).setItem(k, v); },
    del(k, session) {
      try { (session ? window.sessionStorage : window.localStorage).removeItem(k); } catch (e) { /* 使えないブラウザ */ }
    },
  };
  function setLamp(state, text) {
    const l = $('#lamp');
    l.dataset.state = state;
    $('#lamp-text').textContent = text;
  }
  const hhmm = () => { const d = new Date(); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
  function imagesObj() {
    const o = {};
    for (const im of S.images) {
      o[im.sprite] = { dataUrl: im.dataUrl, height: im.height, maxWidth: im.maxWidth, w: im.w, h: im.h, source: im.source, status: im.status, savedAt: im.savedAt };
    }
    return o;
  }
  const draftBody = () => ({ weapons: S.draft.weapons, units: S.draft.units, army: S.draft.army, images: imagesObj(), savedAt: Date.now() });
  function scheduleSave() {
    dirty = true;
    setLamp('pending', '保存待ち');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
  }
  function flush() {
    clearTimeout(saveTimer);
    if (!S.draft) return true;
    try {
      store.set(DRAFT_KEY, JSON.stringify(draftBody()));
      dirty = false;
      setLamp('saved', 'このブラウザに保存しました ' + hhmm());
      return true;
    } catch (e) {
      const full = e && (e.name === 'QuotaExceededError' || e.code === 22);
      setLamp('error', full ? '保存できません（このブラウザに保存できる量の上限です。絵を減らしてください）' : '保存できません（このブラウザでは保存が使えません）');
      return false;
    }
  }
  window.addEventListener('beforeunload', () => { if (dirty) flush(); });
  // 同じブラウザのほかのタブで変えたとき
  window.addEventListener('storage', (e) => {
    if (e.key !== DRAFT_KEY || dirty || !S.ready) return;
    const d = parseDraft(e.newValue);
    if (!d) return;
    S.draft = d.values;
    S.images = d.images;
    render();
    renderQueue();
    setLamp('saved', 'ほかのタブの変更を読み込みました');
  });

  // ---------------- 読み込み ----------------
  function showState(title, text) {
    const el = $('#state');
    el.hidden = false;
    el.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p>`;
  }
  function normalize(v) {
    v = clone(v || {});
    v.weapons = Array.isArray(v.weapons) ? v.weapons : [];
    v.units = Array.isArray(v.units) ? v.units : [];
    v.army = v.army && typeof v.army === 'object' ? v.army : {};
    for (const u of v.units) {
      u.size = ['S', 'M', 'L'].indexOf(u.size) >= 0 ? u.size : 'S';
      u.weapons = [0, 1, 2].map((k) => (u.weapons || [])[k] || null);
    }
    return { weapons: v.weapons, units: v.units, army: v.army };
  }
  function parseDraft(text) {
    try {
      const d = JSON.parse(text || 'null');
      if (!d || !Array.isArray(d.weapons) || !Array.isArray(d.units) || !d.army) return null;
      const images = Object.keys(d.images || {})
        .map((k) => Object.assign({ sprite: k }, d.images[k]))
        .filter((x) => typeof x.dataUrl === 'string' && x.dataUrl.indexOf('data:image/png') === 0)
        .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      return { values: normalize(d), images };
    } catch (e) {
      return null;
    }
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = () => reject(new Error(src));
      document.head.appendChild(s);
    });
  }
  // ゲームのデータファイルをそのまま読み込んで、いまの値を取り出す（公開中のファイルと必ずそろう）
  async function loadGameFiles() {
    window.SL = {};
    const t = Date.now();
    for (const f of ['config.js', 'weapons.js', 'units.js', 'army.js', 'data.js', 'asset-overrides.js']) await loadScript('js/' + f + '?t=' + t);
    S.repo = window.SL.CONFIG.REPO || '';
    S.branch = window.SL.CONFIG.BRANCH || 'main';
    return FMT.exportFromSL(window.SL);
  }

  async function start() {
    let ex;
    try {
      ex = await loadGameFiles();
    } catch (e) {
      showState('ゲームのファイルを読み込めませんでした', 'ページを開き直してください。（' + ((e && e.message) || 'error') + '）');
      setLamp('error', '読み込めません');
      return;
    }
    S.game = ex.game;
    S.files = normalize(ex.values);
    const d = parseDraft(store.get(DRAFT_KEY));
    if (d) {
      S.draft = d.values;
      S.images = d.images;
    } else {
      S.draft = clone(S.files);
      S.images = [];
    }
    S.ready = true;
    $('#state').hidden = true;
    $('#rail').hidden = false;
    showView(viewFromHash(), true);
    render();
    renderQueue();
    if (S.view === 'images') openCutter();
    setLamp('saved', d ? 'このブラウザに保存した変更を読み込みました' : 'ゲームのファイルを読み込みました');
    initPublish();
  }

  // ---------------- このブラウザで試す ----------------
  function checkDraft() {
    const errs = FMT.validate(S.draft, S.game);
    return errs.length ? errs : null;
  }
  $('#try-link').addEventListener('click', (e) => {
    const note = $('#try-note');
    const errs = S.ready ? checkDraft() : ['まだ読み込み中です'];
    if (errs) {
      e.preventDefault();
      note.textContent = '試せません: ' + errs.slice(0, 3).join(' / ');
      return;
    }
    flush();
    try {
      store.set(TRIAL_KEY, JSON.stringify(Object.assign(draftBody(), { images: imagesObj() })));
      note.textContent = '新しいタブで、変えた設定のゲームを開きました（タイトルの上に TRIAL と出ます）。';
    } catch (err) {
      e.preventDefault();
      note.textContent = 'このブラウザに保存できないので試せません。絵を減らしてください。';
    }
  });

  // ---------------- 公開ゲームに反映（GitHub） ----------------
  const GH = { busy: false, confirm: false, plan: null };
  function initPublish() {
    $('#gh-repo-name').textContent = S.repo ? S.repo.split('/').pop() : 'stellar-legion';
    const remembered = store.get(TOKEN_KEY);
    const session = store.get(TOKEN_KEY, true);
    $('#gh-remember').checked = !!remembered;
    $('#gh-token').value = remembered || session || '';
    renderPublish();
  }
  function saveToken() {
    const t = $('#gh-token').value.trim();
    const remember = $('#gh-remember').checked;
    try {
      if (remember && t) { store.set(TOKEN_KEY, t); store.del(TOKEN_KEY, true); }
      else { store.del(TOKEN_KEY); if (t) store.set(TOKEN_KEY, t, true); else store.del(TOKEN_KEY, true); }
    } catch (e) { /* 覚えられなくても、このページを開いている間は使える */ }
  }
  $('#gh-token').addEventListener('change', saveToken);
  $('#gh-remember').addEventListener('change', saveToken);

  // 反映するもの（ファイルと違うものだけ）
  function publishPlan() {
    const texts = fileTexts();
    const base = {
      weapons: FMT.weaponsFile(S.files, S.game),
      units: FMT.unitsFile(S.files, S.game),
      army: FMT.armyFile(S.files, S.game),
    };
    const files = [];
    for (const k of ['weapons', 'units', 'army']) if (texts[k] !== base[k]) files.push({ path: 'js/' + k + '.js', text: texts[k] });
    const images = S.images.filter((x) => x.status !== 'applied');
    return { files, images };
  }
  function setGh(text) { $('#gh-status').textContent = text; }
  function renderPublish() {
    const box = $('#gh-action');
    if (!box || !S.ready) return;
    if (GH.busy) { box.innerHTML = '<button class="btn" disabled>反映しています…</button>'; return; }
    if (GH.confirm && GH.plan) {
      const list = GH.plan.files.map((f) => f.path).concat(GH.plan.images.map((im) => 'assets/' + im.sprite + '.png'));
      if (GH.plan.images.length) list.push('js/asset-overrides.js');
      box.innerHTML = `<div class="confirm" style="display:grid;gap:8px"><span>公開ゲームの次のファイルを書き換えます。みんなが遊ぶゲームが変わります。</span>
        <code class="pub-list">${list.map(esc).join('<br>')}</code>
        <span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="gh-go">反映する</button><button class="btn ghost" id="gh-no">やめる</button></span></div>`;
      $('#gh-go').addEventListener('click', publish);
      $('#gh-no').addEventListener('click', () => { GH.confirm = false; renderPublish(); });
      return;
    }
    box.innerHTML = '<button class="btn" id="gh-ask">公開ゲームに反映する</button>';
    $('#gh-ask').addEventListener('click', askPublish);
  }
  function askPublish() {
    if (!S.repo) { setGh('リポジトリが決まっていません（js/config.js の REPO）。'); return; }
    if (!$('#gh-token').value.trim()) { setGh('GitHub のトークンを入れてください。作り方は「トークンの作り方」を見てください。'); return; }
    const errs = checkDraft();
    if (errs) { setGh('反映できません: ' + errs.slice(0, 3).join(' / ')); return; }
    const plan = publishPlan();
    if (!plan.files.length && !plan.images.length) { setGh('公開ゲームのファイルと同じなので、反映するものはありません。'); return; }
    flush();
    GH.plan = plan;
    GH.confirm = true;
    setGh('');
    renderPublish();
  }
  async function publish() {
    const plan = GH.plan;
    if (!plan || GH.busy) return;
    saveToken();
    GH.busy = true;
    GH.confirm = false;
    renderPublish();
    const c = changes();
    const lines = [];
    if (c.weapons) lines.push('- weapons: ' + c.weapons + ' changes');
    if (c.units) lines.push('- units: ' + c.units + ' changes');
    if (c.army) lines.push('- army: ' + c.army + ' changes');
    for (const im of plan.images) lines.push('- image: assets/' + im.sprite + '.png');
    const message = 'Update settings from the settings page\n\n' + lines.join('\n');
    try {
      const res = await window.SLGitHub.commit({
        token: $('#gh-token').value.trim(),
        repo: S.repo,
        branch: S.branch,
        message,
        files: plan.files.concat(plan.images.map((im) => ({ path: 'assets/' + im.sprite + '.png', base64: im.dataUrl.split(',')[1] }))),
        edits: plan.images.length ? [{
          path: 'js/asset-overrides.js',
          apply: (text) => plan.images.reduce((t, im) => FMT.upsertAssetOverride(t, im.sprite, im.height, im.maxWidth), text),
        }] : [],
        onStep: (t) => setGh(t + '…'),
      });
      // 公開ゲームのファイルが、この内容になった
      S.files = clone({ weapons: S.draft.weapons, units: S.draft.units, army: S.draft.army });
      for (const im of plan.images) {
        im.status = 'applied';
        S.game.spriteSizes = S.game.spriteSizes || {};
        S.game.spriteSizes[im.sprite] = { height: im.height, maxWidth: im.maxWidth };
        if ((S.game.sprites || []).indexOf(im.sprite) < 0) S.game.sprites.push(im.sprite);
      }
      flush();
      render();
      renderQueue();
      const link = res.url ? ` <a href="${esc(res.url)}" target="_blank" rel="noopener">コミット ${esc(res.sha.slice(0, 7))}</a>` : '';
      $('#gh-status').innerHTML = (res.unchanged ? '公開ゲームのファイルと同じだったので、書き換えませんでした。' : '反映しました。1〜2 分で公開ゲームが新しくなります（ブラウザの再読み込みが必要なことがあります）。') + link;
    } catch (e) {
      const st = e && e.status;
      const msg = st === 401 ? 'トークンが正しくないか、期限が切れています。'
        : st === 403 ? 'このトークンには書き込む権限がありません。Contents を Read and write にしてください。'
        : st === 404 ? 'リポジトリが見つかりません。トークンを作るときに ' + S.repo + ' を選んだか確かめてください。'
        : st === 409 || st === 422 ? 'ほかの変更とぶつかりました。少し待ってから、もう一度押してください。'
        : st === 0 ? 'GitHub とつながりません。インターネットの接続を確かめてください。'
        : '反映できませんでした（' + ((e && e.message) || 'error') + '）。';
      setGh(msg);
    } finally {
      GH.busy = false;
      GH.plan = null;
      renderPublish();
    }
  }

  // ---------------- 画面の切り替え ----------------
  const VIEWS = ['units', 'weapons', 'army', 'images'];
  const viewFromHash = () => { const h = location.hash.replace('#', ''); return VIEWS.indexOf(h) >= 0 ? h : 'units'; };
  function showView(v, noRender) {
    S.view = v;
    S.confirm = null;
    for (const x of VIEWS) {
      $('#view-' + x).hidden = x !== v || !S.ready;
      $('#tab-' + x).setAttribute('aria-selected', x === v ? 'true' : 'false');
    }
    if (!noRender && S.ready) render(v);
    if (v === 'images' && S.ready) openCutter();
  }
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    if (location.hash !== '#' + b.dataset.view) location.hash = b.dataset.view;
    else showView(b.dataset.view);
  });
  window.addEventListener('hashchange', () => showView(viewFromHash()));

  const main = $('#main');
  main.addEventListener('input', (e) => { if (edit(e.target, false)) changed(false); });
  main.addEventListener('change', (e) => {
    if (!e.target.dataset.scope) return;
    const did = edit(e.target, true);
    renderCurrent();
    if (did) scheduleSave();
    else if (dirty) scheduleSave();
  });
  main.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input[type="number"], input[type="text"]')) e.target.blur();
  });
  main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) act(b);
  });
  main.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.dataset || !d.dataset.key) return;
    const key = d.dataset.key;
    if (d.open === S.open.has(key)) return;
    if (d.open) S.open.add(key); else S.open.delete(key);
    if (key.indexOf('u:') === 0) {
      const u = unitById(key.slice(2));
      if (u && d.open) d.insertAdjacentHTML('beforeend', unitBody(u, baseOf('u', u.id)));
      else d.querySelectorAll('.bay-body').forEach((x) => x.remove());
    }
  }, true);
  $('#rail').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) act(b);
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => drawField()).observe(main);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawField());

  // ================= 絵の切り抜きと取り込み =================
  const SAMPLE = window.SL_SAMPLE_IMAGE || '';
  const MAX_SIDE = 1600; // これより大きい画像は縮めてから処理する
  const C$ = (id) => document.getElementById(id);
  const cut = {
    w: 0, h: 0, data: null, mask: null, bg: [255, 255, 255], bgAuto: true,
    tol: 48, fringe: 1, specks: true, flip: false, outline: false, mode: 'erase',
    seeds: [], sourceName: '', loaded: false, target: null,
  };

  function cutTargets() {
    const list = [];
    const seen = new Set();
    const sizes = S.game.spriteSizes || {};
    const add = (id, label, h, mw, fac) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const z = sizes[id];
      list.push({ id, label, height: z ? z.height : h, maxWidth: z ? z.maxWidth : mw, faction: fac });
    };
    for (const u of S.draft.units) {
      const fac = FMT.FACTION_LABELS[u.faction] || u.faction;
      const big = u.role === 'giant';
      add(u.sprite, fac + ' ' + (FMT.ROLE_LABELS[u.role] || u.role) + ' ' + u.name, big ? 46 : 28, big ? 64 : 40, u.faction);
      if (u.transform) add(u.transform.sprite, fac + ' ' + u.name + '（移動モード）', 15, 40, u.faction);
    }
    S.game.ships.forEach((sh, i) => add(sh.sprite, (FMT.FACTION_LABELS[S.game.factions[i].prefix] || '') + ' 戦艦 ' + sh.name, 30, 96, S.game.factions[i].prefix));
    for (const id of S.game.sprites || []) add(id, id, 26, 36, id.split('_')[0]);
    return list;
  }
  function refreshCutTargets() {
    const sel = C$('cut-target');
    const list = cutTargets();
    const want = S.cutPreset || sel.value || (cut.target && cut.target.id) || 'az_grunt';
    S.cutPreset = null;
    sel.innerHTML = list.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}（${esc(t.id)}）</option>`).join('') + '<option value="__new">新しい ID の絵…</option>';
    sel.value = list.some((t) => t.id === want) ? want : want === '__new' ? '__new' : list[0] ? list[0].id : '__new';
    applyTarget();
  }
  function applyTarget() {
    const sel = C$('cut-target');
    const isNew = sel.value === '__new';
    C$('cut-new-row').hidden = !isNew;
    if (isNew) {
      const id = C$('cut-new-id').value;
      cut.target = { id, label: '新しい絵 ' + id, height: Number(C$('cut-height').value) || 26, maxWidth: Number(C$('cut-maxw').value) || 36, faction: id.split('_')[0], isNew: true };
    } else {
      const t = cutTargets().find((x) => x.id === sel.value);
      cut.target = Object.assign({}, t);
      const q = S.images.find((x) => x.sprite === t.id);
      C$('cut-height').value = q ? q.height : t.height;
      C$('cut-maxw').value = q ? q.maxWidth : t.maxWidth;
    }
    readSizes();
    updateImportButton();
    updatePreview();
  }
  function readSizes() {
    if (!cut.target) return;
    cut.target.height = clamp(Math.round(Number(C$('cut-height').value) || cut.target.height), 6, 200);
    cut.target.maxWidth = clamp(Math.round(Number(C$('cut-maxw').value) || cut.target.maxWidth), 6, 300);
  }
  function openCutter() {
    refreshCutTargets();
    renderQueue();
    if (!cut.loaded && SAMPLE.indexOf('data:') === 0) {
      cut.loaded = true;
      loadImage(SAMPLE, '見本の画像（量産機の元絵、白背景の JPG）');
    } else {
      updatePreview();
    }
  }

  function loadImage(src, name) {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const k = Math.min(1, MAX_SIDE / Math.max(w, h));
      w = Math.max(1, Math.round(w * k));
      h = Math.max(1, Math.round(h * k));
      const c = canvasOf(w, h);
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, w, h);
      cut.w = w; cut.h = h;
      cut.data = g.getImageData(0, 0, w, h).data;
      cut.seeds = [];
      cut.bgAuto = true;
      cut.sourceName = name;
      cut.bg = autoBackground();
      cut.loaded = true;
      C$('cut-work').width = w;
      C$('cut-work').height = h;
      C$('cut-info').textContent = name + '（' + img.naturalWidth + '×' + img.naturalHeight + (k < 1 ? '、処理のため ' + w + '×' + h + ' に縮小' : '') + '）';
      process();
    };
    img.onerror = () => { C$('cut-info').textContent = 'この画像は読み込めませんでした。JPG・PNG・WebP の画像を選んでください。'; };
    img.src = src;
  }
  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) { C$('cut-info').textContent = '画像ファイル（JPG・PNG・WebP）を選んでください。'; return; }
    loadImage(URL.createObjectURL(file), file.name);
  }
  const pxAt = (i) => { const d = cut.data; return [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]; };
  const dist2 = (d, i, c) => { const r = d[i * 4] - c[0], g = d[i * 4 + 1] - c[1], b = d[i * 4 + 2] - c[2]; return r * r + g * g + b * b; };
  // 外周の画素で一番多い色を背景とみなす
  function autoBackground() {
    const { w, h, data } = cut;
    const buckets = new Map();
    const add = (i) => {
      const key = ((data[i * 4] >> 4) << 8) | ((data[i * 4 + 1] >> 4) << 4) | (data[i * 4 + 2] >> 4);
      const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += data[i * 4]; b.g += data[i * 4 + 1]; b.b += data[i * 4 + 2];
      buckets.set(key, b);
    };
    for (let x = 0; x < w; x++) { add(x); add((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { add(y * w); add(y * w + w - 1); }
    let best = null;
    for (const b of buckets.values()) if (!best || b.n > best.n) best = b;
    return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
  }
  // 色が近い画素を、つながっている範囲だけ塗りつぶす（mask に 1 を立てる）
  function flood(mask, starts, color, tol2) {
    const { w, h, data } = cut;
    const queue = new Int32Array(w * h);
    let head = 0, tail = 0;
    for (const st of starts) {
      if (mask[st] || dist2(data, st, color) > tol2) continue;
      mask[st] = 1;
      queue[tail++] = st;
    }
    while (head < tail) {
      const i = queue[head++];
      const x = i % w, y = (i / w) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) {
        if (j < 0 || mask[j] || dist2(data, j, color) > tol2) continue;
        mask[j] = 1;
        queue[tail++] = j;
      }
    }
  }
  function process() {
    if (!cut.data) return;
    const { w, h, data } = cut;
    const n = w * h;
    const mask = new Uint8Array(n);
    const tol2 = cut.tol * cut.tol;
    const border = [];
    for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
    flood(mask, border, cut.bg, tol2);
    for (const sd of cut.seeds) flood(mask, [sd], pxAt(sd), tol2);
    const fringeTol2 = (cut.tol + 70) * (cut.tol + 70);
    for (let k = 0; k < cut.fringe; k++) {
      const kill = [];
      for (let i = 0; i < n; i++) {
        if (mask[i]) continue;
        const x = i % w, y = (i / w) | 0;
        const edge = (x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w]);
        if (edge && dist2(data, i, cut.bg) <= fringeTol2) kill.push(i);
      }
      for (const i of kill) mask[i] = 1;
    }
    if (cut.specks) {
      const label = new Int32Array(n);
      const sizes = [0];
      const queue = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        if (mask[i] || label[i]) continue;
        const id = sizes.length;
        let head = 0, tail = 0, size = 0;
        label[i] = id; queue[tail++] = i;
        while (head < tail) {
          const q = queue[head++]; size++;
          const x = q % w, y = (q / w) | 0;
          if (x > 0 && !mask[q - 1] && !label[q - 1]) { label[q - 1] = id; queue[tail++] = q - 1; }
          if (x < w - 1 && !mask[q + 1] && !label[q + 1]) { label[q + 1] = id; queue[tail++] = q + 1; }
          if (y > 0 && !mask[q - w] && !label[q - w]) { label[q - w] = id; queue[tail++] = q - w; }
          if (y < h - 1 && !mask[q + w] && !label[q + w]) { label[q + w] = id; queue[tail++] = q + w; }
        }
        sizes.push(size);
      }
      let biggest = 0;
      for (const z of sizes) if (z > biggest) biggest = z;
      const min = Math.max(20, biggest * 0.02);
      for (let i = 0; i < n; i++) if (!mask[i] && sizes[label[i]] < min) mask[i] = 1;
    }
    cut.mask = mask;
    drawWork();
    updatePreview();
  }
  function drawWork() {
    const { w, h, data, mask } = cut;
    const g = C$('cut-work').getContext('2d');
    const out = g.createImageData(w, h);
    out.data.set(data);
    for (let i = 0; i < w * h; i++) if (mask[i]) out.data[i * 4 + 3] = 0;
    g.putImageData(out, 0, 0);
    C$('cut-swatch').style.background = 'rgb(' + cut.bg.join(',') + ')';
    C$('cut-bg').textContent = (cut.bgAuto ? '外周から自動で判定：' : 'クリックで選んだ色：') + 'RGB ' + cut.bg.join(', ');
    C$('cut-undo').disabled = cut.seeds.length === 0;
    C$('cut-clear').disabled = cut.seeds.length === 0;
  }
  function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  // 背景を消して、余白を切り詰めた絵
  function cutout() {
    const { w, h, data, mask } = cut;
    if (!mask) return null;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return null;
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const c = canvasOf(cw, ch);
    const g = c.getContext('2d');
    const img = g.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const si = (y + y0) * w + (x + x0), d = (y * cw + x) * 4;
      img.data[d] = data[si * 4]; img.data[d + 1] = data[si * 4 + 1]; img.data[d + 2] = data[si * 4 + 2];
      img.data[d + 3] = mask[si] ? 0 : 255;
    }
    g.putImageData(img, 0, 0);
    if (!cut.flip) return c;
    const f = canvasOf(cw, ch);
    const fg = f.getContext('2d');
    fg.translate(cw, 0);
    fg.scale(-1, 1);
    fg.drawImage(c, 0, 0);
    return f;
  }
  // ゲームと同じ計算で、表示される大きさを求める
  function gameSize(cw, ch) {
    let k = cut.target.height / ch;
    if (cw * k > cut.target.maxWidth) k = cut.target.maxWidth / cw;
    return [Math.max(1, Math.round(cw * k)), Math.max(1, Math.round(ch * k))];
  }
  function shrink(src, tw, th) {
    let cur = src;
    while (cur.width / 2 >= tw && cur.height / 2 >= th) {
      const c = canvasOf(Math.round(cur.width / 2), Math.round(cur.height / 2));
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(cur, 0, 0, c.width, c.height);
      cur = c;
    }
    const out = canvasOf(tw, th);
    const og = out.getContext('2d');
    og.imageSmoothingEnabled = cur.width > tw;
    og.imageSmoothingQuality = 'high';
    og.drawImage(cur, 0, 0, tw, th);
    return out;
  }
  // 取り込む絵：ゲームで表示する大きさの 4 倍まで（大きな機体 M / L でも粗くならないように）
  function buildOutput() {
    const c = cutout();
    if (!c) return null;
    const [gw, gh] = gameSize(c.width, c.height);
    let src = c;
    const limit = 4;
    if (c.width > gw * limit) src = shrink(c, gw * limit, Math.max(1, Math.round((c.height * gw * limit) / c.width)));
    if (!cut.outline) return src;
    // 縁取り：ゲームの 1 ドットぶんの太さで黒い縁を付ける
    const t = Math.max(1, Math.round(src.width / gw));
    const out = canvasOf(src.width + t * 2, src.height + t * 2);
    const og = out.getContext('2d');
    const sil = canvasOf(src.width, src.height);
    const sg = sil.getContext('2d');
    sg.drawImage(src, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = '#0b1020';
    sg.fillRect(0, 0, src.width, src.height);
    for (const [dx, dy] of [[0, t], [t * 2, t], [t, 0], [t, t * 2]]) og.drawImage(sil, dx, dy);
    og.drawImage(src, t, t);
    return out;
  }
  const STARS = Array.from({ length: 70 }, () => [Math.random(), Math.random(), Math.random()]);
  function updatePreview() {
    const stage = C$('cut-stage');
    if (!stage || !cut.target || S.view !== 'images') return;
    const out = cut.data ? buildOutput() : null;
    const sg = stage.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const sw = Math.max(280, stage.parentElement.clientWidth - 24);
    stage.width = sw;
    stage.height = 180;
    stage.style.height = '180px';
    sg.fillStyle = css.getPropertyValue('--void').trim();
    sg.fillRect(0, 0, sw, 180);
    for (const [x, y, b] of STARS) { sg.fillStyle = b > 0.8 ? '#d8d0ff' : '#4a5078'; sg.fillRect(Math.floor(x * sw), Math.floor(y * 180), 1, 1); }
    if (!out) {
      C$('cut-stage-cap').textContent = cut.data ? '絵がすべて背景として消えています。「背景とみなす色の幅」を小さくしてください。' : 'ここに、ゲームの中での見え方が出ます。';
      return;
    }
    const [gw, gh] = gameSize(out.width, out.height);
    const inGame = shrink(out, gw, gh);
    const isRight = cut.target.faction === 'cr';
    sg.imageSmoothingEnabled = false;
    const Z = Math.max(1, Math.min(3, Math.floor(140 / gh)));
    const draw = (x, y, w, h) => {
      sg.save();
      if (isRight) { sg.translate(x + w, 0); sg.scale(-1, 1); sg.drawImage(inGame, 0, y, w, h); }
      else sg.drawImage(inGame, x, y, w, h);
      sg.restore();
    };
    const bx = 30, by = 86;
    draw(bx, Math.round(by - (gh * Z) / 2), gw * Z, gh * Z);
    const ax = bx + gw * Z + 50;
    draw(ax, Math.round(by - gh / 2), gw, gh);
    sg.fillStyle = css.getPropertyValue('--dim').trim();
    sg.font = '12px ' + css.getPropertyValue('--f-body').trim();
    sg.fillText(Z + ' 倍に拡大', bx, 172);
    sg.fillText('実際の大きさ', ax, 172);
    sg.fillText(isRight ? '← 敵（クリムゾンは左向きに出る）' : '敵 →（アズールは右向きに出る）', Math.min(sw - 220, ax + gw + 30), 22);
    C$('cut-stage-cap').textContent = 'ゲームの中では ' + gw + '×' + gh + ' ドットで出ます（S のとき）。取り込む画像は ' + out.width + '×' + out.height + '。';
  }
  let cutPending = false;
  function schedule() {
    if (cutPending) return;
    cutPending = true;
    requestAnimationFrame(() => { cutPending = false; process(); });
  }
  function setMode(m) {
    cut.mode = m;
    C$('cut-mode-erase').setAttribute('aria-pressed', String(m === 'erase'));
    C$('cut-mode-pick').setAttribute('aria-pressed', String(m === 'pick'));
    C$('cut-work').classList.toggle('pick', m === 'pick');
  }
  function cutNote(text) { C$('cut-note').textContent = text; }
  function targetId() {
    if (!cut.target) return '';
    if (!cut.target.isNew) return cut.target.id;
    return (C$('cut-new-id').value || '').trim();
  }
  function updateImportButton() {
    const b = C$('cut-import');
    if (!b) return;
    const id = targetId();
    const ok = /^[A-Za-z0-9_]+$/.test(id);
    b.disabled = !ok;
    b.textContent = ok ? 'ゲームに取り込む（' + id + '）' : 'ゲームに取り込む';
  }

  function importImage() {
    const id = targetId();
    if (!/^[A-Za-z0-9_]+$/.test(id)) { cutNote('絵の ID は英数字と _ だけで書いてください。'); return; }
    const out = buildOutput();
    if (!out) { cutNote('取り込む絵がありません。'); return; }
    readSizes();
    const img = {
      sprite: id, dataUrl: out.toDataURL('image/png'), height: cut.target.height, maxWidth: cut.target.maxWidth,
      w: out.width, h: out.height, source: cut.sourceName.slice(0, 120), status: 'waiting', savedAt: Date.now(),
    };
    const before = S.images;
    S.images = [img].concat(S.images.filter((x) => x.sprite !== id));
    if (!flush()) {
      S.images = before;
      flush();
      cutNote('このブラウザに保存できる量を超えました。ほかの取り込んだ絵を消してから、もう一度押してください。');
      return;
    }
    cutNote(id + ' の絵として取り込みました。「このブラウザで試す」で確かめて、「公開ゲームに反映する」でみんなのゲームに入ります。');
    renderQueue();
    renderChrome();
  }
  function removeImage(sprite) {
    S.confirm = null;
    S.images = S.images.filter((x) => x.sprite !== sprite);
    flush();
    renderQueue();
    renderChrome();
  }
  function renderQueue() {
    const box = C$('cut-queue');
    if (!box) return;
    if (!S.images.length) {
      box.innerHTML = '<p class="queue-empty">まだありません。上で切り抜いて「ゲームに取り込む」を押すと、ここに並びます。</p>';
      return;
    }
    const labels = {};
    if (S.ready) for (const t of cutTargets()) labels[t.id] = t.label;
    box.innerHTML = S.images.map((img) => {
      const waiting = img.status !== 'applied';
      const key = 'img:' + img.sprite;
      const del = S.confirm === key
        ? `<span class="confirm"><span>${waiting ? '取り込みを取り消します。' : '一覧から消します（公開ゲームの絵はそのまま）。'}</span><button class="btn danger small" id="imgdel-${esc(img.sprite)}" data-act="img-del" data-sprite="${esc(img.sprite)}">${waiting ? '取り消す' : '消す'}</button><button class="btn ghost small" id="imgno-${esc(img.sprite)}" data-act="img-cancel">やめる</button></span>`
        : `<button class="btn ghost small" id="imgask-${esc(img.sprite)}" data-act="img-ask" data-sprite="${esc(img.sprite)}">${waiting ? '取り込みを取り消す' : '一覧から消す'}</button>`;
      return `<div class="qcard"><span class="qthumb"><img src="${esc(img.dataUrl)}" alt="${esc(img.sprite)} の絵"></span>
        <div class="qbody"><code>${esc(img.sprite)}</code><span class="note">${esc(labels[img.sprite] || '機体に使われていない ID')}</span>
        <span class="note">高さ ${esc(img.height)}・幅の上限 ${esc(img.maxWidth)}</span>
        <span class="chip qstate ${waiting ? 'waiting' : 'applied'}">${waiting ? 'まだ公開ゲームに入っていません' : '公開ゲームに反映済み'}</span>
        <div>${del}</div></div></div>`;
    }).join('');
  }
  async function savePng() {
    const out = buildOutput();
    if (!out) { cutNote('保存する絵がありません。'); return; }
    const id = targetId() || 'sprite';
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = id + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    cutNote(id + '.png を保存しました。');
  }

  C$('cut-target').addEventListener('change', applyTarget);
  C$('cut-new-id').addEventListener('input', (e) => {
    const v = e.target.value.replace(/[^A-Za-z0-9_]/g, '');
    if (v !== e.target.value) e.target.value = v;
    if (cut.target) cut.target.faction = v.split('_')[0];
    updateImportButton();
    updatePreview();
  });
  C$('cut-height').addEventListener('change', () => { readSizes(); C$('cut-height').value = cut.target.height; updatePreview(); });
  C$('cut-maxw').addEventListener('change', () => { readSizes(); C$('cut-maxw').value = cut.target.maxWidth; updatePreview(); });
  C$('cut-tol').addEventListener('input', (e) => { cut.tol = Number(e.target.value); C$('cut-tol-val').textContent = cut.tol; schedule(); });
  C$('cut-fringe').addEventListener('input', (e) => { cut.fringe = Number(e.target.value); C$('cut-fringe-val').textContent = cut.fringe; schedule(); });
  C$('cut-specks').addEventListener('change', (e) => { cut.specks = e.target.checked; schedule(); });
  C$('cut-flip').addEventListener('change', (e) => { cut.flip = e.target.checked; updatePreview(); });
  C$('cut-outline').addEventListener('change', (e) => { cut.outline = e.target.checked; updatePreview(); });
  C$('cut-mode-erase').addEventListener('click', () => setMode('erase'));
  C$('cut-mode-pick').addEventListener('click', () => setMode('pick'));
  C$('cut-autobg').addEventListener('click', () => { if (!cut.data) return; cut.bgAuto = true; cut.bg = autoBackground(); schedule(); });
  C$('cut-undo').addEventListener('click', () => { cut.seeds.pop(); schedule(); });
  C$('cut-clear').addEventListener('click', () => { cut.seeds = []; schedule(); });
  C$('cut-import').addEventListener('click', importImage);
  C$('cut-save').addEventListener('click', savePng);
  C$('cut-file').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
  C$('cut-work').addEventListener('click', (e) => {
    if (!cut.data) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(cut.w - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * cut.w)));
    const y = Math.min(cut.h - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * cut.h)));
    const i = y * cut.w + x;
    if (cut.mode === 'pick') { cut.bg = pxAt(i); cut.bgAuto = false; setMode('erase'); }
    else { if (cut.mask && cut.mask[i]) return; cut.seeds.push(i); }
    schedule();
  });
  const dropEl = C$('cut-drop');
  dropEl.addEventListener('dragover', (e) => { e.preventDefault(); dropEl.classList.add('dragging'); });
  dropEl.addEventListener('dragleave', () => dropEl.classList.remove('dragging'));
  dropEl.addEventListener('drop', (e) => { e.preventDefault(); dropEl.classList.remove('dragging'); loadFile(e.dataTransfer.files[0]); });
  window.addEventListener('paste', (e) => {
    if (S.view !== 'images') return;
    const item = [...(e.clipboardData ? e.clipboardData.items : [])].find((it) => it.type.indexOf('image/') === 0);
    if (item) loadFile(item.getAsFile());
  });
  window.addEventListener('resize', () => updatePreview());

  start();
})();
