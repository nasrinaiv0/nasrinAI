import { gunzipSync } from 'node:zlib';

const MAX_ARCHIVE_BYTES=15*1024*1024, MAX_EXPANDED_ARCHIVE_BYTES=64*1024*1024, MAX_ARCHIVE_ENTRIES=10_000, MAX_ARCHIVE_FILE_BYTES=16*1024*1024, MAX_OUTPUT_CHARS=2800, MAX_PATCH_BYTES=100_000;
const SANDBOX_ROOT='/vercel/sandbox', WORKSPACE=`${SANDBOX_ROOT}/repo`, ARCHIVE_PATH=`${SANDBOX_ROOT}/source.tar.gz`;
const COMMANDS=new Set(['npm','npx','node','python','python3','pytest','pip','pip3','git','ls','cat','head','tail','wc','diff','sort','uniq','cut','tr','echo','pwd','du','stat','file','which','grep','rg','find','sed','awk','make','tsc','eslint','prettier']);
const BLOCKED_NPM=new Set(['install','ci','add','remove','uninstall','exec','init','publish','link','login','config']);
// Validate GitHub's compressed tarball before passing it to the sandbox extractor.
// gunzipSync has a hard output cap; tar headers then enforce file-count, per-file,
// total expanded-size, path, and file-type limits. Links/special files are refused.
export function inspectCodingArchive(archive){
 if(!Buffer.isBuffer(archive)||archive.length<1||archive.length>MAX_ARCHIVE_BYTES)throw Error('Repository snapshot exceeds the compressed 15 MB limit.');
 let tar;
 try{tar=gunzipSync(archive,{maxOutputLength:MAX_EXPANDED_ARCHIVE_BYTES});}
 catch{throw Error('Repository snapshot exceeds the expanded 64 MB limit or is not a valid gzip archive.');}
 let offset=0,entries=0,totalFiles=0,hasFile=false;
 const octal=(b)=>{const s=b.toString('ascii').replace(/\0.*$/s,'').trim();if(!s)return 0;if(!/^[0-7]+$/.test(s))throw Error('Repository archive contains an invalid tar size.');return Number.parseInt(s,8);};
 while(offset+512<=tar.length){
  const h=tar.subarray(offset,offset+512);
  if(h.every(v=>v===0))break;
  entries++;if(entries>MAX_ARCHIVE_ENTRIES)throw Error('Repository archive contains too many entries.');
  const name=h.toString('utf8',0,100).replace(/\0.*$/s,'');
  const prefix=h.toString('utf8',345,500).replace(/\0.*$/s,'');
  const full=prefix?prefix+'/'+name:name;
  const size=octal(h.subarray(124,136));
  const type=h[156]===0?'0':String.fromCharCode(h[156]);
  if(!full||full.startsWith('/')||full.includes('\\')||full.split('/').some(p=>p==='..'))throw Error('Repository archive contains an unsafe path.');
  if(!['0','5','x','g'].includes(type))throw Error('Repository archive contains a link or unsupported special file.');
  if(size>MAX_ARCHIVE_FILE_BYTES)throw Error('A repository file exceeds the 16 MB expanded limit.');
  if(type==='0')hasFile=true;
  totalFiles+=size;if(totalFiles>MAX_EXPANDED_ARCHIVE_BYTES)throw Error('Repository archive exceeds the 64 MB expanded limit.');
  const blocks=Math.ceil(size/512);offset+=512+blocks*512;
  if(offset>tar.length)throw Error('Repository archive is truncated or malformed.');
 }
 if(!hasFile||entries===0)throw Error('Repository archive contains no readable files.');
 return {expandedBytes:tar.length,entries};
}

