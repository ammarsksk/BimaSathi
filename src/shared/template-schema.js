const { _Field_Status } = require('./constants');
const { _Get_Template, _Checkbox_Behavior, _Requirement_Mode } = require('./insurance-templates');

const _TEMPLATE_CHOICES = Object.freeze([
    { id: 'template_sbi', value: 'sbi', title: 'SBI', description: 'SBI General insurer form' },
    { id: 'template_icici', value: 'icici_lombard', title: 'ICICI Lombard', description: 'ICICI insurer form' },
]);

const _DERIVED_ONLY_FIELDS = new Set([
    'risk_hailstorm',
    'risk_landslide',
    'risk_inundation',
    'post_harvest_loss_flag',
    'risk_cyclone',
    'risk_cyclonic_rain',
    'risk_unseasonal_rain',
    'pep_yes_checkbox',
    'declaration_text',
    'scheme_name_static',
    'pep_explanatory_static',
    'farmer_signature_slot',
]);

const _DOC_KEY_ALIASES = Object.freeze({
    father_name_or_spouse_name: ['father name', 'father\'s name', 'spouse name', 'father', 'father name/spouse name'],
    aadhaar_number: ['aadhaar', 'aadhaar no', 'uid', 'uidai', 'aadhaar number'],
    bank_account_number: ['account no', 'account number', 'a/c no', 'bank account', 'bank account number'],
    bank_name: ['bank name', 'bank'],
    bank_branch_location: ['branch', 'branch location', 'branch name'],
    ifsc_code: ['ifsc', 'ifsc code', 'bank ifsc'],
    micr_code: ['micr', 'micr code'],
    mobile_number: ['mobile', 'mobile no', 'phone', 'phone number', 'contact number'],
    mailing_pin_code: ['pin code', 'pincode', 'postal code'],
    land_pin_code: ['pin code', 'pincode', 'postal code'],
    mailing_post_office: ['post office'],
    land_post_office: ['post office'],
    survey_or_khasara_or_udyan_no: ['survey no', 'khasara no', 'khasra no', 'udyan card no', 'survey', 'khasara'],
    sum_insured_rupees: ['sum insured', 'sum insured rs', 'sum insured amount'],
    premium_paid_rupees: ['premium', 'premium paid', 'premium amount'],
    premium_deduction_or_cover_note_date: ['premium date', 'date of premium', 'cover note date'],
});

const _POSITIVE_NUMBER_FIELDS = new Set([
    'insured_area_hectare',
    'area_hectares',
    'total_land_hectare',
    'total_land_insured_hectare',
    'sum_insured_rupees',
    'premium_paid_rupees',
]);

