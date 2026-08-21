import assert from 'node:assert';
import { runValidation } from '../js/core/validationEngine.js';

// Cenário exato relatado: origem tem 2 áreas de vendas para o cliente
// (11/00 e 11/01), destino tem 4 (50/00, 50/01, 90/00, 90/01) — porque a
// organização de vendas "11" foi desmembrada em "50" e "90" no S/4.
const originRecords = [
  { id: '77001', fields: { KUNNR: '77001', VKORG: '11', VTWEG: '00', SPART: '01' } },
  { id: '77001', fields: { KUNNR: '77001', VKORG: '11', VTWEG: '01', SPART: '01' } },
];

const destRecords = [
  { id: '77001', fields: { KUNNR: '77001', VKORG: '50', VTWEG: '00', SPART: '01' } },
  { id: '77001', fields: { KUNNR: '77001', VKORG: '50', VTWEG: '01', SPART: '01' } },
  { id: '77001', fields: { KUNNR: '77001', VKORG: '90', VTWEG: '00', SPART: '01' } },
  { id: '77001', fields: { KUNNR: '77001', VKORG: '90', VTWEG: '01', SPART: '01' } },
];

// De/Para AMBÍGUO: "11" pode virar "50" OU "90" — os dois são válidos.
const rules = {
  table: 'KNVV',
  fieldMappings: {
    VKORG: { map: { '11': ['50', '90'] } },
  },
};

globalThis.fetch = async () => ({ ok: true, json: async () => rules });

const result = await runValidation({
  originRecords,
  destRecords,
  entityName: 'KNVV',
  comparisonType: { useRules: true },
  entityConfig: { primaryKey: ['KUNNR', 'VKORG', 'VTWEG', 'SPART'] },
});

console.log('Resumo:', result.summary);

// As 4 combinações do destino devem ser comparadas — nenhuma pode ficar "sem
// correspondência" só porque o algoritmo já tinha "gasto" o registro de
// origem na primeira combinação que encontrou.
assert.strictEqual(result.summary.comparedPairs, 4, 'as 4 combinações de destino devem ser comparadas (2 origem x 2 destinos cada)');
assert.strictEqual(result.summary.unmatchedOriginCount, 0, 'nenhum registro de origem deveria ficar sem correspondência');
assert.strictEqual(result.summary.unmatchedDestCount, 0, 'nenhum registro de destino deveria ficar sem correspondência');

// Cliente deve ser válido (tudo bateu via DexPara, sem erro real).
assert.strictEqual(result.summary.clientsValid, 1);
assert.strictEqual(result.summary.clientsUnmatched, 0);
assert.strictEqual(result.summary.clientsWithError, 0);

console.log('✅ Matching do KNVV com De/Para ambíguo (1 valor de origem -> vários de destino) agora compara todas as combinações.');
