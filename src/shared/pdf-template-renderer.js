const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('../vendor/pdf-lib');

const { _Get_Template } = require('./insurance-templates');
const { _Schema_Values_Map } = require('./template-schema');
const { _Sanitize_PDF_Text, _Wrap_PDF_Text } = require('./pdf-text');

const _FORM_DIR = path.resolve(__dirname, '..', '..', 'assets', 'forms');
const _SBI_FIELD_ALIASES = Object.freeze({
    father_name_or_spouse_name: ['father name', 'father\'s name', 'father', 'spouse name'],
    aadhaar_number: ['aadhaar', 'aadhaar number', 'uidai', 'uid'],
    bank_account_number: ['account number', 'account no', 'a/c no', 'bank account'],
    bank_name: ['bank name', 'bank'],
    bank_branch_location: ['branch', 'branch location', 'branch name'],
    ifsc_code: ['ifsc', 'ifsc code'],
    micr_code: ['micr', 'micr code'],
});

const _OVERLAY_MAPS = Object.freeze({
    sbi: {
        text: [
            { key: 'farmer_name', page: 0, x: 311, y: 624, width: 180, size: 10 },
            { key: 'father_name_or_spouse_name', page: 0, x: 311, y: 595, width: 180, size: 10 },
            { key: 'social_category_gender_display', page: 0, x: 311, y: 566, width: 140, size: 10 },
            { key: 'farmer_address', page: 0, x: 311, y: 542, width: 185, size: 9.5 },
            { key: 'mobile_number', page: 0, x: 311, y: 514, width: 180, size: 10 },
            { key: 'aadhaar_number', page: 0, x: 311, y: 488, width: 180, size: 10 },
            { key: 'bank_account_number', page: 0, x: 311, y: 461, width: 180, size: 10 },
            { key: 'bank_name', page: 0, x: 130, y: 424, width: 118, size: 9 },
            { key: 'bank_branch_location', page: 0, x: 320, y: 418, width: 115, size: 9 },
            { key: 'ifsc_code', page: 0, x: 127, y: 389, width: 138, size: 9.5 },
            { key: 'micr_code', page: 0, x: 366, y: 390, width: 120, size: 9.5 },
            { key: 'account_type_display', page: 0, x: 441, y: 362, width: 90, size: 10 },
            { key: 'has_crop_loan_or_kcc_display', page: 0, x: 358, y: 326, width: 80, size: 10 },
            { key: 'insured_field_admin_area', page: 0, x: 340, y: 286, width: 170, size: 8.5 },
            { key: 'insured_area_hectare', page: 0, x: 305, y: 250, width: 60, size: 10 },
            { key: 'crop_name', page: 0, x: 320, y: 224, width: 120, size: 10 },
            { key: 'loss_date', page: 0, x: 311, y: 198, width: 120, size: 10 },
            { key: 'loss_event_summary', page: 0, x: 146, y: 130, width: 135, size: 10 },
            { key: 'harvesting_date', page: 1, x: 315, y: 622, width: 150, size: 10 },
            { key: 'post_harvest_storage_reason', page: 1, x: 318, y: 566, width: 220, size: 8 },
            { key: 'post_harvest_other_reason', page: 1, x: 318, y: 528, width: 220, size: 8 },
            { key: 'place', page: 1, x: 107.5, y: 262, width: 180, size: 10 },
            { key: 'form_sign_date', page: 1, x: 107.5, y: 237.84, width: 180, size: 10 },
        ],
        checkboxes: [],
    },
    icici_lombard: {
        text: [
            { key: 'farmer_name', page: 0, x: 325, y: 676, width: 210, size: 9 },
            { key: 'father_name_or_spouse_name', page: 0, x: 325, y: 657, width: 210, size: 9 },
            { key: 'mobile_number', page: 0, x: 325, y: 638, width: 150, size: 9 },
            { key: 'mailing_address', page: 0, x: 155, y: 620, width: 380, size: 8 },
            { key: 'mailing_village', page: 0, x: 92, y: 588, width: 100, size: 8 },
            { key: 'mailing_post_office', page: 0, x: 215, y: 588, width: 95, size: 8 },
            { key: 'mailing_tehsil', page: 0, x: 340, y: 588, width: 90, size: 8 },
            { key: 'mailing_district', page: 0, x: 92, y: 570, width: 100, size: 8 },
            { key: 'mailing_state', page: 0, x: 260, y: 570, width: 90, size: 8 },
            { key: 'mailing_pin_code', page: 0, x: 430, y: 570, width: 75, size: 8 },
            { key: 'land_address', page: 0, x: 155, y: 537, width: 380, size: 8 },
            { key: 'land_village', page: 0, x: 92, y: 507, width: 100, size: 8 },
            { key: 'land_post_office', page: 0, x: 215, y: 507, width: 95, size: 8 },
            { key: 'land_tehsil', page: 0, x: 340, y: 507, width: 90, size: 8 },
            { key: 'land_district', page: 0, x: 92, y: 489, width: 100, size: 8 },
            { key: 'land_state', page: 0, x: 260, y: 489, width: 90, size: 8 },
            { key: 'land_pin_code', page: 0, x: 430, y: 489, width: 75, size: 8 },
            { key: 'email', page: 0, x: 140, y: 470, width: 180, size: 8 },
            { key: 'scheme_name', page: 0, x: 380, y: 451, width: 90, size: 9 },
            { key: 'crop_season_year', page: 0, x: 170, y: 432, width: 110, size: 8 },
            { key: 'crop_name', page: 0, x: 370, y: 432, width: 120, size: 8 },
            { key: 'sowing_date', page: 0, x: 130, y: 414, width: 90, size: 8 },
            { key: 'crop_stage', page: 0, x: 285, y: 414, width: 110, size: 8 },
            { key: 'proposed_harvest_date', page: 0, x: 470, y: 414, width: 70, size: 8 },
            { key: 'harvesting_date', page: 0, x: 470, y: 395, width: 70, size: 8 },
            { key: 'insured_area_hectare', page: 0, x: 205, y: 375, width: 75, size: 8 },
            { key: 'total_land_hectare', page: 0, x: 365, y: 375, width: 70, size: 8 },
            { key: 'total_land_insured_hectare', page: 0, x: 500, y: 375, width: 40, size: 8 },
            { key: 'survey_or_khasara_or_udyan_no', page: 0, x: 270, y: 336, width: 260, size: 8 },
            { key: 'notified_area_name', page: 0, x: 220, y: 317, width: 310, size: 8 },
            { key: 'sum_insured_rupees', page: 0, x: 155, y: 298, width: 90, size: 8 },
            { key: 'premium_paid_rupees', page: 0, x: 360, y: 298, width: 90, size: 8 },
            { key: 'premium_deduction_or_cover_note_date', page: 0, x: 275, y: 278, width: 120, size: 8 },
            { key: 'pep_details', page: 1, x: 95, y: 690, width: 430, size: 8 },
        ],
        checkboxes: [
            { key: 'social_category', value: 'SC', page: 0, x: 128, y: 451 },
            { key: 'social_category', value: 'ST', page: 0, x: 162, y: 451 },
            { key: 'social_category', value: 'GEN', page: 0, x: 205, y: 451 },
            { key: 'social_category', value: 'OTHER', page: 0, x: 255, y: 451 },
            { key: 'gender', value: 'M', page: 0, x: 310, y: 451 },
            { key: 'gender', value: 'F', page: 0, x: 345, y: 451 },
            { key: 'loanee_status', value: 'loanee', page: 0, x: 305, y: 356 },
            { key: 'loanee_status', value: 'non_loanee', page: 0, x: 385, y: 356 },
            { key: 'pep_declaration', value: 'yes', page: 1, x: 90, y: 720 },
        ],
    },
});

