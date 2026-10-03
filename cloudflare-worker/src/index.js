const MAX_BACKUPS = 5;
const PREFIX = 'backups/';
const ALLOWED_ORIGIN = 'https://viniciusnevesdev.github.io';

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  Vary: 'Origin'
};
const reply = (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json; charset=utf-8', ...cors, ...(init.headers || {}) } });
const backupId = date => date.replace(/[:.]/g, '-');
const countComponents = projects => projects.reduce((total, project) => total + (project.components?.length || 0), 0);

async function sha256(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function validate(snapshot) {
  if (snapshot?.format !== 'ui-builder-library-backup' || snapshot.formatVersion !== 1 || !Array.isArray(snapshot.library?.projects)) throw new Error('Backup inválido.');
  const projects = snapshot.library.projects;
  const projectCount = projects.length;
  const componentCount = countComponents(projects);
  if (snapshot.metadata?.projectCount !== projectCount || snapshot.metadata?.componentCount !== componentCount) throw new Error('Metadados do backup não conferem.');
  const integrity = { ...snapshot }; delete integrity.integrity;
  if (snapshot.integrity?.algorithm !== 'SHA-256' || snapshot.integrity.value !== await sha256(integrity)) throw new Error('Checksum do backup não confere.');
  return { projectCount, componentCount };
}
async function list(env) {
  const result = await env.UI_BUILDER_BACKUPS.list({ prefix: PREFIX, limit: MAX_BACKUPS, include: ['customMetadata'] });
  return result.objects.sort((a, b) => b.uploaded - a.uploaded).map(object => ({
    id: object.key.slice(PREFIX.length).replace(/\.json$/, ''),
    createdAt: object.customMetadata?.createdAt || object.uploaded.toISOString(),
    uploaded: object.uploaded.toISOString(), projectCount: Number(object.customMetadata?.projectCount || 0),
    componentCount: Number(object.customMetadata?.componentCount || 0), size: object.size
  }));
}
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return reply({ ok: true });
    if (url.pathname === '/backups' && request.method === 'GET') return reply({ backups: await list(env) });
    if (url.pathname === '/backups' && request.method === 'POST') {
      try {
        const source = await request.text();
        if (source.length > 5_000_000) return reply({ error: 'Backup excede o limite de 5 MB.' }, { status: 413 });
        const snapshot = JSON.parse(source); const counts = await validate(snapshot);
        const id = backupId(snapshot.createdAt || new Date().toISOString());
        await env.UI_BUILDER_BACKUPS.put(`${PREFIX}${id}.json`, source, { httpMetadata: { contentType: 'application/json; charset=utf-8' }, customMetadata: { createdAt: snapshot.createdAt, projectCount: String(counts.projectCount), componentCount: String(counts.componentCount), checksum: snapshot.integrity.value } });
        const all = await env.UI_BUILDER_BACKUPS.list({ prefix: PREFIX, limit: 1000 });
        const old = all.objects.sort((a, b) => b.uploaded - a.uploaded).slice(MAX_BACKUPS).map(object => object.key);
        if (old.length) await env.UI_BUILDER_BACKUPS.delete(old);
        return reply({ ok: true, id, projectCount: counts.projectCount, componentCount: counts.componentCount }, { status: 201 });
      } catch (error) { return reply({ error: error.message || 'Não foi possível salvar o backup.' }, { status: 400 }); }
    }
    const match = url.pathname.match(/^\/backups\/([\w-]+)$/);
    if (match && request.method === 'GET') {
      const object = await env.UI_BUILDER_BACKUPS.get(`${PREFIX}${match[1]}.json`);
      if (!object) return reply({ error: 'Backup não encontrado.' }, { status: 404 });
      return new Response(object.body, { headers: { 'content-type': 'application/json; charset=utf-8', ...cors } });
    }
    return reply({ error: 'Rota não encontrada.' }, { status: 404 });
  }
};
