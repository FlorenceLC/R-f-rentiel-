/**
 * Onglet Spécial — affiche uniquement les CU du pays configuré dans les paramètres admin.
 * Le paramètre "pays_admin" (FR | DE) détermine quelle vue afficher.
 * Les admins voient les CU du pays configuré. S'il n'y a pas de pays configuré,
 * affichage des deux onglets comme fallback.
 * Les visiteurs ne voient que leur propre pays (pays lié à leur compte).
 */
import { query, getSetting }          from '../modules/db.js';
import { isAdmin, getUserPays }        from '../modules/auth.js';
import { statusBadge, formatDate, truncate, chip, emptyState } from '../modules/ui.js';
import { t, originLabel }             from '../modules/i18n.js';
import { navigate }                   from '../app.js';

export function renderSpecial(container) {
  const bilingual  = getSetting('bilingual_mode', 'false') === 'true';
  const admin      = isAdmin();
  const userPays   = getUserPays();
  const paysAdmin  = getSetting('pays_admin', ''); // FR | DE | ''

  const labelFR = getSetting('special_tab_fr', 'Spécial France');
  const labelDE = getSetting('special_tab_de', 'Spécial Allemagne');

  if (!bilingual) {
    container.innerHTML = `<div class="hero"><h1>🌍 ${t('nav.special')}</h1></div>
      <div class="card"><p>Le mode bilingue FR/DE n'est pas activé. Configurez-le dans <strong>Paramètres généraux</strong>.</p></div>`;
    return;
  }

  // Determine which country tab to show
  // Priority: visitor's own pays > pays_admin setting > fallback both tabs for admin
  let targetVis;
  if (!admin) {
    // Visitor: must have a country
    if (!userPays) {
      container.innerHTML = `<div class="hero"><h1>🌍 ${t('nav.special')}</h1></div>
        <div class="card"><p>Aucun pays n'est associé à votre compte. Contactez un administrateur.</p></div>`;
      return;
    }
    targetVis = userPays;
  } else {
    // Admin: use pays_admin setting, fallback to both tabs if not set
    targetVis = paysAdmin || null;
  }

  function _rows(vis) {
    return query(`SELECT * FROM use_cases WHERE actif=1 AND visibilite=? ORDER BY date_creation DESC`, [vis]);
  }

  function _renderTable(vis) {
    const rows = _rows(vis);
    if (!rows.length) return emptyState('🔍', t('catalogue.empty'), '');
    return `<div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>${t('catalogue.col.id')}</th>
          <th>${t('catalogue.col.name')}</th>
          <th>${t('catalogue.col.status')}</th>
          <th>${t('catalogue.col.type')}</th>
          <th>${t('catalogue.col.tech')}</th>
          <th>${t('catalogue.col.resp')}</th>
          <th>${t('catalogue.col.date')}</th>
        </tr></thead>
        <tbody>
          ${rows.map(cu => `<tr style="cursor:pointer" onclick="navigate('catalogue',{cu_id:'${cu.cu_id}'})">
            <td class="cu-id">${cu.cu_id}</td>
            <td class="cu-name">${truncate(cu.nom, 50)}</td>
            <td>${statusBadge(cu.statut)}</td>
            <td>${chip(cu.type_besoin,'type')}</td>
            <td>${chip(cu.technologie,'tech')}</td>
            <td class="text-sm text-muted">${cu.responsable||'—'}</td>
            <td class="text-sm text-muted">${formatDate(cu.date_creation)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // Single-country mode (configured or visitor)
  if (targetVis) {
    const flag  = targetVis === 'FR' ? '🇫🇷' : '🇩🇪';
    const label = targetVis === 'FR' ? labelFR : labelDE;
    const desc  = targetVis === 'FR'
      ? 'Cas d\'usage spécifiques à KNDS France.'
      : 'Use Cases spezifisch für KNDS Deutschland.';

    container.innerHTML = `
      <div class="hero" style="padding:18px 24px;">
        <h1>${flag} ${label}</h1>
        <p style="color:#90b8d8;font-size:13px;">${desc}</p>
      </div>
      <div style="padding:0 24px 24px;">
        ${_renderTable(targetVis)}
      </div>`;
    return;
  }

  // Admin fallback: no pays_admin configured → show both tabs
  let activeTab = 'FR';

  function _build() {
    const cntFR = _rows('FR').length;
    const cntDE = _rows('DE').length;
    const flag  = activeTab === 'FR' ? '🇫🇷' : '🇩🇪';
    const label = activeTab === 'FR' ? labelFR : labelDE;
    const desc  = activeTab === 'FR'
      ? 'Cas d\'usage spécifiques à KNDS France.'
      : 'Use Cases spezifisch für KNDS Deutschland.';

    container.innerHTML = `
      <div class="hero" style="padding:18px 24px;">
        <h1>${flag} ${label}</h1>
        <p style="color:#90b8d8;font-size:13px;">${desc}</p>
        <p style="color:#f6ad55;font-size:12px;margin-top:4px;">
          ℹ️ Aucun pays n'est configuré dans les paramètres — affichage des deux.
          <a href="#" id="lnk-go-params" style="color:#f6ad55;text-decoration:underline;">Configurer →</a>
        </p>
      </div>
      <div style="padding:0 24px 24px;">
        <div class="tab-bar" style="margin-bottom:16px;">
          <button class="tab-btn ${activeTab==='FR'?'active':''}" data-vis="FR">
            🇫🇷 ${labelFR} <span class="nav-badge" style="background:#e53e3e">${cntFR}</span>
          </button>
          <button class="tab-btn ${activeTab==='DE'?'active':''}" data-vis="DE">
            🇩🇪 ${labelDE} <span class="nav-badge" style="background:#2b6cb0">${cntDE}</span>
          </button>
        </div>
        ${_renderTable(activeTab)}
      </div>`;

    container.querySelector('#lnk-go-params')?.addEventListener('click', e => {
      e.preventDefault();
      navigate('admin_params');
    });

    container.querySelectorAll('.tab-btn[data-vis]').forEach(btn => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.vis; _build(); });
    });
  }

  _build();
}
