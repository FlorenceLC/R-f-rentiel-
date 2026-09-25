import { query, queryOne, run, nextDemId, saveDB, getSetting } from '../modules/db.js';
import { analyzeRequest, callAI, isAIAvailable } from '../modules/ai.js';
import { toast, spinner, alertBox, statusBadge, formatROI, chip } from '../modules/ui.js';
import { navigate } from '../app.js';
import { t } from '../modules/i18n.js';

let _step = 1;
let _data = {};
let _aiResult = null;

// Total steps: 1=Identité, 2=Besoin, 3=Données, 4=ROI, 5=Analyse IA, 6=Confirmation
const STEPS = ['Identité','Besoin','Données','ROI','Analyse IA','Confirmation'];
const STEP_IDENTITE    = 1;
const STEP_BESOIN      = 2;
const STEP_DONNEES     = 3;
const STEP_ROI         = 4;
const STEP_AI          = 5;
const STEP_CONFIRM     = 6;

const DIRECTIONS = [
  'Direction Générale',
  'Direction Financière',
  'Direction des Ressources Humaines',
  'Direction des Systèmes d\'Information',
  'Direction Commerciale / Ventes',
  'Direction Marketing',
  'Direction des Achats',
  'Direction de la Production',
  'Direction Qualité',
  'Direction Juridique',
  'Direction de la Supply Chain / Logistique',
  'Direction de la Recherche & Développement',
  'Direction de la Communication',
  'Direction de la Transformation / Innovation',
  'Direction des Projets',
  'Direction Industrielle',
  'Direction Technique',
  'Direction Sécurité',
  'Autre',
];

const SYSTEMES_OPTIONS = [
  'SAP',
  'Oracle ERP',
  'Salesforce',
  'Microsoft Dynamics',
  'ServiceNow',
  'SharePoint',
  'Microsoft Teams',
  'Jira / Confluence',
  'GitHub / GitLab',
  'Power BI',
  'Tableau',
  'Dataiku',
  'Azure / AWS / GCP',
  'API REST interne',
  'Autre système',
];

export function renderDemande(container) {
  _step = 1; _data = {}; _aiResult = null;
  _renderStep(container);
}

