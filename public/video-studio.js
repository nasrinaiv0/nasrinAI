(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { template:'cinematic', clips:[], selected:null, generated:[], token:'', tokenUntil:0, refreshing:null, objectUrls:new Map() };
  const templates = {
    cinematic:{title:'Cinematic opener',sub:'Atmospheric · Story-led',prompt:'A cinematic, atmospheric opening shot with elegant camera movement, rich natural textures, soft directional light, subtle film grain, premium color grading, no text or logos.',ratio:'16:9'},
    social:{title:'Social launch',sub:'Bold · Fast-paced',prompt:'A bold vertical social media launch video, energetic camera movement, vibrant editorial lighting, crisp detail, fast visual rhythm, polished commercial style, no text or logos.',ratio:'9:16'},
    product:{title:'Product spotlight',sub:'Minimal · Premium',prompt:'A premium product hero film with sculptural lighting, elegant shadows, macro detail, slow smooth camera motion, refined neutral palette, high-end commercial cinematography, no text or logos.',ratio:'16:9'},
    story:{title:'Travel story',sub:'Warm · Documentary',prompt:'A warm documentary-style travel scene with golden-hour sunlight, authentic environmental details, gentle handheld camera movement, natural colors, cinematic atmosphere, no text or logos.',ratio:'16:9'}
  };
  const safe = (s) => String(s ?? '').replace(/[<>]/g,'').trim();
  function notice(message, error=false){ const n=$('notice'); n.hidden=!message; n.textContent=message||''; n.classList.toggle('error',error); }
  async function refreshToken(force=false){
    if (!force && state.token && Date.now()<state.tokenUntil-60000) return state.token;
    if (state.refreshing) return state.refreshing;
    state.refreshing=(async()=>{const r=await fetch('/v1/auth/refresh',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'}});const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error?.message||'Please sign in to use Video Studio.');state.token=d.access_token;state.tokenUntil=Date.now()+Math.max(60,Number(d.expires_in)||3600)*1000;return state.token;})();
    try{return await state.refreshing;}finally{state.refreshing=null;}
  }
  async function api(path, options={}, retry=true){
    const token=await refreshToken();const headers={Accept:'application/json',...(options.body!==undefined?{'Content-Type':'application/json'}:{}),Authorization:'Bearer '+token,...(options.headers||{})};
    let response=await fetch(path,{...options,headers,credentials:'same-origin'});
    if(response.status===401&&retry){state.token='';await refreshToken(true);return api(path,options,false);}
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error?.message||'The request could not be completed.');
    return data;
  }
  function saveDraft(){
    try{const payload={name:safe($('projectName').value).slice(0,80)||'Untitled video',template:state.template,aspect:$('aspect').value,clips:state.clips.map(c=>({id:c.id,name:c.name,title:c.title||'',kind:c.kind,duration:c.duration,videoId:c.videoId||null,download:c.download||null,createdAt:c.createdAt||null})),generated:state.generated};localStorage.setItem('nasrinai.videoStudio.draft.v1',JSON.stringify(payload));$('saveState').textContent='Draft saved locally';$('checkDraft').textContent='✓';}catch{$('saveState').textContent='Draft could not be saved';}
    updateStats();
  }
  function loadDraft(){try{const d=JSON.parse(localStorage.getItem('nasrinai.videoStudio.draft.v1')||'null');if(!d)return;if(d.name)$('projectName').value=d.name;if(d.aspect)$('aspect').value=d.aspect;if(d.template&&templates[d.template])selectTemplate(d.template,false);state.generated=Array.isArray(d.generated)?d.generated:[];state.clips=Array.isArray(d.clips)?d.clips.filter(c=>c&&typeof c.id==='string').map(c=>({...c,file:null,url:c.download||null})):[];renderTimeline();renderExports();}catch{}}
  function selectTemplate(key,fill=true){if(!templates[key])return;state.template=key;document.querySelectorAll('.template-card').forEach(b=>b.classList.toggle('selected',b.dataset.template===key));const t=templates[key];$('previewTitle').textContent=t.title;$('previewSub').textContent=t.sub;$('previewPlaceholder').hidden=false;$('previewVideo').hidden=true;$('previewVideo').removeAttribute('src');$('previewFormat').textContent=$('aspect').value+' · '+($('aspect').value==='9:16'?'PORTRAIT':'LANDSCAPE');if(fill&&!$('prompt').value.trim())$('prompt').value=t.prompt;if(fill)$('aspect').value=t.ratio;$('previewFrame').classList.toggle('portrait',$('aspect').value==='9:16');$('statStatus').textContent='Draft';$('checkTemplate').textContent='✓';saveDraft();}
  function updateStats(){$('clipCount').textContent=String(state.clips.length);$('statClips').textContent=state.clips.length+' clip'+(state.clips.length===1?'':'s');$('statRatio').textContent=$('aspect').value;$('checkClips').textContent=state.clips.length?'✓':'○';$('timelineSummary').textContent=state.clips.length+' clip'+(state.clips.length===1?'':'s')+' · '+state.clips.reduce((n,c)=>n+(Number(c.duration)||0),0).toFixed(1)+' seconds';}
  function showClip(c){if(!c)return;state.selected=c.id;const video=$('previewVideo');if(c.url){video.src=c.url;video.hidden=false;$('previewPlaceholder').hidden=true;}else{video.hidden=true;$('previewPlaceholder').hidden=false;}$('previewTitle').textContent=c.title||c.name;$('previewSub').textContent=(c.kind==='generated'?'AI-generated clip':c.kind==='upload'?'Uploaded media':'Template card')+' · '+Number(c.duration||0)+'s';$('statStatus').textContent=c.kind==='generated'?'Generated':'Editing';$('inspectorEmpty').hidden=true;$('inspectorContent').hidden=false;$('clipName').value=c.name||'';$('clipTitle').value=c.title||'';$('clipStart').value=c.start||0;$('clipDuration').value=c.duration||8;renderTimeline();}
  function renderTimeline(){
    const root=$('timeline');root.replaceChildren();
    if(!state.clips.length){const empty=document.createElement('div');empty.className='empty-timeline';const i=document.createElement('span');i.textContent='▤';const b=document.createElement('b');b.textContent='Your timeline is waiting';const p=document.createElement('p');p.textContent='Generate a scene or add media to begin.';empty.append(i,b,p);root.append(empty);}
    state.clips.forEach((c,index)=>{const row=document.createElement('div');row.className='clip-row'+(c.id===state.selected?' selected':'');const num=document.createElement('span');num.className='clip-num';num.textContent=String(index+1).padStart(2,'0');const thumb=document.createElement(c.kind==='generated'&&c.url?'video':'div');thumb.className='clip-thumb';if(thumb.tagName==='VIDEO'){thumb.src=c.url;thumb.muted=true;thumb.playsInline=true;}else thumb.textContent=c.kind==='upload'?'MEDIA':'✦';const info=document.createElement('div');info.className='clip-info';const title=document.createElement('b');title.textContent=c.name||'Untitled clip';const meta=document.createElement('small');meta.textContent=(c.kind==='generated'?'AI scene':c.kind==='upload'?'Uploaded asset':'Template')+' · '+Number(c.duration||0)+'s';info.append(title,meta);const actions=document.createElement('div');actions.className='clip-actions';[['↑',()=>moveClip(index,-1)],['↓',()=>moveClip(index,1)],['Edit',()=>showClip(c)]].forEach(([label,fn])=>{const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.setAttribute('aria-label',label==='↑'?'Move clip up':label==='↓'?'Move clip down':'Edit clip');btn.addEventListener('click',e=>{e.stopPropagation();fn();});actions.append(btn);});row.append(num,thumb,info,actions);row.addEventListener('click',()=>showClip(c));root.append(row);});
    updateStats();
  }
  function moveClip(index,delta){const to=index+delta;if(to<0||to>=state.clips.length)return;[state.clips[index],state.clips[to]]=[state.clips[to],state.clips[index]];renderTimeline();saveDraft();}
  function addClip(clip){state.clips.push(clip);showClip(clip);renderTimeline();saveDraft();notice('Added to your timeline.');}
  async function generate(){
    const prompt=safe($('prompt').value);if(prompt.length<8){notice('Describe the scene in a little more detail first.',true);return;}
    const button=$('generate');button.disabled=true;button.textContent='Starting generation…';notice('Checking your account and starting the video job…');
    try{
      const job=await api('/v1/videos',{method:'POST',body:JSON.stringify({prompt,seconds:Number($('duration').value),aspect_ratio:$('aspect').value})});
      if(!job.video_id)throw new Error('The video job did not return an identifier.');
      notice('Scene generation started. This can take a few minutes; you can stay here while it finishes.');
      let status=job;
      for(let i=0;i<90;i++){
        if(i>0)await new Promise(resolve=>setTimeout(resolve,4000));
        status=await api('/v1/videos/'+encodeURIComponent(job.video_id));
        if(status.status==='completed')break;
        if(status.status==='failed')throw new Error(status.error?.message||'Video generation failed. Try a different prompt.');
        notice('Generating your scene… '+Math.max(1,Number(status.progress)||0)+'%');
      }
      if(status.status!=='completed')throw new Error('Generation is still processing. Return to Video Studio later and check your video in chat history.');
      const item={id:job.video_id,name:templates[state.template].title+' · AI scene',kind:'generated',duration:Number(status.target_seconds)||Number($('duration').value),videoId:job.video_id,download:'/v1/videos/'+encodeURIComponent(job.video_id)+'/content',url:'/v1/videos/'+encodeURIComponent(job.video_id)+'/content',createdAt:new Date().toISOString()};
      state.generated=[item,...state.generated.filter(x=>x.videoId!==item.videoId)];addClip(item);renderExports();notice('Your AI scene is ready and has been added to the timeline.');$('statStatus').textContent='Generated';switchTab('edit');
    }catch(err){notice(err.message||'Could not generate this scene.',true);}finally{button.disabled=false;button.innerHTML='<span>✦</span> Generate scene';}
  }
  function renderExports(){const root=$('exports');root.replaceChildren();if(!state.generated.length){const p=document.createElement('p');p.className='empty-copy';p.textContent='No generated clips yet. Create a scene to see it here.';root.append(p);return;}state.generated.forEach(c=>{const row=document.createElement('div');row.className='export-item';const title=document.createElement('b');title.textContent=c.name||'Generated scene';const a=document.createElement('a');a.href=c.download;a.textContent='Download MP4 ↓';a.setAttribute('download','nasrinai-scene.mp4');a.addEventListener('click',async e=>{e.preventDefault();try{const r=await fetch(c.download,{headers:{Authorization:'Bearer '+await refreshToken()},credentials:'same-origin'});if(!r.ok)throw new Error('Please sign in again to download this clip.');const blob=await r.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='nasrinai-scene.mp4';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(err){notice(err.message,true);}});row.append(title,a);root.append(row);});}
  function switchTab(name){document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));$('createPanel').hidden=name!=='create';$('editPanel').hidden=name!=='edit';$('exportPanel').hidden=name!=='export';if(name==='export')renderExports();window.scrollTo({top:0,behavior:'smooth'});}
  document.querySelectorAll('.template-card').forEach(b=>b.addEventListener('click',()=>selectTemplate(b.dataset.template)));
  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  $('generate').addEventListener('click',generate);
  $('addTemplate').addEventListener('click',()=>addClip({id:crypto.randomUUID(),name:templates[state.template].title,kind:'template',duration:8,title:'',start:0,url:null}));
  $('aspect').addEventListener('change',()=>{$('previewFormat').textContent=$('aspect').value+' · '+($('aspect').value==='9:16'?'PORTRAIT':'LANDSCAPE');$('previewFrame').classList.toggle('portrait',$('aspect').value==='9:16');saveDraft();});
  $('saveProject').addEventListener('click',()=>{saveDraft();notice('Draft saved in this browser. Cloud sync is not enabled yet.');});
  $('projectName').addEventListener('change',saveDraft);
  $('addMedia').addEventListener('click',()=>$('mediaInput').click());
  $('mediaInput').addEventListener('change',()=>{for(const file of Array.from($('mediaInput').files||[])){if(file.size>100*1024*1024){notice(file.name+' is larger than the 100 MB browser upload limit.',true);continue;}const url=URL.createObjectURL(file);state.objectUrls.set(url,true);addClip({id:crypto.randomUUID(),name:file.name,kind:'upload',duration:file.type.startsWith('audio/')?30:8,title:'',start:0,url,file});} $('mediaInput').value='';});
  $('clipName').addEventListener('change',()=>updateSelected({name:safe($('clipName').value).slice(0,100)}));
  $('clipTitle').addEventListener('change',()=>updateSelected({title:safe($('clipTitle').value).slice(0,140)}));
  $('clipStart').addEventListener('change',()=>updateSelected({start:Math.max(0,Math.min(3600,Number($('clipStart').value)||0))}));
  $('clipDuration').addEventListener('change',()=>updateSelected({duration:Math.max(.5,Math.min(60,Number($('clipDuration').value)||8))}));
  function updateSelected(patch){const c=state.clips.find(x=>x.id===state.selected);if(!c)return;Object.assign(c,patch);renderTimeline();saveDraft();if(patch.name||patch.title)showClip(c);}
  $('removeClip').addEventListener('click',()=>{state.clips=state.clips.filter(c=>c.id!==state.selected);state.selected=null;$('inspectorContent').hidden=true;$('inspectorEmpty').hidden=false;renderTimeline();saveDraft();notice('Clip removed from the timeline.');});
  $('clearTimeline').addEventListener('click',()=>{state.clips=[];state.selected=null;$('inspectorContent').hidden=true;$('inspectorEmpty').hidden=false;renderTimeline();saveDraft();});
  $('backToEdit').addEventListener('click',()=>switchTab('edit'));
  loadDraft();selectTemplate(state.template,false);renderTimeline();renderExports();
  refreshToken().then(()=>{$('saveState').textContent='Signed in · local draft';}).catch(()=>{$('saveState').textContent='Sign in required for AI generation';notice('Sign in to NasrinAI in this browser to generate video. You can still explore the template gallery.',true);});
})();