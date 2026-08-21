import assert from 'node:assert';
import { runValidation, compareField } from '../js/core/validationEngine.js';

globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

// --- Teste unitário direto de compareField: 0 <-> null/vazio em ambas as direções ---
assert.strictEqual(compareField(0, null, null), 'ok', 'origem 0, destino null -> OK');
assert.strictEqual(compareField(0, '', null), 'ok', 'origem 0, destino vazio -> OK');
assert.strictEqual(compareField(null, 0, null), 'ok', 'origem null, destino 0 -> OK');
assert.strictEqual(compareField('', 0, null), 'ok', 'origem vazio, destino 0 -> OK');
assert.strictEqual(compareField(0, 0, null), 'ok', '0 e 0 continuam OK (igualdade literal)');
assert.strictEqual(compareField(1, null, null), 'error', 'origem 1 (não-zero), destino null -> continua erro');
assert.strictEqual(compareField(null, null, null), 'ok', 'null e null -> OK (igualdade literal, já era)');
console.log('✅ Regra 0 = null aplicada corretamente em compareField().');

// --- Teste de ponta a ponta: taxa de sucesso dos clientes exclui "sem correspondência" do denominador ---
const originRecords = [
  { id: '1', fields: { KUNNR: '1', SALDO: '0' } },   // válido (bate literal)
  { id: '2', fields: { KUNNR: '2', SALDO: '100' } },  // com divergência
  { id: '3', fields: { KUNNR: '3', SALDO: '50' } },   // sem correspondência (não existe no destino)
];
const destRecords = [
  { id: '1', fields: { KUNNR: '1', SALDO: '0' } },
  { id: '2', fields: { KUNNR: '2', SALDO: '999' } },
];

const result = await runValidation({
  originRecords,
  destRecords,
  entityName: 'GENERIC',
  comparisonType: { useRules: false },
  entityConfig: null,
});

assert.strictEqual(result.summary.clientsValid, 1);
assert.strictEqual(result.summary.clientsWithError, 1);
assert.strictEqual(result.summary.clientsUnmatched, 1);
// (1 válido) / (1 válido + 1 com divergência) = 50% -- cliente "sem correspondência" fica de fora
assert.strictEqual(result.summary.clientSuccessRate, 50);
console.log('✅ Taxa de sucesso dos clientes calculada corretamente (exclui "sem correspondência" do denominador).');
