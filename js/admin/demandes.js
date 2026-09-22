import { query, queryOne, run, saveDB, nextCuId } from '../modules/db.js';
import { statusBadge, formatDate, formatROI, truncate, chip, openModal, closeModal, toast, emptyState, pagination, sectionTitle, alertBox } from '../modules/ui.js';
import { getCurrentUsername } from '../modules/auth.js';
import { navigate } from '../app.js';

const PAGE_SIZE = 20;
let _page = 1;
let _filter = 'all';
let _search = '';

export function renderAdminDemandes(container, params = {}) {
  if (params.dem_id) { _showDetail(container, params.dem_id); return; }
  _page = 1;
  _renderList(container);
}

function _renderList(container) {
  const counts = {
    all:      queryOne(`SELECT COUNT(*) AS n FROM requests`)?.n || 0,
    analyser: queryOne(`SELECT COUNT(*) AS n FROM requests WHERE statut='À analyser'`)?.n || 0,
    validee:  queryOne(`SELECT COUNT(*) AS n FROM requests WHERE statut='Validée'`)?.n || 0,
    rejetee:  queryOne(`SELECT COUNT(*) AS n FROM requests WHERE statut='Rejetée'`)?.n || 0,
  };

  const { rows, total } = _fetchRows();

  container.innerHTML = `
    <div class="hero" style="padding:18px 24px;">
      <h1>🔔 Gestion des demandes</h1>
      <p>Analysez et traitez les demandes soumises par les collaborateurs.</p>
    </div>

    <div class="tabs mb-2">
      ${[
        ['all',      `Toutes (${counts.all})`],
        ['analyser', `À analyser (${counts.analyser})`],
        ['validee',  `Validées (${counts.validee})`],
        ['rejetee',  `Rejetées (${counts.rejetee})`],
      ].map(([k,l]) => `<button class="tab-btn ${k===_filter?'active':''}" data-tab="${k}">${l}</button>`).join('')}
    </div>

    <div class="card mb-2" style="padding:12px 16px;">
      <div style="position:relative;max-width:400px;">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--gray)">🔍</span>
        <input type="text" class="form-control" id="dem-search" placeholder="Nom, email, direction…" value="${_search}" style="padding-left:32px;">
      </div>
    </div>

    <div class="text-muted text-sm mb-1">${total} demande(s)</div>
    <div id="dem-table">${_buildTable(rows)}</div>
    <div id="dem-pagination">${pagination(total, _page, PAGE_SIZE, '_demPage')}</div>
  `;

  window._demPage = p => { _page = p; _refreshList(container); };

  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _filter = btn.dataset.tab; _page = 1; _refreshList(container);
      container.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === _filter));
    });
  });

  container.querySelector('#dem-search').addEventListener('input', e => {
    _search = e.target.value; _page = 1; _refreshList(container);
  });
}

function _fetchRows() {
  let where = '1=1';
  const params = [];
  if (_filter !== 'all') {
    const map = { analyser:'À analyser', validee:'Validée', rejetee:'Rejetée' };
    where += ` AND statut=?`; params.push(map[_filter]);
  }
  if (_search) {
    where += ` AND (nom LIKE ? OR prenom LIKE ? OR email LIKE ? OR direction LIKE ? OR dem_id LIKE ?)`;
    const s = `%${_search}%`; params.push(s,s,s,s,s);
  }
  const total = queryOne(`SELECT COUNT(*) AS n FROM requests WHERE ${where}`, params)?.n || 0;
  const offset = (_page - 1) * PAGE_SIZE;
  const rows = query(`SELECT * FROM requests WHERE ${where} ORDER BY date_demande DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`, params);
  return { rows, total };
}

function _refreshList(container) {
  const { rows, total } = _fetchRows();
  container.querySelector('#dem-table').innerHTML = _buildTable(rows);
  container.querySelector('#dem-pagination').innerHTML = pagination(total, _page, PAGE_SIZE, '_demPage');
  container.querySelector('.text-muted.text-sm.mb-1').textContent = `${total} demande(s)`;
}

