import {configureStore,createSlice,PayloadAction} from "@reduxjs/toolkit";
export type CartOption={id:string;name:string;price:number};
export type CartItem={key:string;product_id:string;name:string;price:number;quantity:number;option_ids:string[];options:CartOption[];note:string};
type AddItem=Omit<CartItem,"quantity">;
const cart=createSlice({name:"cart",initialState:{items:[] as CartItem[]},reducers:{
  add:(s,a:PayloadAction<AddItem>)=>{const f=s.items.find(x=>x.key===a.payload.key);if(f)f.quantity++;else s.items.push({...a.payload,quantity:1})},
  inc:(s,a:PayloadAction<string>)=>{const f=s.items.find(x=>x.key===a.payload);if(f)f.quantity++},
  dec:(s,a:PayloadAction<string>)=>{const f=s.items.find(x=>x.key===a.payload);if(f){f.quantity--;if(f.quantity<=0)s.items=s.items.filter(x=>x.key!==a.payload)}},
  remove:(s,a:PayloadAction<string>)=>{s.items=s.items.filter(x=>x.key!==a.payload)},
  clear:s=>{s.items=[]}
}});
export const {add,inc,dec,remove,clear}=cart.actions;
export const store=configureStore({reducer:{cart:cart.reducer}});
export type RootState=ReturnType<typeof store.getState>;export type AppDispatch=typeof store.dispatch;
