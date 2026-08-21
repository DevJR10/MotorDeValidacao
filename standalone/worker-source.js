// ============================================================================
// WORKER — motor de validação completo, sem import/export (script clássico).
// Roda via Blob URL (new Worker(URL.createObjectURL(blob))), que funciona
// mesmo com a página aberta via file://, ao contrário de um Worker apontando
// para um arquivo .js separado (isso é bloqueado pelo Chrome/Edge em file://).
// ============================================================================

// IMPORTANTE: o SheetJS (xlsx) não publica mais versões recentes no registro
// npm padrão — por isso jsDelivr/unpkg NÃO têm a 0.20.3 (só até ~0.18.x lá).
// A URL abaixo é o CDN oficial deles (cdn.sheetjs.com), documentado em
// https://docs.sheetjs.com/docs/getting-started/installation/standalone/ —
// usar jsDelivr aqui causava 404 e quebrava a importação do arquivo Excel.
importScripts('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
importScripts('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js');

// ---------------------------------------------------------------------------
// core/normalization
// ---------------------------------------------------------------------------
const INVISIBLE_CHARS_REGEX = /[\u200B-\u200D\uFEFF\u00A0]/g;

function normalizeValue(value, options = {}) {
  const { uppercase = true, stripLeadingZeros = false } = options;
  if (value === null || value === undefined) return '';
  let v = value instanceof Date ? formatDate(value) : value;
  v = String(v);
  v = v.replace(INVISIBLE_CHARS_REGEX, '');
  v = v.trim().replace(/\s+/g, ' ');
  if (uppercase) v = v.toUpperCase();
  if (stripLeadingZeros && /^0*\d+$/.test(v)) v = v.replace(/^0+(?=\d)/, '');
  return v;
}

function formatDate(date, format = 'YYYY-MM-DD') {
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return format === 'YYYY-MM-DD' ? `${yyyy}-${mm}-${dd}` : `${dd}/${mm}/${yyyy}`;
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

// ---------------------------------------------------------------------------
// core/ruleEngine (versão worker: regras já vêm resolvidas do thread principal)
// ---------------------------------------------------------------------------
function resolveMapping(rules, field) {
  if (!rules?.fieldMappings) return null;
  if (rules.fieldMappings[field]) return rules.fieldMappings[field];
  return (
    Object.values(rules.fieldMappings).find((m) => m.eccField === field || m.s4Field === field || m.originField === field) || null
  );
}

function acceptableTargets(mapping, sourceNormalizedValue) {
  if (!mapping?.map) return null;
  const target = mapping.map[sourceNormalizedValue];
  if (target === undefined) return null;
  const arr = Array.isArray(target) ? target : [target];
  return arr.map((t) => (t === null ? null : normalizeValue(t)));
}

// ---------------------------------------------------------------------------
// core/matchingEngine
// ---------------------------------------------------------------------------
const SEP = '\u241F';

function indexById(records) {
  const map = new Map();
  for (const record of records) {
    const id = normalizeValue(record.id);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(record);
  }
  return map;
}

function matchGroups(originGroup, destGroup, { keyFields, rules } = {}) {
  const destPool = destGroup.map((record) => ({ record, used: false }));
  if (keyFields && keyFields.length) return matchByCompositeKey(originGroup, destPool, keyFields, rules);
  return matchGeneric(originGroup, destPool, rules);
}

function matchByCompositeKey(originGroup, destPool, keyFields, rules) {
  const destIndex = buildIndex(destPool, (entry) => buildSignature(entry.record, keyFields));

  const pairs = [];
  const unmatchedOrigin = [];

  // --- FASE 1: assinatura completa (literal + todas as alternativas De/Para) ---
  for (const origin of originGroup) {
    const candidateSignatures = buildCandidateSignatures(origin, keyFields, rules);

    // Percorre TODAS as assinaturas candidatas (não para na primeira) —
    // necessário quando o De/Para é ambíguo (um valor de origem pode virar
    // mais de um valor de destino, ex.: VKORG "11" -> "50" ou "90").
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
  // Registros de destino que sobraram (nenhuma assinatura bateu) mas têm os
  // campos ESTÁVEIS da chave idênticos a algum registro de origem do mesmo
  // cliente são pareados mesmo assim — o valor convertido veio ERRADO (ex.:
  // origem VTWEG "11" deveria virar "30" ou "50", mas o destino tem "40").
  // Em vez de sumir como "sem correspondência", o par é formado e a
  // comparação campo a campo marca esse campo específico como erro.
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

      const originEntry = candidates[0];
      destEntry.used = true;
      pairs.push({ origin: originEntry.record, dest: destEntry.record });

      const idx = unmatchedOrigin.indexOf(originEntry.record);
      if (idx !== -1) unmatchedOrigin.splice(idx, 1);
    }
  }

  const unmatchedDest = destPool.filter((e) => !e.used).map((e) => e.record);
  return { pairs, unmatchedOrigin, unmatchedDest };
}

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

function buildIndex(entries, signatureFn) {
  const index = new Map();
  entries.forEach((entry) => {
    const sig = signatureFn(entry);
    if (!index.has(sig)) index.set(sig, []);
    index.get(sig).push(entry);
  });
  return index;
}

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

function buildSignature(record, keyFields) {
  return keyFields.map((f) => normalizeValue(record.fields[f])).join(SEP);
}

function cartesianJoin(arrays) {
  return arrays.reduce((acc, curr) => acc.flatMap((a) => curr.map((c) => (a ? `${a}${SEP}${c}` : c))), ['']);
}

function uniq(arr) {
  return [...new Set(arr)];
}

// ---------------------------------------------------------------------------
// core/validationEngine
// ---------------------------------------------------------------------------
function compareField(originValue, destValue, mapping) {
  const a = normalizeValue(originValue);
  const b = normalizeValue(destValue);
  if (a === b) return 'ok';

  // Regra de negócio: 0 e vazio/null são equivalentes, nas duas direções.
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

function classifyUnmatchedClient(id, cs) {
  if (cs.hasOrigin && !cs.hasDest) {
    return { id, foundIn: 'Origem (ECC)', missingFrom: 'Destino (S/4)', reason: 'Cliente não encontrado no arquivo de destino' };
  }
  if (!cs.hasOrigin && cs.hasDest) {
    return { id, foundIn: 'Destino (S/4)', missingFrom: 'Origem (ECC)', reason: 'Cliente não encontrado no arquivo de origem' };
  }
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

function validateFieldFilter(fieldFilter, originRecords, destRecords) {
  const knownFields = new Set();
  for (const r of originRecords.slice(0, 50)) Object.keys(r.fields).forEach((f) => knownFields.add(normalizeFieldName(f)));
  for (const r of destRecords.slice(0, 50)) Object.keys(r.fields).forEach((f) => knownFields.add(normalizeFieldName(f)));
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

async function runValidation({ originRecords, destRecords, entityName, rules, entityConfig, fieldFilter, onProgress }) {
  const startedAt = performance.now();
  onProgress({ stage: 'indexing', percent: 15 });

  const originIndex = indexById(originRecords);
  const destIndex = indexById(destRecords);
  const allIds = new Set([...originIndex.keys(), ...destIndex.keys()]);
  const keyFields = entityConfig?.primaryKey || null;
  const fieldFilterSet = fieldFilter && fieldFilter.length ? new Set(fieldFilter.map(normalizeFieldName)) : null;

  if (fieldFilterSet) {
    validateFieldFilter(fieldFilter, originRecords, destRecords);
  }

  const fieldStats = new Map();
  const divergences = [];
  const validRecords = [];
  const invalidRecords = [];
  const clientStats = new Map();

  let comparedPairs = 0;
  let unmatchedOriginCount = 0;
  let unmatchedDestCount = 0;
  let processed = 0;
  const total = allIds.size || 1;
  const YIELD_EVERY = 500;

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
      await new Promise((resolve) => setTimeout(resolve, 0));
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
    usedRules: Boolean(rules),
    appliedFieldFilter: fieldFilterSet ? fieldFilter : null,
  });

  onProgress({ stage: 'done', percent: 100 });
  return result;
}

function buildResult({
  entityName, originRecords, destRecords, comparedPairs, unmatchedOriginCount, unmatchedDestCount,
  fieldStats, divergences, validRecords, invalidRecords, clientStats, elapsedMs, usedRules, appliedFieldFilter,
}) {
  let ok = 0, dexpara = 0, error = 0;
  const fieldBreakdown = [];

  for (const [field, stat] of fieldStats.entries()) {
    ok += stat.ok; dexpara += stat.dexpara; error += stat.error;
    const totalField = stat.ok + stat.dexpara + stat.error;
    fieldBreakdown.push({
      field, ok: stat.ok, dexpara: stat.dexpara, error: stat.error,
      affectedRecords: stat.affectedIds.size,
      successRate: totalField ? Number((((stat.ok + stat.dexpara) / totalField) * 100).toFixed(1)) : 100,
    });
  }

  let clientsValid = 0, clientsWithError = 0, clientsUnmatched = 0;
  const unmatchedClients = [];
  for (const [id, cs] of clientStats.entries()) {
    if (cs.hasError) { clientsWithError++; continue; }
    if (cs.hasUnmatchedLeftover || !cs.matchedAny) {
      clientsUnmatched++;
      unmatchedClients.push(classifyUnmatchedClient(id, cs));
      continue;
    }
    clientsValid++;
  }

  const totalFieldsAnalyzed = ok + dexpara + error;
  const validFields = ok + dexpara;
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
      fieldsWithErrorsCount: topCriticalFields.length,
      successRate: totalFieldsAnalyzed ? Number(((validFields / totalFieldsAnalyzed) * 100).toFixed(1)) : 100,
      elapsedMs: Math.round(elapsedMs),
      recordsValid: validRecords.length,
      recordsInvalid: invalidRecords.length,
      recordSuccessRate: validRecords.length + invalidRecords.length ? Number(((validRecords.length / (validRecords.length + invalidRecords.length)) * 100).toFixed(1)) : 100,
      clientsTotal: clientStats.size,
      clientsValid, clientsWithError, clientsUnmatched,
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

// ---------------------------------------------------------------------------
// importers (usam XLSX/Papa globais, carregados via importScripts acima)
// ---------------------------------------------------------------------------
function cleanRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (!key || key.toString().trim() === '' || key.toString().startsWith('__EMPTY')) continue;
    out[key] = value;
  }
  return out;
}

function toRecords(rows, idField) {
  const records = [];
  for (const row of rows) {
    const fields = cleanRow(row);
    const hasData = Object.values(fields).some((v) => v !== null && v !== '');
    if (!hasData) continue;
    const rawId = fields[idField];
    if (rawId === undefined || rawId === null || rawId === '') continue;
    records.push({ id: String(rawId), fields });
  }
  return records;
}

async function importExcel(file, idField) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return toRecords(rows, idField);
}

