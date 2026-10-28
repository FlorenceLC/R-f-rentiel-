/**
 * admin/analyse.js — Onglet Analyse ROI (admin uniquement)
 * Visualise le ROI par CU, par direction, par année, et le taux d'adoption des apps.
 * Utilise des graphiques SVG inline (pas de dépendance externe).
 */
import { query, queryOne } from '../modules/db.js';
import { mountRoiYearChart } from './roiChart.js';
import { splitDirs } from '../modules/roi.js';
import { formatROI, formatDate, statusBadge, chip, truncate } from '../modules/ui.js';

export function renderAdminAnalyse(container) {
  // ── Données ───────────────────────────────────────────────
  const cuRoi = query(`
    SELECT cu_id, nom, statut, roi_annuel, technologie, type_besoin,
           application_disponible, date_creation
    FROM use_cases
    WHERE actif=1 AND roi_annuel IS NOT NULL AND roi_annuel > 0 AND statut != 'Abandonné'
    ORDER BY roi_annuel DESC
    LIMIT 20
  `);

  const roiParStatut = query(`
    SELECT statut,
           COALESCE(SUM(roi_annuel),0) AS total,
           COUNT(*) AS nb
    FROM use_cases
    WHERE actif=1 AND statut != 'Abandonné'
    GROUP BY statut
    ORDER BY total DESC
  `);

  const adoption = query(`
    SELECT
      COUNT(*) FILTER (WHERE statut='Production' AND application_disponible=1) AS apps_dispo,
      COUNT(*) FILTER (WHERE statut='Production') AS en_prod,
      COUNT(*) FILTER (WHERE statut='Production' AND application_disponible=0) AS sans_app
    FROM use_cases WHERE actif=1
  `)[0] || {};

  // Direction(s) = colonne use_cases.direction (plusieurs séparées par « ; »).
  // Un CU multi-directions : ROI réparti à parts égales, 1 CU compté pour chaque direction.
  const cuAll = query(`
    SELECT cu_id, statut, direction, COALESCE(roi_annuel,0) AS roi, date_creation
    FROM use_cases WHERE actif=1 AND statut != 'Abandonné'
  `);
  const dirMap = {};
  const sansDir = [];
  cuAll.forEach(cu => {
    const ds = splitDirs(cu.direction);
    if (!ds.length) { sansDir.push(cu); return; }
    ds.forEach(d => { dirMap[d] ??= { dir: d, total: 0, nb: 0 }; dirMap[d].total += cu.roi / ds.length; dirMap[d].nb += 1; });
  });
  const roiParDir = Object.values(dirMap).sort((a, b) => b.total - a.total);
  const yearRows = cuAll.map(cu => ({ annee: cu.date_creation ? String(cu.date_creation).slice(0, 4) : null, roi: cu.roi, statut: cu.statut, direction: cu.direction }));
  const sansRoi = query(`
    SELECT cu_id FROM use_cases
    WHERE actif=1 AND statut != 'Abandonné' AND (roi_annuel IS NULL OR roi_annuel <= 0)
  `);
  const nbCuTotal = queryOne(`SELECT COUNT(*) AS n FROM use_cases WHERE actif=1 AND statut != 'Abandonné'`)?.n || 0;
  const idList = rows => rows.slice(0, 40).map(r => r.cu_id).join(', ') + (rows.length > 40 ? '…' : '');
  const qualityBanner = (sansRoi.length || sansDir.length) ? `
    <div style="background:#fffaf0;border:1px solid #f6ad55;border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:13px;color:#744210;">
      <strong>⚠️ Qualité des données</strong> — ${nbCuTotal} CU pris en compte
      ${sansRoi.length ? `<div style="margin-top:4px;">• <strong>${sansRoi.length} CU sans ROI calculé</strong> (non comptés dans les montants) <span style="opacity:.8;font-size:12px;">: ${idList(sansRoi)}</span></div>` : ''}
      ${sansDir.length ? `<div style="margin-top:4px;">• <strong>${sansDir.length} CU sans direction associée</strong> (absents du graphique par direction, ROI cumulé : ${formatROI(sansDir.reduce((a,r)=>a+r.roi,0))}) <span style="opacity:.8;font-size:12px;">: ${idList(sansDir)}</span></div>` : ''}
    </div>` : '';

  const totalConfirme = queryOne(`SELECT COALESCE(SUM(roi_annuel),0) AS v FROM use_cases WHERE actif=1 AND statut='Production'`)?.v || 0;
  const totalEstime   = queryOne(`SELECT COALESCE(SUM(roi_annuel),0) AS v FROM use_cases WHERE actif=1 AND statut != 'Abandonné'`)?.v || 0;
  const nbApps        = adoption.apps_dispo || 0;
  const nbProd        = adoption.en_prod    || 0;
  const tauxAdoption  = nbProd > 0 ? Math.round((nbApps / nbProd) * 100) : 0;

  // ── Render ─────────────────────────────────────────────────
  container.innerHTML = `
    <div class="hero" style="padding:18px 24px;">
      <h1>📊 Analyse ROI</h1>
      <p>Visualisez la valeur ajoutée du portefeuille de cas d'usage.</p>
    </div>

    <!-- KPI résumé -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px;">
      ${_kpi('⏳','ROI total estimé',formatROI(totalEstime)+'/an','#d69e2e','#fffff0','#fefcbf','Tous CU actifs hors Abandonné')}
      ${_kpi('✅','ROI total confirmé',formatROI(totalConfirme)+'/an','#276749','#f0fff4','#c6f6d5','CU en production uniquement')}
      ${_kpi('🚀','Apps disponibles',`${nbApps} / ${nbProd}`,'#2b6cb0','#ebf4ff','#bee3f8','CU en production avec app')}
      ${_kpi('📈','Taux d\'adoption',`${tauxAdoption}%`,tauxAdoption>=80?'#276749':tauxAdoption>=40?'#c05621':'#c53030','#f7fafc','#edf2f7','Part des CU prod avec app dispo')}
    </div>

    ${qualityBanner}

    <!-- Charts grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
      <!-- ROI par statut -->
      <div class="card">
        <div style="font-weight:700;font-size:14px;color:var(--blue-dark);margin-bottom:16px;">💹 ROI par statut</div>
        ${_barChart(roiParStatut.map(r=>({ label: r.statut, value: r.total, sub: `${r.nb} CU` })), { colors: _statusColors })}
      </div>
      <!-- Taux d'adoption -->
      <div class="card">
        <div style="font-weight:700;font-size:14px;color:var(--blue-dark);margin-bottom:16px;">📱 Adoption des applications (CU en production)</div>
        ${_donutChart(nbApps, nbProd - nbApps, ['#38a169','#e2e8f0'], ['App disponible','Sans application'])}
        <div style="display:flex;justify-content:center;gap:20px;margin-top:10px;font-size:12px;">
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#38a169;margin-right:4px;"></span>App disponible (${nbApps})</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#e2e8f0;margin-right:4px;"></span>Sans app (${nbProd - nbApps})</span>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <div style="font-weight:700;font-size:14px;color:var(--blue-dark);margin-bottom:12px;">📅 Évolution du ROI par année de création</div>
      <div id="roi-year-chart"></div>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <div style="font-weight:700;font-size:14px;color:var(--blue-dark);margin-bottom:16px;">🏢 ROI par direction <span style="font-weight:400;font-size:11px;color:var(--text-muted);">(ROI réparti à parts égales pour les CU multi-directions)</span></div>
      ${roiParDir.length
        ? _horizontalBar(roiParDir.map(r=>({ label:r.dir||'—', value:r.total, sub:`${r.nb} CU` })))
        : '<div class="text-muted text-sm" style="padding:20px;text-align:center;">Aucun CU n\'a de direction associée — renseignez la direction dans les fiches CU.</div>'
      }
    </div>

    <!-- Tableau des CU avec ROI (challenger) -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div style="font-weight:700;font-size:14px;color:var(--blue-dark);">🏆 Top CU par ROI — challenger l'adoption</div>
        <div style="font-size:12px;color:var(--text-muted);">Les CU en production sans application disponible méritent attention 👇</div>
      </div>
      ${_challengeTable(cuRoi)}
    </div>
  `;

  mountRoiYearChart(container.querySelector('#roi-year-chart'), yearRows);
}

