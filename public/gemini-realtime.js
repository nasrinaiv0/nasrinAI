// Browser-side Gemini Live transport. Uses a server-minted ephemeral token.
// Audio in: PCM16 mono 16kHz. Audio out: PCM16 mono 24kHz.
(() => {
  'use strict';
  const b64bytes = (s) => { const b = atob(s), out = new Uint8Array(b.length); for (let i=0;i<b.length;i++) out[i]=b.charCodeAt(i); return out; };
  const b64 = (bytes) => { let s=''; for(let i=0;i<bytes.length;i+=0x8000) s += String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length))); return btoa(s); };
  const downsample = (input, rate) => {
    const ratio=rate/16000, n=Math.max(1,Math.floor(input.length/ratio)), out=new Int16Array(n);
    for(let i=0;i<n;i++){const v=Math.max(-1,Math.min(1,input[Math.min(input.length-1,Math.floor(i*ratio))]));out[i]=v<0?v*32768:v*32767;}
    return new Uint8Array(out.buffer);
  };
  const play = (state, data, mimeType = '') => {
    if(!state.ctx||!data)return;
    const bytes=b64bytes(data), n=Math.floor(bytes.byteLength/2);
    if(!n)return;
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), f=new Float32Array(n);
    for(let i=0;i<n;i++)f[i]=view.getInt16(i*2,true)/32768;
    // Gemini audio frames declare their PCM sample rate in inlineData.mimeType.
    // Using a guessed rate changes both duration and pitch (the classic chipmunk effect).
    const declaredRate = Number(/(?:^|;)\s*rate=(\d+)/i.exec(String(mimeType))?.[1]);
    const sampleRate = Number.isFinite(declaredRate) && declaredRate >= 8000 && declaredRate <= 96000 ? declaredRate : 24000;
    const buf=state.ctx.createBuffer(1,n,sampleRate);
    if(typeof buf.copyToChannel==='function')buf.copyToChannel(f,0);
    else buf.getChannelData(0).set(f);
    // Out through the page's <audio> element when there is one (state.out):
    // iPhones send Web Audio to the quiet earpiece, or mute it, while the
    // microphone is on; a media element plays on the speaker.
    const src=state.ctx.createBufferSource();src.buffer=buf;src.connect(state.out||state.ctx.destination);
    const now=state.ctx.currentTime;state.next=Math.max(state.next||now,now+0.02);src.start(state.next);state.next+=buf.duration;state.sources.push(src);
    src.onended=()=>{const i=state.sources.indexOf(src);if(i>=0)state.sources.splice(i,1);};
    // iOS Safari can suspend Web Audio after permission prompts or app switches.
    // ('interrupted' is iOS's state after a call, Siri or a permission prompt.)
    if(state.ctx.state!=='running')state.ctx.resume().catch(()=>{});
    if(state.el&&state.el.paused)state.el.play().catch(()=>{});
  };
  const decoder = new TextDecoder();
  // Interrupt only the current playback; keep the live session and mic running.
  const stop = (state) => {
    if(!state)return;
    for(const s of state.sources.splice(0)){try{s.stop();}catch{}try{s.disconnect();}catch{}}
    if(state.ctx)state.next=state.ctx.currentTime;
  };
  window.NasrinGeminiRealtime = {
    async start(session, hooks) {
      if(!window.WebSocket||!window.AudioContext||!navigator.mediaDevices?.getUserMedia) throw new Error('Gemini realtime voice is not supported in this browser.');
      const state={ws:null,ctx:null,processor:null,stream:null,sources:[],next:0,buffer:[],ready:false,stopping:false,setupTimer:null};
      const ws=new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token='+encodeURIComponent(session.value));
      ws.binaryType='arraybuffer';
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
      const ctx=hooks.audioContext||new AudioContext();
      try{await ctx.resume();}catch{}
      const processor=ctx.createScriptProcessor(4096,1,1),source=ctx.createMediaStreamSource(stream);
      // The reply's sound goes to the <audio> element made during the tap.
      const el=hooks.audioElement;
      if(el&&typeof ctx.createMediaStreamDestination==='function'){
        try{const out=ctx.createMediaStreamDestination();el.srcObject=out.stream;el.play().catch(()=>{});Object.assign(state,{out,el});}
        catch{/* falls back to the context's own output */}
      }
      Object.assign(state,{ws,ctx,processor,stream});hooks.state(state);
      const flush=()=>{
        if(!state.ready||ws.readyState!==WebSocket.OPEN||!state.buffer.length)return;
        let n=0;for(const x of state.buffer)n+=x.length;
        const m=new Uint8Array(n);let o=0;for(const x of state.buffer){m.set(x,o);o+=x.length;}
        state.buffer=[];
        try{ws.send(JSON.stringify({realtimeInput:{audio:{data:b64(m),mimeType:'audio/pcm;rate=16000'}}}));}
        catch(e){hooks.error(e?.message||'Could not send microphone audio to Gemini.');}
      };
      processor.onaudioprocess=e=>{
        if(!hooks.active()||hooks.muted()||state.stopping)return;
        // Do not send microphone frames until Gemini confirms setup is accepted.
        if(!state.ready)return;
        state.buffer.push(downsample(e.inputBuffer.getChannelData(0),ctx.sampleRate));
        let n=0;for(const x of state.buffer)n+=x.length;if(n>=1600)flush();
      };
      source.connect(processor);processor.connect(ctx.destination);
      ws.onopen=()=>{
        try{
          ws.send(JSON.stringify({setup:{model:'models/'+session.model,generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:session.gemini_voice||'Kore'}}}},inputAudioTranscription:{},outputAudioTranscription:{},sessionResumption:{},systemInstruction:{parts:[{text:'Speak in a natural adult vocal register at a comfortable, moderate pitch and normal conversational speed. Avoid squeaky, childlike, cartoonish, or chipmunk-like delivery. Keep articulation clear and intonation relaxed. ' + (session.instructions||'You are NasrinAI. Be natural, concise, accurate, and interruptible.')}]}}}));
          state.setupTimer=setTimeout(()=>{if(!state.ready&&!state.stopping)hooks.error('Gemini did not confirm the realtime audio setup. Please try again.');},12000);
        }catch(e){hooks.error(e?.message||'Could not initialize Gemini realtime voice.');}
      };
      ws.onmessage=async e=>{
        let raw=e.data;
        try{
          if(typeof Blob!=='undefined'&&raw instanceof Blob)raw=await raw.arrayBuffer();
          const msg=JSON.parse(typeof raw==='string'?raw:decoder.decode(raw));
          if(msg.error){
            const detail=msg.error.message||msg.error.status||'Gemini rejected the realtime voice session.';
            hooks.error(detail);return;
          }
          if(msg.setupComplete){
            clearTimeout(state.setupTimer);state.ready=true;hooks.open();return;
          }
          const c=msg.serverContent;if(!c)return;
          if(c.inputTranscription?.text)hooks.input(c.inputTranscription.text);
          if(c.outputTranscription?.text)hooks.output(c.outputTranscription.text);
          if(c.modelTurn?.parts)for(const p of c.modelTurn.parts)if(p.inlineData?.data)play(state,p.inlineData.data,p.inlineData.mimeType||'');
          if(c.interrupted){stop(state);hooks.interrupted();}
          if(c.turnComplete)hooks.complete();
        }catch(err){
          // Ignore malformed frames only; report decoder/runtime failures for diagnostics.
          if(!(err instanceof SyntaxError))hooks.error(err?.message||'Could not process Gemini realtime audio.');
        }
      };
      ws.onerror=()=>{if(!state.stopping)hooks.error('Gemini realtime connection failed.');};
      ws.onclose=()=>{clearTimeout(state.setupTimer);if(!state.stopping)hooks.close();};
      return state;
    },
    stop
  };
})();
