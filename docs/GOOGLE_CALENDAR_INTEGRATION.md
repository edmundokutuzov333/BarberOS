# Google Calendar do cliente

## Comportamento

Na página de uma marcação futura activa, o cliente escolhe **Guardar no Google Calendar**. O BarberOS inicia OAuth, o cliente autoriza a criação do evento e o backend cria o evento na agenda principal da conta Google, regressando depois à página da marcação.

O sistema não descarrega um ficheiro para o percurso Google. O ficheiro `.ics` continua disponível apenas como alternativa para outras aplicações. O evento inclui o nome da barbearia, serviço, barbeiro, duração, morada quando disponível e a ligação de gestão da marcação. Não inclui o telefone do cliente nem envia convites a terceiros.

A integração não lê eventos existentes, não guarda tokens de acesso e não solicita acesso offline. A Google exige consentimento da conta antes de uma aplicação escrever no respectivo calendário. A marcação BarberOS permanece válida se o cliente recusar a autorização.

## Configuração obrigatória de produção

### Google Cloud

1. Criar ou seleccionar um projecto Google Cloud.
2. Activar **Google Calendar API**.
3. Configurar o ecrã de consentimento OAuth com o nome BarberOS, os contactos e os links públicos para a aplicação e para a política de privacidade.
4. Adicionar o âmbito `https://www.googleapis.com/auth/calendar.events.owned`.
5. Criar uma credencial OAuth de tipo **Web application**.
6. Adicionar o URI de redireccionamento autorizado exactamente como segue, sem barra final:

   `https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/google-calendar`

Os âmbitos de Calendar que dão acesso a dados de utilizador podem exigir verificação Google antes da distribuição pública. Verificar a classificação actual e concluir o fluxo de verificação aplicável no Google Cloud Console.

### Supabase Secrets

Configurar estes valores no projecto Supabase de produção `alseiinjzwjdiwtvkdzy`. Não os guardar no Git, num ficheiro frontend, nem em variáveis `VITE_*`.

- `GOOGLE_CALENDAR_CLIENT_ID`: Client ID da credencial OAuth Web.
- `GOOGLE_CALENDAR_CLIENT_SECRET`: Client secret da mesma credencial OAuth.
- `GOOGLE_CALENDAR_STATE_SECRET`: segredo aleatório com pelo menos 32 caracteres, usado para cifrar e validar o estado OAuth.
- `GOOGLE_CALENDAR_APP_URL`: opcional; por omissão, `https://barber-os-orpin.vercel.app`.

A secret pode ser gerada localmente com `openssl rand -hex 32`. Configurar os valores através do Supabase Dashboard em **Project Settings → Edge Functions → Secrets** ou com a CLI Supabase autenticada.

## Implementação e segurança

- `google-calendar` é uma Edge Function pública apenas para o callback OAuth; o pedido inicial exige um token de gestão de marcação válido.
- O token de gestão é verificado contra a tabela de marcações, incluindo a expiração, e a marcação tem de estar futura, activa e não ter uma reserva de sinal expirada.
- O estado OAuth é cifrado com AES-GCM, expira em 10 minutos e não contém credenciais Google.
- O rate limiting usa a função interna `rate_limit_consume`; a origem do frontend continua limitada à allowlist de produção.
- Os access tokens são usados em memória apenas para inserir/actualizar o evento e não são persistidos.
- O âmbito OAuth `calendar.events.owned` permite tecnicamente ver, criar, alterar e apagar eventos dos calendários que o cliente possui. O código do BarberOS usa a autorização apenas para criar ou actualizar o evento determinístico desta marcação e não chama endpoints de leitura dos restantes eventos.
- O ID de evento é determinístico por marcação para evitar duplicados em repetições do callback.
- Os eventos usam visibilidade privada e lembretes predefinidos da conta Google.

## Validação de lançamento

1. Confirmar que `google-calendar` está activa no Supabase e que os três secrets obrigatórios existem.
2. Testar a autorização e a criação real do evento com uma conta Google de QA.
3. Confirmar que o navegador regressa a `/marcacao/:token?calendar=added`, que o evento está no calendário e que um callback repetido não duplica eventos.
4. Testar recusa de consentimento, token de marcação expirado, marcação cancelada, falta de configuração e erro do provider.
5. Só depois anunciar a função como operacional para todos os clientes.

A publicação do frontend e a existência da Edge Function não provam que as credenciais OAuth ou a verificação Google estejam configuradas.