export function parseCodingCommand(raw){
 if(typeof raw!=='string'||!raw.trim()||raw.length>300)throw Error('Give one command, up to 300 characters.');
 if(/[\0\r\n;&|<>$\\*?{}()[\]]/.test(raw)||raw.includes(String.fromCharCode(96)))throw Error('Use one command without shell operators, substitutions, pipes, or wildcards.');
 const tokens=[];let token='',quote='',active=false;
 for(const ch of raw.trim()){if(quote){if(ch===quote)quote='';else token+=ch;active=true;continue;}if(ch==='"'||ch==="'"){quote=ch;active=true;continue;}if(/\s/.test(ch)){if(active){tokens.push(token);token='';active=false;}continue;}token+=ch;active=true;}
 if(quote)throw Error('Close the quote in the command.');if(active)tokens.push(token);
 if(!tokens.length||tokens.length>31||tokens.some(v=>v.length>300))throw Error('That command has too many or too-long arguments.');
 const executable=tokens[0];if(!COMMANDS.has(executable))throw Error('That command is not allowed in the coding runner.');
 if(executable==='npm'&&BLOCKED_NPM.has(tokens[1]))throw Error('Dependency installation and publishing are managed by the isolated runner.');
 if(executable==='git'&&['push','pull','fetch','clone','remote','submodule'].includes(tokens[1]))throw Error('Git network and remote-write commands are disabled.');
 if((executable==='pip'||executable==='pip3')&&!['list','show','freeze','check'].includes(tokens[1]))throw Error('pip can only list, show, freeze or check packages here; dependencies are installed by the runner.');
 // npx runs only tools the repository already installed (never downloads).
 if(executable==='npx'){if(!tokens[1]||tokens[1].startsWith('-'))throw Error('Use npx with a tool the repository installs, for example npx vitest run.');return{executable,args:['--no',...tokens.slice(1)],runtime:'node22'};}
 return{executable,args:tokens.slice(1),runtime:['python','python3','pytest'].includes(executable)?'python3.13':'node22'};
}
// Paths the runner may write (patches and workspace files): inside the repository,
// never metadata, dependencies, generated framework state or secret files.
export function safeRunnerPath(p){
 if(!p||p.startsWith('/')||p.includes('\\')||p.length>300||p.split('/').some(s=>!s||s==='.'||s==='..'))throw Error('The patch contains an unsafe file path.');
 const parts=p.split('/');
 if(parts.some(s=>s==='.git'||s==='node_modules'||s==='.vercel'||s==='.next'))throw Error('The patch cannot change repository metadata, dependencies, or generated framework state.');
 const base=parts.at(-1);
 if(base==='.env'||(base.startsWith('.env.')&&base!=='.env.example'))throw Error('The patch cannot change environment or secret files.');
}
export function validateCodingPatch(raw){
 if(raw===undefined||raw===null||raw==='')return '';
 if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>MAX_PATCH_BYTES||raw.includes('\0'))throw Error('The proposed patch must be text under 100 KB.');
 if(/GIT binary patch|^Binary files /m.test(raw))throw Error('Binary patches are not supported; use text-file changes only.');
 const lines=raw.split(/\r?\n/);let found=false;
 const safePath=safeRunnerPath;
 for(const line of lines){
  if(line.startsWith('diff --git ')){
   const m=line.match(/^diff --git a\/([^ ]+) b\/([^ ]+)$/);
   if(!m)throw Error('The patch uses an unsupported file path format.');
   safePath(m[1]);safePath(m[2]);found=true;
  }else if(line.startsWith('--- ')){
   const p=line.slice(4);if(p!=='/dev/null'){if(!p.startsWith('a/'))throw Error('The patch uses an unsupported file path format.');safePath(p.slice(2));found=true;}
  }else if(line.startsWith('+++ ')){
   const p=line.slice(4);if(p!=='/dev/null'){if(!p.startsWith('b/'))throw Error('The patch uses an unsupported file path format.');safePath(p.slice(2));found=true;}
  }
 }
 if(!found||!/^diff --git /m.test(raw)||!/^--- (?:a\/.+|\/dev\/null)$/m.test(raw)||! /^\+\+\+ (?:b\/.+|\/dev\/null)$/m.test(raw))throw Error('Provide a standard unified diff patch with file headers.');
 return raw;
}
const trim=v=>{const s=String(v||'');return s.length>MAX_OUTPUT_CHARS?s.slice(0,MAX_OUTPUT_CHARS)+'\n[output truncated]':s;};
const safeErrorDetail=(stage,e)=>{
 const name=String(e?.name||'Error').replace(/[^A-Za-z0-9_]/g,'').slice(0,60)||'Error';
 let message=String(e?.message||'Unknown failure')
  .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi,'Bearer [redacted]')
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|sk-[A-Za-z0-9_-]{12,})\b/g,'[redacted]')
  .replace(/((?:token|secret|password|api[_-]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi,'$1[redacted]')
  .replace(/https?:\/\/[^\s]+/gi,'[url redacted]')
  .replace(/[\r\n\t]+/g,' ').slice(0,180);
 return {stage,name,message};
};
const failureCode=stage=>({
 sandbox_create:'sandbox_create_failed',
 workspace_write:'sandbox_workspace_failed',
 workspace_create:'sandbox_workspace_failed',
 workspace_files:'sandbox_workspace_failed',
 snapshot_extract:'snapshot_extract_failed',
 patch_write:'patch_write_failed',
 patch_check:'patch_check_failed',
 patch_apply:'patch_apply_failed',
 dependency_detect:'dependency_detection_failed',
 dependency_install:'dependency_install_failed',
 network_restrict:'sandbox_network_policy_failed',
 command_execute:'sandbox_exec_failed'
}[stage]||'runner_failed');
const run=(s,c,a,cwd)=>s.runCommand({cmd:c,args:a,...(cwd?{cwd}:{})});
// Up to MAX_BATCH commands per call (one per line in `commands`), all for the
// same runtime. Each line passes the same checks as a single command.
export const MAX_BATCH=10;
export function parseCodingCommands(input){
 if(input?.commands!==undefined&&input?.commands!==null&&input.commands!==''){
  if(typeof input.commands!=='string'||input.commands.length>3000)throw Error('Give the commands as text, one per line, up to 3000 characters.');
  const lines=input.commands.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  if(!lines.length||lines.length>MAX_BATCH)throw Error(`Give between 1 and ${MAX_BATCH} commands, one per line.`);
  const parsed=lines.map(line=>({...parseCodingCommand(line),text:line}));
  if(new Set(parsed.map(c=>c.runtime)).size>1)throw Error('Run Node.js and Python commands in separate calls.');
  return parsed;
 }
 return[{...parseCodingCommand(input?.command),text:String(input?.command||'').trim()}];
}
// Long output keeps its start and its end (where errors usually are).
const clip=(v,n)=>{const s=String(v||'');if(s.length<=n)return s;const head=Math.floor(n*0.35);return s.slice(0,head)+'\n[… output shortened …]\n'+s.slice(s.length-(n-head));};
const DEPENDENCY_FILES=new Set(['package.json','package-lock.json','requirements.txt']);
// A sandbox stays open for the rest of one chat reply (same person, chat,
// repository, ref and runtime), so later calls skip the download and install.
const SESSION_MS=100_000;
export function createCodingRunner({downloadArchive,defaultBranch,tokenFor,store,logger=null,sandboxFactory=null,runsPerHour=10,now=()=>Date.now()}){
 const createSandbox=sandboxFactory||(async o=>{const{Sandbox}=await import('@vercel/sandbox');return Sandbox.create(o);});
 const sessions=new Map();
 const stopQuietly=async sandbox=>{try{await sandbox.stop();}catch(e){logger?.warn('coding runner cleanup failed',{...safeErrorDetail('sandbox_cleanup',e)});}};
 const sweep=()=>{for(const[k,v]of sessions)if(!v.busy&&now()-v.createdAt>SESSION_MS){sessions.delete(k);stopQuietly(v.sandbox);}};
 return{
 // Turn end: close this chat's open sandboxes.
 async release(ctx){
  const prefix=`${ctx?.tenantId}:${ctx?.actor?.id}:${ctx?.conversationId}:`;
  for(const[k,v]of sessions)if(k.startsWith(prefix)){sessions.delete(k);await stopQuietly(v.sandbox);}
 },
 async run(input,ctx,{files:workspaceFiles=[],baseFor=null}={}){
  if(ctx?.actor?.type!=='user'||!ctx.actor.id||!ctx.tenantId)return{error:'sign_in_required',message:'Sign in and connect GitHub to run repository code.'};
  let commands,patch;try{commands=parseCodingCommands(input);}catch(e){return{error:'invalid_command',message:e.message};}try{patch=validateCodingPatch(input?.patch);}catch(e){return{error:'invalid_patch',message:e.message};}
  const runtime=commands[0].runtime,batch=input?.commands!==undefined&&input?.commands!==null&&input.commands!=='';
  const repo=String(input?.repo||'').trim();let ref=String(input?.ref||'').trim();
  if(!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repo)||ref.length>200||(ref&&!/^(?!.*\.\.)(?!\/)[A-Za-z0-9._/-]{1,200}$/.test(ref)))return{error:'invalid_arguments',message:'Choose a valid repository and branch or commit.'};
  const edited=Array.isArray(workspaceFiles)?workspaceFiles.slice(0,20):[];
  try{for(const f of edited){safeRunnerPath(f.path);if(typeof f.content!=='string'||Buffer.byteLength(f.content)>200_000)throw Error('A workspace file is not usable text.');}}catch(e){return{error:'invalid_workspace',message:e.message};}
  const token=await tokenFor(ctx).catch(()=>null);if(!token)return{error:'github_not_connected',message:'Connect GitHub first in Plugins → GitHub.'};
  try{const lim=await store.rateHit('ghrun:'+ctx.tenantId+':'+ctx.actor.id,3600,runsPerHour);if(!lim?.allowed)return{error:'rate_limited',message:`You have run the coding environment ${runsPerHour} times this hour. Try again later.`};}catch{return{error:'rate_limit_unavailable',message:'The coding runner is temporarily unavailable. Please try again later.'};}
  if(!ref){try{ref=await defaultBranch(token,repo);}catch{return{error:'default_branch_unavailable',message:'Nasrin could not determine the repository default branch. Specify a branch or commit.'};}}
  const deadline=Number.isFinite(ctx.deadline)?ctx.deadline:Infinity;
  let reusable=Boolean(ctx.conversationId)&&!patch;
  const key=`${ctx.tenantId}:${ctx.actor.id}:${ctx.conversationId}:${repo}@${ref}:${runtime}`;
  sweep();
  let session=reusable?sessions.get(key):null;
  // Another run of this chat is using the open sandbox (tools run in
  // parallel): this one gets its own, closed when it ends.
  if(session?.busy){session=null;reusable=false;}
  if(session&&[...edited.map(f=>f.path),...session.written.keys()].some(p=>DEPENDENCY_FILES.has(p)&&session.written.get(p)!==edited.find(f=>f.path===p)?.content)){
   // Changed dependency files need a fresh install.
   sessions.delete(key);await stopQuietly(session.sandbox);
   session=null;
  }
  const reused=Boolean(session);
  let sandbox=session?.sandbox||null;const started=now();let stage='sandbox_create',activeResult=null,keep=false;
  const finish=value=>(activeResult=value,value);
  const left=()=>deadline-now();
  try{
   if(session){
    session.busy=true;
    // Bring the open sandbox in line with the workspace: write what changed,
    // restore what was reverted.
    stage='workspace_files';
    const want=new Map(edited.map(f=>[f.path,f.content]));
    const writes=edited.filter(f=>session.written.get(f.path)!==f.content);
    for(const p of[...session.written.keys()].filter(p=>!want.has(p))){
     const base=baseFor?await baseFor(p):null;
     if(typeof base==='string')writes.push({path:p,content:base});
     else{const rm=await run(sandbox,'rm',['-f',`${WORKSPACE}/${p}`]);if(rm.exitCode!==0)throw Error('workspace_files_failed');}
     session.written.delete(p);
    }
    if(writes.length){
     const dirs=[...new Set(writes.map(f=>f.path.split('/').slice(0,-1).join('/')).filter(Boolean))].map(d=>`${WORKSPACE}/${d}`);
     if(dirs.length){const mk=await run(sandbox,'mkdir',['-p',...dirs]);if(mk.exitCode!==0)throw Error('workspace_files_failed');}
     await sandbox.writeFiles(writes.map(f=>({path:`${WORKSPACE}/${f.path}`,content:Buffer.from(f.content,'utf8')})));
     for(const f of writes)if(want.has(f.path))session.written.set(f.path,f.content);
    }
   }else{
    let archive;try{archive=await downloadArchive(token,repo,ref);}catch(e){logger?.warn('coding runner source fetch failed',{code:e?.code||'failed'});return finish({error:'source_unavailable',message:'Could not safely fetch that repository snapshot. Check the repository, branch, and GitHub access.'});}
    try{inspectCodingArchive(archive);}catch(e){return finish({error:'repository_too_large',message:e.message});}
    stage='sandbox_create';
    sandbox=await createSandbox({runtime,timeout:reusable?115_000:70_000,persistent:false,networkPolicy:{allow:['registry.npmjs.org','pypi.org','files.pythonhosted.org']}});
    stage='workspace_write';
    await sandbox.writeFiles([{path:ARCHIVE_PATH,content:archive}]);
    stage='workspace_create';
    let r=await run(sandbox,'mkdir',['-p',WORKSPACE]);if(r.exitCode!==0)throw Error('workspace_create_failed');
    stage='snapshot_extract';
    r=await run(sandbox,'tar',['--no-same-owner','--no-same-permissions','--no-overwrite-dir','-xzf',ARCHIVE_PATH,'--strip-components=1','-C',WORKSPACE]);
    if(r.exitCode!==0)return finish({error:'snapshot_extract_failed',stage,exit_code:r.exitCode,stdout:trim(await r.stdout()),stderr:trim(await r.stderr()),message:'The repository snapshot could not be unpacked.'});
    if(edited.length){
     stage='workspace_files';
     const dirs=[...new Set(edited.map(f=>f.path.split('/').slice(0,-1).join('/')).filter(Boolean))].map(d=>`${WORKSPACE}/${d}`);
     if(dirs.length){const mk=await run(sandbox,'mkdir',['-p',...dirs]);if(mk.exitCode!==0)throw Error('workspace_files_failed');}
     await sandbox.writeFiles(edited.map(f=>({path:`${WORKSPACE}/${f.path}`,content:Buffer.from(f.content,'utf8')})));
    }
    if(patch){
     stage='patch_write';
     await sandbox.writeFiles([{path:`${WORKSPACE}/changes.patch`,content:Buffer.from(patch,'utf8')}]);
     stage='patch_check';
     const check=await run(sandbox,'git',['apply','--check',`${WORKSPACE}/changes.patch`],WORKSPACE);
     if(check.exitCode!==0)return finish({error:'patch_rejected',stage,exit_code:check.exitCode,stdout:trim(await check.stdout()),stderr:trim(await check.stderr()),message:'The proposed changes do not apply cleanly to this repository snapshot.'});
     stage='patch_apply';
     const applied=await run(sandbox,'git',['apply',`${WORKSPACE}/changes.patch`],WORKSPACE);
     if(applied.exitCode!==0)return finish({error:'patch_rejected',stage,exit_code:applied.exitCode,stdout:trim(await applied.stdout()),stderr:trim(await applied.stderr()),message:'The proposed changes could not be applied to the isolated workspace.'});
    }
    stage='dependency_detect';
    const hasPkg=(await run(sandbox,'test',['-f','package.json'],WORKSPACE)).exitCode===0;
    const hasLock=(await run(sandbox,'test',['-f','package-lock.json'],WORKSPACE)).exitCode===0;
    const hasReq=(await run(sandbox,'test',['-f','requirements.txt'],WORKSPACE)).exitCode===0;
    if(hasPkg&&runtime==='node22'){
     stage='dependency_install';
     const ins=await run(sandbox,'npm',hasLock?['ci','--ignore-scripts','--no-audit','--no-fund']:['install','--ignore-scripts','--no-audit','--no-fund'],WORKSPACE);
     if(ins.exitCode!==0){
      const result={error:'dependency_install_failed',stage,exit_code:ins.exitCode,stdout:trim(await ins.stdout()),stderr:trim(await ins.stderr()),message:'Dependencies could not be installed safely; lifecycle scripts are disabled and egress is limited to registries.'};
      try{await sandbox.updateNetworkPolicy({allow:[]});}catch(cleanup){result.cleanup_error=safeErrorDetail('network_restrict',cleanup);logger?.warn('coding runner network restriction failed',{stage:'dependency_install',cleanup_error:result.cleanup_error});}
      return finish(result);
     }
    }else if(hasReq&&runtime==='python3.13'){
     stage='dependency_install';
     const ins=await run(sandbox,'python',['-m','pip','install','--disable-pip-version-check','--no-input','--only-binary=:all:','-r','requirements.txt'],WORKSPACE);
     if(ins.exitCode!==0){
      const result={error:'dependency_install_failed',stage,exit_code:ins.exitCode,stdout:trim(await ins.stdout()),stderr:trim(await ins.stderr()),message:'Python dependencies could not be installed as binary wheels from approved registries.'};
      try{await sandbox.updateNetworkPolicy({allow:[]});}catch(cleanup){result.cleanup_error=safeErrorDetail('network_restrict',cleanup);logger?.warn('coding runner network restriction failed',{stage:'dependency_install',cleanup_error:result.cleanup_error});}
      return finish(result);
     }
    }
    stage='network_restrict';
    await sandbox.updateNetworkPolicy({allow:[]});
    if(reusable){session={sandbox,written:new Map(edited.map(f=>[f.path,f.content])),createdAt:now(),busy:true};sessions.set(key,session);}
   }
   stage='command_execute';
   // Commands run one after another; the batch stops at the first failure
   // unless keep_going is set, and stops before the reply runs out of time.
   const results=[];let skipped=0,outOfTime=false;
   for(const c of commands){
    if(results.length&&results.at(-1).exit_code!==0&&input?.keep_going!==true){skipped++;continue;}
    if(left()<5_000){outOfTime=true;skipped++;continue;}
    const signal=Number.isFinite(deadline)?AbortSignal.timeout(Math.max(1_000,left()-2_000)):undefined;
    let out;
    try{out=await sandbox.runCommand({cmd:c.executable,args:c.args,cwd:WORKSPACE,...(signal?{signal}:{})});}
    catch(e){if(signal?.aborted){outOfTime=true;results.push({command:c.text,exit_code:124,stdout:'',stderr:'Stopped: the reply ran out of time.'});break;}throw e;}
    results.push({command:c.text,exit_code:out.exitCode,stdout:await out.stdout(),stderr:await out.stderr()});
   }
   const failed=results.find(r=>r.exit_code!==0);
   const exitCode=failed?failed.exit_code:0;
   keep=reusable&&!outOfTime;
   logger?.info('coding command completed',{durationMs:now()-started,exitCode,runtime,repo,commands:results.length,reused});
   const base={ok:!failed&&!skipped,repo,ref:ref||null,patch_applied:!!patch,workspace_files:edited.length,exit_code:exitCode,runtime,sandboxed:true,network_after_install:'disabled',reused_sandbox:reused,duration_ms:now()-started};
   const message=outOfTime?'Stopped: this reply ran out of time. Report what ran; the person can say "continue".':failed?'Command failed; inspect the real output and fix the cause.':'Command completed; use captured output as evidence.';
   if(!batch){const r=results[0]||{command:commands[0].text,exit_code:124,stdout:'',stderr:''};return finish({...base,command:input.command,stdout:trim(r.stdout),stderr:trim(r.stderr),...(outOfTime?{error:'out_of_time'}:{}),message});}
   // Output room is shared: failed commands get the most.
   const room=5200,share=Math.floor(room/Math.max(1,results.length+(failed?1:0)));
   return finish({...base,commands:results.length,...(skipped?{skipped}:{}),...(outOfTime?{error:'out_of_time'}:{}),results:results.map(r=>{const n=r.exit_code!==0?share*2:share;return{command:r.command,exit_code:r.exit_code,stdout:clip(r.stdout,Math.floor(n*0.45)),stderr:clip(r.stderr,Math.floor(n*0.55))};}),message});
  }catch(e){
   const detail=safeErrorDetail(stage,e),error=failureCode(stage);
   const result={error,stage,stage_detail:detail,message:'The isolated coding environment could not complete this run. No repository branch was changed.'};
   logger?.warn('coding runner failed',{...detail,error,durationMs:now()-started});
   return finish(result);
  }
  finally{
   if(session)session.busy=false;
   if(sandbox&&!keep){
    if(session&&sessions.get(key)===session)sessions.delete(key);
    try{await sandbox.stop();}catch(e){
     const cleanup=safeErrorDetail('sandbox_cleanup',e);
     logger?.warn('coding runner cleanup failed',{...cleanup});
     if(activeResult&&typeof activeResult==='object')activeResult.cleanup_error=cleanup;
    }
   }
  }
 }};
}
