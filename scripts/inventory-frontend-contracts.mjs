import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFrontend = createRequire(path.join(root, 'frontend/package.json'));
const babel = requireFrontend('@babel/core');
const unwrap = value => {
  while (value && ['TSAsExpression','TSTypeAssertion','TSNonNullExpression','ParenthesizedExpression'].includes(value.type)) value = value.expression;
  return value;
};
function chain(node) {
  node = unwrap(node);
  if (node?.type === 'Identifier') return [node.name];
  if (!['MemberExpression','OptionalMemberExpression'].includes(node?.type)) return [];
  const name = node.computed ? node.property.type === 'StringLiteral' ? node.property.value : null : node.property.name;
  const before = chain(node.object);
  return name && before.length ? [...before,name] : [];
}
function literal(node) {
  node = unwrap(node);
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked;
  return null;
}
function propertyKeys(node) {
  node = unwrap(node);
  if (!node) return { keys: [], opaque: false };
  if (node.type !== 'ObjectExpression') return { keys: [], opaque: true };
  return {
    keys: node.properties.filter(p => p.type === 'ObjectProperty' && !p.computed).map(p => p.key.name ?? p.key.value).filter(k => typeof k === 'string').sort(),
    opaque: node.properties.some(p => p.type !== 'ObjectProperty' || p.computed),
  };
}
const descendants = node => node?.type === 'JSXIdentifier' ? node.name : '';
function attribute(element, name) {
  const entry = element.attributes.find(a => a.type === 'JSXAttribute' && a.name.name === name);
  return entry?.value?.type === 'JSXExpressionContainer' ? literal(entry.value.expression) : literal(entry?.value);
}
function functionName(nodePath) {
  const fn = nodePath.getFunctionParent();
  return fn?.node.id?.name ?? (fn?.parentPath?.node.type === 'VariableDeclarator' ? fn.parentPath.node.id.name : null);
}
function finiteStrings(type, aliases, seen = new Set()) {
  if (!type) return null;
  if (type.type === 'TSLiteralType') return type.literal.type === 'StringLiteral' ? [type.literal.value] : null;
  if (type.type === 'TSTypeReference' && type.typeName.type === 'Identifier') {
    const key = type.typeName.name;
    if (seen.has(key)) return null;
    return finiteStrings(aliases.get(key),aliases,new Set([...seen,key]));
  }
  if (type.type === 'TSUnionType') {
    const values=type.types.map(t=>finiteStrings(t,aliases,seen));
    return values.every(Boolean) ? [...new Set(values.flat())] : null;
  }
  return null;
}
function parameterType(nodePath, name, aliases) {
  for (let fn=nodePath.getFunctionParent(); fn; fn=fn.getFunctionParent()) {
    for (const param of fn.node.params) {
      if(param.type === 'Identifier' && param.name === name) return finiteStrings(param.typeAnnotation?.typeAnnotation,aliases);
      if(param.type === 'ObjectPattern' && param.properties.some(p=>p.type==='ObjectProperty'&&p.value.name===name)) {
        const annotation=param.typeAnnotation?.typeAnnotation;
        const property=annotation?.type==='TSTypeLiteral' ? annotation.members.find(p=>p.type==='TSPropertySignature'&&p.key.name===name) : null;
        return finiteStrings(property?.typeAnnotation?.typeAnnotation,aliases);
      }
    }
  }
  return null;
}

