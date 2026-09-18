import { strict as assert } from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

async function main() {
  const server = await createServer({ root: process.cwd(), logLevel: 'error', optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true } });
  try {
    const { Button } = await server.ssrLoadModule('/src/components/ui/Button.tsx');
    const { StatusChip } = await server.ssrLoadModule('/src/components/ui/StatusChip.tsx');
    const { EmptyState, ErrorState, Panel, Skeleton } = await server.ssrLoadModule('/src/components/ui/States.tsx');
    const { Page } = await server.ssrLoadModule('/src/components/layout/Page.tsx');
    const { SkipLink } = await server.ssrLoadModule('/src/components/ui/SkipLink.tsx');
    const tests = [
      ['Button defaults to non-submit', () => {
        const html = renderToStaticMarkup(React.createElement(Button, null, 'Guardar'));
        assert.match(html, /type="button"/); assert.match(html, />Guardar</);
      }],
      ['Button loading exposes busy state', () => {
        const html = renderToStaticMarkup(React.createElement(Button, { loading: true }, 'Guardar'));
        assert.match(html, /aria-busy="true"/); assert.match(html, /disabled/);
      }],
      ['StatusChip renders translated status', () => {
        const html = renderToStaticMarkup(React.createElement(StatusChip, { status: 'completed' }));
        assert.match(html, /status-chip-completed/); assert.match(html, /Concluída/);
      }],
      ['Skeleton exposes accessible loading state', () => {
        const html = renderToStaticMarkup(React.createElement(Skeleton, { lines: 2 }));
        assert.match(html, /role="status"/); assert.match(html, /aria-busy="true"/);
      }],
      ['EmptyState exposes status semantics', () => {
        const html = renderToStaticMarkup(React.createElement(EmptyState, { title: 'Sem marcações', body: 'A agenda está livre.', testId: 'empty' }));
        assert.match(html, /data-testid="empty"/); assert.match(html, /role="status"/); assert.match(html, /Sem marcações/);
      }],
      ['ErrorState exposes alert and retry button', () => {
        const html = renderToStaticMarkup(React.createElement(ErrorState, { message: 'Falhou', onRetry: () => undefined }));
        assert.match(html, /role="alert"/); assert.match(html, /aria-live="assertive"/); assert.match(html, /type="button"/);
      }],
      ['Panel labels heading', () => {
        const html = renderToStaticMarkup(React.createElement(Panel, { title: 'Agenda' }, 'Conteúdo'));
        assert.match(html, /aria-labelledby="[^"]+"/); assert.match(html, /<h2[^>]*>Agenda<\/h2>/);
      }],
      ['Page labels main heading', () => {
        const html = renderToStaticMarkup(React.createElement(Page, { title: 'Clientes', testId: 'page' }, 'Conteúdo'));
        assert.match(html, /data-testid="page"/); assert.match(html, /aria-labelledby="[^"]+"/); assert.match(html, /<h1[^>]*>Clientes<\/h1>/);
      }],
      ['SkipLink points to main content', () => {
        const html = renderToStaticMarkup(React.createElement(SkipLink, null));
        assert.match(html, /href="#main-content"/); assert.match(html, /Saltar para o conteúdo/);
      }],
    ];
    let failed = 0;
    for (const [name, run] of tests) {
      try { await run(); console.log('PASS', name); }
      catch (error) { failed++; console.error('FAIL', name, error); }
    }
    console.log('Phase 23 component tests: ' + (tests.length - failed) + '/' + tests.length + ' passed.');
    if (failed) process.exitCode = 1;
  } finally {
    await server.close();
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
