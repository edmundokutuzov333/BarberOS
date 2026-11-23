import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  CheckCircle2, ExternalLink, Inbox, Mail, Plus, RefreshCw, Search, Send,
  Unlink, X,
} from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/Primitives";
import { EmptyState, ErrorState, Panel, Skeleton } from "@/components/ui/States";
import { useShop } from "@/lib/shop";
import {
  useGmailActions,
  useGmailStatus,
  useGmailThread,
  useGmailThreads,
  type GmailThreadPreview,
} from "@/features/gmail/api";

function explainGmailError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    GMAIL_FUNCTION_NOT_DEPLOYED: "A interface Gmail foi publicada, mas a função Supabase ainda aguarda o release de backend.",
    GMAIL_CONFIGURATION_MISSING: "A integração Gmail ainda não está configurada pelo administrador da plataforma.",
    GMAIL_STORAGE_NOT_READY: "A base de dados da integração Gmail ainda não está preparada.",
    GMAIL_NOT_CONNECTED: "Ligue uma conta Gmail para começar.",
    GMAIL_REAUTH_REQUIRED: "A autorização do Google expirou. Desligue e volte a ligar a conta Gmail.",
    GMAIL_INVALID_REQUEST: "Os dados da mensagem não são válidos. Reveja o destinatário, assunto e conteúdo.",
    GMAIL_RATE_LIMITED: "O Google limitou temporariamente este pedido. Aguarde e tente novamente.",
    GMAIL_PROVIDER_REQUEST_FAILED: "O Gmail não conseguiu concluir o pedido. Confirme a ligação e tente novamente.",
    GMAIL_SEND_FAILED: "A mensagem não foi enviada. Confirme os dados e tente novamente.",
    PASSWORD_CHANGE_REQUIRED: "Defina a nova palavra-passe antes de utilizar o Gmail.",
    ACCOUNT_STATE_UNAVAILABLE: "Não foi possível verificar o estado da conta. Aguarde e tente novamente.",
    AUTH_REQUIRED: "A sessão expirou. Entre novamente no BarberOS.",
    SHOP_ACCESS_DENIED: "Não tem acesso a esta barbearia.",
    MANAGEMENT_ROLE_REQUIRED: "A gestão do Gmail está disponível apenas para donos e gerentes.",
  };
  return messages[code] ?? "Não foi possível concluir a operação Gmail. Tente novamente.";
}

function formatMailDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(parsed);
}

