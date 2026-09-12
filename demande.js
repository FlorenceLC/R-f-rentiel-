import { query, queryOne, run, nextDemId, saveDB } from '../modules/db.js';
import { analyzeRequest, isAIAvailable } from '../modules/ai.js';
import { toast, spinner, alertBox, statusBadge, formatROI, chip } from '../modules/ui.js';
import { navigate } from '../app.js';

let _step = 1;
let _data = {};
let _aiResult = null;

export function renderDemande(container) {
  _step = 1; _data = {}; _aiResult = null;
  _renderStep(container);
}

function _renderStep(container) {
  const steps = ['Identité','Besoin','ROI','Analyse IA','Confirmation'];
  const stepsHTML = `<div class="steps mb-3">
    ${steps.map((s,i) => `<div class="step ${i+1<_step?'done':i+1===_step?'active':''}">${i+1}. ${s}</div>`).join('')}
  </div>`;

  container.innerHTML = `
    <div class="hero" style="padding:18px 24px">
      <h1>📝 Soumettre un besoin</h1>
      <p>Décrivez votre besoin — notre IA l'analysera et cherchera des projets similaires.</p>
    </div>
    <div class="card">
      ${stepsHTML}
      <div id="step-content">${_buildStep(container)}</div>
    </div>`;

  _bindStep(container);
}

function _buildStep() {
  if (_step === 1) return `
    <div class="form-grid form-grid-2">
      <div class="form-group"><label class="form-label">Nom <span class="required">*</span></label>
        <input class="form-control" id="f-nom" value="${_data.nom||''}" placeholder="Votre nom" required></div>
      <div class="form-group"><label class="form-label">Prénom <span class="required">*</span></label>
        <input class="form-control" id="f-prenom" value="${_data.prenom||''}" placeholder="Votre prénom" required></div>
      <div class="form-group"><label class="form-label">Email <span class="required">*</span></label>
        <input class="form-control" type="email" id="f-email" value="${_data.email||''}" placeholder="vous@entreprise.fr" required></div>
      <div class="form-group"><label class="form-label">Direction / Service <span class="required">*</span></label>
        <input class="form-control" id="f-direction" value="${_data.direction||''}" placeholder="Ex: Direction Finance" required></div>
    </div>
    <div class="flex justify-end mt-2">
      <button class="btn btn-primary" id="btn-next">Suivant →</button>
    </div>`;

  if (_step === 2) return `
    <div class="form-group"><label class="form-label">Contexte actuel <span class="required">*</span></label>
      <textarea class="form-control" id="f-contexte" rows="4" placeholder="Décrivez votre situation actuelle, le problème que vous rencontrez…">${_data.contexte||''}</textarea></div>
    <div class="form-group"><label class="form-label">Objectif visé <span class="required">*</span></label>
      <textarea class="form-control" id="f-objectif" rows="3" placeholder="Qu'aimeriez-vous obtenir comme résultat ?">${_data.objectif||''}</textarea></div>
    <div class="form-group"><label class="form-label">Commentaire (optionnel)</label>
      <textarea class="form-control" id="f-commentaire" rows="2" placeholder="Toute information complémentaire…">${_data.commentaire||''}</textarea></div>
    <div class="form-group"><label class="form-label">Disponibilité</label>
      <select class="form-control" id="f-dispo">
        <option value="immediate" ${_data.disponibilite==='immediate'?'selected':''}>Immédiate</option>
        <option value="date" ${_data.disponibilite==='date'?'selected':''}>À une date précise</option>
      </select></div>
    <div class="form-group" id="f-date-wrap" style="${_data.disponibilite==='date'?'':'display:none'}">
      <label class="form-label">Date souhaitée</label>
      <input class="form-control" type="date" id="f-date" value="${_data.date_disponibilite||''}"></div>
    <div class="flex justify-between mt-2">
      <button class="btn btn-ghost" id="btn-prev">← Retour</button>
      <button class="btn btn-primary" id="btn-next">Suivant →</button>
    </div>`;

  if (_step === 3) return `
    <div class="alert alert-info mb-2">ℹ️ Ces informations sont optionnelles et servent à estimer le ROI de votre besoin.</div>
    <div class="form-grid form-grid-2">
      <div class="form-group"><label class="form-label">Temps actuel consacré</label>
        <input class="form-control" type="number" id="f-temps" value="${_data.temps_actuel||''}" placeholder="Ex: 4" min="0"></div>
      <div class="form-group"><label class="form-label">Unité de temps</label>
        <select class="form-control" id="f-unite">
          ${['jour','semaine','mois','année'].map(u=>`<option ${_data.unite_temps===u?'selected':''}>${u}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Nombre de personnes impliquées</label>
        <input class="form-control" type="number" id="f-nb" value="${_data.nombre_personnes||''}" min="1"></div>
      <div class="form-group"><label class="form-label">Volume annuel (occurrences)</label>
        <input class="form-control" type="number" id="f-vol" value="${_data.volume_annuel||''}" min="0"></div>
    </div>
    <div id="roi-preview"></div>
    <div class="flex justify-between mt-2">
      <button class="btn btn-ghost" id="btn-prev">← Retour</button>
      <button class="btn btn-primary" id="btn-next">Analyser avec l'IA →</button>
    </div>`;

  if (_step === 4) return `
    <div class="text-center" id="ai-loading">
      <div class="spinner" style="width:36px;height:36px;margin:24px auto 12px;"></div>
      <div class="text-muted">Analyse en cours…</div>
    </div>
    <div id="ai-result" style="display:none"></div>
    <div class="flex justify-between mt-2" id="ai-nav" style="display:none">
      <button class="btn btn-ghost" id="btn-prev">← Retour</button>
      <button class="btn btn-primary" id="btn-next">Confirmer et soumettre →</button>
    </div>`;

  if (_step === 5) return `
    <div class="alert alert-success mb-2">✅ Votre demande a bien été enregistrée !</div>
    <div class="card" style="background:var(--gray-light);border:none;">
      <div><strong>Référence :</strong> <span class="cu-id-tag">${_data.dem_id||'—'}</span></div>
      <div class="mt-1"><strong>Demandeur :</strong> ${_data.prenom} ${_data.nom} — ${_data.direction}</div>
      <div class="mt-1"><strong>Objectif :</strong> ${_data.objectif}</div>
      ${_aiResult ? `<div class="mt-1"><strong>Type de besoin (IA) :</strong> ${_aiResult.type_besoin||'—'}</div>` : ''}
    </div>
    <p class="text-muted text-sm mt-2">Notre équipe analysera votre demande et vous contactera à l'adresse <strong>${_data.email}</strong>.</p>
    <div class="flex gap-1 mt-2">
      <button class="btn btn-outline" onclick="navigate('catalogue')">Voir le catalogue</button>
      <button class="btn btn-primary" onclick="renderDemande(document.getElementById('main-content'))">Soumettre un nouveau besoin</button>
    </div>`;

  return '';
}

function _bindStep(container) {
  const stepEl = container.querySelector('#step-content');
  if (!stepEl) return;

  stepEl.querySelector('#btn-prev')?.addEventListener('click', () => {
    _step--; _renderStep(container);
  });

  const nextBtn = stepEl.querySelector('#btn-next');
  if (nextBtn) nextBtn.addEventListener('click', async () => {
    if (!_validateStep(stepEl)) return;
    _collectStep(stepEl);
    _step++;
    _renderStep(container);

    if (_step === 4) await _runAI(container);
  });

  // Dispo toggle
  stepEl.querySelector('#f-dispo')?.addEventListener('change', e => {
    const wrap = stepEl.querySelector('#f-date-wrap');
    if (wrap) wrap.style.display = e.target.value === 'date' ? '' : 'none';
  });

  // ROI preview
  if (_step === 3) {
    const update = () => {
      const t = parseFloat(stepEl.querySelector('#f-temps')?.value) || 0;
      const n = parseInt(stepEl.querySelector('#f-nb')?.value) || 0;
      const v = parseInt(stepEl.querySelector('#f-vol')?.value) || 0;
      // Simplified ROI: hours saved = temps * nb * vol
      const roi = t * n * v;
      const prev = stepEl.querySelector('#roi-preview');
      if (prev && roi > 0) {
        prev.innerHTML = `<div class="roi-display mt-1">
          <div class="roi-value">${roi.toLocaleString('fr-FR')}</div>
          <div class="roi-label">heures estimées libérées / an</div>
        </div>`;
        _data.roi_estime = roi;
      } else if (prev) prev.innerHTML = '';
    };
    ['#f-temps','#f-nb','#f-vol'].forEach(id => {
      stepEl.querySelector(id)?.addEventListener('input', update);
    });
  }
}

function _validateStep(stepEl) {
  if (_step === 1) {
    const nom = stepEl.querySelector('#f-nom')?.value.trim();
    const prenom = stepEl.querySelector('#f-prenom')?.value.trim();
    const email = stepEl.querySelector('#f-email')?.value.trim();
    const dir = stepEl.querySelector('#f-direction')?.value.trim();
    if (!nom || !prenom || !email || !dir) {
      toast('Veuillez remplir tous les champs obligatoires.', 'danger'); return false;
    }
  }
  if (_step === 2) {
    const ctx = stepEl.querySelector('#f-contexte')?.value.trim();
    const obj = stepEl.querySelector('#f-objectif')?.value.trim();
    if (!ctx || !obj) {
      toast('Contexte et objectif sont obligatoires.', 'danger'); return false;
    }
  }
  return true;
}

function _collectStep(stepEl) {
  if (_step === 1) {
    _data.nom       = stepEl.querySelector('#f-nom')?.value.trim();
    _data.prenom    = stepEl.querySelector('#f-prenom')?.value.trim();
    _data.email     = stepEl.querySelector('#f-email')?.value.trim();
    _data.direction = stepEl.querySelector('#f-direction')?.value.trim();
  }
  if (_step === 2) {
    _data.contexte          = stepEl.querySelector('#f-contexte')?.value.trim();
    _data.objectif          = stepEl.querySelector('#f-objectif')?.value.trim();
    _data.commentaire       = stepEl.querySelector('#f-commentaire')?.value.trim();
    _data.disponibilite     = stepEl.querySelector('#f-dispo')?.value;
    _data.date_disponibilite = stepEl.querySelector('#f-date')?.value || null;
  }
  if (_step === 3) {
    _data.temps_actuel     = parseFloat(stepEl.querySelector('#f-temps')?.value) || null;
    _data.unite_temps      = stepEl.querySelector('#f-unite')?.value;
    _data.nombre_personnes = parseInt(stepEl.querySelector('#f-nb')?.value) || null;
    _data.volume_annuel    = parseInt(stepEl.querySelector('#f-vol')?.value) || null;
  }
}

async function _runAI(container) {
  const resultEl = container.querySelector('#ai-result');
  const loadingEl = container.querySelector('#ai-loading');
  const navEl = container.querySelector('#ai-nav');

  const catalogue = query(`SELECT * FROM use_cases WHERE actif=1 AND statut != 'Abandonné' LIMIT 50`);

  if (!isAIAvailable()) {
    _aiResult = null;
    if (loadingEl) loadingEl.style.display = 'none';
    if (resultEl) {
      resultEl.style.display = '';
      resultEl.innerHTML = alertBox('warning', 'ℹ️ L\'IA n\'est pas configurée. Votre demande sera traitée manuellement par l\'équipe.');
    }
    if (navEl) navEl.style.display = 'flex';
    _saveRequest();
    return;
  }

  const { ok, data, error } = await analyzeRequest(_data, catalogue);

  if (loadingEl) loadingEl.style.display = 'none';
  if (navEl) navEl.style.display = 'flex';

  if (!ok) {
    if (resultEl) {
      resultEl.style.display = '';
      resultEl.innerHTML = alertBox('warning', `⚠️ Analyse IA indisponible : ${error}. Votre demande sera traitée manuellement.`);
    }
    _saveRequest();
    return;
  }

  _aiResult = data;
  _data.type_besoin_ia  = data.type_besoin;
  _data.technologie_ia  = data.technologie;
  _data.analyse_ia      = data.analyse;
  _data.similar_cases   = data.similar_cases || [];
  _data.has_similarities = (data.similar_cases||[]).length > 0;

  let simHTML = '';
  if (_data.has_similarities) {
    simHTML = `
      <div class="similarity-box mt-2">
        <div style="font-weight:700;color:var(--orange);margin-bottom:8px;">⚠️ Projets similaires détectés</div>
        ${data.similar_cases.map(sc => `
          <div class="similarity-row">
            <div style="min-width:70px"><span class="cu-id">${sc.cu_id}</span></div>
            <div style="flex:1;font-size:13px;font-weight:500">${sc.nom}</div>
            <div class="score-bar"><div class="score-fill" style="width:${sc.score}%"></div></div>
            <div style="min-width:36px;text-align:right;font-size:12px;font-weight:700;color:var(--orange)">${sc.score}%</div>
          </div>
          ${sc.justification ? `<div class="text-sm text-muted mb-1" style="padding-left:80px">${sc.justification}</div>` : ''}`
        ).join('')}
        <label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;font-size:13px;">
          <input type="checkbox" id="ack-similar">
          J'ai pris connaissance des projets similaires et souhaite tout de même soumettre ma demande.
        </label>
      </div>`;
    // block next until acknowledged
    container.querySelector('#btn-next').disabled = true;
  }

  if (resultEl) {
    resultEl.style.display = '';
    resultEl.innerHTML = `
      <div class="alert alert-success mb-2">✅ Analyse IA terminée</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="di-label">Type de besoin</div><div class="di-value">${chip(data.type_besoin,'type')}</div></div>
        <div class="detail-item"><div class="di-label">Technologie recommandée</div><div class="di-value">${chip(data.technologie,'tech')}</div></div>
      </div>
      ${data.analyse ? `<div class="card mt-2" style="background:var(--gray-light);border:none;font-size:13px;">${data.analyse}</div>` : ''}
      ${simHTML}`;
  }

  if (_data.has_similarities) {
    container.querySelector('#ack-similar')?.addEventListener('change', e => {
      container.querySelector('#btn-next').disabled = !e.target.checked;
      _data.similarity_acknowledged = e.target.checked;
    });
  }

  _saveRequest();
}

function _saveRequest() {
  const dem_id = nextDemId();
  _data.dem_id = dem_id;
  run(`INSERT INTO requests
    (dem_id,nom,prenom,email,direction,contexte,objectif,commentaire,
     temps_actuel,unite_temps,nombre_personnes,volume_annuel,roi_estime,
     disponibilite,date_disponibilite,type_besoin_ia,technologie_ia,analyse_ia,
     similar_cases,has_similarities,similarity_acknowledged,statut)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'À analyser')`,
    [
      dem_id, _data.nom, _data.prenom, _data.email, _data.direction,
      _data.contexte, _data.objectif, _data.commentaire||null,
      _data.temps_actuel||null, _data.unite_temps||null,
      _data.nombre_personnes||null, _data.volume_annuel||null, _data.roi_estime||null,
      _data.disponibilite||'immediate', _data.date_disponibilite||null,
      _data.type_besoin_ia||null, _data.technologie_ia||null, _data.analyse_ia||null,
      JSON.stringify(_data.similar_cases||null), _data.has_similarities?1:0,
      _data.similarity_acknowledged?1:0,
    ]
  );
  saveDB();
}

// Make renderDemande globally accessible for inline onclick
window.renderDemande = renderDemande;
