// core/normalization.js
// -----------------------------------------------------------------------------
// Responsável exclusivamente por padronizar valores ANTES de qualquer comparação.
// Nenhuma outra parte do sistema deve reimplementar trim/uppercase/etc — todo
// valor que entra no motor de validação passa por aqui primeiro.
// -----------------------------------------------------------------------------

const INVISIBLE_CHARS_REGEX = /[\u200B-\u200D\uFEFF\u00A0]/g;

/**
 * Normaliza um valor individual para comparação.
 * @param {*} value
 * @param {{ uppercase?: boolean, stripLeadingZeros?: boolean, dateFormat?: string }} [options]
 * @returns {string}
 */
export function normalizeValue(value, options = {}) {
  const { uppercase = true, stripLeadingZeros = false } = options;

  if (value === null || value === undefined) return '';

  let v = value instanceof Date ? formatDate(value) : value;
  v = String(v);

  // remove caracteres invisíveis (zero-width space, BOM, nbsp) comuns em exports SAP
  v = v.replace(INVISIBLE_CHARS_REGEX, '');

  // trim + colapsa espaços múltiplos
  v = v.trim().replace(/\s+/g, ' ');

  if (uppercase) v = v.toUpperCase();

  if (stripLeadingZeros && /^0*\d+$/.test(v)) {
    v = v.replace(/^0+(?=\d)/, '');
  }

  return v;
}

/**
 * Formata uma data para um formato canônico (evita divergência 01/02/2026 vs 2026-02-01).
 * @param {Date} date
 * @param {string} [format='YYYY-MM-DD']
 */
export function formatDate(date, format = 'YYYY-MM-DD') {
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return format === 'YYYY-MM-DD' ? `${yyyy}-${mm}-${dd}` : `${dd}/${mm}/${yyyy}`;
}

/**
 * Normaliza todos os campos de um registro de uma vez, respeitando overrides por campo.
 * @param {Record<string, any>} fields
 * @param {Record<string, object>} [fieldOptions] configuração opcional por nome de campo
 * @returns {Record<string, string>}
 */
export function normalizeRecordFields(fields, fieldOptions = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(fields || {})) {
    normalized[key] = normalizeValue(value, fieldOptions[key]);
  }
  return normalized;
}
