const listeners = new Set();

let state = {
  loading: false,
  error: null,
  data: null,
  assets: [],
  symbol: 'BTCUSDT',
  interval: '1h',
};

export function getState() {
  return state;
}

export function setState(patch) {
  state = {
    ...state,
    ...patch,
  };

  listeners.forEach((listener) => listener(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(state);

  return () => listeners.delete(listener);
}
