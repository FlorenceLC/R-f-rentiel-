/**
 * Database module — sql.js (SQLite in WASM) + IndexedDB persistence
 * All data stays local in the browser.
 */

const DB_NAME = 'referentiel_cu_db';
const DB_KEY  = 'sqlite_data';
let _db = null;

/** Boot: load sql.js, then restore or create DB */
export async function initDB() {
  if (_db) return _db;

  // Chemin relatif au root du site — fonctionne sur GitHub Pages
  const base = (() => {
    const scripts = [...document.querySelectorAll('script[src]')];
    const sqlScript = scripts.find(s => s.src.includes('sql-wasm'));
    if (sqlScript) return sqlScript.src.replace('sql-wasm.js', '');
    return window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
  })();

  const SQL = await window.initSqlJs({
    locateFile: f => base + f
  });
  _SQL = SQL; // cache for importDBBase64

  const saved = await _idbLoad();
  if (saved) {
    _db = new SQL.Database(saved);
    console.log('[DB] restored from IndexedDB');
    _migrate(); // apply new columns on existing DBs
  } else {
    _db = new SQL.Database();
    console.log('[DB] fresh database');
    _createSchema();
    _seedData();
    _migrate(); // ensure all settings and columns exist on fresh DB too
    await _idbSave();
  }

  return _db;
}

// Keep reference to SQL for importDBBase64
let _SQL = null;
async function initSQL() {
  if (_SQL) return _SQL;
  const base = (() => {
    const scripts = [...document.querySelectorAll('script[src]')];
    const sqlScript = scripts.find(s => s.src.includes('sql-wasm'));
    if (sqlScript) return sqlScript.src.replace('sql-wasm.js', '');
    return window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
  })();
  _SQL = await window.initSqlJs({ locateFile: f => base + f });
  return _SQL;
}

/** Add new columns to existing DBs without losing data */
function _migrate() {
  /** Check if a column already exists via PRAGMA */
  const hasCol = (table, col) => {
    try {
      const res = _db.exec(`PRAGMA table_info(${table})`);
      if (!res.length || !res[0].values) return false;
      return res[0].values.some(r => r[1] === col);
    } catch { return false; }
  };

  /** Only ALTER TABLE when the column is truly missing */
  const addCol = (table, col, def) => {
    if (hasCol(table, col)) return; // already there — skip
    try {
      _db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      console.log(`[DB migrate] Added column ${table}.${col}`);
    } catch(e) {
      console.error(`[DB migrate] Could not add ${table}.${col}:`, e.message);
    }
  };

  // Multi-country columns
  addCol('users',     'pays',       'TEXT DEFAULT NULL');
  addCol('use_cases', 'origine',    'TEXT DEFAULT NULL');
  addCol('use_cases', 'visibilite', "TEXT DEFAULT 'common'");
  addCol('requests',  'entite',     'TEXT DEFAULT NULL');

  // New settings (INSERT OR IGNORE is safe to repeat)
  const newSettings = [
    ['app_lang',            'fr',                   'Langue de l\'interface (fr/en/de)', 'string'],
    ['bilingual_mode',      'false',                'Mode bilingue FR/DE activé',         'boolean'],
    ['special_tab_fr',      'Spécial France',       'Libellé onglet spécial France',      'string'],
    ['special_tab_de',      'Spécial Allemagne',    'Libellé onglet spécial Allemagne',   'string'],
    ['gist_id',             '',                     'ID du Gist GitHub',                  'string'],
    ['gist_token',          '',                     'Token GitHub PAT',                   'string'],
    ['show_roi_public',     'false',                'Afficher les ROI aux visiteurs',     'boolean'],
    ['app_contact_cc',      '',                     'CC email contact',                   'string'],
    ['app_contact_subject', 'Demande d\'information', 'Objet email contact',             'string'],
    ['app_contact_body',    '',                     'Corps email contact',                'string'],
    ['ai_gravitee_key',     '',                     'Clé Gravitee API Gateway',           'string'],
  ];
  newSettings.forEach(([k, v, d, t]) => {
    try {
      _db.run(
        `INSERT OR IGNORE INTO settings(cle,valeur,description,type_valeur) VALUES(?,?,?,?)`,
        [k, v, d, t]
      );
    } catch(e) { console.warn(`[DB migrate] setting ${k}:`, e.message); }
  });

  // Persist migration immediately
  _idbSave().catch(e => console.error('[DB migrate] _idbSave failed:', e));
}

