import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { configureIsolatedStack } from './prepare-isolated-supabase.mjs';
const source='project_id = "production"\n[api]\nenabled = true\n[db]\nport = 54322\n[studio]\nport = 54323\n[functions.health]\nverify_jwt = false\n';
test('isolated ports preserve settings and do not duplicate existing fields',()=>{
  const result=configureIsolatedStack(source,'ci_123',[31001,31002,31003,31004]);
  assert.match(result,/project_id = "ci_123"/);assert.match(result,/\[api\]\nport = 31001\nenabled = true/);
  assert.match(result,/\[db\]\nshadow_port = 31003\nport = 31002/);
  assert.match(result,/\[studio\]\nport = 31004/);assert.match(result,/\[functions.health\]\nverify_jwt = false/);
  assert.equal(configureIsolatedStack(result,'ci_123',[31001,31002,31003,31004]),result);
});
test('invalid project identity, duplicate ports or missing sections fail closed',()=>{
  assert.throws(()=>configureIsolatedStack(source,'../project',[31001,31002,31003,31004]));
  assert.throws(()=>configureIsolatedStack(source,'ci',[31001,31001,31003,31004]));
  assert.throws(()=>configureIsolatedStack('project_id = "x"','ci',[31001,31002,31003,31004]));
});
test('runner exports the allocated database port and preserves existing environment entries',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'barberos-ci-config-'));
  try {
    fs.mkdirSync(path.join(dir,'supabase'));
    fs.writeFileSync(path.join(dir,'supabase/config.toml'),source);
    const envFile=path.join(dir,'github.env');
    fs.writeFileSync(envFile,'EXISTING=value\n');
    const result=spawnSync(process.execPath,[new URL('./prepare-isolated-supabase.mjs',import.meta.url).pathname],{
      cwd:dir,encoding:'utf8',env:{...process.env,BARBEROS_LOCAL_PROJECT_ID:'ci_runner_test',GITHUB_ENV:envFile},
    });
    assert.equal(result.status,0,result.stderr);
    const allocated=JSON.parse(result.stdout);
    assert.equal(new Set([allocated.api_port,allocated.db_port,allocated.shadow_port,allocated.studio_port]).size,4);
    assert.match(fs.readFileSync(path.join(dir,'supabase/config.toml'),'utf8'),new RegExp(`port = ${allocated.db_port}`));
    assert.equal(fs.readFileSync(envFile,'utf8'),`EXISTING=value\nBARBEROS_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:${allocated.db_port}/postgres\n`);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
