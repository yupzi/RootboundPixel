// 背景音乐 + 环境音
// 音乐不跟场景走：一张歌单从头放到尾，两首之间留一段只有环境音的空白；换场景只换环境音，
// 音乐用低通滤波"闷"一下（岩洞里隔着石壁，地下隔着土），所以来回进出洞也不会切歌
// 种根最后 5 秒叠一层心跳鼓点
// 浏览器要等玩家第一次点击/按键才肯出声，之前什么都不放
(function () {
  const DIR = 'assets/audio/';
  const PLAYLIST = ['bgm_sky', 'bgm_pit', 'bgm_roots', 'bgm_cave'];
  const VOL = { music: 0.34, amb: 0.42, tense: 0.5 };
  const FADE = { music: 2.5, amb: 1.5, tense: 0.4 }; // 淡入淡出秒数
  const GAP = [30, 90];  // 两首之间的留白（秒）
  const FIRST_GAP = 6;   // 离开标题后多久响第一首
  // 场景 → 音乐的低通截止频率 / 音量：地面原样，岩洞隔着石壁，地下隔着土
  const MUFFLE = { open: 22000, cave: 1500, ground: 650 };
  const DUCK = { open: 1, cave: 0.85, ground: 0.7 };
  const AMB = { open: 'amb_pit', cave: 'amb_cave', ground: 'amb_ground' };

  function scene(st) {
    if (st.phase === 'plant' || st.phase === 'grow') return 'ground';
    if (st.phase === 'alchemy' || st.room === 'cave' || st.room === 'east') return 'cave';
    return 'open';
  }

  // file:// 打开时 Web Audio 读不到 <audio> 的数据（当成跨域，只输出静音），只能直接调音量、不做闷音
  const webAudio = /^https?:$/.test(location.protocol);
  let ac = null, lp = null, unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (!webAudio) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = MUFFLE.open; lp.Q.value = 0.7;
      lp.connect(ac.destination);
    } catch (e) { ac = lp = null; }
  }
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });

  let cur = null, gap = FIRST_GAP, duck = 1, lastSc = 'open';
  const tracks = {};
  function track(name, kind) {
    let t = tracks[name];
    if (t) return t;
    const a = new Audio(DIR + name + '.mp3');
    a.preload = 'auto';
    a.loop = kind !== 'music' || name === 'bgm_title';
    t = tracks[name] = { a, kind, v: 0, want: 0, pending: false };
    if (ac) {
      t.g = ac.createGain(); t.g.gain.value = 0;
      ac.createMediaElementSource(a).connect(t.g).connect(kind === 'music' ? lp : ac.destination);
    }
    if (kind === 'music') a.onended = () => { if (cur === t) { cur = null; gap = GAP[0] + Math.random() * (GAP[1] - GAP[0]); } };
    return t;
  }

  // 洗牌放，不连着放同一首；开局第一首固定是最轻的那首
  let bag = ['bgm_sky'], lastSong = null;
  function nextSong() {
    if (!bag.length) {
      bag = PLAYLIST.slice().sort(() => Math.random() - 0.5);
      if (bag[0] === lastSong) bag.push(bag.shift());
    }
    return (lastSong = bag.shift());
  }

  G.Music = {
    tick(dt) {
      const st = G.state;
      if (!st || !unlocked) return;
      const sc = scene(st);
      for (const t of Object.values(tracks)) t.want = 0;
      if (st.phase === 'title') {
        track('bgm_title', 'music').want = 1;
        cur = null; gap = FIRST_GAP;
      } else {
        if (!cur && !G.muted && (gap -= dt) <= 0) { cur = track(nextSong(), 'music'); cur.a.currentTime = 0; }
        if (cur) cur.want = 1;
        track(AMB[sc], 'amb').want = 1;
        const f = G.field;
        if (st.phase === 'plant' && f && f.running && f.timeLeft > 0 && f.timeLeft <= 5) track('amb_tense', 'tense').want = 1;
      }
      if (G.muted) for (const t of Object.values(tracks)) t.want = 0;

      duck += (DUCK[sc] - duck) * Math.min(1, dt * 3);
      if (lp && sc !== lastSc) lp.frequency.setTargetAtTime(MUFFLE[sc], ac.currentTime, 0.18);
      lastSc = sc;

      for (const t of Object.values(tracks)) {
        const sp = dt / FADE[t.kind];
        t.v = t.v < t.want ? Math.min(t.want, t.v + sp) : Math.max(t.want, t.v - sp);
        const out = t.v * VOL[t.kind] * (t.kind === 'music' ? duck : 1);
        if (t.g) t.g.gain.value = out; else t.a.volume = Math.min(1, out);
        if (t.want > 0 && t.a.paused && !t.pending) {
          t.pending = true;
          t.a.play().catch(() => {}).finally(() => { t.pending = false; });
        } else if (t.v === 0 && !t.a.paused) t.a.pause();
      }
    },
  };
})();
