// ============================================================================
// THREAD PRINCIPAL — UI, dashboard e exportação. Script clássico (sem
// import/export), tudo em um escopo só. Os dados de configuração (tipos de
// comparação, entidades e regras De/Para) são injetados logo acima deste
// script como constantes (COMPARISON_TYPES, ENTITIES, RULES_DATA) — nada é
// buscado via fetch(), então funciona também em file://.
// ============================================================================

// ---------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------
const logger = {
  debug: (...a) => console.debug('[Validador]', ...a),
  info: (...a) => console.info('[Validador]', ...a),
  warn: (...a) => console.warn('[Validador]', ...a),
  error: (...a) => console.error('[Validador]', ...a),
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmt(n) {
  return Number(n).toLocaleString('pt-BR');
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function showFatalError(message, { hint } = {}) {
  let el = document.getElementById('fatalError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatalError';
    document.body.prepend(el);
  }
  el.className = 'fatal-error';
  el.innerHTML = `
    <strong>Não foi possível carregar o Validador de Dados</strong>
    <p>${escapeHtml(message)}</p>
    ${hint ? `<p class="fatal-error__hint">${hint}</p>` : ''}
  `;
  el.style.display = 'block';
}

// ---------------------------------------------------------------------------
// tag input (filtro de campos)
// ---------------------------------------------------------------------------
function createTagInput(container) {
  let values = [];
  container.innerHTML = `
    <div class="tag-input">
      <div class="tag-input__chips" data-role="chips"></div>
      <input type="text" data-role="input" placeholder="Digite o nome do campo e pressione Enter (ex: NAME1, STREET, CITY)" />
    </div>
  `;
  const chipsEl = container.querySelector('[data-role="chips"]');
  const inputEl = container.querySelector('[data-role="input"]');

  function render() {
    chipsEl.innerHTML = values
      .map((v, i) => `<span class="tag-chip">${escapeHtml(v)}<button type="button" data-index="${i}" aria-label="Remover ${escapeHtml(v)}">×</button></span>`)
      .join('');
  }
  function addValue(raw) {
    const clean = raw.trim();
    if (!clean) return;
    if (!values.some((v) => v.toUpperCase() === clean.toUpperCase())) values.push(clean);
    render();
  }
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addValue(inputEl.value);
      inputEl.value = '';
    } else if (e.key === 'Backspace' && !inputEl.value && values.length) {
      values.pop();
      render();
    }
  });
  inputEl.addEventListener('blur', () => {
    if (inputEl.value.trim()) {
      addValue(inputEl.value);
      inputEl.value = '';
    }
  });
  chipsEl.addEventListener('click', (e) => {
    const idx = e.target?.dataset?.index;
    if (idx !== undefined) {
      values.splice(Number(idx), 1);
      render();
    }
  });
  return { getValues: () => [...values], setValues: (v) => { values = [...v]; render(); } };
}

// ---------------------------------------------------------------------------
// upload controller
// ---------------------------------------------------------------------------
let fieldFilterInputRef = null;

function initUploadController({ onStart }) {
  populateSelect('comparisonType', COMPARISON_TYPES, (key, cfg) => cfg.label);
  populateSelect('entityName', ENTITIES, (key, cfg) => `${key} — ${cfg.label}`, { extra: { CUSTOM: 'Outra entidade (configurar manualmente)' } });

  buildSourceForm('origin', 'Origem');
  buildSourceForm('dest', 'Destino');
  fieldFilterInputRef = createTagInput(document.getElementById('fieldFilterContainer'));
  document.getElementById('clearFieldFilterBtn').addEventListener('click', () => fieldFilterInputRef.setValues([]));

  document.getElementById('comparisonType').addEventListener('change', updateRulesHint);
  document.getElementById('entityName').addEventListener('change', toggleCustomKeyFields);
  document.getElementById('startBtn').addEventListener('click', () => handleStart(onStart));

  updateRulesHint();
  toggleCustomKeyFields();
}

function populateSelect(id, dict, labelFn, { extra } = {}) {
  const select = document.getElementById(id);
  select.innerHTML = '';
  for (const [key, cfg] of Object.entries(dict)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = labelFn(key, cfg);
    select.appendChild(opt);
  }
  if (extra) {
    for (const [key, label] of Object.entries(extra)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      select.appendChild(opt);
    }
  }
}

function updateRulesHint() {
  const type = COMPARISON_TYPES[document.getElementById('comparisonType').value];
  const hint = document.getElementById('rulesHint');
  hint.textContent = type?.useRules
    ? '✓ Este tipo de comparação carrega automaticamente as regras De/Para (DexPara) da entidade selecionada.'
    : '— Comparação literal: nenhuma regra De/Para será carregada.';
  hint.className = type?.useRules ? 'hint hint--active' : 'hint';
}

function toggleCustomKeyFields() {
  const isCustom = document.getElementById('entityName').value === 'CUSTOM';
  document.getElementById('customKeyRow').style.display = isCustom ? 'flex' : 'none';
}

function buildSourceForm(prefix, label) {
  const container = document.getElementById(`${prefix}Source`);
  container.innerHTML = `
    <h3>${label}</h3>
    <label>Tipo de origem
      <select id="${prefix}Type">
        <option value="excel">Arquivo Excel (.xlsx)</option>
        <option value="csv">Arquivo CSV</option>
        <option value="api">API REST (GET)</option>
      </select>
    </label>
    <div id="${prefix}Fields"></div>
  `;
  const typeSelect = container.querySelector(`#${prefix}Type`);
  typeSelect.addEventListener('change', () => renderSourceFields(prefix));
  renderSourceFields(prefix);
}

function renderSourceFields(prefix) {
  const type = document.getElementById(`${prefix}Type`).value;
  const fieldsContainer = document.getElementById(`${prefix}Fields`);
  if (type === 'excel' || type === 'csv') {
    fieldsContainer.innerHTML = `
      <label>Arquivo
        <input type="file" id="${prefix}File" accept="${type === 'excel' ? '.xls,.xlsx' : '.csv'}" />
      </label>
      <label>Coluna de identificador (ID)
        <input type="text" id="${prefix}IdField" placeholder="ex: KUNNR" value="KUNNR" />
      </label>
    `;
  } else {
    fieldsContainer.innerHTML = `
      <label>URL do endpoint (GET)
        <input type="url" id="${prefix}Url" placeholder="https://api.exemplo.com/customers" />
      </label>
      <label>Propriedade do identificador (ID)
        <input type="text" id="${prefix}IdField" placeholder="ex: id ou KUNNR" value="id" />
      </label>
      <label>Caminho do array na resposta (opcional)
        <input type="text" id="${prefix}ArrayPath" placeholder="ex: data.items (deixe vazio se a resposta já é um array)" />
      </label>
    `;
  }
}