function _buildTable(rows) {
  if (!rows.length) return emptyState('📭', 'Aucune demande', 'Aucune demande ne correspond aux filtres.');
  return `<div class="table-wrap">
    <table class="data-table">
      <thead><tr>
        <th>Réf.</th><th>Demandeur</th><th>Direction</th><th>Entité</th><th>Objectif</th>
        <th>Statut</th><th>IA</th><th>Similitudes</th><th>Date</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="cu-id">${r.dem_id}</td>
            <td class="text-sm"><strong>${r.prenom} ${r.nom}</strong><br><span class="text-muted">${r.email}</span></td>
            <td class="text-sm text-muted">${truncate(r.direction,20)}</td>
            <td class="text-sm">${(r.entite==='FR')?'🇫🇷 FR':(r.entite==='DE')?'🇩🇪 DE':'—'}</td>
            <td class="text-sm">${truncate(r.objectif,50)}</td>
            <td>${statusBadge(r.statut)}</td>
            <td>${r.type_besoin_ia ? chip(r.type_besoin_ia,'type') : '<span class="text-muted text-sm">—</span>'}</td>
            <td>${r.has_similarities ? '<span style="color:var(--orange)">⚠️ Oui</span>' : '—'}</td>
            <td class="text-sm text-muted">${formatDate(r.date_demande)}</td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="window._openDemande('${r.dem_id}')">Traiter</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

window._openDemande = (demId) => {
  const r = queryOne(`SELECT * FROM requests WHERE dem_id=?`, [demId]);
  if (!r) return;

  const simCases = r.similar_cases ? (() => { try { return JSON.parse(r.similar_cases); } catch { return []; } })() : [];
  const needTypes = query(`SELECT libelle FROM need_types WHERE actif=1 ORDER BY ordre`).map(x=>x.libelle);
  const techs = query(`SELECT libelle FROM technologies WHERE actif=1 ORDER BY ordre`).map(x=>x.libelle);
  const sujets = query(`SELECT libelle FROM subject_types WHERE actif=1 ORDER BY ordre`).map(x=>x.libelle);
  const resps = query(`SELECT DISTINCT responsable FROM use_cases WHERE actif=1 AND responsable IS NOT NULL ORDER BY responsable`).map(x=>x.responsable);

  const opt = (arr, sel='') => `<option value=""></option>${arr.map(v=>`<option ${v===sel?'selected':''}>${v}</option>`).join('')}`;

  openModal(`
    <div class="modal-header">
      <div class="modal-title">📋 Demande ${r.dem_id}</div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>

    <div class="detail-grid mb-2">
      <div class="detail-item"><div class="di-label">Demandeur</div><div class="di-value">${r.prenom} ${r.nom}</div></div>
      <div class="detail-item"><div class="di-label">Email</div><div class="di-value">${r.email}</div></div>
      <div class="detail-item"><div class="di-label">Direction</div><div class="di-value">${r.direction}</div></div>
      ${(r.entite != null && r.entite !== '') ? `<div class="detail-item"><div class="di-label">Entité</div><div class="di-value">${r.entite==='FR'?'🇫🇷 KNDS France':r.entite==='DE'?'🇩🇪 KNDS Allemagne':r.entite}</div></div>` : ''}
      <div class="detail-item"><div class="di-label">Date</div><div class="di-value">${formatDate(r.date_demande)}</div></div>
    </div>

    <div class="card mb-2" style="background:var(--gray-light);border:none;padding:12px;">
      <div style="font-weight:600;margin-bottom:6px;font-size:12px;text-transform:uppercase;color:var(--gray)">Contexte</div>
      <div style="font-size:13px;line-height:1.6">${r.contexte}</div>
      <div style="font-weight:600;margin:10px 0 4px;font-size:12px;text-transform:uppercase;color:var(--gray)">Objectif</div>
      <div style="font-size:13px;line-height:1.6">${r.objectif}</div>
      ${r.commentaire ? `<div style="font-weight:600;margin:10px 0 4px;font-size:12px;text-transform:uppercase;color:var(--gray)">Commentaire</div>
      <div style="font-size:13px">${r.commentaire}</div>` : ''}
    </div>

    ${r.analyse_ia ? `<div class="alert alert-info mb-2">🤖 <strong>Analyse IA :</strong> ${r.analyse_ia}<br>
      Type : ${chip(r.type_besoin_ia,'type')} — Techno : ${chip(r.technologie_ia,'tech')}</div>` : ''}

    ${simCases.length ? `<div class="similarity-box mb-2">
      <div style="font-weight:700;color:var(--orange);margin-bottom:8px;">⚠️ Projets similaires détectés</div>
      ${simCases.map(sc=>`<div class="similarity-row">
        <span class="cu-id">${sc.cu_id}</span>
        <span style="flex:1;font-size:12px">${sc.nom}</span>
        <span class="score-bar"><span class="score-fill" style="width:${sc.score}%"></span></span>
        <span style="font-size:12px;font-weight:700;color:var(--orange)">${sc.score}%</span>
      </div>`).join('')}
    </div>` : ''}

    <div style="border-top:2px solid var(--blue-pale);padding-top:16px;margin-top:8px;">
      <div class="section-title mb-2">🏷️ Qualification administrative</div>
      <div class="form-grid form-grid-2">
        <div class="form-group"><label class="form-label">Type de besoin</label>
          <select class="form-control" id="adm-type"><option value=""></option>${opt(needTypes, r.type_besoin_admin||r.type_besoin_ia)}</select></div>
        <div class="form-group"><label class="form-label">Technologie</label>
          <select class="form-control" id="adm-tech"><option value=""></option>${opt(techs, r.technologie_admin||r.technologie_ia)}</select></div>
        <div class="form-group"><label class="form-label">Type de sujet</label>
          <select class="form-control" id="adm-sujet"><option value=""></option>${opt(sujets, r.type_sujet_admin)}</select></div>
        <div class="form-group"><label class="form-label">Responsable</label>
          <select class="form-control" id="adm-resp"><option value=""></option>${opt(resps, r.responsable_admin)}</select></div>
        <div class="form-group"><label class="form-label">Pilote métier</label>
          <input class="form-control" id="adm-pilote" value="${r.pilote_metier_admin||''}"></div>
        <div class="form-group"><label class="form-label">Lien Jira</label>
          <input class="form-control" id="adm-jira" placeholder="https://jira…" value="${r.jira_url_admin||''}"></div>
      </div>
      <div class="form-group"><label class="form-label">ROI définitif (€/an)</label>
        <input class="form-control" type="number" id="adm-roi" value="${r.roi_definitif||''}"></div>
    </div>

    <div id="reject-section" style="display:none;margin-top:12px;">
      <div class="form-group"><label class="form-label">Motif de rejet <span class="required">*</span></label>
        <select class="form-control" id="adm-motif">
          <option value=""></option>
          ${['Projet similaire existant','Hors périmètre','Non prioritaire','Ressources insuffisantes','Autre'].map(m=>`<option>${m}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Commentaire de rejet</label>
        <textarea class="form-control" id="adm-rej-comment" rows="2"></textarea></div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-danger" id="btn-reject">❌ Rejeter</button>
      <button class="btn btn-success" id="btn-validate">✅ Valider → Créer CU</button>
    </div>
  `);

  document.querySelector('#btn-reject').addEventListener('click', () => {
    const sec = document.querySelector('#reject-section');
    if (sec.style.display === 'none') { sec.style.display = ''; return; }
    const motif = document.querySelector('#adm-motif').value;
    const comment = document.querySelector('#adm-rej-comment').value;
    if (!motif) { toast('Veuillez sélectionner un motif de rejet.', 'danger'); return; }
    _rejectRequest(r.dem_id, motif, comment);
    closeModal();
    toast('Demande rejetée.', 'warning');
    const cont = document.querySelector('#main-content');
    if (cont) _renderList(cont);
  });

  document.querySelector('#btn-validate').addEventListener('click', () => {
    try {
      const type   = document.querySelector('#adm-type').value;
      const tech   = document.querySelector('#adm-tech').value;
      const sujet  = document.querySelector('#adm-sujet').value;
      const resp   = document.querySelector('#adm-resp').value;
      const pilote = document.querySelector('#adm-pilote').value;
      const jira   = document.querySelector('#adm-jira').value;
      const roi    = parseFloat(document.querySelector('#adm-roi').value) || null;
      _validateRequest(r, { type, tech, sujet, resp, pilote, jira, roi });
      closeModal();
      toast('Demande validée — CU créé.', 'success');
      const cont = document.querySelector('#main-content');
      if (cont) _renderList(cont);
    } catch(e) {
      console.error('Erreur validate:', e);
      toast(`Erreur : ${e.message}`, 'danger');
    }
  });
}

function _rejectRequest(demId, motif, comment) {
  const user = getCurrentUsername();
  run(`UPDATE requests SET statut='Rejetée', motif_rejet=?, commentaire_rejet=?, traite_par=?, date_traitement=datetime('now') WHERE dem_id=?`,
    [motif, comment, user, demId]);
  saveDB();
}

function _validateRequest(r, adm) {
  const cuId = nextCuId(r.entite || null);
  const user = getCurrentUsername();
  const origineFromRequest = r.entite || null;
  run(`INSERT INTO use_cases(cu_id,nom,description,type_besoin,type_sujet,statut,responsable,pilote_metier,technologie,roi_annuel,jira_url,origine,visibilite,request_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [cuId, r.objectif || r.dem_id, r.contexte, adm.type||r.type_besoin_ia||null,
     adm.sujet||null, 'Besoin identifié', adm.resp||null, adm.pilote||null,
     adm.tech||r.technologie_ia||null, adm.roi||null, adm.jira||null,
     origineFromRequest, 'common', r.id]);
  run(`UPDATE requests SET statut='Validée', type_besoin_admin=?, technologie_admin=?, type_sujet_admin=?,
    responsable_admin=?, pilote_metier_admin=?, jira_url_admin=?, roi_definitif=?,
    traite_par=?, date_traitement=datetime('now'), use_case_id=(SELECT id FROM use_cases WHERE cu_id=?)
    WHERE dem_id=?`,
    [adm.type, adm.tech, adm.sujet, adm.resp, adm.pilote, adm.jira, adm.roi, user, cuId, r.dem_id]);
  saveDB();
}
