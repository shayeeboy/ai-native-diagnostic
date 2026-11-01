// Access-control tests for the v3 API. No database: the shared pool's query()
// is replaced with a tiny in-memory fake before the app loads.
//
//   npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.TEAM_ACCESS_CODE = 'team-secret';
process.env.ALLOWED_ORIGINS = '';

const pool = require('../db/pool');
const rows = new Map();
pool.query = async (sql, params = []) => {
  const q = sql.replace(/\s+/g, ' ').trim();
  if (q.startsWith('ALTER TABLE')) return { rows: [] };
  if (q.startsWith('INSERT INTO sessions')) {
    const row = {
      id: crypto.randomUUID(), user_name: params[0], bottleneck: params[2], total_score: params[5],
      final_answer: params[8], edit_key_hash: params[9], created_at: new Date(), updated_at: new Date(),
    };
    rows.set(row.id, row);
    return { rows: [row] };
  }
  if (q.startsWith('UPDATE sessions')) {
    const row = rows.get(params[9]);
    if (!row) return { rows: [] };
    Object.assign(row, { user_name: params[0], final_answer: params[8], updated_at: new Date() });
    return { rows: [row] };
  }
  if (q.startsWith('SELECT id, user_name, bottleneck')) {
    return { rows: [...rows.values()].map(({ id, user_name, bottleneck, total_score, created_at, updated_at }) => ({ id, user_name, bottleneck, total_score, created_at, updated_at })) };
  }
  if (q.startsWith('SELECT')) {
    const row = rows.get(params[0]);
    return { rows: row ? [row] : [] };
  }
  if (q.startsWith('DELETE')) {
    const had = rows.delete(params[0]);
    return { rows: had ? [{ id: params[0] }] : [] };
  }
  throw new Error('unexpected query: ' + q);
};

const app = require('../server');

let base;
let server;
test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const api = (path, { method = 'GET', headers = {}, body } = {}) =>
  fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

async function createSession(name = 'Ada') {
  const res = await api('/api/sessions', { method: 'POST', body: { userName: name, finalAnswer: 'private note' } });
  assert.equal(res.status, 201);
  return res.json();
}

test('create returns an edit key once and never the stored hash', async () => {
  const s = await createSession();
  assert.match(s.editKey, /^[0-9a-f]{64}$/);
  assert.equal(s.edit_key_hash, undefined);
});

test('team list: 403 without the code, 403 with a wrong code', async () => {
  assert.equal((await api('/api/sessions')).status, 403);
  assert.equal((await api('/api/sessions', { headers: { 'X-Team-Code': 'guess' } })).status, 403);
});

test('team list with the code returns only team-view fields', async () => {
  await createSession('Grace');
  const res = await api('/api/sessions', { headers: { 'X-Team-Code': 'team-secret' } });
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.ok(list.length >= 1);
  for (const r of list) {
    assert.deepEqual(Object.keys(r).sort(), ['bottleneck', 'created_at', 'id', 'total_score', 'updated_at', 'user_name']);
  }
});

test('team list is closed when no team code is configured', async () => {
  const saved = process.env.TEAM_ACCESS_CODE;
  delete process.env.TEAM_ACCESS_CODE;
  try {
    assert.equal((await api('/api/sessions', { headers: { 'X-Team-Code': 'team-secret' } })).status, 403);
  } finally {
    process.env.TEAM_ACCESS_CODE = saved;
  }
});

test('one session: owner key reads it, a stranger with only the id cannot', async () => {
  const s = await createSession();
  assert.equal((await api(`/api/sessions/${s.id}`)).status, 403);
  assert.equal((await api(`/api/sessions/${s.id}`, { headers: { 'X-Session-Key': 'nope' } })).status, 403);
  const ok = await api(`/api/sessions/${s.id}`, { headers: { 'X-Session-Key': s.editKey } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).edit_key_hash, undefined);
});

test('update by id needs the owner key or team code', async () => {
  const s = await createSession();
  const body = { id: s.id, userName: 'Mallory' };
  assert.equal((await api('/api/sessions', { method: 'POST', body })).status, 403);
  assert.equal((await api('/api/sessions', { method: 'POST', body, headers: { 'X-Session-Key': s.editKey } })).status, 200);
  assert.equal((await api('/api/sessions', { method: 'POST', body, headers: { 'X-Team-Code': 'team-secret' } })).status, 200);
});

test('delete needs the owner key', async () => {
  const s = await createSession();
  assert.equal((await api(`/api/sessions/${s.id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await api(`/api/sessions/${s.id}`, { method: 'DELETE', headers: { 'X-Session-Key': s.editKey } })).status, 200);
});

test('legacy rows without a key are reachable with the team code only', async () => {
  const id = crypto.randomUUID();
  rows.set(id, { id, user_name: 'Old', edit_key_hash: null, created_at: new Date(), updated_at: new Date() });
  assert.equal((await api(`/api/sessions/${id}`, { headers: { 'X-Session-Key': 'anything' } })).status, 403);
  assert.equal((await api(`/api/sessions/${id}`, { headers: { 'X-Team-Code': 'team-secret' } })).status, 200);
});
