const PRODUCTION_API = 'https://resiliocheck-api-451012324874.europe-west1.run.app';

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || PRODUCTION_API;
  const token = typeof window !== 'undefined' ? localStorage.getItem('rc_token') : null;

  const headers = {
    ...options.headers,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };

  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  
  return fetch(url, { ...options, headers });
}
