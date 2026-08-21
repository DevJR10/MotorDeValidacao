// importers/common.js
// -----------------------------------------------------------------------------
// Qualquer importador (Excel, CSV, API, futuro conector) converte suas linhas
// brutas para o MESMO formato antes de entregar ao motor de validação:
//   { id: string, fields: Record<string, any> }
// O motor de validação NUNCA sabe de onde os dados vieram.
// -----------------------------------------------------------------------------

/**
 * @param {Record<string, any>[]} rows linhas já como objetos (linha -> {coluna: valor})
 * @param {string} idField nome da coluna/propriedade que representa o identificador
 * @returns {{id:string, fields:object}[]}
 */
export function toRecords(rows, idField) {
  const records = [];
  for (const row of rows) {
    const fields = cleanRow(row);
    const hasData = Object.values(fields).some((v) => v !== null && v !== '');
    if (!hasData) continue; // ignora linhas totalmente vazias

    const rawId = fields[idField];
    if (rawId === undefined || rawId === null || rawId === '') continue; // sem ID -> não entra no dataset

    records.push({ id: String(rawId), fields });
  }
  return records;
}

/**
 * Remove colunas sem nome válido (comum em exports Excel: "__EMPTY", "__EMPTY_1"...).
 */
function cleanRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (!key || key.toString().trim() === '' || key.toString().startsWith('__EMPTY')) continue;
    out[key] = value;
  }
  return out;
}
