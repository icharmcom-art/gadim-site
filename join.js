/* 加入會員表單：簽名板、身分證上傳預覽、檢查必填、送出
   ENDPOINT：學會 Google Apps Script 網址（第二階段設定後填入）。空白時只顯示預覽，不送出任何資料。 */
(function () {
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbxQ3LmPoIjJ7ihvokDWTVo3N3NEdDgf0I6SLddZf8gUtW9RpS0jw9Q-uc3dwsIC656Oyg/exec';

  var form = document.getElementById('joinForm');
  var errBox = document.getElementById('formError');
  var steps = document.querySelectorAll('.steps li');

  /* ---------- 簽名板 ---------- */
  var canvas = document.getElementById('signPad');
  var ctx = canvas.getContext('2d');
  var signed = false, drawing = false, last = null;
  function sizeCanvas() {
    var r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!r.width) return;
    var old = signed ? canvas.toDataURL() : null;
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1f2558';
    if (old) { var im = new Image(); im.onload = function () { ctx.drawImage(im, 0, 0, r.width, r.height); }; im.src = old; }
  }
  function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault(); drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId);
    ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#1f2558'; ctx.fill();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drawing) return; e.preventDefault();
    var p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p;
    if (!signed) { signed = true; canvas.parentNode.classList.remove('bad'); }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { canvas.addEventListener(t, function () { drawing = false; }); });
  document.getElementById('signClear').addEventListener('click', function () {
    ctx.clearRect(0, 0, canvas.width, canvas.height); signed = false;
  });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(sizeCanvas, 150); });
  sizeCanvas();

  /* ---------- 身分證上傳（自動縮圖，避免手機照片太大） ---------- */
  var ids = {};
  function shrink(file, cb) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var max = 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); cb(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }
  document.querySelectorAll('.upload input').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var box = inp.closest('.upload'), f = inp.files[0];
      if (!f) return;
      shrink(f, function (data) {
        if (!data) { alert('無法讀取這張圖片，請改用 JPG 或 PNG 照片。'); return; }
        ids[inp.name] = data; box.querySelector('img').src = data;
        box.classList.add('has'); box.classList.remove('bad');
      });
    });
  });

  /* ---------- 「其他」類別說明 ---------- */
  var otherInput = form.querySelector('[name=memberTypeOther]');
  form.querySelectorAll('[name=memberType]').forEach(function (r) {
    r.addEventListener('change', function () { otherInput.hidden = r.value !== '其他' || !r.checked; if (!otherInput.hidden) otherInput.focus(); });
  });

  /* ---------- 步驟指示（捲動時跟著亮） ---------- */
  var secs = ['sec-intro', 'sec-data', 'sec-sign', 'sec-pay'].map(function (id) { return document.getElementById(id); });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { var i = secs.indexOf(e.target); steps.forEach(function (s, j) { s.classList.toggle('on', j <= i); }); }
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    secs.forEach(function (s) { io.observe(s); });
  }

  /* ---------- 檢查 ---------- */
  function val(n) { var el = form.elements[n]; return el ? (el.value || '').trim() : ''; }
  function validId(s) {
    s = s.toUpperCase();
    if (!/^[A-Z][12890]\d{8}$/.test(s)) return /^[A-Z][A-D]\d{8}$/.test(s); // 新舊式居留證號
    var L = 'ABCDEFGHJKLMNPQRSTUVXYWZIO', n = L.indexOf(s[0]) + 10;
    var sum = Math.floor(n / 10) + (n % 10) * 9, w = [8, 7, 6, 5, 4, 3, 2, 1];
    for (var i = 0; i < 8; i++) sum += +s[i + 1] * w[i];
    sum += +s[9];
    return sum % 10 === 0;
  }
  function check() {
    var problems = [], first = null;
    form.querySelectorAll('.bad').forEach(function (el) { el.classList.remove('bad'); });
    function bad(el, msg) { el.classList.add('bad'); if (!first) first = el; problems.push(msg); }

    if (!form.agreeRules.checked) bad(form.agreeRules.closest('.check'), '請勾選入會聲明');
    if (!form.agreePrivacy.checked) bad(form.agreePrivacy.closest('.check'), '請勾選個資使用同意');
    ['memberType', 'category', 'gender'].forEach(function (n) {
      if (!form.querySelector('[name=' + n + ']:checked')) bad(form.querySelector('[data-name=' + n + ']'), '請選擇' + form.querySelector('[data-name=' + n + ']').previousElementSibling.textContent.replace('*', '').trim());
    });
    if (val('memberType') === '其他' && !val('memberTypeOther')) bad(otherInput, '請說明其他會員類別');
    form.querySelectorAll('.grid [required]').forEach(function (el) {
      if (el.type === 'radio') return;
      if (!el.value.trim()) bad(el, '請填寫' + el.closest('.field').querySelector('span').textContent.replace('*', '').trim());
    });
    if (val('idNumber') && !validId(val('idNumber'))) bad(form.idNumber, '身分證字號格式不正確');
    if (val('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('email'))) bad(form.email, '電子信箱格式不正確');
    if (!signed) bad(canvas.parentNode, '請完成簽名');
    if (!ids.idFront) bad(form.idFront.closest('.upload'), '請上傳身分證正面');
    if (!ids.idBack) bad(form.idBack.closest('.upload'), '請上傳身分證反面');
    return { problems: problems, first: first };
  }
  form.addEventListener('input', function (e) { e.target.classList.remove('bad'); var c = e.target.closest('.bad'); if (c) c.classList.remove('bad'); });
  form.addEventListener('change', function (e) { var c = e.target.closest('.bad'); if (c) c.classList.remove('bad'); });

  /* ---------- 資料整理 ---------- */
  function rocDate(d) { if (!d) return ''; var p = d.split('-'); return '民國 ' + (p[0] - 1911) + ' 年 ' + (+p[1]) + ' 月 ' + (+p[2]) + ' 日'; }
  function collect() {
    var today = new Date(), iso = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
    var mt = val('memberType');
    return {
      memberType: mt === '其他' ? '其他：' + val('memberTypeOther') : mt,
      category: val('category'), name: val('name'), gender: val('gender'),
      birthday: val('birthday'), idNumber: val('idNumber').toUpperCase(), phone: val('phone'), email: val('email'),
      address: val('address'), org: val('org'), title: val('title'), education: val('education'), specialty: val('specialty'),
      applyDate: iso, website: val('website'), agreeRules: true, agreePrivacy: true,
      signature: canvas.toDataURL('image/png'), idFront: ids.idFront, idBack: ids.idBack
    };
  }
  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(s) { return esc(s).replace(/(\d+)/g, '<span class="en">$1</span>'); }
  function render(d) {
    var rows = [['會員類別', d.memberType], ['專業科別', d.category], ['姓名', d.name], ['性別', d.gender], ['出生年月日', rocDate(d.birthday)],
      ['身分證字號', d.idNumber], ['聯絡電話', d.phone], ['電子信箱', d.email], ['通訊地址', d.address], ['服務單位', d.org],
      ['職稱', d.title], ['最高學歷', d.education], ['專長領域', d.specialty], ['申請日期', rocDate(d.applyDate)]];
    document.getElementById('preview').innerHTML =
      '<h3>會員入會申請表</h3><div class="org">全球中西整合醫療發展學會</div><table>' +
      rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + num(r[1]) + '</td></tr>'; }).join('') +
      '<tr><th>申請人簽名</th><td class="sig"><img src="' + d.signature + '" alt="簽名"></td></tr></table>' +
      '<p class="agree">☑ 入會聲明：本人贊同本學會宗旨，願遵守章程及相關規定，並按時繳納會費。<br>☑ 個資使用同意：本人同意本會蒐集、處理及利用上述個人資料，僅限於會務運作及聯繫使用。</p>' +
      '<div class="ids"><img src="' + d.idFront + '" alt="身分證正面"><img src="' + d.idBack + '" alt="身分證反面"></div>';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var r = check();
    if (r.problems.length) {
      errBox.hidden = false; errBox.textContent = '還有 ' + r.problems.length + ' 個地方需要補上：' + r.problems.join('、');
      r.first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    errBox.hidden = true;
    var data = collect();
    if (!ENDPOINT) { // 預覽模式
      render(data); form.hidden = true; document.querySelector('.steps').hidden = true;
      var res = document.getElementById('result'); res.hidden = false; res.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    var btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = '送出中，請稍候…';
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || '送出失敗');
        if (j.payUrl) { location.href = j.payUrl; return; }
        render(data); form.hidden = true; document.querySelector('.steps').hidden = true;
        var res = document.getElementById('result');
        res.querySelector('.card-title').textContent = '申請已送出';
        res.querySelector('.hint').innerHTML = '感謝您的申請！您的申請編號為 <b class="en">' + esc(j.memberNo) + '</b>。' +
          (j.mailed ? '入會申請書 <span class="en">PDF</span> 已寄到 ' + esc(data.email) + '，請查收（若沒看到，請檢查垃圾郵件匣）。' : '申請書寄送時發生問題，本會將另行與您聯繫。') +
          (j.testMode ? '<br><span style="color:#c0476b">（目前為測試模式，尚未收費）</span>' : '');
        document.getElementById('backEdit').hidden = true;
        res.hidden = false; res.scrollIntoView({ behavior: 'smooth' });
      })
      .catch(function (err) { btn.disabled = false; btn.textContent = '確認送出申請'; errBox.hidden = false; errBox.textContent = '送出失敗，請稍後再試（' + err.message + '）'; });
  });

  document.getElementById('backEdit').addEventListener('click', function () {
    form.hidden = false; document.querySelector('.steps').hidden = false; document.getElementById('result').hidden = true;
    sizeCanvas(); form.scrollIntoView({ behavior: 'smooth' });
  });
})();