async function _Render_Insurer_Form(_Template_Id, _Claim_Data = {}) {
    const _Template = _Get_Template(_Template_Id);
    if (!_Template?.asset_filename) throw new Error('Unknown insurer template');

    const _Asset_Path = path.join(_FORM_DIR, _Template.asset_filename.toLowerCase().replace(/\s+/g, '_'));
    const _Resolved = fs.existsSync(_Asset_Path)
        ? _Asset_Path
        : path.join(_FORM_DIR, _Template.asset_filename);

    if (!fs.existsSync(_Resolved)) {
        throw new Error(`Template asset missing: ${_Resolved}`);
    }

    const _Bytes = fs.readFileSync(_Resolved);
    const _Doc = await PDFDocument.load(_Bytes);
    const _Font = await _Doc.embedFont(StandardFonts.Helvetica);
    const _Bold = await _Doc.embedFont(StandardFonts.HelveticaBold);
    const _Pages = _Doc.getPages();
    _Pages.forEach(_Wrap_Page_Text);
    const _Map = _OVERLAY_MAPS[_Template.id];
    if (!_Map) throw new Error(`Overlay map missing for template ${_Template.id}`);

    const _Values = _Collect_Values(_Template, _Claim_Data);
    const _Rendered = new Set();

    for (const _Field of _Map.text) {
        const _Value = _Values[_Field.key];
        if (_Value == null || String(_Value).trim() === '') continue;
        const _Page = _Pages[_Field.page];
        if (!_Page) continue;
        _Draw_Text(_Page, String(_Value), _Field, _Font);
        _Rendered.add(_Field.key);
    }

    for (const _Box of _Map.checkboxes) {
        const _Current = _Values[_Box.key];
        if (!_Checkbox_Matches(_Current, _Box.value)) continue;
        const _Page = _Pages[_Box.page];
        if (!_Page) continue;
        _Page.drawText(_Sanitize_PDF_Text('X'), {
            x: _Box.x,
            y: _Box.y,
            size: 10,
            font: _Bold,
            color: rgb(0.08, 0.2, 0.5),
        });
        _Rendered.add(_Box.key);
    }

    const _Appendix = _Template.id === 'sbi' ? [] : Object.entries(_Values)
        .filter(([_Key, _Value]) => _Value != null && String(_Value).trim() !== '')
        .filter(([_Key]) => !['scheme_name', 'social_category_gender_display', 'account_type_display', 'has_crop_loan_or_kcc_display'].includes(_Key))
        .filter(([_Key]) => !_Rendered.has(_Key));

    if (_Appendix.length) {
        const _Page = _Doc.addPage([595, 842]);
        _Wrap_Page_Text(_Page);
        let _Y = 790;
        _Page.drawText(_Sanitize_PDF_Text(`${_Template.name} - Additional captured values`), {
            x: 50,
            y: _Y,
            size: 15,
            font: _Bold,
            color: rgb(0.1, 0.3, 0.6),
        });
        _Y -= 24;
        _Page.drawText(_Sanitize_PDF_Text('These values were captured during the claim flow but do not yet have exact overlay coordinates on the insurer PDF.'), {
            x: 50,
            y: _Y,
            size: 9,
            font: _Font,
            color: rgb(0.25, 0.25, 0.25),
        });
        _Y -= 26;
        for (const [_Key, _Value] of _Appendix) {
            const _Lines = _Wrap_Text(`${_Humanize(_Key)}: ${_Value}`, _Font, 9, 480);
            for (const _Line of _Lines) {
                if (_Y < 60) break;
                _Page.drawText(_Line, { x: 50, y: _Y, size: 9, font: _Font, color: rgb(0.12, 0.12, 0.12) });
                _Y -= 14;
            }
        }
    }

    return {
        buffer: Buffer.from(await _Doc.save()),
        renderedFields: [..._Rendered],
        appendixFields: _Appendix.map(([_Key]) => _Key),
        templateName: _Template.name,
    };
}

