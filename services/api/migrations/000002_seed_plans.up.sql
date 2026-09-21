INSERT INTO plans(name,slug,price,billing_period,max_stores,max_products,max_orders,whatsapp_enabled)
VALUES
 ('Emprende','emprende',0,'monthly',1,50,100,true),
 ('Negocio','negocio',1490,'monthly',3,500,2000,true),
 ('Pro','pro',2990,'monthly',10,5000,20000,true)
ON CONFLICT (slug) DO NOTHING;
