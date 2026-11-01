/* =====================================================================
   app.js — 탭, ① 일일 입력, ② 월말 정산, ⑤ 설정·백업, 시작
   ===================================================================== */

/* ---------- 숫자 입력칸: 자동 쉼표 ---------- */
document.querySelectorAll('.num').forEach((el) => {
  el.addEventListener('input', () => {
    const v = el.value.replace(/[^\d]/g, '');
    el.value = v === '' ? '' : Number(v).toLocaleString('ko-KR');
  });
  el.addEventListener('focus', () => el.select());
});
function enterChain(ids, onLast) {
  ids.forEach((id, i) => $(id).addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    if (i < ids.length - 1) $(ids[i + 1]).focus(); else onLast();
  }));
}

/* ---------- 탭 ---------- */
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(name) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('section.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + name));
  hideTip();
  if (name === 'daily') { loadDaily(); renderRecent(); }
  if (name === 'monthly') loadMonthly();
  if (name === 'dash') renderDashboard();
  if (name === 'report') renderReport();
  if (name === 'settings') { loadSettings(); renderDataTables(); }
}

/* =====================================================================
   ① 일일 입력
   ===================================================================== */
$('todayLabel').textContent = `오늘 ${dateLabel(TODAY)}`;
$('dDate').value = TODAY;
let legacyRevenue = null; // 결제수단 구분 없이 저장된 예전 기록의 합계

function updateTotal() {
  const t = (numVal($('dCard')) || 0) + (numVal($('dCash')) || 0) + (numVal($('dTransfer')) || 0);
  const useLegacy = !t && legacyRevenue != null;
  $('dTotal').textContent = useLegacy ? `${won(legacyRevenue)} (결제수단 미구분)` : won(t);
}
['dCard', 'dCash', 'dTransfer'].forEach((id) => $(id).addEventListener('input', updateTotal));

function renderDayInfo() {
  const d = $('dDate').value; if (!d) return;
  const parts = [`<span>${dateLabel(d)}</span>`];
  const hol = holidayInfo(d);
  if (hol) {
    parts.push(`<span class="hol">🎌 ${escapeHtml(hol.name)}</span>`);
    if (hol.kind === 'legal') parts.push('<span>법정공휴일 · 휴진</span>');
    else parts.push(`<span>${hol.name.startsWith(HOLIDAY_KIND_LABEL[hol.kind]) ? '' : HOLIDAY_KIND_LABEL[hol.kind] + ' · '}<b>${isHolidayOpen(d) ? '진료' : '휴진'}</b>
      <button class="btn btn-mini" id="toggleHolOpen">${isHolidayOpen(d) ? '휴진으로 변경' : '진료하는 날로 변경'}</button></span>`);
  }
  if (!DB.daily[d] && S().closedWeekdays.includes(weekday(d))) parts.push('<span>정기 휴진 요일</span>');
  const w = weatherOf(d); if (w) parts.push(`<span>${escapeHtml(weatherText(w, true))}</span>`);
  $('dayInfo').innerHTML = parts.join('');
  const tb = $('toggleHolOpen');
  if (tb) tb.onclick = () => { setHolidayOpen(d, !isHolidayOpen(d)); renderDayInfo(); renderRecent(); };
}
function loadDaily() {
  const d = $('dDate').value;
  const r = DB.daily[d];
  const closed = !!r?.closed;
  $('closedBox').hidden = !closed; $('openForm').hidden = closed;
  $('closedMemo').textContent = r?.memo ? `메모: ${r.memo}` : '';
  $('markClosed').hidden = closed;
  setNum($('dPatients'), r?.patients); setNum($('dNew'), r?.newPatients);
  setNum($('dCard'), r?.card); setNum($('dCash'), r?.cash); setNum($('dTransfer'), r?.transfer);
  setNum($('dNonCovered'), r?.nonCovered);
  $('dMemo').value = r?.memo || '';
  legacyRevenue = r && !closed && r.card == null && r.cash == null && r.transfer == null ? r.revenue : null;
  $('dailyMode').textContent = !r ? '새 기록' : closed ? '휴진' : '기존 기록 수정';
  updateTotal(); renderDayInfo();
  if (!weatherOf(d) && d <= TODAY) ensureWeather(d, d).then((ch) => ch && renderDayInfo());
}
$('dDate').addEventListener('change', loadDaily);
const moveDay = (n) => { $('dDate').value = addDays($('dDate').value || TODAY, n); loadDaily(); };
$('prevDay').onclick = () => moveDay(-1);
$('nextDay').onclick = () => moveDay(1);
$('goToday').onclick = () => { $('dDate').value = TODAY; loadDaily(); };
enterChain(['dPatients', 'dNew', 'dCard', 'dCash', 'dTransfer', 'dNonCovered', 'dMemo'], () => saveDaily());
$('saveDaily').onclick = () => saveDaily();

