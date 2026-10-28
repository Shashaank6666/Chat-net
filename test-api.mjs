/* API test: invokes the serverless function directly with web-standard
   Request/Response (same as Netlify's runtime). Verifies full flows AND
   persistence across separate invocations (fresh function module each phase). */
import { setEnv } from './netlify/functions/test-env.mjs';

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ✅ PASS: ${n}`); };
const bad = (n, x) => { fail++; console.log(`  ❌ FAIL: ${n} ${x || ''}`); };

async function call(fnModule, action, body = {}) {
  const req = new Request('https://site.netlify.app/api?action=' + action, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, action }),
  });
  const res = await fnModule.default(req);
  return { status: res.status, body: await res.json() };
}

const run = async () => {
  console.log('— Netlify Functions API test (phase 1) —');

  let api = await import('./netlify/functions/api.mjs');

  // create room with password
  const c = await call(api, 'create-room', { name: 'netlify room', password: 'pw1', nickname: 'alice' });
  (c.status === 200 && c.body.ok && c.body.room.hasPassword) ? ok('create room with password') : bad('create-room', JSON.stringify(c));

  const roomId = c.body.room?.id;

  // duplicate rejected
  const dup = await call(api, 'create-room', { name: 'netlify room', nickname: 'bob' });
  !dup.body.ok ? ok('duplicate room name rejected') : bad('duplicate accepted', JSON.stringify(dup));

  // wrong password rejected
  const j1 = await call(api, 'join-room', { roomId, password: 'WRONG', nickname: 'bob' });
  !j1.body.ok ? ok('wrong password rejected') : bad('wrong pw accepted', JSON.stringify(j1));

  // correct join → history contains system message
  const j2 = await call(api, 'join-room', { roomId, password: 'pw1', nickname: 'bob' });
  (j2.body.ok && j2.body.history?.some((m) => m.type === 'system' && /bob/.test(m.text)))
    ? ok('join with correct password + system msg in history')
    : bad('join-room', JSON.stringify(j2));

  // send text + emoji messages
  const s1 = await call(api, 'send-message', { roomId, nickname: 'bob', text: 'hello from serverless ☁️', type: 'text' });
  (s1.body.ok && s1.body.msg.user === 'bob') ? ok('text message stored') : bad('send text', JSON.stringify(s1));
  const s2 = await call(api, 'send-message', { roomId, nickname: 'alice', text: '🥳', type: 'emoji' });
  (s2.body.ok && s2.body.msg.type === 'emoji') ? ok('emoji message stored') : bad('send emoji', JSON.stringify(s2));

  // non-member cannot send
  const s3 = await call(api, 'send-message', { roomId, nickname: 'stranger', text: 'hi', type: 'text' });
  !s3.body.ok ? ok('non-member send rejected') : bad('non-member accepted', JSON.stringify(s3));

  // invite flow
  await call(api, 'presence', { nickname: 'carol' });
  const inv = await call(api, 'invite', { roomId, from: 'alice', to: 'carol', password: 'pw1' });
  inv.body.ok ? ok('invite to online user sent') : bad('invite', JSON.stringify(inv));
  const inbox = await call(api, 'inbox', { nickname: 'carol' });
  (inbox.body.ok && inbox.body.invites?.length === 1 && inbox.body.invites[0].roomId === roomId)
    ? ok('invite lands in carol inbox') : bad('inbox', JSON.stringify(inbox));
  const invOff = await call(api, 'invite', { roomId, from: 'alice', to: 'ghost404' });
  !invOff.body.ok ? ok('offline invite rejected') : bad('offline invite', JSON.stringify(invOff));

  // state endpoint
  const st = await call(api, 'state', { roomId, nickname: 'bob', since: 0 });
  (st.body.ok && st.body.messages?.length >= 3 && st.body.members?.includes('bob'))
    ? ok('state returns history + members') : bad('state', JSON.stringify(st.body));

  // rooms list
  const rl = await call(api, 'rooms');
  (rl.body.ok && rl.body.rooms?.some((r) => r.id === roomId && r.members.includes('bob')))
    ? ok('rooms list shows live room') : bad('rooms', JSON.stringify(rl.body));

  console.log('\n  💀 phase 1 done — simulating cold start (fresh function module + new store)…');

  /* ---------- phase 2: brand-new module instance, same storage ---------- */
  setEnv.fresh++;
  const api2 = await import('./netlify/functions/api.mjs?cold=' + setEnv.fresh);

  const j3 = await call(api2, 'join-room', { roomId, password: 'pw1', nickname: 'carol' });
  (j3.body.ok && j3.body.history?.some((m) => m.text === 'hello from serverless ☁️') && j3.body.history?.some((m) => m.text === '🥳'))
    ? ok('persistence: room + password + both messages survive across invocations')
    : bad('persistence', JSON.stringify(j3.body));

  const rl2 = await call(api2, 'rooms');
  (rl2.body.ok && rl2.body.rooms?.some((r) => r.id === roomId))
    ? ok('persistence: room list survives across invocations') : bad('rooms persist', JSON.stringify(rl2.body));

  const s4 = await call(api2, 'send-message', { roomId, nickname: 'carol', text: 'post-cold-start 💬', type: 'text' });
  s4.body.ok ? ok('messaging works after cold start') : bad('post cold send', JSON.stringify(s4));

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
