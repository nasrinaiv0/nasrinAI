import test from 'node:test';
import assert from 'node:assert/strict';
import { createVideoStudioAssets } from '../src/video-studio-assets.js';

const caller = (id='user_123') => ({ tenantId:'11111111-1111-4111-8111-111111111111', actor:{ type:'user', id } });
function setup({ response = {}, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    let payload = response;
    if (String(url).includes('/object/upload/sign/video-studio-assets/')) {
      const object = new URL(url).pathname.split('/').pop();
      payload = { url:'/object/upload/sign/video-studio-assets/'+object+'?token=short-lived' };
    }
    return new Response(JSON.stringify(payload), { status, headers:{ 'Content-Type':'application/json' } });
  };
  const service = createVideoStudioAssets({
    config:{ supabaseUrl:'https://project.supabase.co', supabaseSecretKey:'server-only', uploads:{ perHour:60 } },
    limiter:{ upload:async()=>{} }, fetchImpl
  });
  return { service, calls };
}

test('Video Studio assets issue private owner-scoped upload links', async () => {
  const { service, calls } = setup();
  const signed = await service.sign(caller(), { name:'clip.mp4', type:'video/mp4', size:1024 }, '127.0.0.1');
  assert.match(signed.upload_url, /video-studio-assets\\/.+\\?token=short-lived$/);
  assert.match(calls[0].url, /\/object\/upload\/sign\/video-studio-assets\//);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer server-only');
  assert.equal(calls[0].init.headers.apikey, 'server-only');
  assert.ok(!JSON.stringify(signed).includes('server-only'));
});

test('Video Studio asset IDs are owner scoped for download and deletion', async () => {
  const { service, calls } = setup({ response:{ signedURL:'/object/sign/video-studio-assets/asset?token=short' } });
  const id='22222222-2222-4222-8222-222222222222';
  await service.readUrl(caller('user_a'), id);
  await service.remove(caller('user_b'), id);
  assert.match(calls[0].url, /\/object\/sign\/video-studio-assets\//);
  assert.match(calls[1].url, /\/object\/video-studio-assets$/);
  const firstObject = decodeURIComponent(calls[0].url.split('/').pop().split('?')[0]);
  const deleteBody = JSON.parse(calls[1].init.body);
  assert.notEqual(firstObject, deleteBody.prefixes[0]);
});

test('Video Studio asset uploads reject guests, unsafe types, and oversized files', async () => {
  const { service, calls } = setup({ response:{ url:'/object/upload/sign/video-studio-assets/object?token=x' } });
  await assert.rejects(service.sign({ tenantId:'x', actor:{type:'guest',id:'g'} }, {name:'a.mp4',type:'video/mp4',size:1}, '127.0.0.1'), { code:'sign_in_required' });
  await assert.rejects(service.sign(caller(), {name:'x.bin',type:'application/octet-stream',size:1}, '127.0.0.1'), { code:'unsupported_video_asset' });
  await assert.rejects(service.sign(caller(), {name:'huge.mp4',type:'video/mp4',size:60*1024*1024}, '127.0.0.1'), { code:'video_asset_too_large' });
  assert.equal(calls.length, 0);
});
