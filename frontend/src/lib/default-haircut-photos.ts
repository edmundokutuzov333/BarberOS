/**
 * Fotografia-padrão por estilo, usando fotografias reais da biblioteca Pexels.
 * photo_url do registo da barbearia tem sempre prioridade, permitindo overrides por loja.
 * As imagens são referências visuais, não fotografias verificadas de clientes ou barbeiros locais.
 */
export type DefaultHaircutPhoto = {
  url: string;
  sourceUrl: string;
  skinTone: 'Escuro' | 'Médio' | 'Claro' | 'Albinismo' | 'Variado';
};

const DEFAULT_SUPABASE_URL = 'https://alseiinjzwjdiwtvkdzy.supabase.co';
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
const photo = (asset: string) => SUPABASE_URL + '/functions/v1/barber-assets?asset=' + encodeURIComponent(asset);

const photos: Record<string, DefaultHaircutPhoto> = {
  "low fade": { url: photo("haircut-low-fade"), sourceUrl: "https://www.pexels.com/photo/stylish-black-man-sitting-in-barbershop-7389079/", skinTone: "Escuro" },
  "mid fade": { url: photo("haircut-mid-fade"), sourceUrl: "https://www.pexels.com/photo/side-view-of-a-young-man-with-a-trendy-haircut-17086220/", skinTone: "Médio" },
  "high fade": { url: photo("haircut-high-fade"), sourceUrl: "https://www.pexels.com/photo/mans-close-crop-hairstyle-6487911/", skinTone: "Médio" },
  "taper fade": { url: photo("haircut-taper-fade"), sourceUrl: "https://www.pexels.com/photo/profile-of-a-man-at-a-barber-7781848/", skinTone: "Escuro" },
  "skin fade": { url: photo("haircut-skin-fade"), sourceUrl: "https://www.pexels.com/search/skin%20fade%20haircut/", skinTone: "Médio" },
  "drop fade": { url: photo("haircut-drop-fade"), sourceUrl: "https://www.pexels.com/photo/a-man-getting-a-haircut-at-a-barbershop-7697319/", skinTone: "Escuro" },
  "burst fade": { url: photo("haircut-burst-fade"), sourceUrl: "https://www.pexels.com/photo/barbershop-haircut-for-black-male-client-35157692/", skinTone: "Escuro" },
  "buzz cut": { url: photo("haircut-buzz-cut"), sourceUrl: "https://www.pexels.com/photo/portrait-of-a-young-man-shirtless-11744656/", skinTone: "Claro" },
  "crew cut": { url: photo("haircut-crew-cut"), sourceUrl: "https://www.pexels.com/photo/portrait-of-a-man-23531768/", skinTone: "Claro" },
  "caesar": { url: photo("haircut-caesar"), sourceUrl: "https://www.pexels.com/photo/close-up-photo-of-a-man-getting-a-haircut-7447151/", skinTone: "Escuro" },
  "french crop": { url: photo("haircut-french-crop"), sourceUrl: "https://www.pexels.com/photo/close-up-shot-of-a-fine-looking-man-9102985/", skinTone: "Claro" },
  "pompadour": { url: photo("haircut-pompadour"), sourceUrl: "https://www.pexels.com/photo/a-handsome-man-in-black-shirt-5337943/", skinTone: "Médio" },
  "quiff": { url: photo("haircut-quiff"), sourceUrl: "https://www.pexels.com/photo/portrait-of-albino-man-from-cameroon-10090668/", skinTone: "Albinismo" },
  "slick back": { url: photo("haircut-slick-back"), sourceUrl: "https://www.pexels.com/photo/portrait-of-man-with-albinism-in-natural-light-32964273/", skinTone: "Albinismo" },
  "afro shape-up": { url: photo("haircut-afro-shape-up"), sourceUrl: "https://www.pexels.com/photo/man-with-afro-hairstyle-12414341/", skinTone: "Escuro" },
  "waves": { url: photo("haircut-waves"), sourceUrl: "https://www.pexels.com/photo/close-up-photo-of-man-in-afro-hairstyle-5839954/", skinTone: "Escuro" },
  "twists": { url: photo("haircut-twists"), sourceUrl: "https://www.pexels.com/photo/man-showing-his-dreadlocks-hair-1845923/", skinTone: "Escuro" },
  "dreads retwist": { url: photo("haircut-dreads-retwist"), sourceUrl: "https://www.pexels.com/photo/man-at-a-barbershop-19028067/", skinTone: "Escuro" },
  "corte a tesoura": { url: photo("haircut-corte-a-tesoura"), sourceUrl: "https://www.pexels.com/photo/man-with-afro-hair-14072328/", skinTone: "Escuro" },
  "corte infantil": { url: photo("haircut-corte-infantil"), sourceUrl: "https://www.pexels.com/photo/a-child-wearing-a-barber-s-cape-7697356/", skinTone: "Variado" },
  "design freestyle": { url: photo("haircut-design-freestyle"), sourceUrl: "https://www.pexels.com/photo/creative-geometric-haircut-design-on-shaved-head-37339534/", skinTone: "Variado" },
  "careca a navalha": { url: photo("haircut-careca-a-navalha"), sourceUrl: "https://www.pexels.com/photo/a-person-shaving-a-man-s-head-12464838/", skinTone: "Variado" },
};

function normalise(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-PT').trim();
}

export function getDefaultHaircutPhoto(name: string): DefaultHaircutPhoto | null {
  return photos[normalise(name)] ?? null;
}

/** True when the saved URL is the catalogue reference, rather than a shop upload. */
export function isDefaultHaircutPhoto(name: string, url?: string | null): boolean {
  const savedUrl = url?.trim();
  const defaultUrl = getDefaultHaircutPhoto(name)?.url;
  return !savedUrl || savedUrl === defaultUrl;
}
