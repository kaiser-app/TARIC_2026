export const SOURCE_AUTHORITY = Object.freeze({
  binding_nomenclature: 100,
  binding_classification_regulation: 95,
  cjeu_interpretation: 90,
  hs_explanatory_note: 70,
  cn_explanatory_note: 65,
  bti_example: 40,
  learned_semantic_term: 10,
});

export function compareAuthority(left, right) {
  return (SOURCE_AUTHORITY[right] || 0) - (SOURCE_AUTHORITY[left] || 0);
}

export function mayOverride(existingAuthority, proposedAuthority) {
  return (SOURCE_AUTHORITY[proposedAuthority] || 0) >= (SOURCE_AUTHORITY[existingAuthority] || 0);
}
