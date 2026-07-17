const CACHE_VERSION = 'digipad-v1'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const OFFLINE_URL = '/offline.html'

const PRECACHE_URLS = [
	OFFLINE_URL,
	'/manifest.json',
	'/img/favicon.png'
]

const BYPASS_PATTERNS = [/^\/api\//, /^\/socket\.io\//, /^\/fichiers\//, /^\/temp\//, /^\/pdfjs\//]
const CACHEABLE_PATTERNS = [/^\/assets\//, /^\/img\//, /^\/fonts\//, /^\/js\//, /^\/manifest\.json$/]

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(STATIC_CACHE)
			.then((cache) => cache.addAll(PRECACHE_URLS))
			.then(() => self.skipWaiting())
	)
})

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))))
			.then(() => self.clients.claim())
	)
})

self.addEventListener('fetch', (event) => {
	const { request } = event
	if (request.method !== 'GET') return

	const url = new URL(request.url)
	if (url.origin !== self.location.origin) return
	if (BYPASS_PATTERNS.some((pattern) => pattern.test(url.pathname))) return

	// Pages : réseau en priorité, page hors-ligne si indisponible (contenu collaboratif = cache non pertinent)
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(() => caches.match(OFFLINE_URL))
		)
		return
	}

	// Assets statiques : cache d'abord, revalidation en arrière-plan
	if (CACHEABLE_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
		event.respondWith(
			caches.open(STATIC_CACHE).then(async (cache) => {
				const cached = await cache.match(request)
				const fetchPromise = fetch(request).then((response) => {
					if (response && response.status === 200) cache.put(request, response.clone())
					return response
				}).catch(() => cached)
				return cached || fetchPromise
			})
		)
	}
})
