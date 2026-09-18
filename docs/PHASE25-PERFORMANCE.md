# BarberOS FASE 25: performance pública

A FASE 25 transforma performance em um contrato mensurável, sem mover lógica de negócio para o frontend.

## Arquitectura

A página pública continua a seguir:

React/Vite
↓
TanStack Query
↓
Supabase RPC get_public_barbershop()
↓
PostgreSQL

A performance foi melhorada nos pontos que realmente influenciam o primeiro carregamento:

- code splitting por rota, deixando páginas internas e administração fora do bundle público inicial;
- build manifest para medir o grafo real carregado pela página pública;
- imagens above-the-fold com prioridade alta e decoding assíncrono;
- imagens secundárias com loading lazy e decoding assíncrono;
- conteúdo abaixo da dobra com content-visibility;
- stylesheet de fonte não bloqueante;
- índices tenant-scoped para services, haircuts, barbers e reviews usados pelo RPC público.

## Budgets

O CI bloqueia a regressão quando o bundle inicial da página pública ultrapassa:

- JavaScript gzip: 300 KB
- JavaScript Brotli: 250 KB
- CSS gzip: 80 KB
- total inicial gzip: 360 KB

Estes budgets são deliberadamente aplicados ao grafo real de main.tsx mais PublicBarbershop.tsx. Chunks de dashboards, admin e outras rotas não entram no primeiro carregamento da página pública.

## Web Vitals e 3G

frontend/tests/e2e/phase25-performance.spec.mjs usa Chromium CDP para simular Fast 3G com cache desactivada.

Critérios:

- LCP ≤ 2500 ms
- CLS ≤ 0,10
- DOMContentLoaded ≤ 1800 ms
- roundtrip do RPC público, quando observável, ≤ 1200 ms
- interacção de laboratório, quando observável, ≤ 200 ms

O teste mede ainda TTFB, tempo de carregamento, RPC observado e o maior evento de interacção.

## Backend

A baseline observada antes da migração no slug público oryon foi:

- payload do RPC: 6293 bytes
- execução SQL medida: 5,958 ms

Os novos índices não alteram o contrato nem os dados públicos. Foram criados para evitar scans desnecessários à medida que cada tenant cresce.

## Release gate

A FASE 25 só pode ser considerada fechada quando:

1. budgets do build passam;
2. contratos frontend passam;
3. TypeScript passa;
4. benchmark Fast 3G passa;
5. contrato SQL passa no ambiente de base de dados dedicado;
6. a migração de índices está aplicada e registada no Supabase.

Nenhuma medição de performance mutante é executada contra a produção. A página pública pode usar o RPC de produção em modo read-only para benchmark de rede e Web Vitals.
