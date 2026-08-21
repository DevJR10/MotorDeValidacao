// dashboard/fieldDictionary.js
// -----------------------------------------------------------------------------
// Dicionário de campos técnicos do SAP (mestre de Cliente e Fornecedor) —
// usado para explicar, ao passar o mouse no gráfico de campos críticos, o
// que cada nome técnico (ex.: SPART) significa no SAP.
//
// Cobre os campos mais comuns das tabelas de cliente (KNA1, KNB1, KNVV,
// KNB5, KNVI, KNVP, ARDC/ARD6) e fornecedor (LFA1, LFB1, LFM1) — as
// principais usadas em projetos de migração ECC → S/4HANA. Não é uma lista
// exaustiva de TODOS os campos do dicionário de dados do SAP (são milhares,
// incluindo campos de customização específicos de cada implementação), mas
// cobre o que normalmente aparece em bases de cliente/fornecedor.
//
// Chave: nome técnico do campo (maiúsculo). Como muitos nomes de campo são
// compartilhados entre tabelas de cliente e fornecedor (ex.: NAME1, STRAS,
// PSTLZ), uma única entrada serve para os dois contextos.
// -----------------------------------------------------------------------------

export const SAP_FIELD_DICTIONARY = {
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
export function getFieldInfo(fieldName) {
  if (!fieldName) return null;
  return SAP_FIELD_DICTIONARY[fieldName.trim().toUpperCase()] || null;
}
