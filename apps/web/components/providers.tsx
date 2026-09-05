"use client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";import {useState} from "react";import {Provider} from "react-redux";import {store} from "@/lib/store";
export function Providers({children}:{children:React.ReactNode}){const[q]=useState(()=>new QueryClient());return <Provider store={store}><QueryClientProvider client={q}>{children}</QueryClientProvider></Provider>}