function afterSave(date) {
  renderRecent();
  // 지난 날짜를 몰아서 입력할 때 다음 날로 자동 이동 (휴진 요일·공휴일은 건너뜀)
  if (date < TODAY) {
    let nd = addDays(date, 1);
    while (nd < TODAY && isScheduledClosed(nd) && !DB.daily[nd]) nd = addDays(nd, 1);
    $('dDate').value = nd;
  }
  loadDaily();
  if (!$('openForm').hidden) $('dPatients').focus();
}
function saveDaily() {
  const date = $('dDate').value, st = $('dailyStatus');
  if (!date) return flash(st, '날짜를 선택해 주세요.', false);
  if (DB.daily[date]?.closed) { // 휴진일에서는 메모만 저장
    DB.daily[date].memo = $('dMemo').value.trim(); persist();
    flash(st, `✔ ${dateLabel(date)} 휴진 메모를 저장했습니다.`); return afterSave(date);
  }
  const patients = numVal($('dPatients')), newPatients = numVal($('dNew'));
  const card = numVal($('dCard')), cash = numVal($('dCash')), transfer = numVal($('dTransfer'));
  const nonCovered = numVal($('dNonCovered'));
  const anyPay = card != null || cash != null || transfer != null;
  const revenue = anyPay ? (card || 0) + (cash || 0) + (transfer || 0) : legacyRevenue;
  if (patients == null) { $('dPatients').focus(); return flash(st, '총 내원 환자 수를 입력해 주세요. (휴진이면 🚪 휴진 버튼)', false); }
  if (revenue == null) { $('dCard').focus(); return flash(st, '결제수단별 수납액을 하나 이상 입력해 주세요. (없으면 0)', false); }
  if (newPatients != null && newPatients > patients) { $('dNew').focus(); return flash(st, '신규 환자 수가 총 환자 수보다 많습니다.', false); }
  if (nonCovered != null && nonCovered > revenue) { $('dNonCovered').focus(); return flash(st, '비급여 매출이 일 매출 합계보다 많습니다.', false); }
  const rec = { patients, newPatients, revenue, nonCovered, memo: $('dMemo').value.trim() };
  if (anyPay) Object.assign(rec, { card: card || 0, cash: cash || 0, transfer: transfer || 0 });
  DB.daily[date] = rec; persist();
  flash(st, `✔ ${dateLabel(date)} 기록이 저장되었습니다.`);
  afterSave(date);
}
$('markClosed').onclick = () => {
  const date = $('dDate').value; if (!date) return;
  const r = DB.daily[date];
  if (r && !r.closed && !confirm(`${dateLabel(date)}에 이미 진료 기록이 있습니다. 휴진으로 바꿀까요?`)) return;
  DB.daily[date] = { closed: true, memo: $('dMemo').value.trim() }; persist();
  flash($('dailyStatus'), `✔ ${dateLabel(date)}을(를) 휴진으로 기록했습니다.`);
  afterSave(date);
};
$('cancelClosed').onclick = () => {
  const date = $('dDate').value; delete DB.daily[date]; persist();
  loadDaily(); renderRecent(); $('dPatients').focus();
};

