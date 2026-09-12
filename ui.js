/**
 * UI helpers — badges, formatting, rendering utilities
 */

// ── Status badges ─────────────────────────────────────────

const STATUS_CLASSES = {
  'Besoin identifié': 'badge-besoin',
  'Cadrage':          'badge-cadrage',
  'POC':              'badge-poc',
  'En développement': 'badge-dev',
  'Production':       'badge-prod',
  'Abandonné':        'badge-abandonne',
  'À analyser':       'badge-analyser',
  'Validée':          'badge-validee',
  'Rejetée':          'badge-rejetee',
  'Archivée':         'badge-archivee',
};

export function statusBadge(status) {
  const cls = STATUS_CLASSES[status] || 'badge-besoin';
  return `<span class="badge ${cls}">${status}</span>`;
}

// ── Formatting ────────────────────────────────────────────

export function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
  } catch { return d; }
}

export function formatROI(v) {
  if (v == null || v === '') return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
}

export function truncate(s, n = 60) {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export function chip(text, type = 'tech') {
  if (!text) return '<span class="text-muted">—</span>';
  return `<span class="chip chip-${type}">${text}</span>`;
}

// ── DOM helpers ───────────────────────────────────────────

export function el(id) { return document.getElementById(id); }
export function qs(sel, ctx = document) { return ctx.querySelector(sel); }
export function qsa(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

export function setHTML(id, html) {
  const e = el(id);
  if (e) e.innerHTML = html;
}

export function show(id) { const e = el(id); if (e) e.style.display = ''; }
export function hide(id) { const e = el(id); if (e) e.style.display = 'none'; }

export function toast(msg, type = 'success', duration = 3500) {
  const t = document.createElement('div');
  t.className = `alert alert-${type}`;
  t.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;min-width:280px;max-width:420px;animation:fadeIn 0.2s;';
  const icons = { success: '✅', danger: '❌', warning: '⚠️', info: 'ℹ️' };
  t.innerHTML = `${icons[type]||''} ${msg}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

export function confirm(msg) { return window.confirm(msg); }

// ── Modal ─────────────────────────────────────────────────

export function openModal(html, options = {}) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" id="modal-box">${html}</div>`;
  if (!options.noClose) {
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  }
  document.body.appendChild(overlay);
  return overlay;
}

export function closeModal() {
  el('modal-overlay')?.remove();
}

// ── Spinner ───────────────────────────────────────────────

export function spinner(text = 'Chargement…') {
  return `<div class="flex-center gap-1" style="padding:32px;justify-content:center;color:var(--gray);">
    <span class="spinner"></span> <span>${text}</span>
  </div>`;
}

// ── KPI grid ──────────────────────────────────────────────

export function kpiGrid(items) {
  return `<div class="kpi-grid">${items.map(({ icon, label, value, cls }) => `
    <div class="kpi-card ${cls||''}">
      <div class="kpi-icon">${icon}</div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-label">${label}</div>
    </div>`).join('')}</div>`;
}

// ── Pagination ────────────────────────────────────────────

export function pagination(total, page, pageSize, onPage) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return '';

  let btns = '';
  btns += `<button class="page-btn" ${page<=1?'disabled':''} onclick="(${onPage})(${page-1})">‹</button>`;
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 2) {
      btns += `<button class="page-btn ${i===page?'active':''}" onclick="(${onPage})(${i})">${i}</button>`;
    } else if (Math.abs(i - page) === 3) {
      btns += `<span style="padding:0 4px;color:var(--gray)">…</span>`;
    }
  }
  btns += `<button class="page-btn" ${page>=pages?'disabled':''} onclick="(${onPage})(${page+1})">›</button>`;
  return `<div class="pagination">${btns}</div>`;
}

// ── Empty state ───────────────────────────────────────────

export function emptyState(icon, text, sub = '') {
  return `<div class="empty-state">
    <div class="empty-icon">${icon}</div>
    <div style="font-weight:600;color:var(--text)">${text}</div>
    ${sub ? `<div class="text-muted text-sm mt-1">${sub}</div>` : ''}
  </div>`;
}

// ── Section title ─────────────────────────────────────────

export function sectionTitle(icon, title) {
  return `<div class="section-title mb-2">${icon} ${title}</div>`;
}

// ── Tab switcher ──────────────────────────────────────────

export function tabs(items, active, onClick) {
  return `<div class="tabs">${items.map(({ key, label }) =>
    `<button class="tab-btn ${key===active?'active':''}" onclick="(${onClick})('${key}')">${label}</button>`
  ).join('')}</div>`;
}

// ── Alert box ─────────────────────────────────────────────

export function alertBox(type, msg) {
  const icons = { info:'ℹ️', success:'✅', warning:'⚠️', danger:'❌' };
  return `<div class="alert alert-${type}">${icons[type]||''} ${msg}</div>`;
}

// ── Form field helpers ────────────────────────────────────

export function formField({ id, label, type='text', value='', required=false, hint='', options=null, rows=3 }) {
  const req = required ? '<span class="required">*</span>' : '';
  let input;
  if (options) {
    input = `<select class="form-control" id="${id}" name="${id}">
      ${options.map(o => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        return `<option value="${v}" ${v==value?'selected':''}>${l}</option>`;
      }).join('')}
    </select>`;
  } else if (type === 'textarea') {
    input = `<textarea class="form-control" id="${id}" name="${id}" rows="${rows}">${value||''}</textarea>`;
  } else if (type === 'checkbox') {
    return `<div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="${id}" name="${id}" ${value?'checked':''}>
        <span class="form-label" style="margin:0">${label}${req}</span>
      </label>
      ${hint?`<div class="form-hint">${hint}</div>`:''}
    </div>`;
  } else {
    input = `<input type="${type}" class="form-control" id="${id}" name="${id}" value="${value||''}" ${required?'required':''}>`;
  }
  return `<div class="form-group">
    <label class="form-label" for="${id}">${label}${req}</label>
    ${input}
    ${hint?`<div class="form-hint">${hint}</div>`:''}
  </div>`;
}

/** Collect all form values from a container */
export function collectForm(containerEl) {
  const data = {};
  containerEl.querySelectorAll('[name]').forEach(el => {
    if (el.type === 'checkbox') data[el.name] = el.checked;
    else data[el.name] = el.value;
  });
  return data;
}
