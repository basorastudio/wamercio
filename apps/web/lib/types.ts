export type BusinessHoursDay={enabled?:boolean;open?:string;close?:string}
export type Store={
  id:string;name:string;slug:string;public_url?:string;description:string;logo_url:string;banner_url?:string;whatsapp:string;address:string;
  service_scope?:'national'|'provincial'|'municipal';province_code?:string;province?:string;city_id?:string;municipality?:string;neighborhood_id?:string;neighborhood?:string;street?:string;street_number?:string;
  currency:string;primary_color:string;is_active:boolean;created_at:string;minimum_order?:number;pickup_enabled?:boolean;delivery_enabled?:boolean;dine_in_enabled?:boolean;reservation_duration_minutes?:number;
  cash_enabled?:boolean;cash_on_delivery_enabled?:boolean;bank_transfer_enabled?:boolean;bank_name?:string;bank_account_name?:string;bank_account_number?:string;
  bank_account_type?:string;payment_methods_by_fulfillment?:Record<'delivery'|'pickup'|'dine_in',Record<'cash'|'cash_on_delivery'|'bank_transfer',boolean>>;business_hours?:Record<string,BusinessHoursDay>;order_notice?:string;checkout_message?:string;accepting_orders?:boolean;open_now?:boolean;business_engine?:string;template_config?:Record<string,any>;template_slug?:string;template_name?:string;visual_theme?:string;theme_config?:Record<string,any>
}
export type Category={id:string;name:string;slug:string;description:string;image_url:string;sort_order:number;is_active:boolean}
export type PriceOption={name:string;price:number}
export type ModifierOption={id:string;name:string;price_delta:number;is_active:boolean;sort_order:number}
export type ModifierGroup={id:string;name:string;description:string;min_select:number;max_select:number;is_required:boolean;is_active:boolean;sort_order:number;options:ModifierOption[]}
export type Allergen={id:string;name:string;icon:string;is_active:boolean;sort_order:number}
export type BundleComponent={product_id:string;name?:string;quantity:number;sort_order?:number}
export type ProductMedia={id?:string;url:string;alt_text:string;sort_order:number}
export type ProductTranslation={locale:string;name:string;description:string}
export type Product={id:string;store_id:string;category_id:string;name:string;slug:string;sku:string;description:string;image_url:string;price:number;compare_price?:number|null;stock?:number|null;track_stock:boolean;variants:PriceOption[];extras:PriceOption[];attributes?:Record<string,any>;tag?:string;is_featured?:boolean;sort_order?:number;is_active:boolean;created_at:string;modifier_groups?:ModifierGroup[];modifier_group_ids?:string[];bundle_components?:BundleComponent[];allergens?:Allergen[];allergen_ids?:string[];dietary_tags?:string[];product_media?:ProductMedia[];product_translations?:ProductTranslation[];rating_average?:number;review_count?:number}
export type AutomationRule={id:string;name:string;event:string;audience:'event_customer'|'all_customers';template_text:string;delay_minutes:number;is_active:boolean;created_at:string;updated_at?:string}
export type AutomationRun={id:string;rule_name:string;event:string;entity_id:string;destination:string;rendered_text:string;status:'queued'|'sent'|'skipped'|'failed';error:string;scheduled_for:string;created_at:string}
export type Coupon={id:string;code:string;discount_type:'flat'|'percentage';discount_value:number;min_order:number;starts_at?:string|null;ends_at?:string|null;usage_limit?:number|null;used_count:number;is_active:boolean;created_at?:string}

export type Promotion={id:string;name:string;discount_type:'flat'|'percentage';discount_value:number;scope:'all'|'products'|'categories';min_order:number;starts_at?:string|null;ends_at?:string|null;usage_limit?:number|null;used_count:number;is_active:boolean;product_ids:string[];category_ids:string[];created_at:string}
export type Reservation={id:string;table_id:string;table_name:string;area_name:string;reserved_at:string;duration_minutes:number;party_size:number;status:'reserved'|'confirmed'|'seated'|'completed'|'canceled'|'no_show';customer_name:string;customer_phone:string;notes:string;order_id?:string;created_at:string}
export type Shipping={id:string;name:string;charge:number;estimated_minutes:number;is_active:boolean}
export type Order={id:string;number:number;customer_name:string;customer_phone:string;total:number;coupon_code?:string;promotion_name?:string;discount?:number;payment_method:string;payment_status:string;cash_change_requested?:boolean;cash_tendered?:number;status:string;source:string;delivery_type?:'pickup'|'delivery'|'dine_in';table_id?:string|null;table_name?:string;reservation_at?:string|null;party_size?:number;flow_type?:'order'|'reservation'|'quote';custom_fields?:Record<string,any>;created_at:string}
export type Customer={id:string;store_id:string;name:string;phone:string;address:string;notes:string;status:'active'|'blocked';blocked_reason?:string;blocked_at?:string|null;order_count:number;total_spent:number;last_order_at?:string|null;created_at:string;contact_type?:'customer';whatsapp_name?:string;profile_picture_url?:string}
export type Plan={id:string;name:string;slug:string;description?:string;price:number;billing_period:string;max_stores:number;max_products:number;max_orders:number;whatsapp_enabled:boolean;is_featured?:boolean;is_active?:boolean}
export type Transaction={id:string;store_id?:string;store_name?:string;order_id?:string;type:string;amount:number;currency:string;status:string;reference:string;description:string;created_at:string;user_name?:string;user_phone?:string}
export type TicketMessage={id:string;sender_user_id?:string;sender_role:string;sender_name:string;message:string;created_at:string}
export type SupportTicket={id:string;number:number;subject:string;priority:string;status:string;last_reply_at:string;created_at:string;user_name?:string;user_phone?:string;messages?:TicketMessage[]}
