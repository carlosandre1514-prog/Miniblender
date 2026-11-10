/* Service worker: guarda o app no aparelho para abrir sem internet. */
const CACHE='miniblender-v5';
const FILES=['./','index.html','manifest.webmanifest','icon.svg','vendor/three.min.js','vendor/GLTFExporter.js','vendor/GLTFLoader.js','vendor/OBJLoader.js','vendor/anthropic-sdk.mjs',
  'js/tools.js','js/modifiers.js','js/scene.js','js/effects.js','js/weapons.js','js/export.js','vendor/fflate.min.js','vendor/FBXLoader.js','js/character.js','js/api.js','js/claude.js','plugins/exemplo-escada.js','assets/human.bin.gz','assets/skin_f.jpg','assets/skin_m.jpg','assets/skin_f_suit.jpg','assets/skin_m_suit.jpg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
// Rede primeiro (pega atualizações), cache se estiver offline. Nunca intercepta a API da Anthropic nem o servidor MCP.
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/mcp'))return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}return r;}).catch(()=>caches.match(e.request,{ignoreSearch:true})));
});