/** Run schema and seed if new DB */
function _createSchema() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      prenom TEXT, nom TEXT, email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'ADMIN_I',
      pays TEXT DEFAULT NULL,
      type_sujet TEXT, actif INTEGER NOT NULL DEFAULT 1,
      date_creation TEXT DEFAULT (datetime('now')),
      date_modification TEXT DEFAULT (datetime('now')),
      derniere_connexion TEXT
    );
    CREATE TABLE IF NOT EXISTS need_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      libelle TEXT UNIQUE NOT NULL, description TEXT,
      actif INTEGER NOT NULL DEFAULT 1, ordre INTEGER DEFAULT 0,
      date_creation TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS technologies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      libelle TEXT UNIQUE NOT NULL, description TEXT,
      actif INTEGER NOT NULL DEFAULT 1, ordre INTEGER DEFAULT 0,
      date_creation TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS subject_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      libelle TEXT UNIQUE NOT NULL, description TEXT,
      actif INTEGER NOT NULL DEFAULT 1, ordre INTEGER DEFAULT 0,
      date_creation TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS use_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cu_id TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL, description TEXT,
      type_besoin TEXT, type_sujet TEXT,
      statut TEXT NOT NULL DEFAULT 'Besoin identifié',
      responsable TEXT, pilote_metier TEXT, technologie TEXT,
      date_creation TEXT DEFAULT (datetime('now')),
      date_modification TEXT DEFAULT (datetime('now')),
      roi_annuel REAL, gain_estime TEXT, roi_complement TEXT,
      jira_url TEXT, application_disponible INTEGER DEFAULT 0,
      application_url TEXT, conditions_acces TEXT,
      origine TEXT DEFAULT NULL, visibilite TEXT DEFAULT 'common',
      request_id INTEGER, actif INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dem_id TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL, prenom TEXT NOT NULL,
      email TEXT NOT NULL, direction TEXT NOT NULL,
      entite TEXT DEFAULT NULL,
      contexte TEXT NOT NULL, objectif TEXT NOT NULL, commentaire TEXT,
      temps_actuel REAL, unite_temps TEXT,
      nombre_personnes INTEGER, volume_annuel INTEGER,
      gain_par_operation REAL, roi_estime REAL,
      disponibilite TEXT, date_disponibilite TEXT,
      type_besoin_ia TEXT, technologie_ia TEXT, analyse_ia TEXT,
      similar_cases TEXT, similarity_scores TEXT,
      has_similarities INTEGER DEFAULT 0,
      similarity_acknowledged INTEGER DEFAULT 0,
      statut TEXT NOT NULL DEFAULT 'À analyser',
      type_besoin_admin TEXT, technologie_admin TEXT,
      type_sujet_admin TEXT, responsable_admin TEXT,
      pilote_metier_admin TEXT, jira_url_admin TEXT,
      roi_definitif REAL, motif_rejet TEXT, commentaire_rejet TEXT,
      date_demande TEXT DEFAULT (datetime('now')),
      date_traitement TEXT, traite_par TEXT,
      use_case_id INTEGER, mail_envoye INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS archives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type_archive TEXT NOT NULL,
      reference_id INTEGER NOT NULL, reference_code TEXT NOT NULL,
      nom TEXT, description TEXT, motif TEXT, commentaire TEXT,
      archive_par TEXT,
      date_archive TEXT DEFAULT (datetime('now')),
      donnees_snapshot TEXT
    );
    CREATE TABLE IF NOT EXISTS faq (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL, reponse TEXT NOT NULL,
      categorie TEXT DEFAULT 'Général',
      ordre INTEGER DEFAULT 0, actif INTEGER NOT NULL DEFAULT 1,
      date_creation TEXT DEFAULT (datetime('now')),
      date_modification TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cle TEXT UNIQUE NOT NULL, valeur TEXT,
      description TEXT, type_valeur TEXT DEFAULT 'string',
      date_modification TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      utilisateur TEXT, action TEXT NOT NULL,
      objet_type TEXT, objet_id TEXT, objet_code TEXT,
      ancienne_valeur TEXT, nouvelle_valeur TEXT, detail TEXT,
      date_action TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cu_seq (val INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS dem_seq (val INTEGER DEFAULT 0);
    INSERT OR IGNORE INTO cu_seq VALUES (0);
    INSERT OR IGNORE INTO dem_seq VALUES (0);
  `);
}

function _seedData() {
  // Default admin (password: Admin1234!)
  // bcrypt is not available client-side; we store a marker and handle in auth
  _db.run(`INSERT OR IGNORE INTO users (username,password_hash,prenom,nom,email,role,actif)
    VALUES ('admin','__PLAIN__Admin1234!','Admin','Système','admin@exemple.fr','ADMIN_GLOBAL',1)`);

  // Need types
  const needTypes = ['Automatisation','IA générative','Analyse de données','Reporting','Aide à la décision','Digitalisation','Optimisation'];
  needTypes.forEach((l,i) => _db.run(`INSERT OR IGNORE INTO need_types(libelle,ordre) VALUES(?,?)`, [l, i+1]));

  // Technologies
  const techs = ['Python','Power BI','IA générative','Machine Learning','RPA','API','SQL','LLM','IoT','OCR'];
  techs.forEach((l,i) => _db.run(`INSERT OR IGNORE INTO technologies(libelle,ordre) VALUES(?,?)`, [l, i+1]));

  // Subject types
  const sujets = ['RH','Finance','Production','Qualité','Logistique','Commercial','IT','Transversal'];
  sujets.forEach((l,i) => _db.run(`INSERT OR IGNORE INTO subject_types(libelle,ordre) VALUES(?,?)`, [l, i+1]));

  // Use cases (25 samples)
  const useCases = [
    ['CU-0001','Automatisation des rapports financiers','Génération automatique des rapports mensuels de la direction financière à partir des données ERP. Réduit le temps de consolidation de 80%.','Automatisation','Finance','Production','Dupont','Martin','Python',45000,1,'https://app-interne.exemple.fr/rapports','Accès réservé à la Direction Finance.'],
    ['CU-0002','Analyse automatique de documents contractuels','Extraction d\'informations clés depuis les contrats fournisseurs via IA générative. Détection automatique des clauses importantes.','IA générative','Finance','Production','Bernard','Durand','IA générative',32000,1,'https://app-interne.exemple.fr/contrats','Accès sur demande.'],
    ['CU-0003','Tableau de bord RH','Visualisation des indicateurs RH clés : turnover, absentéisme, formation. Actualisation automatique quotidienne.','Reporting','RH','POC','Petit','Roux','Power BI',null,0,null,null],
    ['CU-0004','Chatbot interne FAQ','Assistant virtuel répondant aux questions fréquentes des employés sur les procédures RH, IT, et administratives.','IA générative','RH','Cadrage','Moreau','Leclerc','LLM',null,0,null,null],
    ['CU-0005','Gestion automatisée des stocks','Suivi en temps réel des niveaux de stocks avec alertes automatiques et prévisions de réapprovisionnement.','Analyse de données','Logistique','Production','Simon','Blanc','Python',78000,1,'https://app-interne.exemple.fr/stocks','Accès Logistique et Production.'],
    ['CU-0006','Prévision de la demande clients','Modèle ML pour anticiper les commandes clients sur 3 mois. Améliore la planification de production de 25%.','Analyse de données','Commercial','En développement','Lambert','Girard','Machine Learning',null,0,null,null],
    ['CU-0007','Extraction de données PDF techniques','Lecture automatique de fiches techniques fournisseurs en PDF et alimentation de la base de données produits.','Automatisation','Qualité','Production','Dupont','Meyer','Python',15000,0,null,'Contacter notre département.'],
    ['CU-0008','Analyse de sentiments clients','Traitement automatique des avis et retours clients pour identifier les tendances et points d\'amélioration.','IA générative','Commercial','Besoin identifié','Bernard','Fontaine','LLM',null,0,null,null],
    ['CU-0009','Optimisation des tournées de livraison','Algorithme d\'optimisation des itinéraires de livraison pour réduire les coûts logistiques.','Optimisation','Logistique','POC','Petit','Chevalier','Python',null,0,null,null],
    ['CU-0010','Détection des anomalies de facturation','Identification automatique des factures suspectes ou erronées par analyse ML des patterns de facturation.','Analyse de données','Finance','Cadrage','Moreau','Robin','Machine Learning',null,0,null,null],
    ['CU-0011','Automatisation des relances fournisseurs','Envoi automatique des relances aux fournisseurs en retard, avec escalade progressive.','Automatisation','Finance','Production','Simon','Nicolas','RPA',8000,0,null,'Contacter notre département.'],
    ['CU-0012','Tableau de bord commercial','Suivi en temps réel des ventes, du pipeline commercial et des objectifs par équipe et par région.','Reporting','Commercial','Production','Lambert','Thomas','Power BI',12000,1,'https://app-interne.exemple.fr/commercial','Accès Direction Commerciale.'],
    ['CU-0013','Assistance à la rédaction de cahiers des charges','IA générative aidant les équipes projet à structurer et rédiger leurs cahiers des charges techniques.','IA générative','IT','Besoin identifié','Dupont','Garcia','LLM',null,0,null,null],
    ['CU-0014','Contrôle qualité visuel par IA','Détection automatique de défauts sur la ligne de production via vision par ordinateur.','Analyse de données','Production','En développement','Bernard','Martinez','Machine Learning',null,0,null,null],
    ['CU-0015','Automatisation du reporting réglementaire','Génération automatique des rapports réglementaires à partir des données RH.','Automatisation','RH','Production','Petit','Lefebvre','Python',22000,0,null,'Accès équipe paie RH.'],
    ['CU-0016','Chatbot support IT niveau 1','Assistant IA pour traiter les tickets IT de niveau 1 : réinitialisation de mot de passe, VPN.','IA générative','IT','POC','Moreau','Rousseau','LLM',null,0,null,null],
    ['CU-0017','Analyse des coûts de production','Modèle analytique pour identifier les postes de coûts anormaux et les opportunités d\'économies.','Analyse de données','Production','Cadrage','Simon','Perret','SQL',null,0,null,null],
    ['CU-0018','Automatisation de la saisie comptable','OCR et ML pour automatiser la saisie des factures dans le système comptable.','Automatisation','Finance','En développement','Lambert','Colin','OCR',null,0,null,null],
    ['CU-0019','Plateforme de e-learning interne','Application de formation en ligne avec suivi des compétences et parcours personnalisés.','Digitalisation','RH','Besoin identifié','Dupont','Mercier','Python',null,0,null,null],
    ['CU-0020','Prévision des pannes machines','Maintenance prédictive via analyse des données capteurs IoT pour anticiper les pannes.','Analyse de données','Production','POC','Bernard','Dumont','IoT',null,0,null,null],
    ['CU-0021','Synthèse automatique des réunions','Transcription et résumé automatique des réunions avec extraction des actions à mener.','IA générative','Transversal','Besoin identifié','Petit','Lemaire','LLM',null,0,null,null],
    ['CU-0022','Scoring crédit fournisseurs','Évaluation automatisée du risque fournisseur via analyse financière et données externes.','Aide à la décision','Finance','Cadrage','Moreau','Renard','Machine Learning',null,0,null,null],
    ['CU-0023','Automatisation onboarding collaborateurs','Workflow automatisé pour l\'intégration des nouveaux employés : accès, équipement, formation.','Automatisation','RH','En développement','Simon','Picard','RPA',null,0,null,null],
    ['CU-0024','Analyse concurrentielle automatisée','Veille concurrentielle automatique par scraping et analyse sémantique de sources publiques.','IA générative','Commercial','Abandonné','Lambert','Faure','Python',null,0,null,null],
    ['CU-0025','Optimisation du plan de charge','Aide à la planification des ressources humaines et machines selon la demande prévisionnelle.','Aide à la décision','Production','Besoin identifié','Dupont','Bonnet','Python',null,0,null,null],
  ];

  const dates = [
    '2025-01-10','2025-03-05','2025-06-01','2025-07-01','2024-11-10',
    '2025-05-01','2024-09-10','2025-08-01','2025-07-01','2025-07-01',
    '2024-12-10','2025-02-10','2025-06-15','2025-04-01','2024-10-10',
    '2025-07-01','2025-07-22','2025-05-01','2025-08-22','2025-06-01',
    '2025-09-01','2025-08-05','2025-06-01','2025-01-10','2025-08-22',
  ];

  useCases.forEach((cu, i) => {
    _db.run(`INSERT OR IGNORE INTO use_cases
      (cu_id,nom,description,type_besoin,type_sujet,statut,responsable,pilote_metier,technologie,roi_annuel,application_disponible,application_url,conditions_acces,date_creation,date_modification)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [...cu, dates[i], dates[i]]
    );
  });
  _db.run(`UPDATE cu_seq SET val=25`);

  // Sample requests
  const reqs = [
    ['DEM-0001','Dupont','Martin','martin.dupont@e.fr','Direction Finance','Le reporting financier est actuellement réalisé manuellement.','Automatiser la génération des rapports financiers.','immediate','Automatisation','Python','Validée'],
    ['DEM-0002','Bernard','Sophie','sophie.b@e.fr','Direction RH','L\'analyse des CV pour les recrutements est chronophage.','Pré-sélectionner automatiquement les CV.','immediate','IA générative','LLM','À analyser'],
    ['DEM-0003','Petit','Thomas','thomas.p@e.fr','Direction SI','Les factures fournisseurs arrivent en PDF et sont saisies manuellement.','Automatiser l\'extraction et la saisie des données de factures PDF.','immediate','Automatisation','Python','À analyser'],
  ];
  reqs.forEach(r => {
    _db.run(`INSERT OR IGNORE INTO requests(dem_id,nom,prenom,email,direction,contexte,objectif,disponibilite,type_besoin_ia,technologie_ia,statut)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`, r);
  });
  _db.run(`UPDATE dem_seq SET val=3`);

  // FAQ
  const faqs = [
    ['Qu\'est-ce qu\'un cas d\'usage ?','Un cas d\'usage est un projet ou une initiative portée par notre équipe pour répondre à un besoin métier identifié. Il suit un cycle de vie défini, de l\'identification du besoin jusqu\'à la mise en production.','Général',1],
    ['Qui peut proposer un besoin ?','Tout collaborateur de l\'entreprise peut proposer un besoin via le formulaire. Aucune compétence technique n\'est requise.','Général',2],
    ['Comment proposer un besoin ?','Cliquez sur "Soumettre un besoin" dans le menu. Remplissez le formulaire en décrivant votre contexte et votre objectif. Notre IA analysera votre demande.','Formulaire',3],
    ['Que signifie "Besoin identifié" ?','"Besoin identifié" est le premier statut. Le besoin a été reçu et validé mais n\'a pas encore démarré.','Statuts',4],
    ['Qu\'est-ce qu\'un POC ?','Un POC (Proof of Concept) est une version prototype pour valider la faisabilité technique et démontrer la valeur de la solution.','Statuts',5],
    ['Comment accéder à une application ?','Les applications disponibles sont listées dans la section "Applications". Les conditions d\'accès sont indiquées pour chaque application.','Applications',6],
    ['Comment fonctionne l\'assistant IA ?','L\'assistant IA répond à vos questions sur nos projets en interrogeant notre référentiel en langage naturel.','Assistant IA',7],
  ];
  faqs.forEach(([q,r,c,o]) => {
    _db.run(`INSERT OR IGNORE INTO faq(question,reponse,categorie,ordre) VALUES(?,?,?,?)`, [q,r,c,o]);
  });

  // Settings
  const settings = [
    ['app_name','Référentiel des cas d\'usage','Nom de l\'application','string'],
    ['app_department','Direction de l\'Innovation','Nom du département','string'],
    ['app_contact_email','innovation@entreprise.fr','Email de contact','string'],
    ['app_contact_cc','','Destinataires en copie (séparés par des virgules)','string'],
    ['app_contact_subject','Demande d\'information','Objet du mail de contact','string'],
    ['app_contact_body','','Corps du mail de contact (optionnel)','string'],
    ['ai_base_url','','URL de l\'API IA (compatible OpenAI)','string'],
    ['ai_api_key','','Clé API IA','string'],
    ['ai_model','gpt-4','Modèle IA à utiliser','string'],
    ['ai_gravitee_key','','Clé Gravitee API Gateway (X-Gravitee-Api-Key)','string'],
    ['show_roi_public',   'false', 'Afficher les ROI aux visiteurs',         'boolean'],
    ['max_similar_results','5',   'Nombre maximum de CU similaires',          'integer'],
    ['app_lang',          'fr',   'Langue de l\'interface (fr/en/de)',        'string'],
    ['bilingual_mode',    'false','Mode bilingue FR/DE activé',               'boolean'],
    ['special_tab_fr',    'Spécial France',    'Libellé onglet spécial France',    'string'],
    ['special_tab_de',    'Spécial Allemagne', 'Libellé onglet spécial Allemagne', 'string'],
    ['gist_id',           '',     'ID du Gist GitHub',                        'string'],
    ['gist_token',        '',     'Token GitHub PAT',                         'string'],
  ];
  settings.forEach(([k,v,d,t]) => {
    _db.run(`INSERT OR IGNORE INTO settings(cle,valeur,description,type_valeur) VALUES(?,?,?,?)`, [k,v,d,t]);
  });
}

