// ui/progressController.js
// -----------------------------------------------------------------------------
// Exibe o progresso do processamento (rodando no Worker): leitura, indexação,
// aplicação de regras, comparação, geração de resultado. Mostra % e tempo
// estimado restante.
// -----------------------------------------------------------------------------

const STAGE_LABELS = {
  import: 'Lendo arquivos/origens...',
  rules: 'Carregando regras De/Para...',
  indexing: 'Indexando registros (Map)...',
  comparing: 'Comparando registros...',
  summarizing: 'Gerando resultados...',
  done: 'Concluído',
};

const STAGE_ORDER = ['import', 'rules', 'indexing', 'comparing', 'summarizing'];

let startedAt = null;

export function resetProgress() {
  startedAt = performance.now();
  document.querySelectorAll('.pipeline li').forEach((li) => li.classList.remove('is-active', 'is-done'));
  updateProgress({ stage: 'import', percent: 0 });
}

export function updateProgress({ stage, percent }) {
  const bar = document.getElementById('progressBar');
  const label = document.getElementById('progressLabel');
  const eta = document.getElementById('progressEta');

  bar.style.width = `${percent}%`;
  bar.setAttribute('aria-valuenow', String(percent));
  label.textContent = `${STAGE_LABELS[stage] || stage} (${percent}%)`;
  updatePipeline(stage);

  if (percent > 0 && percent < 100 && startedAt) {
    const elapsed = performance.now() - startedAt;
    const estimatedTotal = (elapsed / percent) * 100;
    const remaining = Math.max(0, estimatedTotal - elapsed);
    eta.textContent = `Tempo estimado restante: ${formatSeconds(remaining)}`;
  } else if (percent >= 100) {
    eta.textContent = `Concluído em ${formatSeconds(performance.now() - startedAt)}`;
  }
}

function updatePipeline(stage) {
  const currentIndex = STAGE_ORDER.indexOf(stage);
  document.querySelectorAll('.pipeline li').forEach((li) => {
    const idx = STAGE_ORDER.indexOf(li.dataset.stage);
    li.classList.toggle('is-done', idx < currentIndex || stage === 'done');
    li.classList.toggle('is-active', idx === currentIndex && stage !== 'done');
  });
}

function formatSeconds(ms) {
  const s = ms / 1000;
  return s < 1 ? '< 1s' : `${s.toFixed(1)}s`;
}
