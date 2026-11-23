export type ReplyMessage = {
  from: string;
  to: string;
  reply_to?: string;
  sent_by_owner?: boolean;
  subject: string;
  message_id: string;
  references: string;
};

const mailboxPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function mailboxes(value: string): string[] {
  value = value.replace(/\r?\n[ \t]+/g, ' ');
  if (/[\r\n]/.test(value)) return [];
  const result: string[] = [];
  // Gmail headers contain either bare mailboxes or display-name <mailbox> forms.
  // Commas inside display names cannot become an outbound recipient.
  for (const match of value.matchAll(/<([^<>]+)>|(?:^|[,;])\s*([^<>,;]+)/g)) {
    const address = (match[1] ?? match[2]).trim();
    if (mailboxPattern.test(address)) result.push(address);
  }
  return result;
}

/** Reply follows the latest message, including a follow-up to an outgoing email. */
export function replyMetadata(messages: readonly ReplyMessage[], ownAddress: string) {
  const last = messages.at(-1);
  if (!last) return null;
  const own = ownAddress.toLowerCase();
  const from = mailboxes(last.from)[0];
  if (!from) return null;
  const sentByOwner = last.sent_by_owner ?? (from.toLowerCase() === own);
  const recipients = sentByOwner ? mailboxes(last.to) : mailboxes(last.reply_to?.trim() || last.from);
  const to = recipients.find(address => address.toLowerCase() !== own) ?? recipients[0];
  if (!to) return null;
  const subject = last.subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  const messageId = last.message_id.replace(/[\r\n]+/g, ' ').trim();
  const references = [last.references.replace(/[\r\n]+/g, ' ').trim(), messageId].filter(Boolean).join(' ').slice(0, 3000);
  return {
    to,
    subject: /^re:/i.test(subject) ? subject : 'Re: ' + subject,
    headers: {
      ...(messageId ? { 'In-Reply-To': messageId } : {}),
      ...(references ? { References: references } : {}),
    } satisfies Record<string, string>,
  };
}