function renderRecent() {
  const days = []; for (let i = 0; i < 14; i++) days.push(addDays(TODAY, -i));
  const row = (d) => {
    const r = DB.daily[d], st = dayStatus(d);
    const wd = weekday(d), cls = wd === 0 || holidayName(d) ? 'sun' : wd === 6 ? 'sat' : '';
    const dateBtn = `<button class="link ${cls}" data-date="${d}">${shortDate(d)} (${WD[wd]})</button>`;
    const notes = dayNotes(d);
    if (st === 'open') return `<tr><td>${dateBtn}</td><td>${fmt(r.patients)}</td><td>${fmt(r.newPatients)}</td><td>${fmt(r.revenue)}</td><td>${r.patients ? fmt(r.revenue / r.patients) : '-'}</td><td class="left">${notes}</td></tr>`;
    return `<tr><td>${dateBtn}</td><td colspan="4" class="muted" style="text-align:center">${STATUS_LABEL[st] || '-'}</td><td class="left">${notes}</td></tr>`;
  };
  $('recentBody').innerHTML = days.map(row).join('');
  $('recentBody').querySelectorAll('button[data-date]').forEach((b) => b.onclick = () => { $('dDate').value = b.dataset.date; loadDaily(); if (!$('openForm').hidden) $('dPatients').focus(); });
}
let recentWxTried = false;
function refreshRecentWeather() {
  if (recentWxTried) return; recentWxTried = true;
  ensureWeather(addDays(TODAY, -13), TODAY).then((ch) => { if (ch) { renderRecent(); renderDayInfo(); } });
}

/* =====================================================================
   ② 월말 정산
   ===================================================================== */
const MONTHLY_FIELDS = { mClaim: 'claim', mInsurance: 'insurance', mLabor: 'labor', mRent: 'rent', mSupplies: 'supplies', mOther: 'other' };
$('mMonth').value = addMonths(TODAY.slice(0, 7), -1); // 기본: 지난달
const moveMonth = (n) => { $('mMonth').value = addMonths($('mMonth').value, n); loadMonthly(); };
$('prevMonth').onclick = () => moveMonth(-1);
$('nextMonth').onclick = () => moveMonth(1);
$('mMonth').addEventListener('change', loadMonthly);
enterChain(Object.keys(MONTHLY_FIELDS), () => saveMonthly());
$('saveMonthly').onclick = () => saveMonthly();

function loadMonthly() {
  const r = DB.monthly[$('mMonth').value];
  for (const [id, k] of Object.entries(MONTHLY_FIELDS)) setNum($(id), r?.[k]);
  $('monthlyMode').textContent = r ? '기존 기록 수정' : '새 기록';
  renderMonthSummary();
}
function saveMonthly() {
  const m = $('mMonth').value, st = $('monthlyStatus');
  if (!m) return flash(st, '정산 월을 선택해 주세요.', false);
  const rec = {};
  for (const [id, k] of Object.entries(MONTHLY_FIELDS)) rec[k] = numVal($(id));
  if (Object.values(rec).every((v) => v == null)) return flash(st, '입력된 값이 없습니다.', false);
  if (rec.claim != null && rec.insurance != null && rec.insurance > rec.claim * 1.2 && !confirm('보험 지급액이 청구액보다 20% 이상 많습니다. 그대로 저장할까요?')) return;
  DB.monthly[m] = rec; persist();
  flash(st, `✔ ${monthLabel(m)} 정산이 저장되었습니다.`);
  loadMonthly();
}
function renderMonthSummary() {
  const m = $('mMonth').value; if (!m) return;
  const a = monthAgg(m), be = breakEven(m), target = Number(S().monthlyTarget) || null;
  $('monthSummaryTitle').textContent = `${monthLabel(m)} 요약`;
  const na = '<span class="muted">미입력</span>';
  const row = (k, v, strong, sep) => `<tr class="${sep ? 'sep' : ''}"><td>${k}</td><td class="${strong ? 'strong' : ''}">${v}</td></tr>`;
  $('monthSummary').innerHTML = [
    row('진료일수 / 휴진', `${a.openDays}일 / ${a.closedDays}일`),
    row('총 내원 환자', `${fmt(a.patients)}명 (일평균 ${a.openDays ? (a.patients / a.openDays).toFixed(1) : '-'}명)`),
    row('신규 환자', `${fmt(a.newPatients)}명`),
    row('일 매출 합계', won(a.revenue), false, true),
    row('　└ 비급여', won(a.nonCovered)),
    row('　└ 카드 / 현금 / 이체', a.splitTotal ? `${pct(a.card / a.splitTotal * 100, 0)} / ${pct(a.cash / a.splitTotal * 100, 0)} / ${pct(a.transfer / a.splitTotal * 100, 0)}` : na),
    row('보험 청구액', a.hasClaim ? won(a.claim) : na, false, true),
    row('보험 지급액', a.hasInsurance ? won(a.insurance) : na),
    row('삭감액 (삭감률)', a.cutRate != null ? `${won(a.cut)} (${pct(a.cutRate, 2)})` : '-'),
    row('월 총수입', won(a.income), true, true),
    row('목표 달성률', target ? pct(a.income / target * 100) : '<span class="muted">목표 미설정</span>'),
    row('환자 1인당 총수입', a.patients ? won(a.income / a.patients) : '-'),
    row('지출 (카드 수수료 포함)', a.hasExpense ? won(a.expense) : na, false, true),
    row(`　└ 카드 수수료 (${S().cardFeeRate}%)`, won(a.cardFee)),
    row('순이익', a.hasExpense ? won(a.profit) : '-', true),
    row('순이익률', a.hasExpense && a.income ? pct(a.profit / a.income * 100) : '-'),
    row('손익분기 일 환자', be && !be.impossible ? `${be.dayPatients.toFixed(1)}명 (현재 ${be.currentDay.toFixed(1)}명)` : '-', false, true),
  ].join('');
}

