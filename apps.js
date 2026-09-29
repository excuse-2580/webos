/* ============================================================
   WebOS · 应用实现
   每个应用一个 App 对象：{ mount(el, win) => void }
   ============================================================ */

const ICON = {
  folder: '📁', file: '📄', dirOpen: '📂',
  explorer: '🗂️', terminal: '💻', notepad: '📝',
  calculator: '🧮', settings: '⚙️', txt: '📄',
};

/* 根目录在两种形态下叫法不同：桌面说「此电脑」，手机说「这部手机」 */
const ROOT_NAME = () => (OS.mode === 'phone' ? '这部手机' : '此电脑');

const Apps = {

/* ==================== 文件管理器 ==================== */
explorer: {
  title: '文件管理器', icon: ICON.explorer,
  mount(el, win) {
    let cwd = '/';
    let sel = null;

    const SPECIAL = ['/', '/Documents', '/Pictures', '/System'];

    el.innerHTML = `
      <div class="fm">
        <div class="fm__side">
          <div class="fm__side-t">快速访问</div>
          <div id="fmQuick"></div>
          <div class="fm__side-t" style="margin-top:8px" data-root-label>此电脑</div>
        </div>
        <div class="fm__main">
          <div class="fm__bar">
            <button class="fm__btn" id="fmUp" title="向上">
              <svg viewBox="0 0 24 24"><path d="M12 8l6 6H6z"/></svg>向上
            </button>
            <button class="fm__btn" id="fmNew" title="新建文件夹">
              <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>新建
            </button>
            <div class="fm__path" id="fmPath"></div>
          </div>
          <div class="fm__list" id="fmList"></div>
          <div class="fm__status" id="fmStatus"></div>
        </div>
      </div>`;

    const quick = el.querySelector('#fmQuick');
    const pathEl = el.querySelector('#fmPath');
    const listEl = el.querySelector('#fmList');
    const statusEl = el.querySelector('#fmStatus');

    function renderQuick() {
      quick.innerHTML = SPECIAL.map(p => `
        <button class="fm__nav ${cwd === p ? 'on' : ''}" data-p="${p}">
          <svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
          ${p === '/' ? ROOT_NAME() : FS.basename(p)}
        </button>`).join('');
      quick.querySelectorAll('.fm__nav').forEach(b =>
        b.addEventListener('click', () => { cwd = b.dataset.p; sel = null; render(); }));
    }

    function render() {
      renderQuick();
      // 侧栏分组标题也跟着改
      const rl = el.querySelector('[data-root-label]');
      if (rl) rl.textContent = ROOT_NAME();

      pathEl.textContent = cwd === '/' ? ROOT_NAME() : cwd;
      const items = FS.list(cwd);
      if (!items.length) {
        listEl.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-3);font-size:13px">这个文件夹是空的</div>`;
      } else {
        listEl.innerHTML = `<div class="fm__grid">${items.map(n => `
          <div class="fm__item ${sel === n.name ? 'on' : ''}" data-n="${OS.esc(n.name)}" data-t="${n.type}">
            <div class="fm__item-ico">${n.type === 'dir' ? ICON.folder : ICON.file}</div>
            <div class="fm__item-nm">${OS.esc(n.name)}</div>
          </div>`).join('')}</div>`;

        listEl.querySelectorAll('.fm__item').forEach(d => {
          d.addEventListener('click', () => { sel = d.dataset.n; render(); });
          d.addEventListener('dblclick', () => {
            const name = d.dataset.n;
            const p = FS.join(FS.split(cwd).concat([name]));
            if (d.dataset.t === 'dir') { cwd = p; sel = null; render(); }
            else OS.openFile(p);
          });
        });
      }

      // 空白处点击取消选中；双击空白返回上级
      listEl.onclick = (e) => { if (e.target === listEl) { sel = null; render(); } };

      const c = FS.count(cwd);
      const sub = FS.list(cwd).length;
      statusEl.textContent = sel
        ? `已选中：${sel}`
        : `${sub} 个项目 · 共 ${c.dirs} 个文件夹 / ${c.files} 个文件`;
    }

    el.querySelector('#fmUp').addEventListener('click', () => {
      if (cwd !== '/') { cwd = FS.dirname(cwd) || '/'; sel = null; render(); }
    });
    el.querySelector('#fmNew').addEventListener('click', () => {
      const name = prompt('新建文件夹名称：', '新建文件夹');
      if (!name) return;
      const p = FS.join(FS.split(cwd).concat([name]));
      if (FS.mkdir(p)) { sel = name; render(); }
      else OS.toast('创建失败（可能已存在）');
    });

    render();
    // 供终端 open . 调用
    win.__fm = { go: (p) => { cwd = FS.resolve(cwd, p); sel = null; render(); } };
  }
},

