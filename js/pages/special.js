/**
 * Onglet Spécial — affiche les CU « Spécial » du pays configuré dans
 * Paramètres généraux (« Pays de cette instance »). Si le mode spécial est
 * désactivé ou si aucun pays n'est configuré, rien n'est affiché.
 */
import { query, getSetting } from '../modules/db.js';
import { statusBadge, formatDate, truncate, chip, emptyState } from '../modules/ui.js';
import { t } from '../modules/i18n.js';

export function renderSpecial(container) {
  const bilingual = getSetting('bilingual_mode', 'false') === 'true';
  const pays      = getSetting('pays_admin', '');

  if (!bilingual || !pays) { container.innerHTML = ''; return; }

  const label = getSetting('special_tab_label', '')
    || (pays === 'DE' ? getSetting('special_tab_de', 'Spécial Allemagne') : getSetting('special_tab_fr', 'Spécial France'));
  const flag  = pays === 'DE' ? '🇩🇪' : '🇫🇷';
  const desc  = pays === 'DE'
    ? 'Use Cases spezifisch für KNDS Deutschland.'
    : 'Cas d\'usage spécifiques à KNDS France.';

  const rows = query(`SELECT * FROM use_cases WHERE actif=1 AND visibilite=? ORDER BY date_creation DESC`, [pays]);

  const table = !rows.length ? emptyState('🔍', t('catalogue.empty'), '') : `<div class="table-wrap">
    <table class="data-table">
      <thead><tr>
        <th>${t('catalogue.col.id')}</th><th>${t('catalogue.col.name')}</th><th>${t('catalogue.col.status')}</th>
        <th>${t('catalogue.col.type')}</th><th>${t('catalogue.col.tech')}</th><th>${t('catalogue.col.resp')}</th><th>${t('catalogue.col.date')}</th>
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

  container.innerHTML = `
    <div class="hero" style="padding:18px 24px;">
      <h1>${flag} ${label}</h1>
      <p style="color:#90b8d8;font-size:13px;">${desc}</p>
    </div>
    <div style="padding:0 24px 24px;">${table}</div>`;
}
