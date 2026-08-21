// core/validationEngine.js
// -----------------------------------------------------------------------------
// O coração do sistema. ZERO dependência de interface: recebe dois datasets já
// no formato comum ({id, fields}) + configuração, devolve um objeto de
// resultado. Nunca atualiza HTML. Roda inteiro dentro do Web Worker.
//
// v2.1: passou a rastrear status por REGISTRO e por CLIENTE (não só por
// campo) — o painel "válidos x inválidos" e as exportações usam esses dados.
// Também suporta fieldFilter: quando informado, só os campos da lista são
// analisados (o resto é ignorado na comparação e no dashboard).
//
// compareField() é a lógica de comparação do V1 (normalizar → igual? →
// De/Para? → erro) portada quase literalmente do antigo validation.js —
// só que agora é uma função pura, sem tocar em nenhum <td>.
// -----------------------------------------------------------------------------

import { normalizeValue } from './normalization.js';
import { resolveMapping, acceptableTargets, loadRules } from './ruleEngine.js';
import { indexById, matchGroups } from './matchingEngine.js';
import { logger } from '../utils/logger.js';

/**
 * @param {object} params
 * @param {{id:string, fields:object}[]} params.originRecords
 * @param {{id:string, fields:object}[]} params.destRecords
 * @param {string} params.entityName
 * @param {{ useRules: boolean }} params.comparisonType
 * @param {{ primaryKey?: string[] }} [params.entityConfig]
 * @param {string[]|null} [params.fieldFilter] campos a analisar (null/[] = todos)
 * @param {(progress:{stage:string, percent:number})=>void} [params.onProgress]
 * @param {string} [params.rulesBasePath]
 */
export async function runValidation({
  originRecords,
  destRecords,
  entityName,
  comparisonType,
  entityConfig,
  fieldFilter = null,
  onProgress = () => {},
  rulesBasePath,
}) {
  const startedAt = performance.now();

  onProgress({ stage: 'rules', percent: 5 });
  const rules = await loadRules(entityName, comparisonType, rulesBasePath);

  onProgress({ stage: 'indexing', percent: 15 });
  const originIndex = indexById(originRecords); // O(1) lookup, nunca varre o arquivo inteiro
  const destIndex = indexById(destRecords);
  const allIds = new Set([...originIndex.keys(), ...destIndex.keys()]);

  const keyFields = entityConfig?.primaryKey || null;
  const fieldFilterSet = fieldFilter && fieldFilter.length ? new Set(fieldFilter.map(normalizeFieldName)) : null;

  if (fieldFilterSet) {
    validateFieldFilter(fieldFilter, fieldFilterSet, originRecords, destRecords);
  }

  const fieldStats = new Map(); // field -> { ok, dexpara, error, affectedIds:Set }
  const divergences = [];
  const validRecords = [];
  const invalidRecords = [];
  const clientStats = new Map(); // id -> { hasError, hasUnmatchedLeftover, matchedAny }

  let comparedPairs = 0;
  let unmatchedOriginCount = 0;
  let unmatchedDestCount = 0;
  let processed = 0;
  const total = allIds.size || 1;
  const YIELD_EVERY = 500; // permite UI/worker respirarem entre lotes

  onProgress({ stage: 'comparing', percent: 20 });

  for (const id of allIds) {
    const client = ensureClient(clientStats, id);
    const originGroup = originIndex.get(id) || [];
    const destGroup = destIndex.get(id) || [];
    client.hasOrigin = originGroup.length > 0;
    client.hasDest = destGroup.length > 0;

    if (!originGroup.length || !destGroup.length) {
      client.hasUnmatchedLeftover = true;
      unmatchedOriginCount += originGroup.length;
      unmatchedDestCount += destGroup.length;
      processed++;
      continue;
    }

    const { pairs, unmatchedOrigin, unmatchedDest } = matchGroups(originGroup, destGroup, { keyFields, rules });
    if (unmatchedOrigin.length || unmatchedDest.length) client.hasUnmatchedLeftover = true;
    unmatchedOriginCount += unmatchedOrigin.length;
    unmatchedDestCount += unmatchedDest.length;

    for (const { origin, dest } of pairs) {
      client.matchedAny = true;
      comparedPairs++;

      let fieldNames = [...new Set([...Object.keys(origin.fields), ...Object.keys(dest.fields)])];
      if (fieldFilterSet) fieldNames = fieldNames.filter((f) => fieldFilterSet.has(normalizeFieldName(f)));

      let errorFields = 0;
      let dexparaFields = 0;
      let okFields = 0;

      for (const field of fieldNames) {
        const originValue = origin.fields[field];
        const destValue = dest.fields[field];
        const status = compareField(originValue, destValue, resolveMapping(rules, field));
        bumpFieldStats(fieldStats, field, status, id);

        if (status === 'ok') okFields++;
        else if (status === 'dexpara') dexparaFields++;
        else errorFields++;

        // DexPara resolvido = campo validado, não é mais listado como
        // divergência (nem na tabela do dashboard, nem na exportação).
        if (status === 'error') {
          divergences.push({
            id,
            field,
            origin: originValue ?? '',
            dest: destValue ?? '',
            status,
            isEmpty: isBlank(originValue) || isBlank(destValue),
          });
        }
      }

      if (errorFields > 0) {
        client.hasError = true;
        invalidRecords.push({ id, fieldsChecked: fieldNames.length, okFields, dexparaFields, errorFields });
      } else {
        validRecords.push({ id, fieldsValidated: fieldNames.length, dexparaFields });
      }
    }

    processed++;
    if (processed % YIELD_EVERY === 0) {
      onProgress({ stage: 'comparing', percent: 20 + Math.round((processed / total) * 70) });
      await yieldToEventLoop();
    }
  }

  onProgress({ stage: 'summarizing', percent: 95 });
  const elapsedMs = performance.now() - startedAt;

  const result = buildResult({
    entityName,
    originRecords,
    destRecords,
    comparedPairs,
    unmatchedOriginCount,
    unmatchedDestCount,
    fieldStats,
    divergences,
    validRecords,
    invalidRecords,
    clientStats,
    elapsedMs,
    usedRules: Boolean(comparisonType?.useRules),
    appliedFieldFilter: fieldFilterSet ? fieldFilter : null,
  });

  logger.info(`Validação de ${entityName} concluída em ${Math.round(elapsedMs)}ms`, result.summary);
  onProgress({ stage: 'done', percent: 100 });
  return result;
}

