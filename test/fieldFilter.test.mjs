import assert from 'node:assert';
import { runValidation } from '../js/core/validationEngine.js';

// Cliente com 3 campos, mas o usuário só quer analisar 1.
const originRecords = [{ id: '1', fields: { KUNNR: '1', NAME1: 'ACME', CITY: 'SAO PAULO', STREET: 'RUA A' } }];
const destRecords = [{ id: '1', fields: { KUNNR: '1', NAME1: 'ACME LTDA', CITY: 'RIO DE JANEIRO', STREET: 'RUA A' } }];

globalThis.fetch = async () => ({ ok: true, json: async () => ({ table: 'GENERIC', fieldMappings: {} }) });

const result = await runValidation({
  originRecords,
  destRecords,
  entityName: 'GENERIC',
  comparisonType: { useRules: false },
  entityConfig: null,
  fieldFilter: ['street'], // minúsculo deve ser normalizado
});

assert.strictEqual(result.summary.totalFieldsAnalyzed, 1, 'só o campo filtrado (STREET) deveria ser analisado');
assert.strictEqual(result.fieldsAnalyzed.length, 1);
assert.strictEqual(result.fieldsAnalyzed[0], 'STREET');
assert.strictEqual(result.summary.recordsValid, 1, 'STREET bate em ambos -> registro válido, mesmo com NAME1/CITY divergentes fora do filtro');
assert.deepStrictEqual(result.appliedFieldFilter, ['street']);

console.log('✅ Filtro de campos (tela de upload) funcionando corretamente.');
