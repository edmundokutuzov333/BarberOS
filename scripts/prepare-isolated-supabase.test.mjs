import test from 'node:test';
import assert from 'node:assert/strict';
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
