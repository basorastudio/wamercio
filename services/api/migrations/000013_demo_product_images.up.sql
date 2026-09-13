-- WAMERCIO 2.1.2: imágenes locales para productos demo.
-- Los recursos viven en apps/web/public/demo-products y no dependen de servicios externos.
WITH demo(template_slug,product_slug,image_url) AS (
 VALUES
  ('comida-rapida','combo-personal','/demo-products/comida-rapida/combo-personal.svg'),
  ('comida-rapida','hamburguesa-clasica','/demo-products/comida-rapida/hamburguesa-clasica.svg'),
  ('comida-rapida','papas-fritas','/demo-products/comida-rapida/papas-fritas.svg'),
  ('comida-rapida','refresco','/demo-products/comida-rapida/refresco.svg'),
  ('pizzeria','pizza-pepperoni','/demo-products/pizzeria/pizza-pepperoni.svg'),
  ('pizzeria','pizza-suprema','/demo-products/pizzeria/pizza-suprema.svg'),
  ('pizzeria','pan-de-ajo','/demo-products/pizzeria/pan-de-ajo.svg'),
  ('pizzeria','refresco','/demo-products/pizzeria/refresco.svg'),
  ('reposteria','bizcocho-de-vainilla','/demo-products/reposteria/bizcocho-de-vainilla.svg'),
  ('reposteria','cupcakes-x6','/demo-products/reposteria/cupcakes-x6.svg'),
  ('reposteria','tres-leches','/demo-products/reposteria/tres-leches.svg'),
  ('boutique','vestido-midi','/demo-products/boutique/vestido-midi.svg'),
  ('boutique','blusa-basica','/demo-products/boutique/blusa-basica.svg'),
  ('boutique','jean-high-waist','/demo-products/boutique/jean-high-waist.svg'),
  ('cosmeticos','labial-mate','/demo-products/cosmeticos/labial-mate.svg'),
  ('cosmeticos','base-liquida','/demo-products/cosmeticos/base-liquida.svg'),
  ('cosmeticos','serum-facial','/demo-products/cosmeticos/serum-facial.svg'),
  ('tecnologia','smartphone-128-gb','/demo-products/tecnologia/smartphone-128-gb.svg'),
  ('tecnologia','audifonos-bluetooth','/demo-products/tecnologia/audifonos-bluetooth.svg'),
  ('tecnologia','cargador-rapido-20w','/demo-products/tecnologia/cargador-rapido-20w.svg'),
  ('ferreteria','taladro-percutor','/demo-products/ferreteria/taladro-percutor.svg'),
  ('ferreteria','galon-de-pintura','/demo-products/ferreteria/galon-de-pintura.svg'),
  ('ferreteria','tubo-pvc','/demo-products/ferreteria/tubo-pvc.svg'),
  ('repuestos','pastillas-de-freno','/demo-products/repuestos/pastillas-de-freno.svg'),
  ('repuestos','filtro-de-aceite','/demo-products/repuestos/filtro-de-aceite.svg'),
  ('repuestos','aceite-de-motor','/demo-products/repuestos/aceite-de-motor.svg'),
  ('salon-belleza','lavado-y-secado','/demo-products/salon-belleza/lavado-y-secado.svg'),
  ('salon-belleza','color-completo','/demo-products/salon-belleza/color-completo.svg'),
  ('salon-belleza','maquillaje-social','/demo-products/salon-belleza/maquillaje-social.svg'),
  ('barberia','corte-clasico','/demo-products/barberia/corte-clasico.svg'),
  ('barberia','corte-barba','/demo-products/barberia/corte-barba.svg'),
  ('barberia','barba','/demo-products/barberia/barba.svg'),
  ('pet-shop','alimento-premium','/demo-products/pet-shop/alimento-premium.svg'),
  ('pet-shop','correa-ajustable','/demo-products/pet-shop/correa-ajustable.svg'),
  ('pet-shop','shampoo-para-mascotas','/demo-products/pet-shop/shampoo-para-mascotas.svg'),
  ('floristeria','ramo-de-rosas','/demo-products/floristeria/ramo-de-rosas.svg'),
  ('floristeria','arreglo-cumpleanos','/demo-products/floristeria/arreglo-cumpleanos.svg'),
  ('regalos-personalizados','taza-personalizada','/demo-products/regalos-personalizados/taza-personalizada.svg'),
  ('regalos-personalizados','camiseta-personalizada','/demo-products/regalos-personalizados/camiseta-personalizada.svg'),
  ('regalos-personalizados','caja-de-regalo','/demo-products/regalos-personalizados/caja-de-regalo.svg'),
  ('suplementos','multivitaminico','/demo-products/suplementos/multivitaminico.svg'),
  ('suplementos','proteina-en-polvo','/demo-products/suplementos/proteina-en-polvo.svg'),
  ('suplementos','creatina','/demo-products/suplementos/creatina.svg'),
  ('mayorista-distribuidor','producto-por-unidad','/demo-products/mayorista-distribuidor/producto-por-unidad.svg'),
  ('mayorista-distribuidor','paquete-surtido','/demo-products/mayorista-distribuidor/paquete-surtido.svg'),
  ('otro-negocio','producto-de-ejemplo','/demo-products/otro-negocio/producto-de-ejemplo.svg')
)
UPDATE template_products tp
SET image_url=demo.image_url
FROM business_templates bt,demo
WHERE tp.template_id=bt.id
  AND bt.slug=demo.template_slug
  AND tp.slug=demo.product_slug
  AND coalesce(tp.image_url,'')='';

