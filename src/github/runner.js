const MAX_ARCHIVE_BYTES=15*1024*1024, MAX_OUTPUT_CHARS=2800;
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
const trim=v=>{const s=String(v||'');return s.length>MAX_OUTPUT_CHARS?s.slice(0,MAX_OUTPUT_CHARS)+'\n[output truncated]':s;};
const run=(s,c,a,cwd)=>s.runCommand({cmd:c,args:a,...(cwd?{cwd}:{})});
export function createCodingRunner({downloadArchive,tokenFor,store,logger=null,sandboxFactory=null}){
 const createSandbox=sandboxFactory||(async o=>{const{Sandbox}=await import('@vercel/sandbox');return Sandbox.create(o);});
 return{async run(input,ctx){
  if(ctx?.actor?.type!=='user'||!ctx.actor.id||!ctx.tenantId)return{error:'sign_in_required',message:'Sign in and connect GitHub to run repository code.'};
  let parsed;try{parsed=parseCodingCommand(input?.command);}catch(e){return{error:'invalid_command',message:e.message};}
  const repo=String(input?.repo||'').trim(),ref=String(input?.ref||'').trim();
  if(!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repo)||ref.length>200||(ref&&!/^(?!.*\.\.)(?!\/)[A-Za-z0-9._/-]{1,200}$/.test(ref)))return{error:'invalid_arguments',message:'Choose a valid repository and branch or commit.'};
  const token=await tokenFor(ctx).catch(()=>null);if(!token)return{error:'github_not_connected',message:'Connect GitHub first in Plugins → GitHub.'};
  try{const lim=await store.rateHit('ghrun:'+ctx.tenantId+':'+ctx.actor.id,3600,10);if(!lim?.allowed)return{error:'rate_limited',message:'You have run the coding environment 10 times this hour. Try again later.'};}catch{return{error:'rate_limit_unavailable',message:'The coding runner is temporarily unavailable. Please try again later.'};}
  let archive;try{archive=await downloadArchive(token,repo,ref);}catch(e){logger?.warn('coding runner source fetch failed',{code:e?.code||'failed'});return{error:'source_unavailable',message:'Could not safely fetch that repository snapshot. Check the repository, branch, and GitHub access.'};}
  if(!Buffer.isBuffer(archive)||archive.length<1||archive.length>MAX_ARCHIVE_BYTES)return{error:'repository_too_large',message:'The repository snapshot is empty or exceeds the 15 MB limit.'};
  let sandbox;const started=Date.now();
  try{
   sandbox=await createSandbox({runtime:parsed.runtime,timeout:70_000,persistent:false,networkPolicy:{allow:['registry.npmjs.org','pypi.org','files.pythonhosted.org']}});
   await sandbox.writeFiles([{path:'source.tar.gz',content:archive}]);
   let r=await run(sandbox,'mkdir',['-p','repo']);if(r.exitCode!==0)throw Error('workspace_create_failed');
   r=await run(sandbox,'tar',['--no-same-owner','--no-same-permissions','-xzf','source.tar.gz','--strip-components=1','-C','repo']);
   if(r.exitCode!==0)return{error:'snapshot_extract_failed',exit_code:r.exitCode,stdout:trim(await r.stdout()),stderr:trim(await r.stderr()),message:'The repository snapshot could not be unpacked.'};
   const hasPkg=(await run(sandbox,'test',['-f','package.json'],'repo')).exitCode===0;
   const hasLock=(await run(sandbox,'test',['-f','package-lock.json'],'repo')).exitCode===0;
   const hasReq=(await run(sandbox,'test',['-f','requirements.txt'],'repo')).exitCode===0;
   if(hasPkg&&parsed.runtime==='node22'){
    const ins=await run(sandbox,'npm',hasLock?['ci','--ignore-scripts','--no-audit','--no-fund']:['install','--ignore-scripts','--no-audit','--no-fund'],'repo');
    if(ins.exitCode!==0){await sandbox.updateNetworkPolicy({allow:[]});return{error:'dependency_install_failed',phase:'dependency_install',exit_code:ins.exitCode,stdout:trim(await ins.stdout()),stderr:trim(await ins.stderr()),message:'Dependencies could not be installed safely; lifecycle scripts are disabled and egress is limited to registries.'};}
   }else if(hasReq&&parsed.runtime==='python3.13'){
    const ins=await run(sandbox,'python',['-m','pip','install','--disable-pip-version-check','--no-input','--only-binary=:all:','-r','requirements.txt'],'repo');
    if(ins.exitCode!==0){await sandbox.updateNetworkPolicy({allow:[]});return{error:'dependency_install_failed',phase:'dependency_install',exit_code:ins.exitCode,stdout:trim(await ins.stdout()),stderr:trim(await ins.stderr()),message:'Python dependencies could not be installed as binary wheels from approved registries.'};}
   }
   await sandbox.updateNetworkPolicy({allow:[]});
   const out=await run(sandbox,parsed.executable,parsed.args,'repo'),stdout=trim(await out.stdout()),stderr=trim(await out.stderr());
   logger?.info('coding command completed',{durationMs:Date.now()-started,exitCode:out.exitCode,runtime:parsed.runtime,repo,command:parsed.executable});
   return{ok:out.exitCode===0,repo,ref:ref||null,command:input.command,exit_code:out.exitCode,stdout,stderr,runtime:parsed.runtime,sandboxed:true,network_after_install:'disabled',duration_ms:Date.now()-started,message:out.exitCode===0?'Command completed; use captured output as evidence.':'Command failed; inspect the real output and fix the cause.'};
  }catch(e){logger?.warn('coding runner failed',{error:String(e?.name||'Error'),durationMs:Date.now()-started});return{error:'runner_failed',message:'The isolated coding environment could not complete this run. No repository branch was changed.'};}
  finally{if(sandbox){try{await sandbox.stop();}catch{logger?.warn('coding runner cleanup failed');}}}
 }};
}