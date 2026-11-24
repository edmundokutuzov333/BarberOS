import { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type CatalogProduct = Tables<"shop_products">;
export type ProductForm = {
  name: string;
  brand: string;
  category_id: string;
  description: string;
  product_kind: "consume_here" | "takeaway" | "both";
  track_stock: boolean;
  image_url: string;
  image_alt: string;
  image_source_url: string;
  image_source_note: string;
  order_options: string;
};
const https = z
  .string()
  .trim()
  .refine((value) => {
    if (!value) return true;
    try {
      return new URL(value).protocol === "https:" && !/\s/.test(value);
    } catch {
      return false;
    }
  }, "Introduza um endereço HTTPS válido.");
export const productFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Use pelo menos 2 caracteres.")
      .max(160, "Use até 160 caracteres."),
    brand: z.string().trim().max(120, "Use até 120 caracteres."),
    category_id: z.union([
      z.literal(""),
      z.string().uuid("Seleccione uma categoria válida."),
    ]),
    description: z.string().trim().max(2000, "Use até 2.000 caracteres."),
    product_kind: z.enum(["consume_here", "takeaway", "both"]),
    track_stock: z.boolean(),
    image_url: https,
    image_alt: z.string().trim().max(250, "Use até 250 caracteres."),
    image_source_url: https,
    image_source_note: z.string().trim().max(500, "Use até 500 caracteres."),
    order_options: z
      .string()
      .transform((value) =>
        value
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean),
      )
      .pipe(
        z
          .array(
            z.string().max(80, "Cada preferência pode ter até 80 caracteres."),
          )
          .max(10, "Use até 10 preferências."),
      ),
  })
  .superRefine((value, context) => {
    if (value.image_url) {
      for (const key of ["image_alt", "image_source_note"] as const) {
        if (!value[key])
          context.addIssue({
            code: "custom",
            path: [key],
            message:
              key === "image_alt"
                ? "Descreva a fotografia."
                : "Indique a origem e a autorização de utilização.",
          });
      }
    }
    if (
      new Set(
        value.order_options.map((item) => item.toLocaleLowerCase("pt-PT")),
      ).size !== value.order_options.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["order_options"],
        message: "Remova as preferências repetidas.",
      });
    }
  });
const savedProduct = z.object({
  id: z.string().uuid(),
  barbershop_id: z.string().uuid(),
  updated_at: z.string(),
  is_active: z.boolean(),
});
export async function saveCatalogProduct(
  shopId: string,
  productId: string,
  form: ProductForm,
  version?: string,
) {
  const value = productFormSchema.parse(form);
  const { data, error } = await supabase.rpc("save_shop_catalog_product", {
    p_barbershop_id: shopId,
    p_product_id: productId,
    p_payload: {
      ...value,
      brand: value.brand || null,
      category_id: value.category_id || null,
      description: value.description || null,
      image_url: value.image_url || null,
      image_alt: value.image_alt || null,
      image_source_url: value.image_source_url || null,
      image_source_note: value.image_source_note || null,
    },
    ...(version ? { p_expected_updated_at: version } : {}),
  });
  if (error) throw error;
  const result = savedProduct.parse(data);
  if (result.id !== productId || result.barbershop_id !== shopId)
    throw new Error("SHOP_CATALOG_RESPONSE_INVALID");
  return result;
}
export async function publishCatalogProduct(
  shopId: string,
  product: Pick<CatalogProduct, "id" | "updated_at" | "is_active">,
  note?: string,
) {
  const { data, error } = await supabase.rpc("publish_shop_catalog_product", {
    p_barbershop_id: shopId,
    p_product_id: product.id,
    p_publish: !product.is_active,
    p_expected_updated_at: product.updated_at,
    ...(note ? { p_verification_note: note.trim() } : {}),
  });
  if (error) throw error;
  const result = savedProduct.parse(data);
  if (result.id !== product.id || result.barbershop_id !== shopId)
    throw new Error("SHOP_CATALOG_RESPONSE_INVALID");
  return result;
}
const messages: Record<string, string> = {
  SHOP_CATALOG_CONFLICT:
    "Este produto foi alterado por outra pessoa. Actualize o catálogo e reveja as alterações antes de guardar.",
  SHOP_CATALOG_FORBIDDEN:
    "A sua permissão para gerir esta loja deixou de estar disponível.",
  SHOP_CATALOG_INVALID_INPUT: "Reveja os dados do produto antes de guardar.",
  SHOP_CATALOG_PRODUCT_NOT_FOUND:
    "Este produto já não está disponível. Actualize o catálogo.",
  SHOP_CATALOG_VERIFICATION_NOTE_REQUIRED:
    "Descreva a verificação em 20 a 500 caracteres.",
  SHOP_CATALOG_IMAGE_NOT_APPROVED:
    "Adicione uma fotografia com descrição, origem e autorização antes de publicar.",
  SHOP_PRODUCT_REQUIRES_ACTIVE_VARIANT:
    "Adicione e active pelo menos uma variante antes de publicar.",
  SHOP_PRODUCT_CATEGORY_NOT_PUBLISHED:
    "Active a categoria antes de publicar este produto.",
  SHOP_CATALOG_STOCK_UNAVAILABLE:
    "Registe o stock físico disponível antes de publicar um produto com controlo de stock.",
  PASSWORD_CHANGE_REQUIRED: "Actualize a sua palavra-passe para continuar.",
};
export function catalogError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  return (
    Object.entries(messages).find(([code]) => message.includes(code))?.[1] ??
    "Não foi possível concluir a operação. Os dados introduzidos foram preservados. Tente novamente."
  );
}
