import { query, queryOne, getSetting } from '../modules/db.js';
import { statusBadge, formatDate, formatROI, truncate, chip, sectionTitle, pagination, emptyState, alertBox, tabs } from '../modules/ui.js';
import { isAdmin } from '../modules/auth.js';
import { navigate, setPageParam } from '../app.js';
import { t, originLabel, visibilityLabel } from '../modules/i18n.js';

const PAGE_SIZE = 25;

let _state = {
  search: '', type: '', tech: '', sujet: '', resp: '',
  tab: 'all', page: 1,
};

export function renderCatalogue(container, params = {}) {
  if (params.cu_id) {
    _renderDetail(container, params.cu_id);
    return;
  }
  _state.page = 1;
  _renderList(container);
}

function _renderList(container) {
  const needTypes = query(`SELECT libelle FROM need_types WHERE actif=1 ORDER BY ordre`).map(r=>r.libelle);
  const techs     = query(`SELECT libelle FROM technologies WHERE actif=1 ORDER BY ordre`).map(r=>r.libelle);
  const sujets    = query(`SELECT libelle FROM subject_types WHERE actif=1 ORDER BY ordre`).map(r=>r.libelle);
  const resps     = query(`SELECT DISTINCT responsable FROM use_cases WHERE actif=1 AND responsable IS NOT NULL ORDER BY responsable`).map(r=>r.responsable);

  const { rows, total } = _fetchRows();

  container.innerHTML = `
    <div class="hero" style="padding:20px 24px;">
      <h1>📚 ${t('catalogue.title')}</h1>
    </div>

    <div class="card mb-2">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
        <div style="position:relative;">
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--gray)">🔍</span>
          <input type="text" class="form-control" id="cat-search" placeholder="${t('catalogue.search')}" value="${_state.search}" style="padding-left:32px;">
        </div>
        <select class="form-control" id="cat-type">
          <option value="">${t('common.all')}</option>
          ${needTypes.map(v=>`<option ${v===_state.type?'selected':''}>${v}</option>`).join('')}
        </select>
        <select class="form-control" id="cat-tech">
          <option value="">${t('common.all')}</option>
          ${techs.map(v=>`<option ${v===_state.tech?'selected':''}>${v}</option>`).join('')}
        </select>
        <select class="form-control" id="cat-sujet">
          <option value="">${t('common.all')}</option>
          ${sujets.map(v=>`<option ${v===_state.sujet?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <select class="form-control" id="cat-resp" style="max-width:200px;">
          <option value="">${t('common.all')}</option>
          ${resps.map(r=>`<option ${r===_state.resp?'selected':''}>${r}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" id="cat-reset">↺ ${t('common.filter')}</button>
      </div>
    </div>

    <div class="tabs" id="cat-tabs">
      ${['all','backlog','en_cours','production'].map(k => `
        <button class="tab-btn ${k===_state.tab?'active':''}" data-tab="${k}">
          ${k==='all'?`📋 ${t('common.all')}`:k==='backlog'?`📝 Backlog`:k==='en_cours'?`⚙️ ${t('home.kpi.poc')}…`:`🚀 ${t('home.kpi.production')}`}
        </button>`).join('')}
    </div>

    <div class="text-muted text-sm mb-2">${total} ${t('home.kpi.total').toLowerCase()}</div>

    <div id="cat-results">
      ${_cuTable(rows)}
    </div>
    <div id="cat-pagination">
      ${pagination(total, _state.page, PAGE_SIZE, '_catPage')}
    </div>
  `;

  window._catPage = (p) => { _state.page = p; _refreshList(container); };

  // Events
  container.querySelector('#cat-search').addEventListener('input', e => {
    _state.search = e.target.value; _state.page = 1; _refreshList(container);
  });
  container.querySelector('#cat-type').addEventListener('change', e => {
    _state.type = e.target.value; _state.page = 1; _refreshList(container);
  });
  container.querySelector('#cat-tech').addEventListener('change', e => {
    _state.tech = e.target.value; _state.page = 1; _refreshList(container);
  });
  container.querySelector('#cat-sujet').addEventListener('change', e => {
    _state.sujet = e.target.value; _state.page = 1; _refreshList(container);
  });
  container.querySelector('#cat-resp').addEventListener('change', e => {
    _state.resp = e.target.value; _state.page = 1; _refreshList(container);
  });
  container.querySelector('#cat-reset').addEventListener('click', () => {
    _state = { search:'', type:'', tech:'', sujet:'', resp:'', tab:_state.tab, page:1 };
    _renderList(container);
  });
  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _state.tab = btn.dataset.tab; _state.page = 1; _refreshList(container);
      container.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab===_state.tab));
    });
  });
}

