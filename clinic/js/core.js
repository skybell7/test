/* =====================================================================
   core.js — 저장소, 공용 유틸, 공휴일, 집계
   ===================================================================== */

/* ---------- 저장소 (브라우저 localStorage) ---------- */
const STORE_KEY = 'clinicStats.v1';
const DEFAULT_SETTINGS = {
  region: 'seoul',          // 날씨 지역
  closedWeekdays: [0],      // 정기 휴진 요일 (0=일)
  cardFeeRate: 1.5,         // 카드 수수료율 (%)
  monthlyTarget: null,      // 월 목표 총수입 (원)
  fixedCostOverride: null,  // 월 고정비 직접 지정 (원)
  extraHolidays: '',        // 추가 공휴일 "YYYY-MM-DD 이름" 줄 단위
};
let DB = loadDB();
function loadDB() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) {}
  if (!d || !d.daily || !d.monthly) d = { daily: {}, monthly: {} };
  d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  return d;
}
function persist() { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }
const S = () => DB.settings;

/* ---------- 유틸 ---------- */
const $ = (id) => document.getElementById(id);
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월~일
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const addMonths = (m, n) => { const [y, mm] = m.split('-').map(Number); return ym(new Date(y, mm - 1 + n, 1)); };
const weekday = (s) => parseYmd(s).getDay();
const daysInMonth = (m) => { const [y, mm] = m.split('-').map(Number); return new Date(y, mm, 0).getDate(); };
const TODAY = ymd(new Date());
const fmt = (n) => (n == null || isNaN(n)) ? '-' : Math.round(n).toLocaleString('ko-KR');
const won = (n) => (n == null || isNaN(n)) ? '-' : fmt(n) + '원';
const pct = (n, digits = 1) => (n == null || isNaN(n) || !isFinite(n)) ? '-' : n.toFixed(digits) + '%';
function man(n) { // 짧은 금액 표기 (만/억)
  if (n == null || isNaN(n)) return '-';
  const a = Math.abs(n);
  if (a >= 1e8) return (n / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, '') + '억';
  if (a >= 1e4) return fmt(n / 1e4) + '만';
  return fmt(n);
}
const monthLabel = (m) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;
const dateLabel = (d) => `${d.slice(0, 4)}.${d.slice(5, 7)}.${d.slice(8)} (${WD[weekday(d)]})`;
const shortDate = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const numVal = (el) => { const v = el.value.replace(/[^\d]/g, ''); return v === '' ? null : Number(v); };
const setNum = (el, v) => { el.value = (v == null || v === '') ? '' : Number(v).toLocaleString('ko-KR'); };
const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const change = (cur, prev) => (cur == null || !prev) ? null : (cur - prev) / prev * 100;
function daysBetween(from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }
function monthsBetween(from, to) { const out = []; for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(m, 1)) out.push(m); return out; }
function flash(el, msg, ok = true) {
  el.textContent = msg; el.className = 'status ' + (ok ? 'ok' : 'err');
  clearTimeout(el._t); el._t = setTimeout(() => { el.textContent = ''; }, 4000);
}
function download(name, text, type) {
  const blob = new Blob([text], { type }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- 공휴일 (대한민국, 대체공휴일·임시공휴일 포함) ----------
   이후 연도나 새로 지정된 임시공휴일은 ⑤ 설정의 '추가 공휴일'에 입력하세요. */
const HOLIDAYS = {
  // 2024
  '2024-01-01': '신정', '2024-02-09': '설날 연휴', '2024-02-10': '설날', '2024-02-11': '설날 연휴', '2024-02-12': '대체공휴일(설날)',
  '2024-03-01': '삼일절', '2024-04-10': '국회의원선거', '2024-05-05': '어린이날', '2024-05-06': '대체공휴일(어린이날)',
  '2024-05-15': '부처님오신날', '2024-06-06': '현충일', '2024-08-15': '광복절', '2024-09-16': '추석 연휴', '2024-09-17': '추석',
  '2024-09-18': '추석 연휴', '2024-10-01': '국군의 날(임시)', '2024-10-03': '개천절', '2024-10-09': '한글날', '2024-12-25': '성탄절',
  // 2025
  '2025-01-01': '신정', '2025-01-27': '임시공휴일', '2025-01-28': '설날 연휴', '2025-01-29': '설날', '2025-01-30': '설날 연휴',
  '2025-03-01': '삼일절', '2025-03-03': '대체공휴일(삼일절)', '2025-05-05': '어린이날·부처님오신날', '2025-05-06': '대체공휴일',
  '2025-06-03': '대통령선거', '2025-06-06': '현충일', '2025-08-15': '광복절', '2025-10-03': '개천절', '2025-10-05': '추석 연휴',
  '2025-10-06': '추석', '2025-10-07': '추석 연휴', '2025-10-08': '대체공휴일(추석)', '2025-10-09': '한글날', '2025-12-25': '성탄절',
  // 2026
  '2026-01-01': '신정', '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴', '2026-03-01': '삼일절',
  '2026-03-02': '대체공휴일(삼일절)', '2026-05-05': '어린이날', '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일(부처님오신날)',
  '2026-06-03': '전국동시지방선거', '2026-06-06': '현충일', '2026-08-15': '광복절', '2026-08-17': '대체공휴일(광복절)',
  '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴', '2026-10-03': '개천절', '2026-10-05': '대체공휴일(개천절)',
  '2026-10-09': '한글날', '2026-12-25': '성탄절',
  // 2027
  '2027-01-01': '신정', '2027-02-06': '설날 연휴', '2027-02-07': '설날', '2027-02-08': '설날 연휴', '2027-02-09': '대체공휴일(설날)',
  '2027-03-01': '삼일절', '2027-05-05': '어린이날', '2027-05-13': '부처님오신날', '2027-06-06': '현충일', '2027-08-15': '광복절',
  '2027-08-16': '대체공휴일(광복절)', '2027-09-14': '추석 연휴', '2027-09-15': '추석', '2027-09-16': '추석 연휴', '2027-10-03': '개천절',
  '2027-10-04': '대체공휴일(개천절)', '2027-10-09': '한글날', '2027-10-11': '대체공휴일(한글날)', '2027-12-25': '성탄절', '2027-12-27': '대체공휴일(성탄절)',
};
let _extraCache = { src: null, map: {} };
function extraHolidays() {
  const src = S().extraHolidays || '';
  if (_extraCache.src !== src) {
    const map = {};
    src.split('\n').forEach((line) => {
      const m = line.trim().match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/);
      if (m) map[m[1]] = m[2].trim() || '공휴일';
    });
    _extraCache = { src, map };
  }
  return _extraCache.map;
}
const holidayName = (d) => extraHolidays()[d] || HOLIDAYS[d] || null;

/* ---------- 날짜 상태 ---------- */
// 진료일 = 기록이 있고 휴진이 아닌 날. 평균은 진료일만으로 계산합니다.
const isOpenRec = (r) => !!r && !r.closed;
const isScheduledClosed = (d) => S().closedWeekdays.includes(weekday(d)) || !!holidayName(d);
function dayStatus(d) {
  const r = DB.daily[d];
  if (r) return r.closed ? 'closed' : 'open';
  if (holidayName(d)) return 'holiday';
  if (S().closedWeekdays.includes(weekday(d))) return 'regular';
  return d > TODAY ? 'future' : 'missing';
}
const STATUS_LABEL = { closed: '휴진', holiday: '공휴일', regular: '정기 휴진', missing: '미입력', future: '' };

function openRecords(from, to) {
  return Object.keys(DB.daily).filter((d) => d >= from && d <= to && isOpenRec(DB.daily[d])).sort()
    .map((d) => ({ date: d, ...DB.daily[d] }));
}

/* ---------- 월 집계 ---------- */
const EXPENSE_KEYS = ['labor', 'rent', 'supplies', 'other'];
function monthAgg(m) {
  const dates = Object.keys(DB.daily).filter((d) => d.startsWith(m));
  const recs = dates.filter((d) => isOpenRec(DB.daily[d])).map((d) => DB.daily[d]);
  const mr = DB.monthly[m] || {};
  const revenue = sum(recs, (r) => r.revenue);
  const patients = sum(recs, (r) => r.patients);
  const newPatients = sum(recs, (r) => r.newPatients);
  const split = recs.filter((r) => r.card != null || r.cash != null || r.transfer != null);
  const card = sum(split, (r) => r.card), cash = sum(split, (r) => r.cash), transfer = sum(split, (r) => r.transfer);
  const cardFee = card * (Number(S().cardFeeRate) || 0) / 100;
  const insurance = mr.insurance || 0;
  const hasInsurance = mr.insurance != null;
  const hasClaim = mr.claim != null;
  const hasExpense = EXPENSE_KEYS.some((k) => mr[k] != null);
  const fixed = (mr.labor || 0) + (mr.rent || 0) + (mr.other || 0);
  const variable = (mr.supplies || 0) + cardFee;
  const expense = fixed + variable;
  const income = revenue + insurance;
  const days = daysBetween(`${m}-01`, `${m}-${pad(daysInMonth(m))}`);
  return {
    month: m, openDays: recs.length, closedDays: dates.filter((d) => DB.daily[d].closed).length,
    scheduledOpenDays: days.filter((d) => !isScheduledClosed(d)).length,
    patients, newPatients, revenue, nonCovered: sum(recs, (r) => r.nonCovered),
    card, cash, transfer, splitTotal: card + cash + transfer, cardFee,
    claim: mr.claim || 0, hasClaim, insurance, hasInsurance,
    cut: hasClaim && hasInsurance ? mr.claim - insurance : null,
    cutRate: hasClaim && hasInsurance && mr.claim ? (mr.claim - insurance) / mr.claim * 100 : null,
    income, fixed, variable, expense, hasExpense,
    profit: hasExpense ? income - expense : null,
    labor: mr.labor, rent: mr.rent, supplies: mr.supplies, other: mr.other,
  };
}

/* ---------- 손익분기 ----------
   최근(기준월 이전 포함) 보험 지급액과 지출이 모두 입력된 최대 3개월을 사용합니다.
   환자 1인당 공헌이익 = (총수입 − 변동비[재료비+카드수수료]) / 환자 수
   손익분기 월 환자 = 월 고정비 / 1인당 공헌이익,  일 환자 = 월 환자 / 월 진료일수 */
function breakEven(uptoMonth = TODAY.slice(0, 7)) {
  const ms = Object.keys(DB.monthly).filter((m) => m <= uptoMonth).sort().reverse()
    .map(monthAgg).filter((a) => a.hasExpense && a.hasInsurance && a.patients > 0 && a.openDays > 0).slice(0, 3);
  if (!ms.length) return null;
  const patients = sum(ms, (a) => a.patients), openDays = sum(ms, (a) => a.openDays);
  const contribution = (sum(ms, (a) => a.income) - sum(ms, (a) => a.variable)) / patients;
  const fixedAvg = S().fixedCostOverride || sum(ms, (a) => a.fixed) / ms.length;
  const openDaysAvg = openDays / ms.length;
  if (contribution <= 0) return { months: ms.map((a) => a.month), contribution, impossible: true };
  const monthPatients = fixedAvg / contribution;
  return {
    months: ms.map((a) => a.month), contribution, fixedAvg, openDaysAvg,
    monthPatients, dayPatients: monthPatients / openDaysAvg, currentDay: patients / openDays,
  };
}

/* ---------- 보험 지급 비율 (이번 달 예상 총수입 계산용) ---------- */
function insuranceRatio(beforeMonth) {
  const ms = Object.keys(DB.monthly).filter((m) => m < beforeMonth).sort().reverse()
    .map(monthAgg).filter((a) => a.hasInsurance && a.revenue > 0).slice(0, 6);
  if (!ms.length) return null;
  return sum(ms, (a) => a.insurance) / sum(ms, (a) => a.revenue);
}

/* ---------- 이번 달 목표 / 예상 ---------- */
function monthProgress(m = TODAY.slice(0, 7)) {
  const a = monthAgg(m);
  const last = `${m}-${pad(daysInMonth(m))}`;
  const isCurrent = m === TODAY.slice(0, 7);
  const restDays = isCurrent ? daysBetween(addDays(TODAY, 1), last).filter((d) => !isScheduledClosed(d) && !DB.daily[d]).length : 0;
  const perDay = a.openDays ? a.revenue / a.openDays : 0;
  const projRevenue = a.revenue + perDay * restDays;
  const ratio = insuranceRatio(m);
  const insEst = a.hasInsurance ? a.insurance : (ratio != null ? projRevenue * ratio : null);
  const insNow = a.hasInsurance ? a.insurance : (ratio != null ? a.revenue * ratio : 0);
  const target = Number(S().monthlyTarget) || null;
  const projIncome = projRevenue + (insEst || 0);
  const nowIncome = a.revenue + insNow;
  const needPerDay = target && restDays ? Math.max(0, (target - nowIncome) / restDays / (1 + (a.hasInsurance ? 0 : (ratio || 0)))) : null;
  return { a, restDays, perDay, projRevenue, insEst, insEstimated: !a.hasInsurance && ratio != null, nowIncome, projIncome, target, needPerDay, ratio };
}