function ThreadRow({
  item, selected, disabled, onClick,
}: {
  item: GmailThreadPreview; selected: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={[
        "disabled:opacity-60 disabled:pointer-events-none w-full min-w-0 rounded-2xl border p-3.5 text-left transition-colors",
        selected ? "border-accent-soft/50 bg-accent-soft/10" : "border-white/10 bg-white/[.025] hover:bg-white/[.06]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span className={["mt-1.5 h-2 w-2 shrink-0 rounded-full", item.unread ? "bg-accent-soft" : "bg-white/10"].join(" ")} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={["truncate text-sm", item.unread ? "font-semibold text-ink-hi" : "text-ink-mid"].join(" ")}>{item.from || item.to || "Remetente indisponível"}</p>
            <span className="t-label shrink-0 text-ink-lo">{formatMailDate(item.date)}</span>
          </div>
          <p className="mt-1 truncate text-sm text-ink-hi">{item.subject}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-mid">{item.snippet || "Sem pré-visualização."}</p>
        </div>
      </div>
    </button>
  );
}

export default function Comunicacoes() {
  const { shop, shops, setShopId } = useShop();
  const shopId = shop?.id ?? "";
  const status = useGmailStatus(shopId || undefined);
  const connected = status.data?.connection.connected === true;
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const [passwordBlocked, setPasswordBlocked] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [revocationPending, setRevocationPending] = useState(false);
  const [draftErrors, setDraftErrors] = useState<{ to?: string; subject?: string; body?: string }>({});
  const activeShopId = useRef(shopId);
  const searchRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const needsPasswordChange = passwordBlocked || (status.error instanceof Error && status.error.message === "PASSWORD_CHANGE_REQUIRED");
  const actions = useGmailActions(shopId);
  const threads = useGmailThreads(shopId || undefined, search, connected && !needsPasswordChange);
  const threadQuery = useGmailThread(shopId || undefined, selectedThreadId ?? undefined, connected && !needsPasswordChange);
  const messages = threadQuery.data?.thread.messages ?? [];
  const thread = threadQuery.data?.thread;

  const visibleThreads = useMemo(() => threads.data?.threads ?? [], [threads.data?.threads]);
  useEffect(() => {
    activeShopId.current = shopId;
    setBusyAction(false);
    setPasswordBlocked(false);
    setSelectedThreadId(null);
    setReplyBody("");
    setSearch("");
    setSearchDraft("");
    setComposeOpen(false);
    setTo("");
    setSubject("");
    setNewBody("");
    setDisconnectOpen(false);
    setRevocationPending(false);
    setDraftErrors({});
  }, [shopId]);
  useEffect(() => {
    // A sent conversation may be outside the current inbox filter. Its detail
    // remains selected until an explicit search, row selection or shop change.
    if (connected && !composeOpen && !selectedThreadId && visibleThreads.length) {
      setSelectedThreadId(visibleThreads[0].id);
    }
  }, [connected, composeOpen, visibleThreads, selectedThreadId]);

  useEffect(() => {
    const result = searchParams.get("gmail");
    if (!result || !shopId) return;
    const callbackShop = searchParams.get("shop_id");
    if (result === "connected" && callbackShop && callbackShop !== shopId && shops.some((item) => item.barbershops.id === callbackShop)) {
      setShopId(callbackShop);
      toast.success("Gmail ligado à barbearia seleccionada.");
    } else if (result === "connected") {
      toast.success("Conta Gmail ligada com sucesso.");
    } else {
      const reason = searchParams.get("reason");
      const explanation: Record<string, string> = {
        not_configured: "A integração ainda não está configurada.",
        backend_not_ready: "A base de dados Gmail ainda não está pronta.",
        invalid_state: "O pedido de autorização expirou. Tente ligar a conta novamente.",
        access_denied: "A conta não tem acesso a esta barbearia.",
        consent_denied: "A autorização foi cancelada no Google.",
        invalid_response: "O Google devolveu uma resposta de autorização inválida.",
        provider_error: "O Google não concluiu a autorização. Confirme o consentimento OAuth.",
        reauthorize: "É necessário autorizar novamente a conta Gmail.",
        password_change_required: "Defina a nova palavra-passe antes de ligar o Gmail.",
        account_unavailable: "Não foi possível verificar o estado da conta. Aguarde e tente ligar novamente.",
      };
      toast.error(explanation[reason ?? ""] ?? "Não foi possível ligar o Gmail.");
    }
    const next = new URLSearchParams(searchParams);
    next.delete("gmail");
    next.delete("shop_id");
    next.delete("reason");
    setSearchParams(next, { replace: true });
    void status.refetch();
  }, [searchParams, setSearchParams, shopId, shops, setShopId, status.refetch]);

  const reportActionError = (error: unknown) => {
    if (activeShopId.current !== shopId) return;
    if (error instanceof Error && error.message === "PASSWORD_CHANGE_REQUIRED") setPasswordBlocked(true);
    toast.error(explainGmailError(error));
  };

  const connect = async () => {
    if (!shopId) return;
    setBusyAction(true);
    try {
      const result = await actions.connect();
      if (activeShopId.current !== shopId) return;
      if (!result.url) throw new Error("GMAIL_PROVIDER_REQUEST_FAILED");
      window.location.assign(result.url);
    } catch (error) {
      reportActionError(error);
    } finally {
      if (activeShopId.current === shopId) setBusyAction(false);
    }
  };

  const disconnect = async () => {
    if (!shopId || busyAction) return;
    setBusyAction(true);
    try {
      const result = await actions.disconnect();
      if (activeShopId.current !== shopId) return;
      setSelectedThreadId(null);
      setComposeOpen(false);
      setDisconnectOpen(false);
      setTo(""); setSubject(""); setNewBody("");
      setReplyBody("");
      setRevocationPending(result.revocation_confirmed !== true);
      if (result.revocation_confirmed === true) toast.success("Conta Gmail desligada e autorização revogada.");
      else toast.warning("Conta desligada no BarberOS. O Google não confirmou a revogação da autorização.");
    } catch (error) {
      reportActionError(error);
    } finally {
      if (activeShopId.current === shopId) setBusyAction(false);
    }
  };

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!shopId || busyAction || !selectedThreadId || !replyBody.trim()) return;
    setBusyAction(true);
    try {
      const result = await actions.send({ thread_id: selectedThreadId, body: replyBody.trim() });
      if (activeShopId.current !== shopId) return;
      setReplyBody("");
      toast.success("Resposta enviada pelo Gmail.");
      const nextThreadId = result.thread_id ?? selectedThreadId;
      setSelectedThreadId(nextThreadId);
      await Promise.all([threads.refetch(), threadQuery.refetch()]);
    } catch (error) {
      reportActionError(error);
    } finally {
      if (activeShopId.current === shopId) setBusyAction(false);
    }
  };

  const sendNewMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!shopId || busyAction) return;
    const errors = {
      to: /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to.trim()) ? undefined : "Introduza um endereço de email válido.",
      subject: subject.trim() ? undefined : "Introduza o assunto.",
      body: newBody.trim() ? undefined : "Escreva a mensagem.",
    };
    setDraftErrors(errors);
    if (errors.to || errors.subject || errors.body) {
      (errors.to ? toRef.current : errors.subject ? subjectRef.current : bodyRef.current)?.focus();
      return;
    }
    setBusyAction(true);
    try {
      const result = await actions.send({ to: to.trim(), subject: subject.trim(), body: newBody.trim() });
      if (activeShopId.current !== shopId) return;
      setTo("");
      setSubject("");
      setNewBody("");
      setComposeOpen(false);
      if (result.thread_id) setSelectedThreadId(result.thread_id);
      toast.success("Email enviado.");
      await threads.refetch();
    } catch (error) {
      reportActionError(error);
    } finally {
      if (activeShopId.current === shopId) setBusyAction(false);
    }
  };

  return (
    <Page
      testId="gmail-page"
      title="Gmail"
      subtitle="Consulte conversas e responda aos clientes sem sair da gestão da barbearia."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {connected && <span className="t-label text-ink-mid">{status.data?.connection.email}</span>}
          {connected && (
            <Button variant="secondary" size="sm" onClick={() => { void status.refetch(); void threads.refetch(); }}>
              <RefreshCw size={14} /> Actualizar
            </Button>
          )}
        </div>
      }
    >
      {status.isLoading && <Skeleton className="h-36" lines={4} />}
      {needsPasswordChange && (
        <Panel testId="gmail-password-recovery" className="max-w-3xl">
          <p role="alert" className="t-body text-ink-hi">Defina a nova palavra-passe antes de utilizar o Gmail.</p>
          <a href="/alterar-palavra-passe" className="mt-3 inline-flex min-h-11 items-center text-accent-soft underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
            Definir nova palavra-passe
          </a>
        </Panel>
      )}
      {status.error && !status.isLoading && !needsPasswordChange && (
        <ErrorState message={explainGmailError(status.error)} onRetry={() => void status.refetch()} />
      )}

      {!needsPasswordChange && !status.isLoading && !status.error && status.data?.configured === false && (
        <Panel testId="gmail-not-configured" className="max-w-3xl">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl border border-accent-soft/20 bg-accent-soft/10 p-3 text-accent-soft"><Mail size={22} /></div>
            <div className="min-w-0 flex-1">
              <h2 className="t-card text-ink-hi">Gmail ainda não configurado</h2>
              <p className="t-body mt-2 text-ink-mid">
                A página está instalada, mas a ligação ao Google ainda precisa das credenciais OAuth e da chave de cifragem configuradas pelo administrador da plataforma.
              </p>
              <p className="t-label mt-3 text-ink-lo">
                Depois de configurar o Google Cloud e os segredos do Supabase, poderá ligar uma conta por barbearia.
              </p>
            </div>
          </div>
        </Panel>
      )}

      {!needsPasswordChange && !status.isLoading && !status.error && status.data?.configured && !connected && (
        <Panel testId="gmail-connect-panel" className="max-w-3xl">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-accent-soft/20 bg-accent-soft/10 text-accent-soft"><Mail size={25} /></div>
            <div className="min-w-0 flex-1">
              <h2 className="t-card text-ink-hi">Ligue o Gmail da barbearia</h2>
              <p className="t-body mt-2 text-ink-mid">
                Autorize a conta Google para ler mensagens e enviar respostas. O BarberOS não pede nem guarda a palavra-passe do Gmail.
              </p>
              <p className="t-label mt-2 text-ink-lo">A ligação é privada desta barbearia e pode ser revogada a qualquer momento.</p>
              {revocationPending && <p role="alert" className="t-body mt-3 text-st-warning">
                O BarberOS removeu a ligação, mas o Google não confirmou a revogação.
                {" "}<a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">Reveja o acesso nas definições da conta Google.</a>
              </p>}
              <div className="mt-5">
                <Button onClick={() => void connect()} loading={busyAction} data-testid="gmail-connect">
                  <ExternalLink size={15} /> Ligar conta Google
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {!needsPasswordChange && !status.isLoading && !status.error && connected && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.025] p-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-st-done/20 bg-st-done/10 text-st-done"><CheckCircle2 size={18} /></span>
              <div className="min-w-0">
                <p className="text-sm text-ink-hi">Gmail ligado</p>
                <p className="t-label truncate text-ink-mid">{status.data?.connection.email}</p>
              </div>
            </div>
            <AlertDialog open={disconnectOpen} onOpenChange={(open) => { if (!busyAction) setDisconnectOpen(open); }}>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={busyAction} data-testid="gmail-disconnect">
                  <Unlink size={14} /> Desligar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Desligar a conta Gmail?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A caixa de entrada deixará de estar disponível nesta barbearia e será pedida a revogação ao Google.
                    As mensagens existentes no Gmail serão preservadas. Poderá voltar a ligar a conta.
                    A revogação Google poderá exigir nova autorização noutras barbearias que usem esta mesma conta no BarberOS.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2">
                  <AlertDialogCancel asChild><Button variant="secondary" disabled={busyAction}>Cancelar</Button></AlertDialogCancel>
                  <Button variant="danger" loading={busyAction} onClick={() => void disconnect()}>Desligar conta</Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <form noValidate className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => {
              event.preventDefault();
              if (busyAction) return;
              if (search !== searchDraft.trim()) { setSelectedThreadId(null); setReplyBody(""); }
              setSearch(searchDraft.trim());
              setComposeOpen(false);
            }}>
              <div className="min-w-0 flex-1">
                <Field
                  ref={searchRef}
                  disabled={busyAction}
                  label="Pesquisar mensagens"
                  name="gmail-search"
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Remetente, assunto ou termos"
                />
              </div>
              {(searchDraft || search) && <Button variant="ghost" disabled={busyAction} className="mt-6" aria-label="Limpar pesquisa" onClick={() => {
                setSearchDraft(""); setSearch(""); setSelectedThreadId(null); setReplyBody(""); searchRef.current?.focus();
              }}><X size={15} /></Button>}
              <Button type="submit" disabled={busyAction} variant="secondary" className="mt-6" aria-label="Pesquisar"><Search size={15} />Pesquisar</Button>
            </form>
            <Button variant="secondary" disabled={busyAction} className="self-end" onClick={() => { setComposeOpen(true); setSelectedThreadId(null); }}>
              <Plus size={15} /> Nova mensagem
            </Button>
          </div>

          {composeOpen ? (
            <Panel testId="gmail-compose" title="Nova mensagem">
              <form noValidate className="space-y-4" onSubmit={(event) => void sendNewMessage(event)}>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field ref={toRef} error={draftErrors.to} disabled={busyAction} label="Destinatário" name="gmail-to" type="email" inputMode="email" autoComplete="email" value={to} onChange={(event) => setTo(event.target.value)} required placeholder="cliente@exemplo.com" />
                  <Field ref={subjectRef} error={draftErrors.subject} disabled={busyAction} label="Assunto" name="gmail-subject" value={subject} onChange={(event) => setSubject(event.target.value)} required maxLength={200} placeholder="Assunto do email" />
                </div>
                <Textarea ref={bodyRef} error={draftErrors.body} disabled={busyAction} className="resize-none" label="Mensagem" name="gmail-message" value={newBody} onChange={(event) => setNewBody(event.target.value)} required rows={8} maxLength={50000} placeholder="Escreva a mensagem..." />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="ghost" disabled={busyAction} onClick={() => setComposeOpen(false)}><X size={15} /> Cancelar</Button>
                  <Button type="submit" loading={busyAction}><Send size={15} /> Enviar email</Button>
                </div>
              </form>
            </Panel>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.25fr)]">
              <Panel testId="gmail-inbox" className="min-w-0">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2"><Inbox size={17} className="text-accent-soft" /><h2 className="t-card">Caixa de entrada</h2></div>
                  <Button variant="ghost" size="sm" onClick={() => void threads.refetch()} loading={threads.isFetching} aria-label="Actualizar caixa de entrada"><RefreshCw size={14} /></Button>
                </div>
                {threads.isLoading && <div className="space-y-2"><Skeleton className="h-24" lines={3} /><Skeleton className="h-24" lines={3} /></div>}
                {threads.error && !threads.isLoading && <ErrorState message={explainGmailError(threads.error)} onRetry={() => void threads.refetch()} />}
                {!threads.isLoading && !threads.error && visibleThreads.length === 0 && (
                  <EmptyState title="Sem mensagens" body={search ? "Não foram encontradas conversas para esta pesquisa." : "As mensagens recebidas aparecerão aqui."} />
                )}
                <div className="space-y-2">
                  {visibleThreads.map((item) => <ThreadRow key={item.id} item={item} disabled={busyAction} selected={item.id === selectedThreadId} onClick={() => { if (!busyAction) { setSelectedThreadId(item.id); setReplyBody(""); } }} />)}
                </div>
              </Panel>

              <Panel testId="gmail-thread" className="min-w-0">
                {!selectedThreadId && <EmptyState title="Escolha uma conversa" body="Seleccione uma mensagem na caixa de entrada para consultar e responder." />}
                {threadQuery.isLoading && selectedThreadId && <Skeleton className="h-56" lines={7} />}
                {threadQuery.error && !threadQuery.isLoading && <ErrorState message={explainGmailError(threadQuery.error)} onRetry={() => void threadQuery.refetch()} />}
                {!threadQuery.isLoading && !threadQuery.error && selectedThreadId && thread && (
                  <>
                    <div className="mb-4 border-b border-white/10 pb-4">
                      <p className="t-label text-ink-mid">Conversa</p>
                      <h2 className="mt-1 break-words text-lg font-medium text-ink-hi">{messages.at(-1)?.subject || "Sem assunto"}</h2>
                      <p className="t-label mt-2 text-ink-lo">{messages.length} {messages.length === 1 ? "mensagem" : "mensagens"}</p>
                    </div>
                    <div className="max-h-[50vh] space-y-3 overflow-y-auto overscroll-contain pr-1">
                      {messages.map((message, index) => (
                        <article key={message.id || index} className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="break-all text-sm font-medium text-ink-hi">{message.from || "Remetente indisponível"}</p>
                              <p className="t-label mt-1 break-all text-ink-lo">Para: {message.to || status.data?.connection.email}</p>
                            </div>
                            <p className="t-label shrink-0 text-ink-lo">{formatMailDate(message.date)}</p>
                          </div>
                          <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-ink-mid">{message.body || "(Mensagem sem texto legível.)"}</pre>
                        </article>
                      ))}
                    </div>
                    <form noValidate className="mt-4 space-y-3 border-t border-white/10 pt-4" onSubmit={(event) => void sendReply(event)}>
                      <Textarea className="resize-none" disabled={busyAction} label="Responder nesta conversa" name="gmail-reply" value={replyBody} onChange={(event) => setReplyBody(event.target.value)} rows={4} maxLength={50000} required placeholder="Escreva a sua resposta..." />
                      <div className="flex justify-end">
                        <Button type="submit" loading={busyAction} disabled={!replyBody.trim()}><Send size={15} /> Enviar resposta</Button>
                      </div>
                    </form>
                  </>
                )}
              </Panel>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
