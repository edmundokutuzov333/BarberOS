type PublicShopPrefetch = {
  slug: string;
  promise: Promise<unknown | null>;
};

declare global {
  interface Window {
    __barberosPublicShopPrefetch?: PublicShopPrefetch;
  }
}

const match = window.location.pathname.match(/^\/barbearia\/([^/]+)\/?$/);
if (match) {
  let slug = '';
  try {
    slug = decodeURIComponent(match[1]).trim().toLowerCase();
  } catch {
    slug = '';
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '');
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (slug && supabaseUrl && publishableKey) {
    const promise = fetch(supabaseUrl + '/rest/v1/rpc/get_public_barbershop', {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: 'Bearer ' + publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_slug: slug }),
      cache: 'no-store',
    }).then(async (response) => {
      if (!response.ok) return null;
      return await response.json();
    }).catch(() => null);

    window.__barberosPublicShopPrefetch = { slug, promise };
  }
}
