import { z } from 'zod';

export const FindingSchema = z.object({
  id: z.string().optional(),
  section: z.string(),
  title: z.string(),
  clause_reference: z.string(),
  lcsp_article: z.string().nullable(),
  source_excerpt: z.string().max(1200),
  analysis: z.string(),
  severity: z.enum(['critica', 'alta', 'media', 'baja']).default('media'),
  cost_type: z.string().nullable().default(null),
  amount_or_percentage: z.string().nullable().default(null),
  who_pays: z.string().nullable().default(null),
  why_it_matters: z.string().nullable().default(null),
  recommended_action: z.string().nullable().default(null),
  confidence: z.enum(['alta', 'media', 'baja']),
  verification_status: z.enum(['verificado', 'sin_referencia', 'sin_extracto']),
  clause_referenceB: z.string().nullable(),
  source_excerptB: z.string().max(1200).nullable(),
});

export type Finding = z.infer<typeof FindingSchema>;

export const CostSummaryCategorySchema = z.enum([
  'publicidad',
  'impuestos_tasas_tributos',
  'formalizacion',
  'seguros_garantias',
  'permisos_licencias',
  'otros_gastos',
]);

export const CostSummaryRowSchema = z.object({
  categoria: CostSummaryCategorySchema,
  encontrado: z.boolean(),
  conceptos: z.string().nullable(),
  clause_reference: z.string().nullable(),
  importe_o_porcentaje: z.string().nullable(),
  observacion: z.string().nullable(),
});

export type CostSummaryCategory = z.infer<typeof CostSummaryCategorySchema>;
export type CostSummaryRow = z.infer<typeof CostSummaryRowSchema>;

export const FichaFieldSchema = z.object({
  value: z.string().nullable(),
  clause_reference: z.string().nullable(),
  confidence: z.enum(['alta', 'media', 'baja']).nullable().default(null),
  notes: z.string().nullable().default(null),
});

export type FichaField = z.infer<typeof FichaFieldSchema>;

export const CriterioAdjudicacionSchema = z.object({
  criterio: z.string(),
  peso_porcentaje: z.number().nullable(),
  tipo: z.enum(['objetivo', 'subjetivo']),
  clause_reference: z.string().nullable(),
});

export type CriterioAdjudicacion = z.infer<typeof CriterioAdjudicacionSchema>;

export const BooleanClauseSchema = z.object({
  aplica: z.boolean().nullable(),
  clause_reference: z.string().nullable(),
});

export type BooleanClause = z.infer<typeof BooleanClauseSchema>;

export const FichaResultSchema = z.object({
  organo_contratacion: FichaFieldSchema,
  numero_expediente: FichaFieldSchema,
  objeto_contrato: FichaFieldSchema,
  presupuesto_base_sin_iva: FichaFieldSchema,
  presupuesto_base_con_iva: FichaFieldSchema,
  valor_estimado_contrato: FichaFieldSchema,
  plazo_ejecucion: FichaFieldSchema,
  plazo_presentacion_ofertas: FichaFieldSchema,
  lugar_presentacion: FichaFieldSchema,
  garantia_provisional: FichaFieldSchema,
  garantia_definitiva: FichaFieldSchema,
  solvencia_economica: FichaFieldSchema,
  solvencia_tecnica: FichaFieldSchema,
  clasificacion_empresarial: FichaFieldSchema,
  criterios_adjudicacion: z.array(CriterioAdjudicacionSchema),
  procedimiento: FichaFieldSchema,
  tramitacion: FichaFieldSchema,
  tipo_contrato: FichaFieldSchema,
  iva: FichaFieldSchema,
  ofertas_anormalmente_bajas: FichaFieldSchema,
  plazo_garantia: FichaFieldSchema,
  seguros_obligatorios: FichaFieldSchema,
  presentacion_electronica: FichaFieldSchema,
  subcontratacion_permitida: BooleanClauseSchema,
  revision_precios_aplica: BooleanClauseSchema,
});

export type FichaResult = z.infer<typeof FichaResultSchema>;

export const RiskAssessmentSchema = z.object({
  overall_risk: z.enum(['alto', 'medio', 'bajo']),
  bid_recommendation: z.enum(['recomendado', 'recomendado_con_reservas', 'no_recomendado']),
  risk_justification: z.string(),
});

export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

export const AnalysisResponseSchema = z.object({
  findings: z.array(FindingSchema),
  ficha: FichaResultSchema.nullable(),
  cost_summary: z.array(CostSummaryRowSchema).length(6).nullable(),
  overall_risk: z.enum(['alto', 'medio', 'bajo']),
  bid_recommendation: z.enum(['recomendado', 'recomendado_con_reservas', 'no_recomendado']),
  risk_justification: z.string(),
  document_summary: z.string(),
});

export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;

const fichaFieldJsonSchema = {
  type: 'object',
  properties: {
    value: { type: ['string', 'null'] },
    clause_reference: { type: ['string', 'null'] },
    confidence: { type: ['string', 'null'], enum: ['alta', 'media', 'baja', null] },
    notes: { type: ['string', 'null'] },
  },
  required: ['value', 'clause_reference', 'confidence', 'notes'],
  additionalProperties: false,
};

const booleanClauseJsonSchema = {
  type: 'object',
  properties: {
    aplica: { type: ['boolean', 'null'] },
    clause_reference: { type: ['string', 'null'] },
  },
  required: ['aplica', 'clause_reference'],
  additionalProperties: false,
};