/* ==================== 终端 ==================== */
terminal: {
  title: '终端', icon: ICON.terminal,
  mount(el, win) {
    let cwd = '/';
    el.innerHTML = `<div class="term" id="termBox">
      <div class="term__line term__dim">WebOS Terminal [版本 1.0.0]</div>
      <div class="term__line term__dim">(c) WebOS. 输入 help 查看可用命令。</div>
      <div class="term__line">&nbsp;</div>
      <div id="termOut"></div>
      <div class="term__in"><span class="term__p" id="termPS1">/ $</span><input id="termIn" autocomplete="off" spellcheck="false"></div>
    </div>`;

    const box = el.querySelector('#termBox');
    const out = el.querySelector('#termOut');
    const inp = el.querySelector('#termIn');
    const ps1 = el.querySelector('#termPS1');

    const print = (text, cls = '') => {
      const d = document.createElement('div');
      d.className = 'term__line ' + cls;
      d.textContent = text;
      out.appendChild(d);
      box.scrollTop = box.scrollHeight;
    };

    const CMDS = {
      help() {
        print('可用命令：');
        [['help', '显示本帮助'],
         ['ls [目录]', '列出内容'],
         ['cd <目录>', '切换目录（cd .. 返回上级）'],
         ['pwd', '显示当前路径'],
         ['cat <文件>', '查看文件内容'],
         ['echo <文本>', '输出文本'],
         ['mkdir <名称>', '创建文件夹'],
         ['touch <名称>', '创建空文件'],
         ['rm <名称>', '删除文件/文件夹'],
         ['mv <源> <目标>', '移动'],
         ['cp <源> <目标>', '复制'],
         ['write <文件> <内容>', '写入文件'],
         ['find <关键词>', '按名称搜索'],
         ['tree', '显示目录树'],
         ['stat', '统计文件数'],
         ['open <路径>', '用对应应用打开'],
         ['theme [dark|light]', '切换主题'],
         ['reset', '重置文件系统'],
         ['whoami', '显示当前用户'],
         ['date', '显示日期时间'],
         ['clear', '清屏'],
        ].forEach(([c, d]) => print('  ' + c.padEnd(22) + d, 'term__dim'));
      },
      ls(args) {
        const p = FS.resolve(cwd, args[0] || '.');
        const items = FS.list(p);
        if (!FS.isDir(p)) return print('ls: 不是目录: ' + args[0], 'term__err');
        if (!items.length) return print('（空目录）', 'term__dim');
        items.forEach(n => print(
          (n.type === 'dir' ? '[dir]  ' : '[file] ') + n.name,
          n.type === 'dir' ? '' : 'term__dim'));
      },
      cd(args) {
        if (!args[0]) return print('cd: 缺少参数', 'term__err');
        const p = FS.resolve(cwd, args[0]);
        if (!FS.isDir(p)) return print('cd: 无此目录: ' + args[0], 'term__err');
        cwd = p; ps1.textContent = (cwd === '/' ? '/' : cwd) + ' $';
      },
      pwd() { print(cwd); },
      cat(args) {
        if (!args[0]) return print('cat: 缺少参数', 'term__err');
        const p = FS.resolve(cwd, args[0]);
        const c = FS.read(p);
        if (c === null) return print('cat: 无此文件: ' + args[0], 'term__err');
        print(c);
      },
      echo(args) { print(args.join(' ')); },
      mkdir(args) {
        if (!args[0]) return print('mkdir: 缺少参数', 'term__err');
        const p = FS.resolve(cwd, args[0]);
        const ok = FS.mkdir(p);
        print(ok ? '已创建 ' + p : '创建失败（可能已存在）: ' + p, ok ? '' : 'term__err');
      },
      touch(args) {
        if (!args[0]) return print('touch: 缺少参数', 'term__err');
        const p = FS.touch(FS.resolve(cwd, args[0]), '');
        print(p ? '已创建 ' + p : '创建失败', p ? '' : 'term__err');
      },
      rm(args) {
        if (!args[0]) return print('rm: 缺少参数', 'term__err');
        const p = FS.resolve(cwd, args[0]);
        print(FS.rm(p) ? '已删除 ' + p : '删除失败: ' + p, 'term__dim');
      },
      mv(args) {
        if (args.length < 2) return print('用法: mv <源> <目标目录>', 'term__err');
        const s = FS.resolve(cwd, args[0]);
        const d = FS.resolve(cwd, args[1]);
        print(FS.move(s, d) ? `已移动 ${s} → ${d}` : '移动失败', 'term__dim');
      },
      cp(args) {
        if (args.length < 2) return print('用法: cp <源> <目标目录>', 'term__err');
        const s = FS.resolve(cwd, args[0]);
        const d = FS.resolve(cwd, args[1]);
        print(FS.copy(s, d) ? `已复制 ${s} → ${d}` : '复制失败', 'term__dim');
      },
      write(args) {
        if (args.length < 2) return print('用法: write <文件> <内容>', 'term__err');
        const p = FS.resolve(cwd, args[0]);
        const content = args.slice(1).join(' ');
        print(FS.write(p, content) ? '已写入 ' + p : '写入失败', 'term__dim');
      },
      find(args) {
        if (!args[0]) return print('find: 缺少关键词', 'term__err');
        const r = FS.findAll(args[0]);
        print(r.length ? r.join('\n') : '没有匹配项', r.length ? '' : 'term__dim');
      },
      tree() {
        const walk = (p, prefix) => {
          FS.list(p).forEach((n, i, arr) => {
            const last = i === arr.length - 1;
            const cp = FS.join(FS.split(p).concat([n.name]));
            print(prefix + (last ? '└─ ' : '├─ ') + n.name);
            if (n.type === 'dir') walk(cp, prefix + (last ? '   ' : '│  '));
          });
        };
        print(cwd);
        walk(cwd, '');
      },
      stat() {
        const c = FS.count('/');
        print(`根目录：${c.dirs} 个文件夹 / ${c.files} 个文件`);
      },
      open(args) {
        if (!args[0]) return print('open: 缺少参数', 'term__err');
        const p = FS.resolve(cwd, args[0]);
        if (FS.isDir(p)) { OS.launch('explorer'); print('已打开文件管理器：' + p); }
        else if (FS.isFile(p)) { OS.openFile(p); print('已打开：' + p); }
        else print('open: 无此路径: ' + args[0], 'term__err');
      },
      theme(args) {
        const t = args[0];
        OS.setTheme(t === 'dark' ? 'dark' : t === 'light' ? 'light' : null);
        print('主题已切换为 ' + document.documentElement.getAttribute('data-theme'));
      },
      reset() { FS.reset(); print('文件系统已重置'); },
      whoami() { print('user'); },
      date() { print(new Date().toLocaleString('zh-CN')); },
      clear() { out.innerHTML = ''; },
    };

    function run(line) {
      const trimmed = line.trim();
      if (!trimmed) return;
      print((cwd === '/' ? '/' : cwd) + ' $ ' + trimmed);
      // 简单分词，支持双引号包裹的空格
      const tokens = trimmed.match(/"[^"]*"|\S+/g) || [];
      const cmd = tokens[0];
      const args = tokens.slice(1).map(t => t.replace(/^"|"$/g, ''));
      if (CMDS[cmd]) {
        try { CMDS[cmd](args); }
        catch (e) { print('执行出错: ' + e.message, 'term__err'); }
      } else {
        print(`'${cmd}' 不是可识别的命令。输入 help 查看可用命令。`, 'term__err');
      }
    }

    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        run(inp.value);
        inp.value = '';
        box.scrollTop = box.scrollHeight;
      } else if (e.key === 'Tab') {
        // Tab 补全：补全当前目录下的文件名
        e.preventDefault();
        const v = inp.value;
        const parts = v.split(/\s+/);
        const frag = parts[parts.length - 1];
        const hits = FS.list(cwd).map(n => n.name).filter(n => n.startsWith(frag));
        if (hits.length === 1) {
          parts[parts.length - 1] = hits[0];
          inp.value = parts.join(' ');
        } else if (hits.length > 1) {
          print(hits.join('  '), 'term__dim');
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
      }
    });

    box.addEventListener('click', (e) => {
      if (e.target === box || e.target === out) inp.focus();
    });
    setTimeout(() => inp.focus(), 60);
  }
},

