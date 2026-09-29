/* ============================================================
   WebOS · 应用商店 · 可安装应用实现
   每个都和内置应用一样是 { title, icon, mount(el, win) }
   安装时才挂进 Apps，卸载时移除——所以这里不能依赖 Apps
   ============================================================ */

const StoreApps = {

/* ==================== 扫雷 ==================== */
minesweeper: {
  title: '扫雷', icon: '💣',
  mount(el) {
    const LV = { easy: [9, 9, 10], mid: [16, 16, 40], hard: [30, 16, 99] };
    let lv = 'easy';
    let W, H, M, grid, opened, flagged, dead, won, t0, timer, left;

    el.innerHTML = `
      <div class="ms">
        <div class="ms__bar">
          <div class="seg" id="msLv">
            <button data-l="easy" class="on">初级</button>
            <button data-l="mid">中级</button>
            <button data-l="hard">高级</button>
          </div>
          <div class="ms__stat"><span id="msLeft">010</span></div>
          <button class="ms__face" id="msFace">🙂</button>
          <div class="ms__stat"><span id="msTime">000</span></div>
        </div>
        <div class="ms__wrap"><div class="ms__grid" id="msGrid"></div></div>
        <div class="ms__tip">左键翻开 · 右键标旗 · 数字上双击可快速展开</div>
      </div>`;

    const gEl = el.querySelector('#msGrid');
    const faceEl = el.querySelector('#msFace');
    const leftEl = el.querySelector('#msLeft');
    const timeEl = el.querySelector('#msTime');

    el.querySelectorAll('#msLv button').forEach(b =>
      b.addEventListener('click', () => {
        el.querySelectorAll('#msLv button').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); lv = b.dataset.l; reset();
      }));

    function idx(x, y) { return y * W + x; }
    function cell(x, y) { return grid[idx(x, y)]; }
    function around(x, y) {
      const r = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H) r.push([nx, ny]);
        }
      return r;
    }

    function reset(firstX, firstY) {
      [W, H, M] = LV[lv];
      grid = new Array(W * H).fill(0);
      opened = new Array(W * H).fill(false);
      flagged = new Array(W * H).fill(false);
      dead = false; won = false;
      left = M;
      stopTimer(); t0 = null; timeEl.textContent = '000';
      leftEl.textContent = String(M).padStart(3, '0');
      faceEl.textContent = '🙂';

      if (firstX == null) {
        // 无首点：纯随机布雷
        let n = 0;
        while (n < M) {
          const i = Math.floor(Math.random() * W * H);
          if (grid[i] !== -1) { grid[i] = -1; n++; }
        }
      } else {
        // 有首点：避开首点及其周围，保证第一下不会踩雷
        const ban = new Set([idx(firstX, firstY), ...around(firstX, firstY).map(([a, b]) => idx(a, b))]);
        const pool = [];
        for (let i = 0; i < W * H; i++) if (!ban.has(i)) pool.push(i);
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        pool.slice(0, M).forEach(i => grid[i] = -1);
      }
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (cell(x, y) !== -1)
            grid[idx(x, y)] = around(x, y).filter(([a, b]) => cell(a, b) === -1).length;

      gEl.style.setProperty('--msw', W);
      draw();
    }

    function startTimer() {
      t0 = Date.now();
      stopTimer();
      timer = setInterval(() => {
        timeEl.textContent = String(Math.min(999, Math.floor((Date.now() - t0) / 1000))).padStart(3, '0');
      }, 200);
    }
    function stopTimer() { if (timer) clearInterval(timer); timer = null; }

    function draw() {
      gEl.innerHTML = '';
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = idx(x, y);
          const d = document.createElement('div');
          d.className = 'ms__c';
          d.dataset.x = x; d.dataset.y = y;
          if (opened[i]) {
            d.classList.add('open');
            const v = grid[i];
            if (v === -1) { d.classList.add('mine'); d.textContent = '💥'; }
            else if (v > 0) { d.textContent = v; d.classList.add('n' + v); }
          } else if (flagged[i]) {
            d.classList.add('flag'); d.textContent = '🚩';
          }
          if (dead && grid[i] === -1 && !flagged[i]) { d.classList.add('open', 'mine'); d.textContent = '💣'; }
          if (won && grid[i] === -1) { d.classList.add('flag'); d.textContent = '🚩'; }
          gEl.appendChild(d);
        }
      }
    }

    function open(x, y) {
      const i = idx(x, y);
      if (opened[i] || flagged[i] || dead || won) return;
      if (t0 == null) startTimer();
      if (grid[i] === -1) {
        dead = true; opened[i] = true; stopTimer();
        faceEl.textContent = '😵'; draw(); return;
      }
      // 空白自动扩散
      const stack = [[x, y]];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        const ci = idx(cx, cy);
        if (opened[ci] || flagged[ci]) continue;
        opened[ci] = true;
        if (grid[ci] === 0) around(cx, cy).forEach(([a, b]) => {
          if (!opened[idx(a, b)] && !flagged[idx(a, b)]) stack.push([a, b]);
        });
      }
      checkWin(); draw();
    }

    function chord(x, y) {
      const i = idx(x, y);
      if (!opened[i] || grid[i] <= 0 || dead || won) return;
      const nb = around(x, y);
      const f = nb.filter(([a, b]) => flagged[idx(a, b)]).length;
      if (f !== grid[i]) return;
      nb.forEach(([a, b]) => { if (!flagged[idx(a, b)]) open(a, b); });
    }

    function checkWin() {
      if (opened.filter(Boolean).length === W * H - M) {
        won = true; stopTimer(); faceEl.textContent = '😎';
        left = 0; leftEl.textContent = '000';
      }
    }

    gEl.addEventListener('click', (e) => {
      const c = e.target.closest('.ms__c'); if (!c) return;
      if (dead || won) return;
      // 第一下必定不踩雷：先按首点布雷再翻开
      if (t0 == null) { reset(+c.dataset.x, +c.dataset.y); }
      open(+c.dataset.x, +c.dataset.y);
    });
    gEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const c = e.target.closest('.ms__c'); if (!c) return;
      if (dead || won) return;
      const i = idx(+c.dataset.x, +c.dataset.y);
      if (opened[i]) return;
      flagged[i] = !flagged[i];
      left += flagged[i] ? -1 : 1;
      leftEl.textContent = String(Math.max(0, left)).padStart(3, '0');
      draw();
    });
    gEl.addEventListener('dblclick', (e) => {
      const c = e.target.closest('.ms__c'); if (!c) return;
      chord(+c.dataset.x, +c.dataset.y);
    });
    faceEl.addEventListener('click', () => reset());

    reset();
  }
},

