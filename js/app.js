// app.js
// -----------------------------------------------------------------------------
// Orquestra a SPA (Single Page App). Não há mais navegação entre upload.html
// e preview.html com dados salvos em localStorage — tudo acontece em uma
// única página, trocando qual <section> fica visível. O motivo é técnico:
// localStorage tem limite de ~5-10MB e não serve para grandes volumes.
// Os datasets nunca tocam localStorage nesta versão; trafegam só em memória
// (thread principal -> Worker) via postMessage/structured clone.
//
// Este arquivo também é o ponto de captura de erros fatais: se qualquer
// coisa falhar durante a inicialização, o usuário vê um aviso claro na tela
// em vez de uma página em branco sem nenhuma explicação.
// -----------------------------------------------------------------------------

import { initUploadController } from './ui/uploadController.js';
import { resetProgress, updateProgress } from './ui/progressController.js';
import { renderResults } from './ui/resultsController.js';
import { logger } from './utils/logger.js';
import { showFatalError } from './utils/errorBanner.js';

const views = ['view-upload', 'view-progress', 'view-results'];

function showView(id) {
  for (const v of views) {
    document.getElementById(v).classList.toggle('is-active', v === id);
  }
}

let worker = null;

function startValidation(payload) {
  showView('view-progress');
  resetProgress();

  worker = new Worker('./js/worker/validation.worker.js', { type: 'module' });

  worker.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === 'progress') {
      updateProgress(msg);
    } else if (msg.type === 'done') {
      logger.info('Resultado recebido do worker', msg.result.summary);
      renderResults(msg.result);
      showView('view-results');
      worker.terminate();
    } else if (msg.type === 'error') {
      alert(`Erro na validação: ${msg.message}`);
      showView('view-upload');
      worker.terminate();
    }
  };

  worker.onerror = (err) => {
    logger.error('Erro fatal no worker', err);
    alert(`Erro inesperado ao processar: ${err.message}`);
    showView('view-upload');
  };

  // Importante: fetch() dentro do Worker resolve caminhos relativos contra a
  // localização do PRÓPRIO worker (js/worker/...), não da página. Por isso
  // resolvemos aqui, na thread principal, um caminho absoluto para /rules.
  const rulesBasePath = new URL('./rules', document.baseURI).href;

  worker.postMessage({ ...payload, rulesBasePath });
}

document.getElementById('backToUpload').addEventListener('click', () => showView('view-upload'));

// Captura qualquer erro não tratado (import de módulo, CDN bloqueado, etc.)
// e mostra na tela em vez de deixar a página parada silenciosamente.
window.addEventListener('unhandledrejection', (event) => {
  logger.error('Promise rejeitada sem tratamento:', event.reason);
  showFatalError(event.reason?.message || String(event.reason), { hint: buildHint() });
});
window.addEventListener('error', (event) => {
  logger.error('Erro não tratado:', event.error || event.message);
  showFatalError(event.error?.message || event.message, { hint: buildHint() });
});

function buildHint() {
  if (location.protocol === 'file:') {
    return 'Esta versão modular (ES Modules) precisa de um servidor local — rode <code>npm start</code> na pasta do projeto e acesse http://localhost:5500. Se preferir abrir direto sem servidor, use o arquivo <code>Validador-de-Dados-V2.html</code> (raiz do projeto).';
  }
  return 'Verifique sua conexão com a internet (o app carrega bibliotecas via CDN) e se o servidor local está rodando (<code>npm start</code>).';
}

try {
  await initUploadController({ onStart: startValidation });
} catch (err) {
  logger.error('Falha ao inicializar a tela de upload:', err);
  showFatalError(err.message, { hint: buildHint() });
}
