// worker/validation.worker.js
// -----------------------------------------------------------------------------
// Todo o trabalho pesado (importação + indexação + matching + comparação)
// acontece aqui, FORA da thread principal. A interface nunca trava, mesmo com
// centenas de milhares de registros. Arquivos (File) são passados via
// postMessage e trafegam por structured clone — sem necessidade de lê-los
// manualmente na thread principal antes de enviar.
// -----------------------------------------------------------------------------

import { importData } from '../importers/importerFactory.js';
import { runValidation } from '../core/validationEngine.js';
import { logger } from '../utils/logger.js';

self.onmessage = async (event) => {
  const { originSource, destSource, entityName, comparisonType, entityConfig, fieldFilter, rulesBasePath } = event.data;

  try {
    post({ type: 'progress', stage: 'import', percent: 2, message: 'Lendo origem...' });
    const originRecords = await importData(originSource);

    post({ type: 'progress', stage: 'import', percent: 8, message: 'Lendo destino...' });
    const destRecords = await importData(destSource);

    if (!originRecords.length) throw new Error('Nenhum registro válido encontrado na origem (verifique o campo de ID selecionado).');
    if (!destRecords.length) throw new Error('Nenhum registro válido encontrado no destino (verifique o campo de ID selecionado).');

    const result = await runValidation({
      originRecords,
      destRecords,
      entityName,
      comparisonType,
      entityConfig,
      rulesBasePath,
      fieldFilter,
      onProgress: (progress) => post({ type: 'progress', ...progress }),
    });

    post({ type: 'done', result });
  } catch (err) {
    logger.error('Erro durante a validação:', err);
    post({ type: 'error', message: err?.message || 'Erro desconhecido durante a validação.' });
  }
};

function post(message) {
  self.postMessage(message);
}
