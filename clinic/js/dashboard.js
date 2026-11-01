/* =====================================================================
   dashboard.js — ③ 통계 대시보드
   ===================================================================== */
let dashRange = { preset: '30' };
let yoyMetric = 'patients';

function resolveRange() {
  const keys = Object.keys(DB.daily).sort();
  let to = TODAY, from;
  switch (dashRange.preset) {
    case '7': from = addDays(TODAY, -6); break;
    case '30': from = addDays(TODAY, -29); break;
    case '90': from = addDays(TODAY, -89); break;
    case '365': from = addDays(TODAY, -364); break;
    case 'mtd': from = TODAY.slice(0, 8) + '01'; break;
    case 'ytd': from = TODAY.slice(0, 5) + '01-01'; break;
    case 'all': from = keys[0] || TODAY; if (keys.length && keys[keys.length - 1] > TODAY) to = keys[keys.length - 1]; break;
    case 'custom': from = dashRange.from; to = dashRange.to; if (from > to) [from, to] = [to, from]; break;
  }
  return { from, to };
}

/* 그날의 공휴일·휴진·날씨·메모 설명 (툴팁, 표에서 공용) */
function dayNotes(d, { html = true, weather = true } = {}) {
  const parts = [];
  const st = dayStatus(d), h = holidayInfo(d), r = DB.daily[d];
  if (h) {
    const note = h.kind !== 'legal' && isHolidayOpen(d) ? ' · 진료' : '';
    parts.push(html ? `<span class="tag holiday">🎌 ${escapeHtml(h.name)}${note}</span>` : `${HOLIDAY_KIND_LABEL[h.kind]}(${h.name}${note})`);
  }
  if (st === 'closed') parts.push(html ? '<span class="tag closed">휴진</span>' : '휴진');
  else if (st === 'regular') parts.push(html ? '<span class="tag closed">정기 휴진</span>' : '정기 휴진');
  if (weather) { const w = weatherOf(d); if (w) parts.push(html ? escapeHtml(weatherText(w)) : weatherText(w, true)); }
  if (r?.memo) parts.push(html ? `📝 ${escapeHtml(r.memo)}` : `메모: ${r.memo}`);
  return parts.join(html ? ' ' : ', ');
}

const monthXLabel = (months) => (m, i) => `${Number(m.slice(5))}월` + (i === 0 || m.slice(5) === '01' ? `\n${m.slice(0, 4)}` : '');

function renderDashboard() {
  const { from, to } = resolveRange();
  $('fFrom').value = from; $('fTo').value = to;
  const span = daysBetween(from, to).length;
  $('rangeLabel').textContent = `${from.replace(/-/g, '.')} ~ ${to.replace(/-/g, '.')} (${span}일)`;
  const recs = openRecords(from, to);
  const prev = openRecords(addDays(from, -span), addDays(from, -1));

  renderKpis(recs, prev);
  renderGoal();
  renderBreakEven();
  renderDailyChart(from, to);
  renderWeekdayCharts(recs);
  renderMonthlyCharts(from, to);
  renderPaySummary(recs);
  renderInsights(recs, prev, from, to);

  ensureWeather(from, to).then((changed) => {
    if (changed && $('tab-dash').classList.contains('active')) { renderDailyChart(from, to); renderInsights(recs, prev, from, to); }
  });
}

