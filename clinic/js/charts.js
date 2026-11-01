/* =====================================================================
   charts.js — 의존성 없는 SVG 차트 (선, 막대: 누적/묶음, 기준선, 툴팁)
   ===================================================================== */
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== '') e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function niceStep(span, count = 5) {
  const raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
}
function niceTicks(min, max) {
  if (!(max > min)) max = min + 1;
  const step = niceStep(max - min);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const t = []; for (let v = lo; v <= hi + step * 1e-6; v += step) t.push(Math.round(v / step) * step);
  return t;
}

const tipEl = () => document.getElementById('tooltip');
function showTip(evt, html) {
  const tip = tipEl();
  tip.innerHTML = html; tip.style.display = 'block';
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = evt.clientX + 16, y = evt.clientY + 16;
  if (x + w > window.innerWidth - 8) x = evt.clientX - w - 16;
  if (y + h > window.innerHeight - 8) y = evt.clientY - h - 16;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideTip() { tipEl().style.display = 'none'; }
const tipRow = (color, name, val) => `<div class="t-row"><span><i style="background:${color}"></i>${name}</span><span>${val}</span></div>`;
const tipNote = (html) => `<div class="t-note">${html}</div>`;

function chartFrame(container, ticks, yFmt) {
  container.innerHTML = '';
  const W = container.clientWidth || 600, H = container.clientHeight || 300;
  const m = { t: 22, r: 14, b: 44, l: 58 };
  const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' }, container);
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const y = (v) => m.t + ih - (v - yMin) / (yMax - yMin || 1) * ih;
  const gridG = svgEl('g', {}, svg);
  ticks.forEach((t) => {
    svgEl('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: t === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }, gridG);
    svgEl('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--muted)', class: 'tnum' }, gridG).textContent = yFmt(t);
  });
  return { svg, W, H, m, iw, ih, y };
}
function drawXLabels(f, labels, xLabel, xc, maxLabels) {
  const n = labels.length, every = Math.max(1, Math.ceil(n / Math.max(1, maxLabels)));
  labels.forEach((l, i) => {
    if (i % every !== 0) return;
    (xLabel ? xLabel(l, i) : l).split('\n').forEach((t, j) => {
      svgEl('text', { x: xc(i), y: f.m.t + f.ih + 18 + j * 15, 'text-anchor': 'middle', 'font-size': j ? 11 : 12, fill: 'var(--muted)' }, f.svg).textContent = t;
    });
  });
}
function emptyMsg(container, msg = '표시할 데이터가 없습니다') {
  const d = document.createElement('div'); d.className = 'empty'; d.textContent = msg; container.appendChild(d);
}
function drawRefLine(f, ref) {
  if (!ref || ref.value == null) return;
  const yy = f.y(ref.value);
  svgEl('line', { x1: f.m.l, x2: f.W - f.m.r, y1: yy, y2: yy, stroke: 'var(--text-2)', 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }, f.svg);
  svgEl('text', { x: f.W - f.m.r, y: yy - 6, 'text-anchor': 'end', 'font-size': 12, 'font-weight': 600, fill: 'var(--text-2)' }, f.svg).textContent = ref.label;
}

/* 선 차트
   o = { labels, series:[{name,color,values,fmt,dashed,dots}], yFmt, xLabel, tipTitle(label,i), tipExtra(i),
         bands:[{i, kind}]  // 휴진/공휴일 음영
         refLine:{value,label}, yMinZero:true } */
function lineChart(container, o) {
  container._render = () => lineChart(container, o);
  const all = o.series.flatMap((s) => s.values).filter((v) => v != null);
  const maxV = Math.max(...all, o.refLine?.value ?? -Infinity, 0);
  const minV = o.yMinZero === false ? Math.min(...all) : 0;
  const ticks = niceTicks(minV, (maxV * 1.05) || 10);
  const f = chartFrame(container, ticks, o.yFmt);
  const n = o.labels.length;
  const step = n > 1 ? f.iw / (n - 1) : f.iw;
  const x = (i) => f.m.l + (n === 1 ? f.iw / 2 : i * step);
  (o.bands || []).forEach((b) => {
    const w = Math.max(2, Math.min(step, 40));
    svgEl('rect', { x: x(b.i) - w / 2, y: f.m.t, width: w, height: f.ih, fill: b.kind === 'holiday' ? 'var(--band-holiday)' : 'var(--band-closed)' }, f.svg);
  });
  drawXLabels(f, o.labels, o.xLabel, x, Math.floor(f.iw / 56));
  if (!all.length) return emptyMsg(container);
  drawRefLine(f, o.refLine);

  o.series.slice().reverse().forEach((s) => {
    let d = '', pen = false;
    s.values.forEach((v, i) => { if (v == null) return; d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + f.y(v).toFixed(1); pen = true; });
    svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dashed ? '6 5' : '' }, f.svg);
    if (s.dots) s.values.forEach((v, i) => { if (v != null) svgEl('circle', { cx: x(i), cy: f.y(v), r: 3, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 1.5 }, f.svg); });
    if (s.endLabels) s.values.forEach((v, i) => { if (v != null && n <= 14) svgEl('text', { x: x(i), y: f.y(v) - 10, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600, fill: 'var(--text-2)' }, f.svg).textContent = s.endLabels(v); });
  });
  const cross = svgEl('line', { y1: f.m.t, y2: f.m.t + f.ih, stroke: 'var(--axis)', 'stroke-width': 1, visibility: 'hidden' }, f.svg);
  const marks = o.series.map((s) => svgEl('circle', { r: 5, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }, f.svg));
  const hit = svgEl('rect', { x: f.m.l - 8, y: f.m.t, width: f.iw + 16, height: f.ih, fill: 'transparent' }, f.svg);
  hit.addEventListener('mousemove', (e) => {
    const r = f.svg.getBoundingClientRect();
    const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left - f.m.l) / step)));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    let rows = '';
    o.series.forEach((s, k) => {
      const v = s.values[i];
      if (v == null) { marks[k].setAttribute('visibility', 'hidden'); return; }
      marks[k].setAttribute('cx', x(i)); marks[k].setAttribute('cy', f.y(v)); marks[k].setAttribute('visibility', 'visible');
      rows += tipRow(s.color, s.name, s.fmt(v));
    });
    const extra = o.tipExtra ? o.tipExtra(i) : '';
    showTip(e, `<div class="t-title">${o.tipTitle ? o.tipTitle(o.labels[i], i) : o.labels[i]}</div>${rows}${extra}`);
  });
  hit.addEventListener('mouseleave', () => { hideTip(); cross.setAttribute('visibility', 'hidden'); marks.forEach((mk) => mk.setAttribute('visibility', 'hidden')); });
}

