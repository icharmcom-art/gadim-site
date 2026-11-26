/**
 * GADIM 全球中西整合醫療發展學會｜線上入會後台（Google Apps Script）
 *
 * 功能：接收網站「加入會員」表單 → 給會員編號 → 在 Google 雲端建立
 *       「編號_姓名_科別」資料夾 → 存身分證、簽名、申請書 PDF → 寫入會員總表
 *       → 把 PDF 寄給會員，並通知學會。
 *
 * 安裝方式：見同資料夾的 README（或 Claude 給的步驟）。
 *   1. 在 script.google.com 新增專案，貼上本檔全部內容並儲存。
 *   2. 上方函式選單選「setup」→ 執行 → 依指示授權。
 *   3. 部署 → 新增部署作業 → 網頁應用程式（執行身分：我／存取權：所有人）。
 *
 * 這份程式碼不含任何密碼。綠界的 HashKey / HashIV 之後放在
 * 「專案設定 → 指令碼屬性」，不要寫在程式碼裡。
 */

/* ===================== 可調整的設定 ===================== */
var CONFIG = {
  ROOT_FOLDER_NAME: 'GADIM 會員資料',      // 雲端硬碟最上層資料夾
  SHEET_NAME: 'GADIM 會員總表',            // 會員總表（試算表）名稱
  ORG_NAME: '全球中西整合醫療發展學會',
  NUMBER_DIGITS: 4,                       // 會員編號位數：0001、0002…（暫定規則）
  NUMBER_PREFIX: '',                      // 編號前綴，例如 'G'，暫時不用
  NOTIFY_EMAIL: '',                       // 有新申請時通知的學會信箱；空白＝通知本帳號
  TEST_MODE: true                         // true＝測試模式：不刷卡，繳費狀態記為「測試（未付款）」
};
/* ======================================================= */

var HEADERS = ['會員編號', '申請時間', '姓名', '專業科別', '會員類別', '性別', '出生年月日', '身分證字號',
  '聯絡電話', '電子信箱', '通訊地址', '服務單位', '職稱', '最高學歷', '專長領域',
  '繳費狀態', '金額', '綠界交易編號', '付款時間', '審查結果', '會員資料夾', '申請書PDF', '寄信狀態'];

/** 第一次使用：建立資料夾與會員總表（只要執行一次） */
function setup() {
  var folder = getRootFolder_();
  var ss = getSheet_().getParent();
  Logger.log('今日剩餘可寄信數：' + MailApp.getRemainingDailyQuota());
  Logger.log('完成！\n會員資料夾：' + folder.getUrl() + '\n會員總表：' + ss.getUrl());
}