function _Normalize(_Value) {
    return String(_Value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function _Humanize_Choice(_Value) {
    return String(_Value || '').replace(/_/g, ' ').replace(/\b\w/g, (_Char) => _Char.toUpperCase());
}

function _Template_Choices() {
    return _TEMPLATE_CHOICES;
}

function _Parse_Template_Choice(_Text) {
    const _Value = _Normalize(_Text);
    if (!_Value) return null;
    const _Index = Number(_Value);
    if (_Index >= 1 && _Index <= _TEMPLATE_CHOICES.length) return _TEMPLATE_CHOICES[_Index - 1].value;
    const _Found = _TEMPLATE_CHOICES.find((_Choice) => (
        _Normalize(_Choice.id) === _Value
        || _Normalize(_Choice.value) === _Value
        || _Normalize(_Choice.title) === _Value
        || _Normalize(_Choice.description) === _Value
    ));
    return _Found?.value || null;
}

function _Build_Template_Schema(_Template_Id, _Claim = {}) {
    const _Template = _Get_Template(_Template_Id);
    if (!_Template) return [];

    return _Template.fields
        .filter((_Field) => !_Should_Skip_Field(_Field, _Claim))
        .map((_Field) => _To_Schema_Field(_Template, _Field, _Claim));
}

function _Should_Skip_Field(_Field, _Claim) {
    if (_Field.required_mode === _Requirement_Mode.OPERATOR_ONLY) return true;
    if (_DERIVED_ONLY_FIELDS.has(_Field.key)) return true;
    if (_Field.required_mode === _Requirement_Mode.CONDITIONAL && !_Condition_Applies(_Field.key, _Claim)) return true;
    return false;
}

function _Condition_Applies(_Field_Key, _Claim) {
    const _Cause = _Normalize(_Claim.cause);
    const _Is_Post_Harvest = _Cause.includes('post harvest') || _Normalize(_Claim.templateDerivedCause) === 'post_harvest';
    if (['harvesting_date', 'post_harvest_storage_reason', 'post_harvest_drying_reason_flag', 'post_harvest_other_reason'].includes(_Field_Key)) {
        return _Is_Post_Harvest;
    }
    if (_Field_Key === 'proposed_harvest_date') return !_Claim.harvestingDate;
    if (_Field_Key === 'pep_details') return _Normalize(_Claim.pepDeclaration) === 'yes';
    return true;
}

function _To_Schema_Field(_Template, _Field, _Claim) {
    const _Accepted = _Accepted_Values(_Template, _Field);
    const _Prefill = _Prefill_Value(_Field.key, _Claim, _Accepted);
    return {
        field_name: _Field.key,
        field_label: _Field.label,
        field_type: _Schema_Field_Type(_Field, _Accepted),
        is_required: _Field.required_mode === _Requirement_Mode.YES || (_Field.required_mode === _Requirement_Mode.CONDITIONAL && _Condition_Applies(_Field.key, _Claim)),
        accepted_values: _Accepted,
        language_hint: _Build_Language_Hint(_Field, _Accepted),
        status: _Prefill == null ? _Field_Status.PENDING : _Field_Status.PREFILLED,
        value: _Prefill,
        source: _Prefill == null ? null : 'template_prefill',
        template_id: _Template.id,
        required_mode: _Field.required_mode,
        checkbox_behavior: _Field.checkbox_behavior || _Checkbox_Behavior.NOT_APPLICABLE,
    };
}

function _Schema_Field_Type(_Field, _Accepted) {
    if (_Accepted?.length) return 'choice';
    if (_Field.type === 'date') return 'date';
    if (_Field.type === 'number') return 'number';
    return 'text';
}

function _Accepted_Values(_Template, _Field) {
    if (_Field.type !== 'checkbox') return null;
    if (_Field.checkbox_behavior === _Checkbox_Behavior.YES_NO || _Field.checkbox_behavior === _Checkbox_Behavior.DERIVED_YES_ONLY) {
        return ['yes', 'no'];
    }
    const _Group = (_Template.checkbox_groups || []).find((_Item) => _Item.key === _Field.key);
    return _Group?.options?.length ? _Group.options : null;
}

function _Build_Language_Hint(_Field, _Accepted) {
    if (_Accepted?.length) {
        return `Choose one of: ${_Accepted.map(_Humanize_Choice).join(', ')}`;
    }
    return `Provide ${_Field.label}`;
}

function _Prefill_Value(_Field_Key, _Claim, _Accepted) {
    const _Existing = _Existing_Schema_Value(_Field_Key, _Claim.formSchema || []);
    if (_Existing != null) return _Normalize_Checkbox_Value(_Existing, _Accepted);

    const _From_Claim = _Claim_Field_Value(_Field_Key, _Claim);
    if (_From_Claim != null) return _Normalize_Checkbox_Value(_From_Claim, _Accepted);

    const _From_Docs = _Document_Field_Value(_Field_Key, _Claim.documentsReceived || []);
    if (_From_Docs != null) return _Normalize_Checkbox_Value(_From_Docs, _Accepted);

    if (_Field_Key === 'farmer_name') {
        const _Identity = _Claim.identityVerification || {};
        return _Identity.verified ? (_Identity.extractedName || _Identity.claimedName || _Claim.farmerName || null) : (_Claim.farmerName || null);
    }

    if (_Field_Key === 'scheme_name') return 'PMFBY';
    if (_Field_Key === 'place') return _Claim.village || _Claim.exactLocation || null;
    if (_Field_Key === 'form_sign_date') return new Date().toISOString().slice(0, 10);

    return null;
}

function _Existing_Schema_Value(_Field_Key, _Form_Schema) {
    const _Field = (_Form_Schema || []).find((_Item) => _Item?.field_name === _Field_Key && _Item.status !== _Field_Status.PENDING && _Item.value != null);
    if (!_Should_Preserve_Existing_Schema_Value(_Field)) return null;
    return _Field?.value ?? null;
}

function _Should_Preserve_Existing_Schema_Value(_Field) {
    if (!_Field) return false;
    if (_Field.status === _Field_Status.PREFILLED) {
        const _Source = _Normalize(_Field.source);
        return Boolean(_Source) && _Source !== 'template_prefill';
    }
    return true;
}

function _Claim_Field_Value(_Field_Key, _Claim) {
    const _Map = {
        farmer_name: _Claim.farmerName,
        mobile_number: _Claim.phoneNumber,
        crop_name: _Claim.cropType,
        loss_date: _Claim.lossDate,
        insured_area_hectare: _Claim.areaHectares,
        place: _Claim.village || _Claim.exactLocation,
        pep_declaration: _Claim.pepDeclaration,
        mailing_address: _Claim.address,
        mailing_village: _Claim.village,
        mailing_tehsil: _Claim.tehsil,
        mailing_district: _Claim.district,
        mailing_state: _Claim.state,
        mailing_pin_code: _Claim.pinCode,
        land_address: _Claim.landAddress || _Claim.exactLocation,
        land_village: _Claim.landVillage || _Claim.village,
        land_tehsil: _Claim.landTehsil || _Claim.tehsil,
        land_district: _Claim.landDistrict || _Claim.district,
        land_state: _Claim.landState || _Claim.state,
        land_pin_code: _Claim.landPinCode,
        gender: _Claim.gender,
        social_category: _Claim.socialCategory,
        account_type: _Claim.accountType,
        has_crop_loan_or_kcc: _Claim.hasCropLoanOrKcc,
        crop_season_year: _Claim.cropSeasonYear || _Claim.season,
        sowing_date: _Claim.sowingDate,
        crop_stage: _Claim.cropStage,
        proposed_harvest_date: _Claim.proposedHarvestDate,
        harvesting_date: _Claim.harvestingDate,
        total_land_hectare: _Claim.totalLandHectares,
        total_land_insured_hectare: _Claim.totalLandInsuredHectares,
        loanee_status: _Claim.loaneeStatus,
        survey_or_khasara_or_udyan_no: _Claim.surveyOrKhasaraOrUdyanNo,
        notified_area_name: _Claim.notifiedAreaName,
        sum_insured_rupees: _Claim.sumInsuredRupees,
        premium_paid_rupees: _Claim.premiumPaidRupees,
        premium_deduction_or_cover_note_date: _Claim.premiumDeductionOrCoverNoteDate,
        loss_event_summary: _Claim.cause,
    };
    return Object.prototype.hasOwnProperty.call(_Map, _Field_Key) ? _Map[_Field_Key] : null;
}

function _Document_Field_Value(_Field_Key, _Documents) {
    if (!Array.isArray(_Documents) || !_Documents.length) return null;
    const _Aliases = _DOC_KEY_ALIASES[_Field_Key] || [];
    for (const _Document of _Documents) {
        const _Candidates = [
            ...(_Document.keyValues || []),
            ...(_Document.fieldsFound || []),
        ];
        for (const _Candidate of _Candidates) {
            const _Key = _Normalize(_Candidate.key || _Candidate.field || '');
            if (_Aliases.some((_Alias) => _Key.includes(_Normalize(_Alias)))) {
                return _Candidate.value || null;
            }
        }
    }
    return null;
}

function _Normalize_Checkbox_Value(_Value, _Accepted) {
    if (!_Accepted?.length || _Value == null) return _Value;
    const _Normalized = _Normalize(_Value);
    const _Direct = _Accepted.find((_Option) => _Normalize(_Option) === _Normalized);
    if (_Direct) return _Direct;
    if (['true', 'yes', 'y', '1'].includes(_Normalized) && _Accepted.includes('yes')) return 'yes';
    if (['false', 'no', 'n', '0'].includes(_Normalized) && _Accepted.includes('no')) return 'no';
    if (_Accepted.includes('M') && ['male', 'm'].includes(_Normalized)) return 'M';
    if (_Accepted.includes('F') && ['female', 'f'].includes(_Normalized)) return 'F';
    return _Value;
}

function _Schema_Values_Map(_Claim = {}) {
    const _Map = {};
    for (const _Field of _Claim.formSchema || []) {
        if (_Field?.field_name && _Field.value != null && _Field.status !== _Field_Status.PENDING) {
            _Map[_Field.field_name] = _Field.value;
        }
    }
    return _Map;
}

function _Build_Template_Field_State(_Template_Id, _Claim = {}, _Options = {}) {
    const _Template = _Get_Template(_Template_Id);
    if (!_Template) {
        return {
            template: null,
            schema: [],
            requiredFields: [],
            missingFields: [],
            reviewFields: [],
            pendingFields: [],
        };
    }

    const _Schema = _Build_Template_Schema(_Template.id, _Claim);
    const _Required_Keys = new Set(
        (_Template.required_for_generation || []).length
            ? _Template.required_for_generation
            : _Schema.filter((_Field) => _Field.is_required).map((_Field) => _Field.field_name)
    );
    const _Required_Fields = _Schema.filter((_Field) => _Required_Keys.has(_Field.field_name));
    const _Missing_Fields = _Required_Fields.filter((_Field) => !_Schema_Field_Has_Usable_Value(_Field));
    const _Review_Auto_Prefilled = _Options.reviewAutoPrefilled === true;
    const _Review_Fields = _Review_Auto_Prefilled
        ? _Required_Fields.filter((_Field) => (
            _Schema_Field_Has_Usable_Value(_Field) && _Normalize(_Field.source) === 'template_prefill'
        ))
        : [];
    const _Pending_Fields = [
        ..._Missing_Fields,
        ..._Review_Fields.filter((_Field) => !_Missing_Fields.some((_Item) => _Item.field_name === _Field.field_name)),
    ];

    return {
        template: _Template,
        schema: _Schema,
        requiredFields: _Required_Fields,
        missingFields: _Missing_Fields,
        reviewFields: _Review_Fields,
        pendingFields: _Pending_Fields,
    };
}

function _Schema_Field_Has_Usable_Value(_Field = {}) {
    const _Raw = _Field?.value;
    if (_Raw == null) return false;

    const _Accepted = Array.isArray(_Field.accepted_values) ? _Field.accepted_values : [];
    if (_Accepted.length) {
        const _Normalized = _Normalize_Checkbox_Value(_Raw, _Accepted);
        return _Accepted.some((_Option) => _Normalize(_Option) === _Normalize(_Normalized));
    }

    const _Value = String(_Raw).trim();
    if (!_Value) return false;

    if (_Field.field_type === 'date' || _Field.field_name === 'loss_date') {
        const _Parsed = new Date(_Value);
        if (Number.isNaN(_Parsed.getTime())) return false;
        if (_Field.field_name === 'loss_date') {
            const _Iso = _Parsed.toISOString().slice(0, 10);
            if (new Date(`${_Iso}T00:00:00Z`) > new Date()) return false;
        }
        return true;
    }

    if (_Field.field_type === 'number' || _POSITIVE_NUMBER_FIELDS.has(_Field.field_name)) {
        const _Match = _Value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
        const _Number = _Match ? Number(_Match[0]) : null;
        return Number.isFinite(_Number) && _Number > 0;
    }

    if (['phone_number', 'mobile_number'].includes(_Field.field_name)) {
        return Boolean(_Normalize_Phone_Value(_Value));
    }

    if (_Field.field_name === 'aadhaar_number') {
        return _Value.replace(/[^\d]/g, '').length === 12;
    }

    if (['bank_ifsc', 'ifsc_code'].includes(_Field.field_name)) {
        return /^[A-Za-z]{4}[A-Za-z0-9]{7}$/.test(_Value);
    }

    if (_Field.field_name === 'bank_account_number') {
        return _Value.replace(/[^\d]/g, '').length >= 6;
    }

    if (['mailing_pin_code', 'land_pin_code'].includes(_Field.field_name)) {
        return _Value.replace(/[^\d]/g, '').length === 6;
    }

    return _Value.length >= 2;
}

function _Normalize_Phone_Value(_Value) {
    const _Digits = String(_Value || '').replace(/[^\d]/g, '');
    if (_Digits.length === 10) return `+91${_Digits}`;
    if (_Digits.length >= 11 && _Digits.length <= 13) return `+${_Digits}`;
    return null;
}

module.exports = {
    _Template_Choices,
    _Parse_Template_Choice,
    _Build_Template_Schema,
    _Schema_Values_Map,
    _Build_Template_Field_State,
    _Schema_Field_Has_Usable_Value,
};