async function importCsv(file, idField) {
  const text = await file.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false, transformHeader: (h) => h.trim() });
  return toRecords(parsed.data, idField);
}

async function importApi(url, idField, options = {}) {
  let response;
  try {
    response = await fetch(url, { method: 'GET', headers: options.headers || {} });
  } catch (err) {
    throw new Error(`Não foi possível conectar à API (${url}): ${err.message}`);
  }
  if (!response.ok) throw new Error(`API retornou ${response.status} ${response.statusText} (${url})`);
  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Resposta da API em ${url} não é um JSON válido.`);
  }
  const rows = Array.isArray(json) ? json : getByPath(json, options.arrayPath) || json.data || json.results || json.value;
  if (!Array.isArray(rows)) throw new Error('Não foi possível localizar uma lista de registros na resposta da API. Informe "arrayPath".');
  const records = [];
  for (const row of rows) {
    const rawId = row?.[idField];
    if (rawId === undefined || rawId === null || rawId === '') continue;
    records.push({ id: String(rawId), fields: row });
  }
  return records;
}

function getByPath(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

async function importData(source) {
  switch (source.type) {
    case 'excel': return importExcel(source.file, source.idField);
    case 'csv': return importCsv(source.file, source.idField);
    case 'api': return importApi(source.url, source.idField, source.options);
    default: throw new Error(`Tipo de origem de dados desconhecido: "${source.type}"`);
  }
}

// ---------------------------------------------------------------------------
// mensageria
// ---------------------------------------------------------------------------
self.onmessage = async (event) => {
  const { originSource, destSource, entityName, rules, entityConfig, fieldFilter } = event.data;
  try {
    post({ type: 'progress', stage: 'import', percent: 2, message: 'Lendo origem...' });
    const originRecords = await importData(originSource);
    post({ type: 'progress', stage: 'import', percent: 8, message: 'Lendo destino...' });
    const destRecords = await importData(destSource);

    if (!originRecords.length) throw new Error('Nenhum registro válido encontrado na origem (verifique o campo de ID selecionado).');
    if (!destRecords.length) throw new Error('Nenhum registro válido encontrado no destino (verifique o campo de ID selecionado).');

    const result = await runValidation({
      originRecords, destRecords, entityName, rules, entityConfig, fieldFilter,
      onProgress: (progress) => post({ type: 'progress', ...progress }),
    });

    post({ type: 'done', result });
  } catch (err) {
    post({ type: 'error', message: err?.message || 'Erro desconhecido durante a validação.' });
  }
};

function post(message) {
  self.postMessage(message);
}
