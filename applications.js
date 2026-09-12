import { query } from '../modules/db.js';
import { chip, emptyState, truncate, sectionTitle } from '../modules/ui.js';
import { navigate } from '../app.js';

export function renderApplications(container) {
  const apps = query(`SELECT * FROM use_cases WHERE actif=1 AND statut='Production' AND application_disponible=1 ORDER BY date_creation DESC`);
  const all_prod = query(`SELECT * FROM use_cases WHERE actif=1 AND statut='Production' AND application_disponible=0 ORDER BY date_creation DESC`);

  container.innerHTML = `
    <div class="hero" style="padding:18px 24px;">
      <h1>🚀 Applications disponibles</h1>
      <p>Solutions mises en production et accessibles aux équipes.</p>
    </div>

    ${sectionTitle('🟢', `Applications en ligne (${apps.length})`)}
    ${apps.length ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-bottom:24px;">
        ${apps.map(app => `
          <div class="card" style="cursor:pointer" onclick="navigate('catalogue',{cu_id:'${app.cu_id}'})">
            <div style="display:flex;align-items:flex-start;gap:12px;">
              <div style="font-size:2rem;">🚀</div>
              <div style="flex:1">
                <div style="font-weight:700;color:var(--blue-dark)">${app.nom}</div>
                <div class="text-muted text-sm mt-1">${truncate(app.description,100)}</div>
                <div class="flex gap-1 mt-2 flex-wrap">
                  ${chip(app.type_besoin,'type')}
                  ${chip(app.technologie,'tech')}
                </div>
                ${app.conditions_acces ? `<div class="alert alert-info mt-2" style="padding:8px 10px;font-size:12px;">ℹ️ ${app.conditions_acces}</div>` : ''}
                ${app.application_url ? `<a href="${app.application_url}" target="_blank" class="btn btn-primary btn-sm mt-2" onclick="event.stopPropagation()">Accéder à l'application →</a>` : ''}
              </div>
            </div>
          </div>`).join('')}
      </div>` : emptyState('🔍', 'Aucune application disponible', 'Les applications seront listées ici dès leur mise en production.')}

    ${all_prod.length ? `
      ${sectionTitle('📋', `Autres projets en production (${all_prod.length})`)}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>ID</th><th>Nom</th><th>Type</th><th>Technologie</th><th>Responsable</th><th>Contact</th></tr></thead>
          <tbody>
            ${all_prod.map(cu => `<tr style="cursor:pointer" onclick="navigate('catalogue',{cu_id:'${cu.cu_id}'})">
              <td class="cu-id">${cu.cu_id}</td>
              <td class="cu-name">${truncate(cu.nom,45)}</td>
              <td>${chip(cu.type_besoin,'type')}</td>
              <td>${chip(cu.technologie,'tech')}</td>
              <td class="text-sm text-muted">${cu.responsable||'—'}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();navigate('guide')">Contacter</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}
  `;
}
