import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Minus, Package, Plus, RotateCcw, Search, ShoppingBag, Store } from 'lucide-react';

type DemoCategory = 'bebidas' | 'cafe' | 'cuidados';

type DemoProduct = {
  id: string;
  name: string;
  category: DemoCategory;
  description: string;
  priceMinor: number;
  stock: number;
};

const SHOPS = [
  { slug: 'fomentosial', name: 'Fomento Barbershop' },
  { slug: 'maputo-matola', name: 'Matola Prime Barber' },
  { slug: 'magoanine-c', name: 'MUFU Barber House' },
  { slug: 'oryon', name: 'Oryon Barber Studio' },
] as const;

const PRODUCTS: DemoProduct[] = [
  { id: 'nam-1500', name: 'TESTE QA | Água Namaacha 1,5 L', category: 'bebidas', description: 'Formato de 1,5 L · stock de teste', priceMinor: 4000, stock: 6 },
  { id: 'nam-500', name: 'TESTE QA | Água Namaacha 500 ml', category: 'bebidas', description: 'Formato de 500 ml · stock de teste', priceMinor: 3000, stock: 12 },
  { id: 'cappuccino', name: 'TESTE QA | Cappuccino por porção', category: 'cafe', description: 'Uma porção · stock de teste', priceMinor: 12000, stock: 5 },
  { id: 'ceres-200', name: 'TESTE QA | Ceres Laranja 200 ml', category: 'bebidas', description: 'Formato de 200 ml · stock de teste', priceMinor: 4500, stock: 4 },
  { id: 'coca-330', name: 'TESTE QA | Coca-Cola Original 330 ml', category: 'bebidas', description: 'Formato de 330 ml · stock de teste', priceMinor: 5500, stock: 8 },
  { id: 'coca-zero-330', name: 'TESTE QA | Coca-Cola Zero 330 ml', category: 'bebidas', description: 'Formato de 330 ml · stock de teste', priceMinor: 5100, stock: 6 },
  { id: 'fanta-330', name: 'TESTE QA | Fanta Laranja 330 ml', category: 'bebidas', description: 'Formato de 330 ml · stock de teste', priceMinor: 5000, stock: 6 },
  { id: 'fonte-fresca-500', name: 'TESTE QA | Fonte Fresca 500 ml', category: 'bebidas', description: 'Formato de 500 ml · stock de teste', priceMinor: 1500, stock: 12 },
  { id: 'beard-oil', name: 'TESTE QA | Óleo de barba 30 ml', category: 'cuidados', description: 'Formato de 30 ml · stock de teste', priceMinor: 25000, stock: 3 },
];

const CATEGORIES: { id: 'all' | DemoCategory; label: string }[] = [
  { id: 'all', label: 'Todos os artigos' },
  { id: 'bebidas', label: 'Bebidas' },
  { id: 'cafe', label: 'Café' },
  { id: 'cuidados', label: 'Cuidados pessoais' },
];

function formatDemoPrice(priceMinor: number): string {
  const value = new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(priceMinor / 100);
  return value + ' MT';
}

function categoryLabel(category: DemoCategory): string {
  if (category === 'bebidas') return 'Bebidas';
  if (category === 'cafe') return 'Café';
  return 'Cuidados pessoais';
}

