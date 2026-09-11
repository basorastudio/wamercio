export type Store={id:string;name:string;slug:string;description:string;logo_url:string;phone:string;whatsapp:string;address:string;currency:string;primary_color:string;is_active:boolean;created_at:string}
export type Category={id:string;name:string;slug:string;description:string;image_url:string;sort_order:number;is_active:boolean}
export type PriceOption={name:string;price:number}
export type Product={id:string;store_id:string;category_id:string;name:string;slug:string;sku:string;description:string;image_url:string;price:number;compare_price?:number|null;stock?:number|null;track_stock:boolean;variants:PriceOption[];extras:PriceOption[];is_active:boolean;created_at:string}
export type Coupon={id:string;code:string;discount_type:'flat'|'percentage';discount_value:number;min_order:number;usage_limit?:number|null;used_count:number;is_active:boolean}
export type Shipping={id:string;name:string;charge:number;estimated_minutes:number;is_active:boolean}
export type Order={id:string;number:number;customer_name:string;customer_phone:string;total:number;payment_method:string;payment_status:string;status:string;source:string;created_at:string}
