/* 網頁文字編輯工具
   1. 按右下角「編輯文字」→ 頁面上的文字都能直接點進去修改
   2. 改好按「下載修改後的網頁」→ 存成 index.html，覆蓋原本的檔案即可
*/
(function () {
  var SELECTOR = [
    'h1', 'h2', 'h3', 'p', '.eyebrow', '.en-italic', '.nav a',
    '.btn span', '.header-tools .btn', '.more-link span',
    '.brand-text > div', '.event-date span', '.event-meta span:not(.sep)',
    '.lang span'
  ].join(',');

  var body = document.body;
  var toggle = document.getElementById('editToggle');
  var saveBtn = document.getElementById('saveBtn');
  var toast = document.getElementById('toast');
  var editing = false, dirty = false;

  function targets() {
    return Array.prototype.filter.call(document.querySelectorAll(SELECTOR), function (el) {
      return !el.closest('[data-tool]');
    });
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 2200);
  }

  function setEditing(on) {
    editing = on;
    body.classList.toggle('editing', on);
    targets().forEach(function (el) {
      if (on) { el.setAttribute('contenteditable', 'true'); el.setAttribute('data-editable', ''); el.spellcheck = false; }
      else { el.removeAttribute('contenteditable'); el.removeAttribute('data-editable'); }
    });
    toggle.textContent = on ? '✓ 完成編輯' : '✎ 編輯文字';
    toggle.classList.toggle('on', on);
    saveBtn.hidden = !on && !dirty;
    if (on) showToast('點任何文字即可修改');
  }

  toggle.addEventListener('click', function () { setEditing(!editing); });

  // 編輯時，點連結不要跳頁
  document.addEventListener('click', function (e) {
    if (editing && e.isTrusted && e.target.closest('a') && !e.target.closest('[data-tool]')) e.preventDefault();
  }, true);

  // 貼上時只保留純文字，避免帶入其他格式
  document.addEventListener('paste', function (e) {
    if (!editing || !e.target.closest('[contenteditable]')) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  document.addEventListener('input', function (e) {
    if (e.target.closest && e.target.closest('[contenteditable]')) { dirty = true; saveBtn.hidden = false; }
  });

  saveBtn.addEventListener('click', function () {
    var clone = document.documentElement.cloneNode(true);
    clone.querySelector('body').classList.remove('editing');
    clone.querySelectorAll('[contenteditable],[data-editable]').forEach(function (el) {
      el.removeAttribute('contenteditable'); el.removeAttribute('data-editable'); el.removeAttribute('spellcheck');
    });
    var b = clone.querySelector('#editToggle'); if (b) { b.textContent = '✎ 編輯文字'; b.classList.remove('on'); }
    var s = clone.querySelector('#saveBtn'); if (s) s.setAttribute('hidden', '');
    var t = clone.querySelector('#toast'); if (t) { t.textContent = ''; t.classList.remove('show'); }
    var nav = clone.querySelector('#nav'); if (nav) nav.classList.remove('open');

    var html = '<!doctype html>\n' + clone.outerHTML;
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'index.html';
    document.body.appendChild(a); a.click(); a.remove();
    dirty = false;
    showToast('已下載 index.html，請覆蓋原檔');
  });

  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
})();
