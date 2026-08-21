// core/matchingEngine.js
// -----------------------------------------------------------------------------
// Resolve o problema conhecido do V1: comparação de tabelas com múltiplos
// registros por identificador (ex.: KNVV — um Business Partner com vários
// registros de organização de vendas/canal/setor).
//
// V1 comparava por POSIÇÃO da linha na tabela HTML → falso positivo sempre que
// havia mais de um registro por cliente.
//
// V2 nunca compara por posição. A estratégia tem DUAS fases:
//
//   FASE 1 — casamento pela chave composta completa (config/entities.json),
//   considerando que um campo da chave pode ter sido convertido via De/Para
//   (ex.: VKORG "3000" → "BR10") e que essa conversão pode ser AMBÍGUA (um
//   valor de origem pode virar mais de um valor de destino — ex.: VKORG "11"
//   pode ser "50" OU "90"; se os dois existirem no destino, os dois são
//   comparados, gerando 2 pares para o mesmo registro de origem).
//
//   FASE 2 — "resgate": registros de destino que sobraram da fase 1 (nenhuma
//   assinatura bateu) mas que têm os campos ESTÁVEIS da chave (os que NÃO
//   têm regra De/Para) idênticos a algum registro de origem do mesmo cliente
//   são pareados mesmo assim. Isso cobre o caso em que o valor convertido
//   veio ERRADO (ex.: origem VTWEG "11" deveria virar "30" ou "50", mas o
//   destino tem "40") — em vez de sumir como "sem correspondência", o par é
//   formado e a comparação campo a campo (fora deste arquivo) naturalmente
//   marca esse campo específico como erro, sem afetar as outras linhas do
//   mesmo cliente que bateram certinho.
// -----------------------------------------------------------------------------

import { normalizeValue } from './normalization.js';
import { resolveMapping, acceptableTargets } from './ruleEngine.js';

const SEP = '\u241F'; // separador de unidade — não aparece em dados reais

/**
 * Indexa registros por identificador em O(n). Nunca faz busca linear.
 * @param {{id: string, fields: object}[]} records
 * @returns {Map<string, object[]>}
 */
export function indexById(records) {
  const map = new Map();
  for (const record of records) {
    const id = normalizeValue(record.id);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(record);
  }
  return map;
}

/**
 * Faz o matching entre dois grupos de registros que pertencem ao MESMO identificador.
 * Suporta 1:1, 1:N, N:1 e N:N.
 *
 * @param {object[]} originGroup
 * @param {object[]} destGroup
 * @param {{ keyFields?: string[], rules?: object|null }} options
 * @returns {{ pairs: {origin:object, dest:object}[], unmatchedOrigin: object[], unmatchedDest: object[] }}
 */
export function matchGroups(originGroup, destGroup, { keyFields, rules } = {}) {
  // Pool de destino com controle de "já usado" — cada registro serve para 1 correspondência
  const destPool = destGroup.map((record) => ({ record, used: false }));

  if (keyFields && keyFields.length) {
    return matchByCompositeKey(originGroup, destPool, keyFields, rules);
  }
  return matchGeneric(originGroup, destPool, rules);
}

