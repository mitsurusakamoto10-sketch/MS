/* 簿記2級 CBT演習アプリ 本体
 * 画面: home / exam / result / practiceMenu / practice / stats
 * 依存: data/registry.js ほかデータファイル（window.BOKI）
 */
(function () {
  "use strict";

  var BOKI = window.BOKI;
  var app = document.getElementById("app");

  /* ---------------- storage ---------------- */
  var K = {
    results: "boki_v1_results",
    progress: "boki_v1_progress",
    topic: "boki_v1_topic",
    exam: "boki_v1_exam"
  };

  function lsGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function lsSet(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { /* ignore */ }
  }
  function lsDel(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  /* ---------------- utils ---------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmt(n) {
    if (n == null || isNaN(n)) return "";
    return Number(n).toLocaleString("ja-JP");
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* 数字を3桁区切りにする（小数部はそのまま） */
  function groupDigits(intDigits) {
    return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /* 金額入力欄の値を「1,234,567」形式に整形する（カーソル位置を維持） */
  function formatAmountInput(el) {
    var raw = el.value;
    if (raw === "") return;
    var caret = el.selectionStart;
    var digitsBefore = raw.slice(0, caret == null ? raw.length : caret).replace(/[^0-9０-９]/g, "").length;

    var s = raw.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    var neg = /^\s*[-−△▲]/.test(s);
    var dot = s.indexOf(".") >= 0 || s.indexOf("．") >= 0;
    var parts = s.replace(/．/g, ".").replace(/[^0-9.]/g, "").split(".");
    var intPart = parts[0].replace(/^0+(?=\d)/, "");
    var decPart = parts.length > 1 ? parts.slice(1).join("").slice(0, 4) : "";

    var out = "";
    if (intPart !== "" || decPart !== "" || dot) {
      out = (neg ? "-" : "") + groupDigits(intPart === "" ? "0" : intPart) + (dot ? "." + decPart : "");
    } else if (neg) {
      out = "-"; /* マイナス記号だけ入力した直後 */
    }
    if (out === el.value) return;
    el.value = out;

    /* 整形後の文字列で、カーソル前にあった桁数ぶん進んだ位置にキャレットを戻す */
    var pos = out.length;
    if (digitsBefore <= 0) {
      pos = neg ? 1 : 0;
    } else {
      var count = 0;
      for (var i = 0; i < out.length; i++) {
        if (/\d/.test(out[i])) {
          count++;
          if (count === digitsBefore) { pos = i + 1; break; }
        }
      }
    }
    try { el.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
  }

  function isAmountInput(el) {
    return el && el.tagName === "INPUT" &&
      (el.classList.contains("amount") || el.classList.contains("cell-input"));
  }

  /* 金額パース: カンマ・全角数字・¥・円・空白を許容。負数は - / △ */
  function parseAmount(raw) {
    if (raw == null) return NaN;
    var s = String(raw).trim();
    if (s === "") return NaN;
    s = s.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    s = s.replace(/[，,¥￥円\s]/g, "").replace(/．/g, ".");
    var neg = false;
    if (/^[-−△▲]/.test(s)) { neg = true; s = s.slice(1); }
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    var v = parseFloat(s);
    return neg ? -v : v;
  }

  /* ---------------- 問題インデックス ---------------- */
  var QINDEX = {}; // qid -> {q, origin, setTitle}
  function buildIndex() {
    BOKI.mocks.forEach(function (set) {
      set.sections.forEach(function (sec) {
        sec.questions.forEach(function (q) {
          QINDEX[q.id] = { q: q, origin: "mock", setTitle: set.title };
        });
      });
    });
    BOKI.practice.forEach(function (q) {
      QINDEX[q.id] = { q: q, origin: "practice", setTitle: "分野別演習" };
    });
  }

  function qPoints(q) {
    if (q.kind === "journal") return q.points;
    var sum = 0;
    Object.keys(q.cells).forEach(function (k) { sum += q.cells[k].points; });
    return sum;
  }

  /* ---------------- 周回・フラグ ---------------- */
  function getProgress() { return lsGet(K.progress, {}); }

  function recordAttempt(qid, ok) {
    var prog = getProgress();
    var p = prog[qid] || { attempts: [], flag: false };
    p.attempts.push({ d: todayStr(), ok: !!ok });
    if (p.attempts.length > 20) p.attempts = p.attempts.slice(-20);
    if (!ok) p.flag = true; // 一度でも間違えたらフラグ（正解しても自動では消さない）
    prog[qid] = p;
    lsSet(K.progress, prog);

    var q = QINDEX[qid] && QINDEX[qid].q;
    if (q && q.topic) {
      var ts = lsGet(K.topic, {});
      var t = ts[q.topic] || { att: 0, ok: 0 };
      t.att++;
      if (ok) t.ok++;
      ts[q.topic] = t;
      lsSet(K.topic, ts);
    }
  }

  function toggleFlag(qid) {
    var prog = getProgress();
    var p = prog[qid] || { attempts: [], flag: false };
    p.flag = !p.flag;
    prog[qid] = p;
    lsSet(K.progress, prog);
  }

  /* ○×スロット（直近5回）+ 解答回数 */
  function lapsHtml(qid) {
    var p = getProgress()[qid];
    var attempts = (p && p.attempts) || [];
    var last5 = attempts.slice(-5);
    var html = '<span class="laps" title="直近5回の結果（計' + attempts.length + '回解答）">';
    for (var i = 0; i < 5; i++) {
      var a = last5[i];
      if (a) html += '<span class="lap ' + (a.ok ? "ok" : "ng") + '">' + (a.ok ? "○" : "×") + "</span>";
      else html += '<span class="lap"></span>';
    }
    html += "</span>";
    if (attempts.length > 0) html += '<span class="muted">' + attempts.length + "回</span>";
    return html;
  }

  function flagBtnHtml(qid) {
    var p = getProgress()[qid];
    var on = !!(p && p.flag);
    return '<button type="button" class="flag-btn' + (on ? " on" : "") + '" data-flag="' + esc(qid) + '" title="間違いフラグ（クリックで切替）">🚩</button>';
  }

  /* 周回情報: qids 全体を1回ずつ解いて1周 */
  function lapInfo(qids) {
    var prog = getProgress();
    var minAtt = Infinity;
    qids.forEach(function (id) {
      var n = (prog[id] && prog[id].attempts.length) || 0;
      if (n < minAtt) minAtt = n;
    });
    if (!qids.length) minAtt = 0;
    if (minAtt === Infinity) minAtt = 0;
    var lap = minAtt + 1;
    var done = 0;
    qids.forEach(function (id) {
      var n = (prog[id] && prog[id].attempts.length) || 0;
      if (n >= lap) done++;
    });
    return { fullLaps: minAtt, lap: lap, done: done, total: qids.length };
  }

  function lapProgressHtml(label, qids) {
    var info = lapInfo(qids);
    var pct = info.total ? Math.round((info.done / info.total) * 100) : 0;
    var badge = info.fullLaps >= 5
      ? '<span class="lap-badge done">5周達成！</span>'
      : '<span class="lap-badge">' + Math.min(info.lap, 99) + "周目</span>";
    return '<div class="lap-progress"><div class="sub">' + esc(label) + " " + badge +
      ' <span class="muted">' + info.done + "/" + info.total + "問</span></div>" +
      '<div class="bar"><i style="width:' + pct + '%"></i></div></div>';
  }

  /* ---------------- 採点 ---------------- */
  function normalizeSide(rows) {
    var out = [];
    (rows || []).forEach(function (r) {
      var a = String(r.a == null ? "" : r.a).trim();
      var vRaw = String(r.v == null ? "" : r.v).trim();
      if (a === "" && vRaw === "") return; // 完全な空行は無視
      var v = parseAmount(vRaw);
      out.push(a + "|" + (isNaN(v) ? "?" : v)); // 片側だけの入力は "?" となり不一致になる
    });
    return out.sort();
  }
  function arrEq(x, y) {
    if (x.length !== y.length) return false;
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  function gradeJournal(q, ans) {
    ans = ans || { debit: [], credit: [] };
    var ud = normalizeSide(ans.debit);
    var uc = normalizeSide(ans.credit);
    var cands = [q.correct].concat(q.alt || []);
    for (var i = 0; i < cands.length; i++) {
      var cd = normalizeSide(cands[i].debit);
      var cc = normalizeSide(cands[i].credit);
      if (arrEq(ud, cd) && arrEq(uc, cc)) return q.points; // 完答のみ得点（本試験どおり）
    }
    return 0;
  }
  function gradeCells(q, ans) {
    ans = ans || {};
    var earned = 0;
    var detail = {};
    Object.keys(q.cells).forEach(function (k) {
      var spec = q.cells[k];
      var raw = String(ans[k] == null ? "" : ans[k]).trim();
      var ok = false;
      var accepts = [spec.answer].concat(spec.accept || []);
      for (var i = 0; i < accepts.length; i++) {
        var acc = accepts[i];
        if (typeof acc === "number") {
          var v = parseAmount(raw);
          if (!isNaN(v) && v === acc) { ok = true; break; }
        } else if (raw !== "" && raw === String(acc)) { ok = true; break; }
      }
      if (ok) earned += spec.points;
      detail[k] = ok;
    });
    return { earned: earned, detail: detail };
  }
  function gradeQuestion(q, ans) {
    if (q.kind === "journal") {
      var e = gradeJournal(q, ans);
      return { earned: e, max: q.points, detail: null };
    }
    var r = gradeCells(q, ans);
    return { earned: r.earned, max: qPoints(q), detail: r.detail };
  }

  /* ---------------- 状態 ---------------- */
  var state = { screen: "home", exam: null, practice: null, lastResult: null };
  var timerId = null;

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  /* ---------------- 解答欄レンダリング ---------------- */
  function journalInputHtml(q, ans) {
    ans = ans || { debit: [], credit: [] };
    var lines = q.maxLines || 4;
    var opts = '<option value=""></option>' + q.accounts.map(function (a) {
      return '<option value="' + esc(a) + '">' + esc(a) + "</option>";
    }).join("");
    var html = '<div class="journal-wrap"><table class="journal-table"><thead><tr>' +
      "<th>借方科目</th><th>借方金額</th><th>貸方科目</th><th>貸方金額</th></tr></thead><tbody>";
    for (var i = 0; i < lines; i++) {
      var d = ans.debit[i] || { a: "", v: "" };
      var c = ans.credit[i] || { a: "", v: "" };
      html += "<tr>" +
        '<td><select data-j="' + esc(q.id) + '" data-side="debit" data-idx="' + i + '" data-f="a">' + opts + "</select></td>" +
        '<td><input class="amount" type="text" inputmode="numeric" data-j="' + esc(q.id) + '" data-side="debit" data-idx="' + i + '" data-f="v" value="' + esc(d.v) + '"></td>' +
        '<td><select data-j="' + esc(q.id) + '" data-side="credit" data-idx="' + i + '" data-f="a">' + opts + "</select></td>" +
        '<td><input class="amount" type="text" inputmode="numeric" data-j="' + esc(q.id) + '" data-side="credit" data-idx="' + i + '" data-f="v" value="' + esc(c.v) + '"></td>' +
        "</tr>";
    }
    html += "</tbody></table></div>";
    return html;
  }

  /* select の選択状態は innerHTML 後に反映する */
  function restoreJournalSelects(q, ans) {
    if (!ans) return;
    ["debit", "credit"].forEach(function (side) {
      (ans[side] || []).forEach(function (row, i) {
        if (!row || !row.a) return;
        var sel = app.querySelector('select[data-j="' + cssEsc(q.id) + '"][data-side="' + side + '"][data-idx="' + i + '"]');
        if (sel) sel.value = row.a;
      });
    });
  }
  function cssEsc(s) {
    return String(s).replace(/["\\]/g, "\\$&");
  }

  function cellsInputHtml(q, ans) {
    ans = ans || {};
    var body = q.body.replace(/\{\{(\w+)\}\}/g, function (_, key) {
      var spec = q.cells[key];
      if (!spec) return "";
      if (spec.choices) {
        var opts = '<option value=""></option>' + spec.choices.map(function (c) {
          return '<option value="' + esc(c) + '">' + esc(c) + "</option>";
        }).join("");
        return '<select data-c="' + esc(q.id) + '" data-key="' + esc(key) + '">' + opts + "</select>";
      }
      return '<input class="cell-input" type="text" inputmode="numeric" data-c="' + esc(q.id) + '" data-key="' + esc(key) + '" value="' + esc(ans[key] || "") + '">';
    });
    return '<div class="fill-wrap">' + body + "</div>";
  }
  function restoreCellSelects(q, ans) {
    if (!ans) return;
    Object.keys(ans).forEach(function (key) {
      if (!ans[key]) return;
      var sel = app.querySelector('select[data-c="' + cssEsc(q.id) + '"][data-key="' + cssEsc(key) + '"]');
      if (sel) sel.value = ans[key];
    });
  }

  function questionInputHtml(q, ans) {
    var html = '<div class="q-text">' + q.question + "</div>";
    if (q.kind === "journal") html += journalInputHtml(q, ans);
    else html += cellsInputHtml(q, ans);
    return html;
  }
  function restoreSelects(q, ans) {
    if (q.kind === "journal") restoreJournalSelects(q, ans);
    else restoreCellSelects(q, ans);
  }

  /* ---------------- 解答比較（結果表示） ---------------- */
  function journalAnswerTable(entry) {
    var rows = Math.max((entry.debit || []).length, (entry.credit || []).length, 1);
    var html = '<table class="fill-table"><tr><th>借方科目</th><th class="num">金額</th><th>貸方科目</th><th class="num">金額</th></tr>';
    for (var i = 0; i < rows; i++) {
      var d = (entry.debit || [])[i];
      var c = (entry.credit || [])[i];
      html += "<tr><td>" + esc(d ? d.a : "") + '</td><td class="num">' + (d ? fmt(typeof d.v === "number" ? d.v : parseAmount(d.v)) : "") + "</td>" +
        "<td>" + esc(c ? c.a : "") + '</td><td class="num">' + (c ? fmt(typeof c.v === "number" ? c.v : parseAmount(c.v)) : "") + "</td></tr>";
    }
    return html + "</table>";
  }
  function userJournalEntry(ans) {
    var out = { debit: [], credit: [] };
    ["debit", "credit"].forEach(function (side) {
      ((ans && ans[side]) || []).forEach(function (r) {
        if (r && ((r.a && r.a.trim()) || (r.v && String(r.v).trim()))) out[side].push({ a: r.a || "", v: r.v || "" });
      });
    });
    return out;
  }

  function cellsResultHtml(q, ans, detail) {
    ans = ans || {};
    var body = q.body.replace(/\{\{(\w+)\}\}/g, function (_, key) {
      var spec = q.cells[key];
      if (!spec) return "";
      var user = String(ans[key] == null ? "" : ans[key]).trim();
      var ok = detail && detail[key];
      var ansDisp = typeof spec.answer === "number" ? fmt(spec.answer) : String(spec.answer);
      var userDisp = user === "" ? "（未解答）" : (typeof spec.answer === "number" && !isNaN(parseAmount(user)) ? fmt(parseAmount(user)) : user);
      if (ok) return '<span class="cell-ok">' + esc(userDisp) + " ○</span>";
      return '<span class="cell-ng">' + esc(userDisp) + ' ×</span> <span class="mark-ok">正: ' + esc(ansDisp) + "</span>";
    });
    return '<div class="fill-wrap">' + body + "</div>";
  }

  function questionResultHtml(q, ans, graded) {
    var html = "";
    if (q.kind === "journal") {
      html += '<div class="answer-compare"><div><h3>あなたの解答</h3>' + journalAnswerTable(userJournalEntry(ans)) + "</div>" +
        "<div><h3>正解</h3>" + journalAnswerTable(q.correct) + "</div></div>";
    } else {
      html += cellsResultHtml(q, ans, graded.detail);
    }
    if (q.explanation) html += '<div class="explain"><b>解説</b>\n' + q.explanation + "</div>";
    return html;
  }

  /* ---------------- 模擬試験 ---------------- */
  function findSet(setId) {
    for (var i = 0; i < BOKI.mocks.length; i++) if (BOKI.mocks[i].setId === setId) return BOKI.mocks[i];
    return null;
  }

  function startExam(setId, snapshot) {
    var set = findSet(setId);
    if (!set) return;
    state.exam = {
      set: set,
      startedAt: snapshot ? snapshot.startedAt : Date.now(),
      answers: snapshot ? snapshot.answers : {},
      secIdx: snapshot ? (snapshot.secIdx || 0) : 0
    };
    state.screen = "exam";
    render();
  }

  var saveTimer = null;
  function saveExamSnapshot() {
    if (!state.exam) return;
    lsSet(K.exam, {
      setId: state.exam.set.setId,
      startedAt: state.exam.startedAt,
      answers: state.exam.answers,
      secIdx: state.exam.secIdx,
      savedAt: Date.now()
    });
  }
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveExamSnapshot, 400);
  }

  function remainingSec() {
    if (!state.exam) return 0;
    var limit = state.exam.set.timeLimitMin * 60;
    return Math.max(0, Math.floor(limit - (Date.now() - state.exam.startedAt) / 1000));
  }

  function isAnswered(q, ans) {
    if (!ans) return false;
    if (q.kind === "journal") {
      return userJournalEntry(ans).debit.length > 0 || userJournalEntry(ans).credit.length > 0;
    }
    return Object.keys(q.cells).some(function (k) { return ans[k] != null && String(ans[k]).trim() !== ""; });
  }
  function unansweredCount() {
    var n = 0;
    state.exam.set.sections.forEach(function (sec) {
      sec.questions.forEach(function (q) {
        if (!isAnswered(q, state.exam.answers[q.id])) n++;
      });
    });
    return n;
  }

  function submitExam(auto) {
    if (!state.exam) return;
    if (!auto) {
      var un = unansweredCount();
      var msg = un > 0 ? "未解答の問題が " + un + " 問あります。試験を終了して採点しますか？" : "試験を終了して採点しますか？";
      if (!confirm(msg)) return;
    }
    stopTimer();
    var exam = state.exam;
    var total = 0;
    var secResults = exam.set.sections.map(function (sec) {
      var earned = 0;
      var qResults = sec.questions.map(function (q) {
        var g = gradeQuestion(q, exam.answers[q.id]);
        earned += g.earned;
        recordAttempt(q.id, g.earned === g.max);
        return { q: q, ans: exam.answers[q.id], graded: g };
      });
      total += earned;
      return { no: sec.no, label: sec.label, points: sec.points, earned: earned, qResults: qResults };
    });
    var pass = total >= exam.set.passScore;
    var results = lsGet(K.results, []);
    var secMap = {};
    secResults.forEach(function (s) { secMap[s.no] = s.earned; });
    results.push({ setId: exam.set.setId, title: exam.set.title, date: todayStr(), total: total, sections: secMap, pass: pass });
    if (results.length > 100) results = results.slice(-100);
    lsSet(K.results, results);
    lsDel(K.exam);
    state.lastResult = { set: exam.set, total: total, pass: pass, secResults: secResults, elapsedSec: Math.min(exam.set.timeLimitMin * 60, Math.floor((Date.now() - exam.startedAt) / 1000)) };
    state.exam = null;
    state.screen = "result";
    render();
  }

  function renderExam() {
    var exam = state.exam;
    var sec = exam.set.sections[exam.secIdx];
    var tabs = exam.set.sections.map(function (s, i) {
      var answered = 0;
      s.questions.forEach(function (q) { if (isAnswered(q, exam.answers[q.id])) answered++; });
      var dot = answered === 0 ? "" : (answered === s.questions.length ? "full" : "some");
      return '<button type="button" class="sec-tab' + (i === exam.secIdx ? " active" : "") + '" data-sec="' + i + '">' +
        esc(s.label) + '<span class="dot ' + dot + '"></span></button>';
    }).join("");

    var qHtml = sec.questions.map(function (q, qi) {
      var head = sec.questions.length > 1 ? "（" + (qi + 1) + "）" : "";
      return '<div class="card q-block"><div class="q-title">' + esc(sec.label) + head +
        ' <span class="muted">' + qPoints(q) + "点</span></div>" +
        questionInputHtml(q, exam.answers[q.id]) + "</div>";
    }).join("");

    app.innerHTML =
      '<div class="exam-head">' +
      '<div class="timer" id="timer">--:--</div>' +
      '<div class="sec-tabs">' + tabs + "</div>" +
      '<button type="button" class="primary" id="submit-btn">試験終了・採点</button>' +
      "</div>" +
      '<div class="sub" style="margin-bottom:8px;">' + esc(exam.set.title) + "　" + esc(sec.subtitle || "") + "</div>" +
      qHtml +
      '<div class="exam-foot">' +
      '<button type="button" id="prev-sec"' + (exam.secIdx === 0 ? " disabled" : "") + ">← 前の大問</button>" +
      '<button type="button" id="next-sec"' + (exam.secIdx === exam.set.sections.length - 1 ? " disabled" : "") + ">次の大問 →</button>" +
      "</div>";

    sec.questions.forEach(function (q) { restoreSelects(q, exam.answers[q.id]); });

    document.getElementById("submit-btn").onclick = function () { submitExam(false); };
    document.getElementById("prev-sec").onclick = function () { exam.secIdx--; saveExamSnapshot(); render(); };
    document.getElementById("next-sec").onclick = function () { exam.secIdx++; saveExamSnapshot(); render(); };
    app.querySelectorAll(".sec-tab").forEach(function (b) {
      b.onclick = function () { exam.secIdx = parseInt(b.getAttribute("data-sec"), 10); saveExamSnapshot(); render(); };
    });

    stopTimer();
    var timerEl = document.getElementById("timer");
    function tick() {
      var r = remainingSec();
      var m = Math.floor(r / 60), s = r % 60;
      timerEl.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
      if (r <= 600) timerEl.classList.add("warn");
      if (r <= 0) {
        stopTimer();
        alert("試験時間が終了しました。自動的に採点します。");
        submitExam(true);
      }
    }
    tick();
    timerId = setInterval(tick, 500);
  }

  function renderResult() {
    var r = state.lastResult;
    if (!r) { state.screen = "home"; render(); return; }
    var secRows = r.secResults.map(function (s) {
      return "<tr><td>" + esc(s.label) + '</td><td class="num">' + s.earned + " / " + s.points + "</td></tr>";
    }).join("");
    var review = r.secResults.map(function (s) {
      return s.qResults.map(function (qr, qi) {
        var mark = qr.graded.earned === qr.graded.max
          ? '<span class="mark-ok">○ ' + qr.graded.earned + "点</span>"
          : '<span class="mark-ng">' + (qr.graded.earned > 0 ? "△" : "×") + " " + qr.graded.earned + "/" + qr.graded.max + "点</span>";
        return '<div class="card"><div class="q-title">' + esc(s.label) +
          (s.qResults.length > 1 ? "（" + (qi + 1) + "）" : "") + " " + mark + " " +
          flagBtnHtml(qr.q.id) + lapsHtml(qr.q.id) + "</div>" +
          '<div class="q-text">' + qr.q.question + "</div>" +
          questionResultHtml(qr.q, qr.ans, qr.graded) + "</div>";
      }).join("");
    }).join("");
    var mins = Math.floor(r.elapsedSec / 60);
    app.innerHTML =
      '<div class="card"><h2>' + esc(r.set.title) + " 採点結果</h2>" +
      '<div class="score-hero"><span class="total">' + r.total + '<span style="font-size:18px;">点</span></span>' +
      '<span class="badge ' + (r.pass ? "pass" : "fail") + '">' + (r.pass ? "合格ライン到達" : "不合格（70点未満）") + "</span>" +
      '<span class="sub">所要時間 約' + mins + "分</span></div>" +
      '<table class="stats-table" style="margin-top:12px; max-width:320px;">' + secRows + "</table>" +
      '<div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">' +
      '<button type="button" class="primary" id="to-home">ホームへ</button>' +
      '<button type="button" id="retry">同じ模試をもう一度</button></div></div>' +
      "<h2>問題別の確認</h2>" + review;
    document.getElementById("to-home").onclick = goHome;
    document.getElementById("retry").onclick = function () { startExam(r.set.setId); };
  }

  /* ---------------- 分野別演習・復習 ---------------- */
  function practicePool() {
    return BOKI.practice.slice();
  }
  function allQuestions() {
    return Object.keys(QINDEX).map(function (id) { return QINDEX[id].q; });
  }

  function buildQueue(opts) {
    // opts: {topic, flaggedOnly, unclearedOnly, includeMock}
    var prog = getProgress();
    var pool = opts.includeMock ? allQuestions() : practicePool();
    var list = pool.filter(function (q) {
      if (opts.topic && q.topic !== opts.topic) return false;
      var p = prog[q.id];
      if (opts.flaggedOnly && !(p && p.flag)) return false;
      if (opts.unclearedOnly) {
        var att = (p && p.attempts) || [];
        if (att.length && att[att.length - 1].ok) return false;
      }
      return true;
    });
    // 解答回数が少ない順（周回しやすい並び）。同数なら元の順序
    list.sort(function (a, b) {
      var na = ((prog[a.id] || {}).attempts || []).length;
      var nb = ((prog[b.id] || {}).attempts || []).length;
      return na - nb;
    });
    return list;
  }

  function startPractice(opts) {
    var queue = buildQueue(opts);
    if (!queue.length) {
      alert("該当する問題がありません。");
      return;
    }
    state.practice = { queue: queue, idx: 0, opts: opts, answers: {}, graded: null };
    state.screen = "practice";
    render();
  }

  function renderPracticeMenu() {
    var prog = getProgress();
    var pool = practicePool();
    var byTopic = {};
    pool.forEach(function (q) {
      (byTopic[q.topic] = byTopic[q.topic] || []).push(q);
    });
    var cats = { "商業簿記": [], "工業簿記": [] };
    Object.keys(BOKI.topics).forEach(function (key) {
      if (!byTopic[key]) return;
      var t = BOKI.topics[key];
      var qs = byTopic[key];
      var flagged = qs.filter(function (q) { return prog[q.id] && prog[q.id].flag; }).length;
      var info = lapInfo(qs.map(function (q) { return q.id; }));
      cats[t.cat].push(
        '<div class="topic-row" data-topic="' + esc(key) + '">' +
        '<span class="t-name">' + esc(t.label) + "</span>" +
        '<span class="t-stat">' + qs.length + "問 / " + info.lap + "周目" +
        (flagged ? ' / <span style="color:var(--flag);">🚩' + flagged + "</span>" : "") + "</span>" +
        "</div>");
    });
    var poolIds = pool.map(function (q) { return q.id; });
    app.innerHTML =
      '<div class="card"><h2>分野別演習</h2>' +
      '<div class="filter-row"><span class="sub">出題フィルタ:</span>' +
      '<button type="button" class="chip' + (menuFilter === "all" ? " active" : "") + '" data-filter="all">すべて</button>' +
      '<button type="button" class="chip' + (menuFilter === "flag" ? " active" : "") + '" data-filter="flag">🚩のみ</button>' +
      '<button type="button" class="chip' + (menuFilter === "unclear" ? " active" : "") + '" data-filter="unclear">未クリアのみ</button>' +
      "</div>" +
      lapProgressHtml("演習プール全体の周回", poolIds) +
      "</div>" +
      '<div class="card"><h3 style="margin-top:0;">商業簿記</h3><div class="topic-list">' + cats["商業簿記"].join("") + "</div>" +
      "<h3>工業簿記</h3>" + '<div class="topic-list">' + cats["工業簿記"].join("") + "</div></div>" +
      '<button type="button" id="back-home">← ホームへ</button>';
    app.querySelectorAll(".chip").forEach(function (b) {
      b.onclick = function () { menuFilter = b.getAttribute("data-filter"); render(); };
    });
    app.querySelectorAll(".topic-row").forEach(function (row) {
      row.onclick = function () {
        startPractice({
          topic: row.getAttribute("data-topic"),
          flaggedOnly: menuFilter === "flag",
          unclearedOnly: menuFilter === "unclear"
        });
      };
    });
    document.getElementById("back-home").onclick = goHome;
  }
  var menuFilter = "all";

  function renderPractice() {
    var pr = state.practice;
    var q = pr.queue[pr.idx];
    var topicLabel = BOKI.topics[q.topic] ? BOKI.topics[q.topic].label : q.topic;
    var head = '<div class="card"><div class="q-title">' +
      esc(topicLabel) + ' <span class="muted">' + (pr.idx + 1) + " / " + pr.queue.length + "問</span> " +
      flagBtnHtml(q.id) + lapsHtml(q.id) + "</div>";

    if (!pr.graded) {
      app.innerHTML = head + questionInputHtml(q, pr.answers[q.id]) +
        '<div class="practice-nav">' +
        '<button type="button" id="quit-practice">中断してメニューへ</button>' +
        '<button type="button" class="primary" id="grade-btn">採点する</button>' +
        "</div></div>";
      restoreSelects(q, pr.answers[q.id]);
      document.getElementById("grade-btn").onclick = function () {
        var g = gradeQuestion(q, pr.answers[q.id]);
        pr.graded = g;
        recordAttempt(q.id, g.earned === g.max);
        render();
      };
    } else {
      var g = pr.graded;
      var mark = g.earned === g.max
        ? '<span class="mark-ok">正解！ ' + g.earned + "点</span>"
        : '<span class="mark-ng">' + (g.earned > 0 ? "部分正解 " + g.earned + "/" + g.max + "点" : "不正解") + "</span>";
      var last = pr.idx >= pr.queue.length - 1;
      app.innerHTML = head +
        '<div class="q-text">' + q.question + "</div>" +
        '<div style="font-size:18px; margin-bottom:8px;">' + mark + "</div>" +
        questionResultHtml(q, pr.answers[q.id], g) +
        '<div class="practice-nav">' +
        '<button type="button" id="quit-practice">メニューへ</button>' +
        '<button type="button" class="primary" id="next-q">' + (last ? "終了（メニューへ）" : "次の問題 →") + "</button>" +
        "</div></div>";
      document.getElementById("next-q").onclick = function () {
        if (last) { endPractice(); return; }
        pr.idx++;
        pr.graded = null;
        render();
      };
    }
    document.getElementById("quit-practice").onclick = endPractice;
  }
  function endPractice() {
    var wasReview = state.practice && state.practice.opts && state.practice.opts.review;
    state.practice = null;
    state.screen = wasReview ? "home" : "practiceMenu";
    render();
  }

  /* ---------------- 成績 ---------------- */
  function renderStats() {
    var results = lsGet(K.results, []).slice().reverse();
    var rows = results.slice(0, 20).map(function (r) {
      return "<tr><td>" + esc(r.date) + "</td><td>" + esc(r.title || r.setId) + '</td><td class="num">' + r.total + "点</td><td>" +
        (r.pass ? '<span class="mark-ok">合格</span>' : '<span class="mark-ng">不合格</span>') + "</td></tr>";
    }).join("");
    var ts = lsGet(K.topic, {});
    var bars = Object.keys(BOKI.topics).filter(function (k) { return ts[k] && ts[k].att > 0; }).map(function (k) {
      var t = ts[k];
      var rate = Math.round((t.ok / t.att) * 100);
      var cls = rate >= 80 ? "" : (rate >= 50 ? "mid" : "low");
      return '<div style="display:flex; align-items:center; gap:10px; margin:4px 0;">' +
        '<span style="min-width:180px;" class="sub">' + esc(BOKI.topics[k].label) + "</span>" +
        '<div class="rate-bar" style="flex:1;"><i class="' + cls + '" style="width:' + rate + '%"></i></div>' +
        '<span class="sub" style="min-width:90px; text-align:right;">' + rate + "%（" + t.ok + "/" + t.att + "）</span></div>";
    }).join("");
    var lapCards = lapProgressHtml("演習プール全体", practicePool().map(function (q) { return q.id; }));
    BOKI.mocks.forEach(function (set) {
      var ids = [];
      set.sections.forEach(function (s) { s.questions.forEach(function (q) { ids.push(q.id); }); });
      lapCards += lapProgressHtml(set.title, ids);
    });
    app.innerHTML =
      '<div class="card"><h2>周回の進み具合（目標: 5周）</h2>' + lapCards + "</div>" +
      '<div class="card"><h2>模試の成績履歴</h2>' +
      (rows ? '<table class="stats-table"><tr><th>日付</th><th>模試</th><th>得点</th><th>判定</th></tr>' + rows + "</table>" : '<div class="sub">まだ受験記録がありません。</div>') + "</div>" +
      '<div class="card"><h2>分野別正答率</h2>' + (bars || '<div class="sub">まだ解答記録がありません。</div>') + "</div>" +
      '<button type="button" id="back-home">← ホームへ</button>';
    document.getElementById("back-home").onclick = goHome;
  }

  /* ---------------- ホーム ---------------- */
  function flaggedCount() {
    var prog = getProgress();
    return Object.keys(prog).filter(function (id) { return prog[id].flag && QINDEX[id]; }).length;
  }

  function renderHome() {
    var snap = lsGet(K.exam, null);
    var resumeHtml = "";
    if (snap && findSet(snap.setId)) {
      var set = findSet(snap.setId);
      resumeHtml = '<div class="resume-banner"><span>📝 <b>' + esc(set.title) + "</b> が受験途中です。</span>" +
        '<span style="display:flex; gap:8px;"><button type="button" class="primary" id="resume-exam">再開する</button>' +
        '<button type="button" id="discard-exam">破棄</button></span></div>';
    }
    var results = lsGet(K.results, []);
    var setRows = BOKI.mocks.map(function (set) {
      var hist = results.filter(function (r) { return r.setId === set.setId; });
      var best = hist.length ? Math.max.apply(null, hist.map(function (r) { return r.total; })) : null;
      return '<div class="set-row"><div><div class="set-name">' + esc(set.title) + "</div>" +
        '<div class="set-meta">90分・100点満点（70点で合格）' +
        (hist.length ? "　受験" + hist.length + "回 / 自己ベスト " + best + "点" : "　未受験") + "</div></div>" +
        '<button type="button" class="primary" data-start="' + esc(set.setId) + '">受験する</button></div>';
    }).join("");
    var nFlag = flaggedCount();
    var poolIds = practicePool().map(function (q) { return q.id; });
    app.innerHTML =
      resumeHtml +
      '<div class="card"><h2>学習メニュー</h2><div class="mode-grid">' +
      '<button type="button" class="mode-btn" id="go-practice"><span class="mode-title">✏️ 分野別演習</span><div class="mode-desc">論点別に1問ずつ解いて即採点。仕訳・工簿の基礎固めに。</div></button>' +
      '<button type="button" class="mode-btn" id="go-review"><span class="mode-title">🚩 間違い復習</span><div class="mode-desc">フラグ付きの問題だけを再出題（現在 ' + nFlag + " 問）。</div></button>" +
      '<button type="button" class="mode-btn" id="go-stats"><span class="mode-title">📊 成績・周回</span><div class="mode-desc">模試履歴・分野別正答率・周回の進み具合。</div></button>' +
      "</div>" +
      lapProgressHtml("演習プール周回（目標5周）", poolIds) +
      "</div>" +
      '<div class="card"><h2>模擬試験（ネット試験形式）</h2><div class="set-list">' + setRows + "</div></div>";

    if (snap && findSet(snap.setId)) {
      document.getElementById("resume-exam").onclick = function () { startExam(snap.setId, snap); };
      document.getElementById("discard-exam").onclick = function () {
        if (confirm("受験途中のデータを破棄しますか？")) { lsDel(K.exam); render(); }
      };
    }
    document.getElementById("go-practice").onclick = function () { state.screen = "practiceMenu"; render(); };
    document.getElementById("go-review").onclick = function () {
      startPractice({ flaggedOnly: true, includeMock: true, review: true });
    };
    document.getElementById("go-stats").onclick = function () { state.screen = "stats"; render(); };
    app.querySelectorAll("[data-start]").forEach(function (b) {
      b.onclick = function () {
        var snap2 = lsGet(K.exam, null);
        if (snap2 && snap2.setId !== b.getAttribute("data-start")) {
          if (!confirm("別の模試が受験途中です。破棄して新しく始めますか？")) return;
        }
        lsDel(K.exam);
        startExam(b.getAttribute("data-start"));
      };
    });
  }

  /* ---------------- ルーティング ---------------- */
  function goHome() {
    stopTimer();
    if (state.exam) saveExamSnapshot();
    state.exam = null;
    state.practice = null;
    state.screen = "home";
    render();
  }

  function render() {
    stopTimer();
    if (state.screen === "exam") renderExam();
    else if (state.screen === "result") renderResult();
    else if (state.screen === "practiceMenu") renderPracticeMenu();
    else if (state.screen === "practice") renderPractice();
    else if (state.screen === "stats") renderStats();
    else renderHome();
    window.scrollTo(0, 0);
  }

  /* ---------------- 入力・クリックの委譲 ---------------- */
  function currentAnswers() {
    if (state.screen === "exam" && state.exam) return state.exam.answers;
    if (state.screen === "practice" && state.practice) return state.practice.answers;
    return null;
  }
  app.addEventListener("input", onInput);
  app.addEventListener("change", onInput);
  function onInput(e) {
    var el = e.target;
    var store = currentAnswers();
    if (!store) return;
    if (isAmountInput(el)) formatAmountInput(el);
    if (el.hasAttribute("data-j")) {
      var qid = el.getAttribute("data-j");
      var side = el.getAttribute("data-side");
      var idx = parseInt(el.getAttribute("data-idx"), 10);
      var f = el.getAttribute("data-f");
      var ans = store[qid] = store[qid] || { debit: [], credit: [] };
      var row = ans[side][idx] = ans[side][idx] || { a: "", v: "" };
      row[f] = el.value;
      if (state.screen === "exam") scheduleSave();
    } else if (el.hasAttribute("data-c")) {
      var qid2 = el.getAttribute("data-c");
      var key = el.getAttribute("data-key");
      var ans2 = store[qid2] = store[qid2] || {};
      ans2[key] = el.value;
      if (state.screen === "exam") scheduleSave();
    }
  }
  app.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-flag]") : null;
    if (btn) {
      toggleFlag(btn.getAttribute("data-flag"));
      btn.classList.toggle("on");
    }
  });

  document.getElementById("brand").addEventListener("click", function () {
    if (state.screen === "exam") {
      if (!confirm("試験を中断してホームへ戻りますか？（途中経過は保存され、あとで再開できます）")) return;
    }
    goHome();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && state.exam) saveExamSnapshot();
  });

  /* ---------------- 電卓 ---------------- */
  var calcEl = document.getElementById("calc");
  var calcMain = document.getElementById("calc-main");
  var calcSub = document.getElementById("calc-sub");
  var calc = { cur: "0", acc: null, op: null, fresh: true, mem: 0 };
  var lastAmountInput = null;

  /* 金額入力欄にフォーカスが入るたび、貼り付け先として覚えておく */
  document.addEventListener("focusin", function (e) {
    if (isAmountInput(e.target)) lastAmountInput = e.target;
  });

  function calcFmt(numStr) {
    var s = String(numStr);
    if (s === "" || s === "-" || s === "エラー") return s || "0";
    var neg = s.charAt(0) === "-";
    if (neg) s = s.slice(1);
    var p = s.split(".");
    return (neg ? "-" : "") + groupDigits(p[0]) + (p.length > 1 ? "." + p[1] : "");
  }
  function calcRender() {
    calcMain.textContent = calcFmt(calc.cur);
    var sub = "";
    if (calc.acc !== null && calc.op) {
      sub = calcFmt(String(calc.acc)) + " " + ({ "+": "＋", "-": "−", "*": "×", "/": "÷" }[calc.op] || calc.op);
    }
    if (calc.mem !== 0) sub = (sub ? sub + "　" : "") + "M";
    calcSub.textContent = sub;
  }
  function calcRound(n) {
    if (!isFinite(n)) return NaN;
    return Math.round(n * 1e8) / 1e8;
  }
  function calcApply(a, op, b) {
    if (op === "+") return a + b;
    if (op === "-") return a - b;
    if (op === "*") return a * b;
    if (op === "/") return b === 0 ? NaN : a / b;
    return b;
  }
  function calcNum() {
    var v = parseFloat(calc.cur);
    return isNaN(v) ? 0 : v;
  }
  function calcSetResult(v) {
    calc.cur = isNaN(v) ? "エラー" : String(calcRound(v));
    calc.fresh = true;
  }
  function calcKey(k) {
    if (calc.cur === "エラー" && k !== "AC" && k !== "C") { calc.cur = "0"; calc.fresh = true; }
    if (/^\d$/.test(k) || k === "00") {
      if (calc.fresh) { calc.cur = k === "00" ? "0" : k; calc.fresh = false; }
      else if (calc.cur === "0") { calc.cur = k === "00" ? "0" : k; }
      else if (calc.cur.replace(/[^0-9]/g, "").length < 14) { calc.cur += k; }
    } else if (k === ".") {
      if (calc.fresh) { calc.cur = "0."; calc.fresh = false; }
      else if (calc.cur.indexOf(".") < 0) calc.cur += ".";
    } else if (k === "+" || k === "-" || k === "*" || k === "/") {
      if (calc.acc !== null && calc.op && !calc.fresh) {
        calcSetResult(calcApply(calc.acc, calc.op, calcNum()));
      }
      calc.acc = calcNum();
      calc.op = k;
      calc.fresh = true;
    } else if (k === "=") {
      if (calc.acc !== null && calc.op) {
        calcSetResult(calcApply(calc.acc, calc.op, calcNum()));
        calc.acc = null;
        calc.op = null;
      }
    } else if (k === "AC") {
      calc.cur = "0"; calc.acc = null; calc.op = null; calc.fresh = true;
    } else if (k === "C") {
      calc.cur = "0"; calc.fresh = true;
    } else if (k === "BS") {
      if (!calc.fresh && calc.cur.length > 1) calc.cur = calc.cur.slice(0, -1);
      else { calc.cur = "0"; calc.fresh = true; }
    } else if (k === "M+") {
      calc.mem = calcRound(calc.mem + calcNum()); calc.fresh = true;
    } else if (k === "M-") {
      calc.mem = calcRound(calc.mem - calcNum()); calc.fresh = true;
    } else if (k === "MR") {
      calc.cur = String(calc.mem); calc.fresh = true;
    } else if (k === "MC") {
      calc.mem = 0;
    }
    calcRender();
  }

  function calcOpen(open) {
    calcEl.classList.toggle("hidden", !open);
    if (open) {
      calcEl.focus();
      calcRender();
    }
    var st = lsGet("boki_v1_calc", {});
    st.open = open;
    lsSet("boki_v1_calc", st);
  }
  function calcIsOpen() { return !calcEl.classList.contains("hidden"); }

  calcEl.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-k]") : null;
    if (b) { calcKey(b.getAttribute("data-k")); calcEl.focus(); }
  });
  document.getElementById("calc-close").onclick = function () { calcOpen(false); };
  document.getElementById("calc-toggle").onclick = function () { calcOpen(!calcIsOpen()); };
  document.getElementById("calc-paste").onclick = function () {
    var target = lastAmountInput;
    if (!target || !document.body.contains(target)) {
      alert("先に解答欄をクリックしてから、この電卓の値を貼り付けてください。");
      return;
    }
    if (calc.cur === "エラー") return;
    target.value = calc.cur;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.focus();
  };

  /* 電卓にフォーカスがあるときだけキー操作を受け付ける（解答欄の入力を邪魔しない） */
  calcEl.addEventListener("keydown", function (e) {
    var k = e.key;
    var map = { Enter: "=", "=": "=", Backspace: "BS", Delete: "C", Escape: null };
    if (/^\d$/.test(k)) { calcKey(k); e.preventDefault(); return; }
    if (k === "." || k === "*" || k === "/" || k === "+" || k === "-") { calcKey(k); e.preventDefault(); return; }
    if (k === "x" || k === "X") { calcKey("*"); e.preventDefault(); return; }
    if (k === "Escape") { calcOpen(false); e.preventDefault(); return; }
    if (map[k]) { calcKey(map[k]); e.preventDefault(); }
  });

  /* Alt+C でどこからでも開閉 */
  document.addEventListener("keydown", function (e) {
    if (e.altKey && (e.code === "KeyC" || e.key === "c" || e.key === "C")) {
      calcOpen(!calcIsOpen());
      e.preventDefault();
    }
  });

  /* ドラッグで移動（位置は記憶する） */
  (function enableCalcDrag() {
    var head = document.getElementById("calc-head");
    var drag = null;
    head.addEventListener("pointerdown", function (e) {
      if (e.target.id === "calc-close") return;
      var r = calcEl.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
      head.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    head.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var x = Math.min(Math.max(0, e.clientX - drag.dx), window.innerWidth - drag.w);
      var y = Math.min(Math.max(0, e.clientY - drag.dy), window.innerHeight - drag.h);
      calcEl.style.left = x + "px";
      calcEl.style.top = y + "px";
      calcEl.style.right = "auto";
      calcEl.style.bottom = "auto";
    });
    head.addEventListener("pointerup", function (e) {
      if (!drag) return;
      drag = null;
      head.releasePointerCapture(e.pointerId);
      var st = lsGet("boki_v1_calc", {});
      st.left = calcEl.style.left;
      st.top = calcEl.style.top;
      lsSet("boki_v1_calc", st);
    });
  })();

  /* 前回の開閉状態・位置を復元 */
  (function restoreCalc() {
    var st = lsGet("boki_v1_calc", {});
    if (st.left && st.top) {
      calcEl.style.left = st.left;
      calcEl.style.top = st.top;
      calcEl.style.right = "auto";
      calcEl.style.bottom = "auto";
    }
    if (st.open) calcEl.classList.remove("hidden");
    calcRender();
  })();

  /* デバッグ用（コンソールから採点ロジックを検証できる） */
  BOKI.debug = {
    parseAmount: parseAmount,
    gradeJournal: gradeJournal,
    gradeCells: gradeCells,
    lapInfo: lapInfo,
    qindex: QINDEX
  };

  buildIndex();
  render();
})();
