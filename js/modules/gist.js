/**
 * Gist sync — backup & restore the SQLite DB via a private GitHub Gist.
 * The DB is exported as base64 and stored in a single file inside the Gist.
 * Authentication : personal access token (PAT) with `gist` scope.
 */
import { getSetting, exportDBBase64, importDBBase64 } from './db.js';

const GIST_API  = 'https://api.github.com/gists';
const FILE_NAME = 'referentiel-cu-db.b64';

function _cfg() {
  return {
    id:    getSetting('gist_id', ''),
    token: getSetting('gist_token', ''),
  };
}

function _headers(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

/** Push current DB to Gist (create if no gist_id, update otherwise) */
export async function pushToGist() {
  const { id, token } = _cfg();
  if (!token) return { ok: false, msg: 'Token GitHub non configuré.' };

  const b64 = await exportDBBase64();
  const payload = {
    description: 'Référentiel CU — backup automatique',
    public: false,
    files: { [FILE_NAME]: { content: b64 } },
  };

  try {
    let resp, data;
    if (id) {
      // PATCH existing gist
      resp = await fetch(`${GIST_API}/${id}`, {
        method: 'PATCH',
        headers: _headers(token),
        body: JSON.stringify(payload),
      });
    } else {
      // POST new gist
      resp = await fetch(GIST_API, {
        method: 'POST',
        headers: _headers(token),
        body: JSON.stringify(payload),
      });
    }

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { ok: false, msg: `Erreur GitHub (${resp.status}) : ${err.message || resp.statusText}` };
    }

    data = await resp.json();
    return { ok: true, gist_id: data.id, updated_at: data.updated_at };
  } catch (e) {
    return { ok: false, msg: `Erreur réseau : ${e.message}` };
  }
}

/** Pull DB from Gist and restore it */
export async function pullFromGist() {
  const { id, token } = _cfg();
  if (!token) return { ok: false, msg: 'Token GitHub non configuré.' };
  if (!id)    return { ok: false, msg: 'ID du Gist non configuré.' };

  try {
    const resp = await fetch(`${GIST_API}/${id}`, { headers: _headers(token) });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { ok: false, msg: `Erreur GitHub (${resp.status}) : ${err.message || resp.statusText}` };
    }
    const data = await resp.json();
    const file = data.files?.[FILE_NAME];
    if (!file) return { ok: false, msg: `Fichier "${FILE_NAME}" introuvable dans le Gist.` };

    // If truncated, fetch raw_url
    let content = file.content;
    if (file.truncated) {
      const raw = await fetch(file.raw_url);
      content = await raw.text();
    }

    await importDBBase64(content);
    return { ok: true, updated_at: data.updated_at };
  } catch (e) {
    return { ok: false, msg: `Erreur réseau : ${e.message}` };
  }
}

/** Get last update info from Gist (without pulling) */
export async function getGistInfo() {
  const { id, token } = _cfg();
  if (!token || !id) return { ok: false, msg: 'Non configuré.' };

  try {
    const resp = await fetch(`${GIST_API}/${id}`, { headers: _headers(token) });
    if (!resp.ok) return { ok: false, msg: `Erreur ${resp.status}` };
    const data = await resp.json();
    return {
      ok: true,
      updated_at: data.updated_at,
      description: data.description,
      has_file: !!data.files?.[FILE_NAME],
    };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}