const costSummaryRowJsonSchema = {
  type: 'object',
  properties: {
    categoria: {
      type: 'string',
      enum: [
        'publicidad',
        'impuestos_tasas_tributos',
        'formalizacion',
        'seguros_garantias',
        'permisos_licencias',
        'otros_gastos',
      ],
    },
    encontrado: { type: 'boolean' },
    conceptos: { type: ['string', 'null'] },
    clause_reference: { type: ['string', 'null'] },
    importe_o_porcentaje: { type: ['string', 'null'] },
    observacion: { type: ['string', 'null'] },
  },
  required: [
    'categoria',
    'encontrado',
    'conceptos',
    'clause_reference',
    'importe_o_porcentaje',
    'observacion',
  ],
  additionalProperties: false,
};

// JSON Schema literal for OpenAI structured outputs
export const analysisJsonSchema = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          section: { type: 'string' },
          title: { type: 'string' },
          clause_reference: { type: 'string' },
          lcsp_article: { type: ['string', 'null'] },
          source_excerpt: { type: 'string' },
          analysis: { type: 'string' },
          severity: { type: 'string', enum: ['critica', 'alta', 'media', 'baja'] },
          cost_type: { type: ['string', 'null'] },
          amount_or_percentage: { type: ['string', 'null'] },
          who_pays: { type: ['string', 'null'] },
          why_it_matters: { type: ['string', 'null'] },
          recommended_action: { type: ['string', 'null'] },
          confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
          verification_status: {
            type: 'string',
            enum: ['verificado', 'sin_referencia', 'sin_extracto'],
          },
          // Nullable so strict-mode additionalProperties:false remains valid
          // while comparison fields are absent in non-comparison modes.
          clause_referenceB: { type: ['string', 'null'] },
          source_excerptB: { type: ['string', 'null'] },
        },
        required: [
          'section',
          'title',
          'clause_reference',
          'lcsp_article',
          'source_excerpt',
          'analysis',
          'severity',
          'cost_type',
          'amount_or_percentage',
          'who_pays',
          'why_it_matters',
          'recommended_action',
          'confidence',
          'verification_status',
          'clause_referenceB',
          'source_excerptB',
        ],
        additionalProperties: false,
      },
    },
    ficha: {
      type: ['object', 'null'],
      properties: {
        organo_contratacion: fichaFieldJsonSchema,
        numero_expediente: fichaFieldJsonSchema,
        objeto_contrato: fichaFieldJsonSchema,
        presupuesto_base_sin_iva: fichaFieldJsonSchema,
        presupuesto_base_con_iva: fichaFieldJsonSchema,
        valor_estimado_contrato: fichaFieldJsonSchema,
        plazo_ejecucion: fichaFieldJsonSchema,
        plazo_presentacion_ofertas: fichaFieldJsonSchema,
        lugar_presentacion: fichaFieldJsonSchema,
        garantia_provisional: fichaFieldJsonSchema,
        garantia_definitiva: fichaFieldJsonSchema,
        solvencia_economica: fichaFieldJsonSchema,
        solvencia_tecnica: fichaFieldJsonSchema,
        clasificacion_empresarial: fichaFieldJsonSchema,
        criterios_adjudicacion: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              criterio: { type: 'string' },
              peso_porcentaje: { type: ['number', 'null'] },
              tipo: { type: 'string', enum: ['objetivo', 'subjetivo'] },
              clause_reference: { type: ['string', 'null'] },
            },
            required: ['criterio', 'peso_porcentaje', 'tipo', 'clause_reference'],
            additionalProperties: false,
          },
        },
        procedimiento: fichaFieldJsonSchema,
        tramitacion: fichaFieldJsonSchema,
        tipo_contrato: fichaFieldJsonSchema,
        iva: fichaFieldJsonSchema,
        ofertas_anormalmente_bajas: fichaFieldJsonSchema,
        plazo_garantia: fichaFieldJsonSchema,
        seguros_obligatorios: fichaFieldJsonSchema,
        presentacion_electronica: fichaFieldJsonSchema,
        subcontratacion_permitida: booleanClauseJsonSchema,
        revision_precios_aplica: booleanClauseJsonSchema,
      },
      required: [
        'organo_contratacion',
        'numero_expediente',
        'objeto_contrato',
        'presupuesto_base_sin_iva',
        'presupuesto_base_con_iva',
        'valor_estimado_contrato',
        'plazo_ejecucion',
        'plazo_presentacion_ofertas',
        'lugar_presentacion',
        'garantia_provisional',
        'garantia_definitiva',
        'solvencia_economica',
        'solvencia_tecnica',
        'clasificacion_empresarial',
        'criterios_adjudicacion',
        'procedimiento',
        'tramitacion',
        'tipo_contrato',
        'iva',
        'ofertas_anormalmente_bajas',
        'plazo_garantia',
        'seguros_obligatorios',
        'presentacion_electronica',
        'subcontratacion_permitida',
        'revision_precios_aplica',
      ],
      additionalProperties: false,
    },
    cost_summary: {
      type: ['array', 'null'],
      minItems: 6,
      maxItems: 6,
      items: costSummaryRowJsonSchema,
    },
    overall_risk: { type: 'string', enum: ['alto', 'medio', 'bajo'] },
    bid_recommendation: {
      type: 'string',
      enum: ['recomendado', 'recomendado_con_reservas', 'no_recomendado'],
    },
    risk_justification: { type: 'string' },
    document_summary: { type: 'string' },
  },
  required: [
    'findings',
    'ficha',
    'cost_summary',
    'overall_risk',
    'bid_recommendation',
    'risk_justification',
    'document_summary',
  ],
  additionalProperties: false,
};
