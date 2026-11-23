import assert from 'node:assert/strict';
import test from 'node:test';
import { compareSchemaManifests } from './compare-schema-manifests.mjs';

const empty = () => Object.fromEntries(['tables','columns','constraints','indexes','functions','policies','triggers','views','enums','grants','extensions'].map(key => [key,[]]));
test('manifest comparison ignores object property and row ordering', () => {
  const expected=empty(), actual=empty();
  expected.tables=[{schema:'public',name:'a',rls:true},{schema:'public',name:'b',rls:true}];
  actual.tables=[{rls:true,name:'b',schema:'public'},{name:'a',schema:'public',rls:true}];
  assert.equal(compareSchemaManifests(expected,actual).status,'SCHEMA_MATCH');
});
test('schema drift distinguishes missing, extra and changed contracts', () => {
  const expected=empty(),actual=empty();
  expected.tables=[{schema:'public',name:'a',rls:true},{schema:'public',name:'b',rls:true}];
  actual.tables=[{schema:'public',name:'a',rls:false},{schema:'public',name:'c',rls:true}];
  assert.deepEqual(compareSchemaManifests(expected,actual).differences.tables,{missing:['public||b'],extra:['public||c'],changed:['public||a']});
});
test('incomplete or duplicate manifests cannot certify a database', () => {
  assert.throws(()=>compareSchemaManifests({},empty()),/SCHEMA_MANIFEST_INVALID/);
  const duplicate=empty();duplicate.tables=[{name:'a'},{name:'a'}];
  assert.throws(()=>compareSchemaManifests(duplicate,empty()),/SCHEMA_IDENTITY_DUPLICATE/);
});
test('overloaded functions have distinct identities and changed definitions are detected', () => {
  const expected=empty(),actual=empty();
  expected.functions=[{name:'get',arguments:'id uuid',definition_md5:'one'},{name:'get',arguments:'id text',definition_md5:'two'}];
  actual.functions=[{name:'get',arguments:'id uuid',definition_md5:'new'},{name:'get',arguments:'id text',definition_md5:'two'}];
  assert.deepEqual(compareSchemaManifests(expected,actual).differences.functions.changed,['|get|id uuid']);
});
