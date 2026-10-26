/**
 * localdb.js — Import et gestion d'une BDD JSON locale indépendante du Gist.
 * Les CU importés sont stockés dans IndexedDB sous une clé séparée.
 * Ils sont fusionnés à la volée avec les CU SQLite lors des lectures catalogue.
 */

const IDB_NAME = 'referentiel_cu_db';
const LOCAL_KEY = 'local_json_db';

// ── IndexedDB helpers ─────────────────────────────────────

function _idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}

async function _idbGet(key) {
  try {
    const idb = await _idbOpen();
    return new Promise((res, rej) => {
      const tx = idb.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = e => res(e.target.result || null);
      req.onerror = e => rej(e.target.error);
    });
  } catch { return null; }
}

async function _idbSet(key, value) {
  const idb = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = idb.transaction('kv', 'readwrite');
    const req = tx.objectStore('kv').put(value, key);
    req.onsuccess = () => res();
    req.onerror = e => rej(e.target.error);
  });
}

async function _idbDel(key) {
  const idb = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = idb.transaction('kv', 'readwrite');
    const req = tx.objectStore('kv').delete(key);
    req.onsuccess = () => res();
    req.onerror = e => rej(e.target.error);
  });
}

// ── Public API ────────────────────────────────────────────

/** Retourne les métadonnées de la BDD locale (null si aucune) */
export async function getLocalDBMeta() {
  const stored = await _idbGet(LOCAL_KEY);
  if (!stored) return null;
  return {
    imported_at: stored._meta?.imported_at || null,
    source_file: stored._meta?.source_file || null,
    count:       (stored.use_cases || []).length,
  };
}

/** Retourne tous les CU de la BDD locale (tableau d'objets) */
export async function getLocalCU() {
  const stored = await _idbGet(LOCAL_KEY);
  return stored?.use_cases || [];
}

/**
 * Importe un fichier JSON en tant que BDD locale.
 * Le fichier doit avoir la même structure que l'export CU standard
 * (clé "use_cases" array) OU peut être un tableau direct.
 */
export async function importLocalDB(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let payload = JSON.parse(e.target.result);

        // Accepte tableau direct ou objet {use_cases:[]}
        if (Array.isArray(payload)) {
          payload = { use_cases: payload };
        }

        if (!payload.use_cases || !Array.isArray(payload.use_cases)) {
          resolve({ ok: false, msg: 'Fichier invalide : clé "use_cases" manquante ou format inattendu.' });
          return;
        }

        // Validation légère
        let valid = 0, invalid = 0;
        const cleaned = [];
        for (const cu of payload.use_cases) {
          if (!cu.cu_id && !cu.nom) { invalid++; continue; }
          cleaned.push({
            cu_id:                  cu.cu_id || `LOCAL-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
            nom:                    cu.nom || '(sans titre)',
            statut:                 cu.statut || 'Besoin identifié',
            type_besoin:            cu.type_besoin || null,
            technologie:            cu.technologie || null,
            type_sujet:             cu.type_sujet || null,
            responsable:            cu.responsable || null,
            pilote_metier:          cu.pilote_metier || null,
            roi_annuel:             cu.roi_annuel || null,
            description:            cu.description || null,
            gain_estime:            cu.gain_estime || null,
            jira_url:               cu.jira_url || null,
            application_disponible: cu.application_disponible || 0,
            application_url:        cu.application_url || null,
            conditions_acces:       cu.conditions_acces || null,
            origine:                cu.origine || null,
            visibilite:             cu.visibilite || 'common',
            date_creation:          cu.date_creation || new Date().toISOString(),
            actif:                  cu.actif !== undefined ? cu.actif : 1,
            // Champs formulaire besoin
            contexte:               cu.contexte || null,
            objectif:               cu.objectif || null,
            priorite:               cu.priorite || null,
            types_donnees:          cu.types_donnees || null,
            benefice_attendu:       cu.benefice_attendu || null,
            temps_actuel:           cu.temps_actuel || null,
            unite_temps:            cu.unite_temps || null,
            nombre_personnes:       cu.nombre_personnes || null,
            volume_annuel:          cu.volume_annuel || null,
            gain_outil:             cu.gain_outil || null,
            _source: 'local',
          });
          valid++;
        }

        const stored = {
          _meta: {
            imported_at: new Date().toISOString(),
            source_file: file.name,
            original_meta: payload._meta || null,
          },
          use_cases: cleaned,
        };

        await _idbSet(LOCAL_KEY, stored);
        resolve({ ok: true, valid, invalid, total: payload.use_cases.length });

      } catch (e) {
        resolve({ ok: false, msg: `Erreur de parsing JSON : ${e.message}` });
      }
    };
    reader.onerror = () => resolve({ ok: false, msg: 'Erreur de lecture du fichier.' });
    reader.readAsText(file);
  });
}

/** Supprime la BDD locale */
export async function clearLocalDB() {
  await _idbDel(LOCAL_KEY);
}

/** Exporte la BDD locale en JSON téléchargeable */
export async function exportLocalDB() {
  const stored = await _idbGet(LOCAL_KEY);
  if (!stored) return { ok: false, msg: 'Aucune BDD locale à exporter.' };
  const json = JSON.stringify(stored, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `local-db-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true, count: stored.use_cases?.length || 0 };
}
