export async function fetchDashboard(options = {}) {
  const params = new URLSearchParams();
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