function _Collect_Values(_Template, _Claim_Data) {
    const _Schema_Values = _Schema_Values_Map(_Claim_Data);
    const _Values = {
        farmer_name: _Claim_Data.farmerName,
        mobile_number: _Claim_Data.phoneNumber,
        crop_name: _Claim_Data.cropType,
        loss_date: _Claim_Data.lossDate,
        insured_area_hectare: _Claim_Data.areaHectares,
        form_sign_date: new Date().toISOString().slice(0, 10),
        scheme_name: 'PMFBY',
        place: _Claim_Data.village || _Claim_Data.exactLocation || '',
        loss_event_summary: _Claim_Data.cause || '',
        ..._Schema_Values,
    };

    if (_Template.id === 'sbi') {
        _Normalize_SBI_Values(_Values, _Claim_Data, _Schema_Values);
    }

    Object.assign(_Values, _Derived_Checkbox_Values(_Template.id, _Claim_Data, _Values));
    if (_Template.id === 'sbi') {
        _Values.social_category_gender_display = _Build_SBI_Category_Gender_Display(_Values);
        _Values.account_type_display = _Build_SBI_Account_Type_Display(_Values.account_type);
        _Values.has_crop_loan_or_kcc_display = _Build_SBI_Yes_No_Display(_Values.has_crop_loan_or_kcc);
        delete _Values.social_category;
        delete _Values.gender;
        delete _Values.account_type;
        delete _Values.has_crop_loan_or_kcc;
        delete _Values.risk_hailstorm;
        delete _Values.risk_landslide;
        delete _Values.risk_inundation;
        delete _Values.post_harvest_loss_flag;
        delete _Values.risk_cyclone;
        delete _Values.risk_cyclonic_rain;
        delete _Values.risk_unseasonal_rain;
        delete _Values.post_harvest_drying_reason_flag;
    }
    for (const _Key of Object.keys(_Values)) {
        _Values[_Key] = _Format_Render_Value(_Key, _Values[_Key]);
    }

    return _Values;
}

