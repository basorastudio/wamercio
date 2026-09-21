'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
import { api } from '@/lib/api'

function CustomerCallbackFallback() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f7f9fc] p-5">
      <div className="rounded-3xl bg-white p-8 text-center shadow-xl">
        <p className="flex items-center gap-2 text-sm text-emerald-600">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Abriendo tu cuenta...
        </p>
      </div>
    </main>
  )
}

function CustomerCallbackContent() {
  const searchParams = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    const token = searchParams.get('token') || ''
    if (!token) {
      setError('Acceso inválido.')
      return
    }

    api('/auth/customer/sso/exchange', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then(() => window.location.replace('/'))
      .catch((err: any) => setError(err.message || 'El acceso ya no es válido.'))
  }, [searchParams])

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f7f9fc] p-5">
      <div className="rounded-3xl bg-white p-8 text-center shadow-xl">
        {error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-emerald-600">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Abriendo tu cuenta...
          </p>
        )}
      </div>
    </main>
  )
}

export default function CustomerCallbackPage() {
  return (
    <Suspense fallback={<CustomerCallbackFallback />}>
      <CustomerCallbackContent />
    </Suspense>
  )
}