/* ==================== 2048 ==================== */
game2048: {
  title: '2048', icon: '🎯',
  mount(el) {
    let g, score, best = +(localStorage.getItem('webos.2048.best') || 0), over, wonAt;

    el.innerHTML = `
      <div class="g2048">
        <div class="g2048__hd">
          <div class="g2048__title">2048</div>
          <div class="g2048__scores">
            <div class="g2048__sc"><span>得分</span><b id="gScore">0</b></div>
            <div class="g2048__sc"><span>最高</span><b id="gBest">0</b></div>
          </div>
        </div>
        <div class="g2048__bar">
          <button class="btn-sm on" id="gNew">新游戏</button>
          <span class="g2048__hint">方向键 / WASD / 滑动</span>
        </div>
        <div class="g2048__board" id="gBoard"></div>
        <div class="g2048__msg" id="gMsg" hidden></div>
      </div>`;

    const bd = el.querySelector('#gBoard');
    const scEl = el.querySelector('#gScore');
    const bsEl = el.querySelector('#gBest');
    const msgEl = el.querySelector('#gMsg');

    function spawn() {
      const empty = [];
      for (let i = 0; i < 16; i++) if (!g[i]) empty.push(i);
      if (!empty.length) return;
      const i = empty[Math.floor(Math.random() * empty.length)];
      g[i] = Math.random() < 0.9 ? 2 : 4;
    }

    function reset() {
      g = new Array(16).fill(0); score = 0; over = false; wonAt = false;
      spawn(); spawn();
      msgEl.hidden = true;
      draw();
    }

    function draw() {
      scEl.textContent = score;
      bsEl.textContent = best;
      bd.innerHTML = g.map(v =>
        `<div class="g2048__c ${v ? 'v' + v : ''}">${v || ''}</div>`).join('');
    }

    /* 一行向左合并，返回 [新行, 得分] */
    function mergeLine(line) {
      const a = line.filter(v => v);
      const out = []; let s = 0;
      for (let i = 0; i < a.length; i++) {
        if (i + 1 < a.length && a[i] === a[i + 1]) { out.push(a[i] * 2); s += a[i] * 2; i++; }
        else out.push(a[i]);
      }
      while (out.length < 4) out.push(0);
      return [out, s];
    }

    function move(dir) {
      if (over) return;
      let moved = false, add = 0;
      const get = (r, c) => {
        if (dir === 'left') return g[r * 4 + c];
        if (dir === 'right') return g[r * 4 + (3 - c)];
        if (dir === 'up') return g[c * 4 + r];
        return g[(3 - c) * 4 + r];
      };
      const set = (r, c, v) => {
        if (dir === 'left') g[r * 4 + c] = v;
        else if (dir === 'right') g[r * 4 + (3 - c)] = v;
        else if (dir === 'up') g[c * 4 + r] = v;
        else g[(3 - c) * 4 + r] = v;
      };
      for (let r = 0; r < 4; r++) {
        const line = [0, 1, 2, 3].map(c => get(r, c));
        const [nl, s] = mergeLine(line);
        add += s;
        for (let c = 0; c < 4; c++) if (nl[c] !== line[c]) moved = true;
        for (let c = 0; c < 4; c++) set(r, c, nl[c]);
      }
      if (!moved) return;
      score += add;
      if (score > best) { best = score; localStorage.setItem('webos.2048.best', best); }
      spawn();
      if (g.some(v => v >= 2048) && !wonAt) { wonAt = true; showMsg('🎉 到达 2048！还能继续玩'); }
      else if (!canMove()) { over = true; showMsg('游戏结束 · 得分 ' + score); }
      draw();
    }

    function canMove() {
      for (let i = 0; i < 16; i++) if (!g[i]) return true;
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
          const v = g[r * 4 + c];
          if (c < 3 && g[r * 4 + c + 1] === v) return true;
          if (r < 3 && g[(r + 1) * 4 + c] === v) return true;
        }
      return false;
    }

    function showMsg(t) { msgEl.textContent = t; msgEl.hidden = false; }

    const KEY = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
                  a: 'left', d: 'right', w: 'up', s: 'down',
                  A: 'left', D: 'right', W: 'up', S: 'down' };

    function onKey(e) {
      const d = KEY[e.key];
      if (!d) return;
      e.preventDefault(); move(d);
    }
    document.addEventListener('keydown', onKey);
    // 窗口关闭时摘掉监听，否则会泄漏
    if (el.__closeHooks) el.__closeHooks.push(() => document.removeEventListener('keydown', onKey));
    else el.__closeHooks = [() => document.removeEventListener('keydown', onKey)];

    // 触摸滑动
    let sx = 0, sy = 0;
    bd.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    bd.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }, { passive: true });

    el.querySelector('#gNew').addEventListener('click', reset);
    reset();
  }
},

