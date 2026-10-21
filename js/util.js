// 通用小工具：数学、哈希、颜色插值。逻辑、树、渲染共用
window.G = window.G || {};
(function () {
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = p => p * p * (3 - 2 * p);
  const eOutBack = p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  const wrapAng = a => Math.atan2(Math.sin(a), Math.cos(a));
  function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
  function hash3(a, b, c) {
    let h = (a ^ Math.imul(b, 0x27d4eb2d) ^ Math.imul(c, 0x165667b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    return (h ^ (h >>> 13)) >>> 0;
  }
  function cumOf(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return cum;
  }
  function pointAlong({ pts, cum }, d) {
    if (d <= 0) return pts[0];
    if (d >= cum[cum.length - 1]) return pts[pts.length - 1];
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < d) lo = m; else hi = m; }
    const u = (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return [lerp(pts[lo][0], pts[hi][0], u), lerp(pts[lo][1], pts[hi][1], u)];
  }
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = ([r, g, b]) => '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
  // 两色插值，返回 #rrggbb
  function mix(a, b, t) {
    const A = hex(a), B = hex(b), k = clamp01(t);
    return toHex([lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)]);
  }
  G.U = { clamp01, clamp, lerp, ease, eOutBack, wrapAng, hash, hash3, cumOf, pointAlong, hex, toHex, mix };
})();
