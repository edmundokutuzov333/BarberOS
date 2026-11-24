// Generated subset of the staging public schema (Supabase type generator).
// Production database.generated.ts remains unchanged until its protected release.
import type { Json } from '@/lib/database.types';
export type PaymentSimulatorRpc = {
  payment_simulator: {
        Args: { p_action: string; p_payload: Json }
        Returns: Json
      }
}['payment_simulator'];
