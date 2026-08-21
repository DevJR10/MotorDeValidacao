// core/ruleEngine.js
// -----------------------------------------------------------------------------
// Carrega e aplica as regras de De/Para (DexPara).
// O SCHEMA do JSON é o MESMO do V1 (table, keyField, fieldMappings[].map) —
// os arquivos existentes em /rules/*.json continuam funcionando sem alteração.
// A diferença: aqui as regras só são carregadas quando o tipo de comparação
// escolhido pelo usuário realmente exige (ex.: ECC → S4). Comparações
// literais (ECC→ECC, API→API, etc.) nunca tocam este módulo.
// -----------------------------------------------------------------------------

import { normalizeValue } from './normalization.js';
import { logger } from '../utils/logger.js';

const rulesCache = new Map();

/**
 * @param {string} entityName ex: "KNVV"
 * @param {{ useRules: boolean }} comparisonType
 * @param {string} [rulesBasePath]
 * @returns {Promise<object|null>} null quando a comparação é literal (não usa regras)
 */
export async function loadRules(entityName, comparisonType, rulesBasePath = './rules') {
  if (!comparisonType?.useRules) {
    logger.debug(`Comparação literal — regras De/Para não serão carregadas para ${entityName}.`);
    return null;
  }

  const cacheKey = entityName.toUpperCase();
  if (rulesCache.has(cacheKey)) return rulesCache.get(cacheKey);

  const url = `${rulesBasePath}/${cacheKey}.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn(`Nenhum arquivo de regras encontrado em ${url}. Seguindo com comparação literal para ${entityName}.`);
      const fallback = { table: entityName, fieldMappings: {} };
      rulesCache.set(cacheKey, fallback);
      return fallback;
    }
    const rules = await res.json();
    rulesCache.set(cacheKey, rules);
    return rules;
  } catch (err) {
    logger.error(`Falha ao carregar regras de ${url}: ${err.message}`);
    const fallback = { table: entityName, fieldMappings: {} };
    rulesCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Retorna o mapeamento configurado para um campo, se existir.
 * @param {object|null} rules
 * @param {string} field
 */
export function resolveMapping(rules, field) {
  if (!rules?.fieldMappings) return null;
  // suporta tanto chave = nome do campo quanto fieldMappings com eccField/s4Field explícitos
  if (rules.fieldMappings[field]) return rules.fieldMappings[field];
  return Object.values(rules.fieldMappings).find(
    (m) => m.eccField === field || m.s4Field === field || m.originField === field
  ) || null;
}

/**
 * Dado um valor de origem já normalizado, retorna a lista de valores de destino
 * aceitáveis segundo o De/Para, ou null se não houver regra para esse valor.
 * @param {object|null} mapping
 * @param {string} sourceNormalizedValue
 * @returns {string[]|null}
 */
export function acceptableTargets(mapping, sourceNormalizedValue) {
  if (!mapping?.map) return null;
  const target = mapping.map[sourceNormalizedValue];
  if (target === undefined) return null;
  const arr = Array.isArray(target) ? target : [target];
  // valores do JSON já vêm sem normalização garantida — normaliza para comparação segura
  return arr.map((t) => (t === null ? null : normalizeValue(t)));
}
