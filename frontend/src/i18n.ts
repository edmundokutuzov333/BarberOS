import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

const common = {
  'pt-MZ': { gatewayTitle: 'Como queres entrar?', client: 'Sou cliente', clientHint: 'Marcar um corte, sem conta.', shop: 'Sou da barbearia', shopHint: 'Agenda, equipa e gestão.', shopLink: 'Link ou código da barbearia', open: 'Abrir', scan: 'Ler QR com a câmara', change: 'Mudar escolha', login: 'Entrar', register: 'Criar a minha barbearia', invalidLink: 'Link ou código inválido.' },
  'pt-PT': { gatewayTitle: 'Como queres entrar?', client: 'Sou cliente', clientHint: 'Marcar um corte, sem conta.', shop: 'Sou da barbearia', shopHint: 'Agenda, equipa e gestão.', shopLink: 'Link ou código da barbearia', open: 'Abrir', scan: 'Ler QR com a câmara', change: 'Mudar escolha', login: 'Entrar', register: 'Criar a minha barbearia', invalidLink: 'Link ou código inválido.' },
  'pt-BR': { gatewayTitle: 'Como você quer entrar?', client: 'Sou cliente', clientHint: 'Agendar um corte, sem conta.', shop: 'Sou da barbearia', shopHint: 'Agenda, equipe e gestão.', shopLink: 'Link ou código da barbearia', open: 'Abrir', scan: 'Ler QR com a câmera', change: 'Mudar escolha', login: 'Entrar', register: 'Criar minha barbearia', invalidLink: 'Link ou código inválido.' },
  en: { gatewayTitle: 'How do you want to enter?', client: 'I am a client', clientHint: 'Book a cut without an account.', shop: 'I run a barbershop', shopHint: 'Schedule, team and operations.', shopLink: 'Barbershop link or code', open: 'Open', scan: 'Scan QR with camera', change: 'Change choice', login: 'Log in', register: 'Create my barbershop', invalidLink: 'Invalid link or code.' },
  es: { gatewayTitle: '¿Cómo quieres entrar?', client: 'Soy cliente', clientHint: 'Reserva un corte sin cuenta.', shop: 'Soy de la barbería', shopHint: 'Agenda, equipo y gestión.', shopLink: 'Enlace o código de barbería', open: 'Abrir', scan: 'Leer QR con la cámara', change: 'Cambiar elección', login: 'Entrar', register: 'Crear mi barbería', invalidLink: 'Enlace o código no válido.' },
};

void i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: Object.fromEntries(Object.entries(common).map(([lng, translation]) => [lng, { common: translation }])),
  fallbackLng: 'pt-MZ',
  supportedLngs: Object.keys(common),
  ns: ['common'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
});

export default i18n;
