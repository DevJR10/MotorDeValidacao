// dashboard/charts.js
// -----------------------------------------------------------------------------
// Dashboard: um gráfico circular (clientes válidos x com divergência) e um
// gráfico de barras (campos com erro, ordenado do mais crítico ao menos
// crítico, colorido por severidade) — substitui o antigo "Plano de ação":
// a barra já mostra visualmente onde focar a correção. Ao passar o mouse
// numa barra, o tooltip explica o que aquele campo técnico significa no SAP
// (dashboard/fieldDictionary.js).
// -----------------------------------------------------------------------------

import { getFieldInfo } from './fieldDictionary.js';

const palette = {
  ok: '#34C77B',
  error: '#F2545B',
  text: '#8FA3B3',
  grid: 'rgba(232, 237, 242, 0.08)',
};

const instances = new Map();

function renderChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  if (instances.has(canvasId)) instances.get(canvasId).destroy();
  const chart = new Chart(canvas, { ...config, plugins: [ChartDataLabels] });
  instances.set(canvasId, chart);
  return chart;
}

/** Único gráfico do dashboard: clientes válidos x clientes com divergência. */
export function renderClientsChart(canvasId, summary) {
  const total = summary.clientsValid + summary.clientsWithError;
  return renderChart(canvasId, {
    type: 'doughnut',
    data: {
      labels: ['Clientes válidos', 'Clientes com divergência'],
      datasets: [
        {
          data: [summary.clientsValid, summary.clientsWithError],
          backgroundColor: [palette.ok, palette.error],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { position: 'bottom', labels: { color: palette.text, font: { family: 'Inter, sans-serif', size: 13 }, padding: 14 } },
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
 * crítico (já vem ordenado assim em topCriticalFields — por quantidade de
 * CLIENTES afetados). Cor muda de âmbar (menos crítico) a vermelho forte
 * (mais crítico) conforme a gravidade relativa.
 */
export function renderCriticalFieldsChart(canvasId, topCriticalFields) {
  const canvas = document.getElementById(canvasId);
  const outerCard = canvas?.closest('.chart-single, .chart-card, .chart-wide');
  const wrapperEl = canvas?.parentElement; // .chart-wrapper — controla a altura via CSS

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

  // Altura dinâmica: o gráfico mostra TODOS os campos com erro, sem limite —
  // cada barra precisa de espaço vertical mínimo pra não ficar espremida.
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
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, maxBarThickness: 28 }],
    },
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
        x: { beginAtZero: true, grid: { color: palette.grid }, ticks: { color: palette.text, precision: 0 } },
        y: { grid: { display: false }, ticks: { color: '#E7EDF3', font: { family: 'JetBrains Mono, monospace', size: 12 } } },
      },
    },
  });
}

/** Interpola de âmbar (menos crítico) até vermelho forte (mais crítico). */
function severityColor(value, maxValue) {
  const ratio = maxValue > 0 ? value / maxValue : 0;
  const from = { r: 245, g: 185, b: 66 }; // âmbar
  const to = { r: 179, g: 38, b: 30 }; // vermelho forte
  const r = Math.round(from.r + (to.r - from.r) * ratio);
  const g = Math.round(from.g + (to.g - from.g) * ratio);
  const b = Math.round(from.b + (to.b - from.b) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Quebra um texto em várias linhas (o tooltip do Chart.js não quebra sozinho). */
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
