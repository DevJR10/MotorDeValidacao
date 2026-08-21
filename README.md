# 🔎 Motor de Validação

> Ferramenta inteligente para validação e comparação de dados entre diferentes fontes, com foco em migrações SAP ECC → S/4HANA.

![Status](https://img.shields.io/badge/status-em%20desenvolvimento-orange)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 📌 Sobre o projeto

O **Motor de Validação** é uma aplicação criada para facilitar processos de validação de dados durante migrações, integrações ou auditorias.

A ferramenta compara duas bases de dados (Origem x Destino), identifica divergências e gera relatórios detalhados para apoiar a análise e correção dos dados.

Embora tenha sido desenvolvido pensando em cenários de migração **SAP ECC → SAP S/4HANA**, sua arquitetura permite validar qualquer tipo de entidade ou fonte de dados.

---

## 🎯 Problema que resolve

Durante grandes migrações de dados, validar manualmente milhares de registros é um processo:

- ❌ Demorado
- ❌ Suscetível a erros humanos
- ❌ Difícil de acompanhar
- ❌ Pouco escalável

O Validador automatiza esse processo, trazendo uma visão clara da qualidade dos dados antes da carga no sistema destino.

---

# 🚀 Principais funcionalidades

## ✅ Comparação inteligente de dados

- Comparação entre arquivos Excel, CSV ou APIs
- Suporte para diferentes entidades
- Identificação automática de:
  - Dados válidos
  - Divergências
  - Registros ausentes
  - Campos inconsistentes

---

## 📊 Dashboard de qualidade

Painel visual com indicadores como:

- Total de registros analisados
- Clientes válidos
- Clientes com divergências
- Clientes sem correspondência
- Campos analisados
- Taxa de sucesso da validação

---

## 📁 Exportação de relatórios

Geração automática de planilhas organizadas:

- Divergências encontradas
- Dados válidos
- Clientes sem correspondência
- Resumo geral da validação

Os arquivos possuem:

✔ Filtros automáticos  
✔ Cabeçalhos formatados  
✔ Organização por status  
✔ Estrutura pronta para análise

---

## 🔄 Regras de validação

Possui suporte para regras personalizadas:

- Normalização de valores
- Tratamento de campos vazios
- Regras De/Para
- Chaves simples e compostas
- Validação de diferentes cenários de negócio

---

# 🖥️ Como utilizar

## Opção 1 — Executar diretamente (recomendado)

Não precisa instalar nada.

1. Baixe o projeto
2. Abra o arquivo:

```
Validador-de-Dados-V2.html
```

3. Escolha os arquivos de origem e destino
4. Execute a validação


✅ Funciona diretamente pelo navegador.

---

## Opção 2 — Executar pelo código-fonte

Para desenvolvimento e manutenção:

```bash
npm start
```

Depois acesse:

```
http://localhost:5500
```

---

# 📂 Estrutura do projeto

```
Validador-de-Dados-V2

├── Validador-de-Dados-V2.html
│   └── Versão completa pronta para uso

├── js/
│   ├── core/
│   │   └── Motor de validação
│   │
│   ├── importers/
│   │   └── Leitura de arquivos
│   │
│   ├── exporters/
│   │   └── Geração de relatórios
│   │
│   ├── dashboard/
│   │   └── Indicadores e gráficos
│   │
│   └── ui/
│       └── Interface da aplicação

├── config/
│   └── Configurações das entidades

├── rules/
│   └── Regras de validação

└── test/
    └── Testes automatizados
```

---

# 🏗️ Tecnologias utilizadas

## Interface

- HTML5
- CSS3
- JavaScript ES6

## Processamento

- Node.js
- Web Workers

## Dados

- Excel
- CSV
- JSON
- APIs

## Relatórios

- ExcelJS
- Chart.js

---

# 🧪 Qualidade e testes

O projeto possui testes para garantir:

✔ Validação de regras  
✔ Comparação entre registros  
✔ Tratamento de dados inconsistentes  
✔ Exportações corretas  
✔ Performance em grandes volumes

Testado com cenários de até:

```
200.000 registros
```

---

# 🔮 Próximas melhorias

Algumas evoluções planejadas:

- Integração direta com bancos de dados
- Conectores SAP
- Histórico de validações realizadas
- Comparação automática entre versões
- Dashboard executivo para acompanhamento

---

# 👨‍💻 Autor

Desenvolvido por **João Albertini**

Projeto criado para automatizar processos de validação de dados e aumentar a confiabilidade em migrações de sistemas.

---

⭐ Se este projeto ajudou você, deixe uma estrela no repositório!