function _renderStep(container) {
  const stepsHTML = `<div class="steps mb-3">
    ${STEPS.map((s,i) => `<div class="step ${i+1<_step?'done':i+1===_step?'active':''}">${i+1}. ${s}</div>`).join('')}
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
  /* ─────────────── ÉTAPE 1 — IDENTITÉ ─────────────── */
  if (_step === STEP_IDENTITE) {
    const bilingual = getSetting('bilingual_mode', 'false') === 'true';
    const entityField = bilingual ? `
      <div class="form-group"><label class="form-label">${t('request.field.entity')} <span class="required">*</span></label>
        <select class="form-control" id="f-entite">
          <option value="" ${!_data.entite?'selected':''}>— Sélectionnez votre entité —</option>
          <option value="FR" ${_data.entite==='FR'?'selected':''}>🇫🇷 ${t('request.entity.fr')}</option>
          <option value="DE" ${_data.entite==='DE'?'selected':''}>🇩🇪 ${t('request.entity.de')}</option>
        </select></div>` : '';

    const dirOptions = DIRECTIONS.map(d =>
      `<option value="${d}" ${_data.direction===d?'selected':''}>${d}</option>`
    ).join('');

    return `
    <div class="form-grid form-grid-2">
      <div class="form-group"><label class="form-label">${t('request.field.lastname')} <span class="required">*</span></label>
        <input class="form-control" id="f-nom" value="${_data.nom||''}" placeholder="Votre nom" maxlength="10000" required></div>
      <div class="form-group"><label class="form-label">${t('request.field.firstname')} <span class="required">*</span></label>
        <input class="form-control" id="f-prenom" value="${_data.prenom||''}" placeholder="Votre prénom" maxlength="10000" required></div>
      <div class="form-group"><label class="form-label">${t('request.field.email')} <span class="required">*</span></label>
        <input class="form-control" type="email" id="f-email" value="${_data.email||''}" placeholder="vous@entreprise.fr" maxlength="10000" required></div>
      <div class="form-group"><label class="form-label">${t('request.field.direction')} <span class="required">*</span></label>
        <select class="form-control" id="f-direction">
          <option value="" ${!_data.direction?'selected':''}>— Sélectionnez votre direction —</option>
          ${dirOptions}
        </select></div>
      ${entityField}
    </div>
    <div class="flex justify-end mt-2">
      <button class="btn btn-primary" id="btn-next">Suivant →</button>
    </div>`;
  }

  /* ─────────────── ÉTAPE 2 — BESOIN ─────────────── */
  if (_step === STEP_BESOIN) {
    const priorite = _data.priorite || '';
    const showJustif = priorite !== '' && priorite !== 'Faible';
    const justifLabel = priorite === 'Élevée'
      ? 'Justification de la priorité élevée <span class="required">*</span>'
      : 'Justification de la priorité';
    const justifPlaceholder = priorite === 'Élevée'
      ? 'Précisez le caractère d\'urgence, les échéances ou les raisons métiers justifiant cette priorité élevée…'
      : 'Précisez les raisons justifiant la priorité choisie…';

    return `
    <div class="form-group">
      <label class="form-label">Contexte actuel <span class="required">*</span></label>
      <p class="text-sm text-muted mb-1">Décrivez le problème à résoudre et le fonctionnement actuel (processus en place, difficultés rencontrées, limites actuelles…)</p>
      <textarea class="form-control" id="f-contexte" rows="5" maxlength="10000" placeholder="Ex : Aujourd'hui, notre équipe saisit manuellement les données dans Excel. Ce processus prend 4h par semaine et génère des erreurs fréquentes...">${_data.contexte||''}</textarea>
      <div class="char-counter text-sm text-muted text-right mt-0"><span id="cc-contexte">${(_data.contexte||'').length}</span>/10000</div>
    </div>
    <div class="form-group">
      <label class="form-label">Objectif visé <span class="required">*</span></label>
      <p class="text-sm text-muted mb-1">Décrivez l'outil idéal pour vous, le résultat attendu et les fonctions envisagées.</p>
      <textarea class="form-control" id="f-objectif" rows="5" maxlength="10000" placeholder="Ex : Un outil qui automatise la saisie et génère automatiquement un rapport consolidé. Idéalement, il devrait permettre de… Les fonctions attendues sont : 1) … 2) … 3) …">${_data.objectif||''}</textarea>
      <div class="char-counter text-sm text-muted text-right mt-0"><span id="cc-objectif">${(_data.objectif||'').length}</span>/10000</div>
    </div>
    <div class="form-group"><label class="form-label">Commentaire (optionnel)</label>
      <textarea class="form-control" id="f-commentaire" rows="2" maxlength="10000" placeholder="Toute information complémentaire…">${_data.commentaire||''}</textarea></div>
    <div class="form-grid form-grid-2">
      <div class="form-group"><label class="form-label">Disponibilité</label>
        <select class="form-control" id="f-dispo">
          <option value="immediate" ${_data.disponibilite==='immediate'?'selected':''}>Immédiate</option>
          <option value="date" ${_data.disponibilite==='date'?'selected':''}>À une date précise</option>
        </select></div>
      <div class="form-group" id="f-date-wrap" style="${_data.disponibilite==='date'?'':'display:none'}">
        <label class="form-label">Date souhaitée</label>
        <input class="form-control" type="date" id="f-date" value="${_data.date_disponibilite||''}"></div>
    </div>
    <div class="form-group">
      <label class="form-label">
        Priorité souhaitée
        <span class="info-tip" title="Indiquez la priorité de votre point de vue. L'équipe d'évaluation détermine séparément la priorité finale." style="cursor:help;margin-left:6px;color:var(--blue)">ℹ️</span>
      </label>
      <select class="form-control" id="f-priorite">
        <option value="" ${!priorite?'selected':''}>— Sélectionnez —</option>
        <option value="Faible" ${priorite==='Faible'?'selected':''}>Faible</option>
        <option value="Moyenne" ${priorite==='Moyenne'?'selected':''}>Moyenne</option>
        <option value="Élevée" ${priorite==='Élevée'?'selected':''}>Élevée</option>
      </select>
      <div class="text-sm text-muted mt-1">ℹ️ Indiquez la priorité de votre point de vue. L'équipe d'évaluation détermine séparément la priorité finale.</div>
    </div>
    <div class="form-group" id="f-justif-wrap" style="${showJustif?'':'display:none'}">
      <label class="form-label">${justifLabel}</label>
      <textarea class="form-control" id="f-justif-priorite" rows="3" maxlength="10000" placeholder="${justifPlaceholder}">${_data.justif_priorite||''}</textarea>
    </div>
    <div class="flex justify-between mt-2">
      <button class="btn btn-ghost" id="btn-prev">← Retour</button>
      <button class="btn btn-primary" id="btn-next">Suivant →</button>
    </div>`;
  }

  /* ─────────────── ÉTAPE 3 — DONNÉES ─────────────── */
  if (_step === STEP_DONNEES) {
    const typesDonnees = ['PDF','Tableurs','Bases de données','Images','Audio ou documents numérisés','Document Office','Code informatique','Systèmes'];
    const selectedTypes = _data.types_donnees || [];
    const showSystemes = selectedTypes.includes('Systèmes');
    const selectedSystemes = _data.systemes_selectionnes || [];

    const typesCheckboxes = typesDonnees.map(td => `
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer;">
        <input type="checkbox" class="cb-type-donnee" value="${td}" ${selectedTypes.includes(td)?'checked':''}> ${td}
      </label>`).join('');

    const systemesOptions = SYSTEMES_OPTIONS.map(s =>
      `<option value="${s}" ${selectedSystemes.includes(s)?'selected':''}>${s}</option>`
    ).join('');

    return `
    <div class="alert alert-info mb-2">ℹ️ Cette section est facultative, sauf indication contraire. Renseignez les informations disponibles sur vos données.</div>

    <div class="form-group">
      <label class="form-label">Type des données d'entrée <span class="required">*</span></label>
      <p class="text-sm text-muted mb-1">Sélectionnez un ou plusieurs types de données que l'outil devra traiter.</p>
      <div style="border:1px solid var(--border);border-radius:8px;padding:12px;background:var(--gray-light);">
        ${typesCheckboxes}
      </div>
    </div>

    <div class="form-group" id="f-systemes-wrap" style="${showSystemes?'':'display:none'}">
      <label class="form-label">Systèmes concernés</label>
      <select class="form-control" id="f-systemes" multiple size="6">
        ${systemesOptions}
      </select>
      <div class="text-sm text-muted mt-1">Maintenez Ctrl (ou Cmd) pour sélectionner plusieurs systèmes.</div>
    </div>

    <div class="form-grid form-grid-2">
      <div class="form-group">
        <label class="form-label">Respect RGPD</label>
        <select class="form-control" id="f-rgpd">
          <option value="" ${!_data.rgpd?'selected':''}>— Sélectionnez —</option>
          <option value="Oui" ${_data.rgpd==='Oui'?'selected':''}>Oui</option>
          <option value="Non" ${_data.rgpd==='Non'?'selected':''}>Non</option>
          <option value="Pas encore connu" ${_data.rgpd==='Pas encore connu'?'selected':''}>Pas encore connu</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Disponibilité des données <span class="required">*</span></label>
        <select class="form-control" id="f-dispo-donnees">
          <option value="" ${!_data.dispo_donnees?'selected':''}>— Sélectionnez —</option>
          <option value="Oui" ${_data.dispo_donnees==='Oui'?'selected':''}>Oui</option>
          <option value="Non" ${_data.dispo_donnees==='Non'?'selected':''}>Non</option>
          <option value="Pas encore connu" ${_data.dispo_donnees==='Pas encore connu'?'selected':''}>Pas encore connu</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Sources des données</label>
      <textarea class="form-control" id="f-sources-donnees" rows="3" maxlength="10000"
        placeholder="Indiquez les systèmes, espaces documentaires, documents ou autres sources contenant les informations nécessaires…">${_data.sources_donnees||''}</textarea>
    </div>

    <div class="form-group">
      <label class="form-label">Niveau de confidentialité des données <span class="required">*</span></label>
      <p class="text-sm text-muted mb-1">Indiquez si des informations confidentielles concernant l'entreprise, ses clients, ses fournisseurs ou ses projets seraient utilisées.</p>
      <select class="form-control" id="f-confidentialite">
        <option value="" ${!_data.confidentialite?'selected':''}>— Sélectionnez —</option>
        <option value="Oui" ${_data.confidentialite==='Oui'?'selected':''}>Oui</option>
        <option value="Non" ${_data.confidentialite==='Non'?'selected':''}>Non</option>
        <option value="Pas encore connu" ${_data.confidentialite==='Pas encore connu'?'selected':''}>Pas encore connu</option>
      </select>
    </div>

    <div class="form-group">
      <label class="form-label">Besoin d'un accès à des données externes</label>
      <select class="form-control" id="f-donnees-externes">
        <option value="" ${!_data.donnees_externes?'selected':''}>— Sélectionnez —</option>
        <option value="Oui" ${_data.donnees_externes==='Oui'?'selected':''}>Oui</option>
        <option value="Non" ${_data.donnees_externes==='Non'?'selected':''}>Non</option>
        <option value="Pas encore connu" ${_data.donnees_externes==='Pas encore connu'?'selected':''}>Pas encore connu</option>
      </select>
    </div>

    <div class="form-group" id="f-details-externes-wrap" style="${_data.donnees_externes==='Oui'?'':'display:none'}">
      <label class="form-label">Précisez les données externes nécessaires</label>
      <textarea class="form-control" id="f-details-externes" rows="3" maxlength="10000"
        placeholder="Décrivez les sources de données externes (API publiques, bases de données tierces, flux de données…)">${_data.details_externes||''}</textarea>
    </div>

    <div class="flex justify-between mt-2">
      <button class="btn btn-ghost" id="btn-prev">← Retour</button>
      <button class="btn btn-primary" id="btn-next">Suivant →</button>
    </div>`;
  }

  /* ─────────────── ÉTAPE 4 — ROI ─────────────── */
  if (_step === STEP_ROI) {
    const benefice = _data.benefice_attendu || '';
    const showAutreBenefice = benefice === 'Autre';

    return `
    <div class="alert alert-info mb-2">ℹ️ Ces informations permettent d'estimer la valeur ajoutée de votre besoin. Tous les champs sont obligatoires.</div>
    <div class="form-group">
      <label class="form-label">Bénéfice attendu <span class="required">*</span></label>
      <select class="form-control" id="f-benefice">
        <option value="" ${!benefice?'selected':''}>— Sélectionnez —</option>
        ${['Gain de temps','Réduction des coûts','Amélioration de la qualité','Aide à la décision','Réduction des risques','Autre'].map(b =>
          `<option value="${b}" ${benefice===b?'selected':''}>${b}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" id="f-autre-benefice-wrap" style="${showAutreBenefice?'':'display:none'}">
      <label class="form-label">Précisez le bénéfice attendu <span class="required">*</span></label>
      <textarea class="form-control" id="f-autre-benefice" rows="2" maxlength="10000"
        placeholder="Décrivez le bénéfice attendu…">${_data.autre_benefice||''}</textarea>
    </div>
    <div class="form-grid form-grid-2">
      <div class="form-group"><label class="form-label">Temps actuel consacré <span class="required">*</span></label>
        <input class="form-control" type="number" id="f-temps" value="${_data.temps_actuel||''}" placeholder="Ex: 4" min="0"></div>
      <div class="form-group"><label class="form-label">Unité de temps <span class="required">*</span></label>
        <select class="form-control" id="f-unite">
          ${['heure','jour','semaine','mois','année'].map(u=>`<option ${_data.unite_temps===u?'selected':''}>${u}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Nombre de personnes impliquées <span class="required">*</span></label>
        <input class="form-control" type="number" id="f-nb" value="${_data.nombre_personnes||''}" min="1" placeholder="Ex: 3"></div>
      <div class="form-group"><label class="form-label">Volume annuel (occurrences) <span class="required">*</span></label>
        <input class="form-control" type="number" id="f-vol" value="${_data.volume_annuel||''}" min="0" placeholder="Ex: 52"></div>
    </div>
    <div class="form-group">
      <label class="form-label">Gain estimé apporté par l'outil <span class="required">*</span></label>
      <p class="text-sm text-muted mb-1">Estimez le gain que l'outil pourrait vous apporter (temps économisé, réduction d'erreurs, économies…)</p>
      <textarea class="form-control" id="f-gain-outil" rows="3" maxlength="10000"
        placeholder="Ex : L'outil permettrait d'économiser 3h par semaine par personne, soit environ 150 jours/an sur l'équipe…">${_data.gain_outil||''}</textarea>
    </div>
    <div id="roi-preview"></div>
    <div class="flex justify-between mt-2">
      <button class="btn btn-ghost" id="btn-prev">← Retour</button>
      <button class="btn btn-primary" id="btn-next">Analyser avec l'IA →</button>
    </div>`;
  }

  /* ─────────────── ÉTAPE 5 — ANALYSE IA ─────────────── */
  if (_step === STEP_AI) return `
    <div class="text-center" id="ai-loading">
      <div class="spinner" style="width:36px;height:36px;margin:24px auto 12px;"></div>
      <div class="text-muted">Analyse en cours…</div>
    </div>
    <div id="ai-result" style="display:none"></div>
    <div class="flex justify-between mt-2" id="ai-nav" style="display:none">
      <button class="btn btn-ghost" id="btn-prev">← Retour</button>
      <button class="btn btn-primary" id="btn-next">Confirmer et soumettre →</button>
    </div>`;

  /* ─────────────── ÉTAPE 6 — CONFIRMATION ─────────────── */
  if (_step === STEP_CONFIRM) return `
    <div class="alert alert-success mb-2">✅ Votre demande a bien été enregistrée !</div>
    <div class="card" style="background:var(--gray-light);border:none;">
      <div><strong>Référence :</strong> <span class="cu-id-tag">${_data.dem_id||'—'}</span></div>
      ${_data.titre_ia ? `<div class="mt-1"><strong>Titre (IA) :</strong> ${_data.titre_ia}</div>` : ''}
      <div class="mt-1"><strong>Demandeur :</strong> ${_data.prenom} ${_data.nom} — ${_data.direction}</div>
      ${_data.entite ? `<div class="mt-1"><strong>Entité :</strong> ${_data.entite==='FR'?'🇫🇷 KNDS France':'🇩🇪 KNDS Allemagne'}</div>` : ''}
      <div class="mt-1"><strong>Objectif :</strong> ${_data.objectif}</div>
      ${_data.priorite ? `<div class="mt-1"><strong>Priorité souhaitée :</strong> ${_data.priorite}</div>` : ''}
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

    if (_step === STEP_AI) await _runAI(container);
  });

  // Dispo toggle
  stepEl.querySelector('#f-dispo')?.addEventListener('change', e => {
    const wrap = stepEl.querySelector('#f-date-wrap');
    if (wrap) wrap.style.display = e.target.value === 'date' ? '' : 'none';
  });

  // Priorité toggle justification
  stepEl.querySelector('#f-priorite')?.addEventListener('change', e => {
    const val = e.target.value;
    const wrap = stepEl.querySelector('#f-justif-wrap');
    const label = wrap?.querySelector('label');
    const ta = wrap?.querySelector('#f-justif-priorite');
    if (wrap) {
      wrap.style.display = (val && val !== 'Faible') ? '' : 'none';
      if (label) {
        if (val === 'Élevée') {
          label.innerHTML = 'Justification de la priorité élevée <span class="required">*</span>';
        } else {
          label.innerHTML = 'Justification de la priorité';
        }
      }
      if (ta) {
        ta.placeholder = val === 'Élevée'
          ? 'Précisez le caractère d\'urgence, les échéances ou les raisons métiers justifiant cette priorité élevée…'
          : 'Précisez les raisons justifiant la priorité choisie…';
      }
    }
  });

  // Character counters
  ['contexte','objectif'].forEach(id => {
    const ta = stepEl.querySelector(`#f-${id}`);
    const counter = stepEl.querySelector(`#cc-${id}`);
    if (ta && counter) {
      ta.addEventListener('input', () => { counter.textContent = ta.value.length; });
    }
  });

  // Types de données — toggle systèmes
  stepEl.querySelectorAll('.cb-type-donnee').forEach(cb => {
    cb.addEventListener('change', () => {
      const anySysteme = [...stepEl.querySelectorAll('.cb-type-donnee')]
        .some(c => c.value === 'Systèmes' && c.checked);
      const wrap = stepEl.querySelector('#f-systemes-wrap');
      if (wrap) wrap.style.display = anySysteme ? '' : 'none';
    });
  });

  // Données externes toggle
  stepEl.querySelector('#f-donnees-externes')?.addEventListener('change', e => {
    const wrap = stepEl.querySelector('#f-details-externes-wrap');
    if (wrap) wrap.style.display = e.target.value === 'Oui' ? '' : 'none';
  });

  // Bénéfice "Autre" toggle
  stepEl.querySelector('#f-benefice')?.addEventListener('change', e => {
    const wrap = stepEl.querySelector('#f-autre-benefice-wrap');
    if (wrap) wrap.style.display = e.target.value === 'Autre' ? '' : 'none';
  });

  // ROI preview
  if (_step === STEP_ROI) {
    const update = () => {
      const tVal = parseFloat(stepEl.querySelector('#f-temps')?.value) || 0;
      const nVal = parseInt(stepEl.querySelector('#f-nb')?.value) || 0;
      const vVal = parseInt(stepEl.querySelector('#f-vol')?.value) || 0;
      const roi = tVal * nVal * vVal;
      const prev = stepEl.querySelector('#roi-preview');
      if (prev && roi > 0) {
        const unite = stepEl.querySelector('#f-unite')?.value || 'heure';
        prev.innerHTML = `<div class="roi-display mt-1">
          <div class="roi-value">${roi.toLocaleString('fr-FR')}</div>
          <div class="roi-label">${unite}s estimées libérées / an</div>
        </div>`;
        _data.roi_estime = roi;
      } else if (prev) prev.innerHTML = '';
    };
    ['#f-temps','#f-nb','#f-vol','#f-unite'].forEach(id => {
      stepEl.querySelector(id)?.addEventListener('input', update);
      stepEl.querySelector(id)?.addEventListener('change', update);
    });
  }
}