/**
 * Compara um par de valores (já brutos) aplicando normalização e De/Para.
 * Portado do V1 (validation.js/compareTables) como função pura.
 * @returns {'ok'|'dexpara'|'error'}
 */
export function compareField(originValue, destValue, mapping) {
  const a = normalizeValue(originValue);
  const b = normalizeValue(destValue);

  if (a === b) return 'ok';

  // Regra de negócio: 0 e vazio/null são considerados equivalentes, nas duas
  // direções (origem=0 & destino vazio, ou origem vazio & destino=0). Não é
  // divergência.
  const originBlank = isBlank(originValue);
  const destBlank = isBlank(destValue);
  if ((a === '0' && destBlank) || (originBlank && b === '0')) return 'ok';

  const targets = acceptableTargets(mapping, a);
  if (targets) {
    const destIsEmpty = destValue === null || destValue === undefined || destValue === '';
    if (destIsEmpty && targets.includes(null)) return 'dexpara';
    if (targets.includes(b)) return 'dexpara';
  }

  return 'error';
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function classifyUnmatchedClient(id, cs) {
  if (cs.hasOrigin && !cs.hasDest) {
    return {
      id,
      foundIn: 'Origem (ECC)',
      missingFrom: 'Destino (S/4)',
      reason: 'Cliente não encontrado no arquivo de destino',
    };
  }
  if (!cs.hasOrigin && cs.hasDest) {
    return {
      id,
      foundIn: 'Destino (S/4)',
      missingFrom: 'Origem (ECC)',
      reason: 'Cliente não encontrado no arquivo de origem',
    };
  }
  // Existe em ambos os arquivos, mas parte dos registros (linhas) do cliente
  // não encontrou correspondência para comparação (ex.: entidade com chave
  // composta, como KNVV, onde uma organização de vendas só existe de um lado).
  return {
    id,
    foundIn: 'Origem e Destino',
    missingFrom: 'Parcial',
    reason: 'Cliente encontrado nos dois arquivos, mas parte dos registros (linhas) não encontrou correspondência para comparação',
  };
}

function ensureClient(clientStats, id) {
  if (!clientStats.has(id)) clientStats.set(id, { hasError: false, hasUnmatchedLeftover: false, matchedAny: false, hasOrigin: false, hasDest: false });
  return clientStats.get(id);
}

function normalizeFieldName(f) {
  return f.trim().toUpperCase();
}

/**
 * Confere se os campos digitados no filtro de análise realmente existem nos
 * dados importados. Sem isso, um nome digitado errado (ex.: "NAMEEE1" em vez
 * de "NAME1") faz o filtro não bater com nenhuma coluna real — os registros
 * ficam com zero campos comparados e, por não terem nenhum erro, acabam
 * marcados como "válidos" incorretamente. Falha cedo, com uma mensagem clara,
 * em vez de processar tudo e devolver um resultado enganoso.
 */
function validateFieldFilter(fieldFilter, fieldFilterSet, originRecords, destRecords) {
  const knownFields = new Set();
  for (const r of originRecords.slice(0, 50)) {
    Object.keys(r.fields).forEach((f) => knownFields.add(normalizeFieldName(f)));
  }
  for (const r of destRecords.slice(0, 50)) {
    Object.keys(r.fields).forEach((f) => knownFields.add(normalizeFieldName(f)));
  }

  const missing = fieldFilter.filter((f) => !knownFields.has(normalizeFieldName(f)));
  if (missing.length) {
    const available = [...knownFields].sort().join(', ');
    throw new Error(
      `O(s) campo(s) do filtro não existe(m) nos arquivos importados: ${missing.join(', ')}. ` +
        `Confira o nome exato da coluna (maiúsculas/minúsculas não importam, mas a grafia sim). ` +
        `Colunas encontradas nos arquivos: ${available || '(nenhuma)'}.`
    );
  }
}

function bumpFieldStats(fieldStats, field, status, id) {
  if (!fieldStats.has(field)) fieldStats.set(field, { ok: 0, dexpara: 0, error: 0, affectedIds: new Set() });
  const stat = fieldStats.get(field);
  stat[status]++;
  if (status === 'error') stat.affectedIds.add(id);
}

function buildResult({
  entityName,
  originRecords,
  destRecords,
  comparedPairs,
  unmatchedOriginCount,
  unmatchedDestCount,
  fieldStats,
  divergences,
  validRecords,
  invalidRecords,
  clientStats,
  elapsedMs,
  usedRules,
  appliedFieldFilter,
}) {
  let ok = 0;
  let dexpara = 0;
  let error = 0;
  const fieldBreakdown = [];

  for (const [field, stat] of fieldStats.entries()) {
    ok += stat.ok;
    dexpara += stat.dexpara;
    error += stat.error;
    const totalField = stat.ok + stat.dexpara + stat.error;
    fieldBreakdown.push({
      field,
      ok: stat.ok,
      dexpara: stat.dexpara,
      error: stat.error,
      affectedRecords: stat.affectedIds.size,
      successRate: totalField ? Number((((stat.ok + stat.dexpara) / totalField) * 100).toFixed(1)) : 100,
    });
  }

  let clientsValid = 0;
  let clientsWithError = 0;
  let clientsUnmatched = 0;
  const unmatchedClients = [];

  for (const [id, cs] of clientStats.entries()) {
    if (cs.hasError) {
      clientsWithError++;
      continue;
    }
    if (cs.hasUnmatchedLeftover || !cs.matchedAny) {
      clientsUnmatched++;
      unmatchedClients.push(classifyUnmatchedClient(id, cs));
      continue;
    }
    clientsValid++;
  }

  const totalFieldsAnalyzed = ok + dexpara + error;
  const validFields = ok + dexpara;

  // TODOS os campos com pelo menos 1 erro, ordenados do mais crítico ao menos
  // crítico (por quantidade de CLIENTES afetados) — sem limite de quantidade,
  // o gráfico de barras do dashboard mostra todos.
  const topCriticalFields = [...fieldBreakdown]
    .filter((f) => f.error > 0)
    .sort((a, b) => b.affectedRecords - a.affectedRecords || b.error - a.error);
  const topDexParaFields = [...fieldBreakdown].sort((a, b) => b.dexpara - a.dexpara).slice(0, 10);

  return {
    entityName,
    generatedAt: new Date().toISOString(),
    appliedFieldFilter,
    fieldsAnalyzed: fieldBreakdown.map((f) => f.field).sort(),
    summary: {
      originRecordCount: originRecords.length,
      destRecordCount: destRecords.length,
      comparedPairs,
      unmatchedOriginCount,
      unmatchedDestCount,
      totalFieldsAnalyzed,
      validFields,
      invalidFields: error,
      // Quantidade de CAMPOS distintos (ex.: VKORG, NAME1) que apresentaram
      // erro em pelo menos 1 linha — não é a quantidade de linhas/ocorrências.
      fieldsWithErrorsCount: topCriticalFields.length,
      successRate: totalFieldsAnalyzed ? Number(((validFields / totalFieldsAnalyzed) * 100).toFixed(1)) : 100,
      elapsedMs: Math.round(elapsedMs),
      recordsValid: validRecords.length,
      recordsInvalid: invalidRecords.length,
      recordSuccessRate:
        validRecords.length + invalidRecords.length
          ? Number(((validRecords.length / (validRecords.length + invalidRecords.length)) * 100).toFixed(1))
          : 100,
      clientsTotal: clientStats.size,
      clientsValid,
      clientsWithError,
      clientsUnmatched,
      // Taxa de sucesso = válidos / (válidos + com divergência). Clientes sem
      // correspondência NÃO entram no denominador — não houve comparação real.
      clientSuccessRate: clientsValid + clientsWithError ? Number(((clientsValid / (clientsValid + clientsWithError)) * 100).toFixed(1)) : 100,
    },
    dexPara: {
      used: usedRules,
      literalMatches: ok,
      dexParaMatches: dexpara,
      percentResolvedByDexPara: ok + dexpara ? Number(((dexpara / (ok + dexpara)) * 100).toFixed(1)) : 0,
      topFields: topDexParaFields,
    },
    fieldBreakdown: fieldBreakdown.sort((a, b) => a.field.localeCompare(b.field)),
    topCriticalFields,
    divergences,
    validRecords,
    invalidRecords,
    unmatchedClients,
  };
}

function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
