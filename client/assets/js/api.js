export async function fetchDashboard(options = {}) {
  const params = new URLSearchParams();
  if (options.symbol) {
    params.set('symbol', options.symbol);
  }
  if (options.interval) {
    params.set('interval', options.interval);
  }

  const query = params.toString();
  const response = await fetch(`/api/dashboard${query ? `?${query}` : ''}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.detail || payload?.error?.message || 'Dashboard request failed.';
    throw new Error(message);
  }

  return payload;
}

export async function fetchAssets() {
  const response = await fetch('/api/assets', {
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.detail || payload?.error?.message || 'Assets request failed.';
    throw new Error(message);
  }

  return payload;
}

export async function resolveAsset(options = {}) {
  const params = new URLSearchParams();
  if (options.symbol) {
    params.set('symbol', options.symbol);
  }
  if (options.interval) {
    params.set('interval', options.interval);
  }

  const query = params.toString();
  const response = await fetch(`/api/assets/resolve${query ? `?${query}` : ''}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.detail || payload?.error?.message || 'Asset resolve request failed.';
    throw new Error(message);
  }

  return payload;
}

export async function addWatchlistAsset(options = {}) {
  const response = await fetch('/api/assets/watchlist', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      symbol: options.symbol,
      interval: options.interval,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.detail || payload?.error?.message || 'Add watchlist request failed.';
    throw new Error(message);
  }

  return payload;
}

export async function removeWatchlistAsset(symbol) {
  const response = await fetch(`/api/assets/watchlist/${encodeURIComponent(symbol)}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.detail || payload?.error?.message || 'Remove watchlist request failed.';
    throw new Error(message);
  }

  return payload;
}

export async function fetchAnalysis(options = {}) {
  const params = new URLSearchParams();
  if (options.symbol) {
    params.set('symbol', options.symbol);
  }
  if (options.interval) {
    params.set('interval', options.interval);
  }

  const query = params.toString();
  const response = await fetch(`/api/analysis${query ? `?${query}` : ''}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.detail || payload?.error?.message || 'Analysis request failed.';
    throw new Error(message);
  }

  return payload;
}
