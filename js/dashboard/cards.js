// dashboard/cards.js
// -----------------------------------------------------------------------------
// Cards de indicadores, organizados em 3 grupos (Cobertura / Qualidade /
// Performance) para leitura rápida, mais um banner-herói no topo com o
// veredito geral em uma frase — a ideia é que dê pra "bater o olho" e
// entender a situação sem precisar ler todos os números.
// -----------------------------------------------------------------------------

export function renderHeroBanner(container, result) {
  const { summary } = result;
  const rate = summary.clientSuccessRate;
  const comparedClients = summary.clientsValid + summary.clientsWithError;
  let tone, icon, verdict;

  if (rate >= 98) {
    tone = 'ok';
    icon = '✓';
    verdict = 'Migração consistente';
  } else if (rate >= 85) {
    tone = 'warn';
    icon = '!';
    verdict = 'Atenção — divergências pontuais';
  } else {
    tone = 'error';
    icon = '✕';
    verdict = 'Revisão necessária — divergências relevantes';
  }

  const unmatchedNote = summary.clientsUnmatched
    ? ` · ${fmt(summary.clientsUnmatched)} cliente(s) sem correspondência (fora desse cálculo)`
    : '';

  container.className = `hero-banner hero-banner--${tone}`;
  container.innerHTML = `
    <span class="hero-banner__icon">${icon}</span>
    <div class="hero-banner__text">
      <strong>${verdict}</strong>
      <span>${fmt(summary.clientsValid)} de ${fmt(comparedClients)} clientes comparados são válidos (${rate}%)${unmatchedNote}</span>
    </div>
  `;
}

export function renderFieldFilterBanner(container, result) {
  if (result.appliedFieldFilter?.length) {
    container.innerHTML = `<strong>Campos analisados (filtro aplicado):</strong> ${result.appliedFieldFilter.join(', ')}`;
  } else {
    container.innerHTML = `<strong>Campos analisados:</strong> todos os campos comuns entre origem e destino (${result.fieldsAnalyzed.length})`;
  }
  container.style.display = 'block';
}

export function renderCoverageCards(container, result) {
  const { summary } = result;
  renderCards(container, [
    { label: 'Registros na origem', value: fmt(summary.originRecordCount) },
    { label: 'Registros no destino', value: fmt(summary.destRecordCount) },
    {
      label: 'Clientes sem correspondência',
      value: fmt(summary.clientsUnmatched),
      tone: summary.clientsUnmatched ? 'warn' : 'ok',
    },
  ]);
}

export function renderQualityCards(container, result) {
  const { summary } = result;
  renderCards(container, [
    { label: 'Clientes válidos', value: fmt(summary.clientsValid), tone: 'ok' },
    { label: 'Clientes com divergência', value: fmt(summary.clientsWithError), tone: summary.clientsWithError ? 'error' : 'ok' },
    { label: 'Campos com erro (distintos)', value: fmt(summary.fieldsWithErrorsCount), tone: summary.fieldsWithErrorsCount ? 'error' : 'ok' },
    {
      label: 'Taxa de sucesso dos clientes',
      value: `${summary.clientSuccessRate}%`,
      tone: summary.clientSuccessRate >= 95 ? 'ok' : summary.clientSuccessRate >= 80 ? 'warn' : 'error',
      big: true,
    },
  ]);
}

export function renderPerformanceCards(container, result) {
  const { summary, dexPara } = result;
  renderCards(container, [
    { label: 'Tempo de processamento', value: formatDuration(summary.elapsedMs) },
    { label: 'Resolvido via DexPara', value: dexPara.used ? `${dexPara.percentResolvedByDexPara}%` : 'não aplicável' },
  ]);
}

function renderCards(container, cards) {
  container.innerHTML = cards
    .map(
      (c) => `
      <div class="card card--${c.tone || 'neutral'} ${c.big ? 'card--big' : ''}">
        <span class="card__value">${c.value}</span>
        <span class="card__label">${c.label}</span>
      </div>`
    )
    .join('');
}

function fmt(n) {
  return Number(n).toLocaleString('pt-BR');
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
