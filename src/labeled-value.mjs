// Generic label -> typed-value scanner for heterogeneous PCAP layouts.
//
// The apartado-anchored extractors in ficha-deterministic.mjs are precise on the
// Leganés/CCEC "cuadro" template but miss pliegos that present the same data in
// clause prose ("el presupuesto base... asciende a la cantidad total de X€") or
// in a differently-numbered Anexo. This scanner finds a heading/label synonym
// and captures the nearest following value of the expected type.
//
// Precision over recall: a wrong value is worse than a blank, because the
// deterministic engine's contract is "never hallucinate". Two safeguards keep it
// honest:
//   1. The value must sit within `maxGap` chars of the label via a SHORT
//      declarative connector — not anywhere in the paragraph.
//   2. THRESHOLD_GUARD rejects conditional/threshold/unrelated context
//      ("sea inferior a 100.000 euros", "igual o superior a 500.000",
//      "transcurridos 10 años", "responsabilidad por vicios ocultos"), which is
//      what made naive proximity grab regulatory figures instead of the
//      contract's own value.
// Blank model templates ("es de ……… euros") yield no digit and are skipped.

const NUM_ES = String.raw`\d{1,3}(?:\.\d{3})*(?:,\d+)?`;

const THRESHOLD_GUARD =
  /\b(sea|inferior|superior|igual o superior|cuando|exceda?|excede|umbral|mayor|menor|no podr|responsabilidad|transcurrid|vicios ocultos|a partir de|en su caso|por ejemplo|al menos|como m[ií]nimo|m[aá]ximo de)\b/i;

const UNIT = {
  money: String.raw`(?:€|euros\b)`,
  duration: String.raw`(?:meses|mes|semanas|semana|d[ií]as|d[ií]a|a[ñn]os|a[ñn]o)\b`,
  percent: String.raw`%`,
};
const VALUE = {
  money: NUM_ES,
  duration: String.raw`\d{1,3}`,
  percent: String.raw`\d{1,2}`,
};

// Returns the formatted value string ("64.335,36 €", "6 SEMANAS", "5%") or null.
export function findLabeledValue(text, labels, type, { maxGap = 70 } = {}) {
  if (typeof text !== 'string' || !text) return null;
  const valueRe = new RegExp(`(${VALUE[type]})\\s*(${UNIT[type]})`, 'i');

  for (const label of labels) {
    let labelRe;
    try {
      labelRe = new RegExp(label, 'gi');
    } catch {
      continue;
    }
    for (const m of text.matchAll(labelRe)) {
      const from = m.index + m[0].length;
      const after = text.slice(from, from + maxGap + 30);
      const vm = after.match(valueRe);
      if (!vm) continue;
      const connector = after.slice(0, vm.index);
      if (connector.length > maxGap) continue;
      if (THRESHOLD_GUARD.test(connector)) continue;
      if (type === 'duration') return `${vm[1]} ${vm[2].toUpperCase()}`;
      if (type === 'percent') return `${vm[1]}%`;
      return `${vm[1]} €`;
    }
  }
  return null;
}

export const FICHA_LABEL_SYNONYMS = {
  valor_estimado: ['valor estimado del contrato', 'valor estimado'],
  presupuesto: ['presupuesto base de licitaci[oó]n', 'presupuesto de licitaci[oó]n', 'presupuesto del contrato'],
  plazo_ejecucion: ['plazo de ejecuci[oó]n', 'plazo de duraci[oó]n', 'duraci[oó]n del contrato', 'plazo total de ejecuci[oó]n'],
  plazo_garantia: ['plazo de garant[ií]a', 'per[ií]odo de garant[ií]a'],
  garantia_definitiva: ['garant[ií]a definitiva'],
};
