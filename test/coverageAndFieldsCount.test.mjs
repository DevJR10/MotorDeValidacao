import assert from 'node:assert';
import { runValidation } from '../js/core/validationEngine.js';

globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

// ---------------------------------------------------------------------------
// Cenário 1 — reprodução exata do relatado: origem com 100, destino com 200.
// Os 100 "extras" do destino (clientes que não existem na origem) devem
// aparecer como "sem correspondência".
// ---------------------------------------------------------------------------
{
  const originRecords = [];
  for (let i = 1; i <= 100; i++) originRecords.push({ id: String(i), fields: { KUNNR: String(i), NAME1: `Cliente ${i}` } });

  const destRecords = [];
  for (let i = 1; i <= 200; i++) destRecords.push({ id: String(i), fields: { KUNNR: String(i), NAME1: `Cliente ${i}` } });

  const result = await runValidation({
    originRecords,
    destRecords,
    entityName: 'GENERIC',
    comparisonType: { useRules: false },
    entityConfig: null,
  });

  assert.strictEqual(result.summary.clientsUnmatched, 100, 'os 100 clientes extras do destino devem aparecer como sem correspondência');
  assert.strictEqual(result.unmatchedClients.length, 100);
  assert.strictEqual(result.summary.clientsValid, 100);
  console.log('✅ Cenário origem=100/destino=200: 100 sem correspondência, confirmados no motor.');
}

// ---------------------------------------------------------------------------
// Cenário 2 — gráfico de barras deve trazer TODOS os campos com erro, sem
// limite de 10. Monta um cenário com 15 campos diferentes, cada um com erro
// em exatamente 1 cliente distinto.
// ---------------------------------------------------------------------------
{
  const fieldNames = Array.from({ length: 15 }, (_, i) => `CAMPO${i + 1}`);
  const originRecords = [];
  const destRecords = [];
  fieldNames.forEach((field, i) => {
    const id = `C${i}`;
    const originFields = { KUNNR: id };
    const destFields = { KUNNR: id };
    fieldNames.forEach((f) => {
      originFields[f] = 'OK';
      destFields[f] = f === field ? 'ERRADO' : 'OK'; // só o campo da vez tem erro nesse cliente
    });
    originRecords.push({ id, fields: originFields });
    destRecords.push({ id, fields: destFields });
  });

  const result = await runValidation({
    originRecords,
    destRecords,
    entityName: 'GENERIC',
    comparisonType: { useRules: false },
    entityConfig: null,
  });

  assert.strictEqual(result.topCriticalFields.length, 15, 'os 15 campos com erro devem aparecer, sem limite de 10');
  assert.strictEqual(result.summary.fieldsWithErrorsCount, 15, 'card de campos distintos com erro deve mostrar 15');
  console.log('✅ Gráfico de campos críticos mostra todos os campos com erro (15, sem limite de 10).');
}

// ---------------------------------------------------------------------------
// Cenário 3 — card de "campos com erro" deve contar CAMPOS DISTINTOS, não
// linhas/ocorrências. Um único campo (VKORG) errado em 5 clientes diferentes
// deve contar como 1 no card, não como 5.
// ---------------------------------------------------------------------------
{
  const originRecords = [];
  const destRecords = [];
  for (let i = 1; i <= 5; i++) {
    originRecords.push({ id: String(i), fields: { KUNNR: String(i), VKORG: '3000', NAME1: 'X' } });
    destRecords.push({ id: String(i), fields: { KUNNR: String(i), VKORG: '9999', NAME1: 'X' } }); // VKORG sempre errado
  }
  const result = await runValidation({
    originRecords,
    destRecords,
    entityName: 'GENERIC',
    comparisonType: { useRules: false },
    entityConfig: null,
  });

  assert.strictEqual(result.summary.fieldsWithErrorsCount, 1, 'só 1 campo (VKORG) está com erro, mesmo afetando 5 clientes -> card deve mostrar 1, não 5');
  assert.strictEqual(result.summary.invalidFields, 5, 'já a contagem de OCORRÊNCIAS de erro continua sendo 5 (uma por cliente) — é uma métrica diferente');
  console.log('✅ Card de campos com erro conta campos DISTINTOS (1), não ocorrências/linhas (5).');
}

console.log('\n🎉 Todos os cenários desta rodada passaram.');
