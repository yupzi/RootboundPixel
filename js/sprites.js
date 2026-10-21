// 事件总线、随机数、颜色工具、合成音效
(function () {
  // ---------- 事件总线 ----------
  const handlers = {};
  G.on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); };
  G.emit = (ev, data) => { (handlers[ev] || []).forEach(fn => fn(data)); };

  // ---------- 可复现随机数 ----------
  G.rng = function (seed) {
    let a = seed >>> 0;
    const r = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = n => Math.floor(r() * n);
    r.pick = arr => arr[Math.floor(r() * arr.length)];
    return r;
  };

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const cl = v => Math.max(0, Math.min(255, v));
    const r = cl((n >> 16) + amt), g = cl(((n >> 8) & 255) + amt), b = cl((n & 255) + amt);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }
  G.shade = shade;

  // ---------- 合成音效 ----------
  let ac = null;
  G.muted = false;
  const SFX = {
    collect: [[660, 0.06, 'square'], [990, 0.08, 'square']],
    water:   [[520, 0.08, 'sine'], [780, 0.1, 'sine']],
    potion:  [[300, 0.05, 'triangle'], [600, 0.08, 'triangle'], [900, 0.06, 'triangle']],
    rock:    [[90, 0.15, 'sawtooth'], [60, 0.15, 'square']],
    smash:   [[180, 0.06, 'square'], [120, 0.08, 'square']],
    burn:    [[200, 0.08, 'sawtooth'], [110, 0.2, 'sawtooth']],
    branch:  [[440, 0.05, 'square'], [550, 0.05, 'square']],
    trigger: [[880, 0.05, 'square'], [660, 0.05, 'square'], [1100, 0.07, 'square']],
    brew:    [[260, 0.08, 'triangle'], [390, 0.08, 'triangle'], [520, 0.08, 'triangle'], [780, 0.18, 'triangle']],
    click:   [[700, 0.03, 'square']],
    fail:    [[200, 0.08, 'square'], [150, 0.12, 'square']],
    end:     [[523, 0.1, 'triangle'], [659, 0.1, 'triangle'], [784, 0.2, 'triangle']],
    fruit:   [[1320, 0.04, 'triangle']],
    pour:    [[480 + Math.random() * 120, 0.06, 'sine']],
    grow:    [[262, 0.12, 'triangle'], [330, 0.12, 'triangle'], [392, 0.12, 'triangle'], [523, 0.14, 'triangle'], [659, 0.22, 'triangle']],
    tick:    [[1000, 0.05, 'square']],
    // 炼金工坊：投料、精华入罐、蓄力、出瓶、解锁节点、暴击
    plop:    [[220, 0.05, 'sine'], [440, 0.07, 'triangle']],
    orb:     [[1200, 0.03, 'triangle']],
    charge:  [[330, 0.04, 'triangle']],
    pop:     [[520, 0.04, 'square'], [1040, 0.09, 'triangle']],
    levelup: [[392, 0.07, 'square'], [523, 0.07, 'square'], [659, 0.07, 'square'], [784, 0.07, 'square'], [1047, 0.22, 'triangle']],
    crit:    [[784, 0.05, 'square'], [1175, 0.05, 'square'], [1568, 0.14, 'triangle']],
  };
  // k：音高倍率（连投、连炼时越来越高）
  G.sfx = function (name, k = 1) {
    if (G.muted || !SFX[name]) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      let t = ac.currentTime;
      for (const [f, d, type] of SFX[name]) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.setValueAtTime(f * k, t);
        g.gain.setValueAtTime(0.06, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(ac.destination);
        o.start(t); o.stop(t + d);
        t += d * 0.8;
      }
    } catch (e) { /* 无音频环境时静默 */ }
  };
})();