/* ---------- KPI ---------- */
function kpiData(recs) {
  const patients = sum(recs, (r) => r.patients), revenue = sum(recs, (r) => r.revenue), newP = sum(recs, (r) => r.newPatients);
  return { days: recs.length, patients, revenue, newP,
    avg: recs.length ? patients / recs.length : null, perPatient: patients ? revenue / patients : null, newRate: patients ? newP / patients * 100 : null };
}
function deltaHtml(cur, prev) {
  const c = change(cur, prev);
  if (c == null) return '<div class="delta">이전 기간 비교 데이터 없음</div>';
  if (Math.abs(c) < 0.05) return '<div class="delta">이전 기간과 동일</div>';
  return `<div class="delta ${c > 0 ? 'up' : 'down'}">${c > 0 ? '▲' : '▼'} ${Math.abs(c).toFixed(1)}% <span style="color:var(--muted)">이전 기간 대비</span></div>`;
}
function renderKpis(recs, prev) {
  const c = kpiData(recs), p = kpiData(prev);
  const tile = (label, value, unit, delta) => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}<small>${unit}</small></div>${delta}</div>`;
  $('kpis').innerHTML = [
    tile('총 내원 환자', fmt(c.patients), '명', deltaHtml(c.patients, p.patients)),
    tile('일평균 환자 (진료일 기준)', c.avg == null ? '-' : c.avg.toFixed(1), '명', deltaHtml(c.avg, p.avg)),
    tile('일 매출 합계', man(c.revenue), '원', deltaHtml(c.revenue, p.revenue)),
    tile('환자 1인당 수납액', c.perPatient == null ? '-' : fmt(c.perPatient), '원', deltaHtml(c.perPatient, p.perPatient)),
    tile('신규 환자 비율', c.newRate == null ? '-' : c.newRate.toFixed(1), '%', `<div class="delta">신규 ${fmt(c.newP)}명 · 진료일 ${c.days}일</div>`),
  ].join('');
}

/* ---------- 목표 달성률 ---------- */
function renderGoal() {
  const g = monthProgress();
  const m = TODAY.slice(0, 7);
  const insNote = g.a.hasInsurance ? '보험 지급액 입력됨' : (g.insEstimated ? `보험 지급액은 최근 비율(일 매출의 ${(g.ratio * 100).toFixed(0)}%)로 예상` : '보험 지급액 미포함');
  if (!g.target) {
    $('goalBox').innerHTML = `<p class="sub">${monthLabel(m)} · ${insNote}</p>
      <div class="big-stat">${man(g.nowIncome)}<small>원 (현재까지)</small></div>
      <dl class="kv"><dt>월말 예상 총수입</dt><dd>${man(g.projIncome)}원</dd><dt>남은 진료일</dt><dd>${g.restDays}일</dd></dl>
      <p class="hint">⑤ 설정·백업에서 <b>월 목표 총수입</b>을 입력하면 달성률이 표시됩니다.</p>`;
    return;
  }
  const scale = Math.max(g.target, g.projIncome) * 1.05;
  const rate = g.nowIncome / g.target * 100, projRate = g.projIncome / g.target * 100;
  const w = (v) => Math.max(0, Math.min(100, v / scale * 100));
  $('goalBox').innerHTML = `<p class="sub">${monthLabel(m)} · ${insNote}</p>
    <div class="big-stat">${rate.toFixed(1)}<small>% 달성</small></div>
    <div class="progress" role="img" aria-label="목표 달성률 ${rate.toFixed(1)}%, 월말 예상 ${projRate.toFixed(1)}%">
      <div class="seg-a" style="width:${w(g.nowIncome)}%"></div>
      <div class="seg-b" style="left:${w(g.nowIncome)}%;width:${Math.max(0, w(g.projIncome) - w(g.nowIncome))}%"></div>
      <div class="target" style="left:${w(g.target)}%"><span>목표 ${man(g.target)}</span></div>
    </div>
    <dl class="kv">
      <dt>현재까지 총수입</dt><dd>${won(g.nowIncome)}</dd>
      <dt>월말 예상 (빗금)</dt><dd class="${projRate >= 100 ? 'up' : 'down'}">${won(g.projIncome)} (${projRate.toFixed(0)}%)</dd>
      <dt>남은 진료일</dt><dd>${g.restDays}일</dd>
      ${g.restDays && g.needPerDay != null ? `<dt>목표까지 하루 필요 수납액</dt><dd>${g.needPerDay > 0 ? won(g.needPerDay) : '이미 달성 🎉'}</dd>` : ''}
    </dl>`;
}

/* ---------- 손익분기 ---------- */
function renderBreakEven() {
  const be = breakEven();
  if (!be) {
    $('beBox').innerHTML = `<p class="sub">하루에 몇 명이 와야 적자가 나지 않는지 계산합니다.</p>
      <p class="muted">② 월말 정산에 <b>보험 지급액과 지출</b>을 입력한 달이 1개월 이상 있어야 계산됩니다.</p>`;
    return;
  }
  if (be.impossible) {
    $('beBox').innerHTML = `<p class="down">환자 1인당 수입이 변동비보다 적어 손익분기를 계산할 수 없습니다. 입력값을 확인해 주세요.</p>`;
    return;
  }
  const gap = be.currentDay - be.dayPatients;
  $('beBox').innerHTML = `<p class="sub">기준: ${be.months.slice().reverse().map(monthLabel).join(', ')} 평균</p>
    <div class="big-stat">하루 ${be.dayPatients.toFixed(1)}<small>명 이상</small></div>
    <p style="margin:0 0 14px;font-size:17px">현재 일평균 <b>${be.currentDay.toFixed(1)}명</b> →
      <b class="${gap >= 0 ? 'up' : 'down'}">${gap >= 0 ? `손익분기보다 ${gap.toFixed(1)}명 여유` : `${(-gap).toFixed(1)}명 부족`}</b></p>
    <dl class="kv">
      <dt>월 고정비 (인건비·임대료·기타)</dt><dd>${won(be.fixedAvg)}${S().fixedCostOverride ? ' (직접 지정)' : ''}</dd>
      <dt>환자 1인당 공헌이익</dt><dd>${won(be.contribution)}</dd>
      <dt>손익분기 월 환자 수</dt><dd>${fmt(be.monthPatients)}명</dd>
      <dt>월 평균 진료일</dt><dd>${be.openDaysAvg.toFixed(1)}일</dd>
    </dl>
    <p class="hint">공헌이익 = (총수입 − 재료비 − 카드 수수료) ÷ 환자 수</p>`;
}

/* ---------- 일별 추이 ---------- */
function renderDailyChart(from, to) {
  const days = daysBetween(from, to);
  const vals = days.map((d) => isOpenRec(DB.daily[d]) ? DB.daily[d].patients : null);
  const ma = days.map((d, i) => {
    const win = []; for (let k = Math.max(0, i - 6); k <= i; k++) if (vals[k] != null) win.push(vals[k]);
    return win.length >= 3 ? win.reduce((a, b) => a + b, 0) / win.length : null;
  });
  const bands = [];
  days.forEach((d, i) => {
    const st = dayStatus(d);
    if (st === 'holiday' || (st === 'closed' && holidayName(d))) bands.push({ i, kind: 'holiday' });
    else if (st === 'closed' || st === 'regular') bands.push({ i, kind: 'closed' });
  });
  lineChart($('chDaily'), {
    labels: days, bands,
    xLabel: (d) => shortDate(d),
    tipTitle: (d) => dateLabel(d),
    tipExtra: (i) => { const n = dayNotes(days[i]); const st = dayStatus(days[i]); return (n || st === 'missing') ? tipNote(n || '<span class="muted">미입력</span>') : ''; },
    series: [
      { name: '내원 환자', color: 'var(--s1)', values: vals, fmt: (v) => fmt(v) + '명', dots: days.length <= 120 },
      { name: '7일 이동평균', color: 'var(--s3)', values: ma, fmt: (v) => v.toFixed(1) + '명', dashed: true },
    ],
    yFmt: fmt,
  });
}

/* ---------- 요일별 ---------- */
function renderWeekdayCharts(recs) {
  const by = WD_ORDER.map((w) => recs.filter((r) => weekday(r.date) === w));
  const labels = WD_ORDER.map((w) => WD[w] + '요일');
  const daysTip = (i) => `<div class="t-row"><span>진료일수</span><span>${by[i].length}일</span></div>`;
  barChart($('chWeekdayPatients'), {
    labels, yFmt: fmt, extraTip: daysTip, valueLabels: (v) => v == null ? '' : v.toFixed(1),
    series: [{ name: '평균 환자', color: 'var(--s1)', values: by.map((g) => g.length ? sum(g, (r) => r.patients) / g.length : null), fmt: (v) => v.toFixed(1) + '명' }],
  });
  barChart($('chWeekdayRevenue'), {
    labels, yFmt: man, extraTip: daysTip, valueLabels: (v) => v == null ? '' : man(v),
    series: [{ name: '평균 매출', color: 'var(--s1)', values: by.map((g) => g.length ? sum(g, (r) => r.revenue) / g.length : null), fmt: won }],
  });
}

/* ---------- 월 단위 차트 ---------- */
const YOY_METRICS = {
  patients: { name: '환자 수', get: (a) => a.openDays ? a.patients : null, fmt: (v) => fmt(v) + '명', y: fmt },
  income: { name: '총수입', get: (a) => (a.openDays || a.hasInsurance) ? a.income : null, fmt: won, y: man },
  revenue: { name: '일 매출 합계', get: (a) => a.openDays ? a.revenue : null, fmt: won, y: man },
  avg: { name: '일평균 환자', get: (a) => a.openDays ? a.patients / a.openDays : null, fmt: (v) => v.toFixed(1) + '명', y: fmt },
};
function renderYoY(months) {
  const M = YOY_METRICS[yoyMetric];
  const cur = months.map((m) => M.get(monthAgg(m)));
  const last = months.map((m) => M.get(monthAgg(addMonths(m, -12))));
  barChart($('chYoY'), {
    labels: months, grouped: true, yFmt: M.y, xLabel: monthXLabel(months),
    tipTitle: (m) => `${monthLabel(m)} vs ${monthLabel(addMonths(m, -12))}`,
    series: [
      { name: `작년 ${M.name}`, color: 'var(--s1-soft)', values: last, fmt: M.fmt },
      { name: `올해 ${M.name}`, color: 'var(--s1)', values: cur, fmt: M.fmt },
    ],
    extraTip: (i) => { const c = change(cur[i], last[i]); return c == null ? '' : tipNote(`전년 동월 대비 <b class="${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '+' : ''}${c.toFixed(1)}%</b>`); },
    valueLabels: (_, i) => { const c = change(cur[i], last[i]); return c == null ? '' : `${c >= 0 ? '+' : ''}${c.toFixed(0)}%`; },
  });
}
function renderMonthlyCharts(from, to) {
  const months = monthsBetween(from, to);
  const aggs = months.map(monthAgg);
  const xl = monthXLabel(months);
  const target = Number(S().monthlyTarget) || null;
  barChart($('chMonthly'), {
    labels: months, xLabel: xl, stacked: true, yFmt: man, tipTitle: monthLabel,
    refLine: target ? { value: target, label: `목표 ${man(target)}` } : null,
    series: [
      { name: '일 매출 합계', color: 'var(--s1)', values: aggs.map((a) => a.openDays ? a.revenue : null), fmt: won },
      { name: '보험 지급액', color: 'var(--s2)', values: aggs.map((a) => a.hasInsurance ? a.insurance : null), fmt: won },
    ],
    extraTip: (i) => `<div class="t-row"><span><b>총수입</b></span><span>${won(aggs[i].income)}</span></div>` +
      (target ? tipNote(`목표 대비 ${(aggs[i].income / target * 100).toFixed(0)}%`) : ''),
    valueLabels: (v, i) => man(aggs[i].income),
  });
  renderYoY(months);
  barChart($('chPay'), {
    labels: months, xLabel: xl, stacked: true, yFmt: man, tipTitle: monthLabel,
    series: [
      { name: '카드', color: 'var(--s1)', values: aggs.map((a) => a.splitTotal ? a.card : null), fmt: won },
      { name: '현금', color: 'var(--s3)', values: aggs.map((a) => a.splitTotal ? a.cash : null), fmt: won },
      { name: '계좌이체', color: 'var(--s4)', values: aggs.map((a) => a.splitTotal ? a.transfer : null), fmt: won },
    ],
    extraTip: (i) => { const a = aggs[i]; return tipNote(`카드 ${pct(a.card / a.splitTotal * 100)} · 현금 ${pct(a.cash / a.splitTotal * 100)} · 이체 ${pct(a.transfer / a.splitTotal * 100)}<br>예상 카드 수수료 ${won(a.cardFee)}`); },
    valueLabels: (v, i) => months.length <= 7 && aggs[i].splitTotal ? `카드 ${(aggs[i].card / aggs[i].splitTotal * 100).toFixed(0)}%` : '',
  });
  barChart($('chProfit'), {
    labels: months, xLabel: xl, yFmt: man, tipTitle: monthLabel,
    series: [{ name: '순이익', color: 'var(--s3)', values: aggs.map((a) => a.profit), fmt: won }],
    extraTip: (i) => { const a = aggs[i]; return `<div class="t-row"><span>총수입</span><span>${won(a.income)}</span></div><div class="t-row"><span>지출 (카드 수수료 포함)</span><span>${won(a.expense)}</span></div>` + tipNote(`순이익률 ${pct(a.profit / a.income * 100)}`); },
    valueLabels: (v) => v == null ? '' : man(v),
  });
  barChart($('chClaim'), {
    labels: months, xLabel: xl, grouped: true, yFmt: man, tipTitle: monthLabel,
    series: [
      { name: '청구액', color: 'var(--s1-soft)', values: aggs.map((a) => a.hasClaim ? a.claim : null), fmt: won },
      { name: '지급액', color: 'var(--s2)', values: aggs.map((a) => a.hasInsurance ? a.insurance : null), fmt: won },
    ],
    extraTip: (i) => aggs[i].cutRate == null ? '' : tipNote(`삭감 ${won(aggs[i].cut)} (${pct(aggs[i].cutRate, 2)})`),
  });
  lineChart($('chCut'), {
    labels: months, xLabel: xl, tipTitle: monthLabel, yFmt: (v) => v.toFixed(1) + '%',
    series: [{ name: '삭감률', color: 'var(--s2)', values: aggs.map((a) => a.cutRate), fmt: (v) => pct(v, 2), dots: true, endLabels: (v) => v.toFixed(1) + '%' }],
    tipExtra: (i) => aggs[i].cutRate == null ? '' : tipNote(`청구 ${won(aggs[i].claim)}<br>지급 ${won(aggs[i].insurance)}`),
  });
  barChart($('chMonthlyPatients'), {
    labels: months, xLabel: xl, stacked: true, yFmt: fmt, tipTitle: monthLabel,
    series: [
      { name: '재진', color: 'var(--s1)', values: aggs.map((a) => a.openDays ? a.patients - a.newPatients : null), fmt: (v) => fmt(v) + '명' },
      { name: '신규', color: 'var(--s2)', values: aggs.map((a) => a.openDays ? a.newPatients : null), fmt: (v) => fmt(v) + '명' },
    ],
    extraTip: (i) => `<div class="t-row"><span><b>합계</b></span><span>${fmt(aggs[i].patients)}명</span></div><div class="t-row"><span>진료일 / 휴진</span><span>${aggs[i].openDays}일 / ${aggs[i].closedDays}일</span></div>`,
    valueLabels: (v, i) => fmt(aggs[i].patients),
  });
}

