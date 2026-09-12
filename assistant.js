import { query } from '../modules/db.js';
import { chatWithCatalogue, isAIAvailable } from '../modules/ai.js';
import { alertBox, chip, statusBadge } from '../modules/ui.js';
import { navigate } from '../app.js';

let _history = [];
let _thinking = false;

export function renderAssistant(container) {
  _history = [];
  _thinking = false;

  const aiOk = isAIAvailable();

  container.innerHTML = `
    <div class="hero" style="padding:18px 24px;">
      <h1>🤖 Assistant IA</h1>
      <p>Posez vos questions sur le référentiel des cas d'usage en langage naturel.</p>
    </div>

    ${!aiOk ? `<div class="alert alert-warning mb-2">
      ⚠️ L'IA n'est pas configurée. <button class="btn btn-ghost btn-sm" onclick="navigate('guide')">Contacter le département</button>
      pour en savoir plus, ou un administrateur peut configurer l'API dans <strong>Paramètres → IA</strong>.
    </div>` : ''}

    <div style="display:grid;grid-template-columns:3fr 2fr;gap:20px;">
      <div class="card" style="padding:16px;">
        <div class="section-title mb-2">💬 Conversation</div>

        <div id="chat-messages" class="chat-messages">
          <div class="chat-msg assistant">
            <div class="chat-bubble">
              👋 Bonjour ! Je suis l'assistant du Référentiel des cas d'usage.<br><br>
              Je peux vous aider à trouver des projets existants, vous renseigner sur les statuts, les technologies utilisées ou les responsables.<br><br>
              ${aiOk
                ? 'Posez-moi votre question !'
                : '⚠️ <em>L\'IA n\'est pas configurée — je ne peux pas répondre aux questions pour l\'instant.</em>'}
            </div>
          </div>
        </div>

        <div class="chat-input-row">
          <input type="text" class="form-control" id="chat-input" placeholder="${aiOk ? 'Votre question…' : 'IA non configurée'}" ${aiOk ? '' : 'disabled'}>
          <button class="btn btn-primary" id="chat-send" ${aiOk ? '' : 'disabled'}>Envoyer</button>
        </div>

        <div class="mt-1" style="display:flex;flex-wrap:wrap;gap:6px;" id="chat-suggestions">
          ${['Avons-nous un projet sur les factures ?','Quels projets concernent la Direction RH ?','Quelle technologie est la plus utilisée ?','Quels projets sont en production ?'].map(s =>
            `<button class="btn btn-ghost btn-sm suggest-btn">${s}</button>`
          ).join('')}
        </div>
      </div>

      <div>
        <div class="card" style="margin-bottom:14px;">
          <div class="section-title mb-2">📊 Catalogue rapide</div>
          <div id="quick-stats"></div>
        </div>
        <div class="card">
          <div class="section-title mb-2">🔗 Sources citées</div>
          <div id="cited-sources" class="text-muted text-sm">Les sources apparaîtront ici après une réponse.</div>
        </div>
      </div>
    </div>
  `;

  _renderQuickStats(container);

  const input = container.querySelector('#chat-input');
  const send  = container.querySelector('#chat-send');
  const msgs  = container.querySelector('#chat-messages');

  const doSend = async () => {
    const q = input.value.trim();
    if (!q || _thinking) return;
    input.value = '';
    _appendMsg(msgs, 'user', q);
    _thinking = true;
    send.disabled = true;
    _appendTyping(msgs);
    await _doChat(container, msgs, q);
    _thinking = false;
    send.disabled = false;
    input.focus();
  };

  send.addEventListener('click', doSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });

  container.querySelectorAll('.suggest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.textContent;
      doSend();
    });
  });
}

async function _doChat(container, msgs, question) {
  const catalogue = query(`SELECT * FROM use_cases WHERE actif=1 AND statut != 'Abandonné' LIMIT 30`);
  const { ok, text, sources } = await chatWithCatalogue(question, _history, catalogue);

  // Remove typing indicator
  msgs.querySelector('.typing-indicator')?.parentElement?.remove();

  if (!ok) {
    _appendMsg(msgs, 'assistant', `❌ ${text}`);
    return;
  }

  _history.push({ role: 'user', content: question });
  _history.push({ role: 'assistant', content: text });

  // Strip source line from displayed text
  const displayText = text.replace(/Sources?\s*:.*$/mi, '').trim();
  _appendMsg(msgs, 'assistant', displayText.replace(/\n/g, '<br>'));

  // Update cited sources panel
  if (sources.length) {
    const panel = container.querySelector('#cited-sources');
    panel.innerHTML = sources.map(s => {
      const cu = query(`SELECT * FROM use_cases WHERE cu_id=?`, [s])[0];
      return cu
        ? `<div style="padding:6px 0;border-bottom:1px solid var(--gray-border);">
            <span class="cu-id text-mono" style="cursor:pointer" onclick="navigate('catalogue',{cu_id:'${cu.cu_id}'})">${cu.cu_id}</span>
            <span style="margin-left:6px;font-size:12px;color:var(--text)">${cu.nom}</span>
            <br>${statusBadge(cu.statut)}
           </div>`
        : `<div>${s}</div>`;
    }).join('');
  }
}

function _appendMsg(container, role, text) {
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `<div class="chat-bubble">${text}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function _appendTyping(container) {
  const div = document.createElement('div');
  div.className = 'chat-msg assistant';
  div.innerHTML = `<div class="chat-bubble"><div class="typing-indicator">
    <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
  </div></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function _renderQuickStats(container) {
  const panel = container.querySelector('#quick-stats');
  if (!panel) return;
  const stats = [
    { label: 'En production', val: query(`SELECT COUNT(*) AS n FROM use_cases WHERE statut='Production' AND actif=1`)[0]?.n || 0, color: 'var(--green)' },
    { label: 'En cours', val: query(`SELECT COUNT(*) AS n FROM use_cases WHERE statut IN ('POC','En développement') AND actif=1`)[0]?.n || 0, color: 'var(--orange)' },
    { label: 'Backlog', val: query(`SELECT COUNT(*) AS n FROM use_cases WHERE statut IN ('Besoin identifié','Cadrage') AND actif=1`)[0]?.n || 0, color: 'var(--blue-light)' },
  ];
  panel.innerHTML = stats.map(s => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--gray-border)">
      <span class="text-sm">${s.label}</span>
      <strong style="color:${s.color}">${s.val}</strong>
    </div>`).join('');
}