function _validateStep(stepEl) {
  if (_step === STEP_IDENTITE) {
    const nom    = stepEl.querySelector('#f-nom')?.value.trim();
    const prenom = stepEl.querySelector('#f-prenom')?.value.trim();
    const email  = stepEl.querySelector('#f-email')?.value.trim();
    const dir    = stepEl.querySelector('#f-direction')?.value.trim();
    if (!nom || !prenom || !email || !dir) {
      toast('Veuillez remplir tous les champs obligatoires.', 'danger'); return false;
    }
    const bilingual = getSetting('bilingual_mode', 'false') === 'true';
    if (bilingual && !stepEl.querySelector('#f-entite')?.value) {
      toast('Veuillez sélectionner votre entité.', 'danger'); return false;
    }
  }

  if (_step === STEP_BESOIN) {
    const ctx = stepEl.querySelector('#f-contexte')?.value.trim();
    const obj = stepEl.querySelector('#f-objectif')?.value.trim();
    if (!ctx || !obj) {
      toast('Contexte et objectif sont obligatoires.', 'danger'); return false;
    }
    const priorite = stepEl.querySelector('#f-priorite')?.value;
    if (priorite === 'Élevée') {
      const justif = stepEl.querySelector('#f-justif-priorite')?.value.trim();
      if (!justif) {
        toast('Veuillez justifier la priorité élevée.', 'danger'); return false;
      }
    }
  }

  if (_step === STEP_DONNEES) {
    const selectedTypes = [...stepEl.querySelectorAll('.cb-type-donnee:checked')].map(c => c.value);
    if (selectedTypes.length === 0) {
      toast('Veuillez sélectionner au moins un type de données d\'entrée.', 'danger'); return false;
    }
    const dispoDonnees = stepEl.querySelector('#f-dispo-donnees')?.value;
    if (!dispoDonnees) {
      toast('Veuillez indiquer la disponibilité des données.', 'danger'); return false;
    }
    const confidentialite = stepEl.querySelector('#f-confidentialite')?.value;
    if (!confidentialite) {
      toast('Veuillez indiquer le niveau de confidentialité des données.', 'danger'); return false;
    }
  }

  if (_step === STEP_ROI) {
    const temps = stepEl.querySelector('#f-temps')?.value;
    const nb    = stepEl.querySelector('#f-nb')?.value;
    const vol   = stepEl.querySelector('#f-vol')?.value;
    const gain  = stepEl.querySelector('#f-gain-outil')?.value.trim();
    const ben   = stepEl.querySelector('#f-benefice')?.value;
    if (!ben) {
      toast('Veuillez sélectionner un bénéfice attendu.', 'danger'); return false;
    }
    if (ben === 'Autre' && !stepEl.querySelector('#f-autre-benefice')?.value.trim()) {
      toast('Veuillez préciser le bénéfice attendu.', 'danger'); return false;
    }
    if (!temps || !nb || !vol) {
      toast('Veuillez renseigner le temps actuel, le nombre de personnes et le volume annuel.', 'danger'); return false;
    }
    if (!gain) {
      toast('Veuillez décrire le gain estimé que l\'outil pourrait apporter.', 'danger'); return false;
    }
  }

  return true;
}