/** Persist DB to IndexedDB after every write */
export async function saveDB() {
  if (!_db) return;
  await _idbSave();
}

/** Export current DB as base64 string (for Gist backup) */
export async function exportDBBase64() {
  if (!_db) throw new Error('DB not initialised');
  const data = _db.export(); // Uint8Array
  let binary = '';
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary);
}

/** Import DB from base64 string (from Gist restore) — replaces current DB */
export async function importDBBase64(b64) {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const SQL = await initSQL();
  _db = new SQL.Database(bytes);
  await _idbSave();
  // Reload page so all in-memory state is refreshed
  location.reload();
}

/** Execute a SELECT and return array of row objects */
export function query(sql, params = []) {
  if (!_db) throw new Error('DB not initialised');
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** Execute a single SELECT and return first row or null */
export function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows.length ? rows[0] : null;
}

/** Execute INSERT/UPDATE/DELETE */
export function run(sql, params = []) {
  if (!_db) throw new Error('DB not initialised');
  _db.run(sql, params);
}

/** Generate next CU-XXXX id */
export function nextCuId(pays = null) {
  run(`UPDATE cu_seq SET val = val + 1`);
  const row    = queryOne(`SELECT val FROM cu_seq`);
  const num    = String(row.val).padStart(4, '0');
  const suffix = pays ? `-${pays.toUpperCase()}` : '';
  return `CU-${num}${suffix}`;
}

