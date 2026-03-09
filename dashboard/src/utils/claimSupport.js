const CHOICE_OPTIONS = Object.freeze({
    cropType: ['wheat', 'rice', 'cotton', 'sugarcane', 'soybean', 'pulses', 'maize', 'groundnut', 'mustard', 'other'],
    crop_type: ['wheat', 'rice', 'cotton', 'sugarcane', 'soybean', 'pulses', 'maize', 'groundnut', 'mustard', 'other'],
    crop_name: ['wheat', 'rice', 'cotton', 'sugarcane', 'soybean', 'pulses', 'maize', 'groundnut', 'mustard', 'other'],
    season: ['kharif', 'rabi', 'zaid'],
    crop_season_year: ['kharif', 'rabi', 'zaid'],
    cause: ['flood', 'drought', 'hail', 'unseasonal_rain', 'pest', 'disease', 'fire', 'cyclone', 'frost', 'landslide', 'other'],
    loss_event_summary: ['flood', 'drought', 'hail', 'unseasonal_rain', 'pest', 'disease', 'fire', 'cyclone', 'frost', 'landslide', 'other'],
    policyType: ['pmfby', 'rwbcis', 'other'],
    policy_type: ['pmfby', 'rwbcis', 'other'],
    gender: ['M', 'F'],
    socialCategory: ['SC', 'ST', 'OBC', 'OTHERS'],
    social_category: ['SC', 'ST', 'OBC', 'OTHERS', 'GEN', 'OTHER'],
    accountType: ['crop_loan', 'saving_account'],
    account_type: ['crop_loan', 'saving_account'],
    hasCropLoanOrKcc: ['yes', 'no'],
    has_crop_loan_or_kcc: ['yes', 'no'],
    loaneeStatus: ['loanee', 'non_loanee'],
    loanee_status: ['loanee', 'non_loanee'],
    pepDeclaration: ['yes', 'no'],
    pep_declaration: ['yes', 'no'],
})

const PREFILL_MAP = Object.freeze({
    farmer_name: ['farmerName', 'name'],
    phone_number: ['phoneNumber'],
    mobile_number: ['phoneNumber'],
    crop_name: ['cropType'],
    crop_type: ['cropType'],
    season: ['season'],
    crop_season_year: ['cropSeasonYear', 'season'],
    cause: ['cause'],
    loss_event_summary: ['cause'],
    loss_date: ['lossDate'],
    insured_area_hectare: ['areaHectares'],
    area_hectares: ['areaHectares'],
    place: ['exactLocation', 'village'],
    aadhaar_number: ['aadhaarNumber'],
    bank_account_number: ['bankAccountNumber'],
    bank_name: ['bankName'],
    bank_branch_location: ['bankBranchLocation'],
    ifsc_code: ['ifscCode'],
    bank_ifsc: ['ifscCode'],
    micr_code: ['micrCode'],
    account_type: ['accountType'],
    has_crop_loan_or_kcc: ['hasCropLoanOrKcc'],
    gender: ['gender'],
    social_category: ['socialCategory'],
    farmer_address: ['address'],
    mailing_address: ['address'],
    mailing_village: ['village'],
    mailing_tehsil: ['tehsil'],
    mailing_district: ['district'],
    mailing_state: ['state'],
    mailing_pin_code: ['pinCode'],
    land_address: ['landAddress', 'exactLocation'],
    land_village: ['landVillage', 'village'],
    land_tehsil: ['landTehsil', 'tehsil'],
    land_district: ['landDistrict', 'district'],
    land_state: ['landState', 'state'],
    land_pin_code: ['landPinCode', 'pinCode'],
    loanee_status: ['loaneeStatus'],
    sowing_date: ['sowingDate'],
    crop_stage: ['cropStage'],
    proposed_harvest_date: ['proposedHarvestDate'],
    harvesting_date: ['harvestingDate'],
    total_land_hectare: ['totalLandHectares'],
    total_land_insured_hectare: ['totalLandInsuredHectares'],
    survey_or_khasara_or_udyan_no: ['surveyOrKhasaraOrUdyanNo'],
    notified_area_name: ['notifiedAreaName'],
    sum_insured_rupees: ['sumInsuredRupees'],
    premium_paid_rupees: ['premiumPaidRupees'],
    premium_deduction_or_cover_note_date: ['premiumDeductionOrCoverNoteDate'],
    pep_declaration: ['pepDeclaration'],
    pep_details: ['pepDetails'],
})

