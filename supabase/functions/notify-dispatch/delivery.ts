export function deliveryErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 700);
  return String(error ?? 'notification_delivery_failed').slice(0, 700);
}

export function retryableDeliveryError(error: unknown): boolean {
  const message = deliveryErrorMessage(error);
  if (error instanceof RangeError || /NOT_CONFIGURED|RECIPIENT_INVALID|NOTIFICATION_TEMPLATE_UNSUPPORTED/.test(message)) {
    return false;
  }
  const status = typeof error === 'object' && error && 'status' in error
    ? Number(error.status)
    : NaN;
  return !Number.isInteger(status) || status < 100 || status > 599 ||
    status === 408 || status === 429 || status >= 500;
}

type SentDelivery = { provider: 'email' | 'whatsapp'; providerMessageId: string };
type DeliveryFailure = { message: string; retryable: boolean; fallbackUrl: string | null };

export type DeliveryDependencies<Job> = {
  prepare(job: Job): { message: string; fallbackUrl: string | null };
  send(job: Job, message: string): Promise<SentDelivery>;
  markSent(job: Job, delivery: SentDelivery): Promise<void>;
  markFailure(job: Job, failure: DeliveryFailure): Promise<'queued' | 'failed'>;
};

/** Preparation failures must transition durable state just like provider failures. */
export async function deliverNotification<Job extends { id: string }>(
  job: Job,
  dependencies: DeliveryDependencies<Job>,
): Promise<Record<string, unknown>> {
  let fallbackUrl: string | null = null;
  try {
    const prepared = dependencies.prepare(job);
    fallbackUrl = prepared.fallbackUrl;
    const delivery = await dependencies.send(job, prepared.message);
    await dependencies.markSent(job, delivery);
    return { id: job.id, status: 'sent', provider: delivery.provider, fallback_url: fallbackUrl };
  } catch (error) {
    const state = await dependencies.markFailure(job, {
      message: deliveryErrorMessage(error),
      retryable: retryableDeliveryError(error),
      fallbackUrl,
    });
    return { id: job.id, status: state === 'queued' ? 'retrying' : 'failed', fallback_url: fallbackUrl };
  }
}
