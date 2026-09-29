/* ============================================================
   WebOS · 系统内核
   窗口管理 / 任务栏 / 开始菜单 / 时钟 / 主题 / 拖拽
   ============================================================ */

const OS = {
  wins: [],          // { id, appId, el, title, min, max, z }
  zTop: 100,
  seq: 0,

  /* ---------- 启动 ---------- */
  mode: 'desktop',     // desktop | phone

  init() {
    FS.load();
    // 商店应用要在渲染桌面和开始菜单之前挂进 Apps
    AppStore.load();
    AppStore.installed.forEach(id => { if (!this.deskAppIds.includes(id)) this.deskAppIds.push(id); });
    this.restorePrefs();
    this.bindLock();
    this.bindTaskbar();
    this.renderDeskIcons();
    this.renderStartMenu();
    this.startClock();
    this.bindModeFab();

    // 上次用的形态：手机就进手机，桌面就桌面
    const saved = localStorage.getItem('webos.mode.v1');
    if (saved === 'phone') {
      this.mode = 'phone';
      Phone.build();
      document.getElementById('phone').hidden = false;
      document.getElementById('modeFabIco').textContent = '🖥️';
      document.getElementById('modeFab').hidden = false;
    }
  },

  /* ---------- 形态切换 ---------- */
  switchMode(mode, skipSave) {
    this.mode = mode;
    if (mode === 'phone') {
      if (!Phone.root) Phone.build();
      Phone.show();
      document.getElementById('modeFabIco').textContent = '🖥️';
    } else {
      if (Phone.root) Phone.hide();
      // 回桌面时把手机上的页面清掉，避免下次进来还留着
      Phone.closeAll();
      document.getElementById('modeFabIco').textContent = '📱';
    }
    if (!skipSave) localStorage.setItem('webos.mode.v1', mode);
    const fab = document.getElementById('modeFab');
    if (fab) fab.hidden = false;
    this.toast(mode === 'phone' ? '已切换到手机形态' : '已切换到桌面形态');
  },

  bindModeFab() {
    const fab = document.getElementById('modeFab');
    fab.addEventListener('click', () => {
      this.switchMode(this.mode === 'phone' ? 'desktop' : 'phone');
    });
  },

  /* 手机形态下重新锁屏 */
  lockPhone() {
    if (Phone.root) Phone.closeAll();
    Phone.closeLayers();
    document.getElementById('phone').hidden = true;
    const lock = document.getElementById('lock');
    lock.classList.remove('out');
    lock.style.display = '';
    document.getElementById('desktop').hidden = false;
    // 解锁后回到手机形态
    const once = () => {
      lock.removeEventListener('click', once);
      if (localStorage.getItem('webos.mode.v1') === 'phone') {
        document.getElementById('desktop').hidden = true;
        document.getElementById('phone').hidden = false;
      }
    };
    lock.addEventListener('click', once);
  },

  /* ---------- 轻提示（商店装/卸应用时用） ---------- */
  toastTimer: null,
  toast(msg) {
    let el = document.getElementById('osToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'osToast'; el.className = 'os-toast';
      // 挂到 body：手机形态下 desktop 是隐藏的，挂里面就看不见了
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('on'), 2400);
  },

  /* ---------- 偏好（主题 / 强调色） ---------- */
  restorePrefs() {
    const t = localStorage.getItem('webos.theme');
    if (t) document.documentElement.setAttribute('data-theme', t);
    const a = localStorage.getItem('webos.accent');
    if (a) document.documentElement.style.setProperty('--accent', a);
  },
  setTheme(t) {
    const next = t || (document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('webos.theme', next);
  },
  setAccent(c) {
    document.documentElement.style.setProperty('--accent', c);
    localStorage.setItem('webos.accent', c);
  },

  /* ---------- 锁屏 ---------- */
  bindLock() {
    const lock = document.getElementById('lock');
    const enter = () => {
      lock.classList.add('out');
      setTimeout(() => { lock.style.display = 'none'; }, 340);
      // 按当前形态解锁到对应界面，别一律回桌面
      if (this.mode === 'phone') document.getElementById('phone').hidden = false;
      else document.getElementById('desktop').hidden = false;
      this.updateClock();
    };
    lock.addEventListener('click', enter);
    document.addEventListener('keydown', function onKey(e) {
      if (!document.getElementById('lock').classList.contains('out')) {
        enter();
        document.removeEventListener('keydown', onKey);
      }
    });
  },

  /* ---------- 时钟 ---------- */
  startClock() {
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);
  },
  updateClock() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const t = `${p(d.getHours())}:${p(d.getMinutes())}`;
    const dt = `${d.getMonth() + 1}/${d.getDate()}`;
    const tc = document.getElementById('tcTime');
    const dc = document.getElementById('tcDate');
    if (tc) tc.textContent = t;
    if (dc) dc.textContent = dt;
    const lt = document.getElementById('lockTime');
    const ld = document.getElementById('lockDate');
    if (lt) lt.textContent = t;
    if (ld) ld.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${'日一二三四五六'[d.getDay()]}`;
  },

  /* ---------- 桌面图标 ---------- */
  deskAppIds: ['explorer', 'terminal', 'notepad', 'calculator', 'settings', 'store'],
  renderDeskIcons() {
    const box = document.getElementById('deskIcons');
    // 过滤掉已被卸载的，避免 Apps[id] 为 undefined 时报错
    this.deskAppIds = this.deskAppIds.filter(id => Apps[id]);
    box.innerHTML = this.deskAppIds.map(id => {
      const a = Apps[id];
      return `<button class="dicon" data-app="${id}">
        <span class="dicon__ico">${a.icon}</span>
        <span class="dicon__nm">${a.title}</span>
      </button>`;
    }).join('');
    box.querySelectorAll('.dicon').forEach(b => {
      b.addEventListener('click', () => this.launch(b.dataset.app));
      b.addEventListener('dblclick', () => this.launch(b.dataset.app));
    });
  },

  /* ---------- 开始菜单 ---------- */
  renderStartMenu() {
    const grid = document.getElementById('smGrid');
    const draw = (kw = '') => {
      const list = Object.keys(Apps).filter(id => {
        const a = Apps[id];
        return !kw || a.title.toLowerCase().includes(kw.toLowerCase()) || id.includes(kw.toLowerCase());
      });
      if (!list.length) {
        grid.innerHTML = `<div class="sm__empty">没有匹配「${this.esc(kw)}」的应用</div>`;
        return;
      }
      grid.innerHTML = list.map(id => {
        const a = Apps[id];
        return `<button class="sm__item" data-app="${id}">
          <span class="sm__item-ico">${a.icon}</span>
          <span class="sm__item-nm">${a.title}</span>
        </button>`;
      }).join('');
      grid.querySelectorAll('.sm__item').forEach(b =>
        b.addEventListener('click', () => { this.launch(b.dataset.app); this.closeStart(); }));
    };
    draw();
    const si = document.getElementById('smSearch');
    si.addEventListener('input', () => draw(si.value.trim()));
  },

  bindTaskbar() {
    const btn = document.getElementById('startBtn');
    const menu = document.getElementById('startmenu');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !menu.hidden;
      if (open) this.closeStart(); else this.openStart();
    });
    menu.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => { if (!menu.hidden) this.closeStart(); });

    document.getElementById('trayTheme').addEventListener('click', () => this.setTheme());
    document.getElementById('lockBtn').addEventListener('click', () => this.lockScreen());

    // 窗口层：点击空白处把焦点还给桌面
    document.getElementById('windows').addEventListener('mousedown', (e) => {
      if (e.target.id === 'windows') this.blurAll();
    });
  },

  openStart() {
    const menu = document.getElementById('startmenu');
    menu.hidden = false;
    menu.classList.remove('out');
    document.getElementById('startBtn').classList.add('on');
    const si = document.getElementById('smSearch');
    si.value = '';
    setTimeout(() => si.focus(), 80);
  },
  closeStart() {
    const menu = document.getElementById('startmenu');
    menu.classList.add('out');
    setTimeout(() => { menu.hidden = true; menu.classList.remove('out'); }, 130);
    document.getElementById('startBtn').classList.remove('on');
  },

  lockScreen() {
    this.closeStart();
    const lock = document.getElementById('lock');
    lock.style.display = '';
    lock.classList.remove('out');
    // 重新绑定一次进入事件
    lock.replaceWith(lock.cloneNode(true));
    this.bindLock();
    this.updateClock();
  },

  /* ---------- 窗口 ---------- */
  launch(appId, arg) {
    const app = Apps[appId];
    if (!app) return;
    // 手机形态不走窗口系统，交给 Phone 开全屏页
    if (this.mode === 'phone') { Phone.open(appId); return; }
    this.closeStart();

    // 记事本带文件路径时，若已有该文件的窗口就激活它
    if (appId === 'notepad' && arg && arg.__file) {
      const exist = this.wins.find(w => w.appId === 'notepad' && w.__file === arg.__file);
      if (exist) { this.focusWin(exist.id); return; }
    }

    const id = 'w' + (++this.seq);
    const n = this.wins.length;
    // 层叠定位：每个新窗口右下方偏移 28px，循环回到起点
    const ox = 60 + (n % 6) * 28;
    const oy = 40 + (n % 6) * 28;
    const W = Math.min(880, window.innerWidth - 80);
    const H = Math.min(600, window.innerHeight - 120);
    const x = Math.min(ox, window.innerWidth - W - 20);
    const y = Math.min(oy, window.innerHeight - H - 80);

    const el = document.createElement('div');
    el.className = 'win focus';
    el.style.cssText = `left:${x}px;top:${y}px;width:${W}px;height:${H}px;z-index:${++this.zTop}`;
    const title = appId === 'notepad' && arg && arg.__file ? FS.basename(arg.__file) : app.title;
    el.innerHTML = `
      <div class="win__bar">
        <div class="win__title"><span style="font-size:15px">${app.icon}</span><span data-t>${this.esc(title)}</span></div>
        <div class="win__btns">
          <button class="wb wb--min" title="最小化"><svg viewBox="0 0 12 12"><path d="M1 5.5h10v1H1z"/></svg></button>
          <button class="wb wb--max" title="最大化"><svg viewBox="0 0 12 12"><path d="M1.5 1.5h9v9h-9v-9zm1 1v7h7v-7h-7z"/></svg></button>
          <button class="wb wb--close" title="关闭"><svg viewBox="0 0 12 12"><path d="M2.1 1L1 2.1 4.9 6 1 9.9 2.1 11 6 7.1 9.9 11 11 9.9 7.1 6 11 2.1 9.9 1 6 4.9z"/></svg></button>
        </div>
      </div>
      <div class="win__body"></div>
      <div class="win__resize"></div>`;

    document.getElementById('windows').appendChild(el);

    const win = { id, appId, el, title, min: false, max: false, __file: arg && arg.__file };
    this.wins.push(win);

    // ---- 标题栏事件 ----
    const bar = el.querySelector('.win__bar');
    const body = el.querySelector('.win__body');

    el.querySelector('.wb--close').addEventListener('click', () => this.closeWin(id));
    el.querySelector('.wb--min').addEventListener('click', () => this.minWin(id));
    el.querySelector('.wb--max').addEventListener('click', () => this.maxWin(id));
    el.addEventListener('mousedown', () => this.focusWin(id));

    // 双击标题栏最大化
    bar.addEventListener('dblclick', (e) => {
      if (e.target.closest('.wb')) return;
      this.maxWin(id);
    });

    this.makeDraggable(el, bar, win);
    this.makeResizable(el, el.querySelector('.win__resize'), win);

    // ---- 挂载应用 ----
    win.__title = (newTitle) => {
      const s = el.querySelector('[data-t]');
      if (s) s.textContent = newTitle;
      const tb = document.querySelector(`.tb__app[data-id="${id}"]`);
      if (tb) tb.title = newTitle;
    };
    app.mount(body, win);

    this.renderTaskbar();
    return id;
  },

  makeDraggable(el, handle, win) {
    let sx, sy, ox, oy, dragging = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('.wb')) return;
      if (win.max) return;           // 最大化时不允许拖动
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      ox = el.offsetLeft; oy = el.offsetTop;
      document.body.style.cursor = 'move';
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      let nx = ox + (e.clientX - sx);
      let ny = oy + (e.clientY - sy);
      // 限制在可视区内，别让窗口跑丢
      nx = Math.max(-el.offsetWidth + 80, Math.min(nx, window.innerWidth - 80));
      ny = Math.max(0, Math.min(ny, window.innerHeight - 60));
      el.style.left = nx + 'px';
      el.style.top = ny + 'px';
    });
    document.addEventListener('mouseup', () => {
      dragging = false;
      document.body.style.cursor = '';
    });
  },

  makeResizable(el, grip, win) {
    let sx, sy, ow, oh, resizing = false;
    grip.addEventListener('mousedown', (e) => {
      if (win.max) return;
      resizing = true;
      sx = e.clientX; sy = e.clientY;
      ow = el.offsetWidth; oh = el.offsetHeight;
      e.preventDefault();
      e.stopPropagation();
    });
    document.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      el.style.width = Math.max(320, ow + (e.clientX - sx)) + 'px';
      el.style.height = Math.max(200, oh + (e.clientY - sy)) + 'px';
    });
    document.addEventListener('mouseup', () => { resizing = false; });
  },

  focusWin(id) {
    const w = this.wins.find(x => x.id === id);
    if (!w) return;
    if (w.min) { w.min = false; w.el.classList.remove('min'); }
    this.zTop++;
    w.el.style.zIndex = this.zTop;
    this.wins.forEach(x => x.el.classList.toggle('focus', x.id === id));
    this.renderTaskbar();
  },
  blurAll() {
    this.wins.forEach(x => x.el.classList.remove('focus'));
    this.renderTaskbar();
  },
  minWin(id) {
    const w = this.wins.find(x => x.id === id);
    if (!w) return;
    w.min = true;
    w.el.classList.add('min');
    w.el.classList.remove('focus');
    this.renderTaskbar();
  },
  maxWin(id) {
    const w = this.wins.find(x => x.id === id);
    if (!w) return;
    if (w.max) {
      w.max = false;
      w.el.classList.remove('max');
      w.el.style.left = w._l; w.el.style.top = w._t;
      w.el.style.width = w._w; w.el.style.height = w._h;
    } else {
      w._l = w.el.style.left; w._t = w.el.style.top;
      w._w = w.el.style.width; w._h = w.el.style.height;
      w.max = true;
      w.el.classList.add('max');
    }
    this.renderTaskbar();
  },
  closeWin(id) {
    const i = this.wins.findIndex(x => x.id === id);
    if (i < 0) return;
    const win = this.wins[i];
    // 应用可以注册清理钩子（清定时器、摘掉全局键盘监听等）
    const body = win.el.querySelector('.win__body');
    if (body && body.__closeHooks) {
      body.__closeHooks.forEach(f => { try { f(); } catch (e) { /* 单个钩子报错不影响关窗 */ } });
      body.__closeHooks = null;
    }
    win.el.remove();
    this.wins.splice(i, 1);
    this.renderTaskbar();
  },

  renderTaskbar() {
    const box = document.getElementById('tbApps');
    box.innerHTML = this.wins.map(w => {
      const a = Apps[w.appId];
      const on = !w.min && w.el.classList.contains('focus');
      return `<button class="tb__app ${on ? 'on' : ''}" data-id="${w.id}" title="${this.esc(w.title)}">${a.icon}</button>`;
    }).join('');
    box.querySelectorAll('.tb__app').forEach(b => {
      b.addEventListener('click', () => {
        const w = this.wins.find(x => x.id === b.dataset.id);
        if (!w) return;
        // 已聚焦且未最小化 → 最小化；否则激活
        if (!w.min && w.el.classList.contains('focus')) this.minWin(w.id);
        else this.focusWin(w.id);
      });
    });
  },

  /* ---------- 打开文件 ---------- */
  openFile(path) {
    const name = FS.basename(path);
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    if (['txt', 'md', 'log', 'json', 'js', 'css', 'html'].includes(ext)) {
      this.launch('notepad', { __file: path });
    } else {
      this.launch('notepad', { __file: path });
      this.toast(`用记事本打开：${name}`);
    }
  },

  /* ---------- Toast ---------- */
  toastTimer: null,
  toast(msg) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.style.cssText = `position:fixed;left:50%;bottom:80px;transform:translateX(-50%) translateY(20px);
        z-index:300;padding:10px 18px;border-radius:8px;font-size:13px;
        background:var(--acrylic-strong);backdrop-filter:blur(30px);
        box-shadow:var(--shadow-menu);color:var(--text);opacity:0;
        transition:opacity .2s cubic-bezier(.16,1,.3,1),transform .2s cubic-bezier(.16,1,.3,1)`;
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateX(-50%) translateY(0)';
    });
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(20px)';
    }, 2600);
  },

  esc(s) {
    return String(s).replace(/[&<>"']/g, m =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  },
};

window.addEventListener('DOMContentLoaded', () => OS.init());
