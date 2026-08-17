const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(detail || `Error ${res.status}`)
  }
  return res.json()
}

export const api = {
  health: () => request('/health'),
  setup: () => request('/setup'),
  device: () => request('/device'),

  analyzeQc: (payload) =>
    request('/qc/analyze', { method: 'POST', body: JSON.stringify(payload) }),

  countKmers: (payload) =>
    request('/kmer/count', { method: 'POST', body: JSON.stringify(payload) }),

  callVariants: (payload) =>
    request('/variants/call', { method: 'POST', body: JSON.stringify(payload) }),
}