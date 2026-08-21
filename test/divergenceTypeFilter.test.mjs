import assert from 'node:assert';
import { runValidation } from '../js/core/validationEngine.js';

// Cenário com os 2 tipos de divergência real que o filtro do relatório
// precisa distinguir hoje (DexPara NÃO é mais um deles — DexPara resolvido é
// validado, não aparece na lista/exportação de divergências):
// - NAME1: valor realmente diferente (error, não vazio)
// - CITY: vazio no destino (error, vazio)
// - CEP: De/Para aplicado -> deve ficar de fora de `divergences` por completo.
const originRecords = [{ id: '1', fields: { KUNNR: '1', NAME1: 'JOAO SILVA', CITY: 'SAO PAULO', CEP: '01000-000' } }];
const destRecords = [{ id: '1', fields: { KUNNR: '1', NAME1: 'JOAO S.', CITY: '', CEP: '01000000' } }];

const rules = { table: 'GENERIC', fieldMappings: { CEP: { map: { '01000-000': '01000000' } } } };
globalThis.fetch = async () => ({ ok: true, json: async () => rules });

const result = await runValidation({
  originRecords,
  destRecords,
  entityName: 'GENERIC',
  comparisonType: { useRules: true },
  entityConfig: null,
  fieldFilter: null,
});

const byField = Object.fromEntries(result.divergences.map((d) => [d.field, d]));

assert.strictEqual(byField.CEP, undefined, 'CEP foi resolvido via DexPara -> não deve aparecer na lista de divergências');

assert.strictEqual(byField.NAME1.status, 'error');
assert.strictEqual(byField.NAME1.isEmpty, false, 'NAME1 é uma diferença de valor real, não campo vazio');

assert.strictEqual(byField.CITY.status, 'error');
assert.strictEqual(byField.CITY.isEmpty, true, 'CITY está vazio no destino -> deve cair no filtro "apenas campos vazios"');

// A conversão de CEP continua contabilizada nas estatísticas de DexPara (para o card "Resolvido via DexPara").
assert.strictEqual(result.dexPara.dexParaMatches, 1);

console.log('✅ DexPara fora da lista de divergências; classificação de erro real x campo vazio continua correta para o filtro do relatório.');