/* ==================== 贪吃蛇 ==================== */
snake: {
  title: '贪吃蛇', icon: '🐍',
  mount(el) {
    const N = 20, SZ = 18;
    let snake, dir, next, food, score, best = +(localStorage.getItem('webos.snake.best') || 0);
    let timer, running, paused;

    el.innerHTML = `
      <div class="snk">
        <div class="snk__hd">
          <div class="snk__title">贪吃蛇</div>
          <div class="snk__sc"><span>得分</span><b id="sScore">0</b></div>
          <div class="snk__sc"><span>最高</span><b id="sBest">0</b></div>
        </div>
        <canvas id="snkCv" width="${N * SZ}" height="${N * SZ}"></canvas>
        <div class="snk__bar">
          <button class="btn-sm on" id="sGo">开始</button>
          <button class="btn-sm" id="sPause">暂停</button>
          <span class="snk__hint">方向键 / WASD · 空格暂停</span>
        </div>
        <div class="snk__msg" id="sMsg" hidden></div>
      </div>`;

    const cv = el.querySelector('#snkCv');
    const g = cv.getContext('2d');
    const scEl = el.querySelector('#sScore');
    const bsEl = el.querySelector('#sBest');
    const msgEl = el.querySelector('#sMsg');

    function reset() {
      snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
      dir = { x: 1, y: 0 }; next = { x: 1, y: 0 };
      score = 0; paused = false; running = false;
      msgEl.hidden = true;
      placeFood();
      scEl.textContent = 0; bsEl.textContent = best;
      draw();
    }
    function placeFood() {
      const used = new Set(snake.map(s => s.x + ',' + s.y));
      const free = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
        if (!used.has(x + ',' + y)) free.push({ x, y });
      food = free[Math.floor(Math.random() * free.length)];
    }

    function draw() {
      g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim() || '#f3f3f3';
      g.fillRect(0, 0, cv.width, cv.height);
      // 网格
      g.strokeStyle = 'rgba(128,128,128,.12)';
      for (let i = 0; i <= N; i++) {
        g.beginPath(); g.moveTo(i * SZ, 0); g.lineTo(i * SZ, cv.height); g.stroke();
        g.beginPath(); g.moveTo(0, i * SZ); g.lineTo(cv.width, i * SZ); g.stroke();
      }
      // 食物
      g.fillStyle = '#e5484d';
      g.beginPath(); g.arc(food.x * SZ + SZ / 2, food.y * SZ + SZ / 2, SZ / 2 - 3, 0, 7); g.fill();
      // 蛇
      snake.forEach((s, i) => {
        g.fillStyle = i === 0 ? '#0b7d3e' : '#22a55b';
        g.fillRect(s.x * SZ + 1, s.y * SZ + 1, SZ - 2, SZ - 2);
      });
    }

    function tick() {
      dir = next;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.x >= N || head.y < 0 || head.y >= N
        || snake.some(s => s.x === head.x && s.y === head.y)) return gameOver();
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 10;
        scEl.textContent = score;
        if (score > best) { best = score; localStorage.setItem('webos.snake.best', best); bsEl.textContent = best; }
        placeFood();
      } else snake.pop();
      draw();
    }

    function gameOver() {
      running = false; stop();
      msgEl.textContent = '撞到了！得分 ' + score + ' · 点「开始」再来';
      msgEl.hidden = false;
    }
    function start() { if (running) return; running = true; msgEl.hidden = true; stop(); timer = setInterval(tick, 130); }
    function stop() { if (timer) clearInterval(timer); timer = null; }

    const KEY = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
                  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
                  W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] };
    function onKey(e) {
      if (e.key === ' ') { e.preventDefault(); running ? (stop(), running = false) : start(); return; }
      const d = KEY[e.key];
      if (!d) return;
      e.preventDefault();
      if (next.x === -d[0] && next.y === -d[1]) return;  // 不能直接掉头
      next = { x: d[0], y: d[1] };
      if (!running) start();
    }
    document.addEventListener('keydown', onKey);
    el.__closeHooks = [() => { stop(); document.removeEventListener('keydown', onKey); }];

    el.querySelector('#sGo').addEventListener('click', () => { reset(); start(); });
    el.querySelector('#sPause').addEventListener('click', () => {
      if (!running) return; stop(); running = false; msgEl.textContent = '已暂停 · 点「开始」继续'; msgEl.hidden = false;
    });

    reset();
  }
},

