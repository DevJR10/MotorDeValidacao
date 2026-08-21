// utils/errorBanner.js
// -----------------------------------------------------------------------------
// Garante que QUALQUER falha fatal (fetch bloqueado, CDN inacessível, etc.)
// apareça de forma visível e acionável — em vez de deixar a tela em branco
// sem nenhum aviso.
// -----------------------------------------------------------------------------

export function showFatalError(message, { hint } = {}) {
  let el = document.getElementById('fatalError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatalError';
    document.body.prepend(el);
  }
  el.className = 'fatal-error';
  el.innerHTML = `
    <strong>Não foi possível carregar o Validador de Dados</strong>
    <p>${escapeHtml(message)}</p>
    ${hint ? `<p class="fatal-error__hint">${hint}</p>` : ''}
  `;
  el.style.display = 'block';
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
