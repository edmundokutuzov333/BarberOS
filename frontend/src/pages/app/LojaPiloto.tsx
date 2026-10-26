import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ClipboardCheck, PackageCheck, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Page } from '@/components/layout/Page';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import { humanError } from '@/lib/utils';

type Product = {
  id:string; name:string; brand:string|null; is_active:boolean; image_url:string|null;
  image_alt:string|null; image_source_url:string|null; image_source_note:string|null;
  image_source_checked_at:string|null; image_authorized_by:string|null; image_authorized_at:string|null;
  catalog_verified_at:string|null; catalog_verified_by:string|null; catalog_verification_note:string|null;
};
type Variant = {id:string;product_id:string;label:string;price_minor:number;stock_on_hand:number;is_active:boolean};
type Readiness = {
 products_total:number;products_active:number;products_verified:number;unverified_active_products:number;
 active_products_missing_photo:number;active_products_missing_provenance:number;
 active_products_without_variant:number;active_tracked_variants_out_of_stock:number;
 catalog_ready:boolean;shop_enabled:boolean;
};
const when=(value:string)=>new Intl.DateTimeFormat('pt-PT',{dateStyle:'short',timeStyle:'short',timeZone:'Africa/Maputo'}).format(new Date(value));
const fmt=(value:number)=>new Intl.NumberFormat('pt-PT',{maximumFractionDigits:0}).format(value||0);