function _collectStep(stepEl) {
  if (_step === STEP_IDENTITE) {
    _data.nom       = stepEl.querySelector('#f-nom')?.value.trim();
    _data.prenom    = stepEl.querySelector('#f-prenom')?.value.trim();
    _data.email     = stepEl.querySelector('#f-email')?.value.trim();
    _data.direction = stepEl.querySelector('#f-direction')?.value.trim();
    _data.entite    = stepEl.querySelector('#f-entite')?.value || null;
  }

  if (_step === STEP_BESOIN) {
    _data.contexte           = stepEl.querySelector('#f-contexte')?.value.trim();
    _data.objectif           = stepEl.querySelector('#f-objectif')?.value.trim();
    _data.commentaire        = stepEl.querySelector('#f-commentaire')?.value.trim();
    _data.disponibilite      = stepEl.querySelector('#f-dispo')?.value;
    _data.date_disponibilite = stepEl.querySelector('#f-date')?.value || null;
    _data.priorite           = stepEl.querySelector('#f-priorite')?.value || null;
    _data.justif_priorite    = stepEl.querySelector('#f-justif-priorite')?.value.trim() || null;
  }

  if (_step === STEP_DONNEES) {
    _data.types_donnees        = [...stepEl.querySelectorAll('.cb-type-donnee:checked')].map(c => c.value);
    _data.systemes_selectionnes = [...(stepEl.querySelector('#f-systemes')?.selectedOptions || [])].map(o => o.value);
    _data.rgpd                 = stepEl.querySelector('#f-rgpd')?.value || null;
    _data.dispo_donnees        = stepEl.querySelector('#f-dispo-donnees')?.value || null;
    _data.sources_donnees      = stepEl.querySelector('#f-sources-donnees')?.value.trim() || null;
    _data.confidentialite      = stepEl.querySelector('#f-confidentialite')?.value || null;
    _data.donnees_externes     = stepEl.querySelector('#f-donnees-externes')?.value || null;
    _data.details_externes     = stepEl.querySelector('#f-details-externes')?.value.trim() || null;
  }

  if (_step === STEP_ROI) {
    _data.benefice_attendu  = stepEl.querySelector('#f-benefice')?.value || null;
    _data.autre_benefice    = stepEl.querySelector('#f-autre-benefice')?.value.trim() || null;
    _data.temps_actuel      = parseFloat(stepEl.querySelector('#f-temps')?.value) || null;
    _data.unite_temps       = stepEl.querySelector('#f-unite')?.value;
    _data.nombre_personnes  = parseInt(stepEl.querySelector('#f-nb')?.value) || null;
    _data.volume_annuel     = parseInt(stepEl.querySelector('#f-vol')?.value) || null;
    _data.gain_outil        = stepEl.querySelector('#f-gain-outil')?.value.trim() || null;
  }
}

