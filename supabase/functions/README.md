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
| `gmail-integration` | OAuth Google, ligação Gmail por barbearia, caixa de entrada, leitura de conversas e envio de respostas com tokens cifrados |
| `google-calendar` | OAuth do cliente para inserir/actualizar a sua marcação no Google Calendar, sem guardar tokens de acesso |

O código partilhado encontra-se em `_shared/`, incluindo guards de runtime e adapters de pagamentos.

### Gmail

`gmail-integration` aceita acções autenticadas `status`, `connect`, `disconnect`, `list`, `thread` e `send`. O callback OAuth do Google é recebido por GET; os pedidos de gestão usam Supabase Bearer JWT e são validados no servidor como owner/manager da barbearia indicada.

A ligação exige `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI`, `GMAIL_APP_URL`, `GMAIL_TOKEN_ENCRYPTION_KEY` (mínimo 32 caracteres) e `ALLOWED_ORIGINS`. Os tokens são cifrados com AES-GCM antes da persistência. A função requer a migration `20261021130000_gmail_workspace_integration.sql`. Nunca configurar estes valores com prefixo `VITE_` e nunca registar tokens ou conteúdo integral de email nos logs.

O Google Cloud deve ter Gmail API activada e o URI de callback autorizado exactamente igual a `https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/gmail-integration`. Os escopos `gmail.readonly` e `gmail.send` podem exigir verificação OAuth/revisão do Google antes da disponibilização pública.

### Google Calendar do cliente

`google-calendar` insere o evento directamente no calendário principal da conta Google do cliente, após autorização OAuth. Usa o âmbito mínimo `https://www.googleapis.com/auth/calendar.events.owned`, valida o token de gestão e o estado activo da marcação, aplica limites de pedidos, protege o estado OAuth com AES-GCM e usa IDs determinísticos para não duplicar eventos. Os tokens de acesso não são persistidos; a autorização do Google é necessária e pode ser recusada sem afectar a marcação.

Configurar no Supabase Secrets, apenas no servidor: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` e `GOOGLE_CALENDAR_STATE_SECRET` (mínimo 32 caracteres). `GOOGLE_CALENDAR_APP_URL` é opcional e por defeito usa a URL de produção BarberOS. Nunca usar o prefixo `VITE_` nestes segredos.

No Google Cloud, activar Google Calendar API, configurar o ecrã de consentimento e adicionar exactamente `https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/google-calendar` como URI de redireccionamento autorizado no cliente OAuth Web. O âmbito `calendar.events.owned` autoriza a criação de eventos em calendários que pertencem ao utilizador. Uma aplicação pública pode precisar da verificação OAuth da Google antes da disponibilização geral.

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
