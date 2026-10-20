(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { template:'cinematic', clips:[], selected:null, generated:[], cloudProjectId:null, cloudVersion:null, token:'', tokenUntil:0, refreshing:null, objectUrls:new Map(), undoStack:[], redoStack:[] };
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
    try{const payload={name:safe($('projectName').value).slice(0,80)||'Untitled video',template:state.template,aspect:$('aspect').value,cloudProjectId:state.cloudProjectId,cloudVersion:state.cloudVersion,clips:state.clips.map(c=>({id:c.id,name:c.name,title:c.title||'',kind:c.kind,duration:c.duration,start:c.start||0,position:c.position||0,track:c.track||inferTrack(c),transition:c.transition||'cut',filter:c.filter||'none',opacity:c.opacity??100,gain:c.gain??100,keyframes:Array.isArray(c.keyframes)?c.keyframes:[],videoId:c.videoId||null,assetId:c.assetId||null,mediaType:c.mediaType||c.file?.type||null,download:c.download||null,createdAt:c.createdAt||null})),generated:state.generated};localStorage.setItem('nasrinai.videoStudio.draft.v1',JSON.stringify(payload));$('saveState').textContent='Draft saved locally';$('checkDraft').textContent='✓';}catch{$('saveState').textContent='Draft could not be saved';}
    updateStats();
  }
  function loadDraft(){try{const d=JSON.parse(localStorage.getItem('nasrinai.videoStudio.draft.v1')||'null');if(!d)return;if(d.name)$('projectName').value=d.name;if(d.aspect)$('aspect').value=d.aspect;if(typeof d.prompt==='string')$('prompt').value=d.prompt.slice(0,1800);state.cloudProjectId=typeof d.cloudProjectId==='string'?d.cloudProjectId:null;state.cloudVersion=Number.isInteger(d.cloudVersion)?d.cloudVersion:null;if(d.template&&templates[d.template])selectTemplate(d.template,false);state.generated=Array.isArray(d.generated)?d.generated:[];state.clips=Array.isArray(d.clips)?d.clips.filter(c=>c&&typeof c.id==='string').map(c=>({...c,file:null,url:c.kind==='generated'?null:(c.download||null),track:c.track||inferTrack(c),position:Number.isFinite(Number(c.position))?Math.max(0,Number(c.position)):0,transition:c.transition||'cut',filter:c.filter||'none',opacity:Number.isFinite(Number(c.opacity))?Number(c.opacity):100,gain:Number.isFinite(Number(c.gain))?Number(c.gain):100,keyframes:Array.isArray(c.keyframes)?c.keyframes.filter(k=>k&&Number.isFinite(Number(k.time))).map(k=>({time:Math.max(0,Number(k.time)),opacity:Math.max(0,Math.min(100,Number(k.opacity??100))),scale:Math.max(.5,Math.min(2,Number(k.scale??1)))})):[]})):[];renderTimeline();renderExports();}catch{}}
  function clearAuxPreview(){if(typeof previewSession!=='undefined'&&previewSession)stopTimelinePreview();document.querySelectorAll('[data-studio-media-preview]').forEach(node=>node.remove());$('previewVideo').hidden=true;$('previewVideo').removeAttribute('src');}
  function selectTemplate(key,fill=true){if(!templates[key])return;clearAuxPreview();state.template=key;document.querySelectorAll('.template-card').forEach(b=>b.classList.toggle('selected',b.dataset.template===key));const t=templates[key];$('previewTitle').textContent=t.title;$('previewSub').textContent=t.sub;$('previewPlaceholder').hidden=false;$('previewVideo').hidden=true;$('previewVideo').removeAttribute('src');$('previewFormat').textContent=$('aspect').value+' · '+($('aspect').value==='9:16'?'PORTRAIT':'LANDSCAPE');if(fill&&!$('prompt').value.trim())$('prompt').value=t.prompt;if(fill)$('aspect').value=t.ratio;$('previewFrame').classList.toggle('portrait',$('aspect').value==='9:16');if($('statStatus'))$('statStatus').textContent='Draft';$('checkTemplate').textContent='✓';saveDraft();}
  function inferTrack(c){const type=String(c?.mediaType||c?.file?.type||'').toLowerCase();if(c?.track)return c.track;if(c?.kind==='audio'||type.startsWith('audio/'))return 'audio';if(c?.kind==='text')return 'text';if(c?.kind==='overlay'||c?.title)return 'overlay';return 'video';}
  function formatTime(seconds){const s=Math.max(0,Math.round(Number(seconds)||0));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
  function updateStats(){if($('clipCount'))$('clipCount').textContent=String(state.clips.length);if($('editorClipCount'))$('editorClipCount').textContent=String(state.clips.length);if($('binMediaCount'))$('binMediaCount').textContent=String(state.clips.length);if($('editorProjectLabel'))$('editorProjectLabel').textContent=safe($('projectName').value)||'Untitled video';if($('editorAspectLabel'))$('editorAspectLabel').textContent=$('aspect').value;if($('statClips'))$('statClips').textContent=state.clips.length+' clip'+(state.clips.length===1?'':'s');if($('statRatio'))$('statRatio').textContent=$('aspect').value;if($('checkClips'))$('checkClips').textContent=state.clips.length?'✓':'○';if($('timelineSummary'))$('timelineSummary').textContent='00:00 / '+formatTime(state.clips.reduce((end,c)=>Math.max(end,(Number(c.position)||0)+(Number(c.duration)||0)),0));}
  async function showClip(c){
    if(!c)return;
    if(previewSession)stopTimelinePreview();
    state.selected=c.id;
    let clipUrl=c.url;
    if(!clipUrl&&((c.kind==='generated'&&c.download)||c.assetId)){
      try{clipUrl=await resolveClipSource(c);c.url=clipUrl;state.objectUrls.set(clipUrl,true);}
      catch(err){notice(err.message||'Could not load this media preview.',true);}
    }
    clearAuxPreview();
    const video=$('previewVideo');
    const mediaType=String(c.mediaType||c.file?.type||'').toLowerCase();
    const isImage=c.kind==='image'||mediaType.startsWith('image/');
    const isAudio=c.kind==='audio'||mediaType.startsWith('audio/');
    if(clipUrl&&isImage){
      const img=document.createElement('img');img.dataset.studioMediaPreview='true';img.src=clipUrl;img.alt=c.name||'Uploaded image';img.className='studio-media-preview';img.style.filter=({none:'none',cinematic:'contrast(1.12) saturate(.88)',warm:'sepia(.18) saturate(1.15)',cool:'saturate(.88) hue-rotate(8deg)',mono:'grayscale(1)',vivid:'saturate(1.35) contrast(1.05)'})[c.filter||'none'];img.style.opacity=String(Number(c.opacity??100)/100);$('previewFrame').append(img);$('previewPlaceholder').hidden=true;
    }else if(clipUrl&&isAudio){
      const audio=document.createElement('audio');audio.dataset.studioMediaPreview='true';audio.src=clipUrl;audio.controls=true;audio.preload='metadata';audio.className='studio-media-preview studio-audio-preview';$('previewFrame').append(audio);$('previewPlaceholder').hidden=false;
    }else if(clipUrl){
      video.src=clipUrl;video.style.filter=({none:'none',cinematic:'contrast(1.12) saturate(.88)',warm:'sepia(.18) saturate(1.15)',cool:'saturate(.88) hue-rotate(8deg)',mono:'grayscale(1)',vivid:'saturate(1.35) contrast(1.05)'})[c.filter||'none'];video.style.opacity=String(Number(c.opacity??100)/100);video.hidden=false;$('previewPlaceholder').hidden=true;
    }else if(c.track==='text'||c.kind==='text'){
      const caption=document.createElement('div');caption.dataset.studioMediaPreview='true';caption.className='studio-caption-preview';caption.textContent=c.title||c.name||'Caption';$('previewFrame').append(caption);$('previewPlaceholder').hidden=true;
    }else{
      video.hidden=true;video.removeAttribute('src');$('previewPlaceholder').hidden=false;
    }
    $('previewTitle').textContent=c.title||c.name;
    $('previewSub').textContent=(c.kind==='generated'?'AI-generated clip':c.kind==='upload'?'Uploaded media':'Template card')+' · '+Number(c.duration||0)+'s';
    if($('statStatus'))$('statStatus').textContent=c.kind==='generated'?'Generated':'Editing';
    $('inspectorEmpty').hidden=true;$('inspectorContent').hidden=false;
    $('clipName').value=c.name||'';$('clipTitle').value=c.title||'';$('clipTrack').value=c.track||inferTrack(c);$('clipPosition').value=Number(c.position)||0;$('clipStart').value=c.start||0;$('clipDuration').value=c.duration||8;$('clipTransition').value=c.transition||'cut';$('clipFilter').value=c.filter||'none';$('clipOpacity').value=Number(c.opacity??100);$('clipOpacityValue').textContent=Number(c.opacity??100)+'%';$('clipGain').value=Number(c.gain??100);$('clipGainValue').textContent=Number(c.gain??100)+'%';$('keyframeTime').value=0;$('keyframeOpacity').value=Number(c.opacity??100);$('keyframeOpacityValue').textContent=Number(c.opacity??100)+'%';$('keyframeScale').value=100;$('keyframeScaleValue').textContent='100%';
    renderTimeline();
  }
  function renderTimeline(){
    const root=$('timeline');root.replaceChildren();
    const bin=$('mediaBinItems');bin.replaceChildren();
    if(!state.clips.length){const emptyBin=document.createElement('p');emptyBin.className='bin-empty';emptyBin.textContent='Import media or generate a scene to start building your edit.';bin.append(emptyBin);}
    state.clips.forEach((clip,index)=>{const item=document.createElement('button');item.type='button';item.className='bin-media-item'+(clip.id===state.selected?' selected':'');item.addEventListener('click',()=>showClip(clip));const thumb=document.createElement('span');thumb.className='bin-thumb '+(clip.kind==='generated'?'generated':clip.kind==='upload'?'uploaded':'template');thumb.textContent=clip.kind==='generated'?'✦':String(clip.mediaType||clip.file?.type||'').startsWith('audio/')?'♫':String(clip.mediaType||clip.file?.type||'').startsWith('image/')?'▧':'▶';const name=document.createElement('b');name.textContent=clip.name||'Untitled asset';const meta=document.createElement('small');meta.textContent=(clip.kind==='generated'?'AI scene':clip.kind==='upload'?'Imported media':'Template')+' · '+(Number(clip.duration)||0)+'s';item.append(thumb,name,meta);bin.append(item);});
    if(!state.clips.length){const empty=document.createElement('div');empty.className='empty-timeline';const i=document.createElement('span');i.textContent='▤';const b=document.createElement('b');b.textContent='Your timeline is waiting';const p=document.createElement('p');p.textContent='Generate a scene or add media to begin.';empty.append(i,b,p);root.append(empty);}
    const trackLanes=new Map();
    state.clips.forEach((c,index)=>{const trackName=c.track||inferTrack(c);let lane=trackLanes.get(trackName);if(!lane){lane=document.createElement('section');lane.className='timeline-track track-'+trackName;lane.dataset.track=trackName;const label=document.createElement('div');label.className='timeline-track-label';label.textContent=({video:'VIDEO',overlay:'OVERLAY',text:'TEXT',audio:'AUDIO'})[trackName]||trackName.toUpperCase();lane.append(label);const clips=document.createElement('div');clips.className='timeline-track-clips';lane.append(clips);root.append(lane);trackLanes.set(trackName,lane);}const trackClipHost=lane.querySelector('.timeline-track-clips');const row=document.createElement('div');row.className='clip-row'+(c.id===state.selected?' selected':'');row.title='Clip '+(index+1)+': '+(c.name||'Untitled clip');row.draggable=true;row.dataset.clipIndex=String(index);row.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',String(index));e.dataTransfer.effectAllowed='move';});row.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';row.classList.add('drop-target');});row.addEventListener('dragleave',()=>row.classList.remove('drop-target'));row.addEventListener('drop',e=>{e.preventDefault();row.classList.remove('drop-target');const from=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(from)&&from>=0&&from<state.clips.length&&from!==index){recordHistory();const [moved]=state.clips.splice(from,1);state.clips.splice(index,0,moved);renderTimeline();saveDraft();notice('Clip order updated.');}});const num=document.createElement('span');num.className='clip-num';num.textContent=String(index+1).padStart(2,'0');const thumb=document.createElement(c.kind==='generated'&&c.url?'video':'div');thumb.className='clip-thumb';if(thumb.tagName==='VIDEO'){thumb.src=c.url;thumb.muted=true;thumb.playsInline=true;}else thumb.textContent=c.kind==='upload'?'MEDIA':'✦';const info=document.createElement('div');info.className='clip-info';const title=document.createElement('b');title.textContent=c.name||'Untitled clip';const meta=document.createElement('small');meta.textContent=(c.kind==='generated'?'AI scene':c.kind==='upload'?'Uploaded asset':'Template')+' · '+Number(c.duration||0)+'s';info.append(title,meta);const actions=document.createElement('div');actions.className='clip-actions';[['↑',()=>moveClip(index,-1)],['↓',()=>moveClip(index,1)],['Edit',()=>showClip(c)]].forEach(([label,fn])=>{const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.setAttribute('aria-label',label==='↑'?'Move clip up':label==='↓'?'Move clip down':'Edit clip');btn.addEventListener('click',e=>{e.stopPropagation();fn();});actions.append(btn);});const trimLeft=document.createElement('button');trimLeft.type='button';trimLeft.className='clip-trim-handle trim-left';trimLeft.setAttribute('aria-label','Trim clip start');trimLeft.title='Drag to trim the clip start';const trimRight=document.createElement('button');trimRight.type='button';trimRight.className='clip-trim-handle trim-right';trimRight.setAttribute('aria-label','Trim clip end');trimRight.title='Drag to trim the clip end';const beginTrim=(event,edge)=>{if(event.button!==undefined&&event.button!==0)return;event.preventDefault();event.stopPropagation();recordHistory();const originX=event.clientX,base={start:Number(c.start)||0,position:Number(c.position)||0,duration:Number(c.duration)||8};const move=e=>{const delta=(e.clientX-originX)/34;if(edge==='left'){const d=Math.max(-Math.min(base.start,base.position),Math.min(base.duration-.1,delta));c.start=Math.max(0,base.start+d);c.position=Math.max(0,base.position+d);c.duration=Math.max(.1,base.duration-d);}else c.duration=Math.max(.1,Math.min(3600,base.duration+delta));row.style.flexBasis=Math.max(132,Math.min(520,c.duration*34))+'px';row.style.marginInlineStart=Math.min(3600,Math.max(0,Number(c.position)||0))*12+'px';meta.textContent=(c.kind==='generated'?'AI scene':c.kind==='upload'?'Uploaded asset':c.kind==='text'?'Caption':'Media')+' · '+Number(c.duration).toFixed(1)+'s';};const done=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',done);document.removeEventListener('pointercancel',done);renderTimeline();saveDraft();};document.addEventListener('pointermove',move);document.addEventListener('pointerup',done,{once:true});document.addEventListener('pointercancel',done,{once:true});};trimLeft.addEventListener('pointerdown',e=>beginTrim(e,'left'));trimRight.addEventListener('pointerdown',e=>beginTrim(e,'right'));row.append(num,thumb,info,actions,trimLeft,trimRight);row.style.flexBasis=Math.max(132,Math.min(520,(Number(c.duration)||1)*34))+'px';row.style.marginInlineStart=Math.min(3600,Math.max(0,Number(c.position)||0))*12+'px';row.style.opacity=String(Math.max(.25,Math.min(1,Number(c.opacity??100)/100)));row.dataset.transition=c.transition||'cut';row.dataset.filter=c.filter||'none';row.addEventListener('click',()=>showClip(c));trackClipHost.append(row);});
    updateStats();
  }
  function historyFrame(){return {clips:state.clips.map(c=>({...c})),selected:state.selected};}
  function updateHistoryButtons(){if($('undoAction'))$('undoAction').disabled=!state.undoStack.length;if($('redoAction'))$('redoAction').disabled=!state.redoStack.length;}
  function recordHistory(){state.undoStack.push(historyFrame());if(state.undoStack.length>60)state.undoStack.shift();state.redoStack=[];updateHistoryButtons();}
  function restoreHistory(frame){state.clips=frame.clips.map(c=>({...c}));state.selected=frame.selected&&state.clips.some(c=>c.id===frame.selected)?frame.selected:null;renderTimeline();const clip=state.clips.find(c=>c.id===state.selected);if(clip)showClip(clip);else{$('inspectorContent').hidden=true;$('inspectorEmpty').hidden=false;}saveDraft();updateHistoryButtons();}
  function undoEdit(){if(!state.undoStack.length)return;state.redoStack.push(historyFrame());restoreHistory(state.undoStack.pop());notice('Last edit undone.');}
  function redoEdit(){if(!state.redoStack.length)return;state.undoStack.push(historyFrame());restoreHistory(state.redoStack.pop());notice('Edit restored.');}
  function moveClip(index,delta){const to=index+delta;if(to<0||to>=state.clips.length)return;recordHistory();[state.clips[index],state.clips[to]]=[state.clips[to],state.clips[index]];renderTimeline();saveDraft();}
  function addClip(clip){recordHistory();clip.track=clip.track||inferTrack(clip);clip.position=Number.isFinite(Number(clip.position))?Math.max(0,Number(clip.position)):state.clips.filter(c=>(c.track||inferTrack(c))===clip.track).reduce((end,c)=>Math.max(end,(Number(c.position)||0)+(Number(c.duration)||0)),0);clip.transition=clip.transition||'cut';clip.filter=clip.filter||'none';clip.opacity=Number(clip.opacity??100);clip.gain=Number(clip.gain??100);state.clips.push(clip);showClip(clip);renderTimeline();saveDraft();notice('Added to your timeline.');}
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
      const item={id:job.video_id,name:templates[state.template].title+' · AI scene',kind:'generated',duration:Number(status.target_seconds)||Number($('duration').value),videoId:job.video_id,download:'/v1/videos/'+encodeURIComponent(job.video_id)+'/content',url:null,createdAt:new Date().toISOString()};
      state.generated=[item,...state.generated.filter(x=>x.videoId!==item.videoId)];addClip(item);renderExports();notice('Your AI scene is ready and has been added to the timeline.');$('statStatus').textContent='Generated';switchTab('edit');
    }catch(err){notice(err.message||'Could not generate this scene.',true);}finally{button.disabled=false;button.innerHTML='<span>✦</span> Generate scene';}
  }
  function renderExports(){const root=$('exports');root.replaceChildren();if(!state.generated.length){const p=document.createElement('p');p.className='empty-copy';p.textContent='No generated clips yet. Create a scene to see it here.';root.append(p);return;}state.generated.forEach(c=>{const row=document.createElement('div');row.className='export-item';const title=document.createElement('b');title.textContent=c.name||'Generated scene';const a=document.createElement('a');a.href=c.download;a.textContent='Download MP4 ↓';a.setAttribute('download','nasrinai-scene.mp4');a.addEventListener('click',async e=>{e.preventDefault();try{const r=await fetch(c.download,{headers:{Authorization:'Bearer '+await refreshToken()},credentials:'same-origin'});if(!r.ok)throw new Error('Please sign in again to download this clip.');const blob=await r.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='nasrinai-scene.mp4';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(err){notice(err.message,true);}});row.append(title,a);root.append(row);});}
  function switchTab(name){const targets={create:$('createPanel'),edit:$('editPanel'),export:$('exportPanel')};document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));$('createPanel').hidden=false;$('editPanel').hidden=false;$('exportPanel').hidden=false;document.body.classList.add('editor-mode');$('editorProjectLabel').textContent=safe($('projectName').value)||'Untitled video';$('editorAspectLabel').textContent=$('aspect').value;$('editorClipCount').textContent=String(state.clips.length);if(name==='export')renderExports();const target=targets[name];if(target)target.scrollIntoView({behavior:'smooth',block:'start'});}
  $('undoAction').addEventListener('click',undoEdit);$('redoAction').addEventListener('click',redoEdit);document.addEventListener('keydown',event=>{const key=event.key.toLowerCase();if((event.metaKey||event.ctrlKey)&&key==='z'){event.preventDefault();if(event.shiftKey)redoEdit();else undoEdit();}else if((event.metaKey||event.ctrlKey)&&key==='y'){event.preventDefault();redoEdit();}});
  document.querySelectorAll('.template-card').forEach(b=>b.addEventListener('click',()=>selectTemplate(b.dataset.template)));
  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  $('generate').addEventListener('click',generate);
  $('addTemplate').addEventListener('click',()=>addClip({id:crypto.randomUUID(),name:templates[state.template].title,kind:'template',duration:8,title:'',start:0,url:null}));
  $('aspect').addEventListener('change',()=>{$('previewFormat').textContent=$('aspect').value+' · '+($('aspect').value==='9:16'?'PORTRAIT':'LANDSCAPE');$('previewFrame').classList.toggle('portrait',$('aspect').value==='9:16');saveDraft();});
  function cloudDocument(){
    return {template:state.template,aspect:$('aspect').value,prompt:safe($('prompt').value).slice(0,1800),
      clips:state.clips.map(c=>({id:c.id,name:safe(c.name).slice(0,120),title:safe(c.title||'').slice(0,200),kind:c.kind,duration:Number(c.duration)||0,start:Number(c.start)||0,position:Number(c.position)||0,track:c.track||inferTrack(c),transition:c.transition||'cut',filter:c.filter||'none',opacity:Number(c.opacity??100),gain:Number(c.gain??100),keyframes:Array.isArray(c.keyframes)?c.keyframes:[],videoId:c.videoId||null,assetId:c.assetId||null,mediaType:c.mediaType||c.file?.type||null,download:c.download||null,createdAt:c.createdAt||null})),
      generated:state.generated.map(c=>({id:c.id||c.videoId,name:safe(c.name).slice(0,120),videoId:c.videoId||null,status:'completed'}))};
  }
  function applyCloudProject(project){
    const d=project.document||{};
    state.cloudProjectId=project.id;state.cloudVersion=project.version;
    $('projectName').value=safe(project.name).slice(0,80)||'Untitled video';
    if(d.aspect)$('aspect').value=d.aspect;
    if(typeof d.prompt==='string')$('prompt').value=d.prompt.slice(0,1800);
    if(d.template&&templates[d.template])state.template=d.template;
    state.generated=Array.isArray(d.generated)?d.generated.filter(g=>g.videoId).map(g=>({...g,download:'/v1/videos/'+encodeURIComponent(g.videoId)+'/content'})):[];
    state.clips=Array.isArray(d.clips)?d.clips.map(c=>({...c,file:null,url:null,track:c.track||inferTrack(c),position:Number(c.position)||0,transition:c.transition||'cut',filter:c.filter||'none',opacity:Number(c.opacity??100),gain:Number(c.gain??100),keyframes:Array.isArray(c.keyframes)?c.keyframes:[],download:c.videoId&&c.kind==='generated'?'/v1/videos/'+encodeURIComponent(c.videoId)+'/content':null})): [];
    state.selected=null;$('inspectorContent').hidden=true;$('inspectorEmpty').hidden=false;
    selectTemplate(state.template,false);renderTimeline();renderExports();saveDraft();
    $('saveState').textContent='Cloud project saved';notice('Cloud project opened.');
  }
  async function saveCloudProject(){
    const button=$('saveProject');button.disabled=true;button.textContent='Saving…';
    try{
      const name=safe($('projectName').value).slice(0,80)||'Untitled video';
      // Upload local media bytes first; only then save stable asset IDs in project metadata.
      for(const clip of state.clips){
        if(clip.kind!=='upload'||clip.assetId||!(clip.file instanceof Blob))continue;
        const file=clip.file;
        const signed=await api('/v1/video-studio/assets',{method:'POST',body:JSON.stringify({name:file.name||clip.name,type:file.type||clip.mediaType||'application/octet-stream',size:file.size})});
        const uploaded=await fetch(signed.upload_url,{method:'PUT',headers:{'Content-Type':file.type||clip.mediaType||'application/octet-stream'},body:file,credentials:'omit'});
        if(!uploaded.ok){try{await api('/v1/video-studio/assets/'+encodeURIComponent(signed.id),{method:'DELETE'});}catch{}throw new Error('Could not upload '+(file.name||clip.name)+' to cloud storage. Your local draft remains available.');}
        clip.assetId=signed.id;clip.mediaType=file.type||clip.mediaType||'application/octet-stream';
      }
      const body={name,document:cloudDocument(),...(state.cloudVersion?{expected_version:state.cloudVersion}:{})};
      const response=state.cloudProjectId
        ? await api('/v1/video-studio/projects/'+encodeURIComponent(state.cloudProjectId),{method:'PUT',body:JSON.stringify(body)})
        : await api('/v1/video-studio/projects',{method:'POST',body:JSON.stringify(body)});
      const project=response.project;if(!project?.id)throw new Error('The cloud save did not return a project.');
      state.cloudProjectId=project.id;state.cloudVersion=project.version;saveDraft();
      $('saveState').textContent='Saved to cloud';notice('Project saved to your NasrinAI account.');
    }catch(error){saveDraft();$('saveState').textContent='Local draft saved';notice((error.message||'Cloud save failed.')+' Your local draft is still available.',true);}
    finally{button.disabled=false;button.textContent='Save to cloud';}
  }
  async function openCloudProject(){
    const button=$('openCloudProject');button.disabled=true;
    try{
      const response=await api('/v1/video-studio/projects');
      const items=Array.isArray(response.projects)?response.projects:[];
      if(!items.length){notice('No cloud projects found for this account.');return;}
      const menu=items.map((p,i)=>(i+1)+'. '+p.name+' · '+new Date(p.updatedAt).toLocaleDateString()).join('\\n');
      const answer=prompt('Choose a cloud project number to open:\\n'+menu,'1');
      if(answer===null)return;
      const index=Number(answer)-1;if(!Number.isInteger(index)||index<0||index>=items.length)throw new Error('Choose a number from the list.');
      const result=await api('/v1/video-studio/projects/'+encodeURIComponent(items[index].id));
      applyCloudProject(result.project);
    }catch(error){notice(error.message||'Could not open cloud projects.',true);}
    finally{button.disabled=false;}
  }
  $('saveProject').addEventListener('click',saveCloudProject);
  $('openCloudProject').addEventListener('click',openCloudProject);
  $('continueInChat').addEventListener('click',()=>{
    const project={
      source:'NasrinAI Video Studio',
      name:safe($('projectName').value).slice(0,80)||'Untitled video',
      template:state.template,
      aspect:$('aspect').value,
      prompt:safe($('prompt').value).slice(0,1800),
      clips:state.clips.slice(0,30).map((c,i)=>({order:i+1,name:safe(c.name).slice(0,100),kind:c.kind,duration:Number(c.duration)||0,title:safe(c.title||'').slice(0,140),video_id:c.videoId||null})),
      generated:state.generated.slice(0,20).map(c=>({name:safe(c.name).slice(0,100),video_id:c.videoId||null,duration:Number(c.duration)||0})),
      note:'This is a project brief shared from the current Studio browser draft. Media files themselves are not attached. Help me continue planning or editing this video in chat.'
    };
    const encoded=encodeURIComponent(JSON.stringify(project));
    if(encoded.length>7000){notice('This project brief is too large to transfer at once. Remove some timeline clips and try again.',true);return;}
    saveDraft();
    window.open('https://nasrinai.com/#studio_context='+encoded,'_blank','noopener,noreferrer');
  });
  $('projectName').addEventListener('change',()=>{saveDraft();$('editorProjectLabel').textContent=safe($('projectName').value)||'Untitled video';});
  $('addMedia').addEventListener('click',()=>$('mediaInput').click());
  $('importMediaBin').addEventListener('click',()=>$('mediaInput').click());
  $('binImportButton').addEventListener('click',()=>$('mediaInput').click());
  $('editorSave').addEventListener('click',()=>$('saveProject').click());
  $('editorCreate').addEventListener('click',()=>switchTab('create'));
  function activateEditorTool(name){document.querySelectorAll('[data-editor-tool]').forEach(button=>button.classList.toggle('active',button.dataset.editorTool===name));}
  document.querySelector('[data-editor-tool="media"]').addEventListener('click',()=>{activateEditorTool('media');$('mediaBinItems').scrollIntoView({block:'nearest'});});
  $('toolExport').addEventListener('click',()=>{activateEditorTool('export');switchTab('export');});
  $('toolText').addEventListener('click',()=>{activateEditorTool('text');const clip=state.clips.find(x=>x.id===state.selected);if(!clip){notice('Select a timeline clip first to add a title.',true);return;}showClip(clip);$('clipTitle').focus();notice('Add your title in Clip details on the right.');});
  $('toolAudio').addEventListener('click',()=>{activateEditorTool('audio');$('mediaInput').click();});
  $('mediaInput').addEventListener('change',()=>{for(const file of Array.from($('mediaInput').files||[])){if(file.size>100*1024*1024){notice(file.name+' is larger than the 100 MB browser upload limit.',true);continue;}const url=URL.createObjectURL(file);state.objectUrls.set(url,true);addClip({id:crypto.randomUUID(),name:file.name,kind:'upload',mediaType:file.type||'application/octet-stream',duration:file.type.startsWith('audio/')?30:8,title:'',start:0,url,file});} $('mediaInput').value='';});
  $('addCaption').addEventListener('click',()=>{recordHistory();const clip={id:crypto.randomUUID(),name:'Caption',title:'Your caption',kind:'text',track:'text',mediaType:'text/plain',duration:3,start:0,position:state.clips.length?Math.max(...state.clips.map(c=>(Number(c.position)||0)+(Number(c.duration)||0))):0,transition:'fade',filter:'none',opacity:100,gain:100,url:null};state.clips.push(clip);state.selected=clip.id;renderTimeline();showClip(clip);saveDraft();notice('Caption added to the text track. Edit its wording and timing in Clip details.');});
  $('clipName').addEventListener('change',()=>updateSelected({name:safe($('clipName').value).slice(0,100)}));
  $('clipTrack').addEventListener('change',()=>updateSelected({track:$('clipTrack').value}));$('clipPosition').addEventListener('change',()=>updateSelected({position:Math.max(0,Math.min(3600,Number($('clipPosition').value)||0))}));$('clipTransition').addEventListener('change',()=>updateSelected({transition:$('clipTransition').value}));$('clipFilter').addEventListener('change',()=>updateSelected({filter:$('clipFilter').value}));$('clipOpacity').addEventListener('input',()=>{$('clipOpacityValue').textContent=$('clipOpacity').value+'%';updateSelected({opacity:Number($('clipOpacity').value)});});$('clipGain').addEventListener('input',()=>{$('clipGainValue').textContent=$('clipGain').value+'%';updateSelected({gain:Number($('clipGain').value)});});$('keyframeOpacity').addEventListener('input',()=>{$('keyframeOpacityValue').textContent=$('keyframeOpacity').value+'%';});$('keyframeScale').addEventListener('input',()=>{$('keyframeScaleValue').textContent=$('keyframeScale').value+'%';});$('addKeyframe').addEventListener('click',()=>{const clip=state.clips.find(c=>c.id===state.selected);if(!clip)return;recordHistory();const time=Math.max(0,Math.min(Number(clip.duration)||8,Number($('keyframeTime').value)||0));const frame={time,opacity:Number($('keyframeOpacity').value),scale:Number($('keyframeScale').value)/100};clip.keyframes=Array.isArray(clip.keyframes)?clip.keyframes.filter(k=>Math.abs(Number(k.time)-time)>.001):[];clip.keyframes.push(frame);clip.keyframes.sort((a,b)=>a.time-b.time);saveDraft();renderTimeline();notice('Keyframe saved at '+time.toFixed(1)+' seconds.');});
  $('splitClip').addEventListener('click',()=>{const clip=state.clips.find(c=>c.id===state.selected);if(!clip)return;const duration=Number(clip.duration)||0;if(duration<0.2){notice('This clip is too short to split.',true);return;}recordHistory();const first=duration/2;const second={...clip,id:crypto.randomUUID(),name:(clip.name||'Clip')+' (split)',start:(Number(clip.start)||0)+first,position:(Number(clip.position)||0)+first,duration:duration-first,title:clip.title||'',file:clip.file,url:clip.url};clip.duration=first;state.clips.splice(state.clips.indexOf(clip)+1,0,second);state.selected=second.id;renderTimeline();showClip(second);saveDraft();notice('Clip split into two editable segments.');});
  $('clipTitle').addEventListener('change',()=>updateSelected({title:safe($('clipTitle').value).slice(0,140)}));
  $('clipStart').addEventListener('change',()=>updateSelected({start:Math.max(0,Math.min(3600,Number($('clipStart').value)||0))}));
  $('clipDuration').addEventListener('change',()=>updateSelected({duration:Math.max(.5,Math.min(60,Number($('clipDuration').value)||8))}));
  function updateSelected(patch){const c=state.clips.find(x=>x.id===state.selected);if(!c)return;recordHistory();Object.assign(c,patch);renderTimeline();saveDraft();if(patch.name||patch.title)showClip(c);}
  $('removeClip').addEventListener('click',()=>{if(!state.clips.some(c=>c.id===state.selected))return;recordHistory();state.clips=state.clips.filter(c=>c.id!==state.selected);state.selected=null;$('inspectorContent').hidden=true;$('inspectorEmpty').hidden=false;renderTimeline();saveDraft();notice('Clip removed from the timeline.');});
  $('clearTimeline').addEventListener('click',()=>{if(!state.clips.length)return;recordHistory();state.clips=[];state.selected=null;$('inspectorContent').hidden=true;$('inspectorEmpty').hidden=false;renderTimeline();saveDraft();});
  $('backToEdit').addEventListener('click',()=>switchTab('edit'));

  // Dedicated project-aware chat. Uses the same /v1/chat service as the main app;
  // guests receive a scoped guest session and signed-in users use the existing
  // in-memory access token. No API keys or tokens are stored in localStorage.
  const studioChat = { conversationId:null, guestToken:null, busy:false };
  function chatBubble(role, text) {
    const welcome=$('studioChatMessages').querySelector('.studio-chat-welcome');
    if(welcome)welcome.remove();
    const item=document.createElement('div');item.className='studio-chat-message '+role;
    const label=document.createElement('span');label.className='chat-role';label.textContent=role==='user'?'YOU':'NASRINAI';
    const bubble=document.createElement('div');bubble.className='chat-bubble';bubble.textContent=text;
    item.append(label,bubble);$('studioChatMessages').append(item);$('studioChatMessages').scrollTop=$('studioChatMessages').scrollHeight;return bubble;
  }
  async function chatAccessToken(){
    try{return await refreshToken();}
    catch{
      if(studioChat.guestToken)return studioChat.guestToken;
      const response=await fetch('/v1/guest/sessions',{method:'POST',headers:{Accept:'application/json'},credentials:'same-origin'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||typeof data.token!=='string')throw new Error(data.error?.message||'Could not start a chat session. Please sign in and try again.');
      studioChat.guestToken=data.token;return data.token;
    }
  }
  function currentProjectContext(){
    const clips=state.clips.slice(0,20).map((c,i)=>`${i+1}. ${safe(c.name)||'Untitled clip'} (${c.kind}, ${Number(c.duration)||0}s)`).join('\n');
    return ['Current NasrinAI Video Studio project:',`Name: ${safe($('projectName').value)||'Untitled video'}`,`Template: ${state.template}`,`Aspect ratio: ${$('aspect').value}`,`Generation prompt: ${safe($('prompt').value).slice(0,1200)||'(not set)'}`,`Timeline clips:\n${clips||'(none yet)'}`].join('\n');
  }
  async function sendStudioChat(message){
    const textValue=safe(message).slice(0,6000);if(!textValue||studioChat.busy)return;
    $('studioChatInput').value='';chatBubble('user',textValue);studioChat.busy=true;$('studioChatSend').disabled=true;$('studioChatSend').textContent='Thinking…';
    const reply=chatBubble('assistant','Thinking…');
    try{
      const token=await chatAccessToken();
      const body={message:currentProjectContext()+'\n\nUser request: '+textValue,stream:false};
      if(studioChat.conversationId)body.conversation_id=studioChat.conversationId;
      const response=await fetch('/v1/chat',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error?.message||'NasrinAI could not answer right now. Please try again.');
      if(typeof data.conversation_id==='string')studioChat.conversationId=data.conversation_id;
      reply.textContent=String(data.message?.content||data.reply||'I could not create a reply for that message.');
    }catch(error){reply.textContent=error.message||'Chat is temporarily unavailable.';}
    finally{studioChat.busy=false;$('studioChatSend').disabled=false;$('studioChatSend').textContent='Send ↗';$('studioChatMessages').scrollTop=$('studioChatMessages').scrollHeight;$('studioChatInput').focus();}
  }
  $('studioChatToggle').addEventListener('click',()=>{const panel=$('studioChatPanel');const open=panel.hidden;panel.hidden=!open;$('studioChatToggle').setAttribute('aria-expanded',String(open));if(open)$('studioChatInput').focus();});
  $('studioChatClose').addEventListener('click',()=>{$('studioChatPanel').hidden=true;$('studioChatToggle').setAttribute('aria-expanded','false');});
  $('studioChatForm').addEventListener('submit',event=>{event.preventDefault();sendStudioChat($('studioChatInput').value);});
  $('studioChatInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('studioChatForm').requestSubmit();}});
  document.querySelectorAll('[data-chat-suggestion]').forEach(button=>button.addEventListener('click',()=>sendStudioChat(button.dataset.chatSuggestion)));

  let previewSession=null;
  function stopTimelinePreview(){
    if(!previewSession)return;
    cancelAnimationFrame(previewSession.raf);
    previewSession.resources.forEach(r=>{try{if(r.media){r.media.pause();r.media.removeAttribute('src');r.media.load();r.media.remove();}}catch{}});
    previewSession.urls.forEach(url=>URL.revokeObjectURL(url));
    previewSession.canvas.remove();
    previewSession.host.remove();
    previewSession=null;
    const button=$('previewTimeline');if(button){button.textContent='▶ Preview edit';button.setAttribute('aria-pressed','false');}
  }
  async function startTimelinePreview(){
    if(previewSession){stopTimelinePreview();return;}
    if(!state.clips.length){notice('Add clips to the timeline before previewing the edit.',true);return;}
    const button=$('previewTimeline');button.disabled=true;
    const portrait=$('aspect').value==='9:16',width=portrait?540:960,height=portrait?960:540;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.className='studio-composite-preview';canvas.dataset.studioMediaPreview='true';
    const ctx=canvas.getContext('2d');if(!ctx){button.disabled=false;notice('Timeline preview could not initialize.',true);return;}
    const host=document.createElement('div');host.className='studio-preview-media-host';host.setAttribute('aria-hidden','true');document.body.append(host);
    const urls=[],resources=[];let raf=0;
    try{
      const clips=state.clips.map(c=>({...c,track:c.track||inferTrack(c),position:Math.max(0,Number(c.position)||0),duration:Math.max(.1,Number(c.duration)||8),start:Math.max(0,Number(c.start)||0)}));
      const total=Math.max(...clips.map(c=>c.position+c.duration),0);
      for(const clip of clips){
        const type=String(clip.mediaType||clip.file?.type||'').toLowerCase(),isText=clip.kind==='text'||clip.track==='text',isImage=clip.kind==='image'||type.startsWith('image/'),isAudio=clip.track==='audio'||clip.kind==='audio'||type.startsWith('audio/');
        let media=null;
        if(!isText){const url=await resolveClipSource(clip);if(url.startsWith('blob:'))urls.push(url);if(isImage){media=new Image();media.src=url;await waitForMedia(media,'load');}else{media=document.createElement(isAudio?'audio':'video');media.src=url;media.preload='auto';media.playsInline=true;media.volume=Math.max(0,Math.min(1,Number(clip.gain??100)/100));media.style.cssText='position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';host.append(media);await waitForMedia(media,'loadedmetadata');}}
        resources.push({clip,media,isImage,isAudio,active:false});
      }
      $('previewFrame').append(canvas);$('previewPlaceholder').hidden=true;$('previewVideo').hidden=true;
      previewSession={canvas,host,resources,urls,raf:0};button.textContent='■ Stop preview';button.setAttribute('aria-pressed','true');
      const drawCover=(source,opacity,filter,zoom)=>{const sw=source.videoWidth||source.naturalWidth,sh=source.videoHeight||source.naturalHeight;if(!sw||!sh)return;const scale=Math.max(width/sw,height/sh)*zoom,dw=sw*scale,dh=sh*scale;const filters={none:'none',cinematic:'contrast(1.12) saturate(.88)',warm:'sepia(.18) saturate(1.15)',cool:'saturate(.88) hue-rotate(8deg)',mono:'grayscale(1)',vivid:'saturate(1.35) contrast(1.05)'};ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,opacity/100));ctx.filter=filters[filter]||'none';ctx.drawImage(source,(width-dw)/2,(height-dh)/2,dw,dh);ctx.restore();};
      const began=performance.now();
      const tick=now=>{
        if(!previewSession)return;
        const time=Math.min(total,(now-began)/1000);ctx.fillStyle='#08090c';ctx.fillRect(0,0,width,height);
        const active=resources.filter(r=>!r.isAudio&&time>=r.clip.position&&time<r.clip.position+r.clip.duration).sort((a,b)=>({video:0,overlay:1,text:2}[a.clip.track]??0)-({video:0,overlay:1,text:2}[b.clip.track]??0));
        for(const r of resources){if(!r.media||r.isImage)continue;const local=time-r.clip.position,playing=time>=r.clip.position&&time<r.clip.position+r.clip.duration;if(playing){const target=Math.max(0,r.clip.start+local);if(!r.active||Math.abs((r.media.currentTime||0)-target)>.5){try{r.media.currentTime=target;}catch{}}if(!r.active){r.active=true;r.media.play().catch(()=>{});}}else if(r.active){r.active=false;r.media.pause();}}
        for(const r of active){const local=time-r.clip.position;let opacity=Number(r.clip.opacity??100),zoom=1;const frames=Array.isArray(r.clip.keyframes)?r.clip.keyframes.slice().sort((a,b)=>a.time-b.time):[];if(frames.length){const before=[...frames].reverse().find(k=>k.time<=local),after=frames.find(k=>k.time>=local);if(before&&after&&after.time>before.time){const q=(local-before.time)/(after.time-before.time);opacity*=Number(before.opacity??100)/100+(Number(after.opacity??100)-Number(before.opacity??100))/100*q;zoom=Number(before.scale??1)+(Number(after.scale??1)-Number(before.scale??1))*q;}else{const k=before||after;opacity*=Number(k.opacity??100)/100;zoom=Number(k.scale??1);}}
          const fade=Math.min(.6,r.clip.duration/2);if(r.clip.transition==='fade'||r.clip.transition==='dissolve')opacity*=Math.min(1,local/fade,(r.clip.duration-local)/fade);
          if(r.clip.transition==='wipe'&&fade>0){ctx.save();ctx.beginPath();ctx.rect(0,0,width* Math.min(1,local/fade),height);ctx.clip();}
          if(r.isImage)drawCover(r.media,opacity,r.clip.filter,zoom);else if(r.media&&r.media.tagName==='VIDEO'&&r.media.readyState>=2)drawCover(r.media,opacity,r.clip.filter,zoom);
          if(r.clip.title){ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,opacity/100));ctx.fillStyle='#0009';ctx.fillRect(width*.05,height*.76,width*.9,height*.16);ctx.fillStyle='#fff';ctx.textAlign='left';ctx.textBaseline='middle';ctx.font='600 '+Math.round(width*.032*zoom)+'px system-ui';ctx.fillText(String(r.clip.title).slice(0,90),width*.08,height*.84,width*.84);ctx.restore();}
          if(r.clip.transition==='wipe'&&fade>0)ctx.restore();
        }
        if(time>=total){stopTimelinePreview();return;}
        previewSession.raf=requestAnimationFrame(tick);
      };
      previewSession.raf=requestAnimationFrame(tick);
    }catch(error){urls.forEach(url=>URL.revokeObjectURL(url));resources.forEach(r=>{try{r.media?.pause();r.media?.remove();}catch{}});host.remove();canvas.remove();button.textContent='▶ Preview edit';button.setAttribute('aria-pressed','false');notice(error.message||'Could not preview the timeline.',true);}
    finally{button.disabled=false;}
  }
  $('previewTimeline').addEventListener('click',startTimelinePreview);
  let renderObjectUrl=null;
  function waitForMedia(media,event,timeout=15000){
    return new Promise((resolve,reject)=>{
      if((event==='loadedmetadata'&&media.readyState>=1)||(event==='load'&&media.complete&&media.naturalWidth>0))return resolve();
      const timer=setTimeout(()=>{cleanup();reject(new Error('Timed out loading timeline media.'));},timeout);
      const ok=()=>{cleanup();resolve();},bad=()=>{cleanup();reject(new Error('A timeline clip could not be loaded in this browser.'));};
      function cleanup(){clearTimeout(timer);media.removeEventListener(event,ok);media.removeEventListener('error',bad);}
      media.addEventListener(event,ok,{once:true});media.addEventListener('error',bad,{once:true});
    });
  }
  async function resolveClipSource(clip){
    if(clip.file instanceof Blob)return URL.createObjectURL(clip.file);
    if(clip.url&&typeof clip.url==='string')return clip.url;
    if(clip.assetId&&typeof clip.assetId==='string'){
      const asset=await api('/v1/video-studio/assets/'+encodeURIComponent(clip.assetId));
      const response=await fetch(asset.url,{credentials:'omit'});
      if(!response.ok)throw new Error('Could not load this saved media asset. Check your sign-in and try again.');
      return URL.createObjectURL(await response.blob());
    }
    if(clip.download&&typeof clip.download==='string'){
      const response=await fetch(clip.download,{headers:{Authorization:'Bearer '+await refreshToken()},credentials:'same-origin'});
      if(!response.ok)throw new Error('Could not load a generated clip. Reopen the project while signed in and try again.');
      return URL.createObjectURL(await response.blob());
    }
    throw new Error('One or more timeline clips contain browser-local media that is unavailable. Re-add those files before rendering.');
  }
  function drawCover(ctx,source,width,height){
    const sw=source.videoWidth||source.naturalWidth||source.width||width;
    const sh=source.videoHeight||source.naturalHeight||source.height||height;
    if(!sw||!sh)return;
    const scale=Math.max(width/sw,height/sh),dw=sw*scale,dh=sh*scale;
    ctx.drawImage(source,(width-dw)/2,(height-dh)/2,dw,dh);
  }
  async function renderTimelineVideo(){
    const button=$('renderTimeline'),status=$('renderStatus'),progress=$('renderProgress'),link=$('renderDownload');
    if(!state.clips.length){notice('Add at least one clip to the timeline before rendering.',true);return;}
    if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){notice('Timeline rendering is not supported by this browser. Try a recent desktop browser.',true);return;}
    if(state.clips.length>40){notice('This browser renderer supports up to 40 clips per export for stability.',true);return;}
    const clips=state.clips.map(c=>({...c,track:c.track||inferTrack(c),position:Math.max(0,Number(c.position)||0),duration:Math.max(.1,Math.min(3600,Number(c.duration)||8)),start:Math.max(0,Number(c.start)||0)}));
    const total=Math.max(...clips.map(c=>c.position+c.duration),0);
    if(total<=0||total>180){notice('Browser export supports timelines up to 180 seconds. Shorten this project and try again.',true);return;}
    const portrait=$('aspect').value==='9:16',width=portrait?720:1280,height=portrait?1280:720,fps=24;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx){notice('Could not initialize the video compositor.',true);return;}
    const canvasStream=canvas.captureStream(fps);
    let audioContext=null,audioDestination=null,recorder=null,raf=0,blobParts=[];
    const temporaryUrls=[],resources=[];
    button.disabled=true;button.textContent='Preparing renderer…';progress.hidden=false;progress.value=0;link.hidden=true;status.textContent='Preparing all timeline tracks…';
    try{
      const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mime)throw new Error('This browser does not expose a supported recording format for timeline export.');
      audioContext=window.AudioContext?new AudioContext():null;
      audioDestination=audioContext?audioContext.createMediaStreamDestination():null;
      if(audioContext)await audioContext.resume();
      for(let i=0;i<clips.length;i++){
        const clip=clips[i];status.textContent='Loading media '+(i+1)+' of '+clips.length+'…';
        const type=String(clip.mediaType||clip.file?.type||'').toLowerCase();
        const isText=clip.track==='text'||clip.kind==='text';
        const isImage=clip.kind==='image'||type.startsWith('image/');
        const isAudio=clip.track==='audio'||clip.kind==='audio'||type.startsWith('audio/');
        let media=null;
        if(!isText){const sourceUrl=await resolveClipSource(clip);if(sourceUrl.startsWith('blob:'))temporaryUrls.push(sourceUrl);if(isImage){media=new Image();media.src=sourceUrl;await waitForMedia(media,'load');}else{media=document.createElement(isAudio?'audio':'video');media.preload='auto';media.src=sourceUrl;media.playsInline=true;media.crossOrigin='anonymous';media.muted=false;await waitForMedia(media,'loadedmetadata');}}
        const item={clip,media,isImage,isAudio,audioSource:null,gainNode:null,active:false};
        if(audioContext&&media&&!isImage){
          try{item.audioSource=audioContext.createMediaElementSource(media);item.gainNode=audioContext.createGain();item.gainNode.gain.value=Math.max(0,Math.min(2,Number(clip.gain??100)/100));item.audioSource.connect(item.gainNode);item.gainNode.connect(audioDestination);}
          catch{media.muted=true;}
        }
        resources.push(item);
      }
      const output=new MediaStream([...canvasStream.getVideoTracks(),...(audioDestination?audioDestination.stream.getAudioTracks():[])]);
      recorder=new MediaRecorder(output,{mimeType:mime,videoBitsPerSecond:6000000});
      const recorded=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data&&e.data.size)blobParts.push(e.data);};recorder.onerror=()=>reject(new Error('The browser stopped recording unexpectedly.'));recorder.onstop=()=>resolve(new Blob(blobParts,{type:mime}));});
      const drawCover=(source,opacity,filter,zoom=1)=>{
        const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;if(!sw||!sh)return;
        const scale=Math.max(width/sw,height/sh)*Math.max(.5,Math.min(2,zoom)),dw=sw*scale,dh=sh*scale;
        const filters={none:'none',cinematic:'contrast(1.12) saturate(.88)',warm:'sepia(.18) saturate(1.15)',cool:'saturate(.88) hue-rotate(8deg)',mono:'grayscale(1)',vivid:'saturate(1.35) contrast(1.05)'};
        ctx.save();ctx.globalAlpha=Math.max(.0,Math.min(1,opacity/100));ctx.filter=filters[filter]||'none';ctx.drawImage(source,(width-dw)/2,(height-dh)/2,dw,dh);ctx.restore();
      };
      const drawFrame=(time)=>{
        ctx.fillStyle='#08090c';ctx.fillRect(0,0,width,height);
        const active=resources.filter(r=>!r.isAudio&&time>=r.clip.position&&time<r.clip.position+r.clip.duration)
          .sort((a,b)=>({video:0,overlay:1,text:2}[a.clip.track]??0)-({video:0,overlay:1,text:2}[b.clip.track]??0));
        for(const r of active){
          const local=time-r.clip.position,transition=r.clip.transition||'cut';
          const keyframes=Array.isArray(r.clip.keyframes)?r.clip.keyframes.slice().sort((a,b)=>a.time-b.time):[];
          let animatedOpacity=100,zoom=1;
          if(keyframes.length){const before=[...keyframes].reverse().find(k=>Number(k.time)<=local),after=keyframes.find(k=>Number(k.time)>=local);if(before&&after&&after.time>before.time){const ratio=(local-before.time)/(after.time-before.time);animatedOpacity=Number(before.opacity??100)+(Number(after.opacity??100)-Number(before.opacity??100))*ratio;zoom=Number(before.scale??1)+(Number(after.scale??1)-Number(before.scale??1))*ratio;}else{const frame=before||after;animatedOpacity=Number(frame.opacity??100);zoom=Number(frame.scale??1);}}
          let opacity=Number(r.clip.opacity??100)*animatedOpacity/100;
          if(transition==='fade'||transition==='dissolve'){const fade=Math.min(.6,r.clip.duration/2);if(fade>0)opacity*=Math.min(1,local/fade,(r.clip.duration-local)/fade);}
          if(r.clip.transition==='wipe'&&fade>0){ctx.save();ctx.beginPath();ctx.rect(0,0,width*Math.min(1,local/fade),height);ctx.clip();}
          if(r.isImage)drawCover(r.media,opacity,r.clip.filter,zoom);
          else if(r.media&&r.media.readyState>=2&&r.media.tagName==='VIDEO')drawCover(r.media,opacity,r.clip.filter,zoom);
          if(r.clip.transition==='wipe'&&fade>0)ctx.restore();
          if(r.clip.title&&r.clip.track!=='audio'){
            ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,opacity/100));ctx.fillStyle='rgba(0,0,0,.48)';ctx.fillRect(width*.05,height*.76,width*.9,height*.16);ctx.fillStyle='#fff';ctx.font='600 '+Math.round(width*.032*zoom)+'px system-ui';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(String(r.clip.title).slice(0,90),width*.08,height*.84,width*.84);ctx.restore();
          }
        }
        if(!active.length){ctx.fillStyle='#aeb2bd';ctx.font='500 24px system-ui';ctx.textAlign='center';ctx.fillText(' ',width/2,height/2);}
      };
      const startClock=performance.now();
      let lastTime=-1;
      const tick=now=>{
        const time=Math.min(total,(now-startClock)/1000);
        for(const r of resources){
          const local=time-r.clip.position,active=time>=r.clip.position&&time<r.clip.position+r.clip.duration;
          if(r.isImage||!r.media)continue;
          if(active){
            const target=Math.min(Math.max(0,r.clip.start+local),Math.max(0,(Number(r.media.duration)||r.clip.start+local)-.04));
            if(!r.active||Math.abs((r.media.currentTime||0)-target)>.35){try{r.media.currentTime=target;}catch{}}
            if(!r.active){r.active=true;r.media.play().catch(()=>{});}
          }else if(r.active){r.active=false;r.media.pause();}
        }
        drawFrame(time);progress.value=Math.round(time/total*100);status.textContent='Rendering multitrack timeline · '+formatTime(time)+' / '+formatTime(total);
        if(time>=total){resources.forEach(r=>{if(r.media&&!r.isImage)r.media.pause();});recorder.stop();return;}
        lastTime=time;raf=requestAnimationFrame(tick);
      };
      recorder.start(250);await new Promise(resolve=>setTimeout(resolve,100));raf=requestAnimationFrame(tick);
      const blob=await recorded;if(!blob.size)throw new Error('The browser produced an empty video file.');
      if(renderObjectUrl)URL.revokeObjectURL(renderObjectUrl);
      renderObjectUrl=URL.createObjectURL(blob);link.href=renderObjectUrl;
      const extension=mime.includes('mp4')?'mp4':'webm';link.download='nasrinai-timeline.'+extension;link.textContent='Download rendered '+extension.toUpperCase();link.hidden=false;
      status.textContent='Render complete · '+Math.round(blob.size/1024/1024*10)/10+' MB · '+extension.toUpperCase()+'. Play the file back before sharing.';
      notice('Multitrack render completed. Download and review the exported video.');
    }catch(error){if(recorder&&recorder.state!=='inactive'){try{recorder.stop();}catch{}}status.textContent=error.message||'Timeline rendering failed.';notice(status.textContent,true);}
    finally{cancelAnimationFrame(raf);resources.forEach(r=>{try{if(r.media){r.media.pause();if(!r.isImage){r.media.removeAttribute('src');r.media.load();}}}catch{}});temporaryUrls.forEach(url=>URL.revokeObjectURL(url));if(audioContext)await audioContext.close().catch(()=>{});button.disabled=false;button.textContent='Render timeline video';}
  }
  $('renderTimeline').addEventListener('click',renderTimelineVideo);

  // Keep the full project workspace mounted: creation, timeline, and export are sections of one page.
  $('createPanel').hidden=false;$('editPanel').hidden=false;$('exportPanel').hidden=false;document.body.classList.add('editor-mode');
  loadDraft();selectTemplate(state.template,false);renderTimeline();renderExports();updateHistoryButtons();
  refreshToken().then(()=>{$('saveState').textContent='Signed in · local draft';}).catch(()=>{$('saveState').textContent='Sign in required for AI generation';notice('Sign in to NasrinAI in this browser to generate video. You can still explore the template gallery.',true);});
})();