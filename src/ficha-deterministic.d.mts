export interface FichaField {
  value: string;
  clause_reference: string;
  confidence: 'alta' | 'media' | 'baja';
  notes: string | null;
}

export function extractProcedimiento(text: string): FichaField | null;
export function extractTipoContrato(text: string): FichaField | null;
export function extractTramitacion(text: string): FichaField | null;
export function extractPlazoEjecucion(text: string): FichaField | null;
export function extractValorEstimado(text: string): FichaField | null;
export function extractBaseImponible(text: string): FichaField | null;
export function extractIva(text: string): FichaField | null;
export function extractPresupuestoBaseConIva(text: string): FichaField | null;
export function extractPresupuestoBaseSinIva(text: string): FichaField | null;
export function extractGarantiaProvisional(text: string): FichaField | null;
export function extractGarantiaDefinitiva(text: string): FichaField | null;
export function extractSeguros(text: string): FichaField | null;
export function extractPlazoGarantia(text: string): FichaField | null;
export function extractPresentacionElectronica(text: string): FichaField | null;
export function extractObjeto(text: string): FichaField | null;
export function extractOrgano(text: string): FichaField | null;
export function extractSolvenciaEconomica(text: string): FichaField | null;
export function extractSolvenciaTecnica(text: string): FichaField | null;
export function extractClasificacion(text: string): FichaField | null;

export function extractDeterministicFichaFields(text: string): Record<string, FichaField | null>;

export function isStrictlyValidAmount(value: unknown): boolean;
export function sanitizeAmount(value: string | null | undefined, locale?: 'es' | 'en' | 'ca'): string | null;