function _refreshList(container) {
  const { rows, total } = _fetchRows();
  container.querySelector('#cat-results').innerHTML = _cuTable(rows);
  container.querySelector('#cat-pagination').innerHTML = pagination(total, _state.page, PAGE_SIZE, '_catPage');
  container.querySelector('.text-muted.text-sm.mb-2').textContent = `${total} cas d'usage`;
}

function _fetchRows() {
  const TAB_FILTER = {
    all:        [],
    backlog:    ["Besoin identifié","Cadrage"],
    en_cours:   ["POC","En développement"],
    production: ["Production"],
  };
  const statuts = TAB_FILTER[_state.tab] || [];

  let where = `actif=1 AND statut != 'Abandonné'`;
  const params = [];

  if (statuts.length) {
    where += ` AND statut IN (${statuts.map(()=>'?').join(',')})`;
    params.push(...statuts);
  }
  if (_state.search) {
    where += ` AND (cu_id LIKE ? OR nom LIKE ? OR description LIKE ? OR responsable LIKE ? OR technologie LIKE ?)`;
    const s = `%${_state.search}%`;
    params.push(s,s,s,s,s);
  }
  if (_state.type)   { where += ` AND type_besoin=?`;  params.push(_state.type); }
  if (_state.tech)   { where += ` AND technologie=?`;  params.push(_state.tech); }
  if (_state.sujet)  { where += ` AND type_sujet=?`;   params.push(_state.sujet); }
  if (_state.resp)   { where += ` AND responsable=?`;  params.push(_state.resp); }

  const total = queryOne(`SELECT COUNT(*) AS n FROM use_cases WHERE ${where}`, params)?.n || 0;
  const offset = (_state.page - 1) * PAGE_SIZE;
  const rows   = query(`SELECT * FROM use_cases WHERE ${where} ORDER BY date_creation DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`, params);

  return { rows, total };
}

