/* =====================================================================
   report.js — ④ 월간 리포트 (자동 통계 + Gemini AI 해설)
   AI에는 집계된 숫자만 전송하며, 메모·개인정보는 전송하지 않습니다.
   ===================================================================== */
const AI_CACHE_KEY = 'clinicAiReports.v1';
const aiCache = (() => { try { return JSON.parse(localStorage.getItem(AI_CACHE_KEY)) || {}; } catch (e) { return {}; } })();

function buildMonthSummary(m) {
  const a = monthAgg(m), pm = monthAgg(addMonths(m, -1)), ly = monthAgg(addMonths(m, -12));
  const recs = openRecords(`${m}-01`, `${m}-31`);
  const byWd = {};
  WD_ORDER.forEach((w) => { const g = recs.filter((r) => weekday(r.date) === w); if (g.length) byWd[WD[w] + '요일'] = +(sum(g, (r) => r.patients) / g.length).toFixed(1); });
  const best = recs.length ? recs.reduce((x, y) => y.patients > x.patients ? y : x) : null;
  const worst = recs.length ? recs.reduce((x, y) => y.patients < x.patients ? y : x) : null;
  const days = daysBetween(`${m}-01`, `${m}-${pad(daysInMonth(m))}`);
  const holidays = days.filter((d) => holidayName(d)).map((d) => `${shortDate(d)} ${holidayName(d)}`);
  const wdAvg = Object.fromEntries(WD_ORDER.map((w) => [w, byWd[WD[w] + '요일']]));
  const unusual = recs.filter((r) => wdAvg[weekday(r.date)] && Math.abs(r.patients - wdAvg[weekday(r.date)]) / wdAvg[weekday(r.date)] >= 0.3)
    .map((r) => {
      const why = [];
      if (holidayName(addDays(r.date, -1)) || holidayName(addDays(r.date, 1))) why.push('연휴 앞뒤');
      const wn = weatherNotable(weatherOf(r.date)); if (wn) why.push(wn);
      return { 날짜: dateLabel(r.date), 환자: r.patients, 같은요일평균: wdAvg[weekday(r.date)], 추정원인: why.join(', ') || '없음' };
    });
  const be = breakEven(m);
  const g = m === TODAY.slice(0, 7) ? monthProgress(m) : null;
  const target = Number(S().monthlyTarget) || null;
  const basic = (x) => ({
    진료일수: x.openDays, 총환자: x.patients, 일평균환자: x.openDays ? +(x.patients / x.openDays).toFixed(1) : null,
    신규환자: x.newPatients, 일매출합계: x.revenue, 보험지급액: x.hasInsurance ? x.insurance : null,
    총수입: (x.openDays || x.hasInsurance) ? x.income : null, 순이익: x.profit,
  });
  return {
    대상월: monthLabel(m),
    진행중인달: m === TODAY.slice(0, 7),
    기본: {
      ...basic(a), 휴진일수: a.closedDays,
      신규비율: a.patients ? +(a.newPatients / a.patients * 100).toFixed(1) : null,
      환자1인당수납액: a.patients ? Math.round(a.revenue / a.patients) : null,
      환자1인당총수입: a.patients && a.hasInsurance ? Math.round(a.income / a.patients) : null,
      비급여매출: a.nonCovered, 비급여비중: a.revenue ? +(a.nonCovered / a.revenue * 100).toFixed(1) : null,
    },
    결제수단: a.splitTotal ? {
      카드비율: +(a.card / a.splitTotal * 100).toFixed(1), 현금비율: +(a.cash / a.splitTotal * 100).toFixed(1),
      계좌이체비율: +(a.transfer / a.splitTotal * 100).toFixed(1), 카드수수료율: Number(S().cardFeeRate), 예상카드수수료: Math.round(a.cardFee),
    } : null,
    보험: a.hasClaim || a.hasInsurance ? { 청구액: a.hasClaim ? a.claim : null, 지급액: a.hasInsurance ? a.insurance : null, 삭감액: a.cut, 삭감률: a.cutRate == null ? null : +a.cutRate.toFixed(2), 전월삭감률: pm.cutRate == null ? null : +pm.cutRate.toFixed(2) } : null,
    비용: a.hasExpense ? { 인건비: a.labor ?? null, 임대료관리비: a.rent ?? null, 재료약품비: a.supplies ?? null, 기타: a.other ?? null, 카드수수료: Math.round(a.cardFee), 지출합계: Math.round(a.expense), 순이익률: a.income ? +(a.profit / a.income * 100).toFixed(1) : null } : null,
    목표: target ? { 월목표총수입: target, 달성률: (a.openDays || a.hasInsurance) ? +(a.income / target * 100).toFixed(1) : null, ...(g ? { 월말예상총수입: Math.round(g.projIncome), 남은진료일: g.restDays } : {}) } : null,
    손익분기: be && !be.impossible ? { 손익분기일환자: +be.dayPatients.toFixed(1), 현재일평균환자: +be.currentDay.toFixed(1), 월고정비: Math.round(be.fixedAvg), 환자1인당공헌이익: Math.round(be.contribution) } : null,
    요일별평균환자: byWd,
    최다환자일: best ? { 날짜: dateLabel(best.date), 환자: best.patients } : null,
    최소환자일: worst ? { 날짜: dateLabel(worst.date), 환자: worst.patients } : null,
    공휴일: holidays,
    평소와다른날: unusual,
    전월: pm.openDays ? basic(pm) : null,
    전년동월: ly.openDays ? basic(ly) : null,
  };
}

