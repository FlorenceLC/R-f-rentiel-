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
  `;

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

  container.innerHTML = `
    <div class="hero" style="padding:18px 24px;">
      <h1>🤖 Paramètres IA</h1>
      <p>Configurez l'accès à l'API IA compatible OpenAI. Ces données sont stockées localement dans votre navigateur.</p>
    </div>

    <div class="card" style="max-width:600px;">
      <div class="alert alert-info mb-2">🔒 Les informations saisies ici sont stockées <strong>uniquement dans votre navigateur</strong> (IndexedDB local). Elles ne sont jamais envoyées à un serveur externe autre que l'API IA que vous configurez.</div>

      <div class="form-group">
        <label class="form-label">URL de l'API <span class="required">*</span></label>
        <input class="form-control" id="ia-url" value="${baseUrl}" placeholder="https://api.openai.com">
        <div class="form-hint">URL de base de l'API (compatible OpenAI). Exemple : https://api.openai.com</div>
      </div>
      <div class="form-group">
        <label class="form-label">Clé API <span class="required">*</span></label>
        <div style="position:relative">
          <input class="form-control" type="password" id="ia-key" value="${apiKey}" placeholder="sk-…" style="padding-right:80px">
          <button class="btn btn-ghost btn-sm" onclick="window._togglePwdVis('ia-key',this)" style="position:absolute;right:4px;top:4px;">👁 Afficher</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Clé Gravitee API Gateway <span class="text-muted">(optionnel)</span></label>
        <div style="position:relative">
          <input class="form-control" type="password" id="ia-gravitee" value="${graviteeKey}" placeholder="Laissez vide si non utilisé" style="padding-right:80px">
          <button class="btn btn-ghost btn-sm" onclick="window._togglePwdVis('ia-gravitee',this)" style="position:absolute;right:4px;top:4px;">👁 Afficher</button>
        </div>
        <div class="form-hint">Ajouté comme en-tête <code>X-Gravitee-Api-Key</code> si renseigné.</div>
      </div>
      <div class="form-group">
        <label class="form-label">Modèle</label>
        <input class="form-control" id="ia-model" value="${model}" list="model-suggestions" placeholder="gpt-4">
        <datalist id="model-suggestions">
          <option value="gpt-4"><option value="gpt-4o"><option value="gpt-3.5-turbo">
          <option value="claude-sonnet-4-6"><option value="claude-opus-5"><option value="mistral-7b-instruct">
        </datalist>
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
          <div class="section-title mb-2">🏴 Mode bilingue FR / DE</div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:12px">
            <input type="checkbox" id="p-bilingual" ${gs('bilingual_mode')==='true'?'checked':''}>
            <span class="form-label" style="margin:0">Activer le mode bilingue KNDS FR/DE</span>
          </label>
          <div class="form-group"><label class="form-label">Libellé onglet France</label>
            <input class="form-control" id="p-tab-fr" value="${gs('special_tab_fr')||'Spécial France'}" placeholder="Spécial France"></div>
          <div class="form-group"><label class="form-label">Libellé onglet Allemagne</label>
            <input class="form-control" id="p-tab-de" value="${gs('special_tab_de')||'Spécial Allemagne'}" placeholder="Spécial Allemagne"></div>
          <div class="form-hint">Les CU marqués comme "Spécial FR" ou "Spécial DE" apparaissent dans l'onglet correspondant.</div>
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
  `;

  // ── Save ──────────────────────────────────────────────────────────────────
  container.querySelector('#p-save').addEventListener('click', async () => {
    await ss('app_name',          container.querySelector('#p-name').value);
    await ss('app_department',    container.querySelector('#p-dept').value);
    await ss('app_contact_email', container.querySelector('#p-email').value);
    await ss('app_contact_cc',    container.querySelector('#p-cc').value);
    await ss('app_contact_subject', container.querySelector('#p-subject').value);
    await ss('app_contact_body',  container.querySelector('#p-body').value);
    await ss('show_roi_public',   container.querySelector('#p-roi').checked ? 'true' : 'false');
    await ss('app_lang',          container.querySelector('#p-lang').value);
    await ss('bilingual_mode',    container.querySelector('#p-bilingual').checked ? 'true' : 'false');
    await ss('special_tab_fr',    container.querySelector('#p-tab-fr').value || 'Spécial France');
    await ss('special_tab_de',    container.querySelector('#p-tab-de').value || 'Spécial Allemagne');
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
