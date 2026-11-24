'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../reserve-release.cjs'), 'utf8');
function exercise({ duplicates = false, advance = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'barberos-reservation-test-'));
  const output = path.join(directory, 'output');
  let head = 'a'.repeat(40), posts = 0, lists = 0;
  try {
    vm.runInNewContext(source, {
      process: { env: { GITHUB_REPOSITORY: 'example/barberos', NATIVE_VERSION: '1.0.99', GITHUB_OUTPUT: output } },
      console: { log() {} },
      require(name) {
        if (name !== 'node:child_process') return require(name);
        return { execFileSync(command, args) {
          assert.equal(command, 'gh');
          if (args.includes('--slurp')) {
            lists++;
            const existing = { id: 123, tag_name: 'native-v1.0.99', draft: true, target_commitish: head };
            // Deliberately stale after any creation: the regression must use
            // the successful mutation response rather than repeat that write.
            return JSON.stringify(duplicates ? [[existing, { ...existing, id: 124 }]] : [[]]);
          }
          if (args.some(value => value.endsWith('/commits/main'))) return JSON.stringify({ sha: head });
          if (args.some(value => value.includes('/compare/'))) return JSON.stringify({ status: 'identical' });
          assert.ok(args.includes('POST'));
          posts++;
          if (advance && posts === 1) {
            head = 'b'.repeat(40);
            throw Object.assign(new Error('permission denied on the superseded workflow source'), { stderr: 'HTTP 403: Resource not accessible by integration' });
          }
          assert.ok(args.includes(`target_commitish=${head}`));
          return JSON.stringify({ id: 123, tag_name: 'native-v1.0.99', draft: true, target_commitish: head });
        } };
      },
    }, { filename: 'reserve-release.cjs' });
    return { posts, lists, output: fs.readFileSync(output, 'utf8') };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
test('successful reservation is never repeated when listings lag behind the mutation', () => {
  const result = exercise();
  assert.equal(result.posts, 1);
  assert.equal(result.lists, 1);
  assert.match(result.output, /release_id=123/);
  assert.match(result.output, new RegExp('source_sha=' + 'a'.repeat(40)));
});
test('permission failure caused by moving main retries the new source before a build starts', () => {
  const result = exercise({ advance: true });
  assert.equal(result.posts, 2);
  assert.match(result.output, new RegExp('source_sha=' + 'b'.repeat(40)));
});
test('ambiguous existing drafts are rejected without creating another draft', () => {
  assert.throws(() => exercise({ duplicates: true }), /Ambiguous draft reservation/);
});
