import assert from 'node:assert';
import { runValidation } from '../js/core/validationEngine.js';

globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

// Cenário: KNVV-like, com os 3 tipos de "sem correspondência":
// - 100001: só existe na origem (ECC)
// - 100587: só existe no destino (S/4)
// - 100200: existe nos dois, mas uma das linhas (VKORG) só existe na origem
//           (a outra linha bate perfeitamente, sem erro)
const originRecords = [
  { id: '100001', fields: { KUNNR: '100001', VKORG: '3000', VTWEG: '10', SPART: '00' } },
  { id: '100200', fields: { KUNNR: '100200', VKORG: '3000', VTWEG: '10', SPART: '00' } },
  { id: '100200', fields: { KUNNR: '100200', VKORG: '4000', VTWEG: '10', SPART: '00' } }, // sem par no destino
];
const destRecords = [
  { id: '100587', fields: { KUNNR: '100587', VKORG: '3000', VTWEG: '10', SPART: '00' } },
  { id: '100200', fields: { KUNNR: '100200', VKORG: '3000', VTWEG: '10', SPART: '00' } },
];

const result = await runValidation({
  originRecords,
  destRecords,
  entityName: 'KNVV',
  comparisonType: { useRules: false },
  entityConfig: { primaryKey: ['KUNNR', 'VKORG', 'VTWEG', 'SPART'] },
});

// Regra de ouro do critério de aceite: a exportação tem que bater 100% com o card do dashboard.
assert.strictEqual(result.unmatchedClients.length, result.summary.clientsUnmatched, 'export e dashboard têm que ter a mesma contagem');
assert.strictEqual(result.summary.clientsUnmatched, 3);

const byId = Object.fromEntries(result.unmatchedClients.map((c) => [c.id, c]));

assert.strictEqual(byId['100001'].foundIn, 'Origem (ECC)');
assert.strictEqual(byId['100001'].missingFrom, 'Destino (S/4)');
assert.strictEqual(byId['100001'].reason, 'Cliente não encontrado no arquivo de destino');

assert.strictEqual(byId['100587'].foundIn, 'Destino (S/4)');
assert.strictEqual(byId['100587'].missingFrom, 'Origem (ECC)');
assert.strictEqual(byId['100587'].reason, 'Cliente não encontrado no arquivo de origem');

assert.strictEqual(byId['100200'].foundIn, 'Origem e Destino');
assert.strictEqual(byId['100200'].missingFrom, 'Parcial');

// Cliente 100200 não deve contar como "com divergência" nem "válido" (sua linha pareada bateu certinho)
assert.strictEqual(result.summary.clientsValid, 0);
assert.strictEqual(result.summary.clientsWithError, 0);

console.log('✅ Lista de clientes sem correspondência é 100% consistente com o card do dashboard, e a classificação (só origem / só destino / parcial) está correta.');