/* ==================== 记事本 ==================== */
notepad: {
  title: '记事本', icon: ICON.notepad,
  mount(el, win) {
    const path = win.__file || null;
    const content = path ? (FS.read(path) || '') : '';
    el.innerHTML = `
      <div class="np">
        <div class="np__bar">
          <button id="npSave">保存</button>
          <button id="npSaveAs">另存为</button>
          <span class="sp"></span>
          <span class="saved" id="npTips">${path ? path : '未保存'}</span>
        </div>
        <textarea class="np__area" id="npArea" spellcheck="false">${OS.esc(content)}</textarea>
      </div>`;

    const area = el.querySelector('#npArea');
    const tips = el.querySelector('#npTips');
    let curPath = path;

    const doSave = (ask) => {
      let p = curPath;
      if (!p || ask) {
        const input = prompt('保存为（路径）：', p || '/Documents/未命名.txt');
        if (!input) return;
        p = FS.resolve('/', input);
      }
      if (FS.write(p, area.value)) {
        curPath = p;
        tips.textContent = '已保存 ' + p;
        OS.toast('已保存到 ' + p);
        if (win.__title) win.__title(p);
        setTimeout(() => { if (tips.textContent.startsWith('已保存')) tips.textContent = p; }, 2000);
      } else {
        tips.textContent = '保存失败';
        OS.toast('保存失败');
      }
    };

    el.querySelector('#npSave').addEventListener('click', () => doSave(false));
    el.querySelector('#npSaveAs').addEventListener('click', () => doSave(true));

    area.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        doSave(false);
      }
    });
    setTimeout(() => area.focus(), 60);
  }
},

