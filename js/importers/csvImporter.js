// importers/csvImporter.js
// -----------------------------------------------------------------------------
// Novo conector (não existia no V1). Mesma saída padronizada dos demais
// importadores — o motor de validação não diferencia CSV de Excel ou API.
// -----------------------------------------------------------------------------

import Papa from 'https://esm.sh/papaparse@5.4.1';
import { toRecords } from './common.js';

/**
 * @param {File} file
 * @param {string} idField
 * @returns {Promise<{id:string, fields:object}[]>}
 */
export async function importCsv(file, idField) {
  const text = await file.text();
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors?.length) {
    // Erros de parsing não fatais (ex.: linha com nº de colunas diferente) só viram aviso,
    // continuamos com o que foi possível ler.
    console.warn('[Validador] Avisos ao ler CSV:', parsed.errors.slice(0, 5));
  }

  return toRecords(parsed.data, idField);
}
