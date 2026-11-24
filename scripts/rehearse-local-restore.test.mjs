import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {validateRestoreTarget,validateOwnedTarget,decryptRestorePackage} from './rehearse-local-restore.mjs';
test('restore target names cannot identify an existing source or cloud resource',()=>{
 for(const name of ['postgres','supabase_db_alseiinjzwjdiwtvkdzy','prod','barberos_restore_','barberos_restore_a/b'])assert.throws(()=>validateRestoreTarget(name,'unix:///var/run/docker.sock'));
 assert.doesNotThrow(()=>validateRestoreTarget('barberos_restore_package_20261124','unix:///var/run/docker.sock'));
});
test('remote Docker hosts are rejected before any mutation',()=>{for(const host of [undefined,'tcp://remote:2375','ssh://prod','unix://'])assert.throws(()=>validateRestoreTarget('barberos_restore_safe',host));});
test('resume requires both isolation and exact owned-package labels',()=>{
 const config={HostConfig:{NetworkMode:'none'},Config:{Labels:{'barberos.restore-rehearsal':'true','barberos.restore-package':'digest'}}};
 assert.doesNotThrow(()=>validateOwnedTarget(config,'digest'));
 assert.throws(()=>validateOwnedTarget(config,'other'));
 assert.throws(()=>validateOwnedTarget({...config,HostConfig:{NetworkMode:'bridge'}},'digest'));
 assert.throws(()=>validateOwnedTarget({HostConfig:{NetworkMode:'none'},Config:{Labels:{}}},'digest'));
});
function archive(){const key=crypto.randomBytes(32),iv=crypto.randomBytes(12);const payload=Buffer.from(JSON.stringify({format:'barberos-local-restore-v1',dump_base64:'dGVzdA==',globals_without_role_passwords:'roles',graphql_bootstrap:'proxy',pgsodium_root_key_base64:'a2V5'}));const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);return{key:key.toString('hex'),envelope:{algorithm:'aes-256-gcm',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64'),sha256:crypto.createHash('sha256').update(payload).digest('hex')}};}
test('authenticated packages decrypt without exposing key values',()=>{const a=archive();assert.equal(decryptRestorePackage(a.envelope,a.key).data.format,'barberos-local-restore-v1');});
test('tampered ciphertext, wrong keys and altered metadata cannot pass restore authentication',()=>{
 const a=archive();assert.throws(()=>decryptRestorePackage(a.envelope,'00'.repeat(32)));assert.throws(()=>decryptRestorePackage({...a.envelope,tag:Buffer.alloc(16).toString('base64')},a.key));assert.throws(()=>decryptRestorePackage({...a.envelope,sha256:'invalid'},a.key));
});
