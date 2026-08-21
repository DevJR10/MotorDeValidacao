// exporters/excelExporter.js
// -----------------------------------------------------------------------------
// Gera os 3 arquivos de saída com formatação profissional (fonte, cor de
// cabeçalho, cor de status por linha, largura de coluna, filtro automático,
// primeira linha congelada) e uma coluna "Tabela" identificando a entidade.
//
// Por que ExcelJS aqui e SheetJS nos importadores? SheetJS (usado para LER
// .xlsx) é ótimo para leitura, mas a versão gratuita não escreve estilos de
// célula (cor/fonte) no arquivo gerado — isso é recurso pago (SheetJS Pro).
// ExcelJS é gratuito/open-source e escreve estilo completo, então passou a
// ser usado só para a ESCRITA dos relatórios.
//
// Também corrige o bug relatado: o dashboard mostrava ~11 mil "campos
// válidos", mas o arquivo de válidos vinha vazio. Isso acontecia porque
// "válidos" no dashboard antigo contava CAMPOS, não REGISTROS — um único
// campo divergente já invalida o registro inteiro, então é normal ter
// muitos campos OK e zero registros 100% válidos. Agora a exportação usa
// result.validRecords (nível de registro, igual ao dashboard) e, quando
// realmente não há nenhum registro 100% válido, o arquivo mostra uma nota
// explicando isso em vez de vir "vazio" sem explicação.
// -----------------------------------------------------------------------------

const COLORS = {
  headerDivergencias: 'FFB3261E',
  headerValidos: 'FF1E7A45',
  headerResumo: 'FF12405C',
  headerUnmatched: 'FF8A6D1D',
  dexpara: 'FFFFF3CD',
  erro: 'FFFCE0E1',
  parcial: 'FFFFF3CD',
};

export async function exportDivergences(result) {
  const wb = new ExcelJS.Workbook();
  setupWorkbookMeta(wb);

  const sheet = wb.addWorksheet('Divergencias por campo');
  sheet.columns = [
    { header: 'Tabela', key: 'tabela', width: 14 },
    { header: 'ID', key: 'id', width: 16 },
    { header: 'Campo', key: 'campo', width: 20 },
    { header: 'Valor Origem', key: 'origem', width: 22 },
    { header: 'Valor Destino', key: 'destino', width: 22 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Mensagem', key: 'mensagem', width: 46 },
  ];
  styleHeader(sheet, COLORS.headerDivergencias);

  result.divergences.forEach((d) => {
    const row = sheet.addRow({
      tabela: result.entityName,
      id: d.id,
      campo: d.field,
      origem: d.origin,
      destino: d.dest,
      status: 'Erro',
      mensagem: d.isEmpty ? 'Campo vazio em um dos lados.' : 'Valores incompatíveis entre origem e destino.',
    });
    row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.erro } };
  });

  if (!result.divergences.length) addEmptyNotice(sheet, 7, 'Nenhuma divergência de campo encontrada — todos os registros pareados bateram integralmente.');
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columns.length } };

  const recordSheet = wb.addWorksheet('Registros com divergencia');
  recordSheet.columns = [
    { header: 'Tabela', key: 'tabela', width: 14 },
    { header: 'ID', key: 'id', width: 16 },
    { header: 'Campos verificados', key: 'checked', width: 18 },
    { header: 'Campos OK', key: 'ok', width: 14 },
    { header: 'Campos DexPara', key: 'dexpara', width: 16 },
    { header: 'Campos com erro', key: 'error', width: 16 },
  ];
  styleHeader(recordSheet, COLORS.headerDivergencias);
  result.invalidRecords.forEach((r) => {
    const row = recordSheet.addRow({ tabela: result.entityName, id: r.id, checked: r.fieldsChecked, ok: r.okFields, dexpara: r.dexparaFields, error: r.errorFields });
    row.getCell('error').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.erro } };
  });
  if (!result.invalidRecords.length) addEmptyNotice(recordSheet, 6, 'Nenhum registro com divergência — todos os registros pareados são válidos.');

  await downloadWorkbook(wb, fileName(result, 'divergencias'));
}

export async function exportValid(result) {
  const wb = new ExcelJS.Workbook();
  setupWorkbookMeta(wb);

  const sheet = wb.addWorksheet('Registros validos');
  sheet.columns = [
    { header: 'Tabela', key: 'tabela', width: 14 },
    { header: 'ID', key: 'id', width: 16 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Campos validados', key: 'validados', width: 18 },
    { header: 'Campos via DexPara', key: 'dexpara', width: 18 },
    { header: 'Data/Hora', key: 'data', width: 20 },
  ];
  styleHeader(sheet, COLORS.headerValidos);

  const now = new Date().toLocaleString('pt-BR');
  result.validRecords.forEach((r) => {
    sheet.addRow({ tabela: result.entityName, id: r.id, status: 'Válido', validados: r.fieldsValidated, dexpara: r.dexparaFields || 0, data: now });
  });

  if (!result.validRecords.length) {
    addEmptyNotice(
      sheet,
      6,
      `Nenhum registro ficou 100% válido nesta validação (${result.summary.recordsInvalid} de ${result.summary.comparedPairs} registros comparados têm ao menos 1 campo divergente). Veja o arquivo de divergências para o detalhe — o dashboard conta "campos válidos" separadamente de "registros válidos", por isso os dois números podem ser diferentes.`
    );
  }
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columns.length } };

  await downloadWorkbook(wb, fileName(result, 'validos'));
}