export default function ShopSimulationDemo() {
  const [shopSlug, setShopSlug] = useState<string>(SHOPS[0].slug);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | DemoCategory>('all');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [confirmationShown, setConfirmationShown] = useState(false);

  const activeShop = SHOPS.find((shop) => shop.slug === shopSlug) ?? SHOPS[0];
  const visibleProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-PT');
    return PRODUCTS.filter((product) => {
      const categoryMatches = category === 'all' || product.category === category;
      const textMatches = !term || [product.name, product.description, categoryLabel(product.category)]
        .join(' ').toLocaleLowerCase('pt-PT').includes(term);
      return categoryMatches && textMatches;
    });
  }, [search, category]);

  const selectedProducts = PRODUCTS.filter((product) => (cart[product.id] ?? 0) > 0);
  const totalItems = selectedProducts.reduce((sum, product) => sum + (cart[product.id] ?? 0), 0);
  const subtotalMinor = selectedProducts.reduce((sum, product) => sum + product.priceMinor * (cart[product.id] ?? 0), 0);

  function changeQuantity(product: DemoProduct, delta: number) {
    setConfirmationShown(false);
    setCart((current) => {
      const nextQty = Math.max(0, Math.min(product.stock, (current[product.id] ?? 0) + delta));
      const next = { ...current };
      if (nextQty === 0) delete next[product.id];
      else next[product.id] = nextQty;
      return next;
    });
  }

  function chooseShop(slug: string) {
    setShopSlug(slug);
    setCart({});
    setConfirmationShown(false);
  }

  function resetDemo() {
    setCart({});
    setSearch('');
    setCategory('all');
    setConfirmationShown(false);
  }

  return (
    <main className="barber-shell min-h-screen px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-mid transition-colors hover:text-ink-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft rounded-lg">
            <ArrowLeft size={17} aria-hidden="true" /> Voltar à aplicação
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-semibold tracking-wide text-amber-100">
            <span className="h-2 w-2 rounded-full bg-amber-300" aria-hidden="true" />
            MODO DEMONSTRAÇÃO · QA
          </span>
        </header>

        <section className="rounded-3xl border border-amber-200/20 bg-amber-100/[.045] p-5 sm:p-7" aria-labelledby="demo-heading">
          <div className="flex items-start gap-4">
            <div className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl border border-amber-200/20 bg-amber-100/10 text-amber-100 sm:grid">
              <Store size={23} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-amber-100/80">BarberOS / Loja</p>
              <h1 id="demo-heading" className="mt-2 text-3xl font-semibold tracking-tight text-ink-hi sm:text-4xl">Demonstração da Loja</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-mid sm:text-base">
                Explore o catálogo, pesquise artigos, ajuste quantidades e teste o resumo do carrinho nas quatro barbearias.
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200/20 bg-black/20 p-4" role="note">
            <Package size={18} className="mt-0.5 shrink-0 text-amber-100" aria-hidden="true" />
            <p className="text-sm leading-6 text-ink-hi">
              <strong>Dados fictícios — não comerciais.</strong> Esta demonstração funciona apenas no browser. Não cria marcações ou encomendas reais, não reserva stock real e não processa pagamentos.
            </p>
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="shop-select-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="shop-select-heading" className="text-lg font-semibold text-ink-hi">Escolha uma barbearia</h2>
              <p className="mt-1 text-sm text-ink-mid">O mesmo catálogo de simulação está disponível em cada opção.</p>
            </div>
            <span className="text-xs text-ink-mid">4 lojas de teste</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="Barbearias de demonstração">
            {SHOPS.map((shop) => (
              <button
                key={shop.slug}
                type="button"
                role="tab"
                aria-selected={shopSlug === shop.slug}
                onClick={() => chooseShop(shop.slug)}
                className={'min-h-14 rounded-2xl border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft ' +
                  (shopSlug === shop.slug ? 'border-accent-soft/60 bg-accent-soft/10 text-ink-hi' : 'border-white/10 bg-white/[.025] text-ink-mid hover:bg-white/[.06]')}
                data-testid={'demo-shop-' + shop.slug}
              >
                <span className="block font-medium">{shop.name}</span>
                <span className="mt-1 block text-xs text-ink-mid">Simulação QA</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4" aria-labelledby="catalog-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-accent-soft">{activeShop.name}</p>
              <h2 id="catalog-heading" className="mt-1 text-2xl font-semibold text-ink-hi">Catálogo de teste</h2>
              <p className="mt-1 text-sm text-ink-mid">Todos os preços e saldos apresentados são apenas ilustrativos.</p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-2 text-xs text-ink-mid">9 artigos · 62 unidades simuladas</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="block">
              <span className="sr-only">Pesquisar artigos</span>
              <span className="relative block">
                <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mid" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Pesquisar por nome, formato ou categoria"
                  className="min-h-12 w-full rounded-xl border border-white/10 bg-black/20 pl-10 pr-3 text-sm text-ink-hi placeholder:text-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                  data-testid="demo-catalog-search"
                />
              </span>
            </label>
            <button
              type="button"
              onClick={resetDemo}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-ink-mid transition-colors hover:bg-white/5 hover:text-ink-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
            >
              <RotateCcw size={16} aria-hidden="true" /> Reiniciar simulação
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por categoria">
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={category === item.id}
                onClick={() => setCategory(item.id)}
                className={'min-h-10 shrink-0 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft ' +
                  (category === item.id ? 'border-accent-soft/60 bg-accent-soft/10 text-ink-hi' : 'border-white/10 text-ink-mid hover:bg-white/5')}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2" data-testid="demo-products">
            {visibleProducts.map((product) => {
              const quantity = cart[product.id] ?? 0;
              return (
                <article key={product.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5" data-testid={'demo-product-' + product.id}>
                  <div className="flex items-start gap-3">
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-amber-200/15 bg-amber-100/[.05] text-amber-100" role="img" aria-label="Ilustração genérica de demonstração, não é fotografia comercial">
                      <Package size={25} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-100/75">{categoryLabel(product.category)} · QA</p>
                      <h3 className="mt-1 break-words font-medium leading-5 text-ink-hi">{product.name}</h3>
                      <p className="mt-1 text-sm leading-5 text-ink-mid">{product.description}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-4">
                    <div>
                      <p className="text-xl font-semibold tabular-nums text-ink-hi">{formatDemoPrice(product.priceMinor)}</p>
                      <p className="mt-1 text-xs text-ink-mid">Stock simulado: {product.stock}</p>
                    </div>
                    <div className="inline-flex items-center gap-3" aria-label={'Quantidade de ' + product.name}>
                      <button
                        type="button"
                        aria-label={'Diminuir ' + product.name}
                        disabled={quantity === 0}
                        onClick={() => changeQuantity(product, -1)}
                        className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-ink-hi disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                        data-testid={'demo-decrease-' + product.id}
                      >
                        <Minus size={16} aria-hidden="true" />
                      </button>
                      <output className="min-w-5 text-center tabular-nums text-ink-hi" aria-live="polite" aria-label={'Quantidade seleccionada de ' + product.name}>{quantity}</output>
                      <button
                        type="button"
                        aria-label={'Adicionar ' + product.name}
                        disabled={quantity >= product.stock}
                        onClick={() => changeQuantity(product, 1)}
                        className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-ink-hi disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                        data-testid={'demo-increase-' + product.id}
                      >
                        <Plus size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
            {visibleProducts.length === 0 && (
              <div className="rounded-2xl border border-white/10 p-8 text-center md:col-span-2" data-testid="demo-empty-search">
                <Package size={25} className="mx-auto text-ink-mid" aria-hidden="true" />
                <p className="mt-3 font-medium text-ink-hi">Nenhum artigo encontrado</p>
                <p className="mt-1 text-sm text-ink-mid">Experimente outro termo ou escolha uma categoria diferente.</p>
              </div>
            )}
          </div>
        </section>

        <section className="sticky bottom-3 z-10 rounded-2xl border border-white/10 bg-black/90 p-4 shadow-2xl backdrop-blur-xl sm:p-5" aria-label="Resumo da simulação" data-testid="demo-cart-summary">
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft/10 text-accent-soft">
              <ShoppingBag size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink-hi">{totalItems} {totalItems === 1 ? 'artigo seleccionado' : 'artigos seleccionados'}</p>
              <p className="mt-1 text-xs text-ink-mid">Subtotal ilustrativo · não constitui cobrança</p>
            </div>
            <p className="text-xl font-semibold tabular-nums text-ink-hi">{formatDemoPrice(subtotalMinor)}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={totalItems === 0}
              onClick={() => setConfirmationShown(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent-soft px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-hi"
              data-testid="demo-confirm-selection"
            >
              <CheckCircle2 size={17} aria-hidden="true" /> Testar confirmação
            </button>
            <button
              type="button"
              onClick={resetDemo}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-ink-mid transition-colors hover:bg-white/5 hover:text-ink-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
            >
              Limpar selecção
            </button>
          </div>
          {confirmationShown && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-300/20 bg-emerald-400/[.06] p-4" role="status" aria-live="polite" data-testid="demo-confirmation-success">
              <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" />
              <div>
                <p className="font-medium text-ink-hi">Simulação concluída</p>
                <p className="mt-1 text-sm leading-5 text-ink-mid">A confirmação foi demonstrada localmente no browser. Nenhum pedido foi enviado ou guardado, nenhuma unidade de stock real foi alterada e nenhum pagamento foi efectuado.</p>
              </div>
            </div>
          )}
        </section>

        <footer className="pb-5 text-center text-xs leading-5 text-ink-mid">
          <p>BarberOS · Demonstração interactiva da Loja · Dados fictícios e não comerciais</p>
          <p>Barbearia seleccionada: {activeShop.name} · Não utilizar para vendas reais.</p>
        </footer>
      </div>
    </main>
  );
}
