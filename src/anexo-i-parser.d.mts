export interface AnexoIApartado {
  numero: string;
  titulo: string;
  contenido: string;
}

export function parseAnexoI(fullText: string): Map<string, AnexoIApartado> | null;

export function getApartadoContenido(
  apartados: Map<string, AnexoIApartado> | null,
  numero: string | string[]
): string | null;

export const FICHA_TO_APARTADO: Readonly<{
  procedimiento: '1';
  tipo_contrato: '1';
  organo_contratacion: '2';
  tramitacion: '3';
  objeto_contrato: '4';
  plazo_ejecucion: '8';
  presupuesto_base_sin_iva: '10';
  presupuesto_base_con_iva: '10';
  valor_estimado_contrato: '10';
  iva: '10';
  clasificacion_empresarial: '14';
  solvencia_economica: '14';
  solvencia_tecnica: '14';
  garantia_provisional: '20';
  garantia_definitiva: '22';
  seguros_obligatorios: '24';
  subcontratacion_permitida: '26';
  revision_precios_aplica: '28';
  plazo_garantia: '31';
  presentacion_electronica: '33';
  otras_obligaciones_contratista: '34';
}>;
