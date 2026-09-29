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
    // 主屏放全部应用。Dock 只是底部快捷栏，和主屏可以重复——
    // 真实手机就是这样（Android 抽屉里有，Dock 上也有一份）。
    const all = OS.deskAppIds.concat([...AppStore.installed]);
    const seen = new Set();
    const out = [];
    for (const id of all) {
      if (!Apps[id] || seen.has(id)) continue;
      seen.add(id); out.push(id);
    }
    return out;
  },

  /* ============================================================
     主屏分页
     布局存 localStorage，格式 { pages: [[id,…], [id,…]] }
     ============================================================ */
  PER_PAGE: 8,           // 4 列 × 2 行：小屏一页 8 个不挤，应用多了自然分页
  LAYOUT_KEY: 'webos.phone.layout.v1',
  page: 0,               // 当前页下标

  loadLayout() {
    try {
      const o = JSON.parse(localStorage.getItem(this.LAYOUT_KEY));
      if (o && Array.isArray(o.pages)) return o.pages.map(p => Array.isArray(p) ? p.slice() : []);
    } catch (e) { /* 坏了就当没有，下面会重建 */ }
    return null;
  },
  saveLayout(pages) {
    try { localStorage.setItem(this.LAYOUT_KEY, JSON.stringify({ pages })); }
    catch (e) { /* 配额满就算了，当前会话仍可用 */ }
  },

  /* 把「该在主屏的 id」和「用户存的布局」合并成规范的分页 */
  homePages() {
    const ids = this.homeIds();
    let pages = this.loadLayout() || [];

    // 清掉已卸载的、已进 Dock 的、重复的
    const seen = new Set();
    pages = pages.map(p => p.filter(id => {
      if (!Apps[id] || seen.has(id) || !ids.includes(id)) return false;
      seen.add(id); return true;
    }));

    // 新装的应用补到最后一页（满了就开新页）
    for (const id of ids) {
      if (seen.has(id)) continue;
      let last = pages[pages.length - 1];
      if (!last || last.length >= this.PER_PAGE) { last = []; pages.push(last); }
      last.push(id);
      seen.add(id);
    }

    pages = pages.filter(p => p.length);
    if (!pages.length) pages = [[]];
    return pages;
  },

  /* 从当前 DOM 读回布局并保存（拖拽排序后调用） */
  commitLayout() {
    const pages = [...document.querySelectorAll('.ph__page')].map(pg =>
      [...pg.querySelectorAll('.ph__icon')].map(b => b.dataset.app));
    this.saveLayout(pages);
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

  /* ---------- 主屏（分页 + 左右滑） ---------- */
  renderHome() {
    const box = document.getElementById('phHome');
    if (!box) return;
    const pages = this.homePages();
    const dock = this.dockIds();
    // 页数变少时别停在空页上
    if (this.page >= pages.length) this.page = pages.length - 1;
    if (this.page < 0) this.page = 0;

    box.innerHTML = `
      <div class="ph__pager" id="phPager">
        <div class="ph__track" id="phTrack">
          ${pages.map(p => `
            <div class="ph__page">
              <div class="ph__grid">${p.map(id => this.iconHtml(id)).join('')}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="ph__dots" id="phDots">
        ${pages.map((_, i) => `<button class="ph__dot ${i === this.page ? 'on' : ''}" data-p="${i}" title="第 ${i + 1} 页"></button>`).join('')}
      </div>
      <div class="ph__dock">
        ${dock.map(id => this.iconHtml(id)).join('')}
      </div>
      <div class="ph__pagehint">左右滑动翻页 · 长按图标可拖动排序</div>`;

    this.applyPage(false);
    this.bindHomeGestures();
    this.bindIconDrag();

    // 点图标打开应用（拖动时不会触发，drag 里会抑制 click）
    box.querySelectorAll('[data-app]').forEach(b =>
      b.addEventListener('click', (e) => {
        if (this.__justDragged) { this.__justDragged = false; return; }
        this.open(b.dataset.app);
      }));

    box.querySelectorAll('.ph__dot').forEach(d =>
      d.addEventListener('click', () => this.setPage(+d.dataset.p)));
  },

  applyPage(animate) {
    const track = document.getElementById('phTrack');
    if (!track) return;
    track.style.transition = animate ? '' : 'none';
    track.style.transform = `translateX(${-this.page * 100}%)`;
    if (!animate) {
      // 强制回流，确保下一次带动画的切换生效
      void track.offsetWidth;
      track.style.transition = '';
    }
    const dots = document.querySelectorAll('.ph__dot');
    dots.forEach((d, i) => d.classList.toggle('on', i === this.page));
  },

  setPage(n, animate) {
    const total = document.querySelectorAll('.ph__page').length;
    const next = Math.max(0, Math.min(total - 1, n));
    if (next === this.page) { this.applyPage(animate !== false); return; }
    this.page = next;
    this.applyPage(animate !== false);
  },

  /* ---------- 左右滑翻页 ----------
     绑在 phHome 上而不是 pager 上：renderHome 会重建 pager，
     每次重绑会给 window 挂监听器，多渲染几次就泄漏了。 */
  bindHomeGestures() {
    const box = document.getElementById('phHome');
    if (!box || box.__swipeBound) return;
    box.__swipeBound = true;

    let sx = null, sy = null, dx = 0, locked = null, w = 0;
    const track = () => document.getElementById('phTrack');
    const pager = () => document.getElementById('phPager');

    const down = (e) => {
      if (this.dragMode) return;               // 正在拖图标就不管翻页
      if (!e.target.closest('.ph__pager')) return;
      sx = (e.touches ? e.touches[0] : e).clientX;
      sy = (e.touches ? e.touches[0] : e).clientY;
      dx = 0; locked = null;
      w = (pager() ? pager().clientWidth : 0) || 1;
    };

    const move = (e) => {
      if (sx == null || this.dragMode) return;
      const cx = (e.touches ? e.touches[0] : e).clientX;
      const cy = (e.touches ? e.touches[0] : e).clientY;
      dx = cx - sx;
      const dy = cy - sy;
      // 首次移动时判断方向：横向就吃掉手势，纵向留给页面滚动
      if (locked == null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (locked !== 'x') return;
      if (e.cancelable) e.preventDefault();
      const t = track();
      t.style.transition = 'none';
      t.style.transform = `translateX(calc(${-this.page * 100}% + ${dx}px))`;
    };

    const up = () => {
      const t = track();
      if (sx == null) return;
      const wasX = locked === 'x';
      const d = dx;
      sx = null; sy = null; locked = null;
      if (!wasX) return;
      t.style.transition = '';
      // 超过 22% 宽度就翻页，否则弹回
      const total = document.querySelectorAll('.ph__page').length;
      if (Math.abs(d) > w * 0.22) {
        const n = this.page + (d < 0 ? 1 : -1);
        if (n >= 0 && n < total) this.setPage(n, true);
        else { t.style.transform = `translateX(${-this.page * 100}%)`; }
      } else {
        t.style.transform = `translateX(${-this.page * 100}%)`;
      }
    };

    box.addEventListener('touchstart', down, { passive: true });
    box.addEventListener('touchmove', move, { passive: false });
    box.addEventListener('touchend', up, { passive: true });
    box.addEventListener('touchcancel', up, { passive: true });
    box.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  },

  /* ---------- 长按拖动图标（可跨页） ---------- */
  bindIconDrag() {
    const box = document.getElementById('phHome');
    if (!box || box.__dragBound) return;
    box.__dragBound = true;

    let timer = null, ghost = null, src = null, moved = false;
    let sx = 0, sy = 0, edgeTimer = null, lx = 0, ly = 0;

    const clearGhost = () => {
      if (ghost) { ghost.remove(); ghost = null; }
      if (src) { src.classList.remove('dragging'); src = null; }
      clearTimeout(timer); clearInterval(edgeTimer); edgeTimer = null;
      this.dragMode = false;
    };

    const start = (x, y) => {
      this.dragMode = true;
      moved = false;
      src.classList.add('dragging');
      ghost = document.createElement('div');
      ghost.className = 'ph__ghost';
      ghost.innerHTML = src.querySelector('.ph__icon-ico').outerHTML;
      document.body.appendChild(ghost);
      moveGhost(x, y);
      // 拖到左右边缘停留 → 自动翻页。
      // 翻完要按当前指针位置再排一次，否则松手时图标还留在原来那页。
      edgeTimer = setInterval(() => {
        if (!ghost) return;
        const gx = parseFloat(ghost.style.left) || 0;
        const w = window.innerWidth;
        let n = null;
        if (gx < w * 0.16) n = this.page - 1;
        else if (gx > w * 0.84) n = this.page + 1;
        if (n == null) return;
        const before = this.page;
        this.setPage(n, true);
        if (this.page !== before) setTimeout(() => reorder(lx, ly), 260);
      }, 700);
    };

    const moveGhost = (x, y) => {
      if (ghost) { ghost.style.left = x + 'px'; ghost.style.top = y + 'px'; }
    };

    /* 把 src 插到目标图标前面（在同一页里移动；跨页时先切页再插） */
    const reorder = (x, y) => {
      if (!src) return;
      ghost && (ghost.style.display = 'none');
      const under = document.elementFromPoint(x, y);
      ghost && (ghost.style.display = '');
      if (!under) return;
      const target = under.closest('.ph__icon');
      const page = under.closest('.ph__page');
      if (!page) return;
      const grid = page.querySelector('.ph__grid');
      // 落在本页空白处：追加到末尾（跨页时这一步就把图标搬过来了）
      if (!target || target === src) {
        if (page !== src.closest('.ph__page')) grid.appendChild(src);
        return;
      }
      if (target.dataset.app === src.dataset.app) return;
      // 判断是否插到 target 之后（指针在其右半边或下半边）
      const r = target.getBoundingClientRect();
      const after = x > r.left + r.width / 2;
      if (after) target.after(src); else target.before(src);
    };

    const onDown = (e) => {
      if (e.target.closest('.ph__dot') || e.target.closest('.ph__dock')) return;
      const icon = e.target.closest('.ph__icon');
      if (!icon) return;
      src = icon;
      const p = e.touches ? e.touches[0] : e;
      sx = p.clientX; sy = p.clientY;
      timer = setTimeout(() => start(p.clientX, p.clientY), 380);
    };

    const onMove = (e) => {
      if (src && !ghost && (e.touches || e.buttons)) {
        const p = e.touches ? e.touches[0] : e;
        if (Math.hypot(p.clientX - sx, p.clientY - sy) > 8) { clearTimeout(timer); src = null; }
        return;
      }
      if (!ghost) return;
      e.preventDefault();
      const p = e.touches ? e.touches[0] : e;
      moved = true;
      lx = p.clientX; ly = p.clientY;
      moveGhost(p.clientX, p.clientY);
      reorder(p.clientX, p.clientY);
    };

    const onUp = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (ghost) {
        this.commitLayout();
        this.__justDragged = true;
        setTimeout(() => { this.__justDragged = false; }, 60);
        clearGhost();
        // 页数可能因为拖空而需要合并，重渲染一次
        this.renderHome();
      }
      src = null; moved = false;
    };

    box.addEventListener('touchstart', onDown, { passive: true });
    box.addEventListener('touchmove', onMove, { passive: false });
    box.addEventListener('touchend', onUp, { passive: true });
    box.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
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
