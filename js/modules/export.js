/**
 * Export module — transfère les CU communs d'un pays vers l'autre
 * en excluant les CU marqués Spécial FR ou Spécial DE.
 *
 * L'export produit un fichier JSON que l'admin de l'autre pays
 * peut importer via le même bouton (onglet Import).
 */
import { query, run, nextCuId, saveDB, getSetting } from './db.js';

const EXPORT_VERSION = '1.0';

/**
 * Exporte les CU "communs" (visibilite='common') vers un JSON téléchargeable.
 * @param {string} sourceCountry 'FR' | 'DE' | null  — filtre sur l'origine source (null = tous communs)
 */
export function exportCU(sourceCountry = null) {
  let where = `actif=1 AND (visibilite='common' OR visibilite IS NULL OR visibilite='')`;
  const params = [];
  if (sourceCountry) {
    where += ` AND origine=?`;
    params.push(sourceCountry);
  }

  const rows = query(`SELECT * FROM use_cases WHERE ${where} ORDER BY cu_id`, params);
  if (!rows.length) return { ok: false, msg: 'Aucun CU commun trouvé avec ces critères.' };

  const payload = {
    _meta: {
      version:      EXPORT_VERSION,
      exported_at:  new Date().toISOString(),
      source:       sourceCountry || 'ALL',
      count:        rows.length,
      app_name:     getSetting('app_name', 'Référentiel CU'),
    },
    use_cases: rows.map(cu => ({
      // On exporte tout sauf les IDs internes SQLite et les champs de traçabilité locale
      cu_id:                 cu.cu_id,
      nom:                   cu.nom,
      statut:                cu.statut,
      type_besoin:           cu.type_besoin,
      technologie:           cu.technologie,
      type_sujet:            cu.type_sujet,
      responsable:           cu.responsable,
      pilote_metier:         cu.pilote_metier,
      roi_annuel:            cu.roi_annuel,
      description:           cu.description,
      gain_estime:           cu.gain_estime,
      jira_url:              cu.jira_url,
      application_disponible: cu.application_disponible,
      application_url:       cu.application_url,
      conditions_acces:      cu.conditions_acces,
      origine:               cu.origine,
      visibilite:            'common', // toujours common à l'import
      date_creation:         cu.date_creation,
    })),
  };

  const json     = JSON.stringify(payload, null, 2);
  const blob     = new Blob([json], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  const country  = sourceCountry ? `-${sourceCountry}` : '';
  const date     = new Date().toISOString().slice(0,10);
  a.href         = url;
  a.download     = `referentiel-cu-export${country}-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);

  return { ok: true, count: rows.length };
}

/**
 * Importe des CU depuis un fichier JSON exporté.
 * Stratégie : INSERT OR IGNORE sur cu_id — ne remplace pas les CU existants.
 * Retourne un rapport { inserted, skipped, errors }.
 */
export async function importCU(file, targetCountry = null) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const payload = JSON.parse(e.target.result);
        if (!payload.use_cases || !Array.isArray(payload.use_cases)) {
          resolve({ ok: false, msg: 'Fichier invalide : clé "use_cases" manquante.' });
          return;
        }

        let inserted = 0, skipped = 0, errors = 0;

        for (const cu of payload.use_cases) {
          if (!cu.cu_id || !cu.nom) { errors++; continue; }

          // Vérifie si le CU existe déjà
          const exists = query(`SELECT cu_id FROM use_cases WHERE cu_id=?`, [cu.cu_id]).length > 0;
          if (exists) { skipped++; continue; }

          try {
            // Génère un nouvel ID si on cible un pays différent de la source
            // (pour que les IDs reflètent le pays cible)
            let newId = cu.cu_id;
            if (targetCountry && cu.origine && cu.origine !== targetCountry) {
              // Remplace le suffixe pays dans l'ID si présent
              newId = cu.cu_id.replace(/-FR$|-DE$/i, '') + `-${targetCountry}`;
              // Si l'ID remanié existe déjà, générer un nouveau
              const idExists = query(`SELECT cu_id FROM use_cases WHERE cu_id=?`, [newId]).length > 0;
              if (idExists) newId = nextCuId(targetCountry);
            }

            run(`INSERT OR IGNORE INTO use_cases
              (cu_id,nom,statut,type_besoin,technologie,type_sujet,responsable,pilote_metier,
               roi_annuel,description,gain_estime,jira_url,application_disponible,application_url,
               conditions_acces,origine,visibilite,date_creation)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [
                newId, cu.nom, cu.statut || 'Besoin identifié',
                cu.type_besoin, cu.technologie, cu.type_sujet,
                cu.responsable, cu.pilote_metier, cu.roi_annuel,
                cu.description, cu.gain_estime, cu.jira_url,
                cu.application_disponible || 0, cu.application_url, cu.conditions_acces,
                cu.origine, 'common',
                cu.date_creation || new Date().toISOString(),
              ]
            );
            inserted++;
          } catch(e) {
            console.error('Import error on', cu.cu_id, e);
            errors++;
          }
        }

        saveDB();
        resolve({
          ok: true,
          source: payload._meta?.source || '?',
          exported_at: payload._meta?.exported_at,
          inserted, skipped, errors,
          total: payload.use_cases.length,
        });
      } catch(e) {
        resolve({ ok: false, msg: `Erreur de parsing JSON : ${e.message}` });
      }
    };
    reader.readAsText(file);
  });
}
