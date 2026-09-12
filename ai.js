/**
 * AI service — calls an external OpenAI-compatible API.
 * Config is stored locally in the settings table.
 */
import { getSetting } from './db.js';

const AI_TIMEOUT = 30000;

function getAIConfig() {
  return {
    base_url: getSetting('ai_base_url', ''),
    api_key:  getSetting('ai_api_key', ''),
    model:    getSetting('ai_model', 'gpt-4'),
  };
}

export function isAIAvailable() {
  const { base_url, api_key } = getAIConfig();
  return !!(base_url && api_key);
}

export async function callAI(systemPrompt, userMessage, { temperature = 0.3, max_tokens = 1500 } = {}) {
  const { base_url, api_key, model } = getAIConfig();
  if (!base_url || !api_key) {
    return { ok: false, text: 'API IA non configurée. Renseignez l\'URL et la clé dans Paramètres → IA.' };
  }

  const endpoint = base_url.replace(/\/$/, '') + '/v1/chat/completions';
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), AI_TIMEOUT);

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api_key}`,
      },
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

  const systemPrompt = `Tu es un expert en transformation digitale et innovation.
Tu analyses des demandes de cas d'usage pour un département innovation interne.
Tu dois répondre UNIQUEMENT en JSON valide, sans texte avant ou après.
Format de réponse attendu :
{
  "type_besoin": "...",
  "technologie": "...",
  "analyse": "...",
  "similar_cases": [
    {"cu_id": "CU-XXXX", "nom": "...", "score": 85, "justification": "..."}
  ]
}
Les types de besoin possibles : Automatisation, IA générative, Analyse de données, Reporting, Aide à la décision, Digitalisation, Optimisation.
Les technologies possibles : Python, Power BI, IA générative, Machine Learning, RPA, API, SQL, LLM, IoT, OCR.
Le score de similarité est un entier entre 0 et 100.
N'inclure que les cas d'usage avec un score > 60.`;

  const userMessage = `Analyse cette demande :

DEMANDEUR : ${requestData.prenom} ${requestData.nom} — ${requestData.direction}
CONTEXTE : ${requestData.contexte}
OBJECTIF : ${requestData.objectif}
COMMENTAIRE : ${requestData.commentaire || 'Aucun'}
ROI ESTIMÉ : ${requestData.roi_estime || 'Non renseigné'} heures/an

CATALOGUE EXISTANT :
${catalogueSummary}

Identifie le type de besoin, la technologie adaptée, rédige une analyse concise (2-3 phrases),
et identifie les cas d'usage du catalogue potentiellement similaires.`;

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

  const systemPrompt = `Tu es l'assistant du Référentiel des cas d'usage d'un département innovation interne.
Tu réponds aux questions des utilisateurs en t'appuyant UNIQUEMENT sur les cas d'usage fournis en contexte.
Si tu ne trouves pas l'information dans le contexte, dis-le clairement.
N'invente jamais de cas d'usage inexistants.
À la fin de ta réponse, cite toujours les CU sources utilisés sous la forme :
Sources : CU-XXXX, CU-YYYY

CATALOGUE DISPONIBLE :
${contextText}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6),
    { role: 'user', content: question },
  ];

  const { base_url, api_key, model } = getAIConfig();
  if (!base_url || !api_key) return { ok: false, text: 'L\'assistant IA n\'est pas configuré.', sources: [] };

  const endpoint = base_url.replace(/\/$/, '') + '/v1/chat/completions';

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api_key}` },
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
