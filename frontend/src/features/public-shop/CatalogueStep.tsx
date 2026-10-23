import { useMemo, useState } from 'react';
import { Minus, Package, Plus, Search, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { formatMT, humanError } from '@/lib/utils';
import type { PublicShopCatalog, PublicShopProduct, PublicShopVariant } from '@/features/public-shop/catalog';

export type ShopCart = Record<string, { qty: number; options: string[] }>;

type Props = {
  catalog: PublicShopCatalog;
  cart: ShopCart;
  loading?: boolean;
  error?: unknown;
  onRetry: () => void;
  onQuantityChange: (product: PublicShopProduct, variant: PublicShopVariant, delta: number) => void;
  onOptionChange: (variantId: string, option: string, checked: boolean) => void;
  onContinueWithoutProducts: () => void;
};

export function ShopCatalogueStep({
  catalog, cart, loading = false, error, onRetry,
  onQuantityChange, onOptionChange, onContinueWithoutProducts,
}: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const products = catalog.products;
  const hasUncategorised = products.some((product) => !product.category_id);
  const categories = useMemo(() => [
    { id: 'all', name: 'Todos' },
    ...catalog.categories.map(({ id, name }) => ({ id, name })),
    ...(hasUncategorised ? [{ id: 'other', name: 'Outros' }] : []),
  ], [catalog.categories, hasUncategorised]);
  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('pt-PT');
    return products.filter((product) => {
      const matchesCategory = category === 'all'
        || (category === 'other' ? !product.category_id : product.category_id === category);
      const searchable = [product.name, product.brand ?? '', product.description ?? '', ...product.variants.map((variant) => variant.label)]
        .join(' ').toLocaleLowerCase('pt-PT');
      return matchesCategory && (!needle || searchable.includes(needle));
    });
  }, [products, search, category]);
  const selectedLines = useMemo(() => products.flatMap((product) => product.variants.flatMap((variant) => {
    const selected = cart[variant.id];
    return selected?.qty > 0 ? [{ product, variant, qty: selected.qty, options: selected.options }] : [];
  })), [products, cart]);
  const totalQuantity = selectedLines.reduce((total, line) => total + line.qty, 0);
  const subtotal = selectedLines.reduce((total, line) => total + line.qty * line.variant.price_minor, 0);

  return (
    <Panel title="O que gostaria de ter à sua espera?" testId="booking-step-shop">
      <div className="space-y-5">
        <div>
          <p className="t-body text-ink-mid">Escolha bebidas, snacks ou produtos. É opcional.</p>
          <p className="t-label text-ink-mid mt-2">A pré-selecção não é ainda registada como pedido nem representa pagamento. O envio seguro do pedido será activado numa fase posterior.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="public-shop-search" className="t-label text-ink-mid">Pesquisar produtos</label>
          <div className="relative">
            <Search size={17} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mid" />
            <input id="public-shop-search" type="search" autoComplete="off" value={search}
              onChange={(event) => setSearch(event.target.value)} placeholder="Nome, marca ou formato"
              className="min-h-11 w-full rounded-xl border border-white/10 bg-black/20 pl-10 pr-3 text-sm text-ink-hi placeholder:text-ink-lo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
              data-testid="public-shop-search" />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Categorias de produtos" data-testid="public-shop-categories">
          {categories.map((item) => (
            <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)}
              className={'min-h-10 shrink-0 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft ' + (category === item.id ? 'border-accent-soft bg-accent-soft/15 text-ink-hi' : 'border-white/10 text-ink-mid hover:bg-white/5')}>
              {item.name}
            </button>
          ))}
        </div>
        {loading ? (
          <div aria-busy="true" aria-label="A carregar o catálogo" data-testid="public-shop-loading" className="space-y-3">
            <Skeleton className="h-32" lines={5} /><Skeleton className="h-32" lines={5} />
          </div>
        ) : error ? (
          <div data-testid="public-shop-error">
            <ErrorState message={humanError(error)} onRetry={onRetry} />
          </div>
        ) : products.length === 0 ? (
          <div data-testid="public-shop-empty">
            <EmptyState title="Esta barbearia ainda não tem produtos disponíveis para pedido." body="Pode continuar com a marcação." />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div data-testid="public-shop-no-results">
            <EmptyState title="Nenhum produto encontrado" body="Experimente outro nome ou escolha uma categoria diferente." />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2" data-testid="public-shop-products">
            {filteredProducts.map((product) => (
              <article key={product.id} className="min-w-0 rounded-2xl border border-white/10 bg-white/[.025] p-3 sm:p-4" data-testid={'public-shop-product-' + product.id}>
                <div className="flex gap-3">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.image_alt || product.name} loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover bg-white/5 sm:h-24 sm:w-24" />
                  ) : (
                    <div aria-hidden="true" className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-white/5 text-ink-mid sm:h-24 sm:w-24"><Package size={24} /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    {product.brand && <p className="t-label text-ink-mid">{product.brand}</p>}
                    <h3 className="font-medium text-ink-hi break-words">{product.name}</h3>
                    {product.description && <p className="t-body text-ink-mid mt-1 line-clamp-3">{product.description}</p>}
                    <p className="t-label text-ink-mid mt-1">{product.category_id ? catalog.categories.find((item) => item.id === product.category_id)?.name ?? 'Produto' : 'Outros'}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {product.variants.map((variant) => {
                    const selected = cart[variant.id] ?? { qty: 0, options: [] };
                    const selectedOptions = new Set(selected.options);
                    return (
                      <div key={variant.id} className="rounded-xl border border-white/10 p-3" data-testid={'public-shop-variant-' + variant.id}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="t-body text-ink-hi">{variant.label}</p>
                            {variant.unit_label !== 'unidade' && <p className="t-label text-ink-mid">{variant.unit_label}</p>}
                            <p className="t-card text-ink-hi mt-1">{formatMT(variant.price_minor)}</p>
                            {!variant.available && <p className="t-label text-st-noshow mt-1" role="status">Indisponível neste momento</p>}
                          </div>
                          {variant.available && (
                            <div className="inline-flex shrink-0 items-center gap-2">
                              <button type="button" aria-label={'Diminuir ' + product.name + ' ' + variant.label} disabled={selected.qty === 0}
                                onClick={() => onQuantityChange(product, variant, -1)}
                                className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-ink-hi disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"><Minus size={16} /></button>
                              <output aria-live="polite" aria-label={'Quantidade seleccionada de ' + product.name + ' ' + variant.label} className="min-w-5 text-center tabular-nums">{selected.qty}</output>
                              <button type="button" aria-label={'Adicionar ' + product.name + ' ' + variant.label} disabled={selected.qty >= 100}
                                onClick={() => onQuantityChange(product, variant, 1)}
                                className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-ink-hi disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"><Plus size={16} /></button>
                            </div>
                          )}
                        </div>
                        {selected.qty > 0 && product.order_options.length > 0 && (
                          <fieldset className="mt-3 border-t border-white/10 pt-3">
                            <legend className="t-label text-ink-mid mb-2">Preferências (opcional)</legend>
                            <div className="flex flex-wrap gap-x-4 gap-y-2">
                              {product.order_options.map((option) => (
                                <label key={option} className="inline-flex min-h-8 cursor-pointer items-center gap-2 text-sm text-ink-mid">
                                  <input type="checkbox" checked={selectedOptions.has(option)}
                                    onChange={(event) => onOptionChange(variant.id, option, event.target.checked)}
                                    className="h-4 w-4 accent-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft" />
                                  {option}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="sticky bottom-20 z-10 rounded-2xl border border-white/10 bg-black/90 p-4 shadow-xl backdrop-blur-xl lg:static" data-testid="public-shop-summary" aria-live="polite">
          <div className="flex items-center gap-3">
            <ShoppingBag size={18} aria-hidden="true" className="text-accent-soft" />
            <div className="min-w-0 flex-1">
              <p className="t-body text-ink-hi">{totalQuantity} {totalQuantity === 1 ? 'artigo seleccionado' : 'artigos seleccionados'}</p>
              <p className="t-label text-ink-mid mt-1">Subtotal dos produtos</p>
            </div>
            <p className="t-card tabular-nums text-ink-hi">{formatMT(subtotal)}</p>
          </div>
          <p className="t-label text-ink-mid mt-2">Este subtotal é separado do preço do serviço; não é uma cobrança nem um pedido confirmado.</p>
        </div>
        <div className="flex justify-start">
          <Button type="button" variant="secondary" onClick={onContinueWithoutProducts}>Continuar sem produtos</Button>
        </div>
      </div>
    </Panel>
  );
}