export default function LojaPiloto(){
 const {shop,role}=useShop();const qc=useQueryClient();const allowed=!!shop?.id&&['owner','manager'].includes(role??'');
 const [notes,setNotes]=useState<Record<string,string>>({});
 const readiness=useQuery({queryKey:['shop-phase7-readiness',shop?.id],enabled:allowed,retry:false,queryFn:async()=>{const {data,error}=await (supabase as any).rpc('get_shop_phase7_catalog_readiness',{p_barbershop_id:shop!.id});if(error)throw error;return data as Readiness;}});
 const products=useQuery({queryKey:['shop-phase7-products',shop?.id],enabled:allowed,retry:false,queryFn:async()=>{const {data,error}=await (supabase as any).from('shop_products').select('id,name,brand,is_active,image_url,image_alt,image_source_url,image_source_note,image_source_checked_at,image_authorized_by,image_authorized_at,catalog_verified_at,catalog_verified_by,catalog_verification_note').eq('barbershop_id',shop!.id).order('name');if(error)throw error;return (data??[]) as Product[]}});
 const variants=useQuery({queryKey:['shop-phase7-variants',shop?.id],enabled:allowed,retry:false,queryFn:async()=>{const {data,error}=await supabase.from('shop_product_variants').select('id,product_id,label,price_minor,stock_on_hand,is_active').eq('barbershop_id',shop!.id).order('label');if(error)throw error;return (data??[]) as unknown as Variant[]}});
 const byProduct=useMemo(()=>{const result:Record<string,Variant[]>={};for(const variant of variants.data??[]){(result[variant.product_id]??=[]).push(variant);}return result;},[variants.data]);
 const verify=useMutation({mutationFn:async({productId,note}:{productId:string;note:string})=>{if(note.trim().length<20||note.trim().length>500)throw new Error('Registe uma nota de verificação entre 20 e 500 caracteres.');const {data,error}=await (supabase as any).rpc('verify_shop_catalog_product',{p_barbershop_id:shop!.id,p_product_id:productId,p_verification_note:note.trim()});if(error)throw error;if(!data?.catalog_verified_at)throw new Error('A verificação não foi confirmada pelo servidor.');},onSuccess:async(_data,variables)=>{setNotes(previous=>({...previous,[variables.productId]:''}));await Promise.all([qc.invalidateQueries({queryKey:['shop-phase7-readiness',shop?.id]}),qc.invalidateQueries({queryKey:['shop-phase7-products',shop?.id]})]);toast.success('Artigo validado para o catálogo do piloto.');},onError:error=>toast.error(humanError(error))});
 const metrics=readiness.data?[
 {label:'Artigos registados',value:readiness.data.products_total,Icon:ClipboardCheck},
 {label:'Artigos publicados',value:readiness.data.products_active,Icon:PackageCheck},
 {label:'Artigos validados',value:readiness.data.products_verified,Icon:BadgeCheck},
 {label:'Sem variante activa',value:readiness.data.active_products_without_variant,Icon:ShieldAlert},
 {label:'Sem fotografia',value:readiness.data.active_products_missing_photo,Icon:ShieldAlert},
 {label:'Fotografia sem proveniência completa',value:readiness.data.active_products_missing_provenance,Icon:ShieldAlert},
 {label:'Variantes sem stock',value:readiness.data.active_tracked_variants_out_of_stock,Icon:ShieldAlert},
]:[];
 if(!allowed)return <Page title="Preparação do piloto"><Panel><p className="text-sm text-ink-mid">Esta área requer permissões de proprietário ou gestor de uma barbearia.</p></Panel></Page>;
 return <Page title="Preparação do piloto" subtitle="Validação de artigos reais, proveniência de imagens e disponibilidade antes do piloto. A aprovação é feita por um responsável da própria barbearia.">
  <div className="flex justify-end"><Button variant="secondary" onClick={()=>{void readiness.refetch();void products.refetch();void variants.refetch();}}><RefreshCw size={16}/> Actualizar</Button></div>
  <Panel title="Estado do catálogo">
   {readiness.isLoading?<Skeleton/>:readiness.isError?<ErrorState message={`Não foi possível verificar o catálogo: ${humanError(readiness.error)}`} onRetry={()=>void readiness.refetch()}/>:readiness.data?<>
    <div className="flex flex-wrap items-center gap-2">{readiness.data.catalog_ready?<BadgeCheck size={20} className="text-accent-soft"/>:<ShieldAlert size={20} className="text-ink-mid"/>}<strong className="text-ink-hi">{readiness.data.catalog_ready?'Catálogo tecnicamente preparado':'Existem verificações pendentes'}</strong></div>
    <p className="mt-2 text-sm text-ink-mid">{readiness.data.shop_enabled?'A flag da Loja está activa. Não altere produtos publicados sem voltar a validar o catálogo.':'A flag pública da Loja continua desligada. A validação do catálogo não activa a loja para clientes.'}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({label,value,Icon})=><div key={label} className="rounded-xl border border-white/10 p-3"><div className="flex items-center gap-2 text-sm text-ink-mid"><Icon size={15}/>{label}</div><div className="mt-2 text-xl font-semibold text-ink-hi">{fmt(value)}</div></div>)}</div>
    <p className="mt-4 text-xs text-ink-low">Este estado mede o catálogo da barbearia, não substitui o teste operacional presencial, a formação da equipa nem a aceitação do piloto.</p>
   </>:null}
  </Panel>
  <Panel title="Validação dos artigos">
   <p className="mb-4 text-sm text-ink-mid">Antes de validar, confira fisicamente marca, variante/SKU ou descrição genérica, preço, stock, fotografia e permissão de utilização. A nota deve identificar o fornecedor ou a verificação realizada; não use valores nem fotografias ilustrativas como se fossem stock real.</p>
   {products.isLoading||variants.isLoading?<Skeleton/>:products.isError?<ErrorState message={`Não foi possível carregar os artigos: ${humanError(products.error)}`} onRetry={()=>void products.refetch()}/>:variants.isError?<ErrorState message={`Não foi possível carregar as variantes: ${humanError(variants.error)}`} onRetry={()=>void variants.refetch()}/>:!products.data?.length?<EmptyState title="Ainda não há artigos registados." body="Crie os artigos reais, as variantes, preços, stock e imagens na área Loja antes de iniciar a validação do piloto."/>:
    <div className="space-y-3">{products.data.map(product=>{const vs=byProduct[product.id]??[];const active=vs.filter(v=>v.is_active);const verified=!!product.catalog_verified_at&&!!product.catalog_verified_by&&!!product.catalog_verification_note;const hasPhoto=!!product.image_url&&!!product.image_alt;const imageApproved=!!product.image_source_note&&!!product.image_source_checked_at&&!!product.image_authorized_by&&!!product.image_authorized_at;return <article key={product.id} className="rounded-2xl border border-white/10 p-4">
     <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium text-ink-hi">{product.name}</h3><p className="mt-1 text-sm text-ink-mid">{product.brand||'Marca por confirmar'} · {active.length} variantes activas · {active.filter(v=>v.stock_on_hand>0).length} com stock</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs">{verified?`Validado em ${when(product.catalog_verified_at!)}`:'Por validar'}</span></div>
     <p className="mt-2 text-xs text-ink-low">{product.is_active?'Publicado':'Rascunho'} · {hasPhoto?'Fotografia registada':'Sem fotografia'} · {imageApproved?'Proveniência de imagem aprovada':'Proveniência de imagem incompleta'}</p>
     {verified&&<p className="mt-2 text-sm text-ink-mid">Nota de verificação: {product.catalog_verification_note}</p>}
     <label htmlFor={`catalog-note-${product.id}`} className="mt-3 block text-xs text-ink-mid">Registo da verificação física (20 a 500 caracteres)</label>
     <textarea id={`catalog-note-${product.id}`} value={notes[product.id]??''} onChange={event=>setNotes(previous=>({...previous,[product.id]:event.target.value}))} maxLength={500} rows={3} placeholder="Ex.: fornecedor/recibo consultado; embalagem e SKU conferidos; preço e stock contados; utilização da imagem confirmada." className="field mt-1 w-full resize-y"/>
     <div className="mt-3 flex justify-end"><Button variant="secondary" disabled={verify.isPending||(notes[product.id]??'').trim().length<20||(notes[product.id]??'').trim().length>500} loading={verify.isPending} onClick={()=>verify.mutate({productId:product.id,note:notes[product.id]??''})}><BadgeCheck size={15}/>{verified?'Validar novamente':'Validar artigo para o piloto'}</Button></div>
    </article>})}</div>}
  </Panel>
 </Page>;
}
