const BASE = '/api'

async function request(path, options = {}) {
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData
  const res = await fetch(`${BASE}${path}`, {
    headers: isFormData ? {} : { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let detail = await res.text()
    try {
      const parsed = JSON.parse(detail)
      if (parsed && typeof parsed.detail === 'string') detail = parsed.detail
    } catch {
      // cuerpo no JSON: se muestra tal cual
    }
    throw new Error(detail || `Error ${res.status}`)
  }
  return res.json()
}

export const api = {
  health: () => request('/health'),
  setup: () => request('/setup'),
  device: () => request('/device'),

  upload: (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/upload', { method: 'POST', body: form })
  },

  analyzeQc: (payload) =>
    request('/qc/analyze', { method: 'POST', body: JSON.stringify(payload) }),

  countKmers: (payload) =>
    request('/kmer/count', { method: 'POST', body: JSON.stringify(payload) }),

  callVariants: (payload) =>
    request('/variants/call', { method: 'POST', body: JSON.stringify(payload) }),

  fitLmm: (payload) =>
    request('/quantitative/fit', { method: 'POST', body: JSON.stringify(payload) }),

  predictGblup: (payload) =>
    request('/gblup/predict', { method: 'POST', body: JSON.stringify(payload) }),
}