import assert from 'node:assert';
import { runValidation } from '../js/core/validationEngine.js';

globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

const originRecords = [{ id: '1', fields: { KUNNR: '1', NAME1: 'ACME', CITY: 'SAO PAULO' } }];
const destRecords = [{ id: '1', fields: { KUNNR: '1', NAME1: 'ACME LTDA', CITY: 'RIO DE JANEIRO' } }];

// Campo digitado errado ("NAMEEE1" em vez de "NAME1"): antes, isso fazia o
// registro ser processado com 0 campos comparados e marcado como "válido"
// incorretamente. Agora deve falhar com uma mensagem clara.
let threw = false;
try {
  await runValidation({
    originRecords,
    destRecords,
    entityName: 'GENERIC',
    comparisonType: { useRules: false },
    entityConfig: null,
    fieldFilter: ['NAMEEE1'],
  });
} catch (err) {
  threw = true;
  assert.match(err.message, /NAMEEE1/, 'a mensagem de erro deve citar o campo digitado errado');
  assert.match(err.message, /NAME1/, 'a mensagem de erro deve sugerir/listar as colunas reais disponíveis (NAME1)');
  console.log('Mensagem de erro:', err.message);
}
assert.strictEqual(threw, true, 'deveria ter lançado um erro para um campo de filtro que não existe nos dados');
console.log('✅ Filtro com campo inexistente é rejeitado com mensagem clara, em vez de gerar falso "válido".');

// Campo correto (mesmo com case diferente) continua funcionando normalmente.
const result = await runValidation({
  originRecords,
  destRecords,
  entityName: 'GENERIC',
  comparisonType: { useRules: false },
  entityConfig: null,
  fieldFilter: ['name1'],
});
assert.strictEqual(result.summary.totalFieldsAnalyzed, 1);
console.log('✅ Filtro com campo correto (case-insensitive) continua funcionando.');
