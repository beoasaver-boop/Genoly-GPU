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

  countKmersAsync: (payload) =>
    request('/kmer/count-async', { method: 'POST', body: JSON.stringify(payload) }),

  jobStatus: (jobId) => request(`/jobs/${jobId}`),

  // Suscripción SSE al progreso de un trabajo. Resuelve con el resultado
  // en el evento 'done' y rechaza con el detalle en 'error'.
  jobEvents: (jobId, { onProgress, onStart } = {}) =>
    new Promise((resolve, reject) => {
      const es = new EventSource(`${BASE}/jobs/${jobId}/events`)
      es.onmessage = (e) => {
        let data
        try {
          data = JSON.parse(e.data)
        } catch {
          return
        }
        if (data.type === 'progress') onProgress?.(data)
        else if (data.type === 'start') onStart?.(data)
        else if (data.type === 'done') {
          es.close()
          resolve(data.result)
        } else if (data.type === 'error') {
          es.close()
          reject(new Error(data.detail || 'El trabajo falló'))
        }
      }
      es.onerror = () => {
        es.close()
        reject(new Error('Conexión de progreso interrumpida'))
      }
    }),

  callVariants: (payload) =>
    request('/variants/call', { method: 'POST', body: JSON.stringify(payload) }),

  fitLmm: (payload) =>
    request('/quantitative/fit', { method: 'POST', body: JSON.stringify(payload) }),

  predictGblup: (payload) =>
    request('/gblup/predict', { method: 'POST', body: JSON.stringify(payload) }),
}