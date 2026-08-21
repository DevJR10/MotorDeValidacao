// dashboard/divergenceTable.js
// -----------------------------------------------------------------------------
// Tabela de divergências com busca por texto + filtro por TIPO de divergência
// (campo vazio, diferença de valor). Paginado no cliente para não travar o
// DOM mesmo com muitas divergências.
//
// DexPara resolvido não é mais considerado divergência (é validado), então
// não existe mais opção de filtro para isso — a lista aqui só contém erros
// de verdade.
// -----------------------------------------------------------------------------

const PAGE_SIZE = 50;

const TYPE_FILTERS = {
  all: () => true,
  empty: (d) => d.isEmpty,
  valueDiff: (d) => !d.isEmpty,
};

export function initDivergenceTable({ searchInput, typeFilterSelect, tableBody, pagination, divergences }) {
  let filtered = divergences;
  let page = 1;

  function apply() {
    const term = searchInput.value.trim().toUpperCase();
    const typeKey = typeFilterSelect ? typeFilterSelect.value : 'all';
    const typePredicate = TYPE_FILTERS[typeKey] || TYPE_FILTERS.all;

    filtered = divergences.filter((d) => {
      if (!typePredicate(d)) return false;
      if (!term) return true;
      return (
        d.id.toUpperCase().includes(term) ||
        d.field.toUpperCase().includes(term) ||
        String(d.origin).toUpperCase().includes(term) ||
        String(d.dest).toUpperCase().includes(term)
      );
    });
    page = 1;
    render();
  }

  function render() {
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    tableBody.innerHTML =
      pageItems
        .map(
          (d) => `
        <tr>
          <td class="mono">${escapeHtml(d.id)}</td>
          <td>${escapeHtml(d.field)}</td>
          <td>${escapeHtml(String(d.origin ?? ''))}</td>
          <td>${escapeHtml(String(d.dest ?? ''))}</td>
          <td><span class="status-pill status-pill--error">Erro</span></td>
        </tr>`
        )
        .join('') || `<tr><td colspan="5" class="empty-row">Nenhuma divergência encontrada com esse filtro.</td></tr>`;

    pagination.innerHTML = `
      <button data-action="prev" ${page <= 1 ? 'disabled' : ''}>&larr; Anterior</button>
      <span>Página ${page} de ${totalPages} · ${filtered.length.toLocaleString('pt-BR')} de ${divergences.length.toLocaleString('pt-BR')} registros</span>
      <button data-action="next" ${page >= totalPages ? 'disabled' : ''}>Próxima &rarr;</button>
    `;
  }

  searchInput.addEventListener('input', apply);
  if (typeFilterSelect) typeFilterSelect.addEventListener('change', apply);
  pagination.addEventListener('click', (e) => {
    const action = e.target?.dataset?.action;
    if (action === 'prev') page--;
    if (action === 'next') page++;
    render();
  });

  render();
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
