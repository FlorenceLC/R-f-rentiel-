/**
 * AI service — calls an external OpenAI-compatible API.
 * Config is stored locally in the settings table.
 */
import { getSetting } from './db.js';

const AI_TIMEOUT = 30000;

function getAIConfig() {
  return {
    base_url:      getSetting('ai_base_url', ''),
    api_key:       getSetting('ai_api_key', ''),
    model:         getSetting('ai_model', 'gpt-4'),
    gravitee_key:  getSetting('ai_gravitee_key', ''),
  };
}

export function isAIAvailable() {
  const { base_url, api_key } = getAIConfig();
  return !!(base_url && api_key);
}

export async function callAI(systemPrompt, userMessage, { temperature = 0.3, max_tokens = 1500 } = {}) {
  const { base_url, api_key, model, gravitee_key } = getAIConfig();
  if (!base_url || !api_key) {
    return { ok: false, text: 'API IA non configurée. Renseignez l\'URL et la clé dans Paramètres → IA.' };
  }

  const endpoint = base_url.replace(/\/$/, '') + '/v1/chat/completions';
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), AI_TIMEOUT);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${api_key}`,
  };
  if (gravitee_key) headers['X-Gravitee-Api-Key'] = gravitee_key;

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage },
        ],
        temperature,
        max_tokens,
      }),
      signal: controller.signal,
    });
    clearTimeout(tid);

    if (!resp.ok) return { ok: false, text: `Erreur API IA (code ${resp.status}).` };

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || '';
    return { ok: true, text };
  } catch (e) {
    clearTimeout(tid);
    if (e.name === 'AbortError') return { ok: false, text: 'L\'API IA n\'a pas répondu dans les délais (timeout).' };
    return { ok: false, text: `Erreur de connexion à l\'API IA : ${e.message}` };
  }
}

/** Analyse a new request — returns classification + similar CU */
export async function analyzeRequest(requestData, catalogue) {
  const catalogueSummary = catalogue.slice(0, 50).map(cu =>
    `- ${cu.cu_id} | ${cu.nom} | ${cu.type_besoin||''} | ${cu.technologie||''} | Statut: ${cu.statut}`
  ).join('\n');

  const systemPrompt = `Tu es un expert en transformation digitale et innovation.\nTu analyses des demandes de cas d'usage pour un département innovation interne.\nTu dois répondre UNIQUEMENT en JSON valide, sans texte avant ou après.\nFormat de réponse attendu :\n{\n  \"type_besoin\": \"...\",\n  \"technologie\": \"...\",\n  \"analyse\": \"...\",\n  \"similar_cases\": [\n    {\"cu_id\": \"CU-XXXX\", \"nom\": \"...\", \"score\": 85, \"justification\": \"...\"}\n  ]\n}\nLes types de besoin possibles : Automatisation, IA générative, Analyse de données, Reporting, Aide à la décision, Digitalisation, Optimisation.\nLes technologies possibles : Python, Power BI, IA générative, Machine Learning, RPA, API, SQL, LLM, IoT, OCR.\nLe score de similarité est un entier entre 0 et 100.\nN'inclure que les cas d'usage avec un score > 60.`;

  const userMessage = `Analyse cette demande :\n\nDEMANDEUR : ${requestData.prenom} ${requestData.nom} — ${requestData.direction}\nCONTEXTE : ${requestData.contexte}\nOBJECTIF : ${requestData.objectif}\nCOMMENTAIRE : ${requestData.commentaire || 'Aucun'}\nROI ESTIMÉ : ${requestData.roi_estime || 'Non renseigné'} heures/an\n\nCATALOGUE EXISTANT :\n${catalogueSummary}\n\nIdentifie le type de besoin, la technologie adaptée, rédige une analyse concise (2-3 phrases),\net identifie les cas d'usage du catalogue potentiellement similaires.`;

  const { ok, text } = await callAI(systemPrompt, userMessage, { temperature: 0.2, max_tokens: 1000 });
  if (!ok) return { ok: false, error: text };

  try {
    let clean = text.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/,'').trim();
    return { ok: true, data: JSON.parse(clean) };
  } catch (e) {
    return { ok: false, error: `Réponse IA invalide : ${e.message}`, raw: text };
  }
}

/** RAG chatbot — answer a question using the catalogue as context */
export async function chatWithCatalogue(question, history, contextCU) {
  const contextText = contextCU.slice(0, 10).map(cu =>
    `=== ${cu.cu_id} — ${cu.nom} ===\nStatut : ${cu.statut}\nType : ${cu.type_besoin||''}\nTechnologie : ${cu.technologie||''}\nDescription : ${cu.description||''}\nResponsable : ${cu.responsable||''}`
  ).join('\n\n');

  const systemPrompt = `Tu es l'assistant du Référentiel des cas d'usage d'un département innovation interne.\nTu réponds aux questions des utilisateurs en t'appuyant UNIQUEMENT sur les cas d'usage fournis en contexte.\nSi tu ne trouves pas l'information dans le contexte, dis-le clairement.\nN'invente jamais de cas d'usage inexistants.\nÀ la fin de ta réponse, cite toujours les CU sources utilisés sous la forme :\nSources : CU-XXXX, CU-YYYY\n\nCATALOGUE DISPONIBLE :\n${contextText}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6),
    { role: 'user', content: question },
  ];

  const { base_url, api_key, model, gravitee_key } = getAIConfig();
  if (!base_url || !api_key) return { ok: false, text: 'L\'assistant IA n\'est pas configuré.', sources: [] };

  const endpoint = base_url.replace(/\/$/, '') + '/v1/chat/completions';

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${api_key}`,
  };
  if (gravitee_key) headers['X-Gravitee-Api-Key'] = gravitee_key;

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 800 }),
    });
    if (!resp.ok) return { ok: false, text: `Erreur API (${resp.status})`, sources: [] };
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || '';
    const srcMatch = text.match(/Sources?\s*:\s*(CU-\d+(?:\s*,\s*CU-\d+)*)/i);
    const sources = srcMatch ? srcMatch[1].split(',').map(s => s.trim()) : [];
    return { ok: true, text, sources };
  } catch (e) {
    return { ok: false, text: `Erreur : ${e.message}`, sources: [] };
  }
}

/** Test the AI connection */
export async function testAIConnection() {
  return callAI(
    'Tu es un assistant de test. Réponds en une phrase courte.',
    'Test de connexion. Réponds uniquement "Connexion réussie."',
    { max_tokens: 30 }
  );
}
