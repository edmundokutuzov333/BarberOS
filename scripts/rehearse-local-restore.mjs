import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const image='public.ecr.aws/supabase/postgres@sha256:965e2dfb5a23a0d6541b6106541e777b303656ebabd4e878746b189d550c0a66';
export function validateRestoreTarget(name, host) {
  if(typeof name!=='string'||!/^barberos_restore_[a-z0-9_]{1,44}$/.test(name))throw new Error('Only an explicitly named barberos_restore_ target is allowed');
  if(typeof host!=='string'||!/^unix:\/\/\/.+/.test(host))throw new Error('An explicit local Unix DOCKER_HOST is required');
}
export function validateOwnedTarget(config, digest) {
  if(config?.HostConfig?.NetworkMode!=='none'||config.Config?.Labels?.['barberos.restore-rehearsal']!=='true'||config.Config.Labels['barberos.restore-package']!==digest)throw new Error('Existing target is not an isolated rehearsal for this package');
}
export function decryptRestorePackage(envelope, keyText) {
  if(!/^[0-9a-f]{64}$/i.test(keyText.trim()))throw new Error('Invalid backup key format');
  if(envelope?.algorithm!=='aes-256-gcm')throw new Error('Unsupported encrypted archive');
  const iv=Buffer.from(envelope.iv,'base64'),tag=Buffer.from(envelope.tag,'base64');
  if(iv.length!==12||tag.length!==16)throw new Error('Invalid encrypted archive envelope');
  const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(keyText.trim(),'hex'),iv);decipher.setAuthTag(tag);
  const plain=Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]);
  const digest=crypto.createHash('sha256').update(plain).digest('hex');
  if(digest!==envelope.sha256)throw new Error('Backup digest mismatch');
  const data=JSON.parse(plain);
  if(data.format!=='barberos-local-restore-v1'||!['dump_base64','globals_without_role_passwords','graphql_bootstrap','pgsodium_root_key_base64'].every(k=>typeof data[k]==='string'&&data[k].length))throw new Error('Incomplete restore package');
  return {data,digest};
}
function argumentsFrom(argv) {
  const result={};
  for(let i=0;i<argv.length;i++) {
    if(argv[i]==='--resume'){result.resume=true;continue;}
    if(!['--archive','--key','--manifest','--rowsets','--target','--output'].includes(argv[i])||!argv[i+1])throw new Error('Required: --archive --key --manifest --rowsets --target [--output] [--resume]');
    result[argv[i].slice(2)]=argv[++i];
  }
  for(const key of ['archive','key','manifest','rowsets','target'])if(!result[key])throw new Error('Missing --'+key);
  return result;
}
export async function rehearse(options) {
  validateRestoreTarget(options.target,process.env.DOCKER_HOST);
  const {data,digest}=decryptRestorePackage(JSON.parse(fs.readFileSync(options.archive,'utf8')),fs.readFileSync(options.key,'utf8'));
  const expected=JSON.parse(fs.readFileSync(options.manifest,'utf8'));
  const expectedRowsets=JSON.parse(fs.readFileSync(options.rowsets,'utf8'));
  if(!Array.isArray(expected.tables)||!Array.isArray(expectedRowsets.checks)||!expectedRowsets.matchingRowsets)throw new Error('Incomplete expected restore evidence');
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'barberos-restore-'));fs.chmodSync(work,0o700);
  const logPath=path.join(work,'restore.log'),log=fs.openSync(logPath,'w',0o600);
  const env={...process.env,POSTGRES_PASSWORD:crypto.randomBytes(32).toString('hex')};
  const target=options.target;
  function docker(args,input,privateLog=false) {
    if(args[0]==='exec'&&args.includes(target))args.splice(1,0,'--env','PGPASSWORD');
    const r=spawnSync('docker',args,{env,input,encoding:privateLog?undefined:'utf8',maxBuffer:64*1024*1024,stdio:privateLog?['pipe',log,log]:undefined});
    if(r.status!==0){if(r.stderr)fs.writeSync(log,r.stderr);throw new Error('Restore operation failed; inspect private log '+logPath);}
    return r.stdout;
  }
  const inspect=spawnSync('docker',['inspect',target],{env,encoding:'utf8'});
  if(inspect.status===0) {
    if(!options.resume)throw new Error('Target already exists; inspect it before an explicit --resume');
    validateOwnedTarget(JSON.parse(inspect.stdout)[0],digest);
  } else {
    if(options.resume)throw new Error('Resume target does not exist');
    docker(['run','--name',target,'--network','none','--memory','1g','--cpus','1','--label','barberos.restore-rehearsal=true','--label','barberos.restore-package='+digest,'--env','POSTGRES_PASSWORD','-d',image]);
  }
  const config=JSON.parse(docker(['inspect',target]))[0];validateOwnedTarget(config,digest);
  env.PGPASSWORD=config.Config.Env.find(v=>v.startsWith('POSTGRES_PASSWORD=')).slice('POSTGRES_PASSWORD='.length);
  async function ready() {
    for(let i=0;i<60;i++){const r=spawnSync('docker',['exec',target,'pg_isready','-U','postgres'],{env,stdio:'ignore'});if(r.status===0)return;await new Promise(resolve=>setTimeout(resolve,500));}
    throw new Error('Restore target did not become ready; inspect '+logPath);
  }
  await ready();
  console.log('Restoring the authenticated package to an isolated local target');
  const globals=data.globals_without_role_passwords.replace(/^CREATE ROLE (.+);$/gm,(_,name)=>`DO $restore_role$ BEGIN CREATE ROLE ${name}; EXCEPTION WHEN duplicate_object THEN NULL; END $restore_role$;`);
  docker(['exec','-i',target,'psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],globals,true);
  docker(['exec','-i',target,'sh','-c','umask 077; cat > /etc/postgresql-custom/pgsodium_root.key; chown postgres:postgres /etc/postgresql-custom/pgsodium_root.key; chmod 600 /etc/postgresql-custom/pgsodium_root.key'],Buffer.from(data.pgsodium_root_key_base64,'base64'),true);
  docker(['restart',target]);await ready();
  const dump=path.join(work,'database.dump');fs.writeFileSync(dump,Buffer.from(data.dump_base64,'base64'),{mode:0o600});
  const toc=docker(['exec','-i',target,'pg_restore','-l'],fs.readFileSync(dump));
  const deferred=toc.split('\n').filter(line=>/ ACL graphql_public FUNCTION graphql\(/.test(line));
  if(deferred.length!==1)throw new Error('Unexpected GraphQL bootstrap dependency');
  const mainToc=toc.split('\n').filter(line=>!deferred.includes(line)).join('\n');
  docker(['cp',dump,target+':/tmp/barberos-restore.dump']);
  // This operation is limited by the strict name, ownership labels, package
  // digest and no-network checks above; it cannot target the source database.
  for(const sql of ['DROP DATABASE postgres WITH (FORCE)','CREATE DATABASE postgres OWNER postgres TEMPLATE template0'])docker(['exec',target,'psql','-U','supabase_admin','-d','template1','-v','ON_ERROR_STOP=1','-c',sql],undefined,true);
  docker(['exec','-i',target,'pg_restore','-U','supabase_admin','-d','postgres','--exit-on-error','--use-list','/dev/stdin','/tmp/barberos-restore.dump'],mainToc,true);
  docker(['exec','-i',target,'psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],data.graphql_bootstrap,true);
  docker(['exec','-i',target,'pg_restore','-U','supabase_admin','-d','postgres','--exit-on-error','--use-list','/dev/stdin','/tmp/barberos-restore.dump'],deferred.join('\n')+'\n',true);
  const query=sql=>docker(['exec','-i',target,'psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],sql);
  const manifestSql=fs.readFileSync(new URL('./schema-manifest.sql',import.meta.url),'utf8');
  const actual=JSON.parse(query(manifestSql));
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Restored schema manifest differs');
  const q=name=>'"'+name.replaceAll('"','""')+'"';
  const parts=expectedRowsets.checks.map(t=>{
    if(!['public','private','auth','vault'].includes(t.schema)||!/^[_a-z][_a-z0-9]*$/.test(t.table))throw new Error('Unexpected rowset identity');
    return `select jsonb_build_object('schema','${t.schema}','table','${t.table}','rows',count(*),'rowset_sha256',encode(extensions.digest(coalesce(string_agg(md5(row_to_json(t)::text),'|' order by md5(row_to_json(t)::text)),''),'sha256'),'hex')) as result from ${q(t.schema)}.${q(t.table)} t`;
  });
  const rows=JSON.parse(query("select jsonb_agg(result order by result->>'schema',result->>'table') from ("+parts.join(' union all ')+') checked;'));
  if(JSON.stringify(rows)!==JSON.stringify(expectedRowsets.checks))throw new Error('Restored rowsets differ');
  const vaultCount=Number(query('select count(*) from vault.decrypted_secrets where decrypted_secret is not null;').trim());
  if(vaultCount!==rows.find(t=>t.schema==='vault'&&t.table==='secrets')?.rows)throw new Error('Restored Vault authentication failed');
  const receipt={scope:'Local SQL restore only; no cloud disaster-recovery certification',target,image,archiveSha256:digest,network:'none',schemaMatch:true,matchingRowsetTables:rows.length,vaultRecordsAuthenticated:vaultCount,privateLog:logPath};
  const receiptPath=options.output??path.join(work,'receipt.json');fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2),{mode:0o600});
  // Remove only plaintext artifacts created by this process after verification.
  fs.unlinkSync(dump);docker(['exec',target,'rm','/tmp/barberos-restore.dump']);fs.closeSync(log);
  console.log(JSON.stringify(receipt));return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))rehearse(argumentsFrom(process.argv.slice(2))).catch(error=>{console.error(error.message);process.exitCode=1;});