async function _runAI(container) {
  const resultEl  = container.querySelector('#ai-result');
  const loadingEl = container.querySelector('#ai-loading');
  const navEl     = container.querySelector('#ai-nav');

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

  // Generate title from AI first
  let titreIA = null;
  try {
    const titrePrompt = `Tu es un expert en transformation digitale. À partir des informations suivantes sur un besoin utilisateur, génère un titre court, clair et informatif (entre 5 et 12 mots maximum) qui résume l'idée. Réponds UNIQUEMENT avec le titre, sans guillemets, sans explication.\n\nDirection : ${_data.direction}\nContexte : ${_data.contexte}\nObjectif : ${_data.objectif}`;
    const { ok: tOk, text: tText } = await callAI(
      'Tu génères des titres courts et percutants pour des projets d\'innovation interne. Réponds UNIQUEMENT avec le titre demandé, sans ponctuation superflue.',
      titrePrompt,
      { temperature: 0.4, max_tokens: 60 }
    );
    if (tOk && tText) titreIA = tText.trim().replace(/^["«»"]+|["«»"]+$/g, '');
  } catch(e) { /* non-blocking */ }

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
  _data.titre_ia        = titreIA;
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
    container.querySelector('#btn-next').disabled = true;
  }

  if (resultEl) {
    resultEl.style.display = '';
    resultEl.innerHTML = `
      <div class="alert alert-success mb-2">✅ Analyse IA terminée</div>
      ${titreIA ? `<div class="card mb-2" style="background:var(--blue-light,#eef3ff);border:1px solid var(--blue,#3b82f6);border-radius:8px;padding:12px 16px;">
        <div class="text-sm text-muted mb-1" style="font-weight:600;text-transform:uppercase;letter-spacing:.05em">Titre suggéré par l'IA</div>
        <div style="font-size:16px;font-weight:700;color:var(--blue,#3b82f6)">💡 ${titreIA}</div>
      </div>` : ''}
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
  const pays   = _data.entite || null;
  const dem_id = nextDemId(pays);
  _data.dem_id = dem_id;

  // Serialize array fields
  const typesDonneesJSON   = _data.types_donnees?.length ? JSON.stringify(_data.types_donnees) : null;
  const systemesJSON       = _data.systemes_selectionnes?.length ? JSON.stringify(_data.systemes_selectionnes) : null;

  run(`INSERT INTO requests
    (dem_id,nom,prenom,email,direction,entite,contexte,objectif,commentaire,
     temps_actuel,unite_temps,nombre_personnes,volume_annuel,roi_estime,
     disponibilite,date_disponibilite,type_besoin_ia,technologie_ia,analyse_ia,
     similar_cases,has_similarities,similarity_acknowledged,statut)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'À analyser')`,
    [
      dem_id, _data.nom, _data.prenom, _data.email, _data.direction, pays,
      _data.contexte, _data.objectif, _data.commentaire||null,
      _data.temps_actuel||null, _data.unite_temps||null,
      _data.nombre_personnes||null, _data.volume_annuel||null, _data.roi_estime||null,
      _data.disponibilite||'immediate', _data.date_disponibilite||null,
      _data.type_besoin_ia||null, _data.technologie_ia||null, _data.analyse_ia||null,
      JSON.stringify(_data.similar_cases||null), _data.has_similarities?1:0,
      _data.similarity_acknowledged?1:0,
    ]
  );

  // Store extended fields in commentaire as a supplement (JSON appended) if columns not yet migrated
  // This avoids DB schema changes while preserving data
  try {
    const extras = {
      titre_ia: _data.titre_ia||null,
      priorite: _data.priorite||null,
      justif_priorite: _data.justif_priorite||null,
      types_donnees: _data.types_donnees||null,
      systemes_selectionnes: _data.systemes_selectionnes||null,
      rgpd: _data.rgpd||null,
      dispo_donnees: _data.dispo_donnees||null,
      sources_donnees: _data.sources_donnees||null,
      confidentialite: _data.confidentialite||null,
      donnees_externes: _data.donnees_externes||null,
      details_externes: _data.details_externes||null,
      benefice_attendu: _data.benefice_attendu||null,
      autre_benefice: _data.autre_benefice||null,
      gain_outil: _data.gain_outil||null,
    };
    run(`UPDATE requests SET commentaire = ? WHERE dem_id = ?`, [
      JSON.stringify(extras),
      dem_id
    ]);
  } catch(e) { console.warn('[saveRequest] extras:', e.message); }

  saveDB();
}

// Make renderDemande globally accessible for inline onclick
window.renderDemande = renderDemande;