function _cuTable(rows) {
  if (!rows.length) return emptyState('🔍', t('catalogue.empty'), t('common.filter'));
  const admin = isAdmin();
  return `<div class="table-wrap">
    <table class="data-table">
      <thead><tr>
        <th>${t('catalogue.col.id')}</th><th>${t('catalogue.col.name')}</th><th>${t('catalogue.col.status')}</th><th>${t('catalogue.col.type')}</th><th>${t('catalogue.col.tech')}</th><th>${t('catalogue.col.resp')}</th>${admin ? `<th>${t('catalogue.col.roi')}</th>` : ''}<th>${t('catalogue.col.origin')}</th><th>${t('catalogue.col.date')}</th>
      </tr></thead>
      <tbody>
        ${rows.map(cu => `<tr style="cursor:pointer" onclick="navigate('catalogue',{cu_id:'${cu.cu_id}'})">
          <td class="cu-id">${cu.cu_id}</td>
          <td class="cu-name">${truncate(cu.nom,50)}</td>
          <td>${statusBadge(cu.statut)}</td>
          <td>${chip(cu.type_besoin,'type')}</td>
          <td>${chip(cu.technologie,'tech')}</td>
          <td class="text-sm text-muted">${cu.responsable||'—'}</td>
          ${admin ? `<td class="text-sm" style="color:var(--green);font-weight:600">${cu.roi_annuel?formatROI(cu.roi_annuel):'—'}</td>` : ''}
          <td class="text-sm">${originLabel(cu.origine)}</td>
          <td class="text-sm text-muted">${formatDate(cu.date_creation)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function _renderDetail(container, cuId) {
  const cu = queryOne(`SELECT * FROM use_cases WHERE cu_id=? AND actif=1`, [cuId]);
  if (!cu) {
    container.innerHTML = `<div class="alert alert-danger">Cas d'usage "${cuId}" introuvable.</div>
      <button class="btn btn-outline mt-2" onclick="navigate('catalogue')">← ${t('nav.catalogue')}</button>`;
    return;
  }

  const admin = isAdmin();
  const appSection = cu.application_disponible ? `
    <div class="alert alert-success mt-2">
      🚀 Application disponible !
      ${cu.application_url ? `<a href="${cu.application_url}" target="_blank" class="btn btn-success btn-sm" style="margin-left:10px">Accéder →</a>` : ''}
      ${cu.conditions_acces ? `<div class="text-sm mt-1">${cu.conditions_acces}</div>` : ''}
    </div>` : '';

  container.innerHTML = `
    <button class="btn btn-ghost mb-2" onclick="navigate('catalogue')">← ${t('common.back')||t('nav.catalogue')}</button>

    <div class="card">
      <div class="cu-detail-header">
        <div>
          <span class="cu-id-tag">${cu.cu_id}</span>
          <h2 style="margin-top:10px;font-size:1.3rem;color:var(--blue-dark)">${cu.nom}</h2>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
          ${statusBadge(cu.statut)}
          ${admin ? `<button class="btn btn-outline btn-sm" onclick="navigate('admin_catalogue',{cu_id:'${cu.cu_id}'})">✏️ Modifier</button>` : ''}
        </div>
      </div>

      ${cu.description ? `<p style="color:var(--gray);margin-bottom:16px;line-height:1.6">${cu.description}</p>` : ''}

      ${appSection}

      <div class="detail-grid mt-2">
        <div class="detail-item"><div class="di-label">${t('cu.type')}</div><div class="di-value">${chip(cu.type_besoin,'type')}</div></div>
        <div class="detail-item"><div class="di-label">${t('cu.tech')}</div><div class="di-value">${chip(cu.technologie,'tech')}</div></div>
        <div class="detail-item"><div class="di-label">Type de sujet</div><div class="di-value">${chip(cu.type_sujet,'sujet')}</div></div>
        <div class="detail-item"><div class="di-label">${t('cu.resp')}</div><div class="di-value">${cu.responsable||'—'}</div></div>
        <div class="detail-item"><div class="di-label">${t('cu.pilot')}</div><div class="di-value">${cu.pilote_metier||'—'}</div></div>
        <div class="detail-item"><div class="di-label">${t('cu.created')}</div><div class="di-value">${formatDate(cu.date_creation)}</div></div>
        ${cu.origine ? `<div class="detail-item"><div class="di-label">${t('cu.origin')}</div><div class="di-value">${originLabel(cu.origine)}</div></div>` : ''}
        ${cu.visibilite && cu.visibilite !== 'common' ? `<div class="detail-item"><div class="di-label">${t('cu.visibility')}</div><div class="di-value">${visibilityLabel(cu.visibilite)}</div></div>` : ''}
      </div>

      ${admin && (cu.roi_annuel || cu.gain_estime) ? `
        <div class="roi-display mt-2">
          <div class="roi-value">${cu.roi_annuel ? formatROI(cu.roi_annuel) + '/an' : '—'}</div>
          <div class="roi-label">${t('cu.roi')}</div>
          ${cu.gain_estime ? `<div class="text-sm mt-1">${cu.gain_estime}</div>` : ''}
        </div>` : ''}

      ${cu.jira_url ? `<div class="mt-2"><a href="${cu.jira_url}" target="_blank" class="btn btn-ghost btn-sm">🔗 Lien Jira</a></div>` : ''}
    </div>
  `;
}
