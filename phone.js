/* ============================================================
   WebOS · 手机形态
   ------------------------------------------------------------
   同一套 Apps，换一套壳：状态栏 / 主屏网格 / Dock /
   应用抽屉 / 卡片式多任务 / 下拉通知栏 / 手势导航条。

   和桌面形态共用：
     Apps        应用实现（完全复用，一行不改）
     FS          文件系统
     AppStore    商店与已安装列表
   不共用：
     窗口系统（手机上是全屏页 + 卡片多任务，不拖动不缩放）
   ============================================================ */

const Phone = {
  stack: [],        // 打开的应用栈 [{ id, el, title, icon }]
  cur: null,        // 当前栈顶 id
  KEY: 'webos.mode.v1',

  /* ---------- 主屏上显示哪些 ---------- */
  dockIds() {
    // Dock 放最常用的 4 个，优先已安装的
    const pref = ['explorer', 'store', 'settings', 'terminal'];
    const has = pref.filter(id => Apps[id]);
    // Dock 最多 4 个，不够就从已装应用里补
    for (const id of AppStore.installed) {
      if (has.length >= 4) break;
      if (!has.includes(id)) has.push(id);
    }
    return has.slice(0, 4);
  },

  homeIds() {
    // 主屏 = 桌面图标 + 已装应用，去掉已在 Dock 的
    const dock = this.dockIds();
    const all = OS.deskAppIds.concat([...AppStore.installed]);
    const seen = new Set();
    const out = [];
    for (const id of all) {
      if (!Apps[id] || dock.includes(id) || seen.has(id)) continue;
      seen.add(id); out.push(id);
    }
    return out;
  },

  /* ============================================================
     渲染
     ============================================================ */
  build() {
    const root = document.getElementById('phone');
    if (!root) return;
    root.innerHTML = `
      <div class="ph">
        <div class="ph__screen" id="phScreen">
          <!-- 状态栏 -->
          <div class="ph__status" id="phStatus">
            <span class="ph__st-time" id="phTime">--:--</span>
            <span class="ph__st-right">
              <svg class="ph__sig" viewBox="0 0 24 24"><path d="M2 22h20V2z"/></svg>
              <svg class="ph__wifi" viewBox="0 0 24 24"><path d="M12 21l3-3h-6l3 3zm-4.24-5.24l2.12-2.12 2.12 2.12 2.12-2.12-4.24-4.24-2.12 2.12 2.12 2.12-2.12 2.12zM12 3C7.6 3 3.7 4.9 1 8.2l2.1 2.1C5.4 7.6 8.5 6 12 6s6.6 1.6 8.9 4.3L23 8.2C20.3 4.9 16.4 3 12 3z"/></svg>
              <span class="ph__bat"><i id="phBat"></i></span>
            </span>
          </div>

          <!-- 页面容器 -->
          <div class="ph__pages" id="phPages">
            <div class="ph__home" id="phHome"></div>
          </div>

          <!-- 导航条 -->
          <div class="ph__nav" id="phNav">
            <button class="ph__navbtn" id="phBack" title="返回">
              <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            </button>
            <button class="ph__navbtn ph__navbtn--home" id="phHomeBtn" title="主屏"></button>
            <button class="ph__navbtn" id="phRecents" title="多任务">
              <svg viewBox="0 0 24 24"><path d="M4 6h16v2H4zm0 10h16v2H4z"/></svg>
            </button>
          </div>

          <!-- 抽屉 / 通知 / 多任务，都是盖在屏幕上的层 -->
          <div class="ph__layer" id="phDrawer" hidden></div>
          <div class="ph__layer" id="phNotify" hidden></div>
          <div class="ph__layer" id="phTasks" hidden></div>
        </div>
      </div>`;

    this.root = root;
    this.bind();
    this.renderHome();
    this.startClock();
  },

  show() {
    document.getElementById('desktop').hidden = true;
    document.getElementById('phone').hidden = false;
    // 关掉桌面模式的窗口，避免它们在后台还占着
    (OS.wins || []).slice().forEach(w => OS.closeWin(w.id));
  },

  hide() {
    document.getElementById('phone').hidden = true;
    document.getElementById('desktop').hidden = false;
  },

  /* ---------- 时钟 ---------- */
  startClock() {
    const tick = () => {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      const e = document.getElementById('phTime');
      if (e) e.textContent = `${p(d.getHours())}:${p(d.getMinutes())}`;
      const b = document.getElementById('phBat');
      if (b) {
        // 有真实电量就用真的，没有就按时间推一个假的（纯装饰）
        if (navigator.getBattery) navigator.getBattery().then(bt => {
          b.style.width = Math.round(bt.level * 100) + '%';
        }).catch(() => {});
        else b.style.width = '78%';
      }
    };
    tick();
    if (this.clockIv) clearInterval(this.clockIv);
    this.clockIv = setInterval(tick, 10000);
  },

  /* ---------- 主屏 ---------- */
  renderHome() {
    const box = document.getElementById('phHome');
    if (!box) return;
    const home = this.homeIds();
    const dock = this.dockIds();

    box.innerHTML = `
      <div class="ph__grid">
        ${home.map(id => this.iconHtml(id)).join('')}
      </div>
      <div class="ph__dock">
        ${dock.map(id => this.iconHtml(id)).join('')}
      </div>
      <div class="ph__pagehint">上滑查看全部应用</div>`;

    box.querySelectorAll('[data-app]').forEach(b =>
      b.addEventListener('click', () => this.open(b.dataset.app)));
  },

  iconHtml(id) {
    const a = Apps[id];
    if (!a) return '';
    return `<button class="ph__icon" data-app="${id}">
      <span class="ph__icon-ico">${a.icon}</span>
      <span class="ph__icon-nm">${a.title}</span>
    </button>`;
  },

  /* ---------- 应用抽屉 ---------- */
  toggleDrawer(force) {
    const d = document.getElementById('phDrawer');
    const open = force != null ? force : d.hidden;
    if (open) {
      const all = Object.keys(Apps).filter(id => Apps[id]);
      d.innerHTML = `
        <div class="ph__sheet">
          <div class="ph__sheet-grab"></div>
          <div class="ph__sheet-t">全部应用 <span>${all.length}</span></div>
          <div class="ph__drawer-grid">
            ${all.map(id => `
              <button class="ph__app-row" data-app="${id}">
                <span class="ph__icon-ico">${Apps[id].icon}</span>
                <span class="ph__app-row-nm">${Apps[id].title}</span>
              </button>`).join('')}
          </div>
        </div>`;
      d.querySelectorAll('[data-app]').forEach(b =>
        b.addEventListener('click', () => { this.closeLayers(); this.open(b.dataset.app); }));
    }
    d.hidden = !open;
  },

  /* ---------- 通知栏 / 快捷设置 ---------- */
  toggleNotify(force) {
    const d = document.getElementById('phNotify');
    const open = force != null ? force : d.hidden;
    if (open) {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      d.innerHTML = `
        <div class="ph__sheet ph__sheet--notify">
          <div class="ph__sheet-grab"></div>
          <div class="ph__qs">
            <button class="ph__tile ${dark ? 'on' : ''}" data-q="theme">
              <span>${dark ? '🌙' : '☀️'}</span><b>${dark ? '深色' : '浅色'}</b>
            </button>
            <button class="ph__tile" data-q="accent">
              <span>🎨</span><b>主题色</b>
            </button>
            <button class="ph__tile" data-q="desktop">
              <span>🖥️</span><b>桌面模式</b>
            </button>
            <button class="ph__tile" data-q="lock">
              <span>🔒</span><b>锁屏</b>
            </button>
          </div>
          <div class="ph__accent" id="phAccent" hidden>
            ${['#0078D4', '#0B7D3E', '#C42B1C', '#8E4EC6', '#F5A623', '#00B4D8'].map(c =>
              `<button class="ph__swatch" data-c="${c}" style="background:${c}"></button>`).join('')}
          </div>
          <div class="ph__notif">
            <div class="ph__notif-t">通知</div>
            <div class="ph__notif-item">
              <b>WebOS</b>
              <span>已安装 ${AppStore.installed.size} 款应用 · 运行 ${this.stack.length} 个</span>
            </div>
            <div class="ph__notif-item">
              <b>文件系统</b>
              <span>${FS.list('/').length} 个条目 · 一切正常</span>
            </div>
          </div>
          <div class="ph__sysinfo">
            手机形态 · WebOS 1.2 · 内核 Browser
          </div>
        </div>`;
      d.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
        const q = b.dataset.q;
        if (q === 'theme') { OS.setTheme(); this.toggleNotify(false); this.toggleNotify(true); }
        else if (q === 'accent') {
          const a = d.querySelector('#phAccent');
          a.hidden = !a.hidden;
        }
        else if (q === 'desktop') { this.closeLayers(); OS.switchMode('desktop'); }
        else if (q === 'lock') { this.closeLayers(); OS.lockPhone(); }
      }));
      d.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
        OS.setAccent(b.dataset.c); this.toggleNotify(false); this.toggleNotify(true);
      }));
    }
    d.hidden = !open;
  },

  /* ---------- 卡片式多任务 ---------- */
  toggleTasks(force) {
    const d = document.getElementById('phTasks');
    const open = force != null ? force : d.hidden;
    if (open) {
      if (!this.stack.length) {
        d.innerHTML = `<div class="ph__sheet ph__sheet--tasks">
          <div class="ph__sheet-t">最近任务</div>
          <div class="ph__tasks-empty">没有运行中的应用</div>
        </div>`;
      } else {
        d.innerHTML = `<div class="ph__sheet ph__sheet--tasks">
          <div class="ph__sheet-t">最近任务 <span>${this.stack.length}</span></div>
          <div class="ph__tasks">
            ${this.stack.map(s => `
              <div class="ph__task ${s.id === this.cur ? 'on' : ''}" data-id="${s.id}">
                <div class="ph__task-hd">
                  <span class="ph__task-ico">${s.icon}</span>
                  <span class="ph__task-nm">${OS.esc(s.title)}</span>
                  <button class="ph__task-x" data-x="${s.id}" title="关闭">✕</button>
                </div>
                <div class="ph__task-prev">${OS.esc(s.title)}</div>
              </div>`).join('')}
          </div>
          <button class="ph__clear" id="phClearAll">全部关闭</button>
        </div>`;
        d.querySelectorAll('[data-x]').forEach(b =>
          b.addEventListener('click', (e) => { e.stopPropagation(); this.close(b.dataset.x); this.toggleTasks(true); }));
        d.querySelectorAll('.ph__task').forEach(c =>
          c.addEventListener('click', () => { this.closeLayers(); this.focusApp(c.dataset.id); }));
        const ca = d.querySelector('#phClearAll');
        if (ca) ca.addEventListener('click', () => { this.closeAll(); this.toggleTasks(false); });
      }
    }
    d.hidden = !open;
  },

  closeLayers() {
    ['phDrawer', 'phNotify', 'phTasks'].forEach(id => {
      const e = document.getElementById(id);
      if (e) e.hidden = true;
    });
  },

  anyLayerOpen() {
    return ['phDrawer', 'phNotify', 'phTasks'].some(id => {
      const e = document.getElementById(id);
      return e && !e.hidden;
    });
  },

  /* ============================================================
     打开 / 关闭应用
     ============================================================ */
  open(id) {
    const app = Apps[id];
    if (!app) return;
    this.closeLayers();

    // 已打开就切过去，不重复建页（含后台的）
    const exist = this.stack.find(s => s.id === id);
    if (exist) { this.focusApp(id); return; }

    const el = document.createElement('div');
    el.className = 'ph__app';
    el.innerHTML = `<div class="ph__app-body"></div>`;
    document.getElementById('phPages').appendChild(el);

    const rec = { id, el, title: app.title, icon: app.icon };
    this.stack.push(rec);
    this.cur = id;
    app.mount(el.querySelector('.ph__app-body'), rec);

    // 进场动画
    requestAnimationFrame(() => el.classList.add('in'));
    this.syncNav();
  },

  focusApp(id) {
    const rec = this.stack.find(s => s.id === id);
    if (!rec) return;
    this.cur = id;
    // 提到栈顶并置顶
    this.stack = this.stack.filter(s => s.id !== id).concat([rec]);
    this.stack.forEach(s => {
      s.el.classList.toggle('on', s.id === id);
      s.el.classList.remove('bg');       // 从后台拉回前台
    });
    this.syncNav();
  },

  close(id) {
    const rec = this.stack.find(s => s.id === id);
    if (!rec) return;
    // 应用可能注册了清理钩子（定时器 / 全局键盘监听）
    const body = rec.el.querySelector('.ph__app-body');
    if (body && body.__closeHooks) {
      body.__closeHooks.forEach(f => { try { f(); } catch (e) { /* 忽略单个钩子错误 */ } });
    }
    rec.el.classList.remove('in');
    setTimeout(() => rec.el.remove(), 180);
    this.stack = this.stack.filter(s => s.id !== id);
    if (this.cur === id) {
      this.cur = this.stack.length ? this.stack[this.stack.length - 1].id : null;
      if (this.cur) this.focusApp(this.cur);
      else this.home();     // 全关完就回主屏
    }
    this.syncNav();
  },

  closeAll() {
    this.stack.slice().forEach(s => this.close(s.id));
    this.cur = null;
    this.syncNav();
  },

  home() {
    this.closeLayers();
    this.cur = null;
    // 应用页要真的退下去，否则会盖住主屏、挡住图标点击
    this.stack.forEach(s => {
      s.el.classList.remove('on');
      s.el.classList.add('bg');
    });
    this.syncNav();
  },

  /* 返回：关掉当前应用；已经在主屏则无事 */
  back() {
    if (this.anyLayerOpen()) { this.closeLayers(); return; }
    if (this.cur) this.close(this.cur);
  },

  syncNav() {
    const back = document.getElementById('phBack');
    if (back) back.style.opacity = this.cur ? '1' : '.35';
    const homeBtn = document.getElementById('phHomeBtn');
    if (homeBtn) homeBtn.classList.toggle('on', !this.cur);
  },

  /* ============================================================
     手势与按键
     ============================================================ */
  bind() {
    const screen = document.getElementById('phScreen');
    const nav = document.getElementById('phNav');

    document.getElementById('phHomeBtn').addEventListener('click', () => this.home());
    document.getElementById('phBack').addEventListener('click', () => this.back());
    document.getElementById('phRecents').addEventListener('click', () => this.toggleTasks());

    // 主屏上滑 → 应用抽屉
    let sy = null;
    const onDown = (e) => { sy = (e.touches ? e.touches[0] : e).clientY; };
    const onUp = (e) => {
      if (sy == null) return;
      const ey = (e.changedTouches ? e.changedTouches[0] : e).clientY;
      const dy = sy - ey;
      sy = null;
      if (dy > 60 && !this.cur && !this.anyLayerOpen()) this.toggleDrawer(true);
      if (dy < -60 && !this.cur && !this.anyLayerOpen()) this.toggleNotify(true);
    };
    const home = document.getElementById('phHome');
    if (home) {
      home.addEventListener('touchstart', onDown, { passive: true });
      home.addEventListener('touchend', onUp, { passive: true });
      home.addEventListener('mousedown', onDown);
      home.addEventListener('mouseup', onUp);
    }

    // 点遮罩关掉抽屉 / 通知 / 多任务
    ['phDrawer', 'phNotify', 'phTasks'].forEach(id => {
      const e = document.getElementById(id);
      e.addEventListener('click', (ev) => { if (ev.target === e) e.hidden = true; });
    });

    // 点层内空白处也能关（抽屉的空白区）
    document.addEventListener('keydown', (e) => {
      if (OS.mode !== 'phone') return;
      if (e.key === 'Escape') { if (this.anyLayerOpen()) this.closeLayers(); else this.back(); }
    });

    // 状态栏下拉也能开通知
    document.getElementById('phStatus').addEventListener('click', () => this.toggleNotify());
  },
};
