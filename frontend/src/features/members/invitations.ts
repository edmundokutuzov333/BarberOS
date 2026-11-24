import { z } from 'zod';
import { supabase } from '@/lib/supabase';
const uuid = z.string().uuid();
export const invitationRole = z.enum(['manager', 'barber']);
export type InvitationRole = z.infer<typeof invitationRole>;
const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
const invitationRow = z.object({
  id: uuid, email: z.string().email(), role: invitationRole,
  barber_id: uuid.nullable(), barber_name: z.string().nullable(),
  expires_at: z.string().datetime({ offset: true }),
});
const created = z.object({ id: uuid, token: tokenSchema, expires_at: z.string().datetime({ offset: true }) });
const accepted = z.object({ shop_id: uuid, membership_id: uuid, role: invitationRole, idempotent: z.boolean() });
export function parseInvitationToken(value: string | null | undefined): string | null {
  const result = tokenSchema.safeParse(value);
  return result.success ? result.data : null;
}
function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error('INVITATION_RESPONSE_INVALID');
  return result.data;
}
export async function listInvitations(shop: string) {
  const { data, error } = await supabase.rpc('list_team_invitations', { p_shop: uuid.parse(shop) });
  if (error) throw error;
  return validate(z.array(invitationRow), data);
}
export async function createInvitation(input: { shop: string; email: string; role: InvitationRole; barber: string | null }) {
  const { data, error } = await supabase.rpc('create_team_invitation', {
    p_shop: uuid.parse(input.shop), p_email: z.string().trim().email().max(254).parse(input.email),
    p_role: invitationRole.parse(input.role), p_barber: input.barber === null ? null : uuid.parse(input.barber),
  });
  if (error) throw error;
  return validate(created, data);
}
export async function revokeInvitation(shop: string, id: string) {
  const { data, error } = await supabase.rpc('revoke_team_invitation', { p_shop: uuid.parse(shop), p_invite: uuid.parse(id) });
  if (error) throw error;
  return validate(z.boolean(), data);
}
export async function acceptInvitation(token: string) {
  const { data, error } = await supabase.rpc('accept_team_invitation', { p_token: tokenSchema.parse(token) });
  if (error) throw error;
  return validate(accepted, data);
}
export function invitationLink(token: string) {
  const url = new URL('/convite', window.location.origin);
  url.hash = 'convite=' + tokenSchema.parse(token);
  return url.toString();
}
