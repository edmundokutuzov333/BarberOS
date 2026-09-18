# notify-dispatch

Dispatcher server-side da fila de notificacoes do BarberOS.

## Responsabilidade

Consume `public.notifications` atraves das RPCs de claim e transicao de estado.

Fluxo:

```
queued
  -> claim atomico
  -> provider
  -> sent
ou
  -> retry com backoff
ou
  -> failed + fallback WhatsApp
```

A funcao nao expõe a fila nem credenciais ao browser.

## Endpoint

`POST /functions/v1/notify-dispatch`

Body opcional:

```json
{ "limit": 25 }
```

Limite aceite: 1 a 100. A autenticacao e service-to-service.

## Secrets

```text
BARBEROS_PUBLIC_URL=https://app.example
RESEND_API_KEY=
NOTIFICATION_EMAIL_FROM=BarberOS <no-reply@example.com>

WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_GRAPH_VERSION=v26.0
WHATSAPP_TEMPLATES_JSON={}
```

O dominio publico e usado para gerar links de gestao e de oferta.

Para WhatsApp, pode ser configurado um template aprovado por evento:

```json
{
  "appointment_confirmed": {
    "name": "appointment_confirmed",
    "language": "pt_PT",
    "body_params": ["customer_name", "shop_name", "service_name", "date", "time", "manage_url"]
  }
}
```

Sem template configurado, o adapter tenta mensagem de texto livre. As regras da conta WhatsApp Business podem exigir template conforme a janela de conversa do fornecedor.

Para email, o adapter usa Resend e uma chave de idempotencia baseada no UUID da notificacao.

## Fallback

Cada mensagem elegivel gera um URL `wa.me` com a mensagem pre-preenchida. Em falha de email, o dispatcher tenta WhatsApp automaticamente quando o provider esta configurado. Em falha sem entrega, o URL fica guardado para a equipa enviar manualmente pela Area de Notificacoes.

## Retry

Maximo de cinco tentativas. Backoff: 30s, 2m, 10m, 30m e 2h.

Trabalhos presos em `processing` ha mais de 10 minutos sao recuperados pelo proprio dispatcher.

Cron e orquestracao temporal ficam na FASE 15.
