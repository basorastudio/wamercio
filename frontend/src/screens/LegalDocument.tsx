import React, { useEffect, useMemo, useState } from 'react';
import * as FiIcons from 'react-icons/fi';
import { api, getPlatformHashUrl } from '@/lib/api';

const { FiArrowLeft, FiShield, FiFileText, FiMail, FiMapPin, FiSmartphone } = FiIcons;

type LegalSection = { title: string; body: string };
type LegalDocumentType = 'terms' | 'privacy';

const defaultLegal = {
  version: '1.0',
  effective_date: '16 de julio de 2026',
  responsible_entity: 'WAMERCIO',
  jurisdiction: 'República Dominicana',
  contact_email: 'soporte@wamercio.com',
  contact_whatsapp: '',
  additional_title: 'Información legal y contacto',
  additional_text: 'Para solicitudes relacionadas con estos documentos, corrección de datos o ejercicio de derechos, utiliza los canales oficiales de soporte de WAMERCIO.',
  terms: {
    title: 'Términos y condiciones',
    intro: 'Al crear o utilizar una cuenta, aceptas estas reglas de operación y seguridad.',
    sections: [
      { title: 'Uso de la plataforma', body: 'WAMERCIO facilita la gestión de catálogos, ventas, inventario, clientes, fiado, caja, pedidos y entregas. Cada negocio es responsable de la información, precios, productos y servicios que publica.' },
      { title: 'Pagos fuera de línea', body: 'Los pagos de los negocios se realizan en efectivo, por transferencia manual, mediante una terminal fiscal externa o por fiado autorizado. WAMERCIO no procesa, autoriza ni garantiza pagos electrónicos dentro del negocio.' },
      { title: 'Cuentas y seguridad', body: 'El usuario debe proteger su PIN, verificar sus datos y notificar cualquier acceso no autorizado. Las acciones realizadas desde una cuenta autenticada pueden registrarse para fines de seguridad y auditoría.' },
      { title: 'Ventas, devoluciones y fiado', body: 'Cada negocio define sus políticas comerciales. Las anulaciones, devoluciones, abonos y cierres de caja deben ser registrados por personal autorizado y pueden conservarse como historial operativo.' },
      { title: 'Disponibilidad', body: 'La plataforma puede requerir mantenimiento, actualizaciones o interrupciones controladas. Se aplican respaldos y medidas de recuperación, pero ningún sistema puede garantizar disponibilidad absoluta.' },
    ],
  },
  privacy: {
    title: 'Política de privacidad y tratamiento de datos',
    intro: 'Esta política explica cómo se recopilan, utilizan, protegen y conservan los datos personales dentro de WAMERCIO.',
    sections: [
      { title: 'Datos recopilados', body: 'Podemos tratar nombre, WhatsApp, cédula, direcciones, historial de pedidos, movimientos de fiado y datos técnicos necesarios para operar y proteger la plataforma.' },
      { title: 'Finalidad del tratamiento', body: 'Los datos se utilizan para identificar usuarios, procesar pedidos, coordinar entregas, prevenir fraude, recuperar cuentas, generar reportes y cumplir obligaciones operativas o legales.' },
      { title: 'Separación de negocios', body: 'Los datos operativos se aíslan por negocio. La identidad global del cliente permite utilizar WAMERCIO en distintos negocios sin crear cuentas duplicadas, manteniendo controles de acceso.' },
      { title: 'Conservación y seguridad', body: 'Se aplican cifrado de transporte, controles de acceso, registros de auditoría y respaldos. Los datos se conservan durante el tiempo necesario para la operación, seguridad y cumplimiento aplicable.' },
      { title: 'Derechos del titular', body: 'El usuario puede solicitar acceso, corrección, actualización o revisión de sus datos mediante los canales oficiales de soporte de WAMERCIO.' },
    ],
  },
};

