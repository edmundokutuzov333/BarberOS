# Integração Gmail

## Estado

A interface e o código de integração estão versionados no repositório. A integração não fica operacional até serem configuradas as credenciais OAuth do Google, os segredos da Edge Function, a migration e a publicação controlada no ambiente-alvo. A ausência de configuração deve mostrar o estado «Gmail ainda não configurado», nunca uma ligação simulada.

## Funcionalidades implementadas no código

- Uma ligação Gmail por barbearia, acessível a donos e gerentes.
- Autorização OAuth 2.0 no Google, sem pedir a palavra-passe do Gmail.
- Caixa de entrada com pesquisa, lista de conversas e leitura de mensagens.
- Respostas dentro da conversa original e envio de novos emails em texto simples.
- Desligação da conta e pedido de revogação dos tokens ao Google.
- Isolamento por `barbershop_id`, validação da membership no backend e acesso à tabela apenas pelo `service_role`.
- Tokens de acesso e renovação cifrados com AES-GCM no backend.
- Estado OAuth aleatório, guardado apenas como hash, limitado a 10 minutos e consumido uma única vez.
- Respostas HTTP sem cache e sem escrever tokens, códigos OAuth ou corpos completos de email nos logs.

## 1. Google Cloud

1. Criar/seleccionar um projecto na Google Cloud Console e activar a Gmail API.
2. Configurar o ecrã de consentimento OAuth e publicar os dados exigidos pelo Google.
3. Criar um OAuth Client do tipo Web application.
4. Adicionar este URI autorizado de redireccionamento, exactamente como está escrito:

   `https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/gmail-integration`

5. Para testes internos, adicionar os utilizadores de teste permitidos no consent screen.
6. Para utilização pública, preparar a verificação OAuth aplicável aos escopos solicitados. `gmail.readonly` é um escopo restrito e a publicação pode exigir análise de segurança adicional.

## 2. Segredos Supabase

Configurar no runtime do projecto Supabase, nunca no frontend:

- `GMAIL_CLIENT_ID`: OAuth Client ID do Google.
- `GMAIL_CLIENT_SECRET`: segredo do OAuth Client.
- `GMAIL_REDIRECT_URI`: URI autorizado listado acima.
- `GMAIL_APP_URL`: URL base do frontend publicado, por exemplo `https://barber-os-orpin.vercel.app`.
- `GMAIL_TOKEN_ENCRYPTION_KEY`: segredo aleatório de alta entropia com, no mínimo, 32 caracteres. Guardá-lo num gestor de segredos e criar backup seguro. A perda desta chave torna os tokens cifrados impossíveis de decifrar.
- `ALLOWED_ORIGINS`: lista separada por vírgulas de origens frontend explicitamente permitidas, incluindo a origem publicada e a origem Preview aprovada, se aplicável.

Os segredos não podem usar nomes `VITE_*`; esse prefixo expõe os valores no bundle cliente. Nunca imprimir os valores dos segredos nos logs ou nos outputs de CI.

## 3. Sequência de release

1. Validar `supabase db reset` e a suite de testes num ambiente isolado.
2. Comparar o histórico remoto de migrations e executar o dry-run aprovado antes de aplicar a migration `20261021130000_gmail_workspace_integration.sql`.
3. Publicar `gmail-integration` a partir da `main` usando o workflow de release aprovado, mantendo `verify_jwt = false` na configuração da função para o callback Google. Os pedidos de API normais validam o JWT no código da função.
4. Confirmar que `GMAIL_APP_URL` coincide com uma origem permitida em `ALLOWED_ORIGINS`.
5. Testar OAuth connect/callback, estado expirado e de utilização única, ligação da conta, listagem de mensagens, leitura da conversa, reply na mesma thread, novo email, renovação do token, desconexão e revogação.
6. Confirmar isolamento de duas barbearias e que utilizadores com papel `barber` não podem consultar nem operar a integração.
7. Testar com uma conta de verificação autorizada pelo Google antes de abrir acesso a utilizadores externos.

Não aplicar migrations ou publicar a função na produção antes de reconciliar o histórico de migrations e concluir as verificações do release gate já existentes no repositório.

## Escopos

A aplicação pede apenas os escopos Gmail necessários para leitura e envio:
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`

O consent screen também pede `openid` e `email` para validar a identidade da conta conectada. Se forem alterados os escopos, actualizar esta documentação, os testes e o processo de verificação OAuth antes do release.