/* ==================== 画板 ==================== */
paint: {
  title: '画板', icon: '🎨',
  mount(el) {
    const W = 640, H = 420;
    let drawing = false, color = '#0b7d3e', size = 4, eraser = false;

    el.innerHTML = `
      <div class="pt">
        <div class="pt__bar">
          <div class="pt__colors" id="ptColors"></div>
          <label class="pt__lb">粗细
            <input type="range" id="ptSize" min="1" max="24" value="4">
          </label>
          <button class="btn-sm" id="ptEraser">橡皮</button>
          <button class="btn-sm" id="ptClear">清空</button>
          <button class="btn-sm on" id="ptSave">保存到图片库</button>
        </div>
        <div class="pt__wrap"><canvas id="ptCv" width="${W}" height="${H}"></canvas></div>
        <div class="pt__tip">按住拖动即可作画 · 保存的图会放进「文件管理器 / Pictures」</div>
      </div>`;

    const cv = el.querySelector('#ptCv');
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.lineCap = 'round'; g.lineJoin = 'round';

    const COLORS = ['#1a1a1a', '#e5484d', '#f5a623', '#0b7d3e', '#0d74ce', '#8e4ec6', '#d6409f'];
    const cbox = el.querySelector('#ptColors');
    cbox.innerHTML = COLORS.map((c, i) =>
      `<button class="pt__c ${i === 0 ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('');
    cbox.querySelectorAll('.pt__c').forEach(b => b.addEventListener('click', () => {
      cbox.querySelectorAll('.pt__c').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); color = b.dataset.c; eraser = false;
      el.querySelector('#ptEraser').classList.remove('on');
    }));

    el.querySelector('#ptSize').addEventListener('input', (e) => size = +e.target.value);
    el.querySelector('#ptEraser').addEventListener('click', (e) => {
      eraser = !eraser; e.target.classList.toggle('on', eraser);
    });
    el.querySelector('#ptClear').addEventListener('click', () => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    });

    function pos(e) {
      const r = cv.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      // 画布 CSS 尺寸可能被缩放，按比例换算回内部坐标
      return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) };
    }
    const down = (e) => {
      e.preventDefault(); drawing = true;
      const p = pos(e);
      g.beginPath(); g.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      g.strokeStyle = eraser ? '#ffffff' : color;
      g.lineWidth = eraser ? size * 3 : size;
      g.lineTo(p.x, p.y); g.stroke();
    };
    const up = () => { drawing = false; };

    cv.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    cv.addEventListener('touchstart', down, { passive: false });
    cv.addEventListener('touchmove', move, { passive: false });
    cv.addEventListener('touchend', up);
    el.__closeHooks = [() => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }];

    el.querySelector('#ptSave').addEventListener('click', () => {
      // JPEG 压缩后再存，PNG 的 dataURL 太大容易撑爆 localStorage
      const url = cv.toDataURL('image/jpeg', 0.7);
      const kb = Math.round(url.length * 0.75 / 1024);
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      const name = `画作-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
      const path = '/Pictures/' + name;
      try {
        FS.write(path, url);
        OS.toast ? OS.toast(`已保存到 ${path}（${kb} KB）`) : alert(`已保存到 ${path}（${kb} KB）`);
      } catch (err) {
        OS.toast ? OS.toast('保存失败：存储空间不足') : alert('保存失败：存储空间不足，先删掉一些旧画作');
      }
    });
  }
},

