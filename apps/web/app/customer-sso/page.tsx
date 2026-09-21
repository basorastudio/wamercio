'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { LoaderCircle, ShieldCheck } from 'lucide-react'
import CustomerAccessModal from '@/components/customer-access-modal'
import { api } from '@/lib/api'

function CustomerSSOFallback() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f7f9fc] p-5">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <ShieldCheck />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Acceso seguro WAMERCIO</h1>
        <p className="mt-2 text-sm text-slate-500">
          Conectando tu sesión de cliente con el dominio del negocio.
        </p>
        <p className="mt-5 flex items-center justify-center gap-2 text-sm text-emerald-600">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Preparando acceso...
        </p>
      </section>
    </main>
  )
}

function CustomerSSOContent() {
  const searchParams = useSearchParams()
  const target = searchParams.get('target') || ''
  const [auth, setAuth] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      const out = await api<any>('/customer/sso/start', {
        method: 'POST',
        body: JSON.stringify({ target }),
      })
      window.location.replace(out.target)
    } catch (err: any) {
      if (/sesión/i.test(err.message || '')) {
        setAuth(true)
      } else {
        setError(err.message || 'No se pudo continuar')
      }
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (target) {
      void start()
    } else {
      setError('Falta el dominio de destino.')
      setBusy(false)
    }
    // `target` is the only URL-derived dependency. `start` intentionally
    // remains local so reopening the auth modal can retry the same target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f7f9fc] p-5">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <ShieldCheck />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Acceso seguro WAMERCIO</h1>
        <p className="mt-2 text-sm text-slate-500">
          Conectando tu sesión de cliente con el dominio del negocio.
        </p>
        {busy && (
          <p className="mt-5 flex items-center justify-center gap-2 text-sm text-emerald-600">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Verificando sesión...
          </p>
        )}
        {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
      </section>
      <CustomerAccessModal
        open={auth}
        onClose={() => setAuth(false)}
        onAuthenticated={() => {
          setAuth(false)
          void start()
        }}
      />
    </main>
  )
}

export default function CustomerSSOPage() {
  return (
    <Suspense fallback={<CustomerSSOFallback />}>
      <CustomerSSOContent />
    </Suspense>
  )
}