export function humanizeValue(value) {
    return String(value || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
}

function normalizePhone(value) {
    const digits = String(value || '').replace(/[^\d]/g, '')
    if (digits.length === 10) return `+91${digits}`
    if (digits.length >= 11 && digits.length <= 13) return `+${digits}`
    return null
}

export function getFieldChoiceOptions(fieldName, acceptedValues = null) {
    const explicit = Array.isArray(acceptedValues) && acceptedValues.length ? acceptedValues : null
    const fallback = explicit || CHOICE_OPTIONS[fieldName] || null
    return fallback ? fallback.map((value) => ({ value, label: humanizeValue(value) })) : []
}

export function validateFieldValue(descriptor, rawValue) {
    const fieldName = descriptor?.fieldName || descriptor?.key || ''
    const fieldType = descriptor?.fieldType || descriptor?.type || 'text'
    const options = descriptor?.acceptedValues?.length
        ? descriptor.acceptedValues
        : getFieldChoiceOptions(fieldName).map((option) => option.value)
    const trimmed = String(rawValue ?? '').trim()

    if (!trimmed) {
        return { ok: true, value: '' }
    }

    if (options.length) {
        const match = options.find((option) => String(option).toLowerCase() === trimmed.toLowerCase())
        return match
            ? { ok: true, value: match }
            : { ok: false, errorKey: 'errors.invalid_choice' }
    }

    if (fieldName === 'gpsCoords') {
        if (trimmed.startsWith('{')) {
            try {
                return { ok: true, value: JSON.parse(trimmed) }
            } catch {
                return { ok: false, errorKey: 'errors.invalid_value' }
            }
        }
        const match = trimmed.match(/(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)/)
        if (!match) return { ok: false, errorKey: 'errors.invalid_value' }
        return {
            ok: true,
            value: {
                lat: Number(match[1]),
                lng: Number(match[3]),
            },
        }
    }

    if (fieldType === 'date' || ['lossDate', 'loss_date'].includes(fieldName)) {
        const parsed = new Date(trimmed)
        if (Number.isNaN(parsed.getTime())) return { ok: false, errorKey: 'errors.invalid_date' }
        const iso = parsed.toISOString().slice(0, 10)
        if (['lossDate', 'loss_date'].includes(fieldName) && new Date(`${iso}T00:00:00Z`) > new Date()) {
            return { ok: false, errorKey: 'errors.future_loss_date' }
        }
        return { ok: true, value: iso }
    }

    if (
        fieldType === 'number'
        || ['areaHectares', 'area_hectares', 'insured_area_hectare', 'total_land_hectare', 'total_land_insured_hectare', 'sum_insured_rupees', 'premium_paid_rupees'].includes(fieldName)
    ) {
        const match = trimmed.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
        const parsed = match ? Number(match[0]) : null
        if (parsed == null || Number.isNaN(parsed)) return { ok: false, errorKey: 'errors.invalid_number' }
        if (parsed <= 0) return { ok: false, errorKey: 'errors.positive_number_required' }
        return { ok: true, value: parsed }
    }

    if (['phoneNumber', 'phone_number', 'mobile_number'].includes(fieldName)) {
        const phone = normalizePhone(trimmed)
        return phone ? { ok: true, value: phone } : { ok: false, errorKey: 'errors.invalid_phone' }
    }

    if (['aadhaarNumber', 'aadhaar_number'].includes(fieldName)) {
        const digits = trimmed.replace(/[^\d]/g, '')
        return digits.length === 12 ? { ok: true, value: digits } : { ok: false, errorKey: 'errors.invalid_aadhaar' }
    }

    if (['ifscCode', 'ifsc_code', 'bank_ifsc'].includes(fieldName)) {
        return /^[A-Za-z]{4}[A-Za-z0-9]{7}$/.test(trimmed)
            ? { ok: true, value: trimmed.toUpperCase() }
            : { ok: false, errorKey: 'errors.invalid_ifsc' }
    }

    if (fieldName === 'bank_account_number') {
        const digits = trimmed.replace(/[^\d]/g, '')
        return digits.length >= 6 ? { ok: true, value: digits } : { ok: false, errorKey: 'errors.invalid_bank_account' }
    }

    if (['pinCode', 'pin_code', 'mailing_pin_code', 'land_pin_code'].includes(fieldName)) {
        const digits = trimmed.replace(/[^\d]/g, '')
        return digits.length === 6 ? { ok: true, value: digits } : { ok: false, errorKey: 'errors.invalid_pin' }
    }

    if (trimmed.length < 2) {
        return { ok: false, errorKey: 'errors.invalid_value' }
    }

    return { ok: true, value: trimmed }
}

export function buildSchemaDrafts(pendingFields = [], claim = {}, farmer = null) {
    return Object.fromEntries(
        (pendingFields || []).map((field) => {
            const explicit = field.value
            if (explicit != null && String(explicit).trim() !== '') {
                return [field.field_name, explicit]
            }
            return [field.field_name, getPrefillValue(field.field_name, claim, farmer)]
        })
    )
}

function getPrefillValue(fieldName, claim = {}, farmer = null) {
    const sources = PREFILL_MAP[fieldName] || []
    const merged = { ...(farmer || {}), ...(claim || {}) }

    for (const source of sources) {
        const value = merged?.[source]
        if (value == null) continue
        if (typeof value === 'boolean') return value ? 'yes' : 'no'
        if (String(value).trim() !== '') return value
    }

    return ''
}

export function buildApprovedPhotoSummary(photos = [], auditLog = []) {
    const decisions = new Map()
    const sortedLog = [...(auditLog || [])].sort((left, right) => {
        const leftTime = new Date(left?.timestamp || 0).getTime()
        const rightTime = new Date(right?.timestamp || 0).getTime()
        return leftTime - rightTime
    })

    for (const entry of sortedLog) {
        const metadata = entry?.metadata || {}
        if (typeof metadata.s3Key !== 'string' || typeof metadata.approved !== 'boolean') continue
        decisions.set(metadata.s3Key, metadata.approved)
    }

    const visible = []
    let hiddenRejected = 0

    for (const photo of photos || []) {
        const decision = decisions.get(photo.key)
        if (decision === false) {
            hiddenRejected += 1
            continue
        }
        visible.push(photo)
    }

    return { visible, hiddenRejected }
}
