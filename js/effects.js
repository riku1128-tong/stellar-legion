'use strict';
// 爆発・火花などのエフェクトと、星空の背景
(function () {
  const U = SL.util;

  class Effects {
    constructor() {
      this.list = [];
      this.time = 0;
      this.rec = null; // インターネット対戦の部屋を作った側は、相手に送るためにエフェクトを記録する
    }

    record(name, args) {
      if (this.rec) this.rec.push([name].concat(args));
    }

    // 相手から届いたエフェクトを再生する
    replay(ev) {
      const fn = this[ev[0]];
      if (typeof fn !== 'function') return;
      const keep = this.rec;
      this.rec = null;
      fn.apply(this, ev.slice(1));
      this.rec = keep;
    }

    add(p) {
      if (this.list.length < 1200) this.list.push(p);
    }

    // しびれるムチ（ジグザグの電撃）
    whip(sx, sy, ex, ey, color) {
      this.record('whip', [sx, sy, ex, ey, color]);
      this.add({ t: 'whip', x: sx, y: sy, ex, ey, life: 0.25, max: 0.25, color });
    }

    // 変形などの光
    burst(x, y, color) {
      this.record('burst', [x, y, color]);
      this.add({ t: 'ring', x, y, r0: 4, r1: 18, life: 0.25, max: 0.25, color });
      this.spark(x, y, color, 6, 70);
    }

    // 戦艦の中で修理中の緑の光（記録しない）
    repair(x, y) {
      const life = U.rand(0.4, 0.7);
      this.add({ t: 'px', x: x + U.rand(-8, 8), y: y + U.rand(-4, 6), vx: 0, vy: -25, life, max: life, color: '#4be06a', size: 1 });
    }

    spark(x, y, color, n = 4, spd = 90) {
      for (let i = 0; i < n; i++) {
        const a = U.rand(0, Math.PI * 2), s = U.rand(spd * 0.3, spd);
        const life = U.rand(0.15, 0.35);
        this.add({ t: 'px', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: 1 });
      }
    }

    hit(x, y, color) {
      this.record('hit', [x, y, color]);
      const keep = this.rec;
      this.rec = null;
      this.add({ t: 'flash', x, y, r: 4, life: 0.07, max: 0.07, color: '#ffffff' });
      this.spark(x, y, color || '#ffe08a', 4, 110);
      this.rec = keep;
    }

    muzzle(x, y, color, r = 2.5) {
      this.record('muzzle', [x, y, color, r]);
      this.add({ t: 'flash', x, y, r, life: 0.07, max: 0.07, color });
    }

    // 煙（size: 一辺のドット数）
    smoke(x, y, size = 2) {
      const life = U.rand(0.3, 0.55) * (size > 2 ? 1.4 : 1);
      this.add({ t: 'smoke', x, y, vx: U.rand(-8, 8), vy: U.rand(-8, 8), life, max: life, size });
    }

    explosion(x, y, size) {
      this.record('explosion', [x, y, size]);
      const keep = this.rec;
      this.rec = null;
      this.explosionLocal(x, y, size);
      this.rec = keep;
    }

    explosionLocal(x, y, size) {
      const n = Math.min(4, 1 + Math.floor(size / 10));
      for (let i = 0; i < n; i++) {
        const life = U.rand(0.35, 0.6);
        const ox = i === 0 ? 0 : U.rand(-size * 0.6, size * 0.6);
        const oy = i === 0 ? 0 : U.rand(-size * 0.6, size * 0.6);
        this.add({ t: 'blast', x: x + ox, y: y + oy, r0: size * 0.25, r1: size * U.rand(0.7, 1.1), life, max: life, delay: i * 0.07 });
      }
      this.add({ t: 'ring', x, y, r0: size * 0.4, r1: size * 1.8, life: 0.35, max: 0.35, color: '#fff3b0' });
      this.spark(x, y, '#ffd23a', 6 + size, 60 + size * 4);
      for (let i = 0; i < 4 + size / 4; i++) {
        const a = U.rand(0, Math.PI * 2), s = U.rand(20, 70);
        const life = U.rand(0.6, 1.2);
        this.add({ t: 'px', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color: '#8a8c98', size: 2 });
      }
    }

    // 撃墜された機体の黄色いシルエットが広がって消える
    ghost(spriteId, x, y, facing, scale) {
      this.record('ghost', [spriteId, x, y, facing, scale || 1]);
      this.add({ t: 'ghost', id: spriteId, x, y, facing, scale: scale || 1, life: 0.5, max: 0.5 });
    }

    slash(x, y, angle, color, radius) {
      this.record('slash', [x, y, angle, color, radius]);
      this.add({ t: 'slash', x, y, a: angle, r: radius, life: 0.16, max: 0.16, color });
    }

    update(dt) {
      this.time += dt;
      const L = this.list;
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        if (p.delay > 0) { p.delay -= dt; continue; }
        p.life -= dt;
        if (p.life <= 0) {
          L[i] = L[L.length - 1];
          L.pop();
          continue;
        }
        if (p.vx !== undefined) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.96;
          p.vy *= 0.96;
        }
      }
    }

    draw(ctx, view) {
      const x0 = view.x - 60, y0 = view.y - 60, x1 = view.x + view.w + 60, y1 = view.y + view.h + 60;
      for (const p of this.list) {
        if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
        if (p.delay > 0) continue;
        const k = p.life / p.max; // 1 → 0
        switch (p.t) {
          case 'px':
            ctx.globalAlpha = Math.min(1, k * 1.5);
            ctx.fillStyle = p.color;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
            break;
          case 'flash':
            ctx.globalAlpha = k;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * (0.6 + k * 0.4), 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'smoke': {
            const s = Math.round((p.size || 2) * (1.6 - k * 0.6)); // だんだん広がって薄くなる
            ctx.globalAlpha = k * 0.6;
            ctx.fillStyle = k > 0.7 ? '#e8e2d0' : '#a8a8b4';
            ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
            break;
          }
          case 'blast': {
            const r = U.lerp(p.r1, p.r0, k * k);
            ctx.globalAlpha = Math.min(1, k * 1.8);
            ctx.fillStyle = k > 0.75 ? '#fffbe0' : k > 0.45 ? '#ffd23a' : k > 0.2 ? '#ff8a2a' : '#7a3a2a';
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          case 'ring':
            ctx.globalAlpha = k;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, U.lerp(p.r1, p.r0, k), 0, Math.PI * 2);
            ctx.stroke();
            break;
          case 'ghost':
            ctx.globalAlpha = k;
            SL.Sprites.draw(ctx, p.id, p.x, p.y, p.facing, 'gold', (p.scale || 1) * (1 + (1 - k) * 0.5));
            break;
          case 'whip': {
            ctx.globalAlpha = Math.min(1, k * 2);
            const dx = p.ex - p.x, dy = p.ey - p.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len, ny = dx / len;
            const seg = 8;
            for (const [col, w, amp] of [[p.color, 2, 3], ['#ffffff', 1, 1.5]]) {
              ctx.strokeStyle = col;
              ctx.lineWidth = w;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              for (let i = 1; i <= seg; i++) {
                const t = i / seg;
                const o = i === seg ? 0 : U.rand(-amp, amp);
                ctx.lineTo(p.x + dx * t + nx * o, p.y + dy * t + ny * o);
              }
              ctx.stroke();
            }
            break;
          }
          case 'slash':
            ctx.globalAlpha = Math.min(1, k * 2);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, p.a - 1.1 + (1 - k) * 0.6, p.a + 1.1 - k * 0.6);
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r - 2, p.a - 0.8, p.a + 0.8);
            ctx.stroke();
            break;
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- 星空 ----
  function makeNebula() {
    const w = U.randInt(120, 230), h = U.randInt(50, 100);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const blobs = [];
    for (let i = 0; i < 5; i++) blobs.push({ x: U.rand(0.25, 0.75) * w, y: U.rand(0.3, 0.7) * h, r: U.rand(0.15, 0.35) * w });
    const cols = [[42, 20, 80], [60, 29, 112], [90, 44, 154], [122, 69, 200], [170, 120, 240]];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ex = (x - w / 2) / (w / 2), ey = (y - h / 2) / (h / 2);
        const edge = 1 - (ex * ex + ey * ey);
        if (edge <= 0) continue;
        let d = 0;
        for (const b of blobs) {
          const dd = ((x - b.x) ** 2 + (y - b.y) ** 2) / (b.r * b.r);
          d += Math.exp(-dd * 2);
        }
        const density = Math.min(1, edge * d * 0.9);
        if (Math.random() < density * 0.85) {
          const level = Math.min(cols.length - 1, Math.floor(density * cols.length * Math.random() * 1.6));
          const i = (y * w + x) * 4;
          const col = cols[level];
          img.data[i] = col[0];
          img.data[i + 1] = col[1];
          img.data[i + 2] = col[2];
          img.data[i + 3] = 150 + level * 20;
        }
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  class Background {
    constructor() {
      this.tileW = 700;
      this.tileH = 420;
      const mk = (n, colors, sparkle) => {
        const stars = [];
        for (let i = 0; i < n; i++) {
          stars.push({
            x: U.rand(0, this.tileW), y: U.rand(0, this.tileH),
            c: colors[U.randInt(0, colors.length - 1)],
            sparkle: sparkle && U.chance(0.35),
            ph: U.rand(0, Math.PI * 2),
          });
        }
        return stars;
      };
      this.layers = [
        { par: 0.12, stars: mk(110, ['#2a2f4a', '#3a3f5e', '#4a4a6a'], false) },
        { par: 0.3, stars: mk(55, ['#6a70a0', '#8a8fc0', '#5a6090'], false) },
        { par: 0.55, stars: mk(22, ['#d8d0ff', '#b48cff', '#ffffff'], true) },
      ];
      const C = SL.CONFIG;
      this.nebPar = 0.45;
      this.nebulae = [];
      for (let i = 0; i < 9; i++) {
        this.nebulae.push({
          img: makeNebula(),
          x: U.rand(-150, C.FIELD_W * this.nebPar + C.W),
          y: U.rand(-60, C.FIELD_H * this.nebPar + C.H),
        });
      }
    }

    // ビューポートの左上を原点にして描く
    draw(ctx, camX, camY, vw, vh, time) {
      for (const n of this.nebulae) {
        const sx = Math.round(n.x - camX * this.nebPar);
        const sy = Math.round(n.y - camY * this.nebPar);
        if (sx > vw || sy > vh || sx + n.img.width < 0 || sy + n.img.height < 0) continue;
        ctx.drawImage(n.img, sx, sy);
      }
      for (const layer of this.layers) {
        const ox = ((-camX * layer.par) % this.tileW + this.tileW) % this.tileW;
        const oy = ((-camY * layer.par) % this.tileH + this.tileH) % this.tileH;
        for (const s of layer.stars) {
          for (let tx = -this.tileW; tx < vw; tx += this.tileW) {
            const x = Math.round(s.x + ox + tx);
            if (x < -3 || x > vw + 3) continue;
            for (let ty = -this.tileH; ty < vh; ty += this.tileH) {
              const y = Math.round(s.y + oy + ty);
              if (y < -3 || y > vh + 3) continue;
              ctx.fillStyle = s.c;
              if (s.sparkle) {
                const tw = Math.sin(time * 2 + s.ph);
                ctx.fillRect(x, y, 1, 1);
                if (tw > -0.2) {
                  ctx.fillRect(x - 1, y, 3, 1);
                  ctx.fillRect(x, y - 1, 1, 3);
                }
                if (tw > 0.6) {
                  ctx.fillRect(x - 2, y, 5, 1);
                  ctx.fillRect(x, y - 2, 1, 5);
                }
              } else {
                ctx.fillRect(x, y, 1, 1);
              }
            }
          }
        }
      }
    }
  }

  SL.Effects = Effects;
  SL.Background = Background;
})();