/* =====================================================================
   ⑤ 설정·백업
   ===================================================================== */
$('sClosedWeekdays').innerHTML = WD_ORDER.map((w) => `<label><input type="checkbox" value="${w}"> ${WD[w]}</label>`).join('');
$('sRegion').innerHTML = Object.entries(REGIONS).map(([k, r]) => `<option value="${k}">${r.name}</option>`).join('');
function loadSettings() {
  const s = S();
  document.querySelectorAll('#sClosedWeekdays input').forEach((c) => { c.checked = s.closedWeekdays.includes(Number(c.value)); });
  $('sCardFee').value = s.cardFeeRate;
  $('sRegion').value = s.region;
  setNum($('sTarget'), s.monthlyTarget);
  setNum($('sFixed'), s.fixedCostOverride);
  $('sHolidays').value = s.extraHolidays || '';
  renderSourceHint(); renderHolidayTable();
}
function renderSourceHint() {
  $('sourceHint').innerHTML = `※ 공휴일: <b>${holidaySource(String(holYear))}</b> (대한민국 기준)<br>※ ${weatherSourceText()}<br>
    ※ 날씨 조회에는 선택한 <b>시 단위 지역</b>만 전송하며, 진료 데이터는 전송하지 않습니다.`;
}
let holYear = Number(TODAY.slice(0, 4));
function renderHolidayTable() {
  $('hYear').textContent = `${holYear}년`;
  $('hSource').textContent = `출처: ${holidaySource(String(holYear))} · 대한민국 공휴일 기준`;
  const list = holidaysInYear(holYear);
  $('holidayBody').innerHTML = list.map((h) => {
    const wd = weekday(h.date);
    const weekendNote = S().closedWeekdays.includes(wd) ? ' <span class="muted">(정기 휴진 요일)</span>' : '';
    const ctl = h.kind === 'legal'
      ? '<span class="muted">휴진 (고정)</span>'
      : `<label style="display:inline-flex;gap:8px;align-items:center;cursor:pointer;font-weight:600"><input type="checkbox" data-hol="${h.date}" ${isHolidayOpen(h.date) ? 'checked' : ''} style="width:18px;height:18px"> 이 날 진료함</label>`;
    return `<tr><td class="${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}">${dateLabel(h.date)}</td><td class="left">${escapeHtml(h.name)}${weekendNote}</td>
      <td class="left"><span class="tag ${h.kind === 'legal' ? 'holiday' : 'closed'}">${HOLIDAY_KIND_LABEL[h.kind]}</span></td><td class="left">${ctl}</td></tr>`;
  }).join('') || `<tr><td colspan="4" class="muted">${holYear}년 공휴일 정보가 없습니다. 웹 배포 + 공공데이터 키를 설정하거나 위의 '추가 공휴일'에 입력해 주세요.</td></tr>`;
  document.querySelectorAll('[data-hol]').forEach((c) => c.onchange = () => {
    setHolidayOpen(c.dataset.hol, c.checked);
    flash($('settingsStatus'), `✔ ${dateLabel(c.dataset.hol)}: ${c.checked ? '진료하는 날로' : '휴진으로'} 저장했습니다.`);
  });
}
$('hPrev').onclick = () => { holYear--; refreshHolidays([holYear]).then(() => renderHolidayTable()); renderHolidayTable(); };
$('hNext').onclick = () => { holYear++; refreshHolidays([holYear]).then(() => renderHolidayTable()); renderHolidayTable(); };
$('reloadWeather').onclick = () => {
  resetWeather(); recentWxTried = false;
  flash($('settingsStatus'), '날씨 정보를 다시 불러옵니다…');
  ensureWeather(addDays(TODAY, -13), TODAY).then(() => { renderSourceHint(); flash($('settingsStatus'), '✔ 최근 날씨를 다시 불러왔습니다. (나머지는 화면을 열 때 불러옵니다)'); });
};
$('saveSettings').onclick = () => {
  const fee = parseFloat($('sCardFee').value);
  if (isNaN(fee) || fee < 0 || fee > 10) return flash($('settingsStatus'), '카드 수수료율은 0~10 사이 숫자로 입력해 주세요.', false);
  const bad = ($('sHolidays').value || '').split('\n').map((l) => l.trim()).filter((l) => l && !/^\d{4}-\d{2}-\d{2}(\s|$)/.test(l));
  if (bad.length) return flash($('settingsStatus'), `추가 공휴일 형식을 확인해 주세요: "${bad[0]}" (예: 2026-05-01 근로자의 날)`, false);
  Object.assign(DB.settings, {
    closedWeekdays: [...document.querySelectorAll('#sClosedWeekdays input:checked')].map((c) => Number(c.value)),
    cardFeeRate: fee, region: $('sRegion').value,
    monthlyTarget: numVal($('sTarget')), fixedCostOverride: numVal($('sFixed')),
    extraHolidays: $('sHolidays').value.trim(),
  });
  persist(); recentWxTried = false; renderHolidayTable(); renderSourceHint();
  flash($('settingsStatus'), '✔ 설정을 저장했습니다.');
};

