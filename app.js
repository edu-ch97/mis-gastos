'use strict';

/* =========================================================
   Mis Gastos — PWA personal de control de gastos
   Los datos se guardan solo en este dispositivo (IndexedDB).
   ========================================================= */

// ---------- Utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => ymd(new Date());
const monthOf = iso => iso.slice(0, 7);
const currentMonth = () => monthOf(todayISO());
const addMonths = (mk, n) => { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const daysInMonth = mk => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const parseAmount = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const monthName = (mk, opts = { month: 'long', year: 'numeric' }) => {
  const [y, m] = mk.split('-').map(Number);
  return cap(new Date(y, m - 1, 1).toLocaleDateString('es-PE', opts).replace('.', ''));
};

// ---------- Datos por defecto ----------
const METHODS = ['Efectivo', 'Tarjeta de débito', 'Tarjeta de crédito', 'Yape / Plin', 'Transferencia'];
const CURRENCIES = { PEN: 'Soles (S/)', USD: 'Dólares (US$)' };
const DEFAULT_CATEGORIES = [
  { id: 'comida', name: 'Comida', emoji: '🍽️', color: '#f97316' },
  { id: 'supermercado', name: 'Supermercado', emoji: '🛒', color: '#65a30d' },
  { id: 'transporte', name: 'Transporte', emoji: '🚌', color: '#0ea5e9' },
  { id: 'vivienda', name: 'Vivienda', emoji: '🏠', color: '#8b5cf6' },
  { id: 'servicios', name: 'Servicios', emoji: '💡', color: '#eab308' },
  { id: 'salud', name: 'Salud', emoji: '💊', color: '#ef4444' },
  { id: 'educacion', name: 'Educación', emoji: '📚', color: '#6366f1' },
  { id: 'entretenimiento', name: 'Entretenimiento', emoji: '🎬', color: '#ec4899' },
  { id: 'ropa', name: 'Ropa', emoji: '👕', color: '#14b8a6' },
  { id: 'suscripciones', name: 'Suscripciones', emoji: '📱', color: '#a855f7' },
  { id: 'tarjeta', name: 'Tarjeta / Deudas', emoji: '💳', color: '#64748b' },
  { id: 'cuidado', name: 'Cuidado personal', emoji: '🧴', color: '#f43f5e' },
  { id: 'mascotas', name: 'Mascotas', emoji: '🐾', color: '#a16207' },
  { id: 'regalos', name: 'Regalos', emoji: '🎁', color: '#d946ef' },
  { id: 'viajes', name: 'Viajes', emoji: '✈️', color: '#06b6d4' },
  { id: 'otros', name: 'Otros', emoji: '📦', color: '#78716c' },
];
const EMOJIS = ['🍽️', '🍔', '☕', '🍺', '🛒', '🚌', '🚕', '🚗', '⛽', '🅿️', '🏠', '💡', '💧', '📶', '📱', '💊', '🏥', '🦷', '🏋️', '📚', '🎓', '💻', '🎬', '🎮', '🎵', '👕', '👟', '💇', '🧴', '💳', '🏦', '🐾', '👶', '🎁', '✈️', '🏖️', '🔧', '💼', '⛪', '🏷️'];
const COLORS = ['#ef4444', '#f97316', '#eab308', '#65a30d', '#16a34a', '#14b8a6', '#06b6d4', '#0ea5e9', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#a16207', '#64748b'];

function defaultState() {
  return {
    version: 1,
    settings: { currency: 'PEN', rate: 3.75, monthlyBudget: 0, budgetMode: 'fixed', budgetPercent: 0, salaries: [], lastBackup: null },
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c, budget: 0 })),
    expenses: [],
    incomes: [],
    recurring: [],
  };
}
function normalize(s) {
  const d = defaultState();
  s = { ...d, ...(s || {}) };
  s.settings = { ...d.settings, ...(s.settings || {}) };
  for (const k of ['categories', 'expenses', 'incomes', 'recurring']) if (!Array.isArray(s[k])) s[k] = d[k];
  if (!Array.isArray(s.settings.salaries)) s.settings.salaries = [];
  if (!s.categories.some(c => c.id === 'otros')) s.categories.push({ ...DEFAULT_CATEGORIES.at(-1), budget: 0 });
  return s;
}

// ---------- Almacenamiento (IndexedDB con respaldo en localStorage) ----------
const LS_KEY = 'mis-gastos';
let dbPromise;
function openDB() {
  if (!dbPromise) dbPromise = new Promise((res, rej) => {
    const r = indexedDB.open('mis-gastos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbPromise;
}
async function load() {
  try {
    const db = await openDB();
    return await new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get('state');
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => rej(q.error);
    });
  } catch {
    try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; }
  }
}
async function save() {
  const snapshot = JSON.parse(JSON.stringify(state));
  try {
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(snapshot, 'state');
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    try { localStorage.setItem(LS_KEY, JSON.stringify(snapshot)); } catch { toast('⚠️ No se pudo guardar'); }
  }
}

// ---------- Estado ----------
let state = defaultState();
let tab = 'resumen';
let viewMonth = currentMonth();
let filterCat = 'all';
let search = '';
let last = { currency: null, categoryId: null, method: null }; // últimas elecciones en el formulario

