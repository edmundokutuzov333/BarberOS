import { strict as assert } from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';

type TestCase = { name: string; run: () => void | Promise<void> };

async function main() {
  const server: ViteDevServer = await createServer({ root: 'frontend', logLevel: 'error', server: { middlewareMode: true } });
  try {
    const { Button } = await server.ssrLoadModule('/src/components/ui/Button.tsx');
    const { StatusChip } = await server.ssrLoadModule('/src/components/ui/StatusChip.tsx');
    const { EmptyState, ErrorState, Panel, Skeleton } = await server.ssrLoadModule('/src/components/ui/States.tsx');
    const { Page } = await server.ssrLoadModule('/src/components/layout/Page.tsx');
    const { SkipLink } = await server.ssrLoadModule('/src/components/ui/SkipLink.tsx');
    const tests: TestCase[] = [
      { name: 'Button defaults to non-submit', run: () => {
        const html = renderToStaticMarkup(React.createElement(Button, null, 'Guardar'));
        assert.match(html, /type="button"/); assert.match(html, />Guardar</);
      }},
      { name: 'Button loading exposes busy state', run: () => {
        const html = renderToStaticMarkup(React.createElement(Button, { loading: true }, 'Guardar'));
        assert.match(html, /aria-busy="true"/); assert.match(html, /disabled/);
      }},
      { name: 'StatusChip renders translated status', run: () => {
        const html = renderToStaticMarkup(React.createElement(StatusChip, { status: 'completed' }));
        assert.match(html, /status-chip-completed/); assert.match(html, /Concluída/);
      }},
      { name: 'Skeleton exposes accessible loading state', run: () => {
        const html = renderToStaticMarkup(React.createElement(Skeleton, { lines: 2 }));
        assert.match(html, /role="status"/); assert.match(html, /aria-busy="true"/);
      }},
      { name: 'EmptyState exposes status semantics', run: () => {
        const html = renderToStaticMarkup(React.createElement(EmptyState, { title: 'Sem marcações', body: 'A agenda está livre.', testId: 'empty' }));
        assert.match(html, /data-testid="empty"/); assert.match(html, /role="status"/); assert.match(html, /Sem marcações/);
      }},
      { name: 'ErrorState exposes alert and retry button', run: () => {
        const html = renderToStaticMarkup(React.createElement(ErrorState, { message: 'Falhou', onRetry: () => undefined }));
        assert.match(html, /role="alert"/); assert.match(html, /aria-live="assertive"/); assert.match(html, /type="button"/);
      }},
      { name: 'Panel labels heading', run: () => {
        const html = renderToStaticMarkup(React.createElement(Panel, { title: 'Agenda' }, 'Conteúdo'));
        assert.match(html, /aria-labelledby="[^"]+"/); assert.match(html, /<h2[^>]*>Agenda<\/h2>/);
      }},
      { name: 'Page labels main heading', run: () => {
        const html = renderToStaticMarkup(React.createElement(Page, { title: 'Clientes', testId: 'page' }, 'Conteúdo'));
        assert.match(html, /data-testid="page"/); assert.match(html, /aria-labelledby="[^"]+"/); assert.match(html, /<h1[^>]*>Clientes<\/h1>/);
      }},
      { name: 'SkipLink points to main content', run: () => {
        const html = renderToStaticMarkup(React.createElement(SkipLink, null));
        assert.match(html, /href="#main-content"/); assert.match(html, /Saltar para o conteúdo/);
      }},
    ];
    let failed = 0;
    for (const test of tests) {
      try { await test.run(); console.log('PASS', test.name); }
      catch (error) { failed++; console.error('FAIL', test.name, error); }
    }
    console.log(`Phase 23 component tests: ${tests.length - failed}/${tests.length} passed.`);
    if (failed) process.exitCode = 1;
  } finally { await server.close(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