// ── Composants visuels ───────────────────────────────────────

function _kpi(icon, label, value, border, bg1, bg2, hint) {
  return `<div class="card" style="border-left:4px solid ${border};background:linear-gradient(135deg,${bg1} 0%,${bg2} 100%);padding:14px 16px;">
    <div style="display:flex;align-items:flex-start;gap:8px;">
      <span style="font-size:1.4rem;">${icon}</span>
      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${border};margin-bottom:4px;">${label}</div>
        <div style="font-size:1.2rem;font-weight:800;color:${border};">${value}</div>
        <div style="font-size:10px;color:${border};opacity:.7;margin-top:2px;">${hint}</div>
      </div>
    </div>
  </div>`;
}

const _statusColors = {
  'Production':       '#38a169',
  'En développement': '#3182ce',
  'POC':              '#d69e2e',
  'Cadrage':          '#805ad5',
  'Besoin identifié': '#718096',
  'Abandonné':        '#e53e3e',
};

function _barChart(items, { colors = {} } = {}) {
  if (!items.length) return '<div class="text-muted text-sm" style="padding:20px;text-align:center;">Aucune donnée</div>';
  const max  = Math.max(...items.map(i => i.value), 1);
  const W = 340, H = 180, PAD = { t:10, b:36, l:10, r:10 };
  const bW  = Math.floor((W - PAD.l - PAD.r) / items.length) - 6;
  const chartH = H - PAD.t - PAD.b;

  const bars = items.map((item, i) => {
    const bH   = Math.max(4, (item.value / max) * chartH);
    const x    = PAD.l + i * (bW + 6);
    const y    = PAD.t + chartH - bH;
    const col  = colors[item.label] || `hsl(${200 + i * 30},65%,50%)`;
    const lbl  = item.label.length > 8 ? item.label.slice(0,8)+'…' : item.label;
    return `
      <rect x="${x}" y="${y}" width="${bW}" height="${bH}" rx="3" fill="${col}" opacity=".85"/>
      <text x="${x + bW/2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#4a5568">${_shortROI(item.value)}</text>
      <text x="${x + bW/2}" y="${H - PAD.b + 14}" text-anchor="middle" font-size="8.5" fill="#718096">${lbl}</text>
      ${item.sub ? `<text x="${x + bW/2}" y="${H - PAD.b + 24}" text-anchor="middle" font-size="7.5" fill="#a0aec0">${item.sub}</text>` : ''}`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-height:180px;">
    <line x1="${PAD.l}" y1="${PAD.t + chartH}" x2="${W - PAD.r}" y2="${PAD.t + chartH}" stroke="#e2e8f0" stroke-width="1"/>
    ${bars}
  </svg>`;
}

function _horizontalBar(items) {
  if (!items.length) return '';
  const max  = Math.max(...items.map(i => i.value), 1);
  const rowH = 28, W = 340;
  const H    = items.length * rowH + 10;
  const lblW = 110, barW = W - lblW - 60;

  const rows = items.map((item, i) => {
    const bW  = Math.max(4, (item.value / max) * barW);
    const y   = i * rowH + 5;
    const col = `hsl(${210 + i * 15},60%,${50 - i*2}%)`;
    const lbl = item.label.length > 16 ? item.label.slice(0,16)+'…' : item.label;
    return `
      <text x="0" y="${y + 16}" font-size="9" fill="#4a5568">${lbl}</text>
      <rect x="${lblW}" y="${y + 6}" width="${bW}" height="14" rx="3" fill="${col}" opacity=".8"/>
      <text x="${lblW + bW + 4}" y="${y + 17}" font-size="8.5" fill="#718096">${_shortROI(item.value)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;">
    ${rows}
  </svg>`;
}

function _lineAreaChart(items) {
  if (items.length < 2) return _barChart(items);
  const W = 340, H = 160, PAD = { t:14, b:30, l:16, r:16 };
  const max    = Math.max(...items.map(i => i.value), 1);
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const pts = items.map((item, i) => {
    const x = PAD.l + (i / (items.length - 1)) * chartW;
    const y = PAD.t + chartH - (item.value / max) * chartH;
    return { x, y, item };
  });

  const linePath   = `M ${pts.map(p=>`${p.x},${p.y}`).join(' L ')}`;
  const areaPath   = `M ${pts[0].x},${PAD.t + chartH} L ${pts.map(p=>`${p.x},${p.y}`).join(' L ')} L ${pts[pts.length-1].x},${PAD.t+chartH} Z`;
  const dotLabels  = pts.map(p =>
    `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#3182ce" stroke="white" stroke-width="1.5"/>
     <text x="${p.x}" y="${p.y - 8}" text-anchor="middle" font-size="8.5" fill="#2b6cb0">${_shortROI(p.item.value)}</text>
     <text x="${p.x}" y="${H - PAD.b + 14}" text-anchor="middle" font-size="8.5" fill="#718096">${p.item.label}</text>`
  ).join('');

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-height:160px;">
    <defs>
      <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3182ce" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#3182ce" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#area-grad)"/>
    <path d="${linePath}" stroke="#3182ce" stroke-width="2" fill="none" stroke-linejoin="round"/>
    <line x1="${PAD.l}" y1="${PAD.t+chartH}" x2="${W-PAD.r}" y2="${PAD.t+chartH}" stroke="#e2e8f0" stroke-width="1"/>
    ${dotLabels}
  </svg>`;
}

function _donutChart(a, b, colors, labels) {
  const total = a + b || 1;
  const r = 50, cx = 90, cy = 65, stroke = 22;
  const pctA = a / total;
  const angA = pctA * 2 * Math.PI;

  const x1 = cx + r * Math.cos(-Math.PI/2);
  const y1 = cy + r * Math.sin(-Math.PI/2);
  const x2 = cx + r * Math.cos(-Math.PI/2 + angA);
  const y2 = cy + r * Math.sin(-Math.PI/2 + angA);
  const large = angA > Math.PI ? 1 : 0;

  const arc = pctA < 0.999
    ? `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}" stroke="${colors[0]}" stroke-width="${stroke}" fill="none" stroke-linecap="round"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${colors[0]}" stroke-width="${stroke}" fill="none"/>`;
  const bg = `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${colors[1]}" stroke-width="${stroke}" fill="none"/>`;

  return `<svg viewBox="0 0 180 130" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-height:130px;">
    ${bg}${arc}
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="18" font-weight="800" fill="#1a202c">${a}</text>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="10" fill="#718096">${Math.round(pctA*100)}% avec app</text>
    <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="9" fill="#a0aec0">sur ${total} en prod.</text>
  </svg>`;
}

function _challengeTable(rows) {
  if (!rows.length) return `<div class="text-muted text-sm" style="padding:20px;">Aucun CU avec ROI renseigné. Ajoutez des ROI dans les fiches CU pour activer ce tableau.</div>`;

  return `<div class="table-wrap">
    <table class="data-table">
      <thead><tr>
        <th>CU</th><th>Nom</th><th>Statut</th><th>Type</th><th>ROI/an</th>
        <th title="L'application est-elle accessible aux utilisateurs ?">App dispo ?</th>
        <th>⚡ Challenge</th>
      </tr></thead>
      <tbody>
        ${rows.map(cu => {
          const needsChallenge = cu.statut === 'Production' && !cu.application_disponible;
          const isGood         = cu.statut === 'Production' && cu.application_disponible;
          const challenge = needsChallenge
            ? '<span style="color:#c53030;font-size:12px;font-weight:600;">⚠️ En prod, app manquante</span>'
            : isGood
              ? '<span style="color:#276749;font-size:12px;">✅ Opérationnel</span>'
              : '<span style="color:#718096;font-size:12px;">—</span>';
          const roiColor = cu.statut === 'Production' ? '#276749' : '#d69e2e';
          return `<tr style="${needsChallenge ? 'background:#fff5f5;' : ''}">
            <td class="cu-id">${cu.cu_id}</td>
            <td class="cu-name">${truncate(cu.nom, 40)}</td>
            <td>${statusBadge(cu.statut)}</td>
            <td>${chip(cu.type_besoin,'type')}</td>
            <td style="font-weight:700;color:${roiColor};">${formatROI(cu.roi_annuel)}</td>
            <td style="text-align:center;">${cu.application_disponible ? '🟢' : '⭕'}</td>
            <td>${challenge}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function _shortROI(v) {
  if (!v) return '0';
  if (v >= 1_000_000) return (v/1_000_000).toFixed(1)+'M€';
  if (v >= 1_000)     return (v/1_000).toFixed(0)+'k€';
  return v+'€';
}
