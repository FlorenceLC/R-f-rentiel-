import { query, queryOne, run, saveDB, nextCuId, getSetting } from '../modules/db.js';
import { statusBadge, formatDate, formatROI, truncate, chip, openModal, closeModal, toast, emptyState, pagination } from '../modules/ui.js';
import { navigate } from '../app.js';
import { getDirections, buildCuExtras, parseExtras, calcRoi, roiBoxHTML, formatHeures, heuresParAn } from '../modules/roi.js';

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
        <th>ID</th><th>Nom</th><th>Statut</th><th>Type</th><th>Techno</th><th>Responsable</th><th>ROI</th><th>Origine</th><th>Visibilité</th><th>App</th><th>Actions</th>
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
          <td class="text-sm">${(cu.origine==='FR')?'🇫🇷 FR':(cu.origine==='DE')?'🇩🇪 DE':'—'}</td>
          <td class="text-sm">${(cu.visibilite==='FR')?'🇫🇷 Spécial FR':(cu.visibilite==='DE')?'🇩🇪 Spécial DE':'🌍 Commun'}</td>
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
    [_getCurrentUsername(), cuId]);
  saveDB();
  toast(`${cuId} archivé.`, 'warning');
  const cont = document.querySelector('#main-content');
  if (cont) _refresh(cont);
};

const TYPES_DONNEES_OPTIONS = [
  'PDF','Tableurs','Bases de données','Images',
  'Audio ou documents numérisés','Document Office','Code informatique','Systèmes'
];

function _openEditModal(cuId, container) {
  const cu = cuId ? queryOne(`SELECT * FROM use_cases WHERE cu_id=?`, [cuId]) : null;
  const isNew = !cu;

  // Données du formulaire : extras sauvegardés, complétés par la demande d'origine (pré-remplissage)
  let extras = parseExtras(cu?.commentaire);
  if (cu?.request_id) {
    const req = queryOne(`SELECT * FROM requests WHERE id=?`, [cu.request_id]);
    if (req) {
      const fromReq = buildCuExtras(req);
      Object.keys(fromReq).forEach(k => {
        if (extras[k] == null || extras[k] === '') extras[k] = fromReq[k];
      });
    }
  }

  const needTypes = query(`SELECT libelle FROM need_types WHERE actif=1 ORDER BY ordre`).map(r=>r.libelle);
  const techs     = query(`SELECT libelle FROM technologies WHERE actif=1 ORDER BY ordre`).map(r=>r.libelle);
  const sujets    = query(`SELECT libelle FROM subject_types WHERE actif=1 ORDER BY ordre`).map(r=>r.libelle);
  const statuts   = ['Besoin identifié','Cadrage','POC','En développement','Production','Abandonné'];
  const resps     = query(`SELECT DISTINCT responsable FROM use_cases WHERE actif=1 AND responsable IS NOT NULL ORDER BY responsable`).map(r=>r.responsable);

  const _orig = isNew ? getSetting('pays_admin', '') : (cu.origine || '');
  const _dirs = getDirections();
  const _dirCur = (cu && cu.direction) || extras.direction || '';
  if (_dirCur && !_dirs.includes(_dirCur)) _dirs.push(_dirCur);
  const opt = (arr, val='') => arr.map(v=>`<option value="${v}" ${v==val?'selected':''}>${v}</option>`).join('');
  const v   = (field, def='') => cu ? (cu[field] ?? def) : def;
  const ex  = (field, def='') => extras[field] ?? def;

  // Build types_donnees checkboxes
  const selectedTypes = ex('types_donnees') ? (Array.isArray(ex('types_donnees')) ? ex('types_donnees') : []) : [];
  const typesDonneesHTML = TYPES_DONNEES_OPTIONS.map(td =>
    `<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer;font-size:13px;">
       <input type="checkbox" class="cb-ex-type-donnee" value="${td}" ${selectedTypes.includes(td)?'checked':''}> ${td}
     </label>`
  ).join('');

  const showSystemes = selectedTypes.includes('Systèmes');
  const selectedSystemes = Array.isArray(ex('systemes_selectionnes')) ? ex('systemes_selectionnes') : [];
  const systemesOpts = ['SAP','Oracle ERP','Salesforce','Microsoft Dynamics','ServiceNow','SharePoint',
    'Microsoft Teams','Jira / Confluence','GitHub / GitLab','Power BI','Tableau','Dataiku',
    'Azure / AWS / GCP','API REST interne','Autre système']
    .map(s=>`<option value="${s}" ${selectedSystemes.includes(s)?'selected':''}>${s}</option>`).join('');

  const priorite = ex('priorite') || '';
  const showJustif = priorite && priorite !== 'Faible';
  const benefice = ex('benefice_attendu') || '';
  const showAutreBen = benefice === 'Autre';

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${isNew?'➕ Nouveau cas d\'usage':'✏️ Modifier '+cuId}</div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>

    <!-- ══ ONGLETS ══ -->
    <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:2px solid var(--border);padding-bottom:0;">
      <button class="cu-tab-btn active" data-tab="general" style="padding:6px 14px;border:none;background:none;cursor:pointer;font-weight:600;color:var(--blue);border-bottom:2px solid var(--blue);margin-bottom:-2px;">📋 Général</button>
      <button class="cu-tab-btn" data-tab="besoin" style="padding:6px 14px;border:none;background:none;cursor:pointer;color:var(--text-muted);">📝 Besoin</button>
      <button class="cu-tab-btn" data-tab="donnees" style="padding:6px 14px;border:none;background:none;cursor:pointer;color:var(--text-muted);">📂 Données</button>
      <button class="cu-tab-btn" data-tab="roi" style="padding:6px 14px;border:none;background:none;cursor:pointer;color:var(--text-muted);">💰 ROI</button>
    </div>

    <!-- ══ ONGLET GÉNÉRAL ══ -->
    <div id="cu-tab-general">
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
        <div class="form-group"><label class="form-label">Direction / Service</label>
          <select class="form-control" id="cu-direction"><option value=""></option>${opt(_dirs, _dirCur)}</select></div>
        <div class="form-group"><label class="form-label">Origine</label>
          <select class="form-control" id="cu-origine">
            <option value="" ${!_orig?'selected':''}>— Non défini —</option>
            <option value="FR" ${_orig==='FR'?'selected':''}>🇫🇷 KNDS France</option>
            <option value="DE" ${_orig==='DE'?'selected':''}>🇩🇪 KNDS Allemagne</option>
          </select></div>
        <div class="form-group"><label class="form-label">Visibilité</label>
          <select class="form-control" id="cu-visibilite">
            <option value="common" ${(v('visibilite')||'common')==='common'?'selected':''}>🌍 Commun FR+DE</option>
            <option value="FR" ${v('visibilite')==='FR'?'selected':''}>🇫🇷 Spécial France</option>
            <option value="DE" ${v('visibilite')==='DE'?'selected':''}>🇩🇪 Spécial Allemagne</option>
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Description / Objectif</label>
        <textarea class="form-control" id="cu-desc" rows="4">${v('description')}</textarea></div>
      <div class="form-group"><label class="form-label">Gain estimé</label>
        <input class="form-control" id="cu-gain" value="${v('gain_estime') || (extras.heures_an ? formatHeures(extras.heures_an) : '')}"></div>
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
    </div>

    <!-- ══ ONGLET BESOIN ══ -->
    <div id="cu-tab-besoin" style="display:none">
      <div class="alert alert-info mb-2" style="font-size:12px;">Ces champs correspondent aux informations du formulaire de soumission de besoin.</div>
      <div class="form-group">
        <label class="form-label">Contexte actuel</label>
        <p class="text-sm text-muted mb-1">Problème à résoudre, fonctionnement actuel…</p>
        <textarea class="form-control" id="ex-contexte" rows="4" maxlength="10000" placeholder="Décrivez le contexte et le problème actuel…">${ex('contexte')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Objectif visé</label>
        <p class="text-sm text-muted mb-1">Outil idéal, résultat attendu, fonctions envisagées…</p>
        <textarea class="form-control" id="ex-objectif" rows="4" maxlength="10000" placeholder="Décrivez l'outil idéal, les fonctions attendues…">${ex('objectif')}</textarea>
      </div>
      <div class="form-grid form-grid-2">
        <div class="form-group">
          <label class="form-label">Priorité souhaitée</label>
          <select class="form-control" id="ex-priorite">
            <option value="" ${!priorite?'selected':''}>— Non défini —</option>
            <option value="Faible" ${priorite==='Faible'?'selected':''}>Faible</option>
            <option value="Moyenne" ${priorite==='Moyenne'?'selected':''}>Moyenne</option>
            <option value="Élevée" ${priorite==='Élevée'?'selected':''}>Élevée</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Titre suggéré (IA)</label>
          <input class="form-control" id="ex-titre-ia" value="${ex('titre_ia')}" placeholder="Généré automatiquement par l'IA">
        </div>
      </div>
      <div class="form-group" id="ex-justif-wrap" style="${showJustif?'':'display:none'}">
        <label class="form-label">Justification de la priorité</label>
        <textarea class="form-control" id="ex-justif" rows="2" maxlength="10000">${ex('justif_priorite')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Commentaire complémentaire</label>
        <textarea class="form-control" id="ex-commentaire" rows="2" maxlength="10000">${ex('commentaire_libre')||''}</textarea>
      </div>
    </div>

    <!-- ══ ONGLET DONNÉES ══ -->
    <div id="cu-tab-donnees" style="display:none">
      <div class="form-group">
        <label class="form-label">Types de données d'entrée</label>
        <div style="border:1px solid var(--border);border-radius:8px;padding:10px;background:var(--gray-light);">
          ${typesDonneesHTML}
        </div>
      </div>
      <div class="form-group" id="ex-systemes-wrap" style="${showSystemes?'':'display:none'}">
        <label class="form-label">Systèmes concernés</label>
        <select class="form-control" id="ex-systemes" multiple size="5">${systemesOpts}</select>
        <div class="text-sm text-muted mt-1">Ctrl/Cmd pour sélection multiple.</div>
      </div>
      <div class="form-grid form-grid-2">
        <div class="form-group">
          <label class="form-label">Respect RGPD</label>
          <select class="form-control" id="ex-rgpd">
            <option value="" ${!ex('rgpd')?'selected':''}>— Non défini —</option>
            <option value="Oui" ${ex('rgpd')==='Oui'?'selected':''}>Oui</option>
            <option value="Non" ${ex('rgpd')==='Non'?'selected':''}>Non</option>
            <option value="Pas encore connu" ${ex('rgpd')==='Pas encore connu'?'selected':''}>Pas encore connu</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Disponibilité des données</label>
          <select class="form-control" id="ex-dispo-donnees">
            <option value="" ${!ex('dispo_donnees')?'selected':''}>— Non défini —</option>
            <option value="Oui" ${ex('dispo_donnees')==='Oui'?'selected':''}>Oui</option>
            <option value="Non" ${ex('dispo_donnees')==='Non'?'selected':''}>Non</option>
            <option value="Pas encore connu" ${ex('dispo_donnees')==='Pas encore connu'?'selected':''}>Pas encore connu</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Confidentialité des données</label>
          <select class="form-control" id="ex-confidentialite">
            <option value="" ${!ex('confidentialite')?'selected':''}>— Non défini —</option>
            <option value="Oui" ${ex('confidentialite')==='Oui'?'selected':''}>Oui</option>
            <option value="Non" ${ex('confidentialite')==='Non'?'selected':''}>Non</option>
            <option value="Pas encore connu" ${ex('confidentialite')==='Pas encore connu'?'selected':''}>Pas encore connu</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Accès données externes</label>
          <select class="form-control" id="ex-donnees-externes">
            <option value="" ${!ex('donnees_externes')?'selected':''}>— Non défini —</option>
            <option value="Oui" ${ex('donnees_externes')==='Oui'?'selected':''}>Oui</option>
            <option value="Non" ${ex('donnees_externes')==='Non'?'selected':''}>Non</option>
            <option value="Pas encore connu" ${ex('donnees_externes')==='Pas encore connu'?'selected':''}>Pas encore connu</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Sources des données</label>
        <textarea class="form-control" id="ex-sources" rows="2" maxlength="10000" placeholder="Systèmes, espaces documentaires, documents…">${ex('sources_donnees')}</textarea>
      </div>
      <div class="form-group" id="ex-details-externes-wrap" style="${ex('donnees_externes')==='Oui'?'':'display:none'}">
        <label class="form-label">Précisions données externes</label>
        <textarea class="form-control" id="ex-details-externes" rows="2" maxlength="10000">${ex('details_externes')}</textarea>
      </div>
    </div>

    <!-- ══ ONGLET ROI ══ -->
    <div id="cu-tab-roi" style="display:none">
      <div class="form-group">
        <label class="form-label">Bénéfice attendu</label>
        <select class="form-control" id="ex-benefice">
          <option value="" ${!benefice?'selected':''}>— Non défini —</option>
          ${['Gain de temps','Réduction des coûts','Amélioration de la qualité','Aide à la décision','Réduction des risques','Autre']
            .map(b=>`<option value="${b}" ${benefice===b?'selected':''}>${b}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" id="ex-autre-ben-wrap" style="${showAutreBen?'':'display:none'}">
        <label class="form-label">Précisions bénéfice</label>
        <textarea class="form-control" id="ex-autre-ben" rows="2">${ex('autre_benefice')}</textarea>
      </div>
      <div class="form-grid form-grid-2">
        <div class="form-group"><label class="form-label">Temps actuel consacré</label>
          <input class="form-control" type="number" id="ex-temps" value="${ex('temps_actuel')}" placeholder="Ex: 4" min="0"></div>
        <div class="form-group"><label class="form-label">Unité de temps</label>
          <select class="form-control" id="ex-unite">
            ${['heure','jour','semaine','mois','année'].map(u=>`<option ${ex('unite_temps')===u?'selected':''}>${u}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Nombre de personnes impliquées</label>
          <input class="form-control" type="number" id="ex-nb" value="${ex('nombre_personnes')}" min="1"></div>
        <div class="form-group"><label class="form-label">Volume annuel (occurrences)</label>
          <input class="form-control" type="number" id="ex-vol" value="${ex('volume_annuel')}" min="0"></div>
      </div>
      <div class="form-grid form-grid-2">
        <div class="form-group">
          <label class="form-label">Temps passé / an (heures)</label>
          <input class="form-control" id="ex-heures" value="${extras.heures_an ? formatHeures(extras.heures_an) : ''}" readonly>
        </div>
        <div class="form-group">
          <label class="form-label">Gain IA estimé (%)</label>
          <input class="form-control" type="number" id="ex-gain-pct" min="0" max="100" step="1" value="${extras.gain_ia_pct ?? ''}" placeholder="Ex : 60">
          ${extras.gain_ia_justif ? `<div class="text-sm text-muted mt-1">🤖 ${extras.gain_ia_justif}</div>` : ''}
        </div>
      </div>
      <div id="ex-roi-box"></div>
      <div class="mt-1"><button type="button" class="btn btn-outline btn-sm" id="ex-roi-apply">⬇️ Appliquer ce ROI à la fiche</button></div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" id="cu-save">💾 Enregistrer</button>
    </div>
  `);

  // ── Tab switching ──────────────────────────────────────
  document.querySelectorAll('.cu-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cu-tab-btn').forEach(b => {
        b.style.color = 'var(--text-muted)';
        b.style.borderBottom = 'none';
        b.classList.remove('active');
      });
      btn.style.color = 'var(--blue)';
      btn.style.borderBottom = '2px solid var(--blue)';
      btn.style.marginBottom = '-2px';
      btn.classList.add('active');
      ['general','besoin','donnees','roi'].forEach(t => {
        const el = document.getElementById(`cu-tab-${t}`);
        if (el) el.style.display = btn.dataset.tab === t ? '' : 'none';
      });
    });
  });

  // ── Interactions ───────────────────────────────────────
  document.querySelector('#cu-app').addEventListener('change', e => {
    document.querySelector('#cu-app-fields').style.display = e.target.checked ? '' : 'none';
  });

  document.querySelector('#ex-priorite').addEventListener('change', e => {
    const wrap = document.querySelector('#ex-justif-wrap');
    if (wrap) wrap.style.display = (e.target.value && e.target.value !== 'Faible') ? '' : 'none';
  });

  document.querySelector('#ex-benefice').addEventListener('change', e => {
    const wrap = document.querySelector('#ex-autre-ben-wrap');
    if (wrap) wrap.style.display = e.target.value === 'Autre' ? '' : 'none';
  });

  document.querySelectorAll('.cb-ex-type-donnee').forEach(cb => {
    cb.addEventListener('change', () => {
      const any = [...document.querySelectorAll('.cb-ex-type-donnee')].some(c => c.value === 'Systèmes' && c.checked);
      const wrap = document.querySelector('#ex-systemes-wrap');
      if (wrap) wrap.style.display = any ? '' : 'none';
    });
  });

  document.querySelector('#ex-donnees-externes')?.addEventListener('change', e => {
    const wrap = document.querySelector('#ex-details-externes-wrap');
    if (wrap) wrap.style.display = e.target.value === 'Oui' ? '' : 'none';
  });

  // ── Calcul ROI en direct ───────────────────────────────
  let _lastCalc = null;
  const refreshRoi = () => {
    const d = {
      temps_actuel:     parseFloat(document.querySelector('#ex-temps')?.value),
      unite_temps:      document.querySelector('#ex-unite')?.value,
      nombre_personnes: parseInt(document.querySelector('#ex-nb')?.value),
      volume_annuel:    document.querySelector('#ex-vol')?.value,
    };
    _lastCalc = calcRoi(d, document.querySelector('#ex-gain-pct')?.value);
    const h = heuresParAn(d);
    document.querySelector('#ex-heures').value = h > 0 ? formatHeures(h) : '';
    document.querySelector('#ex-roi-box').innerHTML = roiBoxHTML(_lastCalc);
  };
  ['#ex-temps','#ex-unite','#ex-nb','#ex-vol','#ex-gain-pct'].forEach(id => {
    document.querySelector(id)?.addEventListener('input', refreshRoi);
    document.querySelector(id)?.addEventListener('change', refreshRoi);
  });
  refreshRoi();
  document.querySelector('#ex-roi-apply').addEventListener('click', () => {
    if (_lastCalc?.roi == null) { toast('ROI non calculable : complétez les données manquantes.', 'warning'); return; }
    document.querySelector('#cu-roi').value = _lastCalc.roi;
    const h = document.querySelector('#ex-heures').value;
    if (h) document.querySelector('#cu-gain').value = h;
    toast('ROI appliqué à la fiche (onglet Général).', 'success');
  });
  // Nouveau CU / ROI vide : proposer automatiquement la valeur calculée
  if (!document.querySelector('#cu-roi').value && _lastCalc?.roi != null) {
    document.querySelector('#cu-roi').value = _lastCalc.roi;
  }

  // ── Save ───────────────────────────────────────────────
  document.querySelector('#cu-save').addEventListener('click', () => {
    try {
      const nom = document.querySelector('#cu-nom').value.trim();
      if (!nom) { toast('Le nom est obligatoire.', 'danger'); return; }

      // Collect main fields
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
        direction:   document.querySelector('#cu-direction').value || null,
      };

      // Collect extras (besoin/données/roi fields) — stored in commentaire as JSON
      const typesDonnees = [...document.querySelectorAll('.cb-ex-type-donnee:checked')].map(c => c.value);
      const systemesSelected = [...(document.querySelector('#ex-systemes')?.selectedOptions || [])].map(o => o.value);

      const extrasObj = {
        contexte:        document.querySelector('#ex-contexte')?.value.trim() || null,
        objectif:        document.querySelector('#ex-objectif')?.value.trim() || null,
        priorite:        document.querySelector('#ex-priorite')?.value || null,
        justif_priorite: document.querySelector('#ex-justif')?.value.trim() || null,
        titre_ia:        document.querySelector('#ex-titre-ia')?.value.trim() || null,
        commentaire_libre: document.querySelector('#ex-commentaire')?.value.trim() || null,
        types_donnees:   typesDonnees.length ? typesDonnees : null,
        systemes_selectionnes: systemesSelected.length ? systemesSelected : null,
        rgpd:            document.querySelector('#ex-rgpd')?.value || null,
        dispo_donnees:   document.querySelector('#ex-dispo-donnees')?.value || null,
        confidentialite: document.querySelector('#ex-confidentialite')?.value || null,
        donnees_externes: document.querySelector('#ex-donnees-externes')?.value || null,
        sources_donnees: document.querySelector('#ex-sources')?.value.trim() || null,
        details_externes: document.querySelector('#ex-details-externes')?.value.trim() || null,
        benefice_attendu: document.querySelector('#ex-benefice')?.value || null,
        autre_benefice:  document.querySelector('#ex-autre-ben')?.value.trim() || null,
        temps_actuel:    parseFloat(document.querySelector('#ex-temps')?.value) || null,
        unite_temps:     document.querySelector('#ex-unite')?.value || null,
        nombre_personnes: parseInt(document.querySelector('#ex-nb')?.value) || null,
        volume_annuel:   parseInt(document.querySelector('#ex-vol')?.value) || null,
        gain_ia_pct:     document.querySelector('#ex-gain-pct')?.value !== '' ? parseFloat(document.querySelector('#ex-gain-pct').value) : null,
        gain_ia_justif:  extras.gain_ia_justif || null,
        heures_an:       heuresParAn({
          temps_actuel: parseFloat(document.querySelector('#ex-temps')?.value),
          unite_temps: document.querySelector('#ex-unite')?.value,
          nombre_personnes: parseInt(document.querySelector('#ex-nb')?.value),
          volume_annuel: document.querySelector('#ex-vol')?.value }) || null,
        direction:       extras.direction || null,
        demandeur:       extras.demandeur || null,
      };

      const commentaireJSON = JSON.stringify(extrasObj);

      if (isNew) {
        const id = nextCuId(data.origine || null);
        run(`INSERT INTO use_cases(cu_id,nom,statut,type_besoin,technologie,type_sujet,responsable,pilote_metier,
              roi_annuel,description,gain_estime,jira_url,application_disponible,application_url,
              conditions_acces,origine,visibilite,commentaire,direction)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, data.nom, data.statut, data.type_besoin, data.technologie, data.type_sujet, data.responsable,
           data.pilote_metier, data.roi_annuel, data.description, data.gain_estime, data.jira_url,
           data.application_disponible, data.application_url, data.conditions_acces, data.origine,
           data.visibilite, commentaireJSON, data.direction]);
        toast(`CU créé : ${id}`, 'success');
      } else {
        run(`UPDATE use_cases SET nom=?,statut=?,type_besoin=?,technologie=?,type_sujet=?,responsable=?,
              pilote_metier=?,roi_annuel=?,description=?,gain_estime=?,jira_url=?,application_disponible=?,
              application_url=?,conditions_acces=?,origine=?,visibilite=?,commentaire=?,direction=?,
              date_modification=datetime('now') WHERE cu_id=?`,
          [data.nom, data.statut, data.type_besoin, data.technologie, data.type_sujet, data.responsable,
           data.pilote_metier, data.roi_annuel, data.description, data.gain_estime, data.jira_url,
           data.application_disponible, data.application_url, data.conditions_acces, data.origine,
           data.visibilite, commentaireJSON, data.direction, cuId]);
        toast(`${cuId} mis à jour.`, 'success');
      }
      saveDB();
      closeModal();
      _refresh(container);
    } catch(e) {
      console.error('Erreur save CU:', e);
      toast(`Erreur : ${e.message}`, 'danger');
    }
  });
}

function _getCurrentUsername() {
  try { return JSON.parse(localStorage.getItem('rcu_session'))?.user?.username || 'admin'; } catch { return 'admin'; }
}