const cleanText = (value: unknown, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizeSections = (value: unknown, fallback: LegalSection[]): LegalSection[] => {
  if (!Array.isArray(value)) return fallback;
  const sections = value
    .map((item: any) => ({
      title: cleanText(item?.title),
      body: cleanText(item?.body),
    }))
    .filter((item) => item.title && item.body);
  return sections.length ? sections : fallback;
};

const normalizeLegal = (value: any) => {
  const raw = value && typeof value === 'object' ? value : {};
  const terms = raw.terms && typeof raw.terms === 'object' ? raw.terms : {};
  const privacy = raw.privacy && typeof raw.privacy === 'object' ? raw.privacy : {};
  return {
    version: cleanText(raw.version, defaultLegal.version),
    effective_date: cleanText(raw.effective_date, defaultLegal.effective_date),
    responsible_entity: cleanText(raw.responsible_entity, defaultLegal.responsible_entity),
    jurisdiction: cleanText(raw.jurisdiction, defaultLegal.jurisdiction),
    contact_email: cleanText(raw.contact_email, defaultLegal.contact_email),
    contact_whatsapp: cleanText(raw.contact_whatsapp),
    additional_title: cleanText(raw.additional_title, defaultLegal.additional_title),
    additional_text: cleanText(raw.additional_text, defaultLegal.additional_text),
    terms: {
      title: cleanText(terms.title, defaultLegal.terms.title),
      intro: cleanText(terms.intro, defaultLegal.terms.intro),
      sections: normalizeSections(terms.sections, defaultLegal.terms.sections),
    },
    privacy: {
      title: cleanText(privacy.title, defaultLegal.privacy.title),
      intro: cleanText(privacy.intro, defaultLegal.privacy.intro),
      sections: normalizeSections(privacy.sections, defaultLegal.privacy.sections),
    },
  };
};

const LegalDocument = ({ type }: { type: LegalDocumentType }) => {
  const [legal, setLegal] = useState(() => normalizeLegal(defaultLegal));
  const isTerms = type === 'terms';

  useEffect(() => {
    let active = true;
    api.get('/legal')
      .then((payload: any) => {
        if (active) setLegal(normalizeLegal(payload?.legal));
      })
      .catch(() => {
        // Mantiene el documento predeterminado si el backend está temporalmente indisponible.
      });
    return () => {
      active = false;
    };
  }, []);

  const legalDocument = useMemo(() => (isTerms ? legal.terms : legal.privacy), [isTerms, legal]);

  useEffect(() => {
    if (typeof window !== 'undefined') window.document.title = `${legalDocument.title} | WAMERCIO`;
  }, [legalDocument.title]);

  return (
    <main className="h-[100dvh] w-full overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[#f4f7f9] p-4 pb-10 md:p-8 md:pb-14 landing-scrollbar touch-pan-y">
      <article className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <header className="bg-[#0f1a28] p-6 text-white md:p-8">
          <a href={getPlatformHashUrl('/')} className="inline-flex items-center gap-2 text-xs font-black text-white/70 hover:text-white">
            <FiArrowLeft /> Volver a WAMERCIO
          </a>
          <div className="mt-6 flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#00a884]/20 text-2xl text-[#56e3bd]">
              {isTerms ? <FiFileText /> : <FiShield />}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#56e3bd]">
                {legal.responsible_entity} · Versión {legal.version}
              </p>
              <h1 className="mt-1 text-2xl font-black md:text-3xl">{legalDocument.title}</h1>
              <p className="mt-2 text-sm text-white/65">Vigente desde el {legal.effective_date}.</p>
            </div>
          </div>
        </header>

        <div className="space-y-7 p-6 text-sm leading-7 text-gray-600 md:p-9">
          <p>{legalDocument.intro}</p>
          {legalDocument.sections.map((section: LegalSection, index: number) => (
            <section key={`${section.title}-${index}`}>
              <h2 className="text-base font-black text-gray-900">{index + 1}. {section.title}</h2>
              <p className="mt-2 whitespace-pre-line">{section.body}</p>
            </section>
          ))}

          <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
            <h2 className="font-black text-emerald-900">{legal.additional_title}</h2>
            <p className="mt-1 whitespace-pre-line text-emerald-800">{legal.additional_text}</p>
            <div className="mt-4 grid gap-2 text-xs font-bold text-emerald-900 sm:grid-cols-2">
              <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-white/70 px-3 py-2">
                <FiMail /> {legal.contact_email}
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-white/70 px-3 py-2">
                <FiMapPin /> {legal.jurisdiction}
              </span>
              {legal.contact_whatsapp && (
                <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-white/70 px-3 py-2 sm:col-span-2">
                  <FiSmartphone /> {legal.contact_whatsapp}
                </span>
              )}
            </div>
          </section>
        </div>
      </article>
    </main>
  );
};

export default LegalDocument;
