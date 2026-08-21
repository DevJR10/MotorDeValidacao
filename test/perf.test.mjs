import { runValidation } from '../js/core/validationEngine.js';

const N = 200000;
const originRecords = [];
const destRecords = [];
for (let i = 0; i < N; i++) {
  const id = `C${i}`;
  originRecords.push({ id, fields: { KUNNR: id, NAME: `Cliente ${i}`, CITY: 'SAO PAULO' } });
  // 5% com divergência proposital
  const city = i % 20 === 0 ? 'RIO DE JANEIRO' : 'SAO PAULO';
  destRecords.push({ id, fields: { KUNNR: id, NAME: `Cliente ${i}`, CITY: city } });
}

globalThis.fetch = async () => ({ ok: true, json: async () => ({ table: 'GENERIC', fieldMappings: {} }) });

const t0 = performance.now();
const result = await runValidation({
  originRecords,
  destRecords,
  entityName: 'GENERIC',
  comparisonType: { useRules: false },
  entityConfig: null,
});
const t1 = performance.now();

console.log(`Registros: ${N.toLocaleString('pt-BR')} de cada lado`);
console.log(`Tempo total: ${(t1 - t0).toFixed(0)}ms`);
console.log(result.summary);
