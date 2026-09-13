import { api } from '@/lib/api';

export type IdentitySubjectType = 'persona' | 'empresa';

export interface IdentityPerson {
  cedula: string;
  nombre_completo: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento?: string;
  sexo?: 'M' | 'F' | string;
  separacion_nombre_confiable: boolean;
}

export interface IdentityCompany {
  rnc: string;
  razon_social: string;
  nombre_comercial?: string;
  estado?: string;
  activa: boolean;
}

export interface IdentityResult {
  tipo_sujeto: IdentitySubjectType;
  tipo_documento: 'cedula' | 'rnc' | string;
  documento: string;
  contexto?: string;
  valida: boolean;
  encontrada: boolean;
  puede_autocompletar: boolean;
  requiere_confirmacion: boolean;
  puede_registrarse: boolean;
  motivo?: string;
  fuente?: string;
  persona?: IdentityPerson;
  empresa?: IdentityCompany;
}

export interface IdentityMeta {
  request_id?: string;
  cached?: boolean;
  provider?: string;
}

export interface IdentityVerificationResponse {
  success: boolean;
  manual_allowed?: boolean;
  data?: IdentityResult;
  meta?: IdentityMeta;
  error?: {
    code?: string;
    message?: string;
    request_id?: string;
  };
}

export const verifyPlatformIdentity = async (input: {
  tipo_sujeto: IdentitySubjectType;
  documento: string;
  contexto: string;
}): Promise<IdentityVerificationResponse> => {
  return api.post('/platform/identity/verify', input) as Promise<IdentityVerificationResponse>;
};
