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
    PHOTO_EVIDENCE: 'PHOTO_EVIDENCE',
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
    _Table_Names,
    _Generate_Claim_Id,
    _Bigha_To_Hectares,
    _Calculate_Deadline,
    _Is_Deadline_Passed,
};
