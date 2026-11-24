import type { QueryClient } from '@tanstack/react-query';

// Catalog edits affect several projections, including relations deleted by
// foreign-key cascades. Refresh all affected tenant-scoped admin read models.
export async function invalidateBookingCatalog(client: QueryClient, shopId: string, slug?: string) {
  await Promise.all([
    ...['services','haircuts','barbers','haircut-skill-barbers'].map((name) => client.invalidateQueries({ queryKey: [name, shopId] })),
    client.invalidateQueries({ queryKey: ['manual-booking','catalog',shopId] }),
    client.invalidateQueries({ queryKey: slug ? ['public-barbershop',slug] : ['public-barbershop'] }),
    client.invalidateQueries({ queryKey: ['availability'] }),
  ]);
}
