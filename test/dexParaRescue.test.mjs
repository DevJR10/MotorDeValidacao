import assert from 'node:assert';
import { runValidation } from '../js/core/validationEngine.js';

globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

async function run({ originRecords, destRecords, rules, entityConfig }) {
  return runValidation({
    originRecords,
    destRecords,
    entityName: 'KNVV',
    comparisonType: { useRules: true },
    entityConfig,
    rulesBasePath: 'unused', // não usado: passamos as regras via stub de fetch abaixo
  });
}

// Regras usadas em todos os cenários: VTWEG "11" pode virar "30" OU "50" (ambíguo).
const RULES = { table: 'KNVV', fieldMappings: { VTWEG: { map: { '11': ['30', '50'] } } } };
const ENTITY_CONFIG = { primaryKey: ['KUNNR', 'VKORG', 'VTWEG', 'SPART'] };

function stubRules(rules) {
  globalThis.fetch = async () => ({ ok: true, json: async () => rules });
}

// ---------------------------------------------------------------------------
// Cenário 1 — exatamente o relatado: origem tem 1 linha (VTWEG 11), destino
// tem 3 linhas (30, 50 válidas; 40 não é alvo nenhum do De/Para).
// Esperado: 30 e 50 validam via DexPara; 40 aparece como ERRO só nessa linha.
// ---------------------------------------------------------------------------
{
  stubRules(RULES);
  const originRecords = [{ id: '1', fields: { KUNNR: '1', VKORG: '100', VTWEG: '11', SPART: '01' } }];
  const destRecords = [
    { id: '1', fields: { KUNNR: '1', VKORG: '100', VTWEG: '30', SPART: '01' } },
    { id: '1', fields: { KUNNR: '1', VKORG: '100', VTWEG: '50', SPART: '01' } },
    { id: '1', fields: { KUNNR: '1', VKORG: '100', VTWEG: '40', SPART: '01' } }, // errado
  ];
  const result = await run({ originRecords, destRecords, rules: RULES, entityConfig: ENTITY_CONFIG });

  assert.strictEqual(result.summary.comparedPairs, 3, 'as 3 linhas do destino devem ser comparadas (nenhuma "sem correspondência")');
  assert.strictEqual(result.summary.unmatchedOriginCount, 0);
  assert.strictEqual(result.summary.unmatchedDestCount, 0);

  const vtwegDivergences = result.divergences.filter((d) => d.field === 'VTWEG');
  assert.strictEqual(vtwegDivergences.length, 1, 'só a linha com VTWEG=40 deve aparecer como divergência');
  assert.strictEqual(vtwegDivergences[0].dest, '40');
  assert.strictEqual(vtwegDivergences[0].status, 'error');

  assert.strictEqual(result.summary.clientsWithError, 1, 'cliente deve ficar "com divergência" (não "sem correspondência") por causa da linha 40');
  assert.strictEqual(result.summary.clientsUnmatched, 0);
  console.log('✅ Cenário 1 (relatado): 30/50 validam, 40 vira erro isolado na própria linha.');
}

// ---------------------------------------------------------------------------
// Cenário 2 — todas as linhas do destino são válidas (nenhum erro).
// ---------------------------------------------------------------------------
{
  stubRules(RULES);
  const originRecords = [{ id: '2', fields: { KUNNR: '2', VKORG: '100', VTWEG: '11', SPART: '01' } }];
  const destRecords = [
    { id: '2', fields: { KUNNR: '2', VKORG: '100', VTWEG: '30', SPART: '01' } },
    { id: '2', fields: { KUNNR: '2', VKORG: '100', VTWEG: '50', SPART: '01' } },
  ];
  const result = await run({ originRecords, destRecords, rules: RULES, entityConfig: ENTITY_CONFIG });

  assert.strictEqual(result.summary.comparedPairs, 2);
  assert.strictEqual(result.divergences.length, 0);
  assert.strictEqual(result.summary.clientsValid, 1);
  console.log('✅ Cenário 2: todas as linhas do destino batem via DexPara — cliente 100% válido.');
}

