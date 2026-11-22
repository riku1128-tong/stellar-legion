'use strict';
// 5x7 のドットフォント（英大文字・数字・記号）。小文字は大文字として描く。
(function () {
  const RAW = {
    'A': ' ### |#   #|#   #|#####|#   #|#   #|#   #',
    'B': '#### |#   #|#   #|#### |#   #|#   #|#### ',
    'C': ' ####|#    |#    |#    |#    |#    | ####',
    'D': '#### |#   #|#   #|#   #|#   #|#   #|#### ',
    'E': '#####|#    |#    |#### |#    |#    |#####',
    'F': '#####|#    |#    |#### |#    |#    |#    ',
    'G': ' ####|#    |#    |#  ##|#   #|#   #| ####',
    'H': '#   #|#   #|#   #|#####|#   #|#   #|#   #',
    'I': '#####|  #  |  #  |  #  |  #  |  #  |#####',
    'J': '  ###|   # |   # |   # |   # |#  # | ##  ',
    'K': '#   #|#  # |# #  |##   |# #  |#  # |#   #',
    'L': '#    |#    |#    |#    |#    |#    |#####',
    'M': '#   #|## ##|# # #|# # #|#   #|#   #|#   #',
    'N': '#   #|##  #|# # #|#  ##|#   #|#   #|#   #',
    'O': ' ### |#   #|#   #|#   #|#   #|#   #| ### ',
    'P': '#### |#   #|#   #|#### |#    |#    |#    ',
    'Q': ' ### |#   #|#   #|#   #|# # #|#  # | ## #',
    'R': '#### |#   #|#   #|#### |# #  |#  # |#   #',
    'S': ' ####|#    |#    | ### |    #|    #|#### ',
    'T': '#####|  #  |  #  |  #  |  #  |  #  |  #  ',
    'U': '#   #|#   #|#   #|#   #|#   #|#   #| ### ',
    'V': '#   #|#   #|#   #|#   #|#   #| # # |  #  ',
    'W': '#   #|#   #|#   #|# # #|# # #|## ##|#   #',
    'X': '#   #|#   #| # # |  #  | # # |#   #|#   #',
    'Y': '#   #|#   #| # # |  #  |  #  |  #  |  #  ',
    'Z': '#####|    #|   # |  #  | #   |#    |#####',
    '0': ' ### |#   #|#  ##|# # #|##  #|#   #| ### ',
    '1': '  #  | ##  |  #  |  #  |  #  |  #  | ### ',
    '2': ' ### |#   #|    #|   # |  #  | #   |#####',
    '3': '#####|   # |  #  |   # |    #|#   #| ### ',
    '4': '   # |  ## | # # |#  # |#####|   # |   # ',
    '5': '#####|#    |#### |    #|    #|#   #| ### ',
    '6': '  ## | #   |#    |#### |#   #|#   #| ### ',
    '7': '#####|    #|   # |  #  | #   | #   | #   ',
    '8': ' ### |#   #|#   #| ### |#   #|#   #| ### ',
    '9': ' ### |#   #|#   #| ####|    #|   # | ##  ',
    ' ': '     |     |     |     |     |     |     ',
    '!': '  #  |  #  |  #  |  #  |  #  |     |  #  ',
    '?': ' ### |#   #|    #|   # |  #  |     |  #  ',
    '.': '     |     |     |     |     | ##  | ##  ',
    ',': '     |     |     |     | ##  |  #  | #   ',
    ':': '     | ##  | ##  |     | ##  | ##  |     ',
    ';': '     | ##  | ##  |     | ##  |  #  | #   ',
    '-': '     |     |     |#####|     |     |     ',
    '+': '     |  #  |  #  |#####|  #  |  #  |     ',
    '/': '    #|    #|   # |  #  | #   |#    |#    ',
    '(': '   # |  #  | #   | #   | #   |  #  |   # ',
    ')': ' #   |  #  |   # |   # |   # |  #  | #   ',
    '<': '    #|   # |  #  | #   |  #  |   # |    #',
    '>': '#    | #   |  #  |   # |  #  | #   |#    ',
    '=': '     |     |#####|     |#####|     |     ',
    '%': '##  #|##  #|   # |  #  | #   |#  ##|#  ##',
    '*': '     |# # #| ### |#####| ### |# # #|     ',
    "'": '  #  |  #  | #   |     |     |     |     ',
    '"': ' # # | # # |     |     |     |     |     ',
    '_': '     |     |     |     |     |     |#####',
    '[': ' ### | #   | #   | #   | #   | #   | ### ',
    ']': ' ### |   # |   # |   # |   # |   # | ### ',
  };

  // 各文字を「横方向の連続した点のかたまり」に変換しておく（描画回数を減らすため）
  const GLYPHS = {};
  for (const ch in RAW) {
    const rows = RAW[ch].split('|');
    const runs = [];
    rows.forEach((row, y) => {
      let x = 0;
      while (x < 5) {
        if (row[x] === '#') {
          let len = 1;
          while (x + len < 5 && row[x + len] === '#') len++;
          runs.push([x, y, len]);
          x += len;
        } else x++;
      }
    });
    GLYPHS[ch] = runs;
  }

  const ADV = 6; // 1 文字の送り幅（scale 1 のとき）

  function measure(text, scale = 1) {
    const n = String(text).length;
    return n > 0 ? (n * ADV - 1) * scale : 0;
  }

  function drawRaw(ctx, text, x, y, scale, color) {
    ctx.fillStyle = color;
    let cx = x;
    for (const raw of String(text)) {
      const ch = raw.toUpperCase();
      const runs = GLYPHS[ch] || GLYPHS['?'];
      for (let i = 0; i < runs.length; i++) {
        const r = runs[i];
        ctx.fillRect(cx + r[0] * scale, y + r[1] * scale, r[2] * scale, scale);
      }
      cx += ADV * scale;
    }
  }

  // opts: { color, scale, align: 'left'|'center'|'right', shadow: 影の色, outline: 縁取りの色 }
  function draw(ctx, text, x, y, opts = {}) {
    const scale = opts.scale || 1;
    const color = opts.color || '#fff';
    const w = measure(text, scale);
    let sx = x;
    if (opts.align === 'center') sx = Math.round(x - w / 2);
    else if (opts.align === 'right') sx = Math.round(x - w);
    if (opts.outline) {
      const o = Math.max(1, Math.floor(scale / 2));
      for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [-o, o], [o, -o]]) {
        drawRaw(ctx, text, sx + dx, y + dy, scale, opts.outline);
      }
    } else if (opts.shadow) {
      drawRaw(ctx, text, sx + scale, y + scale, scale, opts.shadow);
    }
    drawRaw(ctx, text, sx, y, scale, color);
    return w;
  }

  SL.Font = { draw, measure, HEIGHT: 7, ADV };
})();