function _Normalize_SBI_Values(_Values, _Claim_Data, _Schema_Values) {
    const _Docs = _Claim_Data.documentsReceived || [];
    const _Identity = _Claim_Data.identityVerification || {};

    _Values.farmer_name = _First_Valid([
        _Identity.verified ? (_Identity.extractedName || _Identity.claimedName) : null,
        _Claim_Data.farmerName,
        _Schema_Values.farmer_name,
    ], _Looks_Like_Name);

    _Values.father_name_or_spouse_name = _First_Valid([
        _Schema_Values.father_name_or_spouse_name,
        _Document_Field_Value(_Docs, 'father_name_or_spouse_name'),
    ], _Looks_Like_Name);

    _Values.social_category = _First_Valid([
        _Claim_Data.socialCategory,
        _Schema_Values.social_category,
    ], (_Value) => ['SC', 'ST', 'OBC', 'OTHERS'].includes(String(_Value || '').toUpperCase().trim()));

    _Values.gender = _First_Valid([
        _Claim_Data.gender,
        _Schema_Values.gender,
    ], (_Value) => ['M', 'F'].includes(String(_Value || '').toUpperCase().trim()));

    _Values.farmer_address = _First_Valid([
        _Claim_Data.address,
        _Schema_Values.farmer_address,
        _Schema_Values.mailing_address,
    ], _Looks_Like_Address);

    _Values.mobile_number = _First_Valid([
        _Claim_Data.phoneNumber,
        _Schema_Values.mobile_number,
        _Schema_Values.phone_number,
        _Document_Field_Value(_Docs, 'mobile_number'),
    ], _Looks_Like_Phone);

    _Values.aadhaar_number = _First_Valid([
        _Schema_Values.aadhaar_number,
        _Document_Field_Value(_Docs, 'aadhaar_number'),
        _Claim_Data.aadhaarNumber,
    ], _Looks_Like_Aadhaar);

    _Values.bank_account_number = _First_Valid([
        _Schema_Values.bank_account_number,
        _Document_Field_Value(_Docs, 'bank_account_number'),
    ], _Looks_Like_Bank_Account);

    _Values.bank_name = _First_Valid([
        _Schema_Values.bank_name,
        _Document_Field_Value(_Docs, 'bank_name'),
    ], _Looks_Like_Bank_Name);

    _Values.bank_branch_location = _First_Valid([
        _Schema_Values.bank_branch_location,
        _Document_Field_Value(_Docs, 'bank_branch_location'),
    ], _Looks_Like_Location_Text);

    _Values.ifsc_code = _First_Valid([
        _Schema_Values.ifsc_code,
        _Schema_Values.bank_ifsc,
        _Document_Field_Value(_Docs, 'ifsc_code'),
    ], _Looks_Like_IFSC);

    _Values.micr_code = _First_Valid([
        _Schema_Values.micr_code,
        _Document_Field_Value(_Docs, 'micr_code'),
    ], _Looks_Like_MICR);

    _Values.account_type = _First_Valid([
        _Claim_Data.accountType,
        _Schema_Values.account_type,
    ], (_Value) => ['saving_account', 'crop_loan'].includes(String(_Value || '').toLowerCase().trim()));

    _Values.has_crop_loan_or_kcc = _First_Valid([
        _Claim_Data.hasCropLoanOrKcc,
        _Schema_Values.has_crop_loan_or_kcc,
    ], (_Value) => ['yes', 'no'].includes(String(_Value || '').toLowerCase().trim()));

    _Values.insured_field_admin_area = _First_Valid([
        _Schema_Values.insured_field_admin_area,
        [_Claim_Data.village, _Claim_Data.district].filter(Boolean).join(', '),
        _Claim_Data.exactLocation,
    ], _Looks_Like_Admin_Area);

    _Values.insured_area_hectare = _First_Valid([
        _Claim_Data.areaHectares,
        _Schema_Values.insured_area_hectare,
        _Schema_Values.area_hectares,
    ], (_Value) => {
        const _Number = Number(_Value);
        return Number.isFinite(_Number) && _Number > 0;
    });

    _Values.crop_name = _First_Valid([
        _Claim_Data.cropType,
        _Schema_Values.crop_name,
        _Schema_Values.crop_type,
    ], _Looks_Like_Crop_Name);

    _Values.loss_date = _First_Valid([
        _Claim_Data.lossDate,
        _Schema_Values.loss_date,
    ], _Looks_Like_ISO_Date);

    _Values.loss_event_summary = _First_Valid([
        _Claim_Data.cause,
        _Schema_Values.loss_event_summary,
        _Schema_Values.cause,
    ], _Looks_Like_Cause_Text);

    _Values.place = _First_Valid([
        _Claim_Data.formPlace,
        _Claim_Data.village,
        _Claim_Data.exactLocation,
        _Schema_Values.place,
    ], _Looks_Like_Location_Text);
}

