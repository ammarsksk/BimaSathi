/**
 * BimaSathi — Application Constants
 * 
 * Central registry for all enums, configuration values, and domain constants.
 * Every constant used across the system is defined here for single-source-of-truth.
 */

// ─────────────────────────────────────────────────────────────
//  Conversation State Machine — 15 states (Section 4.3)
// ─────────────────────────────────────────────────────────────
const _Conversation_States = Object.freeze({
    WELCOME: 'WELCOME',
    LANGUAGE_SELECT: 'LANGUAGE_SELECT',
    AUTH_OTP: 'AUTH_OTP',
    MAIN_MENU: 'MAIN_MENU',
    LOSS_REPORT: 'LOSS_REPORT',
    CROP_DETAILS: 'CROP_DETAILS',
    DATE_LOCATION: 'DATE_LOCATION',
    DOCUMENT_INTAKE: 'DOCUMENT_INTAKE',
    SCHEMA_COLLECTION: 'SCHEMA_COLLECTION',
    PHOTO_EVIDENCE: 'PHOTO_EVIDENCE',
    IDENTITY_VERIFICATION: 'IDENTITY_VERIFICATION',
    REVIEW_CONFIRM: 'REVIEW_CONFIRM',
    TRACK_STATUS: 'TRACK_STATUS',
    APPEAL_FLOW: 'APPEAL_FLOW',
    HELPER_MODE: 'HELPER_MODE',
    VOICE_INPUT: 'VOICE_INPUT',
    OPERATOR_BRIDGE: 'OPERATOR_BRIDGE',
    ERROR_STATE: 'ERROR_STATE',
});


// ─────────────────────────────────────────────────────────────
//  Claim Lifecycle Statuses
// ─────────────────────────────────────────────────────────────
const _Claim_Status = Object.freeze({
    DRAFT: 'Draft',
    EVIDENCE_PENDING: 'Evidence Pending',
    SUBMITTED: 'Submitted',
    ACKNOWLEDGED: 'Acknowledged',
    UNDER_REVIEW: 'Under Review',
    SURVEY_SCHEDULED: 'Survey Scheduled',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    PAID: 'Paid',
    LATE_RISK: 'Late Risk',
    APPEAL_FILED: 'Appeal Filed',
});


// ─────────────────────────────────────────────────────────────
//  User Roles
// ─────────────────────────────────────────────────────────────
const _User_Roles = Object.freeze({
    FARMER: 'farmer',
    HELPER: 'helper',
    OPERATOR: 'operator',
});


// ─────────────────────────────────────────────────────────────
//  Crop Types — Major Indian crops covered under PMFBY
// ─────────────────────────────────────────────────────────────
const _Crop_Types = Object.freeze({
    WHEAT: 'wheat',
    RICE: 'rice',
    COTTON: 'cotton',
    SUGARCANE: 'sugarcane',
    SOYBEAN: 'soybean',
    PULSES: 'pulses',
    MAIZE: 'maize',
    GROUNDNUT: 'groundnut',
    MUSTARD: 'mustard',
    JOWAR: 'jowar',
    BAJRA: 'bajra',
    TOBACCO: 'tobacco',
});


// ─────────────────────────────────────────────────────────────
//  Agricultural Seasons
// ─────────────────────────────────────────────────────────────
const _Seasons = Object.freeze({
    KHARIF: 'kharif',   // June–October   (monsoon)
    RABI: 'rabi',     // November–March  (winter)
    ZAID: 'zaid',     // March–June      (summer)
});


// ─────────────────────────────────────────────────────────────
//  Causes of Crop Loss
// ─────────────────────────────────────────────────────────────
const _Loss_Causes = Object.freeze({
    FLOOD: 'flood',
    DROUGHT: 'drought',
    HAIL: 'hail',
    UNSEASONAL_RAIN: 'unseasonal_rain',
    PEST: 'pest',
    DISEASE: 'disease',
    FIRE: 'fire',
    CYCLONE: 'cyclone',
    FROST: 'frost',
    LANDSLIDE: 'landslide',
    OTHER: 'other',
});


// ─────────────────────────────────────────────────────────────
//  Insurance Policy Types
// ─────────────────────────────────────────────────────────────
const _Policy_Types = Object.freeze({
    PMFBY: 'pmfby',   // Pradhan Mantri Fasal Bima Yojana
    RWBCIS: 'rwbcis',  // Restructured Weather Based Crop Insurance Scheme
    OTHER: 'other',
});


// ─────────────────────────────────────────────────────────────
//  Claim Intake Fields — ordered for one-question-at-a-time UX
// ─────────────────────────────────────────────────────────────
const _Claim_Intake_Fields = Object.freeze([
    'farmer_name',
    'village',
    'district',
    'state',
    'crop_type',
    'season',
    'loss_date',
    'cause',
    'area_hectares',
    'policy_type',
    'bank_last_4',
]);


