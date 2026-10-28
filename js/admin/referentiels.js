import { query, queryOne, run, saveDB } from '../modules/db.js';
import { toast, openModal, closeModal, emptyState, sectionTitle } from '../modules/ui.js';
import { hashPassword } from '../modules/auth.js';

// ══════════════════════════════════════════════════════════
// RÉFÉRENTIELS
// ══════════════════════════════════════════════════════════
export function renderAdminReferentiels(container) {
  _renderRef(container);
}

function _renderRef(container) {
  const sections = [
    { key: 'need_types',    label: '🏷️ Types de besoin',   cols: ['libelle','description'] },
    { key: 'technologies',  label: '⚙️ Technologies',       cols: ['libelle','description'] },
    { key: 'subject_types', label: '📂 Types de sujet',    cols: ['libelle','description'] },
  ];

  container.innerHTML = `
    <div class="hero" style="padding:18px 24px;">
      <h1>🔧 Référentiels</h1>
      <p>Gérez les listes de valeurs utilisées dans l'application.</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;">
      ${sections.map(sec => {
        const rows = query(`SELECT * FROM ${sec.key} WHERE actif=1 ORDER BY ordre`);
        return `
          <div class="card">
            <div class="card-header">
              <div class="card-title">${sec.label}</div>
              <button class="btn btn-success btn-sm" onclick="window._addRef('${sec.key}')">+</button>
            </div>
            <div id="ref-${sec.key}">
              ${rows.length ? rows.map(r => `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--gray-border)">
                  <span style="flex:1;font-size:13px;font-weight:500">${r.libelle}</span>
                  <button class="btn btn-ghost btn-sm" title="Supprimer" onclick="window._delRef('${sec.key}',${r.id},'${r.libelle}')">🗑️</button>
                </div>`).join('')
              : `<div class="text-muted text-sm" style="padding:8px 0">Aucune valeur</div>`}
            </div>
          </div>`;
      }).join('')}
    </div>

    <div class="card" style="margin-top:20px;">
      <div class="card-header">
        <div class="card-title">🏢 Directions / Services</div>
      </div>
      <p class="text-sm text-muted" style="margin-bottom:10px;">Personnalisez les noms proposés dans le formulaire « Soumettre un besoin ». Renommer une direction met aussi à jour les demandes existantes.</p>
      <div id="dir-list">
        ${query(`SELECT * FROM directions WHERE actif=1 ORDER BY ordre,id`).map(d => `
          <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--gray-border)">
            <input class="form-control dir-input" data-id="${d.id}" data-old="${String(d.libelle).replace(/"/g,'&quot;')}" value="${String(d.libelle).replace(/"/g,'&quot;')}" style="flex:1;">
            <button class="btn btn-outline btn-sm dir-save" data-id="${d.id}" title="Enregistrer le nom">💾</button>
            <button class="btn btn-ghost btn-sm dir-del" data-id="${d.id}" title="Supprimer">🗑️</button>
          </div>`).join('') || '<div class="text-muted text-sm">Aucune direction.</div>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <input class="form-control" id="dir-new" placeholder="Nouvelle direction / service…" style="flex:1;">
        <button class="btn btn-success" id="dir-add">+ Ajouter</button>
      </div>
    </div>
  `;

  container.querySelectorAll('.dir-save').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.id;
    const input = container.querySelector(`.dir-input[data-id="${id}"]`);
    const oldName = input.dataset.old, newName = input.value.trim();
    if (!newName) { toast('Le nom ne peut pas être vide.', 'danger'); return; }
    if (newName === oldName) return;
    if (queryOne(`SELECT id FROM directions WHERE libelle=? AND id!=?`, [newName, id])) { toast('Ce nom existe déjà.', 'danger'); return; }
    run(`UPDATE directions SET libelle=? WHERE id=?`, [newName, id]);
    run(`UPDATE requests SET direction=? WHERE direction=?`, [newName, oldName]);
    run(`UPDATE use_cases SET direction=? WHERE direction=?`, [newName, oldName]);
    saveDB();
    toast(`« ${oldName} » renommée en « ${newName} ».`, 'success');
    _renderRef(container);
  }));

  container.querySelectorAll('.dir-del').forEach(btn => btn.addEventListener('click', () => {
    const input = container.querySelector(`.dir-input[data-id="${btn.dataset.id}"]`);
    if (!confirm(`Supprimer « ${input.dataset.old} » de la liste ? (les demandes existantes la conservent)`)) return;
    run(`UPDATE directions SET actif=0 WHERE id=?`, [btn.dataset.id]);
    saveDB();
    toast('Direction supprimée de la liste.', 'warning');
    _renderRef(container);
  }));

  container.querySelector('#dir-add').addEventListener('click', () => {
    const name = container.querySelector('#dir-new').value.trim();
    if (!name) { toast('Saisissez un nom.', 'danger'); return; }
    const existing = queryOne(`SELECT id,actif FROM directions WHERE libelle=?`, [name]);
    const maxO = queryOne(`SELECT MAX(ordre) AS m FROM directions`)?.m || 0;
    if (existing?.actif) { toast('Cette direction existe déjà.', 'danger'); return; }
    if (existing) run(`UPDATE directions SET actif=1, ordre=? WHERE id=?`, [maxO + 1, existing.id]);
    else run(`INSERT INTO directions(libelle,ordre) VALUES(?,?)`, [name, maxO + 1]);
    saveDB();
    toast('Direction ajoutée.', 'success');
    _renderRef(container);
  });

  window._addRef = (table) => {
    openModal(`
      <div class="modal-header"><div class="modal-title">Ajouter une valeur</div>
        <button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="form-group"><label class="form-label">Libellé <span class="required">*</span></label>
        <input class="form-control" id="ref-libelle" autofocus></div>
      <div class="form-group"><label class="form-label">Description</label>
        <input class="form-control" id="ref-desc"></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
        <button class="btn btn-primary" id="ref-save">Ajouter</button>
      </div>`);
    document.querySelector('#ref-save').addEventListener('click', () => {
      const lib = document.querySelector('#ref-libelle').value.trim();
      if (!lib) { toast('Libellé obligatoire', 'danger'); return; }
      const desc = document.querySelector('#ref-desc').value.trim();
      const maxOrdre = queryOne(`SELECT MAX(ordre) AS m FROM ${table}`)?.m || 0;
      run(`INSERT INTO ${table}(libelle,description,actif,ordre) VALUES(?,?,1,?)`, [lib, desc||null, maxOrdre+1]);
      saveDB();
      closeModal();
      toast('Valeur ajoutée.', 'success');
      _renderRef(container);
    });
  };

  window._delRef = (table, id, libelle) => {
    if (!confirm(`Supprimer "${libelle}" ?`)) return;
    run(`UPDATE ${table} SET actif=0 WHERE id=?`, [id]);
    saveDB();
    toast(`"${libelle}" supprimé.`, 'warning');
    _renderRef(container);
  };
}

// ══════════════════════════════════════════════════════════
// UTILISATEURS
// ══════════════════════════════════════════════════════════
export function renderAdminUsers(container) {
  _renderUsers(container);
}

function _renderUsers(container) {
  const users = query(`SELECT * FROM users ORDER BY nom,prenom`);

  container.innerHTML = `
    <div class="hero" style="padding:18px 24px;">
      <h1 style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        👥 Utilisateurs
        <button class="btn btn-success" id="btn-add-user">+ Nouvel utilisateur</button>
      </h1>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Identifiant</th><th>Nom</th><th>Email</th><th>Rôle</th><th>Pays</th><th>Actif</th><th>Dernière connexion</th><th>Actions</th></tr></thead>
        <tbody>
          ${users.map(u=>`<tr>
            <td class="text-mono" style="font-size:12px">${u.username}</td>
            <td style="font-weight:500">${u.prenom||''} ${u.nom||''}</td>
            <td class="text-sm text-muted">${u.email}</td>
            <td><span class="badge badge-besoin">${u.role}</span></td>
            <td>${u.pays==='FR'?'🇫🇷 France':u.pays==='DE'?'🇩🇪 Allemagne':'—'}</td>
            <td>${u.actif?'🟢':'⭕'}</td>
            <td class="text-sm text-muted">${u.derniere_connexion ? new Date(u.derniere_connexion).toLocaleDateString('fr-FR') : '—'}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-outline btn-sm" onclick="window._editUser(${u.id})">✏️</button>
              <button class="btn btn-ghost btn-sm" onclick="window._toggleUser(${u.id},${u.actif?0:1},'${u.username}')">${u.actif?'🚫':'✅'}</button>
              <button class="btn btn-ghost btn-sm" onclick="window._resetPwd(${u.id},'${u.username}')">🔑</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#btn-add-user').addEventListener('click', () => _openUserModal(null, container));

  window._editUser = id => _openUserModal(id, container);
  window._toggleUser = (id, val, uname) => {
    run(`UPDATE users SET actif=?,date_modification=datetime('now') WHERE id=?`, [val, id]);
    saveDB();
    toast(`Utilisateur "${uname}" ${val?'activé':'désactivé'}.`, 'info');
    _renderUsers(container);
  };
  window._resetPwd = async (id, uname) => {
    const pwd = prompt(`Nouveau mot de passe pour "${uname}" :`);
    if (!pwd) return;
    if (pwd.length < 6) { toast('Le mot de passe doit faire au moins 6 caractères.', 'danger'); return; }
    const hash = await hashPassword(pwd);
    run(`UPDATE users SET password_hash=?,date_modification=datetime('now') WHERE id=?`, [hash, id]);
    saveDB();
    toast(`Mot de passe mis à jour pour "${uname}".`, 'success');
  };
}