export async function exportUnmatched(result) {
  const wb = new ExcelJS.Workbook();
  setupWorkbookMeta(wb);

  const sheet = wb.addWorksheet('Clientes sem correspondencia');
  sheet.columns = [
    { header: 'Cliente', key: 'id', width: 16 },
    { header: 'Tabela', key: 'tabela', width: 14 },
    { header: 'Arquivo encontrado', key: 'foundIn', width: 20 },
    { header: 'Arquivo ausente', key: 'missingFrom', width: 20 },
    { header: 'Motivo', key: 'reason', width: 60 },
  ];
  styleHeader(sheet, COLORS.headerUnmatched);

  result.unmatchedClients.forEach((c) => {
    const row = sheet.addRow({
      id: c.id,
      tabela: result.entityName,
      foundIn: c.foundIn,
      missingFrom: c.missingFrom,
      reason: c.reason,
    });
    if (c.missingFrom === 'Parcial') {
      row.getCell('missingFrom').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.parcial } };
    }
  });

  if (!result.unmatchedClients.length) {
    addEmptyNotice(sheet, 5, 'Nenhum cliente sem correspondência — todos os clientes foram encontrados nos dois arquivos.');
  }
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columns.length } };

  await downloadWorkbook(wb, fileName(result, 'sem_correspondencia'));
}

export async function exportSummary(result) {
  const { summary, dexPara, topCriticalFields } = result;
  const wb = new ExcelJS.Workbook();
  setupWorkbookMeta(wb);

  const sheet = wb.addWorksheet('Resumo');
  sheet.columns = [
    { header: 'Indicador', key: 'k', width: 38 },
    { header: 'Valor', key: 'v', width: 20 },
  ];
  styleHeader(sheet, COLORS.headerResumo);

  const rows = [
    ['Entidade', result.entityName],
    ['Campos analisados (filtro)', result.appliedFieldFilter ? result.appliedFieldFilter.join(', ') : 'Todos'],
    ['Registros na origem', summary.originRecordCount],
    ['Registros no destino', summary.destRecordCount],
    ['Registros comparados', summary.comparedPairs],
    ['Registros sem correspondência (origem)', summary.unmatchedOriginCount],
    ['Registros sem correspondência (destino)', summary.unmatchedDestCount],
    ['Clientes totais', summary.clientsTotal],
    ['Clientes válidos', summary.clientsValid],
    ['Clientes com divergência', summary.clientsWithError],
    ['Clientes sem correspondência', summary.clientsUnmatched],
    ['Taxa de sucesso por cliente (%)', summary.clientSuccessRate],
    ['Registros válidos', summary.recordsValid],
    ['Registros com divergência', summary.recordsInvalid],
    ['Taxa de sucesso por registro (%)', summary.recordSuccessRate],
    ['Tempo de processamento (ms)', summary.elapsedMs],
    ['Usou regras De/Para', dexPara.used ? 'Sim' : 'Não'],
    ['Comparações resolvidas por DexPara', dexPara.dexParaMatches],
    ['% resolvido por DexPara', dexPara.percentResolvedByDexPara],
  ];
  rows.forEach(([k, v]) => sheet.addRow({ k, v }));

  const criticalSheet = wb.addWorksheet('Campos criticos');
  criticalSheet.columns = [
    { header: 'Campo', key: 'field', width: 22 },
    { header: 'Erros', key: 'error', width: 12 },
    { header: 'DexPara', key: 'dexpara', width: 12 },
    { header: 'OK', key: 'ok', width: 12 },
    { header: 'Clientes afetados', key: 'affected', width: 16 },
    { header: '% sucesso', key: 'rate', width: 12 },
  ];
  styleHeader(criticalSheet, COLORS.headerResumo);
  topCriticalFields.forEach((f) => {
    const row = criticalSheet.addRow({ field: f.field, error: f.error, dexpara: f.dexpara, ok: f.ok, affected: f.affectedRecords, rate: f.successRate });
    if (f.error > 0) row.getCell('error').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.erro } };
  });

  await downloadWorkbook(wb, fileName(result, 'resumo'));
}

// ---------------------------------------------------------------------------
function setupWorkbookMeta(wb) {
  wb.creator = 'Validador de Dados V2';
  wb.created = new Date();
}

function styleHeader(sheet, argbColor) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argbColor } };
    cell.alignment = { vertical: 'middle' };
  });
  header.height = 20;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addEmptyNotice(sheet, colSpan, message) {
  const row = sheet.addRow([message]);
  sheet.mergeCells(row.number, 1, row.number, colSpan);
  row.getCell(1).font = { italic: true, color: { argb: 'FF5C7284' } };
  row.getCell(1).alignment = { wrapText: true };
}

async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fileName(result, prefix) {
  const ts = result.generatedAt.replace(/[:.]/g, '-');
  return `${prefix}_${result.entityName}_${ts}.xlsx`;
}
