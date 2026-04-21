const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function run() {
  const apiSource = fs.readFileSync(path.join(process.cwd(), 'client/assets/js/api.js'), 'utf8');
  const dashboardJsSource = fs.readFileSync(path.join(process.cwd(), 'client/assets/js/dashboard.js'), 'utf8');
  const indexSource = fs.readFileSync(path.join(process.cwd(), 'client/index.html'), 'utf8');
  const fetchDashboardStart = apiSource.indexOf('export async function fetchDashboard');
  const fetchAssetsStart = apiSource.indexOf('export async function fetchAssets');
  const fetchDashboardSource = apiSource.slice(fetchDashboardStart, fetchAssetsStart);

  assert.ok(fetchDashboardSource.includes("params.set('symbol', options.symbol)"));
  assert.ok(fetchDashboardSource.includes('/api/dashboard'));
  assert.equal(dashboardJsSource.includes('renderEquityChart'), false);
  assert.equal(dashboardJsSource.includes('equityChart'), false);
  assert.equal(dashboardJsSource.includes('marketStats'), false);
  assert.equal(dashboardJsSource.includes('historicalStats'), false);
  assert.equal(indexSource.includes('Historical Equity'), false);
  assert.equal(indexSource.includes('Selected Asset Snapshot'), false);
  assert.equal(indexSource.includes('/vendor/chart.js/chart.umd.js'), false);
  assert.ok(indexSource.includes('macroEvents'));
  assert.ok(indexSource.includes('macroDrivers'));
  assert.ok(dashboardJsSource.includes('renderMacroEvents'));
  assert.ok(dashboardJsSource.includes('renderMacroDrivers'));
}

module.exports = {
  name: 'client dashboard API forwards the selected symbol',
  run,
};