/* ==================== 计算器 ==================== */
calculator: {
  title: '计算器', icon: ICON.calculator,
  mount(el) {
    el.innerHTML = `
      <div style="padding:12px;display:flex;flex-direction:column;gap:10px;height:100%">
        <div id="calDisp" style="text-align:right;font-size:30px;font-weight:300;padding:14px 8px;background:var(--surface);border-radius:8px;min-height:64px;overflow:hidden;text-overflow:ellipsis">0</div>
        <div id="calKeys" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;flex:1"></div>
      </div>`;
    const disp = el.querySelector('#calDisp');
    const keys = el.querySelector('#calKeys');
    const KEYS = ['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '⌫', '='];
    let expr = '';

    function render() { disp.textContent = expr || '0'; }
    function calc() {
      if (!expr) return;
      try {
        // 只允许数字与运算符，避免任意代码执行
        if (!/^[0-9+\-*/().\s]+$/.test(expr)) throw new Error('含非法字符');
        const r = Function('"use strict";return (' + expr + ')')();
        if (!isFinite(r)) throw new Error('结果无效');
        expr = String(Math.round(r * 1e10) / 1e10);
      } catch (e) {
        disp.textContent = '错误';
        expr = '';
        setTimeout(render, 900);
        return;
      }
      render();
    }
    KEYS.forEach(k => {
      const b = document.createElement('button');
      b.textContent = k;
      b.style.cssText = `height:100%;min-height:38px;border-radius:6px;font-size:15px;background:var(--surface-3);transition:background .12s`;
      if (k === '=') b.style.background = 'var(--accent)', b.style.color = '#fff';
      if ('/*-+'.includes(k)) b.style.fontWeight = '600';
      b.addEventListener('mouseenter', () => b.style.filter = 'brightness(1.12)');
      b.addEventListener('mouseleave', () => b.style.filter = '');
      b.addEventListener('click', () => {
        if (k === 'C') expr = '';
        else if (k === '⌫') expr = expr.slice(0, -1);
        else if (k === '=') return calc();
        else expr += k;
        render();
      });
      keys.appendChild(b);
    });
  }
},

/* ==================== 设置 ==================== */
settings: {
  title: '设置', icon: ICON.settings,
  mount(el) {
    el.innerHTML = `
      <div style="padding:16px;display:flex;flex-direction:column;gap:14px;overflow:auto;height:100%">
        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:8px">个性化 · 主题</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap" id="setTheme"></div>
        </div>
        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:8px">个性化 · 强调色</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap" id="setAccent"></div>
        </div>
        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:8px">系统 · 存储</div>
          <div style="font-size:12px;color:var(--text-2);margin-bottom:8px" id="setStat"></div>
          <button id="setReset" style="padding:8px 16px;border-radius:6px;background:var(--surface-3);font-size:13px">重置文件系统</button>
        </div>
        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:8px">系统 · 形态</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button id="setModeDesk" style="padding:8px 16px;border-radius:6px;background:var(--surface-3);font-size:13px">🖥️ 桌面形态</button>
            <button id="setModePh" style="padding:8px 16px;border-radius:6px;background:var(--surface-3);font-size:13px">📱 手机形态</button>
          </div>
          <div style="font-size:11px;color:var(--text-3);margin-top:6px">
            手机形态是同一套应用的另一层壳：状态栏、主屏网格、Dock、卡片式多任务。
            切换不会丢数据。
          </div>
        </div>
        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:6px">关于</div>
          <div style="font-size:12px;color:var(--text-2);line-height:1.9">
            WebOS 1.2.0<br>纯前端实现，零依赖零构建。<br>数据保存在浏览器 localStorage 中。
          </div>
        </div>
      </div>`;

    const themes = [['light', '浅色'], ['dark', '深色']];
    const tBox = el.querySelector('#setTheme');
    themes.forEach(([v, n]) => {
      const b = document.createElement('button');
      b.textContent = n;
      b.style.cssText = 'padding:8px 18px;border-radius:6px;background:var(--surface-3);font-size:13px';
      b.addEventListener('click', () => { OS.setTheme(v); sync(); });
      b.dataset.v = v;
      tBox.appendChild(b);
    });

    const accents = ['#0078D4', '#00A98F', '#D83B01', '#8A2BE2', '#E81123', '#498205'];
    const aBox = el.querySelector('#setAccent');
    accents.forEach(c => {
      const b = document.createElement('button');
      b.style.cssText = `width:32px;height:32px;border-radius:50%;background:${c}`;
      b.addEventListener('click', () => { OS.setAccent(c); });
      aBox.appendChild(b);
    });

    function sync() {
      const cur = document.documentElement.getAttribute('data-theme');
      tBox.querySelectorAll('button').forEach(b => {
        b.style.background = b.dataset.v === cur ? 'var(--accent)' : 'var(--surface-3)';
        b.style.color = b.dataset.v === cur ? '#fff' : '';
      });
      const c = FS.count('/');
      el.querySelector('#setStat').textContent = `共 ${c.dirs} 个文件夹 / ${c.files} 个文件`;
    }
    el.querySelector('#setReset').addEventListener('click', () => {
      if (confirm('确定重置文件系统？所有改动都会丢失。')) { FS.reset(); sync(); OS.toast('文件系统已重置'); }
    });
    el.querySelector('#setModeDesk').addEventListener('click', () => {
      if (OS.mode === 'desktop') return; OS.switchMode('desktop');
    });
    el.querySelector('#setModePh').addEventListener('click', () => {
      if (OS.mode === 'phone') return; OS.switchMode('phone');
    });
    sync();
  }
},

};