function readSource(prefix) {
  const type = document.getElementById(`${prefix}Type`).value;
  const idField = document.getElementById(`${prefix}IdField`).value.trim();
  if (!idField) throw new Error(`Informe a coluna/propriedade de identificador para a ${prefix === 'origin' ? 'origem' : 'destino'}.`);
  if (type === 'excel' || type === 'csv') {
    const file = document.getElementById(`${prefix}File`).files[0];
    if (!file) throw new Error(`Selecione o arquivo de ${prefix === 'origin' ? 'origem' : 'destino'}.`);
    return { type, file, idField };
  }
  const url = document.getElementById(`${prefix}Url`).value.trim();
  if (!url) throw new Error(`Informe a URL da API de ${prefix === 'origin' ? 'origem' : 'destino'}.`);
  const arrayPath = document.getElementById(`${prefix}ArrayPath`).value.trim();
  return { type, url, idField, options: arrayPath ? { arrayPath } : {} };
}

function handleStart(onStart) {
  try {
    const comparisonTypeKey = document.getElementById('comparisonType').value;
    const comparisonType = COMPARISON_TYPES[comparisonTypeKey];
    const entityName = document.getElementById('entityName').value;

    let entityConfig = ENTITIES[entityName] || null;
    if (entityName === 'CUSTOM') {
      const raw = document.getElementById('customKeyFields').value.trim();
      entityConfig = raw ? { primaryKey: raw.split(',').map((s) => s.trim()).filter(Boolean) } : null;
    }

    const rules = comparisonType.useRules ? (RULES_DATA[entityName.toUpperCase()] || { table: entityName, fieldMappings: {} }) : null;

    const originSource = readSource('origin');
    const destSource = readSource('dest');
    const fieldFilter = fieldFilterInputRef.getValues();

    onStart({ originSource, destSource, entityName, rules, entityConfig, fieldFilter: fieldFilter.length ? fieldFilter : null });
  } catch (err) {
    logger.warn(err.message);
    alert(err.message);
  }
}

// ---------------------------------------------------------------------------
// progress controller
// ---------------------------------------------------------------------------
const STAGE_LABELS = {
  import: 'Lendo arquivos/origens...',
  indexing: 'Indexando registros (Map)...',
  comparing: 'Comparando registros...',
  summarizing: 'Gerando resultados...',
  done: 'Concluído',
};
const STAGE_ORDER = ['import', 'indexing', 'comparing', 'summarizing'];
let progressStartedAt = null;

function resetProgress() {
  progressStartedAt = performance.now();
  document.querySelectorAll('.pipeline li').forEach((li) => li.classList.remove('is-active', 'is-done'));
  updateProgress({ stage: 'import', percent: 0 });
}

function updateProgress({ stage, percent }) {
  const bar = document.getElementById('progressBar');
  const label = document.getElementById('progressLabel');
  const eta = document.getElementById('progressEta');
  bar.style.width = `${percent}%`;
  bar.setAttribute('aria-valuenow', String(percent));
  label.textContent = `${STAGE_LABELS[stage] || stage} (${percent}%)`;
  updatePipeline(stage);
  if (percent > 0 && percent < 100 && progressStartedAt) {
    const elapsed = performance.now() - progressStartedAt;
    const estimatedTotal = (elapsed / percent) * 100;
    eta.textContent = `Tempo estimado restante: ${formatSeconds(Math.max(0, estimatedTotal - elapsed))}`;
  } else if (percent >= 100) {
    eta.textContent = `Concluído em ${formatSeconds(performance.now() - progressStartedAt)}`;
  }
}

function updatePipeline(stage) {
  const currentIndex = STAGE_ORDER.indexOf(stage);
  document.querySelectorAll('.pipeline li').forEach((li) => {
    const idx = STAGE_ORDER.indexOf(li.dataset.stage);
    li.classList.toggle('is-done', idx < currentIndex || stage === 'done');
    li.classList.toggle('is-active', idx === currentIndex && stage !== 'done');
  });
}