function barPath(x, y0, y1, w, r) { // y0 기준선 → y1 끝, 끝 쪽만 둥글게
  const up = y1 <= y0, h = Math.abs(y0 - y1); r = Math.min(r, h, w / 2);
  if (h < 0.5) return '';
  const s = up ? 1 : -1;
  return `M${x},${y0}V${y1 + s * r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + s * r}V${y0}Z`;
}

/* 막대 차트
   o = { labels, series:[{name,color,values,fmt}], stacked|grouped, yFmt, xLabel, tipTitle, extraTip(i),
         valueLabels(v,i), refLine:{value,label} } */
function barChart(container, o) {
  container._render = () => barChart(container, o);
  const n = o.labels.length;
  const vals = o.series.flatMap((s) => s.values).filter((v) => v != null);
  const totals = o.labels.map((_, i) => o.series.reduce((a, s) => a + (s.values[i] || 0), 0));
  const top = o.stacked ? totals : vals;
  const minV = Math.min(0, ...vals), maxV = Math.max(0, ...top, o.refLine?.value ?? 0);
  const ticks = niceTicks(minV < 0 ? minV * 1.1 : 0, (maxV * 1.12) || 10);
  const f = chartFrame(container, ticks, o.yFmt);
  const band = f.iw / Math.max(1, n);
  const groups = o.grouped ? o.series.length : 1;
  const groupW = Math.min(o.grouped ? 76 : 56, band * (o.grouped ? 0.78 : 0.62));
  const bw = o.grouped ? (groupW - 2 * (groups - 1)) / groups : groupW;
  const xc = (i) => f.m.l + band * i + band / 2;
  drawXLabels(f, o.labels, o.xLabel, xc, Math.floor(f.iw / 44));
  if (!vals.length) return emptyMsg(container);
  const y0 = f.y(0);

  o.labels.forEach((_, i) => {
    const g = svgEl('g', {}, f.svg);
    let labelY = y0, labelVal = null;
    if (o.grouped) {
      o.series.forEach((s, k) => {
        const v = s.values[i]; if (v == null) return;
        const bx = xc(i) - groupW / 2 + k * (bw + 2);
        const d = barPath(bx, y0, f.y(v), bw, 4); if (d) svgEl('path', { d, fill: s.color }, g);
      });
    } else {
      const present = o.series.filter((s) => s.values[i] != null && s.values[i] !== 0);
      let acc = 0;
      present.forEach((s, k) => {
        const v = s.values[i];
        const last = k === present.length - 1;
        const base = o.stacked ? acc : 0;
        let a = f.y(base), b = f.y(base + v);
        const dir = v >= 0 ? -1 : 1;
        if (o.stacked && k > 0) a += dir * 1;       // 누적 사이 2px 간격
        if (o.stacked && !last) b -= dir * 1;
        const x0 = xc(i) - bw / 2;
        const d = last ? barPath(x0, a, b, bw, 4) : `M${x0},${a}V${b}H${x0 + bw}V${a}Z`;
        if (d && Math.abs(a - b) > 0.5) svgEl('path', { d, fill: s.color }, g);
        if (o.stacked) acc += v;
      });
      if (present.length) { labelVal = o.stacked ? totals[i] : o.series[0].values[i]; labelY = f.y(labelVal); }
    }
    if (o.valueLabels && n <= 14) {
      const v = o.grouped ? null : labelVal;
      const text = o.valueLabels(v, i);
      if (text) {
        let yy;
        if (o.grouped) yy = f.y(Math.max(0, ...o.series.map((s) => s.values[i] ?? 0))) - 6;
        else yy = labelVal < 0 ? labelY + 16 : labelY - 6;
        svgEl('text', { x: xc(i), y: yy, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600, fill: 'var(--text-2)' }, f.svg).textContent = text;
      }
    }
    const hit = svgEl('rect', { x: f.m.l + band * i, y: f.m.t, width: band, height: f.ih, fill: 'transparent' }, f.svg);
    hit.addEventListener('mousemove', (e) => {
      g.style.opacity = 0.8;
      let rows = o.series.map((s) => s.values[i] == null ? '' : tipRow(s.color, s.name, s.fmt(s.values[i]))).join('');
      const has = !!rows;
      if (!rows) rows = '<div style="color:var(--muted)">기록 없음</div>';
      const title = o.tipTitle ? o.tipTitle(o.labels[i], i) : o.labels[i];
      showTip(e, `<div class="t-title">${title}</div>${rows}${has && o.extraTip ? o.extraTip(i) : ''}`);
    });
    hit.addEventListener('mouseleave', () => { g.style.opacity = 1; hideTip(); });
  });
  drawRefLine(f, o.refLine);
}

let _resizeT;
window.addEventListener('resize', () => {
  clearTimeout(_resizeT);
  _resizeT = setTimeout(() => document.querySelectorAll('.chart').forEach((c) => c.offsetParent && c._render && c._render()), 150);
});
