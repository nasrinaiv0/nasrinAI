const MAX_ARCHIVE_BYTES=15*1024*1024, MAX_OUTPUT_CHARS=2800, MAX_PATCH_BYTES=100_000;
const COMMANDS=new Set(['npm','node','python','python3','pytest','git','ls','cat','grep','rg','find','sed','awk','tsc','eslint','prettier']);
const BLOCKED_NPM=new Set(['install','ci','add','remove','uninstall','exec','init','publish','link','login','config']);
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
 return{executable,args:tokens.slice(1),runtime:['python','python3','pytest'].includes(executable)?'python3.13':'node22'};
}
export function validateCodingPatch(raw){
 if(raw===undefined||raw===null||raw==='')return '';
 if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>MAX_PATCH_BYTES||raw.includes('\0'))throw Error('The proposed patch must be text under 100 KB.');
 if(/GIT binary patch|^Binary files /m.test(raw))throw Error('Binary patches are not supported; use text-file changes only.');
 const lines=raw.split(/\r?\n/);let found=false;
 const safePath=p=>{
  if(!p||p.startsWith('/')||p.includes('\\')||p.length>300||p.split('/').some(s=>!s||s==='.'||s==='..'))throw Error('The patch contains an unsafe file path.');
  const parts=p.split('/');
  if(parts.some(s=>s==='.git'||s==='node_modules'||s==='.vercel'||s==='.next'))throw Error('The patch cannot change repository metadata, dependencies, or generated framework state.');
  const base=parts.at(-1);
  if(base==='.env'||(base.startsWith('.env.')&&base!=='.env.example'))throw Error('The patch cannot change environment or secret files.');
 };
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
export function createCodingRunner({downloadArchive,defaultBranch,tokenFor,store,logger=null,sandboxFactory=null}){
 const createSandbox=sandboxFactory||(async o=>{const{Sandbox}=await import('@vercel/sandbox');return Sandbox.create(o);});
 return{async run(input,ctx){
  if(ctx?.actor?.type!=='user'||!ctx.actor.id||!ctx.tenantId)return{error:'sign_in_required',message:'Sign in and connect GitHub to run repository code.'};
  let parsed,patch;try{parsed=parseCodingCommand(input?.command);}catch(e){return{error:'invalid_command',message:e.message};}try{patch=validateCodingPatch(input?.patch);}catch(e){return{error:'invalid_patch',message:e.message};}
  const repo=String(input?.repo||'').trim();let ref=String(input?.ref||'').trim();
  if(!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repo)||ref.length>200||(ref&&!/^(?!.*\.\.)(?!\/)[A-Za-z0-9._/-]{1,200}$/.test(ref)))return{error:'invalid_arguments',message:'Choose a valid repository and branch or commit.'};
  const token=await tokenFor(ctx).catch(()=>null);if(!token)return{error:'github_not_connected',message:'Connect GitHub first in Plugins → GitHub.'};
  try{const lim=await store.rateHit('ghrun:'+ctx.tenantId+':'+ctx.actor.id,3600,10);if(!lim?.allowed)return{error:'rate_limited',message:'You have run the coding environment 10 times this hour. Try again later.'};}catch{return{error:'rate_limit_unavailable',message:'The coding runner is temporarily unavailable. Please try again later.'};}
  if(!ref){try{ref=await defaultBranch(token,repo);}catch{return{error:'default_branch_unavailable',message:'Nasrin could not determine the repository default branch. Specify a branch or commit.'};}}
  let archive;try{archive=await downloadArchive(token,repo,ref);}catch(e){logger?.warn('coding runner source fetch failed',{code:e?.code||'failed'});return{error:'source_unavailable',message:'Could not safely fetch that repository snapshot. Check the repository, branch, and GitHub access.'};}
  if(!Buffer.isBuffer(archive)||archive.length<1||archive.length>MAX_ARCHIVE_BYTES)return{error:'repository_too_large',message:'The repository snapshot is empty or exceeds the 15 MB limit.'};
  let sandbox;const started=Date.now();let stage='sandbox_create',activeResult=null;
  const finish=value=>(activeResult=value,value);
  try{
   stage='sandbox_create';
   sandbox=await createSandbox({runtime:parsed.runtime,timeout:70_000,persistent:false,networkPolicy:{allow:['registry.npmjs.org','pypi.org','files.pythonhosted.org']}});
   stage='workspace_write';
   await sandbox.writeFiles([{path:'source.tar.gz',content:archive}]);
   stage='workspace_create';
   let r=await run(sandbox,'mkdir',['-p','repo']);if(r.exitCode!==0)throw Error('workspace_create_failed');
   stage='snapshot_extract';
   r=await run(sandbox,'tar',['--no-same-owner','--no-same-permissions','-xzf','source.tar.gz','--strip-components=1','-C','repo']);
   if(r.exitCode!==0)return finish({error:'snapshot_extract_failed',stage,exit_code:r.exitCode,stdout:trim(await r.stdout()),stderr:trim(await r.stderr()),message:'The repository snapshot could not be unpacked.'});
   if(patch){
    stage='patch_write';
    await sandbox.writeFiles([{path:'repo/changes.patch',content:Buffer.from(patch,'utf8')}]);
    stage='patch_check';
    const check=await run(sandbox,'git',['apply','--check','changes.patch'],'repo');
    if(check.exitCode!==0)return finish({error:'patch_rejected',stage,exit_code:check.exitCode,stdout:trim(await check.stdout()),stderr:trim(await check.stderr()),message:'The proposed changes do not apply cleanly to this repository snapshot.'});
    stage='patch_apply';
    const applied=await run(sandbox,'git',['apply','changes.patch'],'repo');
    if(applied.exitCode!==0)return finish({error:'patch_rejected',stage,exit_code:applied.exitCode,stdout:trim(await applied.stdout()),stderr:trim(await applied.stderr()),message:'The proposed changes could not be applied to the isolated workspace.'});
   }
   stage='dependency_detect';
   const hasPkg=(await run(sandbox,'test',['-f','package.json'],'repo')).exitCode===0;
   const hasLock=(await run(sandbox,'test',['-f','package-lock.json'],'repo')).exitCode===0;
   const hasReq=(await run(sandbox,'test',['-f','requirements.txt'],'repo')).exitCode===0;
   if(hasPkg&&parsed.runtime==='node22'){
    stage='dependency_install';
    const ins=await run(sandbox,'npm',hasLock?['ci','--ignore-scripts','--no-audit','--no-fund']:['install','--ignore-scripts','--no-audit','--no-fund'],'repo');
    if(ins.exitCode!==0){
     const result={error:'dependency_install_failed',stage,exit_code:ins.exitCode,stdout:trim(await ins.stdout()),stderr:trim(await ins.stderr()),message:'Dependencies could not be installed safely; lifecycle scripts are disabled and egress is limited to registries.'};
     try{await sandbox.updateNetworkPolicy({allow:[]});}catch(cleanup){result.cleanup_error=safeErrorDetail('network_restrict',cleanup);logger?.warn('coding runner network restriction failed',{stage:'dependency_install',cleanup_error:result.cleanup_error});}
     return finish(result);
    }
   }else if(hasReq&&parsed.runtime==='python3.13'){
    stage='dependency_install';
    const ins=await run(sandbox,'python',['-m','pip','install','--disable-pip-version-check','--no-input','--only-binary=:all:','-r','requirements.txt'],'repo');
    if(ins.exitCode!==0){
     const result={error:'dependency_install_failed',stage,exit_code:ins.exitCode,stdout:trim(await ins.stdout()),stderr:trim(await ins.stderr()),message:'Python dependencies could not be installed as binary wheels from approved registries.'};
     try{await sandbox.updateNetworkPolicy({allow:[]});}catch(cleanup){result.cleanup_error=safeErrorDetail('network_restrict',cleanup);logger?.warn('coding runner network restriction failed',{stage:'dependency_install',cleanup_error:result.cleanup_error});}
     return finish(result);
    }
   }
   stage='network_restrict';
   await sandbox.updateNetworkPolicy({allow:[]});
   stage='command_execute';
   const out=await run(sandbox,parsed.executable,parsed.args,'repo'),stdout=trim(await out.stdout()),stderr=trim(await out.stderr());
   logger?.info('coding command completed',{durationMs:Date.now()-started,exitCode:out.exitCode,runtime:parsed.runtime,repo,command:parsed.executable});
   return finish({ok:out.exitCode===0,repo,ref:ref||null,command:input.command,patch_applied:!!patch,exit_code:out.exitCode,stdout,stderr,runtime:parsed.runtime,sandboxed:true,network_after_install:'disabled',duration_ms:Date.now()-started,message:out.exitCode===0?'Command completed; use captured output as evidence.':'Command failed; inspect the real output and fix the cause.'});
  }catch(e){
   const detail=safeErrorDetail(stage,e),error=failureCode(stage);
   const result={error,stage,stage_detail:detail,message:'The isolated coding environment could not complete this run. No repository branch was changed.'};
   logger?.warn('coding runner failed',{...detail,error,durationMs:Date.now()-started});
   return finish(result);
  }
  finally{if(sandbox){try{await sandbox.stop();}catch(e){
   const cleanup=safeErrorDetail('sandbox_cleanup',e);
   logger?.warn('coding runner cleanup failed',{...cleanup});
   if(activeResult&&typeof activeResult==='object')activeResult.cleanup_error=cleanup;
  }}}
 }};
}