import type { Database as GeneratedDatabase } from './database.generated';
import type { Database } from './database.types';

type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Functions = Database['public']['Functions'];
type GeneratedFunctions = GeneratedDatabase['public']['Functions'];

// Compiled by the normal application typecheck; never executed or bundled.
// Explicit null keeps its SQL meaning without weakening identity arguments.
export type RpcContractAssertions = [
  Assert<Equal<keyof Functions, keyof GeneratedFunctions>>,
  Assert<Equal<Database['public']['Tables'], GeneratedDatabase['public']['Tables']>>,
  Assert<Equal<Functions['get_available_slots']['Args']['p_barber_id'], string | null | undefined>>,
  Assert<Equal<Functions['book_appointment']['Args']['p_barber_id'], string | null>>,
  Assert<Equal<Functions['book_appointment']['Args']['p_service_id'], string>>,
  Assert<Equal<Functions['save_barber']['Args']['p_shop'], string>>,
  Assert<Equal<Functions['update_customer']['Args']['p_email'], string | null | undefined>>,
  Assert<Equal<Functions['create_shop_operation_incident']['Args'], GeneratedFunctions['create_shop_operation_incident']['Args']>>,
  Assert<Equal<Functions['list_shop_operation_incidents']['Returns'], GeneratedFunctions['list_shop_operation_incidents']['Returns']>>,
  Assert<Equal<Functions['save_barber']['Returns'], GeneratedFunctions['save_barber']['Returns']>>,
];
