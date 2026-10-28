import { query, queryOne, getSetting } from '../modules/db.js';
import { statusBadge, formatDate, formatROI, truncate, chip, sectionTitle, pagination, emptyState, alertBox, tabs, openModal, closeModal, toast } from '../modules/ui.js';
import { isAdmin } from '../modules/auth.js';
import { navigate, setPageParam } from '../app.js';
import { t, originLabel, visibilityLabel } from '../modules/i18n.js';
import { callAI, isAIAvailable } from '../modules/ai.js';
import { getLocalCU } from '../modules/localdb.js';

const PAGE_SIZE = 25;

let _state = {
  search: '', type: '', tech: '', sujet: '', resp: '',
  tab: 'all', page: 1,
};

// Cache local CU (loaded once per render cycle)
let _localCU = [];

export async function renderCatalogue(container, params = {}) {
  // Load local CU once
  _localCU = await getLocalCU();

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
  const hasLocal = _localCU.length > 0;

  container.innerHTML = `
    <div class="hero" style="padding:20px 24px;">
      <h1>📚 ${t('catalogue.title')}</h1>
      ${hasLocal ? `<div style="font-size:12px;color:#f6ad55;margin-top:4px;">📂 BDD locale active — ${_localCU.filter(c=>c.actif!==0).length} CU supplémentaires chargés (indépendant du Gist)</div>` : ''}
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

function _mergeAll() {
  // Get SQL rows
  const sqlRows = query(`SELECT * FROM use_cases WHERE actif=1 AND statut != 'Abandonné' ORDER BY date_creation DESC`);
  // Get local CU (not already in SQL by cu_id)
  const sqlIds = new Set(sqlRows.map(r => r.cu_id));
  const localRows = _localCU
    .filter(c => c.actif !== 0 && c.statut !== 'Abandonné' && !sqlIds.has(c.cu_id))
    .map(c => ({ ...c, _source: 'local' }));
  return [...sqlRows, ...localRows];
}

function _fetchRows() {
  const TAB_FILTER = {
    all:        [],
    backlog:    ["Besoin identifié","Cadrage"],
    en_cours:   ["POC","En développement"],
    production: ["Production"],
  };
  const statuts = TAB_FILTER[_state.tab] || [];

  let all = _mergeAll();

  // Apply filters
  if (statuts.length) {
    all = all.filter(r => statuts.includes(r.statut));
  }
  if (_state.search) {
    const s = _state.search.toLowerCase();
    all = all.filter(r =>
      (r.cu_id||'').toLowerCase().includes(s) ||
      (r.nom||'').toLowerCase().includes(s) ||
      (r.description||'').toLowerCase().includes(s) ||
      (r.responsable||'').toLowerCase().includes(s) ||
      (r.technologie||'').toLowerCase().includes(s)
    );
  }
  if (_state.type)  all = all.filter(r => r.type_besoin === _state.type);
  if (_state.tech)  all = all.filter(r => r.technologie === _state.tech);
  if (_state.sujet) all = all.filter(r => r.type_sujet  === _state.sujet);
  if (_state.resp)  all = all.filter(r => r.responsable === _state.resp);

  const total  = all.length;
  const offset = (_state.page - 1) * PAGE_SIZE;
  const rows   = all.slice(offset, offset + PAGE_SIZE);

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
          <td class="cu-id">${cu.cu_id}${cu._source==='local'?'<span style="font-size:9px;color:#f6ad55;margin-left:4px;">LOCAL</span>':''}</td>
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
  // Look in SQL first, then local
  let cu = queryOne(`SELECT * FROM use_cases WHERE cu_id=? AND actif=1`, [cuId]);
  let isLocal = false;
  if (!cu) {
    cu = _localCU.find(c => c.cu_id === cuId && c.actif !== 0);
    isLocal = !!cu;
  }

  if (!cu) {
    container.innerHTML = `<div class="alert alert-danger">Cas d'usage "${cuId}" introuvable.</div>
      <button class="btn btn-outline mt-2" onclick="navigate('catalogue')">← ${t('nav.catalogue')}</button>`;
    return;
  }

  const admin = isAdmin();
  const lang  = getSetting('app_lang', 'fr');
  const targetLang = lang === 'fr' ? 'anglais' : 'français';
  const targetLangLabel = lang === 'fr' ? '🇬🇧 EN' : '🇫🇷 FR';

  const appSection = cu.application_disponible ? `
    <div class="alert alert-success mt-2">
      🚀 Application disponible !
      ${cu.application_url ? `<a href="${cu.application_url}" target="_blank" class="btn btn-success btn-sm" style="margin-left:10px">Accéder →</a>` : ''}
      ${cu.conditions_acces ? `<div class="text-sm mt-1">${cu.conditions_acces}</div>` : ''}
    </div>` : '';

  // Parse extras from commentaire if SQL CU
  let extras = {};
  if (!isLocal && cu.commentaire) {
    try { extras = JSON.parse(cu.commentaire); } catch {}
  } else if (isLocal) {
    extras = cu; // local CU has all fields directly
  }

  const showFormData = extras.contexte || cu.contexte;

  container.innerHTML = `
    <button class="btn btn-ghost mb-2" onclick="navigate('catalogue')">← ${t('common.back')||t('nav.catalogue')}</button>

    <div class="card">
      <div class="cu-detail-header">
        <div>
          <span class="cu-id-tag">${cu.cu_id}</span>
          ${isLocal ? '<span style="font-size:11px;background:#f6ad55;color:#1a202c;padding:2px 6px;border-radius:4px;margin-left:8px;">📂 BDD locale</span>' : ''}
          <h2 style="margin-top:10px;font-size:1.3rem;color:var(--blue-dark)">${cu.nom}</h2>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
          ${statusBadge(cu.statut)}
          <button class="btn btn-outline btn-sm" id="btn-translate">🌐 Traduction ${targetLangLabel}</button>
          ${admin && !isLocal ? `<button class="btn btn-outline btn-sm" onclick="navigate('admin_catalogue',{cu_id:'${cu.cu_id}'})">✏️ Modifier</button>` : ''}
        </div>
      </div>

      <!-- Translation panel (hidden by default) -->
      <div id="translation-panel" style="display:none;margin:12px 0;padding:14px 16px;border:1px solid #90cdf4;border-radius:8px;background:#f0f7ff;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-weight:600;color:#2c5282;">🌐 Traduction ${targetLangLabel}</span>
          <button class="btn btn-ghost btn-sm" id="btn-close-translate">✕</button>
        </div>
        <div id="translation-content"><div class="text-muted text-sm">Chargement de la traduction…</div></div>
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

      ${showFormData ? `
        <details class="mt-2" style="border-top:1px solid var(--border);padding-top:12px;">
          <summary style="cursor:pointer;font-weight:600;color:var(--blue);font-size:13px;">📋 Informations du formulaire de besoin</summary>
          <div class="detail-grid mt-2">
            ${(extras.contexte||cu.contexte) ? `<div class="detail-item" style="grid-column:span 2"><div class="di-label">Contexte</div><div class="di-value" style="white-space:pre-wrap;font-size:13px">${extras.contexte||cu.contexte}</div></div>` : ''}
            ${(extras.objectif||cu.objectif) ? `<div class="detail-item" style="grid-column:span 2"><div class="di-label">Objectif</div><div class="di-value" style="white-space:pre-wrap;font-size:13px">${extras.objectif||cu.objectif}</div></div>` : ''}
            ${extras.priorite ? `<div class="detail-item"><div class="di-label">Priorité souhaitée</div><div class="di-value">${extras.priorite}</div></div>` : ''}
            ${extras.benefice_attendu ? `<div class="detail-item"><div class="di-label">Bénéfice attendu</div><div class="di-value">${extras.benefice_attendu}</div></div>` : ''}
            ${extras.types_donnees?.length ? `<div class="detail-item"><div class="di-label">Types de données</div><div class="di-value">${Array.isArray(extras.types_donnees)?extras.types_donnees.join(', '):extras.types_donnees}</div></div>` : ''}
            ${extras.rgpd ? `<div class="detail-item"><div class="di-label">RGPD</div><div class="di-value">${extras.rgpd}</div></div>` : ''}
            ${extras.gain_outil ? `<div class="detail-item" style="grid-column:span 2"><div class="di-label">Gain estimé (outil)</div><div class="di-value">${extras.gain_outil}</div></div>` : ''}
          </div>
        </details>` : ''}
    </div>
  `;

  // ── Translation button ──────────────────────────────────
  let _translating = false;
  let _translated  = false;

  container.querySelector('#btn-translate').addEventListener('click', async () => {
    const panel = container.querySelector('#translation-panel');
    const content = container.querySelector('#translation-content');
    panel.style.display = '';

    if (_translated) return; // already done
    if (_translating) return;
    _translating = true;

    if (!isAIAvailable()) {
      content.innerHTML = `<div class="alert alert-warning">⚠️ L'IA n'est pas configurée. Activez-la dans les Paramètres IA pour utiliser la traduction.</div>`;
      _translating = false;
      return;
    }

    const nom  = cu.nom || '';
    const desc = cu.description || '';
    if (!nom && !desc) {
      content.innerHTML = `<div class="text-muted text-sm">Aucun contenu à traduire.</div>`;
      _translating = false;
      return;
    }

    const prompt = `Traduis en ${targetLang} le titre et la description/objectif du cas d'usage suivant. Réponds UNIQUEMENT en JSON valide, sans texte autour, sous ce format exact :
{"titre":"...","description":"..."}

Titre original : ${nom}
Description/objectif : ${desc || '(aucune description)'}`;

    const { ok, text } = await callAI(
      `Tu es un traducteur professionnel spécialisé dans les projets de transformation digitale. Tu traduis uniquement en ${targetLang}. Réponds UNIQUEMENT en JSON.`,
      prompt,
      { temperature: 0.2, max_tokens: 600 }
    );

    if (!ok) {
      content.innerHTML = `<div class="alert alert-warning">❌ Erreur de traduction : ${text}</div>`;
      _translating = false;
      return;
    }

    try {
      const clean = text.trim().replace(/^```json?\s*/i,'').replace(/```\s*$/,'').trim();
      const parsed = JSON.parse(clean);
      content.innerHTML = `
        <div style="margin-bottom:10px;">
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#4a90c4;">Titre</span>
          <div style="font-size:15px;font-weight:700;color:#1a365d;margin-top:3px;">${parsed.titre||'—'}</div>
        </div>
        ${parsed.description ? `
        <div>
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#4a90c4;">Description</span>
          <div style="font-size:13px;color:#2d3748;line-height:1.7;margin-top:3px;white-space:pre-wrap;">${parsed.description}</div>
        </div>` : ''}`;
      _translated = true;
    } catch {
      content.innerHTML = `<div class="text-sm text-muted">${text}</div>`;
      _translated = true;
    }
    _translating = false;
  });

  container.querySelector('#btn-close-translate').addEventListener('click', () => {
    container.querySelector('#translation-panel').style.display = 'none';
  });
}
