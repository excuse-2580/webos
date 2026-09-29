/* ============================================================
   WebOS · AI 助理
   ------------------------------------------------------------
   两层能力：
     1. 本地意图（永远可用，不联网）—— 开应用、找文件、切主题、
        看时间、算数、查系统、建目录…
     2. 云端大模型（可选）—— 填了 API Key 才走，兼容 OpenAI 格式
        （DeepSeek / Kimi / 智谱 / 硅基流动 / OpenAI 都行）

   没配 Key 时它就是个命令型助理，不会装作很聪明。
   ============================================================ */

const Assistant = {
  KEY: 'webos.assistant.cfg.v1',
  HIST: 'webos.assistant.hist.v1',
  cfg: { base: '', key: '', model: '', sys: '' },

  load() {
    try { Object.assign(this.cfg, JSON.parse(localStorage.getItem(this.KEY)) || {}); }
    catch (e) { /* 坏了就用默认 */ }
    return this.cfg;
  },
  save(c) {
    Object.assign(this.cfg, c);
    try { localStorage.setItem(this.KEY, JSON.stringify(this.cfg)); } catch (e) {}
  },
  ready() { return !!(this.cfg.base && this.cfg.key && this.cfg.model); },

  /* ---------- 历史 ---------- */
  loadHist() {
    try { return JSON.parse(localStorage.getItem(this.HIST)) || []; } catch (e) { return []; }
  },
  pushHist(role, text) {
    const h = this.loadHist();
    h.push({ role, text, t: Date.now() });
    try { localStorage.setItem(this.HIST, JSON.stringify(h.slice(-60))); } catch (e) {}
  },
  clearHist() { try { localStorage.removeItem(this.HIST); } catch (e) {} },

  /* ============================================================
     本地意图
     返回 null 表示没识别出来，交给云端或兜底
     ============================================================ */
  local(q) {
    const s = String(q || '').trim();
    if (!s) return null;
    const low = s.toLowerCase();

    /* ---- 打开应用 ---- */
    let m = s.match(/(?:打开|启动|运行|打开一下|给我打开)\s*(.+?)(?:应用|软件|app)?$/i);
    if (m) {
      const name = m[1].trim();
      const hit = this.findApp(name);
      if (hit) {
        return {
          text: `正在打开「${hit.title}」`,
          // 开完就收起面板，否则助理挡着看不见应用
          closeAfter: true,
          act: () => { OS.mode === 'phone' ? Phone.open(hit.id) : OS.launch(hit.id); },
        };
      }
      return { text: `没找到叫「${name}」的应用。已装的：${this.appNames().join('、')}` };
    }

    /* ---- 搜索文件 ---- */
    m = s.match(/(?:搜索|查找|找一下|找|搜)\s*(.+?)(?:文件|在哪里|在哪)?$/i);
    if (m) {
      const kw = m[1].trim();
      if (kw.length >= 1 && !/应用|软件/.test(kw)) {
        const hits = this.searchFiles(kw);
        if (!hits.length) return { text: `没有名字含「${kw}」的文件。` };
        // 只列结果，不擅自开文件管理器——用户可能只是想知道在哪
        return {
          text: `找到 ${hits.length} 个：\n` + hits.slice(0, 12).map(p => '· ' + p).join('\n')
            + (hits.length > 12 ? `\n…还有 ${hits.length - 12} 个` : ''),
        };
      }
    }

    /* ---- 主题 ---- */
    if (/深色|暗色|夜间|黑暗模式|dark/i.test(low)) {
      return { text: '已切换到深色', act: () => OS.setTheme('dark') };
    }
    if (/浅色|亮色|日间|白天|light/i.test(low)) {
      return { text: '已切换到浅色', act: () => OS.setTheme('light') };
    }
    if (/换.*主题|切.*主题|主题色|换个颜色/i.test(s)) {
      const C = ['#0078D4', '#0B7D3E', '#C42B1C', '#8E4EC6', '#F5A623', '#00B4D8'];
      const c = C[Math.floor(Math.random() * C.length)];
      return { text: '换了个主题色', act: () => OS.setAccent(c) };
    }

    /* ---- 形态 ---- */
    if (/桌面模式|切到桌面|电脑模式|切成桌面/i.test(s)) {
      return { text: '切到桌面形态', act: () => OS.switchMode('desktop') };
    }
    if (/手机模式|切到手机|掌上模式/i.test(s)) {
      return { text: '切到手机形态', act: () => OS.switchMode('phone') };
    }

    /* ---- 时间日期 ----
       匹配要收紧：裸的「今天」「时间」会误伤「今天股市怎么样」「时间管理」这类句子，
       那类应该走云端或兜底，而不是被当成问时间。 */
    if (/^(现在)?(几点了?|什么时间|现在多少(点|分)?|几点的?)$|^(现在)?几点/.test(s)
      || /现在什么时间|现在几点|现在时间/.test(s)) {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      return { text: `现在是 ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}` };
    }
    if (/^(今天|现在)?(几号|什么日期|日期是多少|星期几|周几)/.test(s)
      || /几号|什么日期|星期几|周几/.test(s)) {
      const d = new Date();
      return { text: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${'日一二三四五六'[d.getDay()]}` };
    }

    /* ---- 应用清单 ---- */
    if (/有什么应用|有哪些应用|应用列表|装了什么|列出应用|能打开什么/i.test(s)) {
      const on = Object.keys(Apps);
      return { text: `已装 ${on.length} 个：\n` + on.map(id => '· ' + Apps[id].icon + ' ' + Apps[id].title).join('\n') };
    }

    /* ---- 系统信息 ---- */
    if (/系统信息|配置|性能|内存|cpu|显卡|屏幕|我的设备/i.test(s)) {
      const s2 = screen, n = navigator;
      return {
        text: [
          `屏幕 ${s2.width}×${s2.height}（可用 ${s2.availWidth}×${s2.availHeight}）`,
          `CPU 核心 ${n.hardwareConcurrency || '未知'}`,
          `语言 ${n.language} · 时区 ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
          `网络 ${n.onLine ? '在线' : '离线'}`,
          `已装应用 ${Object.keys(Apps).length} 个`,
        ].join('\n'),
      };
    }

    /* ---- 存储 ---- */
    if (/存储|占用|空间|多大|容量/i.test(s)) {
      const c = FS.count ? FS.count('/') : null;
      const kb = ((localStorage.getItem('webos.fs.v1') || '').length / 1024).toFixed(1);
      return {
        text: c
          ? `文件 ${c.files} 个 / 文件夹 ${c.dirs} 个\n占用约 ${kb} KB（localStorage 上限一般 5 MB）`
          : `占用约 ${kb} KB`,
      };
    }

    /* ---- 新建文件夹 ---- */
    m = s.match(/(?:新建|创建|建个?)\s*(?:文件夹|目录)?\s*(?:叫|名为|名字是)?\s*([^\s]+)/);
    if (m && /文件夹|目录|新建|创建|建个/.test(s)) {
      const name = m[1].trim();
      const path = '/Documents/' + name;
      try {
        FS.mkdir(path);
        return { text: `已在 /Documents 下建好「${name}」` };
      } catch (e) {
        return { text: `建不了：${e.message || '未知原因'}` };
      }
    }

    /* ---- 算数 ---- */
    const expr = s.replace(/^(算|计算|算一下|等于|求)?\s*/, '').replace(/[?？]$/, '').trim();
    if (/^[\d\s+\-*/().%]+$/.test(expr) && /[+\-*/]/.test(expr)) {
      const v = this.calc(expr);
      if (v != null) return { text: `${expr} = ${this.fmtNum(v)}` };
    }

    /* ---- 清空对话 ---- */
    if (/清空对话|清除记录|清空记录|清屏/i.test(s)) {
      return { text: '对话记录已清空', act: () => this.clearHist() };
    }

    /* ---- 帮助 ---- */
    if (/帮助|能做什么|会什么|你能干嘛|怎么用|help/i.test(low)) {
      return { text: this.helpText() };
    }

    return null;
  },

  helpText() {
    return [
      '我能做这些（本地，不用联网）：',
      '',
      '· 打开应用 ——「打开扫雷」',
      '· 找文件 ——「找 画作」',
      '· 切主题 ——「深色」「浅色」「换个主题色」',
      '· 切形态 ——「桌面模式」「手机模式」',
      '· 看时间 ——「几点了」「今天几号」',
      '· 算数 ——「128 * 4」',
      '· 查系统 ——「系统信息」「存储占用」',
      '· 建目录 ——「新建文件夹 测试」',
      '· 列应用 ——「有什么应用」',
      '',
      this.ready()
        ? '另外已连上云端模型，其他问题我也会试着回答。'
        : '想让我聊别的，可以在「设置」里填一下模型 API（兼容 OpenAI 格式）。',
    ].join('\n');
  },

  /* ---------- 工具 ---------- */
  findApp(name) {
    const n = String(name).trim().toLowerCase();
    const ids = Object.keys(Apps);
    // 精确
    let id = ids.find(x => Apps[x].title === name);
    if (id) return { id, title: Apps[id].title };
    // 包含
    id = ids.find(x => Apps[x].title.toLowerCase().includes(n));
    if (id) return { id, title: Apps[id].title };
    // 反向包含：「扫雷」在「打开扫雷」里
    id = ids.find(x => n.includes(Apps[x].title.toLowerCase()));
    if (id) return { id, title: Apps[id].title };
    // id 直接匹配
    id = ids.find(x => x.toLowerCase() === n || x.toLowerCase().includes(n));
    if (id) return { id, title: Apps[id].title };
    return null;
  },
  appNames() { return Object.keys(Apps).map(id => Apps[id].title); },

  searchFiles(kw) {
    const out = [];
    const walk = (node, path) => {
      if (!node || out.length > 60) return;
      if (node.type === 'file') {
        if (node.name.toLowerCase().includes(kw.toLowerCase())) out.push(path);
      } else {
        (node.children || []).forEach(c => walk(c, path === '/' ? '/' + c.name : path + '/' + c.name));
      }
    };
    (FS.root.children || []).forEach(c => walk(c, '/' + c.name));
    return out;
  },

  /* 四则运算：不用 eval，手写递归下降 */
  calc(str) {
    let i = 0;
    const skip = () => { while (i < str.length && /\s/.test(str[i])) i++; };
    const num = () => {
      skip();
      let v = '';
      while (i < str.length && /[\d.]/.test(str[i])) { v += str[i]; i++; }
      if (!v) return null;
      return parseFloat(v);
    };
    const factor = () => {
      skip();
      if (str[i] === '(') { i++; const v = expr(); skip(); if (str[i] === ')') i++; return v; }
      if (str[i] === '-') { i++; return -(factor() ?? 0); }
      if (str[i] === '+') { i++; return factor(); }
      return num();
    };
    const term = () => {
      let v = factor();
      while (v != null) {
        skip();
        const op = str[i];
        if (op === '*' || op === '/' || op === '%') {
          i++; const r = factor();
          if (r == null) return null;
          if (op === '*') v *= r; else if (op === '/') { if (r === 0) return null; v /= r; } else v %= r;
        } else break;
      }
      return v;
    };
    const expr = () => {
      let v = term();
      while (v != null) {
        skip();
        const op = str[i];
        if (op === '+' || op === '-') {
          i++; const r = term();
          if (r == null) return null;
          v = op === '+' ? v + r : v - r;
        } else break;
      }
      return v;
    };
    const r = expr();
    skip();
    if (r == null || i < str.length) return null;   // 有剩余字符说明没解析完
    return r;
  },
  fmtNum(v) {
    if (!isFinite(v)) return String(v);
    // 浮点误差：0.1+0.2=0.30000000000000004
    const r = Math.round(v * 1e10) / 1e10;
    return String(r);
  },

  /* ============================================================
     云端（可选）
     ============================================================ */
  async cloud(q, onToken) {
    if (!this.ready()) return null;
    const base = String(this.cfg.base).replace(/\/+$/, '');
    const url = base + '/chat/completions';
    const sys = this.cfg.sys || '你是 WebOS 的智能助理，简洁回答，中文优先。';
    const hist = this.loadHist().slice(-8);

    const body = {
      model: this.cfg.model,
      messages: [
        { role: 'system', content: sys },
        ...hist.map(h => ({ role: h.role === 'me' ? 'user' : 'assistant', content: h.text })),
        { role: 'user', content: q },
      ],
      stream: true,
    };

    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.cfg.key,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      // 浏览器直连被 CORS 拦是最常见的情况，fetch 会抛而不是返回响应
      return {
        err: '连不上：' + (e.message || '网络错误')
          + '\n大概率是这个接口不允许浏览器直连（跨域拦截）。'
          + '\n可以换支持跨域的供应商（硅基流动、OpenAI 通常可以），'
          + '或自己搭一层转发。\n本地能力不受影响。',
      };
    }

    if (!resp.ok) {
      let d = '';
      try { d = await resp.text(); } catch (e) {}
      if (resp.status === 401 || resp.status === 403) {
        return { err: `接口返回 ${resp.status}：密钥被拒。检查 Key 是否填对、是否过期。` };
      }
      return { err: `接口返回 ${resp.status}：${d.slice(0, 200)}` };
    }

    if (!resp.body) return { err: '这个接口不支持流式返回' };

    // 读 SSE
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const ln of lines) {
          const t = ln.trim();
          if (!t.startsWith('data:')) continue;
          const d = t.slice(5).trim();
          if (d === '[DONE]') break;
          try {
            const j = JSON.parse(d);
            const c = j.choices && j.choices[0] && (j.choices[0].delta || {}).content;
            if (c) { full += c; onToken && onToken(c); }
          } catch (e) { /* 单行解析失败就跳过 */ }
        }
      }
    } catch (e) {
      return full ? { text: full } : { err: '读取中断：' + (e.message || '') };
    }
    return full ? { text: full } : { err: '接口没返回内容' };
  },
};

