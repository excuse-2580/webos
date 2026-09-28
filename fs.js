/* ============================================================
   WebOS · 虚拟文件系统
   一棵内存里的目录树，可持久化到 localStorage
   ============================================================ */

const FS_KEY = 'webos.fs.v1';

const FS = {
  root: null,

  /* ---------- 初始文件树 ---------- */
  seed() {
    return {
      type: 'dir', name: '/', children: [
        {
          type: 'dir', name: 'Documents', children: [
            { type: 'file', name: '欢迎.txt', content: '欢迎使用 WebOS！\n\n这是一个跑在浏览器里的网页操作系统。\n\n试试这些：\n  · 双击桌面图标打开应用\n  · 终端里输入 help 看看能做什么\n  · 记事本写点东西，Ctrl+S 保存\n  · 右下角可以切换深色/浅色主题\n\n所有文件都存在浏览器的 localStorage 里，刷新不会丢。\n' },
            { type: 'file', name: '待办.txt', content: '今天要做：\n[ ] 探索文件管理器\n[ ] 在终端敲几个命令\n[ ] 换个壁纸\n' },
          ]
        },
        {
          type: 'dir', name: 'Pictures', children: [
            { type: 'file', name: '说明.txt', content: '这里可以放图片链接。\n（本项目不引入外链图片，避免加载失败）\n' },
          ]
        },
        {
          type: 'dir', name: 'System', children: [
            { type: 'file', name: 'version.txt', content: 'WebOS 1.0.0\n内核：Browser\n架构：HTML + CSS + JavaScript\n' },
            { type: 'file', name: 'README.md', content: '# WebOS\n\n一个纯前端的网页操作系统，Windows 11 风格。\n\n## 已装应用\n\n- 文件管理器\n- 终端\n- 记事本\n- 计算器\n- 设置\n\n## 技术\n\n零依赖、零构建。数据存在 localStorage。\n' },
          ]
        },
        { type: 'file', name: 'readme.txt', content: 'WebOS —— 网页操作系统\n\n双击桌面图标开始。\n' },
      ]
    };
  },

  /* ---------- 持久化 ---------- */
  load() {
    try {
      const raw = localStorage.getItem(FS_KEY);
      if (raw) { this.root = JSON.parse(raw); return; }
    } catch (e) { /* 数据损坏则重建 */ }
    this.root = this.seed();
    this.save();
  },
  save() {
    try { localStorage.setItem(FS_KEY, JSON.stringify(this.root)); }
    catch (e) { /* 配额满则静默失败，不影响使用 */ }
  },
  reset() { this.root = this.seed(); this.save(); },

  /* ---------- 路径工具 ---------- */
  split(p) {
    return String(p || '/').split('/').filter(Boolean);
  },
  join(parts) {
    return '/' + parts.join('/');
  },
  normalize(p) {
    const out = [];
    for (const seg of this.split(p)) {
      if (seg === '.') continue;
      if (seg === '..') out.pop();
      else out.push(seg);
    }
    return this.join(out);
  },
  /* 把可能是相对的路径解析成绝对路径 */
  resolve(cwd, p) {
    if (!p) return cwd;
    if (p.startsWith('/')) return this.normalize(p);
    return this.normalize(this.join(this.split(cwd).concat(this.split(p))));
  },
  basename(p) {
    const s = this.split(p);
    return s.length ? s[s.length - 1] : '/';
  },
  dirname(p) {
    const s = this.split(p);
    s.pop();
    return this.join(s);
  },

  /* ---------- 查找 ---------- */
  get(path) {
    if (path === '/' || path === '') return this.root;
    let cur = this.root;
    for (const seg of this.split(path)) {
      if (cur.type !== 'dir') return null;
      const nxt = cur.children.find(c => c.name === seg);
      if (!nxt) return null;
      cur = nxt;
    }
    return cur;
  },
  parent(path) { return this.get(this.dirname(path)); },
  exists(path) { return !!this.get(path); },
  isDir(path) { const n = this.get(path); return !!n && n.type === 'dir'; },
  isFile(path) { const n = this.get(path); return !!n && n.type === 'file'; },

  /* ---------- 读写 ---------- */
  list(path) {
    const n = this.get(path);
    if (!n || n.type !== 'dir') return [];
    // 目录在前，文件在后，各自按名称排序
    const dirs = n.children.filter(c => c.type === 'dir').sort((a, b) => a.name.localeCompare(b.name));
    const files = n.children.filter(c => c.type === 'file').sort((a, b) => a.name.localeCompare(b.name));
    return dirs.concat(files);
  },
  read(path) {
    const n = this.get(path);
    return n && n.type === 'file' ? (n.content || '') : null;
  },
  write(path, content) {
    const name = this.basename(path);
    const par = this.parent(path);
    if (!par || par.type !== 'dir') return false;
    const n = this.get(path);
    if (n && n.type === 'dir') return false;
    if (n) n.content = content;
    else par.children.push({ type: 'file', name, content });
    this.save();
    return true;
  },
  mkdir(path) {
    if (this.exists(path)) return false;
    const name = this.basename(path);
    const par = this.parent(path);
    if (!par || par.type !== 'dir') return false;
    par.children.push({ type: 'dir', name, children: [] });
    this.save();
    return true;
  },
  /* 新建文件（已存在则改名追加数字） */
  touch(path, content = '') {
    let p = path;
    let i = 2;
    while (this.exists(p)) {
      const base = this.basename(path);
      const dir = this.dirname(path);
      const dot = base.lastIndexOf('.');
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const ext = dot > 0 ? base.slice(dot) : '';
      p = this.join(this.split(dir).concat([`${stem} (${i})${ext}`]));
      i++;
    }
    return this.write(p, content) ? p : null;
  },
  rm(path) {
    const par = this.parent(path);
    if (!par || par.type !== 'dir') return false;
    const name = this.basename(path);
    const idx = par.children.findIndex(c => c.name === name);
    if (idx < 0) return false;
    par.children.splice(idx, 1);
    this.save();
    return true;
  },
  rename(path, newName) {
    const n = this.get(path);
    const par = this.parent(path);
    if (!n || !par) return false;
    if (par.children.some(c => c.name === newName && c !== n)) return false;
    n.name = newName;
    this.save();
    return true;
  },
  copy(src, dstDir) {
    const n = this.get(src);
    if (!n) return false;
    const target = this.get(dstDir);
    if (!target || target.type !== 'dir') return false;
    const clone = JSON.parse(JSON.stringify(n));
    clone.name = this.basename(src);
    let i = 2;
    while (target.children.some(c => c.name === clone.name)) {
      clone.name = `${this.basename(src)} (${i})`;
      i++;
    }
    target.children.push(clone);
    this.save();
    return true;
  },
  move(src, dstDir) {
    const n = this.get(src);
    if (!n) return false;
    // 不能把目录移动到自己的子目录里
    if (dstDir === src || dstDir.startsWith(src + '/')) return false;
    const target = this.get(dstDir);
    if (!target || target.type !== 'dir') return false;
    const par = this.parent(src);
    const idx = par.children.findIndex(c => c === n);
    par.children.splice(idx, 1);
    n.name = this.basename(src);
    let i = 2;
    while (target.children.some(c => c.name === n.name)) {
      n.name = `${this.basename(src)} (${i})`;
      i++;
    }
    target.children.push(n);
    this.save();
    return true;
  },
  /* 递归统计 */
  count(path) {
    const n = this.get(path);
    if (!n) return { dirs: 0, files: 0 };
    if (n.type === 'file') return { dirs: 0, files: 1 };
    let d = 0, f = 0;
    for (const c of n.children) {
      if (c.type === 'dir') { d++; const s = this.count(this.join(this.split(path).concat([c.name]))); d += s.dirs; f += s.files; }
      else f++;
    }
    return { dirs: d, files: f };
  },
  /* 模糊查找（供终端 search 用） */
  findAll(keyword, path = '/', out = []) {
    for (const c of this.list(path)) {
      const p = this.join(this.split(path).concat([c.name]));
      if (c.name.toLowerCase().includes(keyword.toLowerCase())) out.push(p);
      if (c.type === 'dir') this.findAll(keyword, p, out);
    }
    return out;
  },
};