function renderPaySummary(recs) {
  const split = recs.filter((r) => r.card != null || r.cash != null || r.transfer != null);
  const card = sum(split, (r) => r.card), cash = sum(split, (r) => r.cash), tr = sum(split, (r) => r.transfer), t = card + cash + tr;
  if (!t) { $('paySummary').innerHTML = '<span>선택 기간에 결제수단별 기록이 없습니다.</span>'; return; }
  const fee = card * (Number(S().cardFeeRate) || 0) / 100;
  $('paySummary').innerHTML = `<span>선택 기간 · 카드 <b>${pct(card / t * 100)}</b></span><span>현금 <b>${pct(cash / t * 100)}</b></span><span>계좌이체 <b>${pct(tr / t * 100)}</b></span>
    <span>예상 카드 수수료 <b>${won(fee)}</b> (${S().cardFeeRate}%)</span>${split.length < recs.length ? `<span class="muted">결제수단 미구분 ${recs.length - split.length}일 제외</span>` : ''}`;
}

/* ---------- 자동 분석 ---------- */
function lowDayReason(d) {
  const reasons = [];
  const prevDay = addDays(d, -1), nextDay = addDays(d, 1);
  if (holidayName(prevDay) || holidayName(nextDay)) reasons.push('연휴 앞뒤');
  const wn = weatherNotable(weatherOf(d)); if (wn) reasons.push(wn);
  if (DB.daily[d]?.memo) reasons.push(DB.daily[d].memo);
  return reasons;
}
function renderInsights(recs, prev, from, to) {
  const out = [];
  if (!recs.length) { $('insights').innerHTML = '<li>선택 기간에 입력된 진료 기록이 없습니다. ① 일일 입력에서 기록을 추가하거나, ⑤ 설정·백업에서 예시 데이터를 채워 보세요.</li>'; return; }
  const allAvg = sum(recs, (r) => r.patients) / recs.length;
  const avgs = WD_ORDER.map((w) => ({ w, g: recs.filter((r) => weekday(r.date) === w) })).filter((x) => x.g.length)
    .map((x) => ({ w: x.w, avg: sum(x.g, (r) => r.patients) / x.g.length }));
  if (avgs.length >= 2) {
    const hi = avgs.reduce((a, b) => b.avg > a.avg ? b : a), lo = avgs.reduce((a, b) => b.avg < a.avg ? b : a);
    out.push(`가장 붐비는 요일은 <b>${WD[hi.w]}요일</b>(평균 ${hi.avg.toFixed(1)}명), 가장 한산한 요일은 <b>${WD[lo.w]}요일</b>(평균 ${lo.avg.toFixed(1)}명)입니다. 인력 배치·점심시간 조정에 참고하세요.`);
  }
  const best = recs.reduce((a, b) => b.patients > a.patients ? b : a);
  out.push(`최다 환자일은 <b>${dateLabel(best.date)}</b> ${fmt(best.patients)}명입니다${best.memo ? ` (메모: ${escapeHtml(best.memo)})` : ''}.`);
  const nc = sum(recs, (r) => r.nonCovered), rev = sum(recs, (r) => r.revenue);
  if (nc > 0 && rev > 0) out.push(`일 매출 중 비급여 비중은 <b>${(nc / rev * 100).toFixed(1)}%</b>입니다.`);
  if (prev.length) {
    const pAvg = sum(prev, (r) => r.patients) / prev.length, diff = change(allAvg, pAvg);
    out.push(`일평균 환자는 직전 같은 기간보다 <b>${Math.abs(diff).toFixed(1)}% ${diff >= 0 ? '증가' : '감소'}</b>했습니다 (${pAvg.toFixed(1)}명 → ${allAvg.toFixed(1)}명).`);
  }
  // 요일 평균 대비 크게 적었던 날 + 이유
  const wdAvg = Object.fromEntries(avgs.map((x) => [x.w, x.avg]));
  const low = recs.filter((r) => r.patients < (wdAvg[weekday(r.date)] || allAvg) * 0.7);
  if (low.length) {
    const items = low.slice(-6).map((r) => { const why = lowDayReason(r.date); return `${shortDate(r.date)}(${WD[weekday(r.date)]}) ${r.patients}명${why.length ? ` — ${escapeHtml(why.join(', '))}` : ''}`; });
    out.push(`같은 요일 평균보다 30% 이상 적었던 날이 <b>${low.length}일</b> 있었습니다: ${items.join(' · ')}${low.length > 6 ? ' 외' : ''}.`);
  }
  const hol = daysBetween(from, to > TODAY ? TODAY : to).filter((d) => isHolidayOff(d) && !S().closedWeekdays.includes(weekday(d)));
  if (hol.length) out.push(`기간 중 평일 공휴일 휴진이 <b>${hol.length}일</b>(${hol.slice(0, 5).map((d) => `${shortDate(d)} ${holidayName(d)}`).join(', ')}${hol.length > 5 ? ' 외' : ''}) 있었습니다.`);
  // 전년 동월 (기간 내 마지막 완결 월)
  const lastFull = monthsBetween(from, to).filter((m) => m < TODAY.slice(0, 7)).pop();
  if (lastFull) {
    const a = monthAgg(lastFull), b = monthAgg(addMonths(lastFull, -12));
    if (a.openDays && b.openDays) {
      const c = change(a.patients, b.patients), ci = change(a.income, b.income);
      out.push(`${monthLabel(lastFull)} 환자 수는 작년 같은 달보다 <b class="${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '+' : ''}${c.toFixed(1)}%</b>${ci != null && a.hasInsurance && b.hasInsurance ? `, 총수입은 <b class="${ci >= 0 ? 'up' : 'down'}">${ci >= 0 ? '+' : ''}${ci.toFixed(1)}%</b>` : ''}입니다.`);
    }
  }
  // 삭감률
  const cuts = monthsBetween(from, to).map(monthAgg).filter((a) => a.cutRate != null);
  if (cuts.length) {
    const avgCut = sum(cuts, (a) => a.cut) / sum(cuts, (a) => a.claim) * 100;
    const worst = cuts.reduce((a, b) => b.cutRate > a.cutRate ? b : a);
    out.push(`보험 삭감률은 평균 <b>${avgCut.toFixed(2)}%</b>, 가장 높았던 달은 ${monthLabel(worst.month)} (${worst.cutRate.toFixed(2)}%)입니다.`);
  }
  // 이번 달 예상
  if (to >= TODAY && from <= TODAY) {
    const g = monthProgress();
    if (g.a.openDays >= 5) out.push(`이번 달 현재 추세라면 월말 일 매출 합계는 약 <b>${man(g.projRevenue)}원</b>, 총수입은 약 <b>${man(g.projIncome)}원</b>으로 예상됩니다 (남은 진료일 ${g.restDays}일).`);
  }
  $('insights').innerHTML = out.map((s) => `<li>${s}</li>`).join('');
}

/* ---------- 이벤트 ---------- */
document.querySelectorAll('#filters [data-range]').forEach((b) => b.onclick = () => {
  dashRange = { preset: b.dataset.range };
  document.querySelectorAll('#filters [data-range]').forEach((x) => x.classList.toggle('active', x === b));
  renderDashboard();
});
$('applyRange').onclick = () => {
  if (!$('fFrom').value || !$('fTo').value) return;
  dashRange = { preset: 'custom', from: $('fFrom').value, to: $('fTo').value };
  document.querySelectorAll('#filters [data-range]').forEach((x) => x.classList.remove('active'));
  renderDashboard();
};
$('printBtn').onclick = () => window.print();
document.querySelectorAll('#yoyMetric .btn').forEach((b) => b.onclick = () => {
  yoyMetric = b.dataset.m;
  document.querySelectorAll('#yoyMetric .btn').forEach((x) => x.classList.toggle('active', x === b));
  const { from, to } = resolveRange();
  renderYoY(monthsBetween(from, to));
});