function formatSeconds(ms) {
  const s = ms / 1000;
  return s < 1 ? '< 1s' : `${s.toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// dashboard: cards
// ---------------------------------------------------------------------------
function renderHeroBanner(container, result) {
  const { summary } = result;
  const rate = summary.clientSuccessRate;
  const comparedClients = summary.clientsValid + summary.clientsWithError;
  let tone, icon, verdict;
  if (rate >= 98) { tone = 'ok'; icon = '✓'; verdict = 'Migração consistente'; }
  else if (rate >= 85) { tone = 'warn'; icon = '!'; verdict = 'Atenção — divergências pontuais'; }
  else { tone = 'error'; icon = '✕'; verdict = 'Revisão necessária — divergências relevantes'; }

  const unmatchedNote = summary.clientsUnmatched
    ? ` · ${fmt(summary.clientsUnmatched)} cliente(s) sem correspondência (fora desse cálculo)`
    : '';

  container.className = `hero-banner hero-banner--${tone}`;
  container.innerHTML = `
    <span class="hero-banner__icon">${icon}</span>
    <div class="hero-banner__text">
      <strong>${verdict}</strong>
      <span>${fmt(summary.clientsValid)} de ${fmt(comparedClients)} clientes comparados são válidos (${rate}%)${unmatchedNote}</span>
    </div>
  `;
}

function renderFieldFilterBanner(container, result) {
  if (result.appliedFieldFilter?.length) {
    container.innerHTML = `<strong>Campos analisados (filtro aplicado):</strong> ${result.appliedFieldFilter.join(', ')}`;
  } else {
    container.innerHTML = `<strong>Campos analisados:</strong> todos os campos comuns entre origem e destino (${result.fieldsAnalyzed.length})`;
  }
  container.style.display = 'block';
}

function renderCoverageCards(container, result) {
  const { summary } = result;
  renderCards(container, [
    { label: 'Registros na origem', value: fmt(summary.originRecordCount) },
    { label: 'Registros no destino', value: fmt(summary.destRecordCount) },
    { label: 'Clientes sem correspondência', value: fmt(summary.clientsUnmatched), tone: summary.clientsUnmatched ? 'warn' : 'ok' },
  ]);
}

function renderQualityCards(container, result) {
  const { summary } = result;
  renderCards(container, [
    { label: 'Clientes válidos', value: fmt(summary.clientsValid), tone: 'ok' },
    { label: 'Clientes com divergência', value: fmt(summary.clientsWithError), tone: summary.clientsWithError ? 'error' : 'ok' },
    { label: 'Campos com erro (distintos)', value: fmt(summary.fieldsWithErrorsCount), tone: summary.fieldsWithErrorsCount ? 'error' : 'ok' },
    { label: 'Taxa de sucesso dos clientes', value: `${summary.clientSuccessRate}%`, tone: summary.clientSuccessRate >= 95 ? 'ok' : summary.clientSuccessRate >= 80 ? 'warn' : 'error', big: true },
  ]);
}

function renderPerformanceCards(container, result) {
  const { summary, dexPara } = result;
  renderCards(container, [
    { label: 'Tempo de processamento', value: formatDuration(summary.elapsedMs) },
    { label: 'Resolvido via DexPara', value: dexPara.used ? `${dexPara.percentResolvedByDexPara}%` : 'não aplicável' },
  ]);
}

function renderCards(container, cards) {
  container.innerHTML = cards
    .map((c) => `
      <div class="card card--${c.tone || 'neutral'} ${c.big ? 'card--big' : ''}">
        <span class="card__value">${c.value}</span>
        <span class="card__label">${c.label}</span>
      </div>`)
    .join('');
}

// ---------------------------------------------------------------------------
// dashboard: charts
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// dashboard: dicionário de campos SAP (cliente/fornecedor) — usado no
// tooltip do gráfico de campos críticos, explicando o que cada campo
// técnico significa no SAP.
// ---------------------------------------------------------------------------
const SAP_FIELD_DICTIONARY = {
  // --- Identificação e organização ---------------------------------------
  MANDT: { label: 'Mandante', description: 'Identifica o cliente/ambiente SAP (mandante) ao qual o registro pertence.' },
  KUNNR: { label: 'Número do cliente', description: 'Identificador único do cliente no SAP (chave do mestre de clientes).' },
  LIFNR: { label: 'Número do fornecedor', description: 'Identificador único do fornecedor no SAP (chave do mestre de fornecedores).' },
  BUKRS: { label: 'Empresa', description: 'Código da empresa (company code) à qual os dados financeiros do registro pertencem.' },
  VKORG: { label: 'Organização de vendas', description: 'Unidade organizacional responsável pela venda de produtos/serviços; define a responsabilidade legal pelas vendas.' },
  VTWEG: { label: 'Canal de distribuição', description: 'Meio pelo qual produtos/serviços chegam ao cliente (ex.: varejo, atacado, e-commerce).' },
  SPART: { label: 'Setor de atividade', description: 'Também chamado de "divisão" — usado para agrupar produtos/serviços por linha de negócio dentro da organização de vendas.' },
  EKORG: { label: 'Organização de compras', description: 'Unidade organizacional responsável pelas compras junto ao fornecedor; negocia condições de compra.' },
  WERKS: { label: 'Centro', description: 'Local (fábrica, depósito, filial) de onde os produtos são fornecidos ou recebidos.' },
  KKBER: { label: 'Área de crédito', description: 'Unidade organizacional usada para gerenciar e controlar o limite de crédito do cliente.' },
  MABER: { label: 'Área de cobrança', description: 'Agrupamento usado para controlar o processo de cobrança (dunning) do cliente.' },

  // --- Dados gerais (nome, endereço, contato) -----------------------------
  NAME1: { label: 'Nome 1', description: 'Primeira linha do nome/razão social do cliente ou fornecedor.' },
  NAME2: { label: 'Nome 2', description: 'Segunda linha do nome — complemento da razão social (ex.: nome fantasia).' },
  NAME3: { label: 'Nome 3', description: 'Terceira linha do nome, usada quando o nome não cabe nas linhas anteriores.' },
  NAME4: { label: 'Nome 4', description: 'Quarta linha do nome, para nomes muito longos.' },
  SORTL: { label: 'Termo de busca', description: 'Chave curta usada para localizar o registro rapidamente em buscas e listas.' },
  ANRED: { label: 'Tratamento', description: 'Forma de tratamento do contato (ex.: Sr., Sra., Empresa).' },
  STRAS: { label: 'Rua e número', description: 'Endereço — logradouro e número.' },
  ORT01: { label: 'Cidade', description: 'Cidade do endereço do cliente/fornecedor.' },
  ORT02: { label: 'Distrito/Bairro', description: 'Distrito, bairro ou localidade dentro da cidade.' },
  PFACH: { label: 'Caixa postal', description: 'Número da caixa postal, quando usada em vez do endereço físico.' },
  PSTLZ: { label: 'CEP', description: 'Código postal (CEP) do endereço.' },
  PSTL2: { label: 'CEP da caixa postal', description: 'Código postal associado à caixa postal (PFACH), quando diferente do CEP do endereço físico.' },
  REGIO: { label: 'Região', description: 'Estado/UF ou região dentro do país do endereço.' },
  LAND1: { label: 'País', description: 'Código do país do endereço (chave de 2-3 caracteres, ex.: BR para Brasil).' },
  ADRNR: { label: 'Número do endereço', description: 'Chave técnica que aponta para o registro de endereço central (tabela ADRC), compartilhado entre várias entidades.' },
  SPRAS: { label: 'Idioma', description: 'Idioma usado na comunicação e na impressão de documentos para esse parceiro.' },
  TELF1: { label: 'Telefone 1', description: 'Número de telefone principal de contato.' },
  TELF2: { label: 'Telefone 2', description: 'Número de telefone secundário de contato.' },
  TELFX: { label: 'Fax', description: 'Número de fax de contato.' },
  TELBX: { label: 'Número de telex/teletexto', description: 'Campo legado para número de telex — raramente usado atualmente.' },
  SMTP_ADDR: { label: 'E-mail', description: 'Endereço de e-mail de contato (armazenado na área de endereço, tabela ADRC/ADR6).' },

  // --- Identificação fiscal -------------------------------------------------
  STCD1: { label: 'Identificação fiscal 1', description: 'Número de identificação fiscal principal (no Brasil, tipicamente o CNPJ).' },
  STCD2: { label: 'Identificação fiscal 2', description: 'Segundo número de identificação fiscal (no Brasil, tipicamente o CPF, para pessoa física).' },
  STCD3: { label: 'Identificação fiscal 3', description: 'Terceiro número de identificação fiscal, usado conforme a legislação local (ex.: Inscrição Estadual).' },
  STCD4: { label: 'Identificação fiscal 4', description: 'Quarto número de identificação fiscal, uso conforme legislação local (ex.: Inscrição Municipal).' },
  STCEG: { label: 'Nº de identificação de imposto (UE)', description: 'Número de identificação para imposto sobre valor agregado usado em transações intra-União Europeia.' },
  STKZA: { label: 'Indicador: pessoa física', description: 'Sinaliza se o cadastro corresponde a uma pessoa física (não jurídica).' },
  STKZU: { label: 'Indicador: sujeito a imposto', description: 'Sinaliza se o cliente/fornecedor está sujeito à tributação sobre vendas.' },
  TAXKD: { label: 'Classificação fiscal do cliente', description: 'Categoria fiscal do cliente usada na determinação automática de impostos (ex.: isento, tributado).' },

  // --- Grupos de contas e classificação ------------------------------------
  KTOKD: { label: 'Grupo de contas do cliente', description: 'Categoriza o cliente (ex.: cliente nacional, cliente one-time) e controla quais campos são obrigatórios/exibidos no cadastro.' },
  KTOKK: { label: 'Grupo de contas do fornecedor', description: 'Categoriza o fornecedor (ex.: fornecedor nacional, fornecedor one-time) e controla os campos do cadastro.' },
  BRSCH: { label: 'Ramo de atividade', description: 'Setor/segmento de atuação do cliente ou fornecedor (ex.: indústria, varejo, serviços).' },
  KUKLA: { label: 'Classificação do cliente', description: 'Classificação livre usada para segmentar clientes (ex.: por porte ou perfil comercial).' },
  KONZS: { label: 'Grupo empresarial (konzern)', description: 'Identifica o grupo econômico/corporativo ao qual o cliente ou fornecedor pertence.' },
  GFORM: { label: 'Forma jurídica', description: 'Natureza jurídica da empresa (ex.: Ltda., S.A.).' },
  XCPDK: { label: 'Indicador de conta CPD', description: 'Sinaliza uma conta "ocasional" (one-time account), usada para parceiros que não justificam um cadastro completo.' },

  // --- Bloqueios e status -----------------------------------------------------
  LOEVM: { label: 'Sinalizador de bloqueio para eliminação', description: 'Marca o registro para exclusão. Pode existir no nível geral, empresa ou área de vendas/compras.' },
  SPERR: { label: 'Bloqueio central', description: 'Bloqueia o cliente/fornecedor para lançamentos ou transações em geral.' },
  SPERM: { label: 'Bloqueio de compras', description: 'Bloqueia o fornecedor especificamente para novas ordens de compra.' },
  AUFSD: { label: 'Bloqueio de pedidos', description: 'Bloqueia a criação/processamento de pedidos de venda para o cliente.' },
  LIFSD: { label: 'Bloqueio de entrega', description: 'Bloqueia a entrega de mercadorias para o cliente.' },
  FAKSD: { label: 'Bloqueio de faturamento', description: 'Bloqueia a emissão de faturas para o cliente.' },

  // --- Dados financeiros / pagamento ------------------------------------------
  AKONT: { label: 'Conta de reconciliação', description: 'Conta contábil (razão) usada para consolidar os lançamentos desse cliente/fornecedor na contabilidade geral.' },
  ZTERM: { label: 'Condição de pagamento', description: 'Define prazo e forma de vencimento dos pagamentos (ex.: 30 dias, com desconto para pagamento antecipado).' },
  ZWELS: { label: 'Formas de pagamento', description: 'Meios de pagamento permitidos para esse parceiro (ex.: transferência, boleto, cheque).' },
  ZUAWA: { label: 'Chave de atribuição de texto', description: 'Define qual campo é usado como referência ao classificar/compensar itens em aberto.' },
  FDGRV: { label: 'Grupo de planejamento financeiro', description: 'Agrupa o cliente/fornecedor para fins de planejamento de fluxo de caixa/tesouraria.' },
  WAERS: { label: 'Moeda', description: 'Moeda usada nas transações com esse parceiro.' },
  BUSAB: { label: 'Contabilista responsável', description: 'Código do contabilista/analista responsável pela conta desse cliente/fornecedor.' },
  QLAND: { label: 'País de retenção na fonte', description: 'País cuja legislação de retenção de imposto na fonte se aplica a esse parceiro.' },
  QSSKZ: { label: 'Código de imposto retido na fonte', description: 'Indica o tipo/código de imposto retido na fonte aplicável.' },
  REPRF: { label: 'Verificação de linha duplicada', description: 'Sinaliza que o sistema deve checar linhas de pagamento potencialmente duplicadas para esse fornecedor.' },

  // --- Cobrança (dunning) --------------------------------------------------
  MAHNA: { label: 'Procedimento de cobrança (dunning)', description: 'Define a sequência de avisos e regras usadas no processo de cobrança do cliente.' },
  MAHNS: { label: 'Nível de cobrança', description: 'Estágio atual do cliente dentro do procedimento de cobrança (quantos avisos já foram emitidos).' },
  MADAT: { label: 'Data do último aviso', description: 'Data em que o último aviso de cobrança (dunning) foi emitido para o cliente.' },
  MANSP: { label: 'Bloqueio de cobrança', description: 'Impede que o cliente receba novos avisos de cobrança automaticamente.' },
  MINDK: { label: 'Chave de bloqueio mínimo de cobrança', description: 'Define um valor mínimo abaixo do qual a cobrança automática não é disparada.' },
  VZSKZ: { label: 'Indicador de calendário de juros', description: 'Calendário usado para calcular juros de mora sobre valores em atraso.' },
  WEBTR: { label: 'Valor de tolerância', description: 'Diferença de valor tolerada automaticamente ao compensar pagamentos.' },

  // --- Dados de vendas (KNVV) -----------------------------------------------
  KDGRP: { label: 'Grupo de clientes', description: 'Classificação usada para segmentar clientes em relatórios e determinação de preços/estatísticas.' },
  BZIRK: { label: 'Zona de vendas', description: 'Área geográfica de vendas à qual o cliente está associado, usada para relatórios e atribuição de equipe.' },
  KTGRD: { label: 'Grupo de determinação de preço do cliente', description: 'Usado junto com o grupo de material na formação automática de preços.' },
  KTGRM: { label: 'Grupo de determinação de preço do material', description: 'Complementa o KTGRD na lógica de formação de preços por combinação cliente-material.' },
  KALKS: { label: 'Esquema de cálculo de preço', description: 'Define qual esquema de formação de preços (pricing procedure) é usado nas vendas para esse cliente.' },
  VSBED: { label: 'Condição de expedição', description: 'Define regras de transporte/expedição, como urgência ou tipo de frete preferencial do cliente.' },
  VWERK: { label: 'Centro fornecedor', description: 'Centro (fábrica/depósito) padrão de onde os pedidos desse cliente são atendidos.' },
  INCO1: { label: 'Incoterms (parte 1)', description: 'Termo de comércio internacional (ex.: FOB, CIF) que define responsabilidades de transporte e risco.' },
  INCO2: { label: 'Incoterms (parte 2 - local)', description: 'Local ou complemento associado ao Incoterm definido (ex.: porto de embarque).' },
  KZAZU: { label: 'Atribuição automática de pedido', description: 'Indica se recebimentos devem ser automaticamente atribuídos a esse cliente com base em regras predefinidas.' },
  AWAHR: { label: 'Probabilidade do pedido', description: 'Percentual estimado de que uma cotação/pedido em aberto será efetivamente confirmado — usado em planejamento de vendas.' },
  VKGRP: { label: 'Grupo de vendedores', description: 'Equipe/grupo de vendedores responsável pelo atendimento a esse cliente.' },
  VKBUR: { label: 'Escritório de vendas', description: 'Unidade física/administrativa de vendas responsável pelo cliente.' },
  KZTLF: { label: 'Regra de entrega parcial', description: 'Define se e como entregas parciais são permitidas para esse cliente.' },
  ANTLF: { label: 'Nº máximo de entregas parciais', description: 'Quantidade máxima de remessas parciais permitidas para atender um único pedido.' },
  LPRIO: { label: 'Prioridade de entrega', description: 'Prioridade atribuída aos pedidos desse cliente ao alocar estoque/capacidade de entrega.' },
  PLTYP: { label: 'Tipo de lista de preços', description: 'Categoria de tabela de preços aplicável ao cliente.' },
  WAKON: { label: 'Grupo de estatística de material', description: 'Usado para agrupar materiais em relatórios estatísticos de vendas.' },
  KVGR1: { label: 'Grupo de clientes 1 (livre)', description: 'Campo de classificação livre nº 1, definido conforme a necessidade de relatório da empresa.' },
  KVGR2: { label: 'Grupo de clientes 2 (livre)', description: 'Campo de classificação livre nº 2, definido conforme a necessidade de relatório da empresa.' },
  KVGR3: { label: 'Grupo de clientes 3 (livre)', description: 'Campo de classificação livre nº 3, definido conforme a necessidade de relatório da empresa.' },
  KVGR4: { label: 'Grupo de clientes 4 (livre)', description: 'Campo de classificação livre nº 4, definido conforme a necessidade de relatório da empresa.' },
  KVGR5: { label: 'Grupo de clientes 5 (livre)', description: 'Campo de classificação livre nº 5, definido conforme a necessidade de relatório da empresa.' },

  // --- Crédito (ARDC/ARD6) ---------------------------------------------------
  KLIMK: { label: 'Limite de crédito', description: 'Valor máximo de exposição de crédito permitido para o cliente dentro da área de crédito.' },
  SKFOR: { label: 'Débito total em aberto', description: 'Soma dos valores em aberto (a receber) do cliente no momento da checagem de crédito.' },
  CTLPC: { label: 'Segmento de controle de crédito', description: 'Subdivisão usada para gerenciar crédito quando o cliente tem múltiplos segmentos de risco.' },

  // --- Indicador de imposto por cliente (KNVI) --------------------------------
  ALAND: { label: 'País de destino', description: 'País para o qual a mercadoria é entregue — usado na determinação automática de impostos por destino.' },
  TATYP: { label: 'Tipo de categoria de imposto', description: 'Categoria de imposto (ex.: ICMS, IPI) à qual o indicador fiscal do cliente se aplica.' },

  // --- Parceiros (KNVP) --------------------------------------------------------
  PARVW: { label: 'Função do parceiro', description: 'Papel que o parceiro desempenha na transação (ex.: solicitante, destinatário de mercadoria, pagador, destinatário de fatura).' },
  KUNN2: { label: 'Cliente parceiro', description: 'Número do cliente vinculado como parceiro na função definida (ex.: quem realmente paga a fatura).' },

  // --- Compras (LFM1) -----------------------------------------------------------
  KZAUT: { label: 'Liberação automática de pedido', description: 'Indica se pedidos de compra para esse fornecedor dispensam aprovação manual (liberação automática).' },
  VERKF: { label: 'Nome do vendedor (contato)', description: 'Nome do representante de vendas do fornecedor, usado como contato comercial.' },

  // --- Estatística / dados de crédito (KNA1) ------------------------------------
  UMSAT: { label: 'Faturamento anual', description: 'Valor de faturamento anual informado para fins de análise de crédito.' },
  UMJAH: { label: 'Ano do faturamento', description: 'Ano de referência do valor de faturamento anual informado.' },
  JMZAH: { label: 'Número de funcionários', description: 'Quantidade de funcionários do cliente, usada em análises de porte/crédito.' },

  // --- Auditoria / metadados ------------------------------------------------------
  ERDAT: { label: 'Data de criação', description: 'Data em que o registro foi criado no sistema.' },
  ERNAM: { label: 'Usuário de criação', description: 'Usuário que criou o registro no sistema.' },
  AEDAT: { label: 'Data da última alteração', description: 'Data em que o registro foi modificado pela última vez.' },
  USNAM: { label: 'Usuário da última alteração', description: 'Usuário responsável pela última alteração no registro.' },
};

/**
 * Busca a explicação de um campo técnico SAP pelo nome (case-insensitive).
 * @param {string} fieldName
 * @returns {{label: string, description: string} | null}
 */

function getFieldInfo(fieldName) {
  if (!fieldName) return null;
  return SAP_FIELD_DICTIONARY[fieldName.trim().toUpperCase()] || null;
}


const chartPalette = { ok: '#34C77B', error: '#F2545B', text: '#8FA3B3', grid: 'rgba(232, 237, 242, 0.08)' };
const chartInstances = new Map();

function renderChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  if (chartInstances.has(canvasId)) chartInstances.get(canvasId).destroy();
  const chart = new Chart(canvas, { ...config, plugins: [ChartDataLabels] });
  chartInstances.set(canvasId, chart);
  return chart;
}

/** Único gráfico do dashboard: clientes válidos x clientes com divergência. */
function renderClientsChart(canvasId, summary) {
  const total = summary.clientsValid + summary.clientsWithError;
  return renderChart(canvasId, {
    type: 'doughnut',
    data: {
      labels: ['Clientes válidos', 'Clientes com divergência'],
      datasets: [{ data: [summary.clientsValid, summary.clientsWithError], backgroundColor: [chartPalette.ok, chartPalette.error], borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { position: 'bottom', labels: { color: chartPalette.text, font: { family: 'Inter, sans-serif', size: 13 }, padding: 14 } },
        datalabels: {
          color: '#0E1620',
          font: { weight: '700', size: 15 },
          formatter: (value) => {
            if (!value) return '';
            const pct = total ? Math.round((value / total) * 100) : 0;
            return [value.toLocaleString('pt-BR'), `(${pct}%)`];
          },
        },
      },
    },
  });
}

/**
 * Gráfico de barras: campos com erro, ordenado do mais crítico ao menos
 * crítico (por quantidade de CLIENTES afetados). Cor de âmbar (menos
 * crítico) a vermelho forte (mais crítico).
 */
function renderCriticalFieldsChart(canvasId, topCriticalFields) {
  const canvas = document.getElementById(canvasId);
  const outerCard = canvas?.closest('.chart-single, .chart-card, .chart-wide');
  const wrapperEl = canvas?.parentElement;

  if (!topCriticalFields.length) {
    if (canvas) canvas.style.display = 'none';
    if (outerCard) {
      let empty = outerCard.querySelector('.chart-empty-note');
      if (!empty) {
        empty = document.createElement('p');
        empty.className = 'chart-empty-note';
        outerCard.appendChild(empty);
      }
      empty.textContent = 'Nenhum campo com erro — nada para mostrar aqui. 🎉';
    }
    return null;
  }
  if (canvas) canvas.style.display = '';
  outerCard?.querySelector('.chart-empty-note')?.remove();

  if (wrapperEl) {
    const heightPerField = 34;
    const minHeight = 220;
    wrapperEl.style.height = `${Math.max(minHeight, topCriticalFields.length * heightPerField)}px`;
  }

  const maxAffected = Math.max(...topCriticalFields.map((f) => f.affectedRecords));
  const labels = topCriticalFields.map((f) => f.field);
  const values = topCriticalFields.map((f) => f.affectedRecords);
  const colors = values.map((v) => severityColor(v, maxAffected));

  return renderChart(canvasId, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, maxBarThickness: 28 }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: 'end',
          align: 'end',
          color: '#E7EDF3',
          font: { weight: '700', size: 12 },
          formatter: (value) => `${value.toLocaleString('pt-BR')} cliente(s)`,
        },
        tooltip: {
          backgroundColor: '#172431',
          borderColor: '#2A3B4A',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          titleFont: { family: 'JetBrains Mono, monospace', size: 13, weight: '700' },
          titleColor: '#2DD4BF',
          bodyFont: { family: 'Inter, sans-serif', size: 12 },
          bodyColor: '#E7EDF3',
          callbacks: {
            title: (items) => items[0]?.label || '',
            label: (item) => `${item.formattedValue} cliente(s) afetado(s) por erro nesse campo`,
            afterLabel: (item) => {
              const info = getFieldInfo(item.label);
              if (!info) return ['(campo não catalogado no dicionário SAP)'];
              return ['', ...wrapText(`${info.label}: ${info.description}`, 44)];
            },
          },
        },
      },
      scales: {
        x: { beginAtZero: true, grid: { color: chartPalette.grid }, ticks: { color: chartPalette.text, precision: 0 } },
        y: { grid: { display: false }, ticks: { color: '#E7EDF3', font: { family: 'JetBrains Mono, monospace', size: 12 } } },
      },
    },
  });
}

function severityColor(value, maxValue) {
  const ratio = maxValue > 0 ? value / maxValue : 0;
  const from = { r: 245, g: 185, b: 66 };
  const to = { r: 179, g: 38, b: 30 };
  const r = Math.round(from.r + (to.r - from.r) * ratio);
  const g = Math.round(from.g + (to.g - from.g) * ratio);
  const b = Math.round(from.b + (to.b - from.b) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

function wrapText(text, maxCharsPerLine) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxCharsPerLine) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ---------------------------------------------------------------------------
// dashboard: tabela de divergências (busca + filtro por tipo + paginação)
// ---------------------------------------------------------------------------
const DIVERGENCE_TYPE_FILTERS = {
  all: () => true,
  empty: (d) => d.isEmpty,
  valueDiff: (d) => !d.isEmpty,
};

function initDivergenceTable({ searchInput, typeFilterSelect, tableBody, pagination, divergences }) {
  const PAGE_SIZE = 50;
  let filtered = divergences;
  let page = 1;

  function apply() {
    const term = searchInput.value.trim().toUpperCase();
    const typeKey = typeFilterSelect ? typeFilterSelect.value : 'all';
    const typePredicate = DIVERGENCE_TYPE_FILTERS[typeKey] || DIVERGENCE_TYPE_FILTERS.all;

    filtered = divergences.filter((d) => {
      if (!typePredicate(d)) return false;
      if (!term) return true;
      return d.id.toUpperCase().includes(term) || d.field.toUpperCase().includes(term) || String(d.origin).toUpperCase().includes(term) || String(d.dest).toUpperCase().includes(term);
    });
    page = 1;
    render();
  }

  function render() {
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    tableBody.innerHTML = pageItems.map((d) => `
        <tr>
          <td class="mono">${escapeHtml(d.id)}</td>
          <td>${escapeHtml(d.field)}</td>
          <td>${escapeHtml(String(d.origin ?? ''))}</td>
          <td>${escapeHtml(String(d.dest ?? ''))}</td>
          <td><span class="status-pill status-pill--error">Erro</span></td>
        </tr>`).join('') || `<tr><td colspan="5" class="empty-row">Nenhuma divergência encontrada com esse filtro.</td></tr>`;

    pagination.innerHTML = `
      <button data-action="prev" ${page <= 1 ? 'disabled' : ''}>&larr; Anterior</button>
      <span>Página ${page} de ${totalPages} · ${filtered.length.toLocaleString('pt-BR')} de ${divergences.length.toLocaleString('pt-BR')} registros</span>
      <button data-action="next" ${page >= totalPages ? 'disabled' : ''}>Próxima &rarr;</button>
    `;
  }

  searchInput.addEventListener('input', apply);
  if (typeFilterSelect) typeFilterSelect.addEventListener('change', apply);
  pagination.addEventListener('click', (e) => {
    const action = e.target?.dataset?.action;
    if (action === 'prev') page--;
    if (action === 'next') page++;
    render();
  });
  render();
}

// ---------------------------------------------------------------------------
// exporters (ExcelJS)
// ---------------------------------------------------------------------------
const XLSX_COLORS = { headerDivergencias: 'FFB3261E', headerValidos: 'FF1E7A45', headerResumo: 'FF12405C', headerUnmatched: 'FF8A6D1D', dexpara: 'FFFFF3CD', erro: 'FFFCE0E1', parcial: 'FFFFF3CD' };

async function exportDivergences(result) {
  const wb = new ExcelJS.Workbook();
  setupWorkbookMeta(wb);

  const sheet = wb.addWorksheet('Divergencias por campo');
  sheet.columns = [
    { header: 'Tabela', key: 'tabela', width: 14 }, { header: 'ID', key: 'id', width: 16 },
    { header: 'Campo', key: 'campo', width: 20 }, { header: 'Valor Origem', key: 'origem', width: 22 },
    { header: 'Valor Destino', key: 'destino', width: 22 }, { header: 'Status', key: 'status', width: 16 },
    { header: 'Mensagem', key: 'mensagem', width: 46 },
  ];
  styleHeader(sheet, XLSX_COLORS.headerDivergencias);
  result.divergences.forEach((d) => {
    const row = sheet.addRow({
      tabela: result.entityName, id: d.id, campo: d.field, origem: d.origin, destino: d.dest,
      status: 'Erro',
      mensagem: d.isEmpty ? 'Campo vazio em um dos lados.' : 'Valores incompatíveis entre origem e destino.',
    });
    row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.erro } };
  });
  if (!result.divergences.length) addEmptyNotice(sheet, 7, 'Nenhuma divergência de campo encontrada — todos os registros pareados bateram integralmente.');
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columns.length } };

  const recordSheet = wb.addWorksheet('Registros com divergencia');
  recordSheet.columns = [
    { header: 'Tabela', key: 'tabela', width: 14 }, { header: 'ID', key: 'id', width: 16 },
    { header: 'Campos verificados', key: 'checked', width: 18 }, { header: 'Campos OK', key: 'ok', width: 14 },
    { header: 'Campos DexPara', key: 'dexpara', width: 16 }, { header: 'Campos com erro', key: 'error', width: 16 },
  ];
  styleHeader(recordSheet, XLSX_COLORS.headerDivergencias);
  result.invalidRecords.forEach((r) => {
    const row = recordSheet.addRow({ tabela: result.entityName, id: r.id, checked: r.fieldsChecked, ok: r.okFields, dexpara: r.dexparaFields, error: r.errorFields });
    row.getCell('error').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.erro } };
  });
  if (!result.invalidRecords.length) addEmptyNotice(recordSheet, 6, 'Nenhum registro com divergência — todos os registros pareados são válidos.');

  await downloadWorkbook(wb, fileName(result, 'divergencias'));
}

async function exportValid(result) {
  const wb = new ExcelJS.Workbook();
  setupWorkbookMeta(wb);
  const sheet = wb.addWorksheet('Registros validos');
  sheet.columns = [
    { header: 'Tabela', key: 'tabela', width: 14 }, { header: 'ID', key: 'id', width: 16 },
    { header: 'Status', key: 'status', width: 12 }, { header: 'Campos validados', key: 'validados', width: 18 },
    { header: 'Campos via DexPara', key: 'dexpara', width: 18 }, { header: 'Data/Hora', key: 'data', width: 20 },
  ];
  styleHeader(sheet, XLSX_COLORS.headerValidos);
  const now = new Date().toLocaleString('pt-BR');
  result.validRecords.forEach((r) => sheet.addRow({ tabela: result.entityName, id: r.id, status: 'Válido', validados: r.fieldsValidated, dexpara: r.dexparaFields || 0, data: now }));
  if (!result.validRecords.length) {
    addEmptyNotice(sheet, 6, `Nenhum registro ficou 100% válido nesta validação (${result.summary.recordsInvalid} de ${result.summary.comparedPairs} registros comparados têm ao menos 1 campo divergente). Veja o arquivo de divergências para o detalhe.`);
  }
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columns.length } };
  await downloadWorkbook(wb, fileName(result, 'validos'));
}

async function exportUnmatched(result) {
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
  styleHeader(sheet, XLSX_COLORS.headerUnmatched);
  result.unmatchedClients.forEach((c) => {
    const row = sheet.addRow({ id: c.id, tabela: result.entityName, foundIn: c.foundIn, missingFrom: c.missingFrom, reason: c.reason });
    if (c.missingFrom === 'Parcial') row.getCell('missingFrom').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.parcial } };
  });
  if (!result.unmatchedClients.length) {
    addEmptyNotice(sheet, 5, 'Nenhum cliente sem correspondência — todos os clientes foram encontrados nos dois arquivos.');
  }
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columns.length } };
  await downloadWorkbook(wb, fileName(result, 'sem_correspondencia'));
}

async function exportSummary(result) {
  const { summary, dexPara, topCriticalFields } = result;
  const wb = new ExcelJS.Workbook();
  setupWorkbookMeta(wb);
  const sheet = wb.addWorksheet('Resumo');
  sheet.columns = [{ header: 'Indicador', key: 'k', width: 38 }, { header: 'Valor', key: 'v', width: 20 }];
  styleHeader(sheet, XLSX_COLORS.headerResumo);
  const rows = [
    ['Entidade', result.entityName], ['Campos analisados (filtro)', result.appliedFieldFilter ? result.appliedFieldFilter.join(', ') : 'Todos'],
    ['Registros na origem', summary.originRecordCount], ['Registros no destino', summary.destRecordCount],
    ['Registros comparados', summary.comparedPairs], ['Registros sem correspondência (origem)', summary.unmatchedOriginCount],
    ['Registros sem correspondência (destino)', summary.unmatchedDestCount], ['Clientes totais', summary.clientsTotal],
    ['Clientes válidos', summary.clientsValid], ['Clientes com divergência', summary.clientsWithError],
    ['Clientes sem correspondência', summary.clientsUnmatched], ['Taxa de sucesso por cliente (%)', summary.clientSuccessRate],
    ['Registros válidos', summary.recordsValid], ['Registros com divergência', summary.recordsInvalid],
    ['Taxa de sucesso por registro (%)', summary.recordSuccessRate], ['Tempo de processamento (ms)', summary.elapsedMs],
    ['Usou regras De/Para', dexPara.used ? 'Sim' : 'Não'], ['Comparações resolvidas por DexPara', dexPara.dexParaMatches],
    ['% resolvido por DexPara', dexPara.percentResolvedByDexPara],
  ];
  rows.forEach(([k, v]) => sheet.addRow({ k, v }));

  const criticalSheet = wb.addWorksheet('Campos criticos');
  criticalSheet.columns = [
    { header: 'Campo', key: 'field', width: 22 }, { header: 'Erros', key: 'error', width: 12 },
    { header: 'DexPara', key: 'dexpara', width: 12 }, { header: 'OK', key: 'ok', width: 12 },
    { header: 'Clientes afetados', key: 'affected', width: 16 }, { header: '% sucesso', key: 'rate', width: 12 },
  ];
  styleHeader(criticalSheet, XLSX_COLORS.headerResumo);
  topCriticalFields.forEach((f) => {
    const row = criticalSheet.addRow({ field: f.field, error: f.error, dexpara: f.dexpara, ok: f.ok, affected: f.affectedRecords, rate: f.successRate });
    if (f.error > 0) row.getCell('error').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.erro } };
  });

  await downloadWorkbook(wb, fileName(result, 'resumo'));
}

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
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function fileName(result, prefix) {
  return `${prefix}_${result.entityName}_${result.generatedAt.replace(/[:.]/g, '-')}.xlsx`;
}

// ---------------------------------------------------------------------------
// results controller
// ---------------------------------------------------------------------------
function renderResults(result) {
  document.getElementById('resultEntity').textContent = result.entityName;
  renderHeroBanner(document.getElementById('heroBanner'), result);
  renderFieldFilterBanner(document.getElementById('fieldFilterBanner'), result);
  renderCoverageCards(document.getElementById('coverageCards'), result);
  renderQualityCards(document.getElementById('qualityCards'), result);
  renderPerformanceCards(document.getElementById('performanceCards'), result);
  renderClientsChart('clientsChart', result.summary);
  renderCriticalFieldsChart('criticalFieldsChart', result.topCriticalFields);
  initDivergenceTable({
    searchInput: document.getElementById('divergenceSearch'),
    typeFilterSelect: document.getElementById('divergenceTypeFilter'),
    tableBody: document.getElementById('divergenceTableBody'),
    pagination: document.getElementById('divergencePagination'),
    divergences: result.divergences,
  });
  document.getElementById('exportDivergences').onclick = () => exportDivergences(result).catch(reportExportError);
  document.getElementById('exportValid').onclick = () => exportValid(result).catch(reportExportError);
  document.getElementById('exportUnmatched').onclick = () => exportUnmatched(result).catch(reportExportError);
  document.getElementById('exportSummary').onclick = () => exportSummary(result).catch(reportExportError);
}

function reportExportError(err) {
  logger.error('Erro ao exportar planilha:', err);
  alert(`Erro ao gerar o arquivo: ${err.message}`);
}

// ---------------------------------------------------------------------------
// bootstrap / app
// ---------------------------------------------------------------------------
const APP_VIEWS = ['view-upload', 'view-progress', 'view-results'];
function showView(id) {
  for (const v of APP_VIEWS) document.getElementById(v).classList.toggle('is-active', v === id);
}

let activeWorker = null;

function startValidation(payload) {
  showView('view-progress');
  resetProgress();

  // Worker via Blob URL: funciona mesmo com a página aberta via file://,
  // diferente de um Worker apontando para um arquivo .js separado.
  const workerSourceText = document.getElementById('workerSource').textContent;
  const blob = new Blob([workerSourceText], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  activeWorker = new Worker(blobUrl);

  activeWorker.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === 'progress') {
      updateProgress(msg);
    } else if (msg.type === 'done') {
      logger.info('Resultado recebido do worker', msg.result.summary);
      renderResults(msg.result);
      showView('view-results');
      activeWorker.terminate();
      URL.revokeObjectURL(blobUrl);
    } else if (msg.type === 'error') {
      alert(`Erro na validação: ${msg.message}`);
      showView('view-upload');
      activeWorker.terminate();
      URL.revokeObjectURL(blobUrl);
    }
  };

  activeWorker.onerror = (err) => {
    logger.error('Erro fatal no worker', err);
    alert(`Erro inesperado ao processar: ${err.message}`);
    showView('view-upload');
  };

  activeWorker.postMessage(payload);
}

document.getElementById('backToUpload').addEventListener('click', () => showView('view-upload'));

window.addEventListener('unhandledrejection', (event) => {
  logger.error('Promise rejeitada sem tratamento:', event.reason);
  showFatalError(event.reason?.message || String(event.reason), { hint: buildHint() });
});
window.addEventListener('error', (event) => {
  logger.error('Erro não tratado:', event.error || event.message);
  showFatalError(event.error?.message || event.message, { hint: buildHint() });
});

function buildHint() {
  return 'Verifique sua conexão com a internet — este app carrega Chart.js, ExcelJS e as bibliotecas de leitura de Excel/CSV via CDN na primeira vez que são usadas.';
}

try {
  initUploadController({ onStart: startValidation });
} catch (err) {
  logger.error('Falha ao inicializar a tela de upload:', err);
  showFatalError(err.message, { hint: buildHint() });
}