/* ==================== 时钟 ==================== */
clock: {
  title: '时钟', icon: '⏱️',
  mount(el) {
    let tab = 'stopwatch';
    let sw = { t: 0, base: 0, run: false, laps: [] }, swTimer = null;
    let cd = { total: 300, left: 300, run: false }, cdTimer = null;

    el.innerHTML = `
      <div class="ck">
        <div class="seg" id="ckTabs">
          <button data-t="stopwatch" class="on">秒表</button>
          <button data-t="timer">倒计时</button>
          <button data-t="world">时钟</button>
        </div>
        <div id="ckBody"></div>
      </div>`;
    const body = el.querySelector('#ckBody');

    const fmt = (ms) => {
      const cs = Math.floor(ms / 10) % 100;
      const s = Math.floor(ms / 1000) % 60;
      const m = Math.floor(ms / 60000) % 60;
      const h = Math.floor(ms / 3600000);
      const p = n => String(n).padStart(2, '0');
      return `${p(h)}:${p(m)}:${p(s)}.${p(cs)}`;
    };
    const fmtS = (s) => {
      const p = n => String(n).padStart(2, '0');
      return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
    };

    function renderStopwatch() {
      body.innerHTML = `
        <div class="ck__big" id="ckSw">${fmt(sw.t)}</div>
        <div class="ck__bar">
          <button class="btn-sm on" id="ckSwGo">${sw.run ? '停止' : '开始'}</button>
          <button class="btn-sm" id="ckSwLap">计次</button>
          <button class="btn-sm" id="ckSwReset">重置</button>
        </div>
        <div class="ck__laps" id="ckLaps">${sw.laps.map((l, i) =>
          `<div class="ck__lap"><span>第 ${sw.laps.length - i} 次</span><b>${fmt(l)}</b></div>`).join('')}</div>`;
      body.querySelector('#ckSwGo').addEventListener('click', () => {
        if (sw.run) {
          sw.run = false; clearInterval(swTimer); swTimer = null;
        } else {
          sw.run = true; sw.base = Date.now() - sw.t;
          swTimer = setInterval(() => {
            sw.t = Date.now() - sw.base;
            const e = document.getElementById('ckSw');
            if (e) e.textContent = fmt(sw.t);
          }, 33);
        }
        renderStopwatch();
      });
      body.querySelector('#ckSwLap').addEventListener('click', () => {
        if (!sw.run) return; sw.laps.unshift(sw.t); renderStopwatch();
      });
      body.querySelector('#ckSwReset').addEventListener('click', () => {
        clearInterval(swTimer); swTimer = null;
        sw = { t: 0, base: 0, run: false, laps: [] }; renderStopwatch();
      });
    }

    function renderTimer() {
      body.innerHTML = `
        <div class="ck__big" id="ckCd">${fmtS(cd.left)}</div>
        <div class="ck__bar">
          <button class="btn-sm on" id="ckCdGo">${cd.run ? '暂停' : '开始'}</button>
          <button class="btn-sm" id="ckCdReset">重置</button>
        </div>
        <div class="ck__presets" id="ckPre">
          ${[60, 180, 300, 600, 900, 1800].map(s =>
            `<button class="btn-sm ${cd.total === s ? 'on' : ''}" data-s="${s}">${s >= 60 ? s / 60 + ' 分' : s + ' 秒'}</button>`).join('')}
        </div>
        <div class="ck__tip">时间到会弹提示</div>`;
      const upd = () => { const e = document.getElementById('ckCd'); if (e) e.textContent = fmtS(cd.left); };
      body.querySelector('#ckCdGo').addEventListener('click', () => {
        if (cd.run) { cd.run = false; clearInterval(cdTimer); cdTimer = null; }
        else {
          if (cd.left <= 0) cd.left = cd.total;
          cd.run = true;
          cdTimer = setInterval(() => {
            cd.left--; upd();
            if (cd.left <= 0) {
              clearInterval(cdTimer); cdTimer = null; cd.run = false;
              upd(); alert('⏰ 时间到！'); renderTimer();
            }
          }, 1000);
        }
        renderTimer();
      });
      body.querySelector('#ckCdReset').addEventListener('click', () => {
        clearInterval(cdTimer); cdTimer = null; cd.run = false; cd.left = cd.total; renderTimer();
      });
      body.querySelectorAll('#ckPre button').forEach(b => b.addEventListener('click', () => {
        cd.total = +b.dataset.s; cd.left = cd.total;
        clearInterval(cdTimer); cdTimer = null; cd.run = false; renderTimer();
      }));
    }

    function renderWorld() {
      body.innerHTML = `
        <div class="ck__big" id="ckNow">--:--:--</div>
        <div class="ck__zones" id="ckZones"></div>`;
      const Z = [['本地', 0], ['东京', 1], ['伦敦', -8], ['纽约', -13], ['洛杉矶', -16]];
      const p = n => String(n).padStart(2, '0');
      const upd = () => {
        const now = new Date();
        const e = document.getElementById('ckNow');
        if (e) e.textContent = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
        const box = document.getElementById('ckZones');
        if (box) box.innerHTML = Z.map(([n, off]) => {
          // 用 UTC 时间加减偏移，避免依赖 toLocaleString 的浏览器差异
          const t = new Date(now.getTime() + (off + now.getTimezoneOffset() / 60) * 3600000);
          return `<div class="ck__zone"><span>${n}</span><b>${p(t.getHours())}:${p(t.getMinutes())}</b></div>`;
        }).join('');
      };
      upd();
      const iv = setInterval(upd, 1000);
      el.__closeHooks = [() => clearInterval(iv)];
    }

    function render() {
      if (tab === 'stopwatch') renderStopwatch();
      else if (tab === 'timer') renderTimer();
      else renderWorld();
    }
    el.querySelectorAll('#ckTabs button').forEach(b =>
      b.addEventListener('click', () => {
        el.querySelectorAll('#ckTabs button').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); tab = b.dataset.t; render();
      }));
    el.__closeHooks = el.__closeHooks || [];
    el.__closeHooks.push(() => { clearInterval(swTimer); clearInterval(cdTimer); });
    render();
  }
},