// ---------------------------------------------------------------------------
// Cenário 3 — todas as linhas do destino estão erradas (nenhuma é 30 nem 50).
// ---------------------------------------------------------------------------
{
  stubRules(RULES);
  const originRecords = [{ id: '3', fields: { KUNNR: '3', VKORG: '100', VTWEG: '11', SPART: '01' } }];
  const destRecords = [
    { id: '3', fields: { KUNNR: '3', VKORG: '100', VTWEG: '40', SPART: '01' } },
    { id: '3', fields: { KUNNR: '3', VKORG: '100', VTWEG: '60', SPART: '01' } },
  ];
  const result = await run({ originRecords, destRecords, rules: RULES, entityConfig: ENTITY_CONFIG });

  assert.strictEqual(result.summary.comparedPairs, 2, 'as 2 linhas erradas ainda devem ser comparadas (não "sem correspondência")');
  assert.strictEqual(result.summary.unmatchedDestCount, 0);
  const vtwegErrors = result.divergences.filter((d) => d.field === 'VTWEG' && d.status === 'error');
  assert.strictEqual(vtwegErrors.length, 2, 'as 2 linhas devem aparecer como erro');
  assert.strictEqual(result.summary.clientsWithError, 1);
  console.log('✅ Cenário 3: nenhuma linha do destino bate — as 2 aparecem como erro (não somem).');
}

// ---------------------------------------------------------------------------
// Cenário 4 — cliente realmente sem correspondência (não existe em um dos
// arquivos) continua funcionando como antes — a fase 2 não deve inventar
// pares para clientes que não têm NENHUM registro do outro lado.
// ---------------------------------------------------------------------------
{
  stubRules(RULES);
  const originRecords = [{ id: '4', fields: { KUNNR: '4', VKORG: '100', VTWEG: '11', SPART: '01' } }];
  const destRecords = [];
  const result = await run({ originRecords, destRecords, rules: RULES, entityConfig: ENTITY_CONFIG });

  assert.strictEqual(result.summary.comparedPairs, 0);
  assert.strictEqual(result.summary.unmatchedOriginCount, 1);
  assert.strictEqual(result.summary.clientsUnmatched, 1);
  console.log('✅ Cenário 4: cliente ausente de um dos arquivos continua "sem correspondência" (fase 2 não interfere).');
}

// ---------------------------------------------------------------------------
// Cenário 5 — linha de destino com VKORG diferente (campo estável da chave)
// não deve ser "resgatada" pela fase 2 — ela pertence a outro contexto, não
// deveria ser comparada com a linha de VTWEG=11 só porque VTWEG bate por
// coincidência com outra coisa. Confirma que a fase 2 respeita TODOS os
// campos estáveis, não só um deles.
// ---------------------------------------------------------------------------
{
  stubRules(RULES);
  const originRecords = [{ id: '5', fields: { KUNNR: '5', VKORG: '100', VTWEG: '11', SPART: '01' } }];
  const destRecords = [
    { id: '5', fields: { KUNNR: '5', VKORG: '200', VTWEG: '40', SPART: '01' } }, // VKORG diferente (200 != 100) -> não deve casar
  ];
  const result = await run({ originRecords, destRecords, rules: RULES, entityConfig: ENTITY_CONFIG });

  assert.strictEqual(result.summary.comparedPairs, 0, 'não deveria comparar — VKORG (campo estável) é diferente');
  assert.strictEqual(result.summary.unmatchedOriginCount, 1);
  assert.strictEqual(result.summary.unmatchedDestCount, 1);
  console.log('✅ Cenário 5: registros com campo estável (VKORG) diferente continuam "sem correspondência", como deveria.');
}

// ---------------------------------------------------------------------------
// Cenário 6 — múltiplos clientes ao mesmo tempo, cada um com um resultado
// diferente, pra garantir que não há vazamento de pareamento entre clientes.
// ---------------------------------------------------------------------------
{
  stubRules(RULES);
  const originRecords = [
    { id: '6', fields: { KUNNR: '6', VKORG: '100', VTWEG: '11', SPART: '01' } },
    { id: '7', fields: { KUNNR: '7', VKORG: '100', VTWEG: '11', SPART: '01' } },
  ];
  const destRecords = [
    { id: '6', fields: { KUNNR: '6', VKORG: '100', VTWEG: '30', SPART: '01' } }, // cliente 6: válido
    { id: '7', fields: { KUNNR: '7', VKORG: '100', VTWEG: '99', SPART: '01' } }, // cliente 7: errado
  ];
  const result = await run({ originRecords, destRecords, rules: RULES, entityConfig: ENTITY_CONFIG });

  assert.strictEqual(result.summary.comparedPairs, 2);
  assert.strictEqual(result.summary.clientsValid, 1);
  assert.strictEqual(result.summary.clientsWithError, 1);
  const errorClient = result.divergences.find((d) => d.field === 'VTWEG');
  assert.strictEqual(errorClient.id, '7', 'o erro deve ser atribuído ao cliente correto (7), não vazar pro cliente 6');
  console.log('✅ Cenário 6: múltiplos clientes processados corretamente, sem vazamento de pareamento entre eles.');
}

console.log('\n🎉 Todos os cenários da Fase 2 (resgate por campos estáveis) passaram.');