// ---------- Dinero ----------
const mainCur = () => state.settings.currency;
const fmtCache = {};
function fmt(n, cur = mainCur()) {
  fmtCache[cur] ||= new Intl.NumberFormat('es-PE', { style: 'currency', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return fmtCache[cur].format(n || 0);
}
const compactFmt = new Intl.NumberFormat('es-PE', { notation: 'compact', maximumFractionDigits: 1 });
function toMain(amount, cur) {
  const r = state.settings.rate || 1;
  if (cur === mainCur()) return amount;
  return mainCur() === 'PEN' ? amount * r : amount / r;
}

// ---------- Consultas ----------
const FALLBACK_CAT = { id: '?', name: 'Sin categoría', emoji: '❔', color: '#9ca3af', budget: 0 };
const catById = id => state.categories.find(c => c.id === id) || FALLBACK_CAT;
const expensesOf = mk => state.expenses.filter(e => monthOf(e.date) === mk);
const totalOf = list => list.reduce((s, e) => s + toMain(e.amount, e.currency), 0);
const pctClass = p => (p >= 100 ? 'over' : p >= 80 ? 'warn' : '');

// ---------- Ingresos ----------
// El sueldo guarda un historial: cada cambio aplica desde el mes en que se hizo,
// así los meses anteriores conservan el sueldo que tenían.
function salaryEntryFor(mk) {
  let found = null;
  for (const e of [...state.settings.salaries].sort((a, b) => a.from.localeCompare(b.from))) if (e.from <= mk) found = e;
  return found;
}
const salaryFor = mk => { const e = salaryEntryFor(mk); return e ? toMain(e.amount, e.currency) : 0; };
const incomesOf = mk => state.incomes.filter(i => monthOf(i.date) === mk);
const incomeTotal = mk => salaryFor(mk) + totalOf(incomesOf(mk));
function budgetFor(mk) {
  const s = state.settings;
  if (s.budgetMode === 'percent') return s.budgetPercent > 0 ? incomeTotal(mk) * s.budgetPercent / 100 : 0;
  return s.monthlyBudget || 0;
}
function setSalary(amount, currency) {
  const list = state.settings.salaries, cm = currentMonth();
  const latest = [...list].sort((a, b) => a.from.localeCompare(b.from)).at(-1);
  if (!latest) { if (amount > 0) list.push({ from: '0000-01', setIn: cm, amount, currency }); }
  else if (latest.setIn === cm) Object.assign(latest, { amount, currency });   // corrección en el mismo mes
  else list.push({ from: cm, setIn: cm, amount, currency });                     // cambio de sueldo desde este mes
  save();
}

// ---------- Gastos fijos (se registran solos cada mes) ----------
function generateRecurring() {
  const cur = currentMonth();
  const today = new Date().getDate();
  let changed = false;
  for (const r of state.recurring) {
    if (!r.active) continue;
    let m = addMonths(r.lastGenerated, 1);
    while (m <= cur) {
      const day = Math.min(r.day, daysInMonth(m));
      if (m === cur && today < day) break; // aún no llega el día de este mes
      state.expenses.push({
        id: uid(), createdAt: Date.now(), amount: r.amount, currency: r.currency, categoryId: r.categoryId,
        method: r.method, note: r.note, date: `${m}-${pad(day)}`, recurringId: r.id,
      });
      r.lastGenerated = m;
      m = addMonths(m, 1);
      changed = true;
    }
  }
  if (changed) save();
  return changed;
}

// =========================================================
// Vistas
// =========================================================
function render() {
  $('#monthLabel').textContent = monthName(viewMonth);
  const hideTop = tab === 'ajustes';
  $('.topbar').classList.toggle('hidden', hideTop);
  document.body.classList.toggle('no-topbar', hideTop);
  document.querySelectorAll('.tabbar [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const views = { resumen: viewSummary, movimientos: viewList, categorias: viewCategories, ajustes: viewSettings };
  $('#view').innerHTML = views[tab]();
}

// ----- Resumen -----
function viewSummary() {
  const list = expensesOf(viewMonth);
  const total = totalOf(list);
  const prevMonth = addMonths(viewMonth, -1);
  const prevTotal = totalOf(expensesOf(prevMonth));
  const isCurrent = viewMonth === currentMonth();
  const daysElapsed = isCurrent ? new Date().getDate() : daysInMonth(viewMonth);
  const budget = budgetFor(viewMonth);
  const bLabel = state.settings.budgetMode === 'percent' ? ` (${state.settings.budgetPercent}% de tus ingresos)` : '';
  let html = '';

  // Recordatorio de respaldo
  const lb = state.settings.lastBackup;
  if (state.expenses.length >= 15 && (!lb || Date.now() - lb > 30 * 864e5)) {
    html += `<div class="banner" data-action="backup">💾 ${lb ? 'Hace más de un mes que no haces' : 'Aún no has hecho'} un respaldo. Toca aquí para crearlo.</div>`;
  }

  let delta = '';
  if (prevTotal > 0) {
    const p = (total - prevTotal) / prevTotal * 100;
    delta = `<span class="delta ${p > 0 ? 'up' : 'down'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}% vs ${monthName(prevMonth, { month: 'short' })}</span>`;
  }

  let budgetHtml = '';
  if (budget > 0) {
    const pct = total / budget * 100;
    const left = budget - total;
    let perDay = '';
    if (isCurrent && left > 0) {
      const remainingDays = daysInMonth(viewMonth) - new Date().getDate() + 1;
      perDay = ` · ~${fmt(left / remainingDays)} por día`;
    }
    budgetHtml = `<div class="progress ${pctClass(pct)}"><div style="width:${Math.min(pct, 100)}%"></div></div>
      <div class="muted small">${left >= 0 ? `Te quedan <b>${fmt(left)}</b> de ${fmt(budget)}${bLabel}${perDay}` : `Te pasaste <b>${fmt(-left)}</b> del presupuesto de ${fmt(budget)}${bLabel}`}</div>`;
  }

  const maxExp = list.reduce((m, e) => Math.max(m, toMain(e.amount, e.currency)), 0);
  html += `<section class="card hero">
    <div class="muted small">Total gastado</div>
    <div class="big">${fmt(total)}</div>
    ${delta}${budgetHtml}
    <div class="stats">
      <div><b>${list.length}</b><span>movimientos</span></div>
      <div><b>${fmt(total / daysElapsed)}</b><span>promedio diario</span></div>
      <div><b>${fmt(maxExp)}</b><span>gasto mayor</span></div>
    </div>
  </section>`;

  html += incomeCard(viewMonth, total);

  if (!list.length) {
    html += `<section class="card empty">Aún no hay gastos en ${monthName(viewMonth, { month: 'long' })}.<br>
      <button class="btn primary" data-action="add">＋ Añadir gasto</button></section>`;
  } else {
    // Por categoría
    const byCat = {};
    for (const e of list) byCat[e.categoryId] = (byCat[e.categoryId] || 0) + toMain(e.amount, e.currency);
    const items = Object.entries(byCat).map(([id, value]) => ({ cat: catById(id), id, value })).sort((a, b) => b.value - a.value);
    html += `<section class="card"><h3>Por categoría</h3>
      <div class="donut-wrap">${donut(items, total)}<div class="donut-center"><small>Total</small><b>${fmt(total)}</b></div></div>
      <ul class="cat-list">${items.map(it => catRow(it.cat, it.value, total, it.id)).join('')}</ul>
    </section>`;

    // Por método de pago
    const byMethod = {};
    for (const e of list) byMethod[e.method || '—'] = (byMethod[e.method || '—'] || 0) + toMain(e.amount, e.currency);
    html += `<section class="card"><h3>Por método de pago</h3>
      ${Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([m, v]) => `<div class="kv"><span>${esc(m)}</span><b>${fmt(v)}</b></div>`).join('')}
    </section>`;
  }

  html += trendCard();
  return html;
}

function incomeCard(mk, spent) {
  const salary = salaryFor(mk);
  const extras = incomesOf(mk).sort((a, b) => a.date.localeCompare(b.date));
  const income = salary + totalOf(extras);
  let body = '';
  if (salary > 0) body += `<div class="kv"><span>💼 Sueldo</span><b>${fmt(salary)}</b></div>`;
  body += extras.map(i => `<button class="kv income-row" data-action="edit-income" data-id="${i.id}">
      <span>💰 ${esc(i.note || 'Ingreso extra')} <small class="muted">${Number(i.date.slice(8))}/${Number(i.date.slice(5, 7))}</small></span>
      <b>${fmt(i.amount, i.currency)}</b></button>`).join('');
  if (income > 0) {
    const pct = spent / income * 100;
    const saved = income - spent;
    const target = state.settings.budgetMode === 'percent' && state.settings.budgetPercent > 0 ? state.settings.budgetPercent : null;
    body += `<div class="kv total"><span>Total ingresos</span><b>${fmt(income)}</b></div>
      <div class="split ${pctClass(target ? pct / target * 100 : pct)}">
        <div class="spent" style="width:${Math.min(pct, 100)}%"></div>
        ${target ? `<div class="marker" style="left:${Math.min(target, 100)}%" title="Meta: ${target}%"></div>` : ''}
      </div>
      <div class="split-legend">
        <span>Gastaste <b>${pct.toFixed(1)}%</b> de tus ingresos${target ? ` · meta ${target}%` : ''}</span>
        <span class="${saved >= 0 ? 'pos' : 'neg'}">${saved >= 0 ? `Ahorro: <b>${fmt(saved)}</b> (${(100 - pct).toFixed(1)}%)` : `Gastaste <b>${fmt(-saved)}</b> más de lo que ingresó`}</span>
      </div>`;
  } else {
    body += `<p class="muted small" style="margin-top:0">Registra tu sueldo para ver qué porcentaje de tus ingresos gastas y cuánto ahorras.</p>
      <button class="btn block" data-action="goto-settings">💼 Configurar sueldo</button>`;
  }
  return `<section class="card"><h3>Ingresos vs gastos</h3>${body}
    <button class="btn block" data-action="add-income">＋ Añadir ingreso extra</button>
    <p class="muted small center" style="margin-bottom:0">Gratificación, bonos, freelance, ventas…</p></section>`;
}

function catRow(cat, value, total, id) {
  const budgetLine = cat.budget > 0
    ? `<div class="progress thin ${pctClass(value / cat.budget * 100)}"><div style="width:${Math.min(value / cat.budget * 100, 100)}%"></div></div>
       <div class="sub">${fmt(value)} de ${fmt(cat.budget)}</div>`
    : `<div class="sub">${(value / total * 100).toFixed(1)}% del mes</div>`;
  return `<li><button class="cat-row" data-action="filter" data-id="${esc(id)}">
    <span class="cat-ico" style="background:${cat.color}26">${esc(cat.emoji)}</span>
    <span class="cat-info"><span class="top"><span class="name">${esc(cat.name)}</span><b>${fmt(value)}</b></span>${budgetLine}</span>
  </button></li>`;
}

function donut(items, total) {
  const R = 62, C = 2 * Math.PI * R;
  let off = 0;
  const segs = items.map(it => {
    const len = (it.value / total) * C;
    const gap = items.length > 1 ? Math.min(2, len / 3) : 0;
    const s = `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${it.cat.color}" stroke-width="24"
      stroke-dasharray="${Math.max(len - gap, 0.01)} ${C}" stroke-dashoffset="${-off}"/>`;
    off += len;
    return s;
  }).join('');
  return `<svg viewBox="0 0 160 160" class="donut"><g transform="rotate(-90 80 80)">${segs}</g></svg>`;
}

function trendCard() {
  const months = Array.from({ length: 6 }, (_, i) => addMonths(viewMonth, i - 5));
  const vals = months.map(m => totalOf(expensesOf(m)));
  const max = Math.max(...vals, 1);
  return `<section class="card"><h3>Últimos 6 meses</h3><div class="bars">
    ${months.map((m, i) => `<button class="bar ${m === viewMonth ? 'current' : ''}" data-action="goto-month" data-month="${m}">
      <span class="bar-val">${vals[i] ? compactFmt.format(vals[i]) : ''}</span>
      <span class="track"><span class="fill" style="height:${vals[i] / max * 100}%"></span></span>
      <span class="bar-label">${monthName(m, { month: 'short' })}</span>
    </button>`).join('')}
  </div></section>`;
}

// ----- Movimientos -----
function viewList() {
  const monthList = expensesOf(viewMonth);
  const used = new Set(monthList.map(e => e.categoryId));
  if (filterCat !== 'all') used.add(filterCat);
  const cats = state.categories.filter(c => used.has(c.id));
  return `<div class="search"><input type="search" id="search" placeholder="🔎 Buscar por nota, categoría o método" value="${esc(search)}" autocomplete="off"></div>
    <div class="chips">
      <button class="chip ${filterCat === 'all' ? 'on' : ''}" data-action="filter" data-id="all">Todas</button>
      ${cats.map(c => `<button class="chip ${filterCat === c.id ? 'on' : ''}" data-action="filter" data-id="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}
    </div>
    <div id="txList">${listBody()}</div>`;
}

function listBody() {
  let list = expensesOf(viewMonth);
  if (filterCat !== 'all') list = list.filter(e => e.categoryId === filterCat);
  if (search.trim()) {
    const q = norm(search.trim());
    list = list.filter(e => norm(e.note).includes(q) || norm(catById(e.categoryId).name).includes(q) || norm(e.method).includes(q) || String(e.amount).includes(q));
  }
  if (!list.length) {
    return `<section class="card empty">${search || filterCat !== 'all' ? 'No hay resultados con ese filtro.' : `Sin movimientos en ${monthName(viewMonth, { month: 'long' })}.`}
      ${!search && filterCat === 'all' ? '<br><button class="btn primary" data-action="add">＋ Añadir gasto</button>' : ''}</section>`;
  }
  list.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const groups = new Map();
  for (const e of list) { if (!groups.has(e.date)) groups.set(e.date, []); groups.get(e.date).push(e); }
  let html = `<div class="list-total">${list.length} movimiento${list.length === 1 ? '' : 's'} · ${fmt(totalOf(list))}</div>`;
  for (const [date, items] of groups) {
    html += `<div class="day"><div class="day-head"><span>${dayLabel(date)}</span><span>${fmt(totalOf(items))}</span></div>
      ${items.map(txRow).join('')}</div>`;
  }
  return html;
}

function txRow(e) {
  const c = catById(e.categoryId);
  const other = e.currency !== mainCur() ? `<small>≈ ${fmt(toMain(e.amount, e.currency))}</small>` : '';
  return `<button class="tx" data-action="edit" data-id="${e.id}">
    <span class="cat-ico" style="background:${c.color}26">${esc(c.emoji)}</span>
    <span class="tx-main"><b>${esc(e.note || c.name)}</b><small>${esc(c.name)} · ${esc(e.method)}${e.recurringId ? ' · 🔁' : ''}</small></span>
    <span class="tx-amt">${fmt(e.amount, e.currency)}${other}</span>
  </button>`;
}

function dayLabel(iso) {
  if (iso === todayISO()) return 'Hoy';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (iso === ymd(y)) return 'Ayer';
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '');
}

// ----- Categorías -----
function viewCategories() {
  const list = expensesOf(viewMonth);
  const spent = {};
  for (const e of list) spent[e.categoryId] = (spent[e.categoryId] || 0) + toMain(e.amount, e.currency);
  const withBudget = state.categories.filter(c => c.budget > 0);
  const budgetSum = withBudget.reduce((s, c) => s + c.budget, 0);
  return `<section class="card">
    <h3>Categorías</h3>
    <p class="muted small" style="margin-top:-6px">Gasto de ${monthName(viewMonth, { month: 'long' })} y presupuesto mensual de cada categoría. Toca una para editarla.</p>
    ${withBudget.length ? `<div class="note">Presupuestos por categoría: ${fmt(budgetSum)} en total.</div>` : ''}
    <ul class="cat-list">
      ${state.categories.map(c => {
        const v = spent[c.id] || 0;
        const sub = c.budget > 0
          ? `<div class="progress thin ${pctClass(v / c.budget * 100)}"><div style="width:${Math.min(v / c.budget * 100, 100)}%"></div></div><div class="sub">${fmt(v)} de ${fmt(c.budget)}</div>`
          : `<div class="sub">${v ? fmt(v) + ' este mes' : 'Sin gastos este mes'} · sin presupuesto</div>`;
        return `<li><button class="cat-row" data-action="edit-cat" data-id="${esc(c.id)}">
          <span class="cat-ico" style="background:${c.color}26">${esc(c.emoji)}</span>
          <span class="cat-info"><span class="top"><span class="name">${esc(c.name)}</span></span>${sub}</span>
          <span class="chev">›</span></button></li>`;
      }).join('')}
    </ul>
    <button class="btn primary block" data-action="add-cat">＋ Nueva categoría</button>
  </section>`;
}

// ----- Ajustes -----
function viewSettings() {
  const s = state.settings;
  const lb = s.lastBackup ? new Date(s.lastBackup).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }) : 'nunca';
  const rec = state.recurring;
  const sal = salaryEntryFor(currentMonth());
  const salCur = sal?.currency || s.currency;
  return `<section class="card">
    <h3>Moneda principal</h3>
    <div class="seg">${Object.entries(CURRENCIES).map(([k, v]) => `<button class="${s.currency === k ? 'on' : ''}" data-action="set-currency" data-cur="${k}">${v}</button>`).join('')}</div>
    <p class="muted small">Los totales y presupuestos se muestran en esta moneda. Cada gasto puede registrarse en soles o en dólares.</p>
    <label class="field">Tipo de cambio: 1 US$ = S/
      <input id="rate" type="text" inputmode="decimal" value="${s.rate}">
    </label>
    <p class="muted small" style="margin-top:-6px">Se usa para convertir los gastos de la otra moneda. Actualízalo cuando quieras.</p>
  </section>

  <section class="card">
    <h3>Sueldo mensual 💼</h3>
    <div class="amount-row">
      <div class="seg">${Object.keys(CURRENCIES).map(k => `<button class="${salCur === k ? 'on' : ''}" data-action="salary-cur" data-cur="${k}">${k === 'PEN' ? 'S/' : 'US$'}</button>`).join('')}</div>
      <input id="salary" type="text" inputmode="decimal" placeholder="0.00" value="${sal?.amount || ''}" style="font-size:26px">
    </div>
    <p class="muted small" style="margin-top:-4px">Pon tu sueldo neto (lo que recibes). Si cambia, el nuevo monto se aplica desde ${monthName(currentMonth(), { month: 'long' })} y los meses anteriores conservan el sueldo que tenían. Los ingresos extra se añaden desde el Resumen de cada mes.</p>
  </section>

  <section class="card">
    <h3>Presupuesto mensual</h3>
    <div class="seg" style="margin-bottom:12px">
      <button class="${s.budgetMode !== 'percent' ? 'on' : ''}" data-action="budget-mode" data-mode="fixed">Monto fijo</button>
      <button class="${s.budgetMode === 'percent' ? 'on' : ''}" data-action="budget-mode" data-mode="percent">% de ingresos</button>
    </div>
    ${s.budgetMode === 'percent' ? `
      <label class="field">Porcentaje máximo de tus ingresos para gastar
        <input id="budgetPercent" type="text" inputmode="decimal" value="${s.budgetPercent || ''}" placeholder="Ej. 70">
      </label>
      <p class="muted small" style="margin-top:-6px">${s.budgetPercent > 0 && incomeTotal(currentMonth()) > 0
        ? `Este mes: ${s.budgetPercent}% de ${fmt(incomeTotal(currentMonth()))} = <b>${fmt(budgetFor(currentMonth()))}</b> para gastar y <b>${fmt(incomeTotal(currentMonth()) - budgetFor(currentMonth()))}</b> de ahorro.`
        : 'Ej. 70% significa gastar como máximo el 70% y ahorrar el 30%. Se calcula con el sueldo más los ingresos extra de cada mes.'}</p>`
    : `
      <label class="field">Monto total (${s.currency === 'PEN' ? 'S/' : 'US$'})
        <input id="monthlyBudget" type="text" inputmode="decimal" value="${s.monthlyBudget || ''}" placeholder="0 = sin presupuesto">
      </label>`}
    <p class="muted small" style="margin-top:-6px">Los presupuestos de cada categoría se configuran en la pestaña Categorías.</p>
  </section>

  <section class="card">
    <h3>Gastos fijos 🔁</h3>
    ${rec.length ? rec.map(r => {
      const c = catById(r.categoryId);
      return `<div class="rec-row">
        <span class="cat-ico" style="background:${c.color}26">${esc(c.emoji)}</span>
        <span class="cat-info" data-action="rec-edit" data-id="${r.id}">
          <span class="top"><span class="name">${esc(r.note || c.name)}</span><b>${fmt(r.amount, r.currency)}</b></span>
          <span class="sub">Día ${r.day} de cada mes · ${esc(r.method)}</span>
        </span>
        <button class="switch ${r.active ? 'on' : ''}" data-action="rec-toggle" data-id="${r.id}" aria-label="Activar o pausar"></button>
      </div>`;
    }).join('') : `<p class="muted small">Al añadir un gasto marca <b>“Repetir cada mes”</b> (alquiler, internet, Netflix, gimnasio…) y se registrará solo cada mes en el mismo día.</p>`}
  </section>

  <section class="card">
    <h3>Datos y respaldo</h3>
    <p class="muted small" style="margin-top:-6px">Tus datos viven solo en este iPhone. Último respaldo: <b>${lb}</b>.</p>
    <div class="btn-col">
      <button class="btn" data-action="export-month">📄 Exportar CSV de ${monthName(viewMonth)}</button>
      <button class="btn" data-action="export-all">📄 Exportar CSV completo</button>
      <button class="btn primary" data-action="backup">💾 Crear respaldo (JSON)</button>
      <button class="btn" data-action="restore">♻️ Restaurar respaldo</button>
      <button class="btn danger" data-action="wipe">🗑️ Borrar todos los datos</button>
    </div>
  </section>
  <p class="muted small center">Mis Gastos · ${state.expenses.length} movimientos registrados</p>`;
}

// =========================================================
// Hojas (formularios)
// =========================================================
const sheetEl = $('#sheet');
let sheetSubmit = null;

function openSheet(html, onSubmit) {
  sheetEl.querySelector('.sheet').innerHTML = `<div class="grabber"></div>${html}`;
  sheetSubmit = onSubmit;
  sheetEl.hidden = false;
}
function closeSheet() { sheetEl.hidden = true; sheetSubmit = null; }
sheetEl.addEventListener('click', e => { if (e.target === sheetEl || e.target.closest('[data-close]')) closeSheet(); });
sheetEl.addEventListener('submit', e => { e.preventDefault(); sheetSubmit?.(); });

function categoryPicker(selected) {
  return `<div class="cat-grid" id="fCats">
    ${state.categories.map(c => `<button type="button" class="cat-pick ${c.id === selected ? 'on' : ''}" data-cat="${esc(c.id)}"><span class="e">${esc(c.emoji)}</span>${esc(c.name)}</button>`).join('')}
    <button type="button" class="cat-pick add" data-newcat><span class="e">＋</span>Nueva</button>
  </div>`;
}

// ----- Gasto / gasto fijo -----
function openExpenseForm({ mode = 'expense', item = null } = {}) {
  const isRec = mode === 'recurring';
  const defDate = todayISO();
  const d = item || {
    amount: '', currency: last.currency || mainCur(),
    categoryId: last.categoryId || state.categories[0]?.id, method: last.method || METHODS[0],
    note: '', date: defDate, day: new Date().getDate(),
  };
  let cur = d.currency, cat = d.categoryId;
  const methods = METHODS.includes(d.method) ? METHODS : [...METHODS, d.method];
  const title = isRec ? 'Editar gasto fijo' : item ? 'Editar gasto' : 'Nuevo gasto';

  openSheet(`<form autocomplete="off">
    <div class="sheet-head"><h3>${title}</h3><button type="button" data-close>Cancelar</button></div>
    ${!isRec && item?.recurringId ? '<div class="note">🔁 Generado por un gasto fijo. Editarlo solo cambia este registro.</div>' : ''}
    <div class="amount-row">
      <div class="seg" id="fCur">${Object.keys(CURRENCIES).map(k => `<button type="button" data-cur="${k}" class="${k === cur ? 'on' : ''}">${k === 'PEN' ? 'S/' : 'US$'}</button>`).join('')}</div>
      <input id="fAmount" type="text" inputmode="decimal" placeholder="0.00" value="${d.amount !== '' ? d.amount : ''}" required>
    </div>
    <label class="field" style="margin-bottom:6px">Categoría</label>
    ${categoryPicker(cat)}
    <div class="row2">
      ${isRec
        ? `<label class="field">Día del mes<input id="fDay" type="number" min="1" max="31" inputmode="numeric" value="${d.day}"></label>`
        : `<label class="field">Fecha<input id="fDate" type="date" value="${d.date}"></label>`}
      <label class="field">Método<select id="fMethod">${methods.map(m => `<option ${m === d.method ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
    </div>
    <label class="field">Nota (opcional)<input id="fNote" type="text" maxlength="80" placeholder="Ej. Almuerzo con el equipo" value="${esc(d.note)}"></label>
    ${!isRec && !item ? '<label class="check"><input type="checkbox" id="fRecurring"> Repetir cada mes (gasto fijo)</label>' : ''}
    <div class="sheet-actions">
      <button type="submit" class="btn primary">Guardar</button>
      ${item ? `<button type="button" class="btn danger" id="fDelete">${isRec ? 'Eliminar gasto fijo' : 'Eliminar gasto'}</button>` : ''}
    </div>
  </form>`, () => {
    const amount = parseAmount($('#fAmount').value);
    if (!(amount > 0)) { toast('Ingresa un monto válido'); $('#fAmount').focus(); return; }
    if (!cat) { toast('Elige una categoría'); return; }
    const data = { amount, currency: cur, categoryId: cat, method: $('#fMethod').value, note: $('#fNote').value.trim() };
    last = { currency: cur, categoryId: cat, method: data.method };

    if (isRec) {
      const day = Math.min(Math.max(parseInt($('#fDay').value, 10) || 1, 1), 31);
      Object.assign(item, data, { day });
      toast('Gasto fijo actualizado');
    } else {
      data.date = $('#fDate').value || todayISO();
      if (item) {
        Object.assign(item, data);
        toast('Gasto actualizado');
      } else {
        const exp = { id: uid(), createdAt: Date.now(), ...data };
        if ($('#fRecurring')?.checked) {
          const r = { id: uid(), ...data, day: Number(data.date.slice(8)), active: true, lastGenerated: monthOf(data.date) };
          delete r.date;
          state.recurring.push(r);
          exp.recurringId = r.id;
        }
        state.expenses.push(exp);
        toast(exp.recurringId ? 'Gasto fijo creado 🔁' : 'Gasto guardado ✓');
      }
      viewMonth = monthOf(data.date);
    }
    generateRecurring();
    save(); closeSheet(); render();
  });

  // Interacciones dentro del formulario
  const sheet = sheetEl.querySelector('.sheet');
  sheet.querySelector('#fCur').addEventListener('click', e => {
    const b = e.target.closest('[data-cur]'); if (!b) return;
    cur = b.dataset.cur;
    sheet.querySelectorAll('#fCur button').forEach(x => x.classList.toggle('on', x === b));
  });
  const onCatClick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-newcat')) {
      const name = (prompt('Nombre de la nueva categoría') || '').trim();
      if (!name) return;
      if (state.categories.some(c => norm(c.name) === norm(name))) { toast('Esa categoría ya existe'); return; }
      const c = { id: uid(), name, emoji: '🏷️', color: COLORS[state.categories.length % COLORS.length], budget: 0 };
      state.categories.push(c); save();
      cat = c.id;
      sheet.querySelector('#fCats').outerHTML = categoryPicker(cat);
      sheet.querySelector('#fCats').addEventListener('click', onCatClick);
      toast('Categoría creada (puedes cambiarle el ícono en Categorías)');
      return;
    }
    cat = b.dataset.cat;
    sheet.querySelectorAll('#fCats .cat-pick').forEach(x => x.classList.toggle('on', x === b));
  };
  sheet.querySelector('#fCats').addEventListener('click', onCatClick);
  sheet.querySelector('#fDelete')?.addEventListener('click', () => {
    if (isRec) {
      if (!confirm('¿Eliminar este gasto fijo? Los gastos ya registrados se mantienen.')) return;
      state.recurring = state.recurring.filter(r => r !== item);
      state.expenses.forEach(e => { if (e.recurringId === item.id) delete e.recurringId; });
    } else {
      if (!confirm('¿Eliminar este gasto?')) return;
      state.expenses = state.expenses.filter(e => e !== item);
    }
    save(); closeSheet(); render(); toast('Eliminado');
  });
  if (!item) setTimeout(() => $('#fAmount')?.focus(), 250);
}

// ----- Ingreso extra -----
function openIncomeForm(item = null) {
  let cur = item?.currency || mainCur();
  const defDate = viewMonth === currentMonth() ? todayISO() : `${viewMonth}-01`;
  openSheet(`<form autocomplete="off">
    <div class="sheet-head"><h3>${item ? 'Editar ingreso' : 'Ingreso extra'}</h3><button type="button" data-close>Cancelar</button></div>
    <div class="amount-row">
      <div class="seg" id="iCur">${Object.keys(CURRENCIES).map(k => `<button type="button" data-cur="${k}" class="${k === cur ? 'on' : ''}">${k === 'PEN' ? 'S/' : 'US$'}</button>`).join('')}</div>
      <input id="iAmount" type="text" inputmode="decimal" placeholder="0.00" value="${item?.amount ?? ''}" required>
    </div>
    <label class="field">Concepto<input id="iNote" type="text" maxlength="60" placeholder="Ej. Gratificación, bono, freelance" value="${esc(item?.note || '')}"></label>
    <label class="field">Fecha<input id="iDate" type="date" value="${item?.date || defDate}"></label>
    <p class="muted small" style="margin-top:-4px">El sueldo mensual no va aquí: se configura una sola vez en Ajustes.</p>
    <div class="sheet-actions">
      <button type="submit" class="btn primary">Guardar</button>
      ${item ? '<button type="button" class="btn danger" id="iDelete">Eliminar ingreso</button>' : ''}
    </div>
  </form>`, () => {
    const amount = parseAmount($('#iAmount').value);
    if (!(amount > 0)) { toast('Ingresa un monto válido'); return; }
    const data = { amount, currency: cur, note: $('#iNote').value.trim(), date: $('#iDate').value || todayISO() };
    if (item) Object.assign(item, data); else state.incomes.push({ id: uid(), createdAt: Date.now(), ...data });
    viewMonth = monthOf(data.date);
    save(); closeSheet(); render(); toast('Ingreso guardado 💰');
  });
  const sheet = sheetEl.querySelector('.sheet');
  sheet.querySelector('#iCur').addEventListener('click', e => {
    const b = e.target.closest('[data-cur]'); if (!b) return;
    cur = b.dataset.cur; sheet.querySelectorAll('#iCur button').forEach(x => x.classList.toggle('on', x === b));
  });
  sheet.querySelector('#iDelete')?.addEventListener('click', () => {
    if (!confirm('¿Eliminar este ingreso?')) return;
    state.incomes = state.incomes.filter(i => i !== item);
    save(); closeSheet(); render(); toast('Ingreso eliminado');
  });
  if (!item) setTimeout(() => $('#iAmount')?.focus(), 250);
}

// ----- Categoría -----
function openCategoryForm(id) {
  const item = id ? state.categories.find(c => c.id === id) : null;
  let emoji = item?.emoji || '🏷️';
  let color = item?.color || COLORS[state.categories.length % COLORS.length];
  const curLabel = mainCur() === 'PEN' ? 'S/' : 'US$';

  openSheet(`<form autocomplete="off">
    <div class="sheet-head"><h3>${item ? 'Editar categoría' : 'Nueva categoría'}</h3><button type="button" data-close>Cancelar</button></div>
    <label class="field">Nombre<input id="cName" type="text" maxlength="30" required value="${esc(item?.name || '')}" placeholder="Ej. Gimnasio"></label>
    <label class="field">Ícono (elige uno o escribe cualquier emoji)
      <input id="cEmoji" type="text" maxlength="4" value="${esc(emoji)}" style="font-size:22px;width:80px">
    </label>
    <div class="emoji-grid" id="cEmojis">${EMOJIS.map(e => `<button type="button" class="${e === emoji ? 'on' : ''}">${e}</button>`).join('')}</div>
    <label class="field" style="margin-bottom:6px">Color</label>
    <div class="color-grid" id="cColors">${COLORS.map(c => `<button type="button" data-color="${c}" style="background:${c}" class="${c === color ? 'on' : ''}"></button>`).join('')}</div>
    <label class="field">Presupuesto mensual (${curLabel}, opcional)
      <input id="cBudget" type="text" inputmode="decimal" value="${item?.budget || ''}" placeholder="0 = sin presupuesto">
    </label>
    <div class="sheet-actions">
      <button type="submit" class="btn primary">Guardar</button>
      ${item && item.id !== 'otros' ? '<button type="button" class="btn danger" id="cDelete">Eliminar categoría</button>' : ''}
    </div>
  </form>`, () => {
    const name = $('#cName').value.trim();
    if (!name) { toast('Ponle un nombre'); return; }
    if (state.categories.some(c => c !== item && norm(c.name) === norm(name))) { toast('Ya existe una categoría con ese nombre'); return; }
    const budget = parseAmount($('#cBudget').value);
    const data = { name, emoji: $('#cEmoji').value.trim() || '🏷️', color, budget: budget > 0 ? budget : 0 };
    if (item) Object.assign(item, data); else state.categories.push({ id: uid(), ...data });
    save(); closeSheet(); render(); toast(item ? 'Categoría actualizada' : 'Categoría creada');
  });

  const sheet = sheetEl.querySelector('.sheet');
  sheet.querySelector('#cEmojis').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $('#cEmoji').value = b.textContent;
    sheet.querySelectorAll('#cEmojis button').forEach(x => x.classList.toggle('on', x === b));
  });
  sheet.querySelector('#cColors').addEventListener('click', e => {
    const b = e.target.closest('[data-color]'); if (!b) return;
    color = b.dataset.color;
    sheet.querySelectorAll('#cColors button').forEach(x => x.classList.toggle('on', x === b));
  });
  sheet.querySelector('#cDelete')?.addEventListener('click', () => {
    const n = state.expenses.filter(e => e.categoryId === item.id).length;
    const msg = n ? `Hay ${n} gasto${n === 1 ? '' : 's'} en “${item.name}”. Se moverán a “Otros”. ¿Eliminar la categoría?` : `¿Eliminar “${item.name}”?`;
    if (!confirm(msg)) return;
    state.expenses.forEach(e => { if (e.categoryId === item.id) e.categoryId = 'otros'; });
    state.recurring.forEach(r => { if (r.categoryId === item.id) r.categoryId = 'otros'; });
    state.categories = state.categories.filter(c => c !== item);
    if (filterCat === item.id) filterCat = 'all';
    save(); closeSheet(); render(); toast('Categoría eliminada');
  });
}