function _Derived_Checkbox_Values(_Template_Id, _Claim_Data, _Values) {
    const _Cause = String(_Values.loss_event_summary || _Claim_Data.cause || '').toLowerCase();
    const _Out = {};
    if (_Template_Id === 'sbi') {
        if (_Cause.includes('hail')) _Out.risk_hailstorm = true;
        else if (_Cause.includes('landslide')) _Out.risk_landslide = true;
        else if (_Cause.includes('flood') || _Cause.includes('inund')) _Out.risk_inundation = true;
        else if (_Cause.includes('cyclonic rain')) _Out.risk_cyclonic_rain = true;
        else if (_Cause.includes('cyclone')) _Out.risk_cyclone = true;
        else if (_Cause.includes('rain')) _Out.risk_unseasonal_rain = true;
        else if (_Cause.includes('post harvest')) _Out.post_harvest_loss_flag = true;
    }
    if (_Template_Id === 'icici_lombard') {
        if (String(_Values.pep_declaration || '').toLowerCase() === 'yes') _Out.pep_declaration = 'yes';
    }
    return _Out;
}

function _Checkbox_Matches(_Current, _Expected) {
    if (_Expected === true) return Boolean(_Current);
    const _Value = String(_Current || '').toLowerCase().trim();
    return _Value === String(_Expected || '').toLowerCase().trim();
}

