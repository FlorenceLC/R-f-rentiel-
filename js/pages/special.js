/**
 * Onglet Spécial FR / Spécial DE
 * Affiche les CU marqués visibilite='FR' ou visibilite='DE'
 * selon le pays de l'utilisateur connecté.
 * Les admins voient les deux (avec onglets de filtre).
 */
import { query, getSetting }          from '../modules/db.js';
import { isAdmin, getUserPays }        from '../modules/auth.js';
import { statusBadge, formatDate, truncate, chip, emptyState } from '../modules/ui.js';
import { t, originLabel }             from '../modules/i18n.js';
import { navigate }                   from '../app.js';

export function renderSpecial(container) {
  const bilingual = getSetting('bilingual_mode', 'false') === 'true';
  const admin     = isAdmin();
  const userPays  = getUserPays(); // 'FR' | 'DE' | null

  // Determine which visibilities to show
  // Admin sees both tabs; visitors see only their country
  let targetVis = userPays; // null means no filter (admin toggle will handle it)

  const labelFR = getSetting('special_tab_fr', 'Spécial France');
  const labelDE = getSetting('special_tab_de', 'Spécial Allemagne');

  if (!bilingual) {
    container.innerHTML = `<div class="hero"><h1>🌍 ${t('nav.special')}</h1></div>
      <div class="card"><p>Le mode bilingue FR/DE n'est pas activé. Configurez-le dans <strong>Paramètres généraux</strong>.</p></div>`;
    return;
  }

  // For non-admin visitors with no country: show message
  if (!admin && !userPays) {
    container.innerHTML = `<div class="hero"><h1>🌍 ${t('nav.special')}</h1></div>
      <div class="card"><p>Aucun pays n'est associé à votre compte. Contactez un administrateur.</p></div>`;
    return;
  }

  // State: which tab is active (for admin)
  let activeTab = admin ? (userPays || 'FR') : userPays;

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

  function _build() {
    const cntFR = _rows('FR').length;
    const cntDE = _rows('DE').length;

    const tabs = admin ? `
      <div class="tab-bar" style="margin-bottom:16px;">
        <button class="tab-btn ${activeTab==='FR'?'active':''}" data-vis="FR">
          🇫🇷 ${labelFR} <span class="nav-badge" style="background:#e53e3e">${cntFR}</span>
        </button>
        <button class="tab-btn ${activeTab==='DE'?'active':''}" data-vis="DE">
          🇩🇪 ${labelDE} <span class="nav-badge" style="background:#2b6cb0">${cntDE}</span>
        </button>
      </div>` : '';

    const flag  = activeTab === 'FR' ? '🇫🇷' : '🇩🇪';
    const label = activeTab === 'FR' ? labelFR : labelDE;

    container.innerHTML = `
      <div class="hero" style="padding:18px 24px;">
        <h1>${flag} ${label}</h1>
        <p style="color:#90b8d8;font-size:13px;">
          ${activeTab==='FR'
            ? 'Cas d\'usage spécifiques à KNDS France.'
            : 'Use Cases spezifisch für KNDS Deutschland.'}
        </p>
      </div>
      <div style="padding:0 24px 24px;">
        ${tabs}
        ${_renderTable(activeTab)}
      </div>
    `;

    // Tab switch (admin only)
    container.querySelectorAll('.tab-btn[data-vis]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.vis;
        _build();
      });
    });
  }

  _build();
}