/* ==================== 系统信息 ==================== */
sysinfo: {
  title: '系统信息', icon: '📊',
  mount(el) {
    const n = navigator, s = screen;
    const conn = n.connection || {};
    const p = (k, v) => `<div class="si__row"><span>${k}</span><b>${v}</b></div>`;
    const gpu = (() => {
      try {
        const c = document.createElement('canvas').getContext('webgl');
        if (!c) return '不可用';
        const d = c.getExtension('WEBGL_debug_renderer_info');
        return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : '未知';
      } catch (e) { return '未知'; }
    })();

    el.innerHTML = `
      <div class="si">
        <div class="si__hero">
          <div class="si__logo">W</div>
          <div>
            <div class="si__name">WebOS</div>
            <div class="si__ver">版本 1.1.0 · 内核 Browser</div>
          </div>
        </div>
        <div class="si__grid">
          <div class="si__card"><h4>设备</h4>
            ${p('屏幕分辨率', `${s.width} × ${s.height}`)}
            ${p('可用区域', `${s.availWidth} × ${s.availHeight}`)}
            ${p('设备像素比', (window.devicePixelRatio || 1).toFixed(2))}
            ${p('色彩深度', s.colorDepth + ' 位')}
            ${p('显卡', gpu)}
          </div>
          <div class="si__card"><h4>浏览器</h4>
            ${p('内核', navigator.userAgent.includes('Firefox') ? 'Gecko' : 'Blink / Chromium')}
            ${p('CPU 核心', n.hardwareConcurrency || '未知')}
            ${p('内存', n.deviceMemory ? n.deviceMemory + ' GB' : '未知')}
            ${p('语言', n.language)}
            ${p('时区', Intl.DateTimeFormat().resolvedOptions().timeZone)}
          </div>
          <div class="si__card"><h4>运行时</h4>
            ${p('在线状态', n.onLine ? '在线' : '离线')}
            ${p('网络类型', conn.effectiveType || '未知')}
            ${p('Cookie', n.cookieEnabled ? '启用' : '禁用')}
            ${p('触摸支持', 'ontouchstart' in window ? '是' : '否')}
            ${p('已装应用', Object.keys(Apps).length + ' 个')}
          </div>
          <div class="si__card"><h4>存储</h4>
            ${p('文件数', countFiles(FS.root) + ' 个')}
            ${p('占用', ((localStorage.getItem('webos.fs.v1') || '').length / 1024).toFixed(1) + ' KB')}
            ${p('持久化', 'localStorage')}
            ${p('后端', '无（纯前端）')}
            ${p('构建', '零依赖')}
          </div>
        </div>
        <div class="si__ua"><b>User Agent</b><div>${n.userAgent}</div></div>
      </div>`;

    function countFiles(node) {
      if (!node) return 0;
      if (node.type === 'file') return 1;
      return (node.children || []).reduce((a, c) => a + countFiles(c), 0);
    }
  }
},

};