export function inspectSource(source, file) {
  const ast=babel.parseSync(source,{filename:file,configFile:false,babelrc:false,parserOpts:{sourceType:'module',plugins:['typescript','jsx']}});
  const clients=new Set(); const aliases=new Map(); const wrappers=new Map(); const calls=[]; const routes=[];
  babel.traverse(ast,{
    ImportDeclaration(p) {
      if (!/(?:^|\/)supabase$/.test(p.node.source.value)) return;
      for(const s of p.node.specifiers) if(s.type==='ImportSpecifier' && s.imported.name==='supabase') clients.add(s.local.name);
    },
    TSTypeAliasDeclaration(p) { aliases.set(p.node.id.name,p.node.typeAnnotation); },
  });
  const directKind = callee => {
    const parts=chain(callee); if(!clients.has(parts[0])) return null;
    if(parts.length===2 && parts[1]==='rpc') return 'rpc';
    if(parts.length===3 && parts[1]==='functions' && parts[2]==='invoke') return 'edge';
    if(parts.length===2 && parts[1]==='from') return 'table';
    if(parts.length===3 && parts[1]==='storage' && parts[2]==='from') return 'storage';
    if(parts.length===3 && parts[1]==='auth') return 'auth';
    return null;
  };
  // Resolve local forwarding helpers by their parameter, not by guessing names.
  babel.traverse(ast,{CallExpression(p) {
    const kind=directKind(p.node.callee); const argument=unwrap(p.node.arguments[0]);
    if(!['rpc','edge'].includes(kind) || argument?.type!=='Identifier') return;
    let fn=p.getFunctionParent();
    while(fn) {
      const index=fn.node.params.findIndex(param=>param.type==='Identifier'&&param.name===argument.name);
      if(index>=0) { const name=fn.node.id?.name??(fn.parentPath.node.type==='VariableDeclarator'?fn.parentPath.node.id.name:null); if(name)wrappers.set(name,{kind,index}); break; }
      fn=fn.getFunctionParent();
    }
  }});
  babel.traverse(ast,{
    CallExpression(p) {
      let kind=directKind(p.node.callee); let first=0; let via=null;
      if(!kind && p.node.callee.type==='Identifier' && wrappers.has(p.node.callee.name)) {
        const wrapper=wrappers.get(p.node.callee.name); kind=wrapper.kind; first=wrapper.index; via=p.node.callee.name;
      }
      if(!kind) return;
      const argument=unwrap(p.node.arguments[first]);
      let names=kind==='auth'?[chain(p.node.callee).at(-1)]:literal(argument)!==null?[literal(argument)]:null;
      if(!names && argument?.type==='Identifier') names=parameterType(p,argument.name,aliases);
      const forwarding = !via && ['rpc','edge'].includes(kind) && [...wrappers.entries()].some(([name,w])=>w.kind===kind&&name===functionName(p));
      const payload=propertyKeys(p.node.arguments[first+1]);
      calls.push({kind,names:names??[],dynamic:!names,forwarding,file,line:p.node.loc.start.line,owner:functionName(p),via,payload_keys:payload.keys,opaque_payload:payload.opaque});
    },
    JSXOpeningElement(p) {
      if(descendants(p.node.name)!=='Route') return;
      const own=attribute(p.node,'path'); const index=p.node.attributes.some(a=>a.type==='JSXAttribute'&&a.name.name==='index');
      if(own===null&&!index) return;
      const parents=[];
      for(let parent=p.parentPath.parentPath;parent;parent=parent.parentPath) {
        if(parent.node.type==='JSXElement' && descendants(parent.node.openingElement.name)==='Route') {
          const value=attribute(parent.node.openingElement,'path'); if(value!==null)parents.unshift(value);
        }
      }
      let resolved='';for(const segment of [...parents,...(own===null?[]:[own])]) resolved=segment.startsWith('/')?segment:resolved.replace(/\/$/,'')+'/'+segment;
      routes.push({path:resolved||'/',declared_path:own,index,file,line:p.node.loc.start.line});
    },
  });
  return {calls,routes};
}

export function inventory(projectRoot=root) {
  const calls=[];const routes=[];let files=0;
  function walk(dir) { for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const full=path.join(dir,e.name);
    if(e.isDirectory())walk(full);
    else if(/\.[cm]?[jt]sx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
      const result=inspectSource(fs.readFileSync(full,'utf8'),path.relative(projectRoot,full));calls.push(...result.calls);routes.push(...result.routes);files++;
    }
  }}
  walk(path.join(projectRoot,'frontend/src'));
  const names=kind=>[...new Set(calls.filter(c=>c.kind===kind).flatMap(c=>c.names))].sort();
  return {scope:'Static source inventory; presence is not runtime contract acceptance',source_files_parsed:files,rpc_names:names('rpc'),edge_names:names('edge'),table_names:names('table'),storage_buckets:names('storage'),auth_methods:names('auth'),unresolved_dynamic_calls:calls.filter(c=>c.dynamic&&!c.forwarding),routes,calls};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) process.stdout.write(JSON.stringify(inventory(),null,2)+'\n');
