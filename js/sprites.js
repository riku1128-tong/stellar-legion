'use strict';
// 機体の絵。いまは役割ごとの「仮の図形」をコードで描いている。
// js/asset-overrides.js に PNG を登録すると、その画像に差し替わる。
// 絵はすべて「右向き」で用意し、左を向くときは描画時に反転する。
SL.Sprites = (function () {
  const store = {}; // スプライト ID -> { img, flash, gold, icon, w, h, custom }
  const ICON = 14;  // HUD の機体アイコンの大きさ

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // 画像を 1 色で塗りつぶしたシルエットを作る
  function tint(src, color) {
    const c = makeCanvas(src.width, src.height);
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function makeIcon(src) {
    const c = makeCanvas(ICON, ICON);
    const g = c.getContext('2d');
    const s = Math.min(ICON / src.width, ICON / src.height);
    const w = Math.max(1, Math.round(src.width * s));
    const h = Math.max(1, Math.round(src.height * s));
    g.imageSmoothingEnabled = true;
    g.drawImage(src, Math.floor((ICON - w) / 2), Math.floor((ICON - h) / 2), w, h);
    return c;
  }

  function makeEntry(img, custom) {
    return {
      img,
      flash: tint(img, '#ffffff'), // 被弾したときの白
      gold: tint(img, '#ffe24a'),  // 撃墜されたときの黄色いシルエット
      icon: makeIcon(img),
      w: img.width,
      h: img.height,
      custom: !!custom,
    };
  }

  // ---- 仮の図形（役割ごと。f は勢力 'az' / 'cr'、p はパレット） ----
  const SHAPES = {
    grunt: {
      w: 14, h: 17,
      draw(r, p, f) {
        r(0, 6, 3, 5, p.metal);                          // 背中のバーニア
        r(4, 0, 7, 6, f === 'az' ? p.light : p.main);    // 頭
        if (f === 'az') { r(4, 0, 7, 1, p.main); r(7, 2, 4, 2, p.visor); }
        else { r(6, 2, 1, 1, p.visor); r(8, 2, 1, 1, p.visor); r(10, 2, 1, 1, p.visor); r(5, 4, 5, 1, p.dark); }
        r(3, 6, 8, 6, p.main);                           // 胴
        r(5, 7, 4, 3, p.dark);
        r(6, 8, 2, 1, p.accent);
        r(8, 8, 6, 2, p.metal);                          // ライフル
        r(4, 12, 3, 4, f === 'az' ? p.light : p.main);   // 脚
        r(8, 12, 3, 4, f === 'az' ? p.light : p.main);
        r(3, 16, 4, 1, p.dark);
        r(8, 16, 4, 1, p.dark);
      },
    },
    commander: {
      w: 17, h: 21,
      draw(r, p, f) {
        const body = f === 'az' ? p.light : p.red;
        if (f === 'az') { r(6, 0, 1, 3, p.accent); r(7, 1, 4, 1, p.accent); }   // 角
        else { r(5, 0, 1, 3, p.accent); r(10, 0, 1, 3, p.accent); }
        r(0, 9, 3, 6, p.metal);                          // バーニア
        r(4, 3, 8, 6, body);                             // 頭
        if (f === 'az') { r(4, 3, 8, 1, p.main); r(8, 5, 4, 2, p.visor); }
        else { r(6, 5, 1, 1, p.visor); r(8, 5, 1, 1, p.visor); r(10, 5, 1, 1, p.visor); }
        r(2, 9, 11, 6, f === 'az' ? p.main : p.dark);    // 胴
        r(1, 9, 4, 3, body);                             // 肩
        r(6, 10, 3, 2, p.accent);
        r(9, 11, 8, 2, p.metal);                         // ビームライフル
        r(15, 10, 2, 1, p.visor);
        r(4, 15, 3, 5, body);                            // 脚
        r(9, 15, 3, 5, body);
        r(3, 20, 4, 1, p.dark);
        r(9, 20, 4, 1, p.dark);
      },
    },
    heavy: {
      w: 21, h: 18,
      draw(r, p, f) {
        r(5, 0, 7, 5, f === 'az' ? p.light : p.main);    // 頭
        if (f === 'az') r(8, 2, 4, 2, p.visor);
        else { r(7, 2, 1, 1, p.visor); r(9, 2, 1, 1, p.visor); r(11, 2, 1, 1, p.visor); }
        r(1, 5, 15, 7, p.main);                          // 太い胴
        r(1, 5, 5, 4, p.dark);                           // 肩アーマー
        r(7, 7, 5, 3, p.dark);
        r(8, 8, 3, 1, p.accent);
        r(8, 3, 11, 3, p.metal);                         // 肩のバズーカ
        r(18, 2, 3, 5, p.dark);
        r(3, 12, 5, 5, f === 'az' ? p.light : p.dark);   // 脚
        r(10, 12, 5, 5, f === 'az' ? p.light : p.dark);
        r(2, 17, 6, 1, p.dark);
        r(10, 17, 6, 1, p.dark);
      },
    },
    artillery: {
      w: 22, h: 13,
      draw(r, p, f) {
        r(6, 0, 6, 4, f === 'az' ? p.light : p.main);    // 頭
        r(9, 1, 3, 2, p.visor);
        r(12, 2, 10, 2, p.metal);                        // 長い砲身
        r(3, 4, 13, 5, p.main);                          // 車体
        r(5, 5, 4, 2, p.accent);
        r(1, 9, 17, 4, p.metal);                         // 履帯
        for (let x = 3; x < 17; x += 3) r(x, 10, 1, 2, p.dark);
      },
    },
    fighter: {
      w: 22, h: 9,
      draw(r, p, f) {
        r(1, 0, 3, 4, p.main);                           // 尾翼
        r(2, 3, 17, 3, f === 'az' ? p.light : p.main);   // 胴体
        r(19, 4, 3, 1, f === 'az' ? p.light : p.main);   // 機首
        r(12, 2, 4, 1, p.visor);                         // 操縦席
        r(6, 6, 9, 2, p.dark);                           // 翼
        r(0, 4, 2, 2, p.metal);                          // エンジン
        r(8, 4, 4, 1, p.accent);
      },
    },
    giant_az: {
      w: 50, h: 22,
      draw(r, p) {
        r(20, 2, 10, 6, p.light);                        // 艦橋
        r(23, 4, 6, 2, p.visor);
        r(2, 8, 44, 8, p.light);                         // 船体
        r(4, 10, 40, 2, p.main);
        r(30, 13, 12, 1, p.accent);
        r(46, 10, 4, 4, p.light);                        // 艦首
        r(6, 16, 38, 4, p.metal);                        // 船底
        r(0, 9, 3, 6, p.metal);                          // 推進器
      },
    },
    giant_cr: {
      w: 44, h: 30,
      draw(r, p) {
        r(6, 2, 2, 4, p.light);                          // とげ
        r(36, 2, 2, 4, p.light);
        r(12, 1, 20, 4, p.main);                         // ドーム
        r(8, 4, 28, 12, p.main);
        r(10, 6, 24, 2, p.light);
        r(14, 10, 2, 2, p.visor);                        // 目
        r(20, 10, 2, 2, p.visor);
        r(26, 10, 2, 2, p.visor);
        r(36, 10, 8, 3, p.metal);                        // 前の砲
        r(10, 16, 24, 5, p.dark);                        // 下部
        r(8, 20, 3, 9, p.metal);                         // 脚
        r(16, 21, 3, 8, p.metal);
        r(25, 21, 3, 8, p.metal);
        r(33, 20, 3, 9, p.metal);
      },
    },
  };

  function buildPlaceholder(shape, palette, factionPrefix) {
    const pad = 1;
    const body = makeCanvas(shape.w + pad * 2, shape.h + pad * 2);
    const g = body.getContext('2d');
    const r = (x, y, w, h, color) => {
      g.fillStyle = color || '#f0f';
      g.fillRect(x + pad, y + pad, w, h);
    };
    shape.draw(r, palette, factionPrefix);
    // 1 ドットの縁取りをつける
    const out = makeCanvas(body.width, body.height);
    const og = out.getContext('2d');
    const sil = tint(body, palette.outline);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) og.drawImage(sil, dx, dy);
    og.drawImage(body, 0, 0);
    return out;
  }

  function build() {
    for (const typeId in SL.UNIT_TYPES) {
      const t = SL.UNIT_TYPES[typeId];
      const faction = SL.FACTIONS.find((f) => typeId.startsWith(f.prefix + '_'));
      const prefix = faction ? faction.prefix : 'az';
      const palette = Object.assign({ red: '#d23a3a' }, faction ? faction.palette : SL.FACTIONS[0].palette);
      const shape = t.role === 'giant' ? SHAPES['giant_' + prefix] || SHAPES.giant_az : SHAPES[t.role] || SHAPES.grunt;
      store[t.sprite] = makeEntry(buildPlaceholder(shape, palette, prefix), false);
    }
  }

  // 差し替え画像を読み込む。失敗したものは仮の図形のまま。
  //  spec: "assets/xxx.png" または { src, scale, facing: 'left' }
  function install(id, img, spec) {
    const opts = typeof spec === 'object' && spec ? spec : {};
    const base = store[id];
    const targetH = base ? base.h : 20;
    const scale = opts.scale || targetH / img.naturalHeight;
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = scale < 1;
    if (opts.facing === 'left') {
      g.translate(w, 0);
      g.scale(-1, 1);
    }
    g.drawImage(img, 0, 0, w, h);
    store[id] = makeEntry(c, true);
  }

  function applyOverrides(map) {
    const jobs = Object.keys(map || {}).map((id) => new Promise((resolve) => {
      const spec = map[id];
      const src = typeof spec === 'string' ? spec : spec && spec.src;
      if (!src) return resolve();
      const img = new Image();
      const timer = setTimeout(() => {
        console.warn('[STELLAR LEGION] 画像の読み込みが終わりません: ' + src + '（仮の図形のまま表示します）');
        resolve();
      }, 5000);
      img.onload = () => {
        clearTimeout(timer);
        try { install(id, img, spec); } catch (e) { console.warn('[STELLAR LEGION] 画像を使えませんでした: ' + src, e); }
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timer);
        console.warn('[STELLAR LEGION] 画像を読み込めませんでした: ' + src + '（仮の図形のまま表示します）');
        resolve();
      };
      img.src = src;
    }));
    return Promise.all(jobs);
  }

  function get(id) {
    return store[id] || store.az_grunt;
  }

  // (x, y) を中心に描く。facing: 1 = 右向き, -1 = 左向き
  //  variant: 'flash'（白）/ 'gold'（黄色）/ なし, scale: 拡大率
  function draw(ctx, id, x, y, facing, variant, scale) {
    const s = get(id);
    const img = variant === 'flash' ? s.flash : variant === 'gold' ? s.gold : s.img;
    const k = scale || 1;
    const w = s.w * k, h = s.h * k;
    const cx = Math.round(x), cy = Math.round(y);
    if (facing < 0) {
      ctx.save();
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, Math.round(-w / 2), Math.round(cy - h / 2), w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
    }
  }

  function drawIcon(ctx, id, x, y) {
    ctx.drawImage(get(id).icon, x, y);
  }

  function ids() {
    return Object.keys(store);
  }

  return { build, applyOverrides, get, draw, drawIcon, ids, ICON };
})();
