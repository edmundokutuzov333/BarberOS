# BarberOS FASE 14: Notifications Engine

A FASE 14 transforma a fila public.notifications num sistema de entrega operacional.

## Contrato de serviço

Os eventos produzidos pelo dominio entram na mesma fila:

- appointment_pending
- appointment_confirmed
- appointment_cancelled
- appointment_rescheduled
- reminder_24h
- reminder_1h
- waitlist_offer
- review_request

Os canais sao whatsapp e email.

A camada PostgreSQL controla o ciclo:

~~~
queued
  -> processing
  -> sent

queued
  -> processing
  -> queued + next_attempt_at
  -> ...
  -> failed
~~~

A fila nao e lida nem escrita directamente pelo browser.

## Concorrencia

claim_notifications usa FOR UPDATE SKIP LOCKED e devolve apenas os IDs que a transacao actual marcou como processing.

Isso permite varios workers sem que um worker tente processar o lote reclamado por outro.

Trabalhos presos em processing ha mais de 10 minutos sao recuperados por recover_stuck_notifications.

## Retry

Sao permitidas cinco tentativas totais. Falhas transitorias retornam para a fila com:

- 30 segundos
- 2 minutos
- 10 minutos
- 30 minutos

Na quinta tentativa, a notificacao passa para failed.

Um Owner ou Manager pode colocar manualmente uma falha novamente na fila com retry_notification.

## Providers

O Edge Function notify-dispatch tem dois adapters:

- WhatsApp Cloud API
- Email via Resend

A configuracao vive exclusivamente em secrets/server-side.

Variaveis:

~~~
BARBEROS_PUBLIC_URL
RESEND_API_KEY
NOTIFICATION_EMAIL_FROM
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_GRAPH_VERSION
WHATSAPP_TEMPLATES_JSON
~~~

O browser nunca recebe estes valores.

## WhatsApp

Quando existe um template aprovado em WHATSAPP_TEMPLATES_JSON, o dispatcher usa a mensagem template.

Sem template configurado, o adapter tenta mensagem de texto livre. A disponibilidade desta via depende das regras da conta WhatsApp Business e da janela de conversa.

## Fallback

A cada mensagem com telefone e gerado um URL:

~~~
https://wa.me/<numero>?text=<mensagem>
~~~

Quando o email falha, o dispatcher tenta WhatsApp automaticamente quando esse provider esta configurado.

Quando nao ha entrega automatica, o URL fica persistido em fallback_url e aparece para a equipa em /app/notificacoes.

## Frontend

A nova area operacional e:

~~~
/app/notificacoes
~~~

Mostra:

- fila actual
- jobs em processamento
- falhas
- enviadas hoje
- taxa de entrega dos ultimos 7 dias
- estado e canal
- tentativas
- proxima tentativa
- ultimo erro
- WhatsApp pre-preenchido
- reenvio manual de uma falha

A lista usa RPCs tenant-scoped. O telefone/email real nao e exposto no read model.

A consulta e actualizada periodicamente para reflectir o movimento da fila sem abrir SELECT directo sobre notifications.

## Seguranca

Direct SELECT/INSERT/UPDATE/TRUNCATE em notifications e revogado para anon e authenticated.

Os RPCs de mutacao da entrega (claim_notifications, recover_stuck_notifications, mark_notification_sent, mark_notification_failure) sao exclusivos de service_role.

A leitura operacional passa por get_notifications e get_notification_metrics com verificacao de operador da loja.

## Limite desta fase

A FASE 15 liga o dispatcher a cron e a outros jobs temporais.

As credenciais dos providers externos nao sao inventadas nem colocadas no Git. O Edge Function esta deployado e pronto para receber os secrets de producao.