function _Format_Render_Value(_Key, _Value) {
    if (_Value == null) return _Value;
    const _Text = String(_Value).trim();
    if (!_Text) return _Text;

    if (_Key === 'insured_area_hectare' && /^\.\d+$/.test(_Text)) {
        return `0${_Text}`;
    }

    if (_Key === 'loss_event_summary') {
        return _Text.replace(/_/g, ' ');
    }

    return _Text;
}

function _Build_SBI_Category_Gender_Display(_Values) {
    const _Category = _Format_SBI_Category(_Values.social_category);
    const _Gender = _Format_SBI_Gender(_Values.gender);
    return [_Category, _Gender].filter(Boolean).join(' / ');
}

function _Build_SBI_Account_Type_Display(_Value) {
    const _Normalized = String(_Value || '').toLowerCase().trim();
    if (_Normalized === 'saving_account') return 'Saving Account';
    if (_Normalized === 'crop_loan') return 'Crop Loan';
    return _Value || '';
}

function _Build_SBI_Yes_No_Display(_Value) {
    const _Normalized = String(_Value || '').toLowerCase().trim();
    if (_Normalized === 'yes') return 'YES';
    if (_Normalized === 'no') return 'NO';
    return _Value || '';
}

function _Format_SBI_Category(_Value) {
    const _Normalized = String(_Value || '').toUpperCase().trim();
    if (!_Normalized) return '';
    if (_Normalized === 'OTHERS') return 'Others';
    return _Normalized;
}

function _Format_SBI_Gender(_Value) {
    const _Normalized = String(_Value || '').toUpperCase().trim();
    if (_Normalized === 'M') return 'M';
    if (_Normalized === 'F') return 'F';
    return _Value || '';
}

function _Draw_Text(_Page, _Value, _Field, _Font) {
    const _Lines = _Wrap_Text(String(_Value), _Font, _Field.size || 10, _Field.width || 180);
    let _Y = _Field.y;
    const _Line_Height = _Field.lineHeight || ((_Field.size || 10) + 2);
    for (const _Line of _Lines.slice(0, 4)) {
        const _Width = _Font.widthOfTextAtSize(_Line, _Field.size || 10);
        let _X = _Field.x;
        if (_Field.align === 'center') {
            _X = _Field.x + Math.max(0, ((_Field.width || 180) - _Width) / 2);
        } else if (_Field.align === 'right') {
            _X = _Field.x + Math.max(0, (_Field.width || 180) - _Width);
        }
        _Page.drawText(_Line, {
            x: _X,
            y: _Y,
            size: _Field.size || 10,
            font: _Font,
            color: rgb(0.1, 0.1, 0.1),
        });
        _Y -= _Line_Height;
    }
}

function _Wrap_Text(_Text, _Font, _Size, _Max_Width) {
    return _Wrap_PDF_Text(_Text, _Font, _Size, _Max_Width);
}

function _Wrap_Page_Text(_Page) {
    if (_Page._bimaSafeTextWrapped) return _Page;
    const _Original_Draw_Text = _Page.drawText.bind(_Page);
    _Page.drawText = (_Text, _Options) => _Original_Draw_Text(_Sanitize_PDF_Text(_Text), _Options);
    _Page._bimaSafeTextWrapped = true;
    return _Page;
}