/* ============================================================
   助理应用本体（桌面形态用窗口打开，手机形态长按 Home 呼出半屏面板）
   ============================================================ */
Apps.assistant = {
  title: 'AI 助理', icon: '✨',
  mount(el) {
    Assistant.load();

    el.innerHTML = `
      <div class="as">
        <div class="as__hd">
          <span class="as__logo">✨</span>
          <div class="as__hd-tx">
            <div class="as__t">AI 助理</div>
            <div class="as__sub" data-r="sub">本地能力已就绪</div>
          </div>
          <button class="as__cfg" data-r="cfg" title="设置模型">⚙️</button>
        </div>

        <div class="as__body" data-r="body"></div>

        <div class="as__chips" data-r="chips">
          <button data-q="打开扫雷">打开扫雷</button>
          <button data-q="有什么应用">有什么应用</button>
          <button data-q="几点了">几点了</button>
          <button data-q="系统信息">系统信息</button>
          <button data-q="128 * 4">128 * 4</button>
          <button data-q="帮助">能做什么</button>
        </div>

        <div class="as__in">
          <input data-r="input" type="text" placeholder="问点什么，或说「打开扫雷」" autocomplete="off">
          <button data-r="send" title="发送">
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>

        <div class="as__cfgp" data-r="cfgp" hidden>
          <div class="as__cfg-row">
            <label>接口地址</label>
            <input data-r="base" placeholder="https://api.deepseek.com/v1">
          </div>
          <div class="as__cfg-row">
            <label>模型名</label>
            <input data-r="model" placeholder="deepseek-chat">
          </div>
          <div class="as__cfg-row">
            <label>API Key</label>
            <input data-r="key" type="password" placeholder="sk-...">
          </div>
          <div class="as__cfg-row">
            <label>系统提示</label>
            <input data-r="sys" placeholder="可留空">
          </div>
          <div class="as__cfg-act">
            <button class="btn-sm on" data-r="save">保存</button>
            <button class="btn-sm" data-r="test">测试连接</button>
            <button class="btn-sm danger" data-r="clear">清除</button>
          </div>
          <div class="as__cfg-tip" data-r="tip">
            填了就能聊别的。兼容 OpenAI 格式：DeepSeek / Kimi / 智谱 / 硅基流动 / OpenAI 都行。
            <b>密钥只存在你这台设备的浏览器里，不会上传。</b>
            <b>注意：这是纯前端页面，浏览器直连可能被对方的跨域策略拦截</b>——
            各家策略不同，硅基流动、OpenAI 一般可以，DeepSeek 会拦。
            失败时会明确提示，本地能力不受影响。
          </div>
          <div class="as__presets" data-r="presets">
            <button data-b="https://api.deepseek.com/v1" data-m="deepseek-chat">DeepSeek</button>
            <button data-b="https://api.moonshot.cn/v1" data-m="moonshot-v1-8k">Kimi</button>
            <button data-b="https://open.bigmodel.cn/api/paas/v4" data-m="glm-4-flash">智谱</button>
            <button data-b="https://api.siliconflow.cn/v1" data-m="Qwen/Qwen2.5-7B-Instruct">硅基流动</button>
            <button data-b="https://api.openai.com/v1" data-m="gpt-4o-mini">OpenAI</button>
          </div>
        </div>
      </div>`;

    const body = el.querySelector('[data-r="body"]');
    const input = el.querySelector('[data-r="input"]');
    const sub = el.querySelector('[data-r="sub"]');
    const cfgP = el.querySelector('[data-r="cfgp"]');
    const cfTip = el.querySelector('[data-r="tip"]');

    const syncSub = () => {
      sub.textContent = Assistant.ready()
        ? `云端已连：${Assistant.cfg.model}`
        : '本地能力已就绪 · 填 Key 可解锁聊天';
      sub.classList.toggle('on', Assistant.ready());
    };

    const bubble = (who, text) => {
      const d = document.createElement('div');
      d.className = 'as__msg ' + who;
      d.innerHTML = `<div class="as__bub">${this.fmt(text)}</div>`;
      body.appendChild(d);
      body.scrollTop = body.scrollHeight;
      return d;
    };

    const fmt = (s) => String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    // 开场白
    if (!body.children.length) {
      bubble('ai', '嗨，我是 WebOS 助理。\n可以直接说「打开扫雷」「找 画作」「几点了」，或者问「能做什么」。');
    }

    let busy = false;

    async function send() {
      const q = input.value.trim();
      if (!q || busy) return;
      input.value = '';
      bubble('me', q);
      Assistant.pushHist('me', q);

      // 先试本地
      const r = Assistant.local(q);
      if (r) {
        bubble('ai', r.text);
        Assistant.pushHist('ai', r.text);
        if (r.act) {
          setTimeout(() => {
            r.act();
            // 手机形态下，需要让用户看到结果的动作才收起面板
            if (r.closeAfter && OS.mode === 'phone' && Phone.closeAssistant) Phone.closeAssistant();
          }, 320);
        }
        return;
      }

      // 本地没命中 → 云端
      if (!Assistant.ready()) {
        const t = '这个我没听懂。\n我能做的：打开应用、找文件、切主题、看时间、算数、查系统。\n说「能做什么」看完整列表。';
        bubble('ai', t);
        Assistant.pushHist('ai', t);
        return;
      }

      busy = true;
      const d = bubble('ai', '');
      const bub = d.querySelector('.as__bub');
      bub.classList.add('typing');
      let acc = '';
      const t0 = Date.now();
      const spin = setInterval(() => {
        bub.textContent = '思考中' + '.'.repeat((Math.floor((Date.now() - t0) / 350) % 3) + 1);
      }, 200);

      const res = await Assistant.cloud(q, (tok) => {
        if (!acc) { clearInterval(spin); bub.classList.remove('typing'); bub.innerHTML = ''; }
        acc += tok;
        bub.innerHTML = fmt(acc);
        body.scrollTop = body.scrollHeight;
      });

      clearInterval(spin);
      bub.classList.remove('typing');
      const out = res && res.err ? res.err : (acc || (res && res.text) || '（没有返回内容）');
      bub.innerHTML = fmt(out);
      body.scrollTop = body.scrollHeight;
      Assistant.pushHist('ai', out);
      busy = false;
    }

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    el.querySelector('[data-r="send"]').addEventListener('click', send);
    el.querySelectorAll('[data-r="chips"] button').forEach(b =>
      b.addEventListener('click', () => { input.value = b.dataset.q; send(); }));

    // 设置面板
    el.querySelector('[data-r="cfg"]').addEventListener('click', () => {
      cfgP.hidden = !cfgP.hidden;
      if (!cfgP.hidden) {
        el.querySelector('[data-r="base"]').value = Assistant.cfg.base || '';
        el.querySelector('[data-r="model"]').value = Assistant.cfg.model || '';
        el.querySelector('[data-r="key"]').value = Assistant.cfg.key || '';
        el.querySelector('[data-r="sys"]').value = Assistant.cfg.sys || '';
      }
    });

    el.querySelector('[data-r="save"]').addEventListener('click', () => {
      Assistant.save({
        base: el.querySelector('[data-r="base"]').value.trim(),
        model: el.querySelector('[data-r="model"]').value.trim(),
        key: el.querySelector('[data-r="key"]').value.trim(),
        sys: el.querySelector('[data-r="sys"]').value.trim(),
      });
      syncSub();
      cfTip.textContent = '已保存到本机。';
      cfTip.className = 'as__cfg-tip ok';
      cfgP.hidden = true;
      bubble('ai', Assistant.ready() ? '配置已保存，现在可以聊别的了。' : '已清除云端配置，只用本地能力。');
    });

    el.querySelector('[data-r="clear"]').addEventListener('click', () => {
      Assistant.save({ base: '', model: '', key: '', sys: '' });
      ['base','model','key','sys'].forEach(r => { const i = el.querySelector(`[data-r="${r}"]`); if (i) i.value = ''; });
      syncSub();
      bubble('ai', '已清除云端配置。本地能力不受影响。');
    });

    el.querySelector('[data-r="test"]').addEventListener('click', async () => {
      if (!Assistant.ready()) { cfTip.textContent = '先填完整再测。'; cfTip.className = 'as__cfg-tip warn'; return; }
      cfTip.textContent = '正在连接…';
      cfTip.className = 'as__cfg-tip';
      const res = await Assistant.cloud('只回复两个字：收到', null);
      cfTip.textContent = (res && res.err) ? ('失败：' + res.err) : ('成功：' + (res && res.text || '已连通').slice(0, 60));
      cfTip.className = 'as__cfg-tip ' + ((res && res.err) ? 'warn' : 'ok');
    });

    el.querySelectorAll('[data-r="presets"] button').forEach(b =>
      b.addEventListener('click', () => {
        el.querySelector('[data-r="base"]').value = b.dataset.b;
        el.querySelector('[data-r="model"]').value = b.dataset.m;
        el.querySelector('[data-r="key"]').focus();
      }));

    syncSub();
    input.focus();
  },

  fmt(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  },
};
