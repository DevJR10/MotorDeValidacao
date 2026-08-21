import assert from 'node:assert';
import { runValidation } from '../js/core/validationEngine.js';

// Simula exatamente o bug relatado no toDo.txt do V1:
// mesmo cliente (KUNNR 10001) com múltiplos registros KNVV (setores/organizações
// de vendas diferentes), e VKORG sofrendo conversão De/Para (3000 -> BR10).

const originRecords = [
  { id: '10001', fields: { KUNNR: '10001', VKORG: '3000', VTWEG: '10', SPART: '00' } },
  { id: '10001', fields: { KUNNR: '10001', VKORG: '3700', VTWEG: '10', SPART: '00' } },
  { id: '10002', fields: { KUNNR: '10002', VKORG: '3000', VTWEG: '10', SPART: '00' } },
];

const destRecords = [
  { id: '10001', fields: { KUNNR: '10001', VKORG: 'BR10', VTWEG: '10', SPART: '00' } }, // veio do 3000
  { id: '10001', fields: { KUNNR: '10001', VKORG: 'BR10', VTWEG: '10', SPART: '00' } }, // veio do 3700 (mesmo VKORG destino!)
  { id: '10002', fields: { KUNNR: '10002', VKORG: 'XX99', VTWEG: '10', SPART: '00' } }, // VKORG errado: 3000 só pode virar BR10, não XX99
];

const rules = {
  table: 'KNVV',
  fieldMappings: {
    VKORG: { eccField: 'VKORG', s4Field: 'VKORG', map: { '3000': 'BR10', '3700': 'BR10' } },
  },
};

// stub de fetch usado pelo ruleEngine (loadRules faz fetch(`${base}/${entity}.json`))
globalThis.fetch = async () => ({ ok: true, json: async () => rules });

const result = await runValidation({
  originRecords,
  destRecords,
  entityName: 'KNVV',
  comparisonType: { useRules: true },
  entityConfig: { primaryKey: ['KUNNR', 'VKORG', 'VTWEG', 'SPART'] },
});

console.log('--- Resumo ---');
console.log(result.summary);
console.log('--- Divergências ---');
console.log(result.divergences);

// Os DOIS registros do cliente 10001 devem casar (1:N -> N:N resolvido), cada um usado uma vez.
const pairsFor10001 = 2;
// O cliente 10002 também deve ser comparado (KUNNR+VTWEG+SPART batem, campos "estáveis" da
// chave) mesmo o VKORG do destino não sendo nenhum dos valores esperados pelo De/Para —
// isso deve virar ERRO no campo VKORG, não "sem correspondência" (fase 2 do matching).
const pairsFor10002 = 1;
assert.strictEqual(result.summary.comparedPairs, pairsFor10001 + pairsFor10002, 'deveria casar os 2 registros do cliente 10001, e também comparar o cliente 10002 (mesmo com VKORG errado)');

// Ninguém deveria sobrar como "sem correspondência" neste cenário — o cliente 10002 tem os
// campos estáveis da chave batendo, então é comparado (e dá erro no VKORG), não descartado.
assert.strictEqual(result.summary.unmatchedOriginCount, 0);
assert.strictEqual(result.summary.unmatchedDestCount, 0);

// Nenhuma divergência de erro para os pares do cliente 10001 (a diferença de VKORG é DexPara, não erro)
const errorsFor10001 = result.divergences.filter((d) => d.id === '10001' && d.status === 'error');
assert.strictEqual(errorsFor10001.length, 0, 'não deveria haver falso positivo de erro para o cliente 10001');

// O cliente 10002 deve mostrar erro especificamente no campo VKORG (XX99 não é BR10).
const errorsFor10002 = result.divergences.filter((d) => d.id === '10002' && d.field === 'VKORG' && d.status === 'error');
assert.strictEqual(errorsFor10002.length, 1, 'cliente 10002 deve mostrar erro no campo VKORG (valor de destino não é um alvo válido do De/Para)');

// DexPara resolvido = validado, não é mais listado como divergência em lugar nenhum (fix desta rodada).
const dexParaFor10001NaListaDeDivergencias = result.divergences.filter((d) => d.id === '10001' && d.status === 'dexpara');
assert.strictEqual(dexParaFor10001NaListaDeDivergencias.length, 0, 'DexPara não deve mais aparecer na lista/exportação de divergências');

// A conversão via DexPara continua sendo contabilizada nas estatísticas (para o card "Resolvido via DexPara"),
// só não entra mais como "divergência".
assert.strictEqual(result.dexPara.dexParaMatches, 2, 'as 2 conversões de VKORG continuam contadas nas estatísticas de DexPara');

// Cliente 10001 = válido (DexPara não é mais divergência). Cliente 10002 = com divergência (VKORG errado).
assert.strictEqual(result.summary.clientsValid, 1, 'cliente 10001 deve ser classificado como válido (DexPara não é mais divergência)');
assert.strictEqual(result.summary.clientsWithError, 1, 'cliente 10002 deve ser classificado como "com divergência" (VKORG errado), não mais como "sem correspondência"');
assert.strictEqual(result.summary.clientsUnmatched, 0);

console.log('\n✅ Todos os asserts passaram — bug de N:N do KNVV está corrigido.');
