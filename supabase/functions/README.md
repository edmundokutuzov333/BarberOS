# BarberOS Edge Functions

As Edge Functions são as fronteiras server-side do BarberOS para pedidos HTTP públicos ou privilegiados, gestão por token, execução de providers e processamento assíncrono.

A documentação completa está no [README principal](../../README.md), na secção API e Edge Functions.

## Funções versionadas

| Função | Responsabilidade principal |
|---|---|
| `booking-create` | Booking público, protecção anti-abuso e gateway para criação idempotente |
| `token-gateway` | Consulta/cancelamento/remarcação por token, reviews e lista de espera |
| `admin-credential-manager` | Reset controlado e troca obrigatória de palavra-passe |
| `payments-configure` | Configuração de providers |
| `payments-initiate` | Iniciação de pagamentos |
| `payments-status` | Consulta de estado e reconciliação |
| `payments-webhook` | Recepção e verificação de callbacks de provider |
| `payments-reconcile` | Reconciliação de pagamentos pendentes |
| `notify-dispatch` | Entrega de notificações, estados e retries |
| `resend-webhook` | Webhook do provider de email |
| `barber-assets` | Serving de fotografias de referência allowlisted |
| `health` | Verificação técnica de dependência da base de dados |

O código partilhado encontra-se em `_shared/`, incluindo guards de runtime e adapters de pagamentos.

## Contratos obrigatórios

- Validar método, payload, origem e autorização do pedido.
- Usar service role apenas dentro do runtime server-side, nunca como credencial pública.
- Respeitar grants e funções PostgreSQL existentes.
- Aplicar rate limit, idempotência, anti-bot e CORS onde o contrato do endpoint o exige.
- Nunca incluir tokens, PII ou secrets em logs ou respostas públicas.
- Devolver códigos de erro previsíveis e respostas sem cache para fluxos sensíveis.
- Manter o comportamento mutável no domínio PostgreSQL sempre que a atomicidade dependa de transacção.
- Versionar e testar a função no Git antes de a publicar.

A existência do código não prova que a versão da função está activa no Supabase. A compatibilidade entre migrations e Edge Functions deve ser verificada no workflow de release.