function _openUserModal(userId, container) {
  const u = userId ? queryOne(`SELECT * FROM users WHERE id=?`, [userId]) : null;
  const roles = ['ADMIN_GLOBAL','ADMIN_I'];

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${u?'✏️ Modifier':'➕ Nouvel utilisateur'}</div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="form-grid form-grid-2">
      <div class="form-group"><label class="form-label">Prénom</label>
        <input class="form-control" id="u-prenom" value="${u?.prenom||''}"></div>
      <div class="form-group"><label class="form-label">Nom</label>
        <input class="form-control" id="u-nom" value="${u?.nom||''}"></div>
      <div class="form-group"><label class="form-label">Identifiant <span class="required">*</span></label>
        <input class="form-control" id="u-username" value="${u?.username||''}" ${u?'readonly':''}></div>
      <div class="form-group"><label class="form-label">Email <span class="required">*</span></label>
        <input class="form-control" type="email" id="u-email" value="${u?.email||''}"></div>
      <div class="form-group"><label class="form-label">Rôle</label>
        <select class="form-control" id="u-role">
          ${roles.map(r=>`<option ${r===(u?.role||'ADMIN_I')?'selected':''}>${r}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Pays (mode bilingue)</label>
        <select class="form-control" id="u-pays">
          <option value="" ${!u?.pays?'selected':''}>— Non défini —</option>
          <option value="FR" ${u?.pays==='FR'?'selected':''}>🇫🇷 France</option>
          <option value="DE" ${u?.pays==='DE'?'selected':''}>🇩🇪 Allemagne</option>
        </select></div>
      ${!u ? `<div class="form-group"><label class="form-label">Mot de passe <span class="required">*</span></label>
        <input class="form-control" type="password" id="u-pwd" placeholder="Min. 6 caractères"></div>` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" id="u-save">💾 Enregistrer</button>
    </div>`);

  document.querySelector('#u-save').addEventListener('click', async () => {
    const username = document.querySelector('#u-username').value.trim();
    const email    = document.querySelector('#u-email').value.trim();
    const prenom   = document.querySelector('#u-prenom').value.trim();
    const nom      = document.querySelector('#u-nom').value.trim();
    const role     = document.querySelector('#u-role').value;
    const pays     = document.querySelector('#u-pays').value || null;
    if (!username || !email) { toast('Identifiant et email sont obligatoires.', 'danger'); return; }
    if (u) {
      run(`UPDATE users SET prenom=?,nom=?,email=?,role=?,pays=?,date_modification=datetime('now') WHERE id=?`,
        [prenom, nom, email, role, pays, u.id]);
      toast('Utilisateur mis à jour.', 'success');
    } else {
      const pwd = document.querySelector('#u-pwd')?.value;
      if (!pwd || pwd.length < 6) { toast('Mot de passe d\'au moins 6 caractères requis.', 'danger'); return; }
      const hash = await hashPassword(pwd);
      run(`INSERT INTO users(username,password_hash,prenom,nom,email,role,pays,actif) VALUES(?,?,?,?,?,?,?,1)`,
        [username, hash, prenom, nom, email, role, pays]);
      toast(`Utilisateur "${username}" créé.`, 'success');
    }
    saveDB();
    closeModal();
    _renderUsers(container);
  });
}

// ══════════════════════════════════════════════════════════
// PARAMÈTRES IA
// ══════════════════════════════════════════════════════════
export function renderAdminParamsIA(container) {
  const { query: q, getSetting, setSetting } = { query, getSetting: (k,d='')=>{
    const r = queryOne(`SELECT valeur FROM settings WHERE cle=?`,[k]); return r ? (r.valeur??d) : d;
  }, setSetting: async (k,v) => { run(`INSERT INTO settings(cle,valeur) VALUES(?,?) ON CONFLICT(cle) DO UPDATE SET valeur=excluded.valeur,date_modification=datetime('now')`, [k,v]); await saveDB(); }};

  const baseUrl     = getSetting('ai_base_url');
  const apiKey      = getSetting('ai_api_key');
  const model       = getSetting('ai_model','gpt-4');
  const graviteeKey = getSetting('ai_gravitee_key','');

  // Detect current provider from model
  const isGemini = model.toLowerCase().startsWith('gemini');

  container.innerHTML = `
    <div class="hero" style="padding:18px 24px;">
      <h1>🤖 Paramètres IA</h1>
      <p>Configurez l'accès à l'API IA. Ces données sont stockées localement dans votre navigateur.</p>
    </div>

    <div class="card" style="max-width:640px;">
      <div class="alert alert-info mb-2">🔒 Les informations saisies ici sont stockées <strong>uniquement dans votre navigateur</strong> (IndexedDB local).</div>

      <div class="form-group">
        <label class="form-label">Fournisseur IA</label>
        <select class="form-control" id="ia-provider">
          <option value="openai" ${!isGemini?'selected':''}>🏢 API interne / OpenAI-compatible (Gravitee…)</option>
          <option value="gemini" ${isGemini?'selected':''}>✨ Google Gemini</option>
        </select>
      </div>

      <!-- Bloc OpenAI-compatible -->
      <div id="ia-openai-fields" style="${isGemini?'display:none':''}">
        <div class="form-group">
          <label class="form-label">URL de l'API <span class="required">*</span></label>
          <input class="form-control" id="ia-url" value="${baseUrl}" placeholder="https://apimanager.exemple.intra/…">
          <div class="form-hint">URL de base (sans /v1/chat/completions). Exemple : https://api.openai.com</div>
        </div>
        <div class="form-group">
          <label class="form-label">Clé Gravitee API Gateway <span class="text-muted">(optionnel)</span></label>
          <div style="position:relative">
            <input class="form-control" type="password" id="ia-gravitee" value="${graviteeKey}" placeholder="Laissez vide si non utilisé" style="padding-right:80px">
            <button class="btn btn-ghost btn-sm" onclick="window._togglePwdVis('ia-gravitee',this)" style="position:absolute;right:4px;top:4px;">👁 Afficher</button>
          </div>
          <div class="form-hint">Ajouté comme en-tête <code>X-Gravitee-Api-Key</code> si renseigné.</div>
        </div>
      </div>

      <!-- Bloc Gemini -->
      <div id="ia-gemini-fields" style="${isGemini?'':'display:none'}">
        <div class="alert alert-info" style="font-size:12px;margin-bottom:12px;">
          ✨ Gemini utilise directement <code>generativelanguage.googleapis.com</code> — aucune URL de base n'est nécessaire.<br>
          Obtenez votre clé sur <a href="https://aistudio.google.com/apikey" target="_blank">Google AI Studio</a>.
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Clé API <span class="required">*</span></label>
        <div style="position:relative">
          <input class="form-control" type="password" id="ia-key" value="${apiKey}" placeholder="${isGemini?'AIza…':'sk-…'}" style="padding-right:80px">
          <button class="btn btn-ghost btn-sm" onclick="window._togglePwdVis('ia-key',this)" style="position:absolute;right:4px;top:4px;">👁 Afficher</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Modèle</label>
        <input class="form-control" id="ia-model" value="${model}" list="model-suggestions" placeholder="gpt-4 ou gemini-3.5-flash-lite">
        <datalist id="model-suggestions">
          <option value="gemini-3.5-flash-lite">
          <option value="gpt-4">
          <option value="gpt-4o">
          <option value="gpt-3.5-turbo">
          <option value="mistral-7b-instruct">
        </datalist>
        <div class="form-hint" id="ia-model-hint">
          ${isGemini
            ? '✨ Modèle Gemini — utilise l\'API Google Generative Language.'
            : '🏢 Modèle OpenAI-compatible — utilise l\'URL configurée ci-dessus.'}
        </div>
      </div>

      <div class="flex gap-1 mt-2">
        <button class="btn btn-ghost" id="ia-test">🔌 Tester la connexion</button>
        <button class="btn btn-primary" id="ia-save">💾 Enregistrer</button>
      </div>
      <div id="ia-test-result" class="mt-2"></div>
    </div>
  `;

  window._togglePwdVis = (inputId, btn) => {
    const input = document.getElementById(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁 Afficher' : '🙈 Masquer';
  };

  // Toggle fields based on provider
  container.querySelector('#ia-provider').addEventListener('change', e => {
    const gem = e.target.value === 'gemini';
    container.querySelector('#ia-openai-fields').style.display = gem ? 'none' : '';
    container.querySelector('#ia-gemini-fields').style.display = gem ? '' : 'none';
    container.querySelector('#ia-model').placeholder = gem ? 'gemini-3.5-flash-lite' : 'gpt-4';
    container.querySelector('#ia-key').placeholder = gem ? 'AIza…' : 'sk-…';
    if (gem && !container.querySelector('#ia-model').value.startsWith('gemini')) {
      container.querySelector('#ia-model').value = 'gemini-3.5-flash-lite';
    }
  });

  // Update hint when model changes
  container.querySelector('#ia-model').addEventListener('input', e => {
    const gem = e.target.value.toLowerCase().startsWith('gemini');
    container.querySelector('#ia-model-hint').textContent = gem
      ? '✨ Modèle Gemini — utilise l\'API Google Generative Language.'
      : '🏢 Modèle OpenAI-compatible — utilise l\'URL configurée ci-dessus.';
    container.querySelector('#ia-openai-fields').style.display = gem ? 'none' : '';
    container.querySelector('#ia-gemini-fields').style.display = gem ? '' : 'none';
  });

  container.querySelector('#ia-save').addEventListener('click', async () => {
    const url = container.querySelector('#ia-url').value.trim();
    const key = container.querySelector('#ia-key').value.trim();
    const mod = container.querySelector('#ia-model').value.trim() || 'gpt-4';
    const grav = container.querySelector('#ia-gravitee').value.trim();
    await setSetting('ai_base_url', url);
    await setSetting('ai_api_key', key);
    await setSetting('ai_model', mod);
    await setSetting('ai_gravitee_key', grav);
    toast('Configuration IA enregistrée.', 'success');
  });

  container.querySelector('#ia-test').addEventListener('click', async () => {
    const res = container.querySelector('#ia-test-result');
    res.innerHTML = '<span class="spinner"></span> Test en cours…';
    const { testAIConnection } = await import('../modules/ai.js');
    const { ok, text } = await testAIConnection();
    res.innerHTML = ok
      ? `<div class="alert alert-success">✅ Connexion réussie : ${text}</div>`
      : `<div class="alert alert-danger">❌ Échec : ${text}</div>`;
  });
}

// ══════════════════════════════════════════════════════════
// PARAMÈTRES GÉNÉRAUX
// ══════════════════════════════════════════════════════════
export function renderAdminParams(container) {
  const gs = k => { const r = queryOne(`SELECT valeur FROM settings WHERE cle=?`,[k]); return r ? (r.valeur??'') : ''; };
  const ss = async (k,v) => { run(`INSERT INTO settings(cle,valeur) VALUES(?,?) ON CONFLICT(cle) DO UPDATE SET valeur=excluded.valeur`, [k,v]); await saveDB(); };

  container.innerHTML = `
    <div class="hero" style="padding:18px 24px;"><h1>⚙️ Paramètres généraux</h1></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:0 0 24px;max-width:1000px;">

      <!-- Colonne gauche -->
      <div>
        <div class="card mb-2">
          <div class="section-title mb-2">🏢 Application</div>
          <div class="form-group"><label class="form-label">Nom de l'application</label>
            <input class="form-control" id="p-name" value="${gs('app_name')}"></div>
          <div class="form-group"><label class="form-label">Département</label>
            <input class="form-control" id="p-dept" value="${gs('app_department')}"></div>
        </div>

        <div class="card mb-2">
          <div class="section-title mb-2">📬 Contact</div>
          <div class="form-group"><label class="form-label">Email de contact principal</label>
            <input class="form-control" type="email" id="p-email" value="${gs('app_contact_email')}"></div>
          <div class="form-group"><label class="form-label">CC (séparés par virgules)</label>
            <input class="form-control" id="p-cc" value="${gs('app_contact_cc')}" placeholder="email1@, email2@"></div>
          <div class="form-group"><label class="form-label">Objet du mail</label>
            <input class="form-control" id="p-subject" value="${gs('app_contact_subject')||'Demande d\'information'}"></div>
          <div class="form-group"><label class="form-label">Corps du mail (optionnel)</label>
            <textarea class="form-control" id="p-body" rows="3">${gs('app_contact_body')}</textarea></div>
        </div>

        <div class="card mb-2">
          <div class="section-title mb-2">👁️ Visibilité</div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px">
            <input type="checkbox" id="p-roi" ${gs('show_roi_public')==='true'?'checked':''}>
            <span class="form-label" style="margin:0">Afficher les ROI aux visiteurs</span>
          </label>
        </div>

        <div class="card mb-2">
          <div class="section-title mb-2">💶 Calcul du ROI</div>
          <div class="form-group"><label class="form-label">Heures travaillées par jour</label>
            <input class="form-control" type="number" step="0.01" min="0" id="p-roi-hj" value="${gs('roi_heures_jour')||'7.37'}"></div>
          <div class="form-group"><label class="form-label">Coût horaire (€/heure)</label>
            <input class="form-control" type="number" step="0.01" min="0" id="p-roi-ch" value="${gs('roi_cout_horaire')||'112'}"></div>
          <div class="form-hint">Heures = jours × h/jour · Coût = heures × €/h · ROI/livrable = coût × gain IA % · ROI annuel = ROI/livrable × livrables/an.</div>
        </div>
      </div>

      <!-- Colonne droite -->
      <div>
        <div class="card mb-2">
          <div class="section-title mb-2">🌐 Langue de l'interface</div>
          <div class="form-group"><label class="form-label">Langue</label>
            <select class="form-control" id="p-lang">
              <option value="fr" ${gs('app_lang')==='fr'?'selected':''}>🇫🇷 Français</option>
              <option value="en" ${gs('app_lang')==='en'?'selected':''}>🇬🇧 English</option>
              <option value="de" ${gs('app_lang')==='de'?'selected':''}>🇩🇪 Deutsch</option>
            </select>
            <div class="form-hint">L'interface sera rechargée après sauvegarde.</div>
          </div>
        </div>

        <div class="card mb-2">
          <div class="section-title mb-2">🏴 Mode spécial KNDS FR / DE</div>
          <div class="form-group">
            <label class="form-label">Pays de cette instance</label>
            <select class="form-control" id="p-pays-admin">
              <option value="" ${!gs('pays_admin')?'selected':''}>— Non défini —</option>
              <option value="FR" ${gs('pays_admin')==='FR'?'selected':''}>🇫🇷 France</option>
              <option value="DE" ${gs('pays_admin')==='DE'?'selected':''}>🇩🇪 Allemagne</option>
            </select>
            <div class="form-hint">Pays appliqué à toute l'application (admin et visiteur) : il est présélectionné dans le formulaire de demande et à la création d'une fiche CU.</div>
          </div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:12px">
            <input type="checkbox" id="p-bilingual" ${gs('bilingual_mode')==='true'?'checked':''}>
            <span class="form-label" style="margin:0">Activer le mode spécial KNDS FR/DE</span>
          </label>
          <div class="form-group"><label class="form-label">Libellé de l'onglet spécial</label>
            <input class="form-control" id="p-tab-label" value="${gs('special_tab_label') || (gs('pays_admin')==='DE' ? (gs('special_tab_de')||'Spécial Allemagne') : gs('pays_admin')==='FR' ? (gs('special_tab_fr')||'Spécial France') : '')}" placeholder="Spécial France / Spécial Allemagne"></div>
          <div class="form-hint">L'onglet n'est affiché que si le mode spécial est activé et qu'un pays est défini. Les CU « Spécial FR » ou « Spécial DE » y apparaissent.</div>
        </div>

        <div class="card mb-2">
          <div class="section-title mb-2">☁️ Synchronisation GitHub Gist</div>
          <div class="alert alert-info" style="font-size:12px;margin-bottom:12px;">
            La base de données est chiffrée en base64 et stockée dans un Gist <strong>privé</strong>.
            Créez un token PAT avec le scope <code>gist</code> uniquement sur <a href="https://github.com/settings/tokens" target="_blank">github.com/settings/tokens</a>.
          </div>
          <div class="form-group"><label class="form-label">ID du Gist <span class="text-muted">(laissez vide pour en créer un nouveau)</span></label>
            <input class="form-control" id="p-gist-id" value="${gs('gist_id')}" placeholder="abc123def456…"></div>
          <div class="form-group"><label class="form-label">Token GitHub (PAT)</label>
            <div style="position:relative">
              <input class="form-control" type="password" id="p-gist-token" value="${gs('gist_token')}" placeholder="ghp_…" style="padding-right:80px">
              <button class="btn btn-ghost btn-sm" onclick="this.previousElementSibling.type=this.previousElementSibling.type==='password'?'text':'password';this.textContent=this.previousElementSibling.type==='password'?'👁 Voir':'🙈 Masquer'" style="position:absolute;right:4px;top:4px;font-size:11px;">👁 Voir</button>
            </div>
          </div>
          <div class="flex gap-1 mt-1">
            <button class="btn btn-outline btn-sm" id="p-gist-push">⬆️ Sauvegarder vers Gist</button>
            <button class="btn btn-outline btn-sm" id="p-gist-pull">⬇️ Restaurer depuis Gist</button>
            <button class="btn btn-ghost btn-sm" id="p-gist-info">ℹ️ Statut</button>
          </div>
          <div id="p-gist-status" style="font-size:12px;margin-top:8px;color:var(--text-muted);"></div>
        </div>
      </div>
    </div>

    <div style="max-width:1000px;display:flex;gap:8px;padding-bottom:24px;">
      <button class="btn btn-primary" id="p-save">💾 Enregistrer les paramètres</button>
      <button class="btn btn-danger" id="p-reset" style="margin-left:auto">🗑️ Réinitialiser la base de données</button>
    </div>

    <!-- Export / Import CU entre pays -->
    <div style="max-width:1000px;margin-bottom:32px;">
      <div class="card">
        <div class="section-title mb-2">🔄 Export / Import de cas d'usage (entre pays)</div>
        <div class="alert alert-info" style="font-size:12px;margin-bottom:14px;">
          Transfère uniquement les CU marqués <strong>Commun FR+DE</strong>.<br>
          Les CU <em>Spécial France</em> et <em>Spécial Allemagne</em> sont <strong>exclus</strong>.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
          <div>
            <div style="font-weight:600;margin-bottom:10px;">⬇️ Exporter vers un fichier JSON</div>
            <div class="form-group">
              <label class="form-label">Filtrer par pays source</label>
              <select class="form-control" id="exp-country">
                <option value="">🌍 Tous les CU communs</option>
                <option value="FR">🇫🇷 CU communs — origine France</option>
                <option value="DE">🇩🇪 CU communs — origine Allemagne</option>
              </select>
              <div class="form-hint">Le fichier JSON peut ensuite être importé sur l'instance de l'autre pays.</div>
            </div>
            <button class="btn btn-primary" id="p-export">⬇️ Exporter les CU communs</button>
            <div id="exp-status" class="text-sm mt-1" style="color:var(--green)"></div>
          </div>
          <div>
            <div style="font-weight:600;margin-bottom:10px;">⬆️ Importer depuis un fichier JSON</div>
            <div class="form-group">
              <label class="form-label">Fichier exporté (.json)</label>
              <input type="file" class="form-control" id="imp-file" accept=".json">
            </div>
            <div class="form-group">
              <label class="form-label">Pays cible (pour adapter les IDs)</label>
              <select class="form-control" id="imp-country">
                <option value="">Conserver les IDs d'origine</option>
                <option value="FR">🇫🇷 France (suffixe -FR)</option>
                <option value="DE">🇩🇪 Allemagne (suffixe -DE)</option>
              </select>
            </div>
            <button class="btn btn-outline" id="p-import">⬆️ Importer</button>
            <div id="imp-status" class="text-sm mt-1"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- BDD Locale JSON -->
    <div style="max-width:1000px;margin-bottom:32px;">
      <div class="card">
        <div class="section-title mb-2">📂 Base de données locale JSON (indépendante du Gist)</div>
        <div class="alert alert-info" style="font-size:12px;margin-bottom:14px;">
          Importez un fichier JSON de CU qui sera chargé <strong>en parallèle</strong> de la base SQLite principale, sans l'écraser et sans interférer avec la synchronisation Gist.
          Les CU locaux apparaissent dans le catalogue avec un badge <span style="background:#f6ad55;color:#1a202c;padding:1px 5px;border-radius:3px;font-size:11px;">LOCAL</span>.
        </div>
        <div id="localdb-meta" style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">Chargement…</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
          <div>
            <div style="font-weight:600;margin-bottom:10px;">⬆️ Importer un fichier JSON local</div>
            <div class="form-group">
              <label class="form-label">Fichier JSON (.json)</label>
              <input type="file" class="form-control" id="localdb-file" accept=".json">
              <div class="form-hint">Format attendu : <code>{"use_cases": [...]}</code> ou tableau direct.</div>
            </div>
            <button class="btn btn-primary" id="localdb-import">📂 Charger en BDD locale</button>
            <div id="localdb-import-status" class="text-sm mt-1"></div>
          </div>
          <div>
            <div style="font-weight:600;margin-bottom:10px;">🗂️ Gestion de la BDD locale</div>
            <div class="flex gap-1 mt-2">
              <button class="btn btn-outline btn-sm" id="localdb-export">⬇️ Exporter la BDD locale</button>
              <button class="btn btn-danger btn-sm" id="localdb-clear">🗑️ Supprimer la BDD locale</button>
            </div>
            <div id="localdb-action-status" class="text-sm mt-1"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // ── Load local DB meta ────────────────────────────────────────────────────
  (async () => {
    const { getLocalDBMeta } = await import('../modules/localdb.js');
    const meta = await getLocalDBMeta();
    const metaEl = container.querySelector('#localdb-meta');
    if (meta) {
      metaEl.innerHTML = `✅ BDD locale active — <strong>${meta.count} CU</strong> chargés depuis <em>${meta.source_file || 'fichier inconnu'}</em>, importé le ${new Date(meta.imported_at).toLocaleString('fr-FR')}`;
    } else {
      metaEl.textContent = 'Aucune BDD locale importée.';
    }
  })();

  container.querySelector('#localdb-import').addEventListener('click', async () => {
    const file = container.querySelector('#localdb-file').files[0];
    const statusEl = container.querySelector('#localdb-import-status');
    if (!file) { statusEl.textContent = '⚠️ Sélectionnez un fichier JSON.'; return; }
    statusEl.textContent = '⏳ Import en cours…';
    const { importLocalDB } = await import('../modules/localdb.js');
    const r = await importLocalDB(file);
    if (r.ok) {
      statusEl.innerHTML = `✅ Import réussi : <strong>${r.valid}</strong> CU chargés${r.invalid ? `, ${r.invalid} ignorés` : ''}.`;
      // Refresh meta
      const { getLocalDBMeta } = await import('../modules/localdb.js');
      const meta = await getLocalDBMeta();
      const metaEl = container.querySelector('#localdb-meta');
      if (meta) metaEl.innerHTML = `✅ BDD locale active — <strong>${meta.count} CU</strong> chargés depuis <em>${meta.source_file}</em>`;
    } else {
      statusEl.innerHTML = `❌ ${r.msg}`;
    }
  });

  container.querySelector('#localdb-export').addEventListener('click', async () => {
    const statusEl = container.querySelector('#localdb-action-status');
    const { exportLocalDB } = await import('../modules/localdb.js');
    const r = await exportLocalDB();
    statusEl.textContent = r.ok ? `✅ Export de ${r.count} CU téléchargé.` : `❌ ${r.msg}`;
  });

  container.querySelector('#localdb-clear').addEventListener('click', async () => {
    if (!confirm('Supprimer la BDD locale ? Cela n\'affecte pas la base SQLite principale.')) return;
    const { clearLocalDB } = await import('../modules/localdb.js');
    await clearLocalDB();
    container.querySelector('#localdb-meta').textContent = 'Aucune BDD locale importée.';
    container.querySelector('#localdb-action-status').textContent = '✅ BDD locale supprimée.';
  });

  // ── Save ──────────────────────────────────────────────────────────────────
  container.querySelector('#p-pays-admin').addEventListener('change', e => {
    const d = { FR: 'Spécial France', DE: 'Spécial Allemagne' }[e.target.value] || '';
    container.querySelector('#p-tab-label').value = d;
  });

  container.querySelector('#p-save').addEventListener('click', async () => {
    await ss('app_name',          container.querySelector('#p-name').value);
    await ss('app_department',    container.querySelector('#p-dept').value);
    await ss('app_contact_email', container.querySelector('#p-email').value);
    await ss('app_contact_cc',    container.querySelector('#p-cc').value);
    await ss('app_contact_subject', container.querySelector('#p-subject').value);
    await ss('app_contact_body',  container.querySelector('#p-body').value);
    await ss('show_roi_public',   container.querySelector('#p-roi').checked ? 'true' : 'false');
    await ss('roi_heures_jour',   container.querySelector('#p-roi-hj').value || '7.37');
    await ss('roi_cout_horaire',  container.querySelector('#p-roi-ch').value || '112');
    await ss('app_lang',          container.querySelector('#p-lang').value);
    await ss('bilingual_mode',    container.querySelector('#p-bilingual').checked ? 'true' : 'false');
    await ss('pays_admin',        container.querySelector('#p-pays-admin').value || '');
    await ss('special_tab_label', container.querySelector('#p-tab-label').value.trim());
    await ss('gist_id',           container.querySelector('#p-gist-id').value.trim());
    await ss('gist_token',        container.querySelector('#p-gist-token').value.trim());
    toast('Paramètres enregistrés. Rechargement…', 'success');
    setTimeout(() => location.reload(), 900);
  });

  // ── Gist push ─────────────────────────────────────────────────────────────
  container.querySelector('#p-gist-push').addEventListener('click', async () => {
    // Save token/id first
    await ss('gist_id',    container.querySelector('#p-gist-id').value.trim());
    await ss('gist_token', container.querySelector('#p-gist-token').value.trim());
    const statusEl = container.querySelector('#p-gist-status');
    statusEl.textContent = '⏳ Sauvegarde en cours…';
    const { pushToGist } = await import('../modules/gist.js');
    const r = await pushToGist();
    if (r.ok) {
      await ss('gist_id', r.gist_id);
      container.querySelector('#p-gist-id').value = r.gist_id;
      statusEl.innerHTML = `✅ Sauvegardé le ${new Date(r.updated_at).toLocaleString('fr-FR')} — ID : <code>${r.gist_id}</code>`;
      toast('Base sauvegardée sur GitHub Gist.', 'success');
    } else {
      statusEl.textContent = `❌ ${r.msg}`;
      toast(r.msg, 'danger');
    }
  });

  // ── Gist pull ─────────────────────────────────────────────────────────────
  container.querySelector('#p-gist-pull').addEventListener('click', async () => {
    if (!confirm('⚠️ Restaurer depuis le Gist va écraser toutes les données locales. Continuer ?')) return;
    await ss('gist_id',    container.querySelector('#p-gist-id').value.trim());
    await ss('gist_token', container.querySelector('#p-gist-token').value.trim());
    const statusEl = container.querySelector('#p-gist-status');
    statusEl.textContent = '⏳ Restauration en cours…';
    const { pullFromGist } = await import('../modules/gist.js');
    const r = await pullFromGist();
    if (r.ok) {
      statusEl.textContent = `✅ Restauré depuis le ${new Date(r.updated_at).toLocaleString('fr-FR')} — rechargement…`;
      toast('Restauration réussie.', 'success');
      // importDBBase64 triggers location.reload() internally
    } else {
      statusEl.textContent = `❌ ${r.msg}`;
      toast(r.msg, 'danger');
    }
  });

  // ── Gist status ───────────────────────────────────────────────────────────
  container.querySelector('#p-gist-info').addEventListener('click', async () => {
    await ss('gist_id',    container.querySelector('#p-gist-id').value.trim());
    await ss('gist_token', container.querySelector('#p-gist-token').value.trim());
    const statusEl = container.querySelector('#p-gist-status');
    statusEl.textContent = '⏳ Récupération du statut…';
    const { getGistInfo } = await import('../modules/gist.js');
    const r = await getGistInfo();
    if (r.ok) {
      statusEl.innerHTML = `ℹ️ Dernière mise à jour : ${new Date(r.updated_at).toLocaleString('fr-FR')} — Fichier présent : ${r.has_file ? '✅' : '❌'}`;
    } else {
      statusEl.textContent = `❌ ${r.msg}`;
    }
  });

  container.querySelector('#p-reset').addEventListener('click', async () => {
    if (!confirm('⚠️ Cela supprime TOUTES les données et réinitialise l\'application. Continuer ?')) return;
    const { resetDB } = await import('../modules/db.js');
    await resetDB();
    toast('Base de données réinitialisée.', 'success');
    location.reload();
  });

  // ── Export CU ─────────────────────────────────────────────────────────────
  container.querySelector('#p-export').addEventListener('click', async () => {
    const { exportCU } = await import('../modules/export.js');
    const country = container.querySelector('#exp-country').value || null;
    const result  = exportCU(country);
    const statusEl = container.querySelector('#exp-status');
    if (result.ok) {
      statusEl.textContent = `✅ ${result.count} CU exportés — fichier téléchargé.`;
      statusEl.style.color = 'var(--green)';
    } else {
      statusEl.textContent = `❌ ${result.msg}`;
      statusEl.style.color = 'var(--red)';
    }
  });

  // ── Import CU ─────────────────────────────────────────────────────────────
  container.querySelector('#p-import').addEventListener('click', async () => {
    const fileInput  = container.querySelector('#imp-file');
    const targetCountry = container.querySelector('#imp-country').value || null;
    const statusEl   = container.querySelector('#imp-status');
    if (!fileInput.files.length) {
      statusEl.textContent = '❌ Veuillez sélectionner un fichier JSON.';
      statusEl.style.color = 'var(--red)';
      return;
    }
    statusEl.textContent = '⏳ Import en cours…';
    statusEl.style.color = 'var(--text-muted)';
    const { importCU } = await import('../modules/export.js');
    const r = await importCU(fileInput.files[0], targetCountry);
    if (r.ok) {
      statusEl.innerHTML = `✅ Import terminé — <strong>${r.inserted} insérés</strong>, ${r.skipped} ignorés (déjà présents), ${r.errors} erreurs sur ${r.total} CU.`;
      statusEl.style.color = 'var(--green)';
      toast(`${r.inserted} CU importés avec succès.`, 'success');
    } else {
      statusEl.textContent = `❌ ${r.msg}`;
      statusEl.style.color = 'var(--red)';
    }
  });
}

// ══════════════════════════════════════════════════════════
// ARCHIVES
// ══════════════════════════════════════════════════════════
export function renderAdminArchives(container) {
  const archived = query(`SELECT uc.*, ar.date_archive, ar.motif, ar.archive_par
    FROM use_cases uc LEFT JOIN archives ar ON ar.reference_code = uc.cu_id
    WHERE uc.actif=0 ORDER BY ar.date_archive DESC`);

  container.innerHTML = `
    <div class="hero" style="padding:18px 24px;"><h1>📦 Archives</h1><p>Cas d'usage archivés ou abandonnés.</p></div>
    ${archived.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>ID</th><th>Nom</th><th>Archivé le</th><th>Par</th><th>Motif</th><th>Actions</th></tr></thead>
          <tbody>
            ${archived.map(cu=>`<tr>
              <td class="cu-id">${cu.cu_id}</td>
              <td class="cu-name">${cu.nom}</td>
              <td class="text-sm text-muted">${cu.date_archive ? new Date(cu.date_archive).toLocaleDateString('fr-FR') : '—'}</td>
              <td class="text-sm text-muted">${cu.archive_par||'—'}</td>
              <td class="text-sm text-muted">${cu.motif||'—'}</td>
              <td>
                <button class="btn btn-outline btn-sm" onclick="window._restoreCu('${cu.cu_id}')">♻️ Restaurer</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`
    : emptyState('📦', 'Aucun élément archivé', 'Les cas d\'usage archivés apparaîtront ici.')}
  `;

  window._restoreCu = cuId => {
    if (!confirm(`Restaurer ${cuId} ?`)) return;
    run(`UPDATE use_cases SET actif=1, statut='Besoin identifié', date_modification=datetime('now') WHERE cu_id=?`, [cuId]);
    run(`DELETE FROM archives WHERE reference_code=?`, [cuId]);
    saveDB();
    toast(`${cuId} restauré.`, 'success');
    renderAdminArchives(container);
  };
}