function renderDataTables() {
  const dk = Object.keys(DB.daily).sort().reverse();
  $('dailyCount').textContent = dk.length + '건';
  $('allDailyBody').innerHTML = dk.map((d) => {
    const r = DB.daily[d];
    const cells = r.closed ? `<td colspan="4" class="muted" style="text-align:center">휴진</td>` : `<td>${fmt(r.patients)}</td><td>${fmt(r.newPatients)}</td><td>${fmt(r.revenue)}</td><td>${fmt(r.nonCovered)}</td>`;
    return `<tr><td>${dateLabel(d)}</td>${cells}<td><button class="link" data-edit-d="${d}">수정</button><button class="link del" data-del-d="${d}">삭제</button></td></tr>`;
  }).join('') || '<tr><td colspan="6" class="muted">기록 없음</td></tr>';
  const mk = Object.keys(DB.monthly).sort().reverse();
  $('monthlyCount').textContent = mk.length + '건';
  $('allMonthlyBody').innerHTML = mk.map((m) => {
    const a = monthAgg(m);
    return `<tr><td>${m}</td><td>${a.hasClaim ? fmt(a.claim) : '-'}</td><td>${a.hasInsurance ? fmt(a.insurance) : '-'}</td><td>${a.hasExpense ? fmt(a.expense) : '-'}</td><td>${a.hasExpense ? fmt(a.profit) : '-'}</td>
      <td><button class="link" data-edit-m="${m}">수정</button><button class="link del" data-del-m="${m}">삭제</button></td></tr>`;
  }).join('') || '<tr><td colspan="6" class="muted">기록 없음</td></tr>';
  document.querySelectorAll('[data-edit-d]').forEach((b) => b.onclick = () => { $('dDate').value = b.dataset.editD; showTab('daily'); });
  document.querySelectorAll('[data-del-d]').forEach((b) => b.onclick = () => { if (confirm(`${b.dataset.delD} 기록을 삭제할까요?`)) { delete DB.daily[b.dataset.delD]; persist(); renderDataTables(); } });
  document.querySelectorAll('[data-edit-m]').forEach((b) => b.onclick = () => { $('mMonth').value = b.dataset.editM; showTab('monthly'); });
  document.querySelectorAll('[data-del-m]').forEach((b) => b.onclick = () => { if (confirm(`${b.dataset.delM} 정산을 삭제할까요?`)) { delete DB.monthly[b.dataset.delM]; persist(); renderDataTables(); } });
}

