import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

export const memberRole = z.enum(['owner', 'manager', 'barber']);
const uuid = z.string().uuid();
const memberSchema = z.object({
  id: uuid, user_id: uuid, role: memberRole,
  full_name: z.string().nullable(), email: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
});
export type TeamMember = z.infer<typeof memberSchema>;
export type MemberRole = z.infer<typeof memberRole>;
export const memberEmail = z.string().trim().email().max(254);

function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error('MEMBERS_RESPONSE_INVALID');
  return result.data;
}

export async function listMembers(shopId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc('list_members', { p_shop: uuid.parse(shopId) });
  if (error) throw error;
  return checked(z.array(memberSchema), data);
}

export async function addMember(input: { shopId: string; email: string; role: MemberRole }): Promise<string> {
  const { data, error } = await supabase.rpc('add_member_by_email', {
    p_shop: uuid.parse(input.shopId), p_email: memberEmail.parse(input.email), p_role: memberRole.parse(input.role),
  });
  if (error) throw error;
  return checked(uuid, data);
}

export async function removeMember(input: { shopId: string; memberId: string }): Promise<void> {
  const { error } = await supabase.rpc('remove_barbershop_member', {
    p_shop: uuid.parse(input.shopId), p_member: uuid.parse(input.memberId),
  });
  if (error) throw error;
}

export function useMembers(shopId: string, enabled = true) {
  return useQuery({ queryKey: ['members', shopId], enabled: enabled && !!shopId, queryFn: () => listMembers(shopId) });
}