// ─────────────────────────────────────────────────────────────
//  Completeness Score Weights — decimal weights summing to 1.0
// ─────────────────────────────────────────────────────────────
const _Completeness_Weights = Object.freeze({
    farmer_name: 0.10,
    village: 0.08,
    district: 0.08,
    state: 0.05,
    crop_type: 0.10,
    season: 0.05,
    loss_date: 0.12,
    cause: 0.10,
    area_hectares: 0.07,
    policy_type: 0.05,
    bank_last_4: 0.05,
    photos: 0.15,   // evidence photos (min 3)
});


// ─────────────────────────────────────────────────────────────
//  Deadline Configuration
// ─────────────────────────────────────────────────────────────
const _Deadline_Config = Object.freeze({
    DEFAULT_HOURS: 72,       // 72 hours from loss report to file a claim
    REMINDER_INTERVALS: [48, 24, 6, 1],  // hours before deadline to send reminders
    GRACE_PERIOD_HOURS: 6,       // extra grace after deadline before marking LATE_RISK
});


// ─────────────────────────────────────────────────────────────
//  Photo / Evidence Configuration
// ─────────────────────────────────────────────────────────────
const _Photo_Config = Object.freeze({
    MIN_PHOTOS_REQUIRED: 3,
    MAX_PHOTOS_ALLOWED: 10,
    MIN_WIDTH: 640,
    MIN_HEIGHT: 480,
    MAX_GPS_DISTANCE_KM: 50,
    MAX_TIMESTAMP_HOURS: 72,
    ACCEPTED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
});


// ─────────────────────────────────────────────────────────────
//  Amazon Rekognition — Damage-related labels to look for
// ─────────────────────────────────────────────────────────────
const _Damage_Labels = Object.freeze([
    'Flood', 'Drought', 'Damage', 'Destruction', 'Erosion',
    'Dead Plant', 'Wilted', 'Broken', 'Muddy', 'Waterlogged',
    'Pest', 'Disease', 'Fire', 'Scorched', 'Hail',
    'Brown', 'Dried', 'Cracked', 'Submerged',
]);


// ─────────────────────────────────────────────────────────────
//  Message Types — classification of incoming WhatsApp messages
// ─────────────────────────────────────────────────────────────
const _Message_Types = Object.freeze({
    TEXT: 'text',
    VOICE: 'voice',
    IMAGE: 'image',
    LOCATION: 'location',
    DOCUMENT: 'document',
    BUTTON: 'button',
    LIST: 'list',
    UNKNOWN: 'unknown',
});


// ─────────────────────────────────────────────────────────────
//  Document Types — classification of received documents
// ─────────────────────────────────────────────────────────────
const _Document_Types = Object.freeze({
    INSURANCE_FORM_TEMPLATE: 'INSURANCE_FORM_TEMPLATE',
    CROP_LOSS_PHOTO: 'CROP_LOSS_PHOTO',
    LAND_RECORD: 'LAND_RECORD',
    POLICY_DOCUMENT: 'POLICY_DOCUMENT',
    AADHAAR_OR_ID: 'AADHAAR_OR_ID',
    BANK_PASSBOOK: 'BANK_PASSBOOK',
    UNKNOWN: 'UNKNOWN',
});


// ─────────────────────────────────────────────────────────────
//  Field Status — form schema field completion tracking
// ─────────────────────────────────────────────────────────────
const _Field_Status = Object.freeze({
    PENDING: 'pending',
    COMPLETED: 'completed',
    AUTO_FILLED: 'auto_filled',
    PREFILLED: 'prefilled',
    SKIPPED: 'skipped',
});


