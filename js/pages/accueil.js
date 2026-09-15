import { queryOne, query, getSetting } from '../modules/db.js';
import { kpiGrid, statusBadge, formatDate, formatROI, truncate, sectionTitle, chip } from '../modules/ui.js';
import { navigate } from '../app.js';
import { isAdmin } from '../modules/auth.js';

export function renderAccueil(container) {
  const kpi = queryOne(`
    SELECT
      COUNT(*) FILTER (WHERE statut != 'Abandonné') AS total,
      COUNT(*) FILTER (WHERE statut = 'Production') AS production,
      COUNT(*) FILTER (WHERE statut = 'POC') AS poc,
      COUNT(*) FILTER (WHERE statut = 'Cadrage') AS cadrage,
      COUNT(*) FILTER (WHERE statut = 'En développement') AS en_dev,
      COUNT(*) FILTER (WHERE statut = 'Besoin identifié') AS backlog,
      COALESCE(SUM(CASE WHEN statut='Production' THEN roi_annuel ELSE 0 END), 0) AS roi_total,
      COUNT(*) FILTER (WHERE application_disponible=1) AS apps
    FROM use_cases WHERE actif=1
  `) || {};

  const recent = query(`SELECT * FROM use_cases WHERE actif=1 AND statut != 'Abandonné' ORDER BY date_creation DESC LIMIT 6`);
  const apps   = query(`SELECT * FROM use_cases WHERE actif=1 AND statut='Production' AND application_disponible=1 ORDER BY date_creation DESC LIMIT 3`);
  const appName = getSetting('app_name', 'Référentiel des cas d\'usage');
  const roi_total = parseFloat(kpi.roi_total || 0);
  const admin = isAdmin();

  const kpiItems = [
    { icon:'📋', label:"Cas d'usage total",  value: kpi.total||0,      cls:'accent' },
    { icon:'🚀', label:'En production',       value: kpi.production||0,  cls:'success' },
    { icon:'🧪', label:'En POC',              value: kpi.poc||0,         cls:'warning' },
    { icon:'📝', label:'En cadrage',          value: kpi.cadrage||0,     cls:'info' },
  ];
  if (admin) kpiItems.push({ icon:'💶', label:'ROI total production', value: formatROI(roi_total), cls:'success' });

  container.innerHTML = `
    <div class="hero">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1>📚 ${appName}</h1>
          <p>Retrouvez les besoins identifiés, étudiés et réalisés par notre équipe.</p>
        </div>
        <div style="text-align:right;color:white;">
          <div style="font-size:2.5rem;font-weight:800;">${kpi.total||0}</div>
          <div style="font-size:12px;color:#90b8d8;">cas d'usage</div>
        </div>
      </div>
    </div>

    ${kpiGrid(kpiItems)}

    <div style="display:grid;grid-template-columns:3fr 2fr;gap:20px;flex-wrap:wrap;">
      <div>
        ${sectionTitle('🆕', 'Derniers cas d\'usage')}
        ${_cuTable(recent)}
        <button class="btn btn-outline btn-sm mt-2" onclick="navigate('catalogue')">Voir tout le catalogue →</button>
      </div>
      <div>
        ${sectionTitle('🚀', 'Applications disponibles')}
        ${_appCards(apps)}
        <button class="btn btn-outline btn-sm mt-2" onclick="navigate('applications')">Toutes les applications →</button>
      </div>
    </div>
  `;
}

function _cuTable(rows) {
  if (!rows.length) return `<div class="empty-state"><div class="empty-icon">📭</div><div>Aucun cas d'usage</div></div>`;
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>ID</th><th>Nom</th><th>Statut</th><th>Techno</th><th>Date</th>
        </tr></thead>
        <tbody>
          ${rows.map(cu => `<tr style="cursor:pointer" onclick="navigate('catalogue',{cu_id:'${cu.cu_id}'})">
            <td class="cu-id">${cu.cu_id}</td>
            <td class="cu-name">${truncate(cu.nom, 40)}</td>
            <td>${statusBadge(cu.statut)}</td>
            <td>${chip(cu.technologie,'tech')}</td>
            <td class="text-muted text-sm">${formatDate(cu.date_creation)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function _appCards(apps) {
  if (!apps.length) return `<div class="text-muted text-sm" style="padding:16px;">Aucune application disponible pour l'instant.</div>`;
  return apps.map(app => `
    <div class="card mb-2" style="padding:14px;">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <div style="font-size:1.5rem;">🚀</div>
        <div>
          <div style="font-weight:700;color:var(--blue-dark);font-size:13px;">${app.nom}</div>
          <div class="text-muted text-sm mt-1">${truncate(app.description,80)}</div>
          ${app.application_url ? `<a href="${app.application_url}" target="_blank" class="btn btn-primary btn-sm mt-2">Accéder →</a>` : ''}
        </div>
      </div>
    </div>`).join('');
}