/** Generate next DEM-XXXX[-FR|-DE] id */
export function nextDemId(pays = null) {
  run(`UPDATE dem_seq SET val = val + 1`);
  const row    = queryOne(`SELECT val FROM dem_seq`);
  const num    = String(row.val).padStart(4, '0');
  const suffix = pays ? `-${pays.toUpperCase()}` : '';
  return `DEM-${num}${suffix}`;
}

/** Get a setting value */
export function getSetting(key, fallback = '') {
  const row = queryOne(`SELECT valeur FROM settings WHERE cle=?`, [key]);
  return row ? (row.valeur ?? fallback) : fallback;
}

/** Set a setting value */
export async function setSetting(key, value) {
  run(`INSERT INTO settings(cle,valeur) VALUES(?,?) ON CONFLICT(cle) DO UPDATE SET valeur=excluded.valeur, date_modification=datetime('now')`, [key, value]);
  await saveDB();
}

// ── IndexedDB helpers ─────────────────────────────────────

function _idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}

async function _idbLoad() {
  try {
    const idb = await _idbOpen();
    return new Promise((res, rej) => {
      const tx = idb.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(DB_KEY);
      req.onsuccess = e => res(e.target.result || null);
      req.onerror = e => rej(e.target.error);
    });
  } catch { return null; }
}

async function _idbSave() {
  try {
    const data = _db.export();
    const idb = await _idbOpen();
    return new Promise((res, rej) => {
      const tx = idb.transaction('kv', 'readwrite');
      const req = tx.objectStore('kv').put(data, DB_KEY);
      req.onsuccess = () => res();
      req.onerror = e => rej(e.target.error);
    });
  } catch (e) { console.error('[DB] save failed', e); }
}

/** Wipe and recreate (admin reset) */
export async function resetDB() {
  const idb = await _idbOpen();
  await new Promise((res, rej) => {
    const tx = idb.transaction('kv', 'readwrite');
    const req = tx.objectStore('kv').delete(DB_KEY);
    req.onsuccess = () => res();
    req.onerror = e => rej(e.target.error);
  });
  _db = null;
  await initDB();
}
