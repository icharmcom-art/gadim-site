// 「專家團隊」下拉選單：點一下展開／收合（桌機也可滑過展開）
(function () {
  var drops = document.querySelectorAll('.nav-drop');
  function closeAll(except) {
    drops.forEach(function (d) {
      if (d !== except) { d.classList.remove('open'); d.querySelector('.nav-drop-toggle').setAttribute('aria-expanded', 'false'); }
    });
  }
  drops.forEach(function (d) {
    var t = d.querySelector('.nav-drop-toggle');
    t.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation(); // 不要讓手機選單因點到這個連結而關閉
      var open = d.classList.toggle('open');
      t.setAttribute('aria-expanded', String(open));
      closeAll(d);
    });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.nav-drop')) closeAll(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
  // 視窗由手機寬度拉回桌機寬度時，收起手機選單
  window.addEventListener('resize', function () {
    var nav = document.getElementById('nav');
    var burger = document.querySelector('.menu-toggle, .burger');
    if (nav && burger && burger.offsetParent === null) nav.classList.remove('open');
  });
})();
