# Gestão segura de credenciais BarberOS

## Regra central

As palavras-passe definitivas nunca são guardadas no GitHub, em ficheiros de configuração, em tabelas da aplicação ou no histórico de auditoria. Supabase Auth gere os verificadores de palavras-passe. A aplicação guarda apenas a identidade, o email, o papel, as associações a barbearias e o sinal password_change_required.

## Reposição por um administrador da plataforma

1. Um administrador autenticado abre /admin/utilizadores.
2. Pode consultar emails e associações existentes a barbearias.
3. Ao seleccionar Repor acesso, o servidor confirma novamente o JWT e profiles.is_platform_admin.
4. O servidor limita a frequência das reposições, confirma que o alvo pertence a uma barbearia e não é um administrador da plataforma nem o próprio actor.
5. É gerada uma palavra-passe temporária criptograficamente aleatória. Supabase Auth actualiza a conta e o perfil passa a exigir troca de palavra-passe.
6. A palavra-passe temporária é devolvida uma única vez ao administrador com Cache-Control: no-store. Não é gravada na base de dados, nos logs ou no repositório.
7. O histórico regista quem fez a reposição, a conta alvo, as barbearias e a data, sem qualquer segredo.
8. O titular entra com a credencial temporária e é encaminhado para /alterar-palavra-passe. Só depois de definir uma palavra-passe pessoal é libertado o acesso à aplicação privada.

## Tabelas

- auth.users: propriedade do Supabase Auth; a aplicação não tenta ler nem exportar palavras-passe.
- public.profiles: dados de perfil e flag password_change_required.
- public.platform_access_events: auditoria das reposições; RLS activada e acesso directo revogado para anon e authenticated. Só a função de servidor usa service_role.

## Operação e segurança

- Nunca colocar palavras-passe, service-role keys, tokens de sessão ou links de recuperação em commits, ficheiros de ambiente versionados, Issues ou logs.
- A palavra-passe temporária deve ser partilhada por um canal privado e substituída no primeiro acesso.
- A reposição do próprio administrador e de outros administradores de plataforma fica fora desta acção, para evitar auto-bloqueio e escalada lateral.
- Limite aplicado: cinco reposições por administrador por hora, sujeito ao RPC central de rate limiting.
- O histórico está disponível na secção Utilizadores e não contém segredos.
