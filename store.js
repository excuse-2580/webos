/* ============================================================
   WebOS · 应用商店
   管理可安装应用的目录、安装 / 卸载与持久化
   ============================================================ */

const AppStore = {
  KEY: 'webos.store.installed.v1',
  installed: new Set(),

  /* ---------- 应用目录 ---------- */
  CATALOG: [
    {
      id: 'minesweeper', name: '扫雷', icon: '💣', cat: '游戏',
      ver: '1.0.0', size: '12 KB', author: 'WebOS',
      brief: '经典扫雷，三种难度。第一下保证不踩雷。',
      desc: '左键翻开格子，右键插旗标记地雷。翻到空白会自动扩散一片，格子上的数字表示周围八格有几颗雷。\n初级 9×9/10 雷、中级 16×16/40 雷、高级 30×16/99 雷。首次点击会重排雷区，保证第一下不会直接踩雷。',
      feats: ['三种难度', '首点不踩雷', '右键标旗', '数字上双击快速展开'],
    },
    {
      id: 'game2048', name: '2048', icon: '🎯', cat: '游戏',
      ver: '1.0.0', size: '9 KB', author: 'WebOS',
      brief: '合并数字，凑出 2048。最高分本地保存。',
      desc: '用方向键或 WASD 移动所有方块，相同数字相撞会合并成两倍。目标是凑出 2048。\n手机上可以直接在棋盘上滑动。最高分存在本机，刷新不会丢。',
      feats: ['键盘 + 滑动操作', '最高分记录', '到达 2048 可继续玩', '自动检测无路可走'],
    },
    {
      id: 'snake', name: '贪吃蛇', icon: '🐍', cat: '游戏',
      ver: '1.0.0', size: '11 KB', author: 'WebOS',
      brief: '吃豆长身体，别撞墙也别咬到自己。',
      desc: '方向键或 WASD 控制蛇的方向，吃到红点得 10 分。撞到边界或自己的身体就结束。\n空格键可以随时暂停/继续。最高分存在本机。',
      feats: ['空格暂停', '最高分记录', '随吃随长', '禁止直接掉头'],
    },
    {
      id: 'paint', name: '画板', icon: '🎨', cat: '工具',
      ver: '1.0.0', size: '8 KB', author: 'WebOS',
      brief: '涂涂画画，作品能存进图片库。',
      desc: '一支简单的画笔：7 种颜色、粗细可调、带橡皮。鼠标和手指都能画。\n点「保存到图片库」会把画作写进文件系统的 /Pictures 目录，可以在文件管理器里看到（保存时压缩成 JPEG，避免占用太多空间）。',
      feats: ['7 种颜色', '粗细 1-24', '橡皮擦', '保存到 /Pictures'],
    },
    {
      id: 'clock', name: '时钟', icon: '⏱️', cat: '工具',
      ver: '1.0.0', size: '10 KB', author: 'WebOS',
      brief: '秒表、倒计时、世界时钟，三合一。',
      desc: '三个标签页：\n· 秒表 —— 精确到百分之一秒，支持计次\n· 倒计时 —— 6 个常用预设，时间到会弹提示\n· 时钟 —— 本地时间 + 东京/伦敦/纽约/洛杉矶',
      feats: ['秒表带计次', '倒计时预设', '多时区对照', '实时刷新'],
    },
    {
      id: 'sysinfo', name: '系统信息', icon: '📊', cat: '系统',
      ver: '1.0.0', size: '7 KB', author: 'WebOS',
      brief: '看看这台"机器"的配置。',
      desc: '显示屏幕、显卡、浏览器内核、CPU 核心、内存、时区、网络状态，以及文件系统占用。\n也正好能看出——这台"电脑"其实是你的浏览器。',
      feats: ['设备与屏幕', '浏览器运行时', '存储占用', '完整 UA'],
    },
  ],

  CATS: ['全部', '游戏', '工具', '系统'],

  /* ---------- 持久化 ---------- */
  load() {
    try {
      const a = JSON.parse(localStorage.getItem(this.KEY)) || [];
      this.installed = new Set(a.filter(id => StoreApps[id]));
    } catch (e) { this.installed = new Set(); }
    this.installed.forEach(id => { Apps[id] = StoreApps[id]; });
    return this.installed;
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify([...this.installed])); }
    catch (e) { /* 配额满就算了，不影响当前会话 */ }
  },

  isInstalled(id) { return this.installed.has(id); },

  install(id) {
    if (!StoreApps[id] || this.installed.has(id)) return false;
    Apps[id] = StoreApps[id];
    this.installed.add(id);
    this.save();
    return true;
  },

  uninstall(id) {
    if (!this.installed.has(id)) return false;
    this.installed.delete(id);
    this.save();
    // 关掉正在运行的窗口，否则应用没了窗口还开着
    (OS.wins || []).filter(w => w.appId === id).forEach(w => OS.closeWin(w.id));
    delete Apps[id];
    // 桌面图标也移掉
    OS.deskAppIds = OS.deskAppIds.filter(x => x !== id);
    if (OS.renderDeskIcons) OS.renderDeskIcons();
    if (OS.renderStartMenu) OS.renderStartMenu();
    return true;
  },
};

/* ============================================================
   商店应用本体
   ============================================================ */
Apps.store = {
  title: '应用商店', icon: '🛒',
  mount(el) {
    let cat = '全部';
    let kw = '';
    let detail = null;      // 正在看的应用 id
    let busy = null;        // 正在安装 / 卸载的 id

    el.innerHTML = `
      <div class="st">
        <div class="st__top">
          <div class="st__brand">
            <span class="st__logo">🛒</span>
            <div>
              <div class="st__t">应用商店</div>
              <div class="st__sub" id="stSub">为你的 WebOS 添点东西</div>
            </div>
          </div>
          <div class="st__search">
            <input id="stSearch" type="search" placeholder="搜索应用" autocomplete="off">
          </div>
        </div>
        <div class="st__body">
          <div class="st__side" id="stCats"></div>
          <div class="st__main" id="stMain"></div>
        </div>
      </div>`;

    const catsEl = el.querySelector('#stCats');
    const mainEl = el.querySelector('#stMain');
    const subEl = el.querySelector('#stSub');

    function renderCats() {
      catsEl.innerHTML = AppStore.CATS.map(c =>
        `<button class="st__cat ${c === cat ? 'on' : ''}" data-c="${c}">${c}</button>`).join('')
        + `<div class="st__cat-note" id="stNote"></div>`;
      catsEl.querySelectorAll('.st__cat').forEach(b =>
        b.addEventListener('click', () => { cat = b.dataset.c; detail = null; render(); }));
    }

    function visible() {
      return AppStore.CATALOG.filter(a => {
        const okCat = cat === '全部' || a.cat === cat;
        const okKw = !kw || (a.name + a.brief + a.desc + a.cat).toLowerCase().includes(kw.toLowerCase());
        return okCat && okKw;
      });
    }

    function renderList() {
      const list = visible();
      subEl.textContent = `共 ${AppStore.CATALOG.length} 款应用 · 已安装 ${AppStore.installed.size} 款`;
      const note = el.querySelector('#stNote');
      if (note) note.textContent = `${list.length} 个结果`;

      if (!list.length) {
        mainEl.innerHTML = `<div class="st__empty">没有找到匹配的应用</div>`;
        return;
      }
      mainEl.innerHTML = `<div class="st__grid">${list.map(a => {
        const on = AppStore.isInstalled(a.id);
        return `<div class="st__card" data-id="${a.id}">
          <div class="st__card-ico">${a.icon}</div>
          <div class="st__card-tx">
            <div class="st__card-nm">${a.name}
              ${on ? '<span class="st__tag">已安装</span>' : ''}
            </div>
            <div class="st__card-br">${a.brief}</div>
            <div class="st__card-meta">${a.cat} · ${a.ver} · ${a.size}</div>
          </div>
          <div class="st__card-act">
            <button class="btn-sm ${on ? '' : 'on'}" data-act="${on ? 'open' : 'install'}" data-id="${a.id}"
              ${busy === a.id ? 'disabled' : ''}>
              ${busy === a.id ? '处理中…' : (on ? '打开' : '安装')}
            </button>
            <button class="btn-sm st__more" data-act="detail" data-id="${a.id}">详情</button>
          </div>
        </div>`;
      }).join('')}</div>`;
      bindList();
    }

    function renderDetail() {
      const a = AppStore.CATALOG.find(x => x.id === detail);
      if (!a) { renderList(); return; }
      const on = AppStore.isInstalled(a.id);
      subEl.textContent = a.name;
      mainEl.innerHTML = `
        <div class="st__det">
          <button class="btn-sm" data-act="back">← 返回</button>
          <div class="st__det-hd">
            <div class="st__det-ico">${a.icon}</div>
            <div>
              <div class="st__det-nm">${a.name}${on ? '<span class="st__tag">已安装</span>' : ''}</div>
              <div class="st__det-by">${a.author} · ${a.cat}</div>
              <div class="st__det-meta">${a.ver} · ${a.size}</div>
              <div class="st__det-act">
                <button class="btn-sm ${on ? '' : 'on'}" data-act="${on ? 'open' : 'install'}"
                  ${busy === a.id ? 'disabled' : ''}>
                  ${busy === a.id ? '处理中…' : (on ? '打开' : '安装')}
                </button>
                ${on ? `<button class="btn-sm danger" data-act="uninstall">卸载</button>` : ''}
              </div>
            </div>
          </div>
          <div class="st__det-sec">
            <h4>简介</h4>
            <p>${a.brief}</p>
          </div>
          <div class="st__det-sec">
            <h4>详情</h4>
            <p>${a.desc.replace(/\n/g, '<br>')}</p>
          </div>
          <div class="st__det-sec">
            <h4>特性</h4>
            <ul>${a.feats.map(f => `<li>${f}</li>`).join('')}</ul>
          </div>
        </div>`;
      bindList();
    }

    function bindList() {
      mainEl.querySelectorAll('[data-act]').forEach(b =>
        b.addEventListener('click', () => {
          const act = b.dataset.act;
          const id = b.dataset.id || detail;
          if (act === 'detail') { detail = id; render(); return; }
          if (act === 'back') { detail = null; render(); return; }
          if (act === 'install') return doInstall(id);
          if (act === 'uninstall') return doUninstall(id);
          if (act === 'open') {
            OS.closeStart();
            OS.launch(id);
            render();
          }
        }));
      // 点卡片空白处（不是按钮）也进详情
      mainEl.querySelectorAll('.st__card').forEach(c =>
        c.addEventListener('click', (e) => {
          if (e.target.closest('[data-act]')) return;
          detail = c.dataset.id; render();
        }));
    }

    /* 装一个进度条，让"安装"这件事有实感 */
    function progress(id, label, done) {
      busy = id; render();
      const bar = document.createElement('div');
      bar.className = 'st__prog';
      bar.innerHTML = `<div class="st__prog-tx">${label}</div>
        <div class="st__prog-bar"><i></i></div>`;
      (el.querySelector('#stMain')).appendChild(bar);
      const fill = bar.querySelector('i');
      let p = 0;
      const iv = setInterval(() => {
        p = Math.min(100, p + 14 + Math.random() * 22);
        fill.style.width = p + '%';
        if (p >= 100) {
          clearInterval(iv);
          setTimeout(() => { bar.remove(); busy = null; done(); }, 180);
        }
      }, 110);
    }

    function doInstall(id) {
      if (!AppStore.install(id)) return;
      AppStore.install(id);
      // 装完自动放到桌面，不然用户会以为没装成功
      if (!OS.deskAppIds.includes(id)) {
        OS.deskAppIds.push(id);
        OS.renderDeskIcons();
      }
      OS.renderStartMenu();
      progress(id, '正在安装…', () => {
        render();
        if (OS.toast) OS.toast('安装完成');
      });
    }

    function doUninstall(id) {
      const a = AppStore.CATALOG.find(x => x.id === id);
      if (!confirm(`确定卸载「${a ? a.name : id}」？`)) return;
      AppStore.uninstall(id);
      progress(id, '正在卸载…', () => {
        render();
        if (OS.toast) OS.toast('已卸载');
      });
    }

    el.querySelector('#stSearch').addEventListener('input', (e) => {
      kw = e.target.value.trim(); detail = null; render();
    });

    function render() { renderCats(); detail ? renderDetail() : renderList(); }
    render();
  }
};
