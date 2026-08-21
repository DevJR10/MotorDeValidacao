// importers/importerFactory.js
// -----------------------------------------------------------------------------
// Ponto único de entrada para importação. O motor de validação nunca importa
// excelImporter/csvImporter/apiImporter diretamente — sempre passa por aqui.
// Adicionar um novo conector = adicionar um novo `case`, sem tocar no motor.
// -----------------------------------------------------------------------------

import { importExcel } from './excelImporter.js';
import { importCsv } from './csvImporter.js';
import { importApi } from './apiImporter.js';

/**
 * @param {{ type: 'excel'|'csv'|'api', file?: File, url?: string, idField: string, options?: object }} source
 * @returns {Promise<{id:string, fields:object}[]>}
 */
export async function importData(source) {
  switch (source.type) {
    case 'excel':
      return importExcel(source.file, source.idField);
    case 'csv':
      return importCsv(source.file, source.idField);
    case 'api':
      return importApi(source.url, source.idField, source.options);
    default:
      throw new Error(`Tipo de origem de dados desconhecido: "${source.type}"`);
  }
}
