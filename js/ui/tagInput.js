// ui/tagInput.js
// -----------------------------------------------------------------------------
// Campo de "chips" simples: usuário digita um nome de campo e aperta Enter
// (ou vírgula) para adicionar. Usado no filtro "quais campos analisar".
// -----------------------------------------------------------------------------

/**
 * @param {HTMLElement} container elemento onde o componente será montado
 * @returns {{ getValues: () => string[], setValues: (values:string[]) => void }}
 */
export function createTagInput(container) {
  let values = [];

  container.innerHTML = `
    <div class="tag-input">
      <div class="tag-input__chips" data-role="chips"></div>
      <input type="text" data-role="input" placeholder="Digite o nome do campo e pressione Enter (ex: NAME1, STREET, CITY)" />
    </div>
  `;

  const chipsEl = container.querySelector('[data-role="chips"]');
  const inputEl = container.querySelector('[data-role="input"]');

  function render() {
    chipsEl.innerHTML = values
      .map(
        (v, i) => `<span class="tag-chip">${escapeHtml(v)}<button type="button" data-index="${i}" aria-label="Remover ${escapeHtml(v)}">×</button></span>`
      )
      .join('');
  }

  function addValue(raw) {
    const clean = raw.trim();
    if (!clean) return;
    if (!values.some((v) => v.toUpperCase() === clean.toUpperCase())) values.push(clean);
    render();
  }

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addValue(inputEl.value);
      inputEl.value = '';
    } else if (e.key === 'Backspace' && !inputEl.value && values.length) {
      values.pop();
      render();
    }
  });

  inputEl.addEventListener('blur', () => {
    if (inputEl.value.trim()) {
      addValue(inputEl.value);
      inputEl.value = '';
    }
  });

  chipsEl.addEventListener('click', (e) => {
    const idx = e.target?.dataset?.index;
    if (idx !== undefined) {
      values.splice(Number(idx), 1);
      render();
    }
  });

  return {
    getValues: () => [...values],
    setValues: (v) => {
      values = [...v];
      render();
    },
  };
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
