import { query, queryOne, run, saveDB, nextCuId } from '../modules/db.js';
import { statusBadge, formatDate, formatROI, truncate, chip, openModal, closeModal, toast, emptyState, pagination } from '../modules/ui.js';
import { navigate } from '../app.js';

const PAGE_SIZE = 25;
let _page = 1, _search = '', _statut = '', _sujet = '';

export function renderAdminCatalogue(container, params = {}) {
  if (params.cu_id) { _openEditModal(params.cu_id, container); }
  _page = 1;
  _renderList(container);
}

function _renderList(container) {
  const sujets = query(`SELECT libelle FROM subject_types WHERE actif=1 ORDER BY ordre`).map(r=>r.libelle);
  const statuts = ['Besoin identifié','Cadrage','POC','En développement','Production','Abandonné'];
  const { rows, total } = _fetchRows();

  container.innerHTML = `
    <div class="hero" style="padding:18px 24px;margin-bottom:16px;">
      <h1 style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        🗂️ Catalogue (admin)
        <button class="btn btn-success" id="btn-new-cu">+ Nouveau CU</button>
      </h1>
    </div>

    <div class="card mb-2" style="padding:12px 16px;">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;">
        <div style="position:relative;">
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--gray)">🔍</span>
          <input class="form-control" id="adm-search" placeholder="ID, nom, responsable…" value="${_search}" style="padding-left:32px;">
        </div>
        <select class="form-control" id="adm-statut">
          <option value="">Tous statuts</option>
          ${statuts.map(s=>`<option ${s===_statut?'selected':''}>${s}</option>`).join('')}
        </select>
        <select class="form-control" id="adm-sujet">
          <option value="">Tous sujets</option>
          ${sujets.map(s=>`<option ${s===_sujet?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="text-muted text-sm mb-1">${total} cas d'usage</div>
    <div id="adm-table">${_buildTable(rows)}</div>
    <div id="adm-pagination">${pagination(total, _page, PAGE_SIZE, '_admCuPage')}</div>
  `;

  window._admCuPage = p => { _page = p; _refresh(container); };

  container.querySelector('#adm-search').addEventListener('input', e => { _search = e.target.value; _page=1; _refresh(container); });
  container.querySelector('#adm-statut').addEventListener('change', e => { _statut = e.target.value; _page=1; _refresh(container); });
  container.querySelector('#adm-sujet').addEventListener('change', e => { _sujet = e.target.value; _page=1; _refresh(container); });
  container.querySelector('#btn-new-cu').addEventListener('click', () => _openEditModal(null, container));
}

function _fetchRows() {
  let where = 'actif=1'; const params = [];
  if (_search) {
    where += ` AND (cu_id LIKE ? OR nom LIKE ? OR responsable LIKE ?)`; const s=`%${_search}%`; params.push(s,s,s);
  }
  if (_statut) { where += ` AND statut=?`; params.push(_statut); }
  if (_sujet)  { where += ` AND type_sujet=?`; params.push(_sujet); }
  const total = queryOne(`SELECT COUNT(*) AS n FROM use_cases WHERE ${where}`, params)?.n || 0;
  const rows  = query(`SELECT * FROM use_cases WHERE ${where} ORDER BY date_modification DESC LIMIT ${PAGE_SIZE} OFFSET ${(_page-1)*PAGE_SIZE}`, params);
  return { rows, total };
}

function _refresh(container) {
  const { rows, total } = _fetchRows();
  container.querySelector('#adm-table').innerHTML = _buildTable(rows);
  container.querySelector('#adm-pagination').innerHTML = pagination(total, _page, PAGE_SIZE, '_admCuPage');
  container.querySelector('.text-muted.text-sm.mb-1').textContent = `${total} cas d'usage`;
}

function _buildTable(rows) {
  if (!rows.length) return emptyState('🗂️', 'Aucun cas d\'usage', '');
  return `<div class="table-wrap">
    <table class="data-table">
      <thead><tr>
        <th>ID</th><th>Nom</th><th>Statut</th><th>Type</th><th>Techno</th><th>Responsable</th><th>ROI</th><th>App</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${rows.map(cu=>`<tr>
          <td class="cu-id">${cu.cu_id}</td>
          <td class="cu-name">${truncate(cu.nom,40)}</td>
          <td>${statusBadge(cu.statut)}</td>
          <td>${chip(cu.type_besoin,'type')}</td>
          <td>${chip(cu.technologie,'tech')}</td>
          <td class="text-sm text-muted">${cu.responsable||'—'}</td>
          <td class="text-sm" style="color:var(--green)">${cu.roi_annuel?formatROI(cu.roi_annuel):'—'}</td>
          <td>${cu.application_disponible?'🟢':'⭕'}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-outline btn-sm" onclick="window._editCu('${cu.cu_id}')">✏️</button>
            <button class="btn btn-ghost btn-sm" onclick="window._archiveCu('${cu.cu_id}')">📦</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

window._editCu = cuId => {
  const cont = document.querySelector('#main-content');
  _openEditModal(cuId, cont);
};

window._archiveCu = cuId => {
  if (!confirm(`Archiver ${cuId} ?`)) return;
  run(`UPDATE use_cases SET actif=0, statut='Abandonné', date_modification=datetime('now') WHERE cu_id=?`, [cuId]);
  run(`INSERT INTO archives(type_archive,reference_id,reference_code,nom,archive_par) SELECT 'USE_CASE',id,cu_id,nom,? FROM use_cases WHERE cu_id=?`,
    [getCurrentUsername?.() || 'admin', cuId]);
  saveDB();
  toast(`${cuId} archivé.`, 'warning');
  const cont = document.querySelector('#main-content');
  if (cont) _refresh(cont);
};

function _openEditModal(cuId, container) {
  const cu = cuId ? queryOne(`SELECT * FROM use_cases WHERE cu_id=?`, [cuId]) : null;
  const isNew = !cu;

  const needTypes = query(`SELECT libelle FROM need_types WHERE actif=1 ORDER BY ordre`).map(r=>r.libelle);
  const techs     = query(`SELECT libelle FROM technologies WHERE actif=1 ORDER BY ordre`).map(r=>r.libelle);
  const sujets    = query(`SELECT libelle FROM subject_types WHERE actif=1 ORDER BY ordre`).map(r=>r.libelle);
  const statuts   = ['Besoin identifié','Cadrage','POC','En développement','Production','Abandonné'];
  const resps     = query(`SELECT DISTINCT responsable FROM use_cases WHERE actif=1 AND responsable IS NOT NULL ORDER BY responsable`).map(r=>r.responsable);

  const opt = (arr, val='') => arr.map(v=>`<option value="${v}" ${v==val?'selected':''}>${v}</option>`).join('');
  const v = (field, def='') => cu ? (cu[field] ?? def) : def;

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${isNew?'➕ Nouveau cas d\'usage':'✏️ Modifier '+cuId}</div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>

    <div class="form-grid form-grid-2">
      <div class="form-group"><label class="form-label">Nom <span class="required">*</span></label>
        <input class="form-control" id="cu-nom" value="${v('nom')}" required></div>
      <div class="form-group"><label class="form-label">Statut</label>
        <select class="form-control" id="cu-statut">${opt(statuts, v('statut','Besoin identifié'))}</select></div>
      <div class="form-group"><label class="form-label">Type de besoin</label>
        <select class="form-control" id="cu-type"><option value=""></option>${opt(needTypes, v('type_besoin'))}</select></div>
      <div class="form-group"><label class="form-label">Technologie</label>
        <select class="form-control" id="cu-tech"><option value=""></option>${opt(techs, v('technologie'))}</select></div>
      <div class="form-group"><label class="form-label">Type de sujet</label>
        <select class="form-control" id="cu-sujet"><option value=""></option>${opt(sujets, v('type_sujet'))}</select></div>
      <div class="form-group"><label class="form-label">Responsable</label>
        <input class="form-control" id="cu-resp" list="resp-list" value="${v('responsable')}">
        <datalist id="resp-list">${resps.map(r=>`<option value="${r}">`).join('')}</datalist></div>
      <div class="form-group"><label class="form-label">Pilote métier</label>
        <input class="form-control" id="cu-pilote" value="${v('pilote_metier')}"></div>
      <div class="form-group"><label class="form-label">ROI annuel (€)</label>
        <input class="form-control" type="number" id="cu-roi" value="${v('roi_annuel')}"></div>
      <div class="form-group"><label class="form-label">Origine</label>
        <select class="form-control" id="cu-origine">
          <option value="" ${!v('origine')?'selected':''}>— Non défini —</option>
          <option value="FR" ${v('origine')==='FR'?'selected':''}>🇫🇷 KNDS France</option>
          <option value="DE" ${v('origine')==='DE'?'selected':''}>🇩🇪 KNDS Allemagne</option>
        </select></div>
      <div class="form-group"><label class="form-label">Visibilité</label>
        <select class="form-control" id="cu-visibilite">
          <option value="common" ${(v('visibilite')||'common')==='common'?'selected':''}>🌍 Commun FR+DE (catalogue uniquement)</option>
          <option value="FR" ${v('visibilite')==='FR'?'selected':''}>🇫🇷 Spécial France</option>
          <option value="DE" ${v('visibilite')==='DE'?'selected':''}>🇩🇪 Spécial Allemagne</option>
        </select>
        <div class="form-hint">Spécial FR/DE : visible dans l'onglet dédié. Commun : visible dans le catalogue uniquement.</div>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Description</label>
      <textarea class="form-control" id="cu-desc" rows="4">${v('description')}</textarea></div>
    <div class="form-group"><label class="form-label">Gain estimé</label>
      <input class="form-control" id="cu-gain" value="${v('gain_estime')}"></div>
    <div class="form-group"><label class="form-label">Lien Jira</label>
      <input class="form-control" id="cu-jira" value="${v('jira_url')}"></div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="cu-app" ${v('application_disponible')?'checked':''}>
        <span class="form-label" style="margin:0">Application disponible</span>
      </label>
    </div>
    <div id="cu-app-fields" style="${v('application_disponible')?'':'display:none'}">
      <div class="form-group"><label class="form-label">URL de l'application</label>
        <input class="form-control" id="cu-app-url" value="${v('application_url')}"></div>
      <div class="form-group"><label class="form-label">Conditions d'accès</label>
        <input class="form-control" id="cu-conditions" value="${v('conditions_acces')}"></div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" id="cu-save">💾 Enregistrer</button>
    </div>
  `);

  document.querySelector('#cu-app').addEventListener('change', e => {
    document.querySelector('#cu-app-fields').style.display = e.target.checked ? '' : 'none';
  });

  document.querySelector('#cu-save').addEventListener('click', () => {
    const nom = document.querySelector('#cu-nom').value.trim();
    if (!nom) { toast('Le nom est obligatoire.', 'danger'); return; }
    const data = {
      nom,
      statut:      document.querySelector('#cu-statut').value,
      type_besoin: document.querySelector('#cu-type').value || null,
      technologie: document.querySelector('#cu-tech').value || null,
      type_sujet:  document.querySelector('#cu-sujet').value || null,
      responsable: document.querySelector('#cu-resp').value || null,
      pilote_metier: document.querySelector('#cu-pilote').value || null,
      roi_annuel:  parseFloat(document.querySelector('#cu-roi').value) || null,
      description: document.querySelector('#cu-desc').value || null,
      gain_estime: document.querySelector('#cu-gain').value || null,
      jira_url:    document.querySelector('#cu-jira').value || null,
      application_disponible: document.querySelector('#cu-app').checked ? 1 : 0,
      application_url: document.querySelector('#cu-app-url').value || null,
      conditions_acces: document.querySelector('#cu-conditions').value || null,
      origine:     document.querySelector('#cu-origine').value || null,
      visibilite:  document.querySelector('#cu-visibilite').value || 'common',
    };
    if (isNew) {
      const origine = data.origine || null;
      const id = nextCuId(origine);
      run(`INSERT INTO use_cases(cu_id,nom,statut,type_besoin,technologie,type_sujet,responsable,pilote_metier,roi_annuel,description,gain_estime,jira_url,application_disponible,application_url,conditions_acces,origine,visibilite)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, data.nom, data.statut, data.type_besoin, data.technologie, data.type_sujet, data.responsable,
         data.pilote_metier, data.roi_annuel, data.description, data.gain_estime, data.jira_url,
         data.application_disponible, data.application_url, data.conditions_acces, data.origine, data.visibilite]);
      toast(`CU créé : ${id}`, 'success');
    } else {
      run(`UPDATE use_cases SET nom=?,statut=?,type_besoin=?,technologie=?,type_sujet=?,responsable=?,
        pilote_metier=?,roi_annuel=?,description=?,gain_estime=?,jira_url=?,application_disponible=?,
        application_url=?,conditions_acces=?,origine=?,visibilite=?,date_modification=datetime('now') WHERE cu_id=?`,
        [data.nom, data.statut, data.type_besoin, data.technologie, data.type_sujet, data.responsable,
         data.pilote_metier, data.roi_annuel, data.description, data.gain_estime, data.jira_url,
         data.application_disponible, data.application_url, data.conditions_acces, data.origine, data.visibilite, cuId]);
      toast(`${cuId} mis à jour.`, 'success');
    }
    saveDB();
    closeModal();
    _refresh(container);
  });
}

function getCurrentUsername() {
  try { return JSON.parse(localStorage.getItem('rcu_session'))?.user?.username || 'admin'; } catch { return 'admin'; }
}