function _Humanize(_Value) {
    return String(_Value || '').replace(/_/g, ' ').replace(/\b\w/g, (_Char) => _Char.toUpperCase());
}

function _First_Valid(_Candidates, _Validator) {
    for (const _Candidate of _Candidates || []) {
        if (_Candidate == null) continue;
        const _Text = String(_Candidate).trim();
        if (!_Text) continue;
        if (!_Validator || _Validator(_Candidate)) return _Candidate;
    }
    return null;
}

function _Document_Field_Value(_Documents, _Field_Key) {
    const _Aliases = _SBI_FIELD_ALIASES[_Field_Key] || [];
    for (const _Document of _Documents || []) {
        const _Candidates = [
            ...(_Document.keyValues || []),
            ...(_Document.fieldsFound || []),
        ];
        for (const _Candidate of _Candidates) {
            const _Key = _Normalize_Doc_Key(_Candidate.key || _Candidate.field || '');
            if (_Aliases.some((_Alias) => _Key.includes(_Normalize_Doc_Key(_Alias)))) {
                return _Candidate.value || null;
            }
        }
    }
    return null;
}

function _Normalize_Doc_Key(_Value) {
    return String(_Value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function _Looks_Like_Name(_Value) {
    const _Text = String(_Value || '').trim();
    return _Text.length >= 3 && /[A-Za-z]/.test(_Text) && !/department|government|signature|number card/i.test(_Text);
}

function _Looks_Like_Address(_Value) {
    const _Text = String(_Value || '').trim();
    return _Text.length >= 5 && !/^\+?\d{10,13}$/.test(_Text);
}

function _Looks_Like_Phone(_Value) {
    const _Digits = String(_Value || '').replace(/[^\d]/g, '');
    return _Digits.length >= 10 && _Digits.length <= 13;
}

function _Looks_Like_Aadhaar(_Value) {
    return String(_Value || '').replace(/[^\d]/g, '').length === 12;
}

function _Looks_Like_Bank_Account(_Value) {
    const _Digits = String(_Value || '').replace(/[^\d]/g, '');
    return _Digits.length >= 6 && _Digits.length <= 20;
}

function _Looks_Like_Bank_Name(_Value) {
    const _Text = String(_Value || '').trim();
    return _Text.length >= 2 && /[A-Za-z]/.test(_Text) && !/^\d+$/.test(_Text);
}

function _Looks_Like_Location_Text(_Value) {
    const _Text = String(_Value || '').trim();
    return _Text.length >= 2 && /[A-Za-z]/.test(_Text) && !/^\d+$/.test(_Text);
}

function _Looks_Like_IFSC(_Value) {
    return /^[A-Za-z]{4}[A-Za-z0-9]{7}$/.test(String(_Value || '').trim());
}

function _Looks_Like_MICR(_Value) {
    const _Digits = String(_Value || '').replace(/[^\d]/g, '');
    return _Digits.length >= 8 && _Digits.length <= 12;
}

function _Looks_Like_Admin_Area(_Value) {
    const _Text = String(_Value || '').trim();
    return _Text.length >= 3 && !['yes', 'no'].includes(_Text.toLowerCase()) && !/^\d+(\.\d+)?$/.test(_Text);
}

function _Looks_Like_Crop_Name(_Value) {
    const _Text = String(_Value || '').trim();
    return _Text.length >= 2 && /[A-Za-z]/.test(_Text) && !_Looks_Like_ISO_Date(_Text);
}

function _Looks_Like_ISO_Date(_Value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(_Value || '').trim());
}

function _Looks_Like_Cause_Text(_Value) {
    const _Text = String(_Value || '').trim();
    return _Text.length >= 3 && !/^\d{4}-\d{2}-\d{2}$/.test(_Text);
}

module.exports = {
    _Render_Insurer_Form,
};
