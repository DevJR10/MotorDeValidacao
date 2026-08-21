import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { getFieldInfo, SAP_FIELD_DICTIONARY } from '../js/dashboard/fieldDictionary.js';

// Lookup deve ser case-insensitive e tolerar espaços.
assert.deepStrictEqual(getFieldInfo('spart'), getFieldInfo('SPART'));
assert.deepStrictEqual(getFieldInfo(' vkorg '), getFieldInfo('VKORG'));
assert.strictEqual(getFieldInfo(''), null);
assert.strictEqual(getFieldInfo('CAMPO_QUE_NAO_EXISTE_123'), null);

// Toda entrada precisa ter label e description não-vazios (senão o tooltip fica incompleto).
for (const [field, info] of Object.entries(SAP_FIELD_DICTIONARY)) {
  assert.ok(info.label && info.label.length > 0, `${field} sem label`);
  assert.ok(info.description && info.description.length > 10, `${field} sem descrição útil`);
}

// Todos os campos usados nas chaves compostas de config/entities.json devem estar catalogados
// (são os que mais aparecem nos gráficos de campo crítico na prática).
const entities = JSON.parse(readFileSync(new URL('../config/entities.json', import.meta.url)));
const missing = [];
for (const [table, cfg] of Object.entries(entities)) {
  for (const field of cfg.primaryKey || []) {
    if (!getFieldInfo(field)) missing.push(`${table}.${field}`);
  }
}
assert.deepStrictEqual(missing, [], `Campos de chave composta sem entrada no dicionário: ${missing.join(', ')}`);

console.log(`✅ Dicionário de campos SAP OK — ${Object.keys(SAP_FIELD_DICTIONARY).length} campos catalogados, todos com label+descrição, cobrindo as chaves compostas configuradas.`);
