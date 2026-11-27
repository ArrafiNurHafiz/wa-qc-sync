// src/qc/index.js — Public exports modul domain QC (sesuai src/qc/agents.md)
export {
  PRODUCT_MASTER,
  CATALOG_RELATIONS,
  KEYWORD_ALIASES,
  VENDORS_PRE,
  VENDORS_FIN,
  QC_CRITERIA,
  MC_LIMITS,
  QC_DECISIONS,
  isHeaderOrInvalidVendor,
  normalizeVendorName,
  addVendor,
  addProduct,
  applyMasterData,
  syncDictionaryFromWebhook
} from "./dictionary.js";

export {
  cleanString,
  matchProduct,
  matchVendorWithConfidence,
  matchCriterion
} from "./matcher.js";

export {
  formatTodayId,
  normalizeTahap,
  validateQcReport
} from "./qc-validator.js";

export {
  getQcTemplateText,
  getQcItemTemplateText,
  getHelpText,
  getCriteriaText
} from "./help-text.js";

export {
  isQcRelevantMessage,
  parseQcMessage
} from "./qc-parser.js";
