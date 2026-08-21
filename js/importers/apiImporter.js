// importers/apiImporter.js
// -----------------------------------------------------------------------------
// Novo conector: consome um endpoint REST (GET) e converte para o modelo
// interno comum. A origem da API pode retornar um array direto, ou um objeto
// com o array em uma propriedade (ex.: { data: [...] }) — configurável via
// `arrayPath`.
// -----------------------------------------------------------------------------

/**
 * @param {string} url
 * @param {string} idField propriedade do JSON que representa o identificador
 * @param {{ headers?: object, arrayPath?: string }} [options]
 * @returns {Promise<{id:string, fields:object}[]>}
 */
export async function importApi(url, idField, options = {}) {
  let response;
  try {
    response = await fetch(url, { method: 'GET', headers: options.headers || {} });
  } catch (err) {
    throw new Error(`Não foi possível conectar à API (${url}): ${err.message}`);
  }

  if (!response.ok) {
    throw new Error(`API retornou ${response.status} ${response.statusText} (${url})`);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Resposta da API em ${url} não é um JSON válido.`);
  }

  const rows = Array.isArray(json) ? json : getByPath(json, options.arrayPath) || json.data || json.results || json.value;

  if (!Array.isArray(rows)) {
    throw new Error(
      `Não foi possível localizar uma lista de registros na resposta da API. Informe "arrayPath" apontando para o array (ex.: "data.items").`
    );
  }

  const records = [];
  for (const row of rows) {
    const rawId = row?.[idField];
    if (rawId === undefined || rawId === null || rawId === '') continue;
    records.push({ id: String(rawId), fields: row });
  }
  return records;
}

function getByPath(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}