const fv = (v, money) => v == null ? '-' : money ? won(v) : (Number.isInteger(v) ? fmt(v) : v.toFixed(1));
const chgCell = (c) => c == null ? '<td class="muted">-</td>' : `<td class="${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '▲' : '▼'} ${Math.abs(c).toFixed(1)}%</td>`;
/* rows: [[라벨, 값, 단위('원'|'%'|'명'|'일')], ...] */
const kvRows = (rows) => rows.filter(([, v]) => v != null).map(([k, v, u]) =>
  `<tr><td>${k}</td><td>${typeof v !== 'number' ? escapeHtml(v) : u === '원' ? won(v) : u === '%' ? v + '%' : fmt(v) + u}</td></tr>`).join('');

function renderReport() {
  const m = $('rMonth').value; if (!m) return;
  const s = buildMonthSummary(m), b = s.기본, pm = s.전월 || {}, ly = s.전년동월 || {};
  const tile = (label, value, unit, sub = '') => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}<small>${unit}</small></div><div class="delta">${sub}</div></div>`;
  const row = (k, key, money) => `<tr><td>${k}</td><td>${fv(b[key], money)}</td>${chgCell(change(b[key], pm[key]))}<td>${fv(ly[key], money)}</td>${chgCell(change(b[key], ly[key]))}</tr>`;

  if (!b.진료일수 && !s.보험 && !s.비용) {
    $('reportBody').innerHTML = `<div class="card"><h2>${s.대상월} 리포트</h2><p class="muted">이 달에 입력된 기록이 없습니다.</p></div>`;
    return;
  }
  const ai = aiCache[m];
  $('reportBody').innerHTML = `
    <div class="card mb">
      <h2>${s.대상월} 운영 리포트 ${s.진행중인달 ? '<span class="badge">진행 중</span>' : ''}</h2>
      <p class="sub">생성일 ${TODAY.replace(/-/g, '.')} · 진료일 ${b.진료일수}일${b.휴진일수 ? ` · 휴진 ${b.휴진일수}일` : ''}${s.공휴일.length ? ` · 공휴일: ${escapeHtml(s.공휴일.join(', '))}` : ''}</p>
      <div class="kpis">
        ${tile('총 내원 환자', fmt(b.총환자), '명', `일평균 ${b.일평균환자 ?? '-'}명 · 신규 ${b.신규비율 ?? '-'}%`)}
        ${tile('총수입', man(b.총수입), '원', `일 매출 ${man(b.일매출합계)} + 보험 ${man(b.보험지급액)}`)}
        ${tile('순이익', b.순이익 == null ? '-' : man(b.순이익), b.순이익 == null ? '' : '원', s.비용 ? `순이익률 ${s.비용.순이익률}%` : '지출 미입력')}
        ${tile('보험 삭감률', s.보험?.삭감률 == null ? '-' : s.보험.삭감률, s.보험?.삭감률 == null ? '' : '%', s.보험?.삭감액 != null ? `삭감액 ${won(s.보험.삭감액)}` : '청구/지급 미입력')}
      </div>
      <h3>전월·전년 동월 비교</h3>
      <table>
        <thead><tr><th>지표</th><th>이번 달</th><th>전월 대비</th><th>작년 같은 달</th><th>전년 대비</th></tr></thead>
        <tbody>
          ${row('총 내원 환자', '총환자')}${row('일평균 환자', '일평균환자')}${row('신규 환자', '신규환자')}
          ${row('일 매출 합계', '일매출합계', true)}${row('보험 지급액', '보험지급액', true)}${row('총수입', '총수입', true)}${row('순이익', '순이익', true)}
        </tbody>
      </table>
    </div>
    <div class="grid-2 mb">
      <div class="card">
        <h2>매출 구성</h2>
        <table><tbody>
          ${kvRows([['환자 1인당 수납액', b.환자1인당수납액, '원'], ['환자 1인당 총수입', b.환자1인당총수입, '원'], ['비급여 매출', b.비급여매출, '원'], ['비급여 비중', b.비급여비중, '%']])}
          ${s.결제수단 ? kvRows([['카드 비율', s.결제수단.카드비율, '%'], ['현금 비율', s.결제수단.현금비율, '%'], ['계좌이체 비율', s.결제수단.계좌이체비율, '%'], [`예상 카드 수수료 (${s.결제수단.카드수수료율}%)`, s.결제수단.예상카드수수료, '원']]) : ''}
          ${s.목표 ? kvRows([['월 목표 총수입', s.목표.월목표총수입, '원'], ['목표 달성률', s.목표.달성률, '%'], ['월말 예상 총수입', s.목표.월말예상총수입, '원']]) : ''}
        </tbody></table>
      </div>
      <div class="card">
        <h2>보험·비용·손익분기</h2>
        <table><tbody>
          ${s.보험 ? kvRows([['보험 청구액', s.보험.청구액, '원'], ['보험 지급액', s.보험.지급액, '원'], ['삭감액', s.보험.삭감액, '원'], ['삭감률', s.보험.삭감률, '%'], ['전월 삭감률', s.보험.전월삭감률, '%']]) : ''}
          ${s.비용 ? kvRows([['인건비', s.비용.인건비, '원'], ['임대료·관리비', s.비용.임대료관리비, '원'], ['재료·약품비', s.비용.재료약품비, '원'], ['기타 지출', s.비용.기타, '원'], ['카드 수수료', s.비용.카드수수료, '원'], ['지출 합계', s.비용.지출합계, '원']]) : ''}
          ${s.손익분기 ? `<tr class="sep"><td>손익분기 일 환자</td><td class="strong">${s.손익분기.손익분기일환자}명</td></tr><tr><td>현재 일평균 환자</td><td>${s.손익분기.현재일평균환자}명</td></tr>` : ''}
        </tbody></table>
      </div>
    </div>
    <div class="grid-2 mb">
      <div class="card">
        <h2>요일별 평균 환자</h2>
        <table><tbody>${Object.entries(s.요일별평균환자).map(([k, v]) => `<tr><td>${k}</td><td>${v}명</td></tr>`).join('') || '<tr><td class="muted">기록 없음</td></tr>'}</tbody></table>
      </div>
      <div class="card">
        <h2>특이한 날</h2>
        <table><tbody>
          ${s.최다환자일 ? `<tr><td>최다 환자일</td><td>${s.최다환자일.날짜} · ${s.최다환자일.환자}명</td></tr>` : ''}
          ${s.최소환자일 ? `<tr><td>최소 환자일</td><td>${s.최소환자일.날짜} · ${s.최소환자일.환자}명</td></tr>` : ''}
          ${s.평소와다른날.map((u) => `<tr><td>${u.날짜}</td><td>${u.환자}명 (같은 요일 평균 ${u.같은요일평균}명)${u.추정원인 !== '없음' ? ` · ${escapeHtml(u.추정원인)}` : ''}</td></tr>`).join('')}
        </tbody></table>
        <p class="hint">같은 요일 평균과 30% 이상 차이 난 날을 표시합니다.</p>
      </div>
    </div>
    <div class="card">
      <h2>✨ AI 해설 <span class="badge">Gemini</span></h2>
      <p class="sub">위 집계 숫자만 AI에 전송합니다 (메모·개인정보 미전송). 내용은 참고용입니다.</p>
      <div class="ai-box" id="aiBox">${ai ? mdToHtml(ai.text) + `<p class="hint">생성: ${ai.at}</p>` : '<p class="muted">상단의 “AI 해설 생성” 버튼을 누르면 이번 달 데이터를 바탕으로 잘된 점, 주의할 점, 다음 달 제안을 작성합니다.</p>'}</div>
    </div>`;
}

/* 아주 작은 마크다운 → HTML (제목, 목록, 굵게) */
function mdToHtml(md) {
  const lines = escapeHtml(md).split('\n');
  let html = '', inList = false;
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  lines.forEach((l) => {
    const t = l.trim();
    const li = t.match(/^[-*•]\s+(.*)$/) || t.match(/^\d+[.)]\s+(.*)$/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(li[1])}</li>`; return; }
    if (inList) { html += '</ul>'; inList = false; }
    const h = t.match(/^#{1,4}\s+(.*)$/) || t.match(/^■\s*(.*)$/);
    if (h) html += `<h4>${inline(h[1])}</h4>`;
    else if (t) html += `<p>${inline(t)}</p>`;
  });
  if (inList) html += '</ul>';
  return html;
}