$('exportJson').onclick = () => download(`병원통계_백업_${TODAY}.json`, JSON.stringify(DB, null, 2), 'application/json');
$('importJson').onchange = (e) => {
  const file = e.target.files[0]; if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (!d.daily || !d.monthly) throw new Error('형식 오류');
      if (!confirm(`백업 파일을 불러옵니다 (일일 ${Object.keys(d.daily).length}건, 월말 ${Object.keys(d.monthly).length}건).\n같은 날짜의 기존 기록과 설정은 백업 내용으로 바뀝니다. 계속할까요?`)) return;
      Object.assign(DB.daily, d.daily); Object.assign(DB.monthly, d.monthly);
      if (d.settings) DB.settings = { ...DEFAULT_SETTINGS, ...d.settings };
      persist(); loadSettings(); renderDataTables(); flash($('dataStatus'), '✔ 백업 파일을 불러왔습니다.');
    } catch (err) { flash($('dataStatus'), '백업 파일을 읽을 수 없습니다.', false); }
    finally { e.target.value = ''; }
  };
  rd.readAsText(file, 'UTF-8');
};
$('exportCsv').onclick = () => {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = ['날짜,요일,상태,공휴일,내원환자,신규환자,카드,현금,계좌이체,일매출,비급여매출,메모'];
  Object.keys(DB.daily).sort().forEach((d) => {
    const r = DB.daily[d];
    lines.push([d, WD[weekday(d)], r.closed ? '휴진' : '진료', q(holidayName(d) || ''), r.patients ?? '', r.newPatients ?? '', r.card ?? '', r.cash ?? '', r.transfer ?? '', r.revenue ?? '', r.nonCovered ?? '', q(r.memo)].join(','));
  });
  lines.push('', '월,진료일,환자,일매출합계,카드,현금,계좌이체,카드수수료,보험청구액,보험지급액,삭감률(%),인건비,임대료관리비,재료약품비,기타지출,총수입,지출합계,순이익');
  const months = [...new Set([...Object.keys(DB.monthly), ...Object.keys(DB.daily).map((d) => d.slice(0, 7))])].sort();
  months.forEach((m) => {
    const a = monthAgg(m);
    lines.push([m, a.openDays, a.patients, a.revenue, a.card, a.cash, a.transfer, Math.round(a.cardFee), a.hasClaim ? a.claim : '', a.hasInsurance ? a.insurance : '',
      a.cutRate == null ? '' : a.cutRate.toFixed(2), a.labor ?? '', a.rent ?? '', a.supplies ?? '', a.other ?? '', a.income, a.hasExpense ? Math.round(a.expense) : '', a.hasExpense ? Math.round(a.profit) : ''].join(','));
  });
  download(`병원통계_${TODAY}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
};

/* 예시 데이터: 최근 2년 (전년 동월 비교 확인용) */
$('sampleData').onclick = () => {
  if (Object.keys(DB.daily).length && !confirm('예시 데이터(최근 2년)를 기존 기록 위에 덮어씁니다. 계속할까요?')) return;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const base = { 1: 78, 2: 62, 3: 58, 4: 60, 5: 66, 6: 48 };
  const start = addDays(TODAY, -730);
  for (let d = start; d <= TODAY; d = addDays(d, 1)) {
    const w = weekday(d);
    if (S().closedWeekdays.includes(w)) continue;
    if (isHolidayOff(d)) continue;
    if (rnd() < 0.008) { DB.daily[d] = { closed: true, memo: '원장 학회' }; continue; }
    const dt = parseYmd(d), month = dt.getMonth();
    const season = (month === 11 || month <= 1) ? 1.18 : (month >= 6 && month <= 7 ? 0.88 : 1);
    const growth = 1 + (dt - parseYmd(start)) / 864e5 / 730 * 0.08;
    const afterHoliday = holidayName(addDays(d, -1)) ? 1.25 : 1;
    const rainy = rnd() < 0.05;
    const p = Math.round((base[w] || 55) * season * growth * afterHoliday * (rainy ? 0.7 : 1) * (0.85 + rnd() * 0.3));
    const np = Math.round(p * (0.08 + rnd() * 0.1));
    const rev = Math.round(p * (11000 + rnd() * 7000) / 100) * 100;
    const card = Math.round(rev * (0.68 + rnd() * 0.1) / 100) * 100;
    const cash = Math.round(rev * (0.06 + rnd() * 0.06) / 100) * 100;
    DB.daily[d] = { patients: p, newPatients: np, card, cash, transfer: rev - card - cash, revenue: rev,
      nonCovered: Math.round(rev * (0.15 + rnd() * 0.2) / 100) * 100, memo: rainy ? '폭우' : '' };
  }
  monthsBetween(start, addMonths(TODAY.slice(0, 7), -1) + '-01').forEach((m) => {
    const a = monthAgg(m);
    const claim = Math.round(a.patients * 17800 / 1000) * 1000;
    DB.monthly[m] = { claim, insurance: Math.round(claim * (0.965 + rnd() * 0.03) / 1000) * 1000, labor: 23000000, rent: 6500000,
      supplies: Math.round(a.patients * 1800 / 1000) * 1000, other: 2400000 };
  });
  if (!S().monthlyTarget) DB.settings.monthlyTarget = 52000000;
  persist(); loadSettings(); renderDataTables();
  flash($('dataStatus'), '✔ 최근 2년 예시 데이터를 채웠습니다. ③ 통계 대시보드에서 확인해 보세요.');
};
$('clearAll').onclick = () => {
  if (!confirm('모든 기록과 설정을 삭제합니다. 되돌릴 수 없습니다. 먼저 백업하셨나요?\n\n계속하려면 확인을 누르세요.')) return;
  DB = { daily: {}, monthly: {}, settings: { ...DEFAULT_SETTINGS } }; persist();
  localStorage.removeItem(AI_CACHE_KEY); Object.keys(aiCache).forEach((k) => delete aiCache[k]);
  loadSettings(); renderDataTables(); flash($('dataStatus'), '모든 기록을 삭제했습니다.');
};

/* ---------- 로그아웃 (웹 배포 시) ---------- */
if (location.protocol.startsWith('http')) {
  $('logoutBtn').hidden = false;
  $('logoutBtn').onclick = async () => {
    try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
    location.href = '/clinic/login.html';
  };
}

/* ---------- 시작 ---------- */
loadDaily(); renderRecent(); refreshRecentWeather(); loadMonthly();
// 웹 배포 시 한국천문연구원 공휴일 갱신 (작년·올해·내년)
{
  const y = Number(TODAY.slice(0, 4));
  refreshHolidays([y - 1, y, y + 1]).then((ch) => {
    if (!ch) return;
    const active = document.querySelector('nav button.active')?.dataset.tab;
    if (active === 'daily') { renderDayInfo(); renderRecent(); } else showTab(active);
  });
}
$('dPatients').focus();