// =========================================================
// Exportar / respaldo
// =========================================================
async function shareOrDownload(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const file = new File([blob], filename, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

function csvFor(list) {
  const cell = v => { v = String(v ?? ''); return /[",\r\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const rows = [['Fecha', 'Categoría', 'Nota', 'Método', 'Monto', 'Moneda', `Monto en ${mainCur()}`, 'Gasto fijo']];
  [...list].sort((a, b) => a.date.localeCompare(b.date)).forEach(e => rows.push([
    e.date, catById(e.categoryId).name, e.note, e.method, e.amount.toFixed(2), e.currency,
    toMain(e.amount, e.currency).toFixed(2), e.recurringId ? 'Sí' : 'No',
  ]));
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}

async function doBackup() {
  const ok = await shareOrDownload(`mis-gastos-respaldo-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json');
  if (ok) { state.settings.lastBackup = Date.now(); save(); render(); toast('Respaldo creado 💾'); }
}

$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.expenses) || !Array.isArray(data.categories)) throw new Error('formato');
    if (!confirm(`El respaldo tiene ${data.expenses.length} gastos. Reemplazará los datos actuales. ¿Continuar?`)) return;
    state = normalize(data);
    generateRecurring();
    await save(); render(); toast('Respaldo restaurado ✓');
  } catch { toast('El archivo no es un respaldo válido'); }
});

function setCurrency(cur) {
  const s = state.settings;
  if (cur === s.currency) return;
  const f = cur === 'PEN' ? s.rate : 1 / s.rate;           // convierte los presupuestos a la nueva moneda
  const conv = v => Math.round(v * f * 100) / 100;
  s.monthlyBudget = conv(s.monthlyBudget || 0);
  state.categories.forEach(c => { c.budget = conv(c.budget || 0); });
  s.currency = cur;
  save(); render(); toast(`Moneda principal: ${CURRENCIES[cur]}`);
}

// =========================================================
// Eventos globales
// =========================================================
$('#view').addEventListener('click', ev => {
  const b = ev.target.closest('[data-action]'); if (!b) return;
  const { action, id } = b.dataset;
  switch (action) {
    case 'add': openExpenseForm(); break;
    case 'edit': openExpenseForm({ item: state.expenses.find(e => e.id === id) }); break;
    case 'filter': filterCat = id; search = ''; tab = 'movimientos'; render(); window.scrollTo(0, 0); break;
    case 'goto-month': viewMonth = b.dataset.month; render(); break;
    case 'edit-cat': openCategoryForm(id); break;
    case 'add-cat': openCategoryForm(); break;
    case 'set-currency': setCurrency(b.dataset.cur); break;
    case 'rec-edit': openExpenseForm({ mode: 'recurring', item: state.recurring.find(r => r.id === id) }); break;
    case 'rec-toggle': {
      const r = state.recurring.find(x => x.id === id);
      r.active = !r.active;
      if (r.active) { const prev = addMonths(currentMonth(), -1); if (r.lastGenerated < prev) r.lastGenerated = prev; generateRecurring(); }
      save(); render(); toast(r.active ? 'Gasto fijo activado' : 'Gasto fijo pausado');
      break;
    }
    case 'add-income': openIncomeForm(); break;
    case 'edit-income': openIncomeForm(state.incomes.find(i => i.id === id)); break;
    case 'goto-settings': tab = 'ajustes'; render(); window.scrollTo(0, 0); break;
    case 'budget-mode': state.settings.budgetMode = b.dataset.mode; save(); render(); break;
    case 'salary-cur': {
      const amt = parseAmount($('#salary').value);
      if (amt > 0) { setSalary(amt, b.dataset.cur); render(); toast('Moneda del sueldo actualizada'); }
      else { b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }
      break;
    }
    case 'export-month': shareOrDownload(`gastos-${viewMonth}.csv`, csvFor(expensesOf(viewMonth)), 'text/csv'); break;
    case 'export-all': shareOrDownload(`gastos-completo-${todayISO()}.csv`, csvFor(state.expenses), 'text/csv'); break;
    case 'backup': doBackup(); break;
    case 'restore': $('#importFile').click(); break;
    case 'wipe':
      if (confirm('¿Borrar TODOS los gastos, categorías y ajustes? Esto no se puede deshacer.') && confirm('¿Seguro? Te recomendamos crear un respaldo antes.')) {
        state = defaultState(); filterCat = 'all'; save(); render(); toast('Datos borrados');
      }
      break;
  }
});

$('#view').addEventListener('input', ev => {
  if (ev.target.id === 'search') { search = ev.target.value; $('#txList').innerHTML = listBody(); }
});

$('#view').addEventListener('change', ev => {
  const t = ev.target;
  if (t.id === 'rate') {
    const v = parseAmount(t.value);
    if (v > 0) { state.settings.rate = v; save(); toast('Tipo de cambio actualizado'); } else { t.value = state.settings.rate; toast('Tipo de cambio inválido'); }
  }
  if (t.id === 'salary') {
    const v = parseAmount(t.value);
    const cur = t.parentElement.querySelector('.seg .on')?.dataset.cur || mainCur();
    setSalary(v > 0 ? v : 0, cur); render(); toast(v > 0 ? 'Sueldo guardado 💼' : 'Sueldo eliminado');
  }
  if (t.id === 'budgetPercent') {
    const v = parseAmount(t.value);
    state.settings.budgetPercent = v > 0 ? Math.min(v, 100) : 0; save(); render(); toast('Meta de gasto actualizada');
  }
  if (t.id === 'monthlyBudget') {
    const v = parseAmount(t.value);
    state.settings.monthlyBudget = v > 0 ? v : 0; save(); toast('Presupuesto actualizado');
  }
});

document.querySelector('.tabbar').addEventListener('click', ev => {
  const b = ev.target.closest('button'); if (!b) return;
  if (b.id === 'addBtn') { openExpenseForm(); return; }
  tab = b.dataset.tab;
  if (tab !== 'movimientos') { filterCat = 'all'; search = ''; }
  render(); window.scrollTo(0, 0);
});
$('#prevMonth').addEventListener('click', () => { viewMonth = addMonths(viewMonth, -1); render(); });
$('#nextMonth').addEventListener('click', () => { viewMonth = addMonths(viewMonth, 1); render(); });
$('#monthLabel').addEventListener('click', () => { viewMonth = currentMonth(); render(); });

// Deslizar a los lados para cambiar de mes (Resumen y Movimientos)
let touchX = null, touchY = null;
$('#view').addEventListener('touchstart', e => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
$('#view').addEventListener('touchend', e => {
  if (touchX === null || !['resumen', 'movimientos'].includes(tab)) return;
  const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY;
  touchX = null;
  if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2 && !e.target.closest('.chips')) {
    viewMonth = addMonths(viewMonth, dx < 0 ? 1 : -1); render();
  }
}, { passive: true });

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// Al volver a la app (p. ej. al día siguiente) registra gastos fijos pendientes
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && generateRecurring() && sheetEl.hidden) render();
});

// =========================================================
// Inicio
// =========================================================
(async function init() {
  state = normalize(await load());
  generateRecurring();
  render();
  // Pide al sistema que no borre los datos de la app
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
