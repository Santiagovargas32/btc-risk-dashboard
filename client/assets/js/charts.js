let equityChart = null;

export function renderEquityChart(canvas, equityCurve = []) {
  const emptyState = document.getElementById('chartEmptyState');

  if (!Array.isArray(equityCurve) || equityCurve.length === 0) {
    emptyState.classList.remove('d-none');
    if (equityChart) {
      equityChart.destroy();
      equityChart = null;
    }
    return;
  }

  emptyState.classList.add('d-none');

  const labels = equityCurve.map((point) => new Date(point.timestamp).toLocaleDateString());
  const values = equityCurve.map((point) => Number(point.equity ?? 0));

  if (equityChart) {
    equityChart.data.labels = labels;
    equityChart.data.datasets[0].data = values;
    equityChart.update();
    return;
  }

  equityChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Equity',
          data: values,
          borderColor: '#2fd18b',
          backgroundColor: 'rgba(47, 209, 139, 0.14)',
          borderWidth: 2,
          fill: true,
          pointRadius: 0,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index',
      },
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#a1aaa5',
            maxTicksLimit: 8,
          },
          grid: {
            color: 'rgba(161, 170, 165, 0.12)',
            display: false,
          },
        },
        y: {
          ticks: {
            color: '#a1aaa5',
            callback: (value) => Number(value).toLocaleString(),
          },
          grid: {
            color: 'rgba(161, 170, 165, 0.16)',
          },
        },
      },
    },
  });
}