// ─────────────────────────────────────────────────────────────
//  Default PMFBY Form Schema — baseline when no template doc
// ─────────────────────────────────────────────────────────────
const _Default_PMFBY_Schema = Object.freeze([
    { field_name: 'farmer_name', field_label: 'Full Name of Farmer', field_type: 'text', is_required: true, accepted_values: null, language_hint: 'Kisan ka pura naam batayein', status: 'pending', value: null },
    { field_name: 'aadhaar_number', field_label: 'Aadhaar Number', field_type: 'text', is_required: true, accepted_values: null, language_hint: 'Aapka Aadhaar card number (12 digit)', status: 'pending', value: null },
    { field_name: 'phone_number', field_label: 'Phone Number', field_type: 'text', is_required: true, accepted_values: null, language_hint: 'Aapka mobile number', status: 'pending', value: null },
    { field_name: 'village', field_label: 'Village / Gram Panchayat', field_type: 'text', is_required: true, accepted_values: null, language_hint: 'Aapka gaon ya gram panchayat ka naam', status: 'pending', value: null },
    { field_name: 'bank_account_number', field_label: 'Bank Account Number', field_type: 'text', is_required: true, accepted_values: null, language_hint: 'Bank khata number jismein paisa aayega', status: 'pending', value: null },
    { field_name: 'bank_ifsc', field_label: 'Bank IFSC Code', field_type: 'text', is_required: true, accepted_values: null, language_hint: 'Bank ka IFSC code - passbook mein likha hota hai', status: 'pending', value: null },
    { field_name: 'crop_type', field_label: 'Crop Name', field_type: 'choice', is_required: true, accepted_values: ['wheat', 'rice', 'cotton', 'sugarcane', 'soybean', 'pulses', 'maize', 'groundnut', 'mustard', 'other'], language_hint: 'Kaun si fasal ugayi thi', status: 'pending', value: null },
    { field_name: 'sowing_date', field_label: 'Date of Sowing', field_type: 'date', is_required: true, accepted_values: null, language_hint: 'Fasal kab boi thi - tarikh batayein', status: 'pending', value: null },
    { field_name: 'area_hectares', field_label: 'Area Affected (Hectares)', field_type: 'number', is_required: true, accepted_values: null, language_hint: 'Kitne hectare ya bigha mein nuksan hua', status: 'pending', value: null },
    { field_name: 'cause', field_label: 'Cause of Loss', field_type: 'choice', is_required: true, accepted_values: ['flood', 'drought', 'hail', 'unseasonal_rain', 'pest', 'disease', 'fire', 'cyclone', 'frost', 'landslide', 'other'], language_hint: 'Nuksan ka karan kya tha - baadh, sukha, ole, baarish', status: 'pending', value: null },
    { field_name: 'loss_date', field_label: 'Date of Crop Loss', field_type: 'date', is_required: true, accepted_values: null, language_hint: 'Nuksan kab hua - tarikh batayein', status: 'pending', value: null },
    { field_name: 'policy_number', field_label: 'Insurance Policy Number', field_type: 'text', is_required: false, accepted_values: null, language_hint: 'Agar purani policy hai to number batayein, nahi to chhod dein', status: 'pending', value: null },
    { field_name: 'crop_loss_photo', field_label: 'Photo of Crop Damage', field_type: 'photo', is_required: true, accepted_values: null, language_hint: 'Apne khet ki photo bhejein jismein nuksan dikhe', status: 'pending', value: null },
]);


// ─────────────────────────────────────────────────────────────
//  DynamoDB Table Name Defaults (overridden via env vars)
// ─────────────────────────────────────────────────────────────
const _Table_Names = Object.freeze({
    USERS: process.env.USERS_TABLE || 'bimasathi-users',
    CLAIMS: process.env.CLAIMS_TABLE || 'bimasathi-claims',
    CONVERSATIONS: process.env.CONVERSATIONS_TABLE || 'bimasathi-conversations',
    DEADLINES: process.env.DEADLINES_TABLE || 'bimasathi-deadlines',
    AUDIT_LOG: process.env.AUDIT_LOG_TABLE || 'bimasathi-audit-log',
    CONSENT: process.env.CONSENT_TABLE || 'bimasathi-consent',
});


// ─────────────────────────────────────────────────────────────
//  Utility Functions
// ─────────────────────────────────────────────────────────────

/**
 * Generate a unique Claim ID in the format: BMS-YYYY-NNNN
 * @returns {string} Unique claim identifier
 */
function _Generate_Claim_Id() {
    const _Year = new Date().getFullYear();
    const _Rand = Math.floor(1000 + Math.random() * 9000);
    return `BMS-${_Year}-${_Rand}`;
}

/**
 * Convert area from Bigha (local unit) to Hectares
 * 1 Bigha ≈ 0.25 hectares (varies by state, using MP standard)
 * @param {number} _Bigha — area in Bigha
 * @returns {number} Area in hectares, rounded to 2 decimals
 */
function _Bigha_To_Hectares(_Bigha) {
    const _Conversion_Factor = 0.25;
    return Math.round(_Bigha * _Conversion_Factor * 100) / 100;
}

/**
 * Calculate the filing deadline from a loss date
 * @param {string|Date} _Loss_Date — date of crop loss
 * @returns {Date} Filing deadline
 */
function _Calculate_Deadline(_Loss_Date) {
    const _Date = new Date(_Loss_Date);
    const _Deadline = new Date(_Date.getTime() + _Deadline_Config.DEFAULT_HOURS * 60 * 60 * 1000);
    return _Deadline;
}

/**
 * Check if a claim deadline has passed
 * @param {string|Date} _Deadline — the deadline to check
 * @returns {boolean} True if the deadline has passed
 */
function _Is_Deadline_Passed(_Deadline) {
    return new Date() > new Date(_Deadline);
}


// ─────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────
module.exports = {
    _Conversation_States,
    _Claim_Status,
    _User_Roles,
    _Crop_Types,
    _Seasons,
    _Loss_Causes,
    _Policy_Types,
    _Claim_Intake_Fields,
    _Completeness_Weights,
    _Deadline_Config,
    _Photo_Config,
    _Damage_Labels,
    _Message_Types,
    _Document_Types,
    _Field_Status,
    _Default_PMFBY_Schema,
    _Table_Names,
    _Generate_Claim_Id,
    _Bigha_To_Hectares,
    _Calculate_Deadline,
    _Is_Deadline_Passed,
};
