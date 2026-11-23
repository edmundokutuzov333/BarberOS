import { replyMetadata, type ReplyMessage } from './reply.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}
const own = 'owner@example.com';
const incoming: ReplyMessage = {
  from: 'Client <client@example.com>', to: own, subject: 'Marcação em Moçambique',
  message_id: '<incoming@example.com>', references: '<first@example.com>', reply_to: '',
};

Deno.test('ordinary incoming reply uses From when Reply-To is empty', () => {
  const result = replyMetadata([incoming], own);
  assert(result?.to === 'client@example.com');
  assert(result.subject === 'Re: Marcação em Moçambique');
  assert(result.headers['In-Reply-To'] === '<incoming@example.com>');
  assert(result.headers.References === '<first@example.com> <incoming@example.com>');
});

Deno.test('an explicit Reply-To controls an incoming reply instead of the sending service', () => {
  const result = replyMetadata([{ ...incoming, reply_to: 'Support <support@example.com>' }], own);
  assert(result?.to === 'support@example.com');
});

Deno.test('a follow-up targets the recipient and references the latest outgoing message', () => {
  const outgoing = { ...incoming, from: own, to: 'Client <client@example.com>', subject: 'Re: Marcação em Moçambique', message_id: '<outgoing@example.com>' };
  const result = replyMetadata([incoming, outgoing], own);
  assert(result?.to === 'client@example.com');
  assert(result.headers['In-Reply-To'] === '<outgoing@example.com>');
  assert(result.subject === outgoing.subject);
});

Deno.test('a self-addressed conversation supports a reply instead of a false provider failure', () => {
  const result = replyMetadata([{ ...incoming, from: own, to: own }], own);
  assert(result?.to === own);
});

Deno.test('outgoing recipients exclude the owner when another recipient exists', () => {
  const result = replyMetadata([{ ...incoming, from: 'Owner <OWNER@example.com>', to: 'Owner <owner@example.com>, "Doe, Jane" <jane@example.com>' }], own);
  assert(result?.to === 'jane@example.com');
});

Deno.test('Gmail SENT metadata recognizes outgoing messages sent from an account alias', () => {
  const result = replyMetadata([{ ...incoming, from: 'BarberOS <sales@example.com>', to: 'client@example.com', sent_by_owner: true }], own);
  assert(result?.to === 'client@example.com');
});

Deno.test('valid folded display names are supported while injected headers are rejected', () => {
  assert(replyMetadata([{ ...incoming, from: 'Client\r\n <client@example.com>' }], own)?.to === 'client@example.com');
  assert(replyMetadata([{ ...incoming, from: 'client@example.com\r\nBcc: other@example.com' }], own) === null);
});

Deno.test('a maximum-length original subject is preserved when Re: is added', () => {
  const subject = 'a'.repeat(200);
  const result = replyMetadata([{ ...incoming, subject }], own);
  assert(result?.subject === 'Re: ' + subject);
});

Deno.test('empty conversations or missing recipients cannot manufacture a destination', () => {
  assert(replyMetadata([], own) === null);
  assert(replyMetadata([{ ...incoming, from: own, to: '' }], own) === null);
  assert(replyMetadata([{ ...incoming, from: 'not a mailbox' }], own) === null);
});
