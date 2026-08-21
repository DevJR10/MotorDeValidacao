// importers/excelImporter.js
// -----------------------------------------------------------------------------
// Reaproveita a lógica de leitura do V1 (js/upload.js -> readExcel), só que
// agora usa file.arrayBuffer() (API baseada em Promise) e roda dentro do
// Web Worker, para não travar a interface enquanto lê arquivos grandes.
// -----------------------------------------------------------------------------

import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
import { toRecords } from './common.js';

/**
 * @param {File} file
 * @param {string} idField coluna que representa o identificador (ex.: KUNNR)
 * @returns {Promise<{id:string, fields:object}[]>}
 */
export async function importExcel(file, idField) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return toRecords(rows, idField);
}
