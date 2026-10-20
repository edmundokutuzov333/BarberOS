# BarberOS Frontend

Esta pasta contém a aplicação React/Vite do BarberOS. A documentação central do produto, arquitectura, ambiente, rotas, domínios, testes e deployment está no [README principal](../README.md).

## Stack

- Node.js 22 e Corepack + Yarn 1.22.22
- React 19, TypeScript e Vite
- React Router e TanStack Query
- Supabase JS, Auth e RPC
- Tailwind CSS, Radix UI e tokens CSS
- Playwright e axe-core para browser testing e acessibilidade
- Vite PWA plugin para manifest e service worker

## Desenvolvimento

Na pasta `frontend/`:

```sh
corepack enable
corepack yarn install --frozen-lockfile
cp .env.example .env.local
corepack yarn start
```

Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com valores de desenvolvimento. Nunca colocar service-role keys, passwords ou secrets de providers em variáveis `VITE_*`.

## Comandos de validação

```sh
corepack yarn lint
corepack yarn typecheck
corepack yarn test
corepack yarn a11y:phase21
corepack yarn test:e2e:smoke
corepack yarn perf:budget
corepack yarn build
```

Os comandos de browser podem construir e servir o build local, conforme a configuração do Playwright. Testes que precisam de autenticação, dados de negócio ou chamadas mutáveis exigem um ambiente dedicado.

## Convenções

- As páginas ficam em `src/pages`.
- As APIs e hooks de domínio ficam em `src/features`.
- A autenticação, permissões, cliente Supabase e tipos partilhados ficam em `src/lib`.
- Os componentes globais ficam em `src/components`.
- O contrato de rotas encontra-se em `src/App.tsx`.
- O sistema visual runtime está em `src/styles/tokens.css` e `src/index.css`.

Não duplicar no frontend as regras críticas de disponibilidade, concorrência, sinal ou transições de estado que pertencem ao PostgreSQL. Consultar o README principal e os runbooks de domínio antes de alterar um fluxo.