// ---------------------------------------------------------------------------
// Estratégia com chave composta configurada (ex.: KNVV: KUNNR+VKORG+VTWEG+SPART)
// ---------------------------------------------------------------------------
function matchByCompositeKey(originGroup, destPool, keyFields, rules) {
  const destIndex = buildIndex(destPool, (entry) => buildSignature(entry.record, keyFields));

  const pairs = [];
  const unmatchedOrigin = [];

  // --- FASE 1: assinatura completa (literal + todas as alternativas De/Para) ---
  for (const origin of originGroup) {
    const candidateSignatures = buildCandidateSignatures(origin, keyFields, rules);

    // IMPORTANTE: percorremos TODAS as assinaturas candidatas, sem parar na
    // primeira que encontrar correspondência — necessário quando o De/Para é
    // ambíguo (um valor de origem pode virar mais de um valor de destino).
    // A exclusão "já usado" continua valendo DENTRO de cada assinatura (se
    // houver mais de um registro de destino empatado na mesma assinatura,
    // cada um só entra em um par), mas não impede que o mesmo registro de
    // origem seja comparado com registros de destino de assinaturas diferentes.
    let matchedAny = false;
    for (const sig of candidateSignatures) {
      const bucket = destIndex.get(sig);
      if (!bucket) continue;
      const freeEntry = bucket.find((e) => !e.used);
      if (!freeEntry) continue;
      freeEntry.used = true;
      pairs.push({ origin, dest: freeEntry.record });
      matchedAny = true;
    }

    if (!matchedAny) unmatchedOrigin.push(origin);
  }

  // --- FASE 2: resgate por campos estáveis (sem regra De/Para) ---
  // Só faz sentido rodar se existe pelo menos 1 campo estável para ancorar o
  // pareamento (senão não temos como saber "a quem" o registro pertence).
  const mappedFields = new Set(keyFields.filter((f) => resolveMapping(rules, f)?.map));
  const stableFields = keyFields.filter((f) => !mappedFields.has(f));

  if (stableFields.length && mappedFields.size) {
    const stableOriginIndex = buildIndex(
      originGroup.map((record) => ({ record, used: false })),
      (entry) => buildSignature(entry.record, stableFields)
    );

    for (const destEntry of destPool) {
      if (destEntry.used) continue;
      const stableSig = buildSignature(destEntry.record, stableFields);
      const candidates = stableOriginIndex.get(stableSig);
      if (!candidates || !candidates.length) continue;

      const originEntry = candidates[0]; // qualquer um serve como referência de comparação
      destEntry.used = true;
      pairs.push({ origin: originEntry.record, dest: destEntry.record });

      // Esse registro de origem passou a ter pelo menos um par — não é mais
      // "sem correspondência" (mesmo que o par tenha erro no campo convertido).
      const idx = unmatchedOrigin.indexOf(originEntry.record);
      if (idx !== -1) unmatchedOrigin.splice(idx, 1);
    }
  }

  const unmatchedDest = destPool.filter((e) => !e.used).map((e) => e.record);
  return { pairs, unmatchedOrigin, unmatchedDest };
}

/**
 * Gera todas as assinaturas candidatas para um registro de origem: a
 * assinatura literal, mais todas as combinações possíveis considerando o
 * De/Para de cada campo da chave (inclusive quando um campo é ambíguo e tem
 * mais de um valor de destino aceitável).
 */
function buildCandidateSignatures(origin, keyFields, rules) {
  const literalSig = buildSignature(origin, keyFields);
  const alternativesPerField = keyFields.map((field) => {
    const norm = normalizeValue(origin.fields[field]);
    const mapping = resolveMapping(rules, field);
    const targets = acceptableTargets(mapping, norm);
    return targets ? uniq([norm, ...targets.map((t) => t ?? '')]) : [norm];
  });
  return uniq([literalSig, ...cartesianJoin(alternativesPerField)]);
}

// ---------------------------------------------------------------------------
// Estratégia genérica (entidade sem chave composta configurada): matching
// guloso maximizando a quantidade de campos coincidentes. Ainda O(n*m) dentro
// do grupo do mesmo ID (grupos costumam ser pequenos — poucos registros por
// cliente), nunca O(n*m) no dataset inteiro.
// ---------------------------------------------------------------------------
function matchGeneric(originGroup, destPool, rules) {
  const pairs = [];
  const unmatchedOrigin = [];

  for (const origin of originGroup) {
    let best = null;
    let bestScore = -1;

    for (const entry of destPool) {
      if (entry.used) continue;
      const score = scoreFieldAgreement(origin, entry.record, rules);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }

    if (best && bestScore > 0) {
      best.used = true;
      pairs.push({ origin, dest: best.record });
    } else {
      unmatchedOrigin.push(origin);
    }
  }

  const unmatchedDest = destPool.filter((e) => !e.used).map((e) => e.record);
  return { pairs, unmatchedOrigin, unmatchedDest };
}

function scoreFieldAgreement(origin, dest, rules) {
  const fields = new Set([...Object.keys(origin.fields), ...Object.keys(dest.fields)]);
  let score = 0;
  for (const field of fields) {
    const a = normalizeValue(origin.fields[field]);
    const b = normalizeValue(dest.fields[field]);
    if (a === b) {
      score++;
      continue;
    }
    const targets = acceptableTargets(resolveMapping(rules, field), a);
    if (targets && targets.includes(b)) score++;
  }
  return score;
}

function buildIndex(entries, signatureFn) {
  const index = new Map();
  entries.forEach((entry) => {
    const sig = signatureFn(entry);
    if (!index.has(sig)) index.set(sig, []);
    index.get(sig).push(entry);
  });
  return index;
}

function buildSignature(record, keyFields) {
  return keyFields.map((f) => normalizeValue(record.fields[f])).join(SEP);
}

function cartesianJoin(arrays) {
  return arrays.reduce((acc, curr) => acc.flatMap((a) => curr.map((c) => (a ? `${a}${SEP}${c}` : c))), ['']);
}

function uniq(arr) {
  return [...new Set(arr)];
}
