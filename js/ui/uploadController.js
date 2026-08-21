// ui/uploadController.js
// -----------------------------------------------------------------------------
// Tela 1: escolha do tipo de comparação, da entidade (chave composta), do
// filtro de campos a analisar (opcional) e da origem de cada dataset
// (Excel / CSV / API). Ao clicar em "Iniciar validação", monta as fontes e
// delega tudo ao Web Worker.
// -----------------------------------------------------------------------------

import { logger } from '../utils/logger.js';
import { createTagInput } from './tagInput.js';

let comparisonTypes = {};
let entities = {};
let fieldFilterInput = null;

export async function initUploadController({ onStart }) {
  [comparisonTypes, entities] = await Promise.all([
    fetchJson('./config/comparisonTypes.json'),
    fetchJson('./config/entities.json'),
  ]);

  populateSelect('comparisonType', comparisonTypes, (key, cfg) => `${cfg.label}`);
  populateSelect('entityName', entities, (key, cfg) => `${key} — ${cfg.label}`, { extra: { CUSTOM: 'Outra entidade (configurar manualmente)' } });

  buildSourceForm('origin', 'Origem');
  buildSourceForm('dest', 'Destino');
  fieldFilterInput = createTagInput(document.getElementById('fieldFilterContainer'));
  document.getElementById('clearFieldFilterBtn').addEventListener('click', () => fieldFilterInput.setValues([]));

  document.getElementById('comparisonType').addEventListener('change', updateRulesHint);
  document.getElementById('entityName').addEventListener('change', toggleCustomKeyFields);
  document.getElementById('startBtn').addEventListener('click', () => handleStart(onStart));

  updateRulesHint();
  toggleCustomKeyFields();
}

async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`Não foi possível carregar ${url} (${err.message}).`);
  }
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${url}: HTTP ${response.status} ${response.statusText}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${url} não retornou um JSON válido.`);
  }
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
  const type = comparisonTypes[document.getElementById('comparisonType').value];
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
    const comparisonType = comparisonTypes[comparisonTypeKey];
    const entityName = document.getElementById('entityName').value;

    let entityConfig = entities[entityName] || null;
    if (entityName === 'CUSTOM') {
      const raw = document.getElementById('customKeyFields').value.trim();
      entityConfig = raw ? { primaryKey: raw.split(',').map((s) => s.trim()).filter(Boolean) } : null;
    }

    const originSource = readSource('origin');
    const destSource = readSource('dest');
    const fieldFilter = fieldFilterInput.getValues();

    onStart({ originSource, destSource, entityName, comparisonType, entityConfig, fieldFilter: fieldFilter.length ? fieldFilter : null });
  } catch (err) {
    logger.warn(err.message);
    alert(err.message);
  }
}
