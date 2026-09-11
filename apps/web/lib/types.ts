export type BusinessHoursDay={enabled?:boolean;open?:string;close?:string}
export type Store={
  id:string;name:string;slug:string;description:string;logo_url:string;banner_url?:string;email?:string;phone:string;whatsapp:string;address:string;
  currency:string;primary_color:string;is_active:boolean;created_at:string;minimum_order?:number;pickup_enabled?:boolean;delivery_enabled?:boolean;
  cash_enabled?:boolean;cash_on_delivery_enabled?:boolean;bank_transfer_enabled?:boolean;bank_name?:string;bank_account_name?:string;bank_account_number?:string;
  bank_account_type?:string;business_hours?:Record<string,BusinessHoursDay>;order_notice?:string;checkout_message?:string
}
export type Category={id:string;name:string;slug:string;description:string;image_url:string;sort_order:number;is_active:boolean}
export type PriceOption={name:string;price:number}
export type Product={id:string;store_id:string;category_id:string;name:string;slug:string;sku:string;description:string;image_url:string;price:number;compare_price?:number|null;stock?:number|null;track_stock:boolean;variants:PriceOption[];extras:PriceOption[];tag?:string;is_featured?:boolean;sort_order?:number;is_active:boolean;created_at:string}
export type Coupon={id:string;code:string;discount_type:'flat'|'percentage';discount_value:number;min_order:number;usage_limit?:number|null;used_count:number;is_active:boolean}
export type Shipping={id:string;name:string;charge:number;estimated_minutes:number;is_active:boolean}
export type Order={id:string;number:number;customer_name:string;customer_phone:string;total:number;payment_method:string;payment_status:string;status:string;source:string;delivery_type?:'pickup'|'delivery';created_at:string}
export type Customer={id:string;store_id:string;name:string;phone:string;email:string;address:string;notes:string;status:'active'|'blocked';order_count:number;total_spent:number;last_order_at?:string|null;created_at:string}
export type Plan={id:string;name:string;slug:string;description?:string;price:number;billing_period:string;max_stores:number;max_products:number;max_orders:number;whatsapp_enabled:boolean;is_featured?:boolean;is_active?:boolean}
export type Transaction={id:string;store_id?:string;store_name?:string;order_id?:string;type:string;amount:number;currency:string;status:string;reference:string;description:string;created_at:string;user_name?:string;user_email?:string}
export type TicketMessage={id:string;sender_user_id?:string;sender_role:string;sender_name:string;message:string;created_at:string}
export type SupportTicket={id:string;number:number;subject:string;priority:string;status:string;last_reply_at:string;created_at:string;user_name?:string;user_email?:string;messages?:TicketMessage[]}