function doGet() {
  return json_({ ok: true, service: 'GADIM membership', testMode: CONFIG.TEST_MODE });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var sheet, rowIndex;
  try {
    var d = JSON.parse(e.postData.contents);
    var err = validate_(d);
    if (err) return json_({ ok: false, error: err });

    lock.waitLock(30000);
    sheet = getSheet_();
    var no = nextNumber_();
    var now = new Date();
    var folderName = no + '_' + clean_(d.name) + '_' + clean_(d.category);
    var folder = getRootFolder_().createFolder(folderName);

    // 先佔位寫入一列，避免編號重複
    var row = [no, now, d.name, d.category, d.memberType, d.gender, d.birthday, String(d.idNumber).toUpperCase(),
      "'" + d.phone, d.email, d.address, d.org, d.title || '', d.education || '', d.specialty || '',
      CONFIG.TEST_MODE ? '測試（未付款）' : '待付款', '', '', '', '待審查', folder.getUrl(), '', '處理中'];
    sheet.appendRow(row);
    rowIndex = sheet.getLastRow();
    lock.releaseLock();

    // 存檔：身分證、簽名
    var base = no + '_' + clean_(d.name);
    var front = dataUrlToBlob_(d.idFront, base + '_身分證正面.jpg');
    var back = dataUrlToBlob_(d.idBack, base + '_身分證反面.jpg');
    var sig = dataUrlToBlob_(d.signature, base + '_簽名.png');
    folder.createFile(front); folder.createFile(back); folder.createFile(sig);

    // 產生申請書 PDF
    var pdf = makePdf_(d, no, now, sig, front, back, folder);
    var pdfFile = folder.createFile(pdf);
    sheet.getRange(rowIndex, HEADERS.indexOf('申請書PDF') + 1).setValue(pdfFile.getUrl());

    // 寄信
    var mailStatus = '已寄出';
    try {
      MailApp.sendEmail({
        to: d.email,
        subject: '【' + CONFIG.ORG_NAME + '】入會申請書（' + no + '）',
        htmlBody: memberMail_(d, no),
        name: CONFIG.ORG_NAME,
        attachments: [pdf]
      });
      MailApp.sendEmail({
        to: CONFIG.NOTIFY_EMAIL || Session.getEffectiveUser().getEmail(),
        subject: '新會員入會申請：' + folderName,
        htmlBody: '有一筆新的入會申請。<br>會員編號：' + no + '<br>姓名：' + esc_(d.name) + '<br>科別：' + esc_(d.category) +
          '<br><a href="' + folder.getUrl() + '">開啟會員資料夾</a>｜<a href="' + sheet.getParent().getUrl() + '">開啟會員總表</a>',
        name: 'GADIM 入會系統'
      });
    } catch (mailErr) {
      mailStatus = '寄信失敗：' + mailErr.message;
    }
    sheet.getRange(rowIndex, HEADERS.indexOf('寄信狀態') + 1).setValue(mailStatus);

    return json_({ ok: true, memberNo: no, mailed: mailStatus === '已寄出', testMode: CONFIG.TEST_MODE });
  } catch (x) {
    try { if (rowIndex) sheet.getRange(rowIndex, HEADERS.indexOf('寄信狀態') + 1).setValue('錯誤：' + x.message); } catch (ignore) {}
    return json_({ ok: false, error: String(x && x.message || x) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* ---------------- 申請書 PDF（用 Google 文件排版再轉 PDF） ---------------- */
function makePdf_(d, no, now, sig, front, back, folder) {
  var doc = DocumentApp.create(no + '_' + clean_(d.name) + '_入會申請書');
  var body = doc.getBody();
  body.setMarginTop(42).setMarginBottom(42).setMarginLeft(50).setMarginRight(50);
  var base = {}; base[DocumentApp.Attribute.FONT_FAMILY] = 'Noto Sans TC'; base[DocumentApp.Attribute.FONT_SIZE] = 10.5;
  body.setAttributes(base);

  var t = body.getParagraphs()[0];
  t.setText(CONFIG.ORG_NAME); // setText 不回傳段落，不能串接
  t.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  t.editAsText().setFontFamily('Noto Serif TC').setFontSize(13).setBold(true);
  var h = body.appendParagraph('會員入會申請表').setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  h.editAsText().setFontFamily('Noto Serif TC').setFontSize(20).setBold(true);
  para_(body, '會員編號：' + no + '　　申請日期：' + roc_(now)).setAlignment(DocumentApp.HorizontalAlignment.RIGHT)
    .editAsText().setFontSize(9);

  var rows = [
    ['一、基本資料', ''],
    ['姓名', d.name], ['性別', d.gender], ['出生年月日', roc_(d.birthday)], ['身分證字號', String(d.idNumber).toUpperCase()],
    ['聯絡電話', d.phone], ['電子信箱', d.email], ['通訊地址', d.address], ['服務單位', d.org],
    ['職稱', d.title || ''], ['最高學歷', d.education || ''], ['專長領域', d.specialty || ''],
    ['二、會員類別', ''], ['會員類別', d.memberType], ['專業科別', d.category]
  ];
  var table = body.appendTable(rows.map(function (r) { return [r[0], String(r[1] || '')]; }));
  table.setBorderColor('#B9B6CC');
  for (var i = 0; i < table.getNumRows(); i++) {
    var row = table.getRow(i), c0 = row.getCell(0), c1 = row.getCell(1);
    c0.setWidth(110);
    c0.editAsText().setBold(true).setForegroundColor('#1F2558');
    if (rows[i][1] === '' && /^[一二]、/.test(rows[i][0])) {
      c0.setBackgroundColor('#ECEAF4'); c1.setBackgroundColor('#ECEAF4');
    } else {
      c0.setBackgroundColor('#F6F5F9');
    }
  }

  sec_(body, '三、入會聲明');
  para_(body, '☑ 本人贊同本學會宗旨，願遵守章程及相關規定，並按時繳納會費。');
  sec_(body, '五、個資使用同意');
  para_(body, '☑ 本人同意本會蒐集、處理及利用上述個人資料，僅限於會務運作及聯繫使用。');
  para_(body, '申請人簽名：');
  var sp = body.appendParagraph('');
  var simg = sp.appendInlineImage(sig.copyBlob());
  scale_(simg, 200, 80);

  sec_(body, '四、審查欄（由學會填寫）');
  para_(body, '會員編號：' + no + '　　審查結果：□通過 □未通過');
  para_(body, '理事會審核日期：＿＿年＿＿月＿＿日　　理事長簽章：＿＿＿＿＿＿＿＿');
  if (CONFIG.TEST_MODE) para_(body, '※ 測試資料（未付款）').editAsText().setForegroundColor('#C0476B');

  body.appendPageBreak();
  sec_(body, '身分證影本');
  para_(body, '正面');
  scale_(body.appendParagraph('').appendInlineImage(front.copyBlob()), 420, 280);
  para_(body, '反面');
  scale_(body.appendParagraph('').appendInlineImage(back.copyBlob()), 420, 280);

  doc.saveAndClose();
  var file = DriveApp.getFileById(doc.getId());
  var pdf = file.getAs('application/pdf').setName(no + '_' + clean_(d.name) + '_' + clean_(d.category) + '_入會申請書.pdf');
  file.setTrashed(true); // 只保留 PDF
  return pdf;
}

function para_(body, text) {
  var p = body.appendParagraph(text);
  p.setAlignment(DocumentApp.HorizontalAlignment.LEFT).setSpacingBefore(0);
  p.editAsText().setFontFamily('Noto Sans TC').setBold(false).setFontSize(10.5).setForegroundColor('#2F3450');
  return p;
}
function sec_(body, text) {
  var p = para_(body, text);
  p.setSpacingBefore(12).editAsText().setBold(true).setFontSize(11.5).setForegroundColor('#1F2558');
  return p;
}
function scale_(img, maxW, maxH) {
  var w = img.getWidth(), h = img.getHeight(), k = Math.min(maxW / w, maxH / h, 1);
  img.setWidth(Math.round(w * k)).setHeight(Math.round(h * k));
}

function memberMail_(d, no) {
  return '<div style="font-family:Microsoft JhengHei,Noto Sans TC,sans-serif;line-height:1.9;color:#2f3450">' +
    esc_(d.name) + ' 您好：<br><br>感謝您申請加入' + CONFIG.ORG_NAME + '。<br>' +
    '您的申請編號為 <b>' + no + '</b>，入會申請書 PDF 已附在這封信中，請妥善保存。<br>' +
    '本會理事會審查通過後，將再以電子郵件通知您。<br><br>' +
    (CONFIG.TEST_MODE ? '<span style="color:#c0476b">（此為系統測試信）</span><br><br>' : '') +
    CONFIG.ORG_NAME + ' 敬上</div>';
}

/* ---------------- 工具 ---------------- */
function getRootFolder_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('ROOT_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder(CONFIG.ROOT_FOLDER_NAME);
  props.setProperty('ROOT_FOLDER_ID', f.getId());
  return f;
}
function getSheet_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id).getSheets()[0]; } catch (e) {} }
  var ss = SpreadsheetApp.create(CONFIG.SHEET_NAME);
  var sh = ss.getSheets()[0].setName('會員總表');
  sh.appendRow(HEADERS);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#ECEAF4');
  DriveApp.getFileById(ss.getId()).moveTo(getRootFolder_());
  props.setProperty('SHEET_ID', ss.getId());
  return sh;
}
function nextNumber_() {
  var props = PropertiesService.getScriptProperties();
  var n = Number(props.getProperty('LAST_NUMBER') || 0) + 1;
  props.setProperty('LAST_NUMBER', String(n));
  var s = String(n); while (s.length < CONFIG.NUMBER_DIGITS) s = '0' + s;
  return CONFIG.NUMBER_PREFIX + s;
}
function validate_(d) {
  var need = { name: '姓名', category: '專業科別', memberType: '會員類別', gender: '性別', birthday: '出生年月日', idNumber: '身分證字號',
    phone: '聯絡電話', email: '電子信箱', address: '通訊地址', org: '服務單位', signature: '簽名', idFront: '身分證正面', idBack: '身分證反面' };
  for (var k in need) if (!d[k]) return '缺少：' + need[k];
  if (!d.agreeRules || !d.agreePrivacy) return '未勾選同意事項';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return '電子信箱格式不正確';
  if (String(d.website || '')) return '無效的申請'; // 防機器人欄位
  return '';
}
function dataUrlToBlob_(dataUrl, name) {
  var m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) throw new Error('圖片格式錯誤：' + name);
  return Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name);
}
function roc_(v) {
  if (!v) return '';
  var dt = v instanceof Date ? v : new Date(String(v) + 'T00:00:00');
  return '民國 ' + (dt.getFullYear() - 1911) + ' 年 ' + (dt.getMonth() + 1) + ' 月 ' + dt.getDate() + ' 日';
}
function clean_(s) { return String(s || '').replace(/[\\\/:*?"<>|_\s]+/g, '').slice(0, 30); }
function esc_(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