WITH demo(template_slug,product_slug,image_url) AS (
 VALUES
  ('comida-rapida','combo-personal','/demo-products/comida-rapida/combo-personal.svg'),
  ('comida-rapida','hamburguesa-clasica','/demo-products/comida-rapida/hamburguesa-clasica.svg'),
  ('comida-rapida','papas-fritas','/demo-products/comida-rapida/papas-fritas.svg'),
  ('comida-rapida','refresco','/demo-products/comida-rapida/refresco.svg'),
  ('pizzeria','pizza-pepperoni','/demo-products/pizzeria/pizza-pepperoni.svg'),
  ('pizzeria','pizza-suprema','/demo-products/pizzeria/pizza-suprema.svg'),
  ('pizzeria','pan-de-ajo','/demo-products/pizzeria/pan-de-ajo.svg'),
  ('pizzeria','refresco','/demo-products/pizzeria/refresco.svg'),
  ('reposteria','bizcocho-de-vainilla','/demo-products/reposteria/bizcocho-de-vainilla.svg'),
  ('reposteria','cupcakes-x6','/demo-products/reposteria/cupcakes-x6.svg'),
  ('reposteria','tres-leches','/demo-products/reposteria/tres-leches.svg'),
  ('boutique','vestido-midi','/demo-products/boutique/vestido-midi.svg'),
  ('boutique','blusa-basica','/demo-products/boutique/blusa-basica.svg'),
  ('boutique','jean-high-waist','/demo-products/boutique/jean-high-waist.svg'),
  ('cosmeticos','labial-mate','/demo-products/cosmeticos/labial-mate.svg'),
  ('cosmeticos','base-liquida','/demo-products/cosmeticos/base-liquida.svg'),
  ('cosmeticos','serum-facial','/demo-products/cosmeticos/serum-facial.svg'),
  ('tecnologia','smartphone-128-gb','/demo-products/tecnologia/smartphone-128-gb.svg'),
  ('tecnologia','audifonos-bluetooth','/demo-products/tecnologia/audifonos-bluetooth.svg'),
  ('tecnologia','cargador-rapido-20w','/demo-products/tecnologia/cargador-rapido-20w.svg'),
  ('ferreteria','taladro-percutor','/demo-products/ferreteria/taladro-percutor.svg'),
  ('ferreteria','galon-de-pintura','/demo-products/ferreteria/galon-de-pintura.svg'),
  ('ferreteria','tubo-pvc','/demo-products/ferreteria/tubo-pvc.svg'),
  ('repuestos','pastillas-de-freno','/demo-products/repuestos/pastillas-de-freno.svg'),
  ('repuestos','filtro-de-aceite','/demo-products/repuestos/filtro-de-aceite.svg'),
  ('repuestos','aceite-de-motor','/demo-products/repuestos/aceite-de-motor.svg'),
  ('salon-belleza','lavado-y-secado','/demo-products/salon-belleza/lavado-y-secado.svg'),
  ('salon-belleza','color-completo','/demo-products/salon-belleza/color-completo.svg'),
  ('salon-belleza','maquillaje-social','/demo-products/salon-belleza/maquillaje-social.svg'),
  ('barberia','corte-clasico','/demo-products/barberia/corte-clasico.svg'),
  ('barberia','corte-barba','/demo-products/barberia/corte-barba.svg'),
  ('barberia','barba','/demo-products/barberia/barba.svg'),
  ('pet-shop','alimento-premium','/demo-products/pet-shop/alimento-premium.svg'),
  ('pet-shop','correa-ajustable','/demo-products/pet-shop/correa-ajustable.svg'),
  ('pet-shop','shampoo-para-mascotas','/demo-products/pet-shop/shampoo-para-mascotas.svg'),
  ('floristeria','ramo-de-rosas','/demo-products/floristeria/ramo-de-rosas.svg'),
  ('floristeria','arreglo-cumpleanos','/demo-products/floristeria/arreglo-cumpleanos.svg'),
  ('regalos-personalizados','taza-personalizada','/demo-products/regalos-personalizados/taza-personalizada.svg'),
  ('regalos-personalizados','camiseta-personalizada','/demo-products/regalos-personalizados/camiseta-personalizada.svg'),
  ('regalos-personalizados','caja-de-regalo','/demo-products/regalos-personalizados/caja-de-regalo.svg'),
  ('suplementos','multivitaminico','/demo-products/suplementos/multivitaminico.svg'),
  ('suplementos','proteina-en-polvo','/demo-products/suplementos/proteina-en-polvo.svg'),
  ('suplementos','creatina','/demo-products/suplementos/creatina.svg'),
  ('mayorista-distribuidor','producto-por-unidad','/demo-products/mayorista-distribuidor/producto-por-unidad.svg'),
  ('mayorista-distribuidor','paquete-surtido','/demo-products/mayorista-distribuidor/paquete-surtido.svg'),
  ('otro-negocio','producto-de-ejemplo','/demo-products/otro-negocio/producto-de-ejemplo.svg')
)
UPDATE products p
SET image_url=demo.image_url,updated_at=now()
FROM stores st,business_templates bt,demo
WHERE p.store_id=st.id
  AND st.template_id=bt.id
  AND bt.slug=demo.template_slug
  AND p.slug=demo.product_slug
  AND coalesce(p.image_url,'')='';

-- Usa la primera imagen de producto como portada visual de categorías demo existentes.
UPDATE categories c
SET image_url=(
  SELECT p.image_url
  FROM products p
  WHERE p.store_id=c.store_id
    AND p.category_id=c.id
    AND coalesce(p.image_url,'')<>''
  ORDER BY p.is_featured DESC,p.sort_order,p.name
  LIMIT 1
)
WHERE coalesce(c.image_url,'')=''
  AND EXISTS(
    SELECT 1 FROM products p
    WHERE p.store_id=c.store_id
      AND p.category_id=c.id
      AND p.image_url LIKE '/demo-products/%'
  );