async function generateAi() {
  const m = $('rMonth').value; const st = $('rStatus');
  const s = buildMonthSummary(m);
  if (!s.기본.진료일수) return flash(st, '이 달에 기록이 없습니다.', false);
  if (location.protocol === 'file:') return flash(st, 'AI 해설은 웹(Vercel) 배포 환경에서만 사용할 수 있습니다.', false);
  $('rAi').disabled = true; st.className = 'status'; st.textContent = 'AI가 리포트를 작성하는 중입니다… (10~30초)';
  try {
    const r = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: s }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('로그인이 만료되었습니다. 새로고침 후 다시 입장해 주세요.');
    if (!r.ok || !d.reply) throw new Error(d.error || 'AI 응답을 받지 못했습니다.');
    aiCache[m] = { text: d.reply, at: new Date().toLocaleString('ko-KR') };
    try { localStorage.setItem(AI_CACHE_KEY, JSON.stringify(aiCache)); } catch (e) {}
    renderReport(); flash(st, '✔ AI 해설을 생성했습니다.');
  } catch (e) {
    flash(st, e.message || 'AI 해설 생성에 실패했습니다.', false);
  } finally { $('rAi').disabled = false; }
}

// 월초 1주일 동안은 지난달 리포트를 기본으로 보여줍니다
$('rMonth').value = Number(TODAY.slice(8)) <= 7 ? addMonths(TODAY.slice(0, 7), -1) : TODAY.slice(0, 7);
$('rMonth').addEventListener('change', renderReport);
$('rPrev').onclick = () => { $('rMonth').value = addMonths($('rMonth').value, -1); renderReport(); };
$('rNext').onclick = () => { $('rMonth').value = addMonths($('rMonth').value, 1); renderReport(); };
$('rAi').onclick = generateAi;
$('rPrint').onclick = () => window.print();
$('rCopy').onclick = async () => {
  const text = $('reportBody').innerText.replace(/\n{3,}/g, '\n\n');
  try { await navigator.clipboard.writeText(text); flash($('rStatus'), '✔ 리포트 내용을 복사했습니다.'); }
  catch (e) { flash($('rStatus'), '복사에 실패했습니다. 인쇄/PDF를 이용해 주세요.', false); }
};
