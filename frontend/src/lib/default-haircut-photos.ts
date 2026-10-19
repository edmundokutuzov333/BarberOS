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

const photos: Record<string, DefaultHaircutPhoto> = {
  "low fade": { url: "https://images.pexels.com/photos/7389079/pexels-photo-7389079.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/stylish-black-man-sitting-in-barbershop-7389079/", skinTone: "Escuro" },
  "mid fade": { url: "https://images.pexels.com/photos/17086220/pexels-photo-17086220.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/side-view-of-a-young-man-with-a-trendy-haircut-17086220/", skinTone: "Médio" },
  "high fade": { url: "https://images.pexels.com/photos/6487911/pexels-photo-6487911.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/mans-close-crop-hairstyle-6487911/", skinTone: "Médio" },
  "taper fade": { url: "https://images.pexels.com/photos/7781848/pexels-photo-7781848.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/profile-of-a-man-at-a-barber-7781848/", skinTone: "Escuro" },
  "skin fade": { url: "https://images.pexels.com/photos/4456516/pexels-photo-4456516.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/search/skin%20fade%20haircut/", skinTone: "Médio" },
  "drop fade": { url: "https://images.pexels.com/photos/7697319/pexels-photo-7697319.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/a-man-getting-a-haircut-at-a-barbershop-7697319/", skinTone: "Escuro" },
  "burst fade": { url: "https://images.pexels.com/photos/35157692/pexels-photo-35157692.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/barbershop-haircut-for-black-male-client-35157692/", skinTone: "Escuro" },
  "buzz cut": { url: "https://images.pexels.com/photos/11744656/pexels-photo-11744656.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/portrait-of-a-young-man-shirtless-11744656/", skinTone: "Claro" },
  "crew cut": { url: "https://images.pexels.com/photos/23531768/pexels-photo-23531768.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/portrait-of-a-man-23531768/", skinTone: "Claro" },
  "caesar": { url: "https://images.pexels.com/photos/7447151/pexels-photo-7447151.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/close-up-photo-of-a-man-getting-a-haircut-7447151/", skinTone: "Escuro" },
  "french crop": { url: "https://images.pexels.com/photos/9102985/pexels-photo-9102985.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/close-up-shot-of-a-fine-looking-man-9102985/", skinTone: "Claro" },
  "pompadour": { url: "https://images.pexels.com/photos/5337943/pexels-photo-5337943.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/a-handsome-man-in-black-shirt-5337943/", skinTone: "Médio" },
  "quiff": { url: "https://images.pexels.com/photos/10090668/pexels-photo-10090668.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/portrait-of-albino-man-from-cameroon-10090668/", skinTone: "Albinismo" },
  "slick back": { url: "https://images.pexels.com/photos/32964273/pexels-photo-32964273.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/portrait-of-man-with-albinism-in-natural-light-32964273/", skinTone: "Albinismo" },
  "afro shape-up": { url: "https://images.pexels.com/photos/12414341/pexels-photo-12414341.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/man-with-afro-hairstyle-12414341/", skinTone: "Escuro" },
  "waves": { url: "https://images.pexels.com/photos/5839954/pexels-photo-5839954.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/close-up-photo-of-man-in-afro-hairstyle-5839954/", skinTone: "Escuro" },
  "twists": { url: "https://images.pexels.com/photos/1845923/pexels-photo-1845923.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/man-showing-his-dreadlocks-hair-1845923/", skinTone: "Escuro" },
  "dreads retwist": { url: "https://images.pexels.com/photos/19028067/pexels-photo-19028067.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/man-at-a-barbershop-19028067/", skinTone: "Escuro" },
  "corte a tesoura": { url: "https://images.pexels.com/photos/14072328/pexels-photo-14072328.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/man-with-afro-hair-14072328/", skinTone: "Escuro" },
  "corte infantil": { url: "https://images.pexels.com/photos/7697356/pexels-photo-7697356.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/a-child-wearing-a-barber-s-cape-7697356/", skinTone: "Variado" },
  "design freestyle": { url: "https://images.pexels.com/photos/35276951/pexels-photo-35276951.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/outdoor-barbershop-scene-with-customers-35276951/", skinTone: "Escuro" },
  "careca a navalha": { url: "https://images.pexels.com/photos/17492272/pexels-photo-17492272.jpeg?auto=compress&cs=tinysrgb&w=1200", sourceUrl: "https://www.pexels.com/photo/man-face-in-darkness-17492272/", skinTone: "Escuro" },
};

function normalise(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-PT').trim();
}

export function getDefaultHaircutPhoto(name: string): DefaultHaircutPhoto | null {
  return photos[normalise(name)] ?? null;
}
