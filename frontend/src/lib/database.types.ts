import type { Database as GeneratedDatabase } from './database.generated';
export type { Json, Tables, TablesInsert, TablesUpdate, Enums, CompositeTypes } from './database.generated';

type GeneratedFunctions = GeneratedDatabase['public']['Functions'];

// PostgreSQL's catalog does not describe argument nullability. The generator
// consequently emits non-null scalars even where SQL explicitly accepts null
// (for example, no preferred barber or clearing an optional note). Keep this
// reviewed wire contract separate from the unmodified generated schema.
export const nullableRpcArguments = {
  save_barber: ['p_barber_id', 'p_bio', 'p_photo_url', 'p_user_id'],
  save_schedule_override: ['p_barber_id', 'p_opens_at', 'p_closes_at', 'p_note', 'p_id'],
  transition_appointment: ['p_reason'],
  reschedule_appointment_by_operator: ['p_new_barber_id'],
  get_available_slots_week: ['p_barber_id'],
  get_available_slots: ['p_barber_id'],
  get_available_days: ['p_barber_id'],
  book_appointment: ['p_haircut_id', 'p_barber_id', 'p_email'],
  book_appointment_manual: ['p_haircut_id', 'p_barber_id', 'p_email', 'p_internal_note'],
  get_customers: ['p_search'],
  update_customer: ['p_email', 'p_notes'],
  get_payments: ['p_status'],
  get_reviews: ['p_barber_id', 'p_rating'],
  cancel_appointment_by_token: ['p_reason'],
  submit_review_by_token: ['p_comment'],
  restore_shop_order_item_operation: ['p_note'],
  create_barbershop: ['p_phone', 'p_whatsapp'],
} as const satisfies Partial<{
  [Name in keyof GeneratedFunctions]: readonly (keyof GeneratedFunctions[Name]['Args'])[];
}>;

type NullableArguments = typeof nullableRpcArguments;
type ContractFunctions = {
  [Name in keyof GeneratedFunctions]: Omit<GeneratedFunctions[Name], 'Args'> & {
    Args: {
      [Argument in keyof GeneratedFunctions[Name]['Args']]:
        Name extends keyof NullableArguments
          ? Argument extends NullableArguments[Name][number]
            ? GeneratedFunctions[Name]['Args'][Argument] | null
            : GeneratedFunctions[Name]['Args'][Argument]
          : GeneratedFunctions[Name]['Args'][Argument];
    };
  };
};

export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedDatabase['public'], 'Functions'> & {
    Functions: ContractFunctions;
  };
};
