/**
 * BimaSathi — Insurance Company Form Templates
 * Definitions of required fields for each insurance company's claim form.
 */

const _Company_Templates = {
    SBI: {
        id: 'SBI',
        name: 'SBI General Insurance',
        fields: [
            { key: 'farmer_name', label: 'Name of Insured', required: true, type: 'string' },
            { key: 'village', label: 'Village', required: true, type: 'string' },
            { key: 'district', label: 'District', required: true, type: 'string' },
            { key: 'state', label: 'State', required: true, type: 'string' },
            { key: 'crop_type', label: 'Crop Name', required: true, type: 'string' },
            { key: 'area_hectares', label: 'Insured Area (Hectares)', required: true, type: 'number' },
            { key: 'cause', label: 'Cause of Loss', required: true, type: 'string' },
            { key: 'loss_date', label: 'Date of Loss', required: true, type: 'date' },
            { key: 'policy_number', label: 'Policy Number', required: true, type: 'string', language_hint: 'Apna Policy Number / KCC Account Number batayein:', english_hint: 'Please provide your Policy Number or KCC Account Number:' },
            { key: 'bank_account', label: 'Bank Account Number', required: true, type: 'string', language_hint: 'Apna Bank Account Number batayein (claims ke liye):', english_hint: 'Please provide your Bank Account Number for claim settlement:' }
        ]
    },
    HDFC_ERGO: {
        id: 'HDFC_ERGO',
        name: 'HDFC ERGO General Insurance',
        fields: [
            { key: 'farmer_name', label: 'Farmer Name', required: true, type: 'string' },
            { key: 'village', label: 'Village', required: true, type: 'string' },
            { key: 'district', label: 'District', required: true, type: 'string' },
            { key: 'crop_type', label: 'Crop Insured', required: true, type: 'string' },
            { key: 'area_hectares', label: 'Area Affected', required: true, type: 'number' },
            { key: 'cause', label: 'Peril / Cause of Damage', required: true, type: 'string' },
            { key: 'loss_date', label: 'Date of Occurrence', required: true, type: 'date' },
            { key: 'application_number', label: 'National Crop Insurance Portal App No.', required: true, type: 'string', language_hint: 'Apna crop insurance Application Number (NCIP) batayein:', english_hint: 'Please provide your NCIP Application Number:' }
        ]
    },
    AIC: {
        id: 'AIC',
        name: 'Agriculture Insurance Company (AIC)',
        fields: [
            { key: 'farmer_name', label: 'Farmer Name', required: true, type: 'string' },
            { key: 'village', label: 'Village', required: true, type: 'string' },
            { key: 'crop_type', label: 'Crop', required: true, type: 'string' },
            { key: 'area_hectares', label: 'Area Sown (Hectares)', required: true, type: 'number' },
            { key: 'cause', label: 'Cause of Loss', required: true, type: 'string' },
            { key: 'loss_date', label: 'Date of Loss', required: true, type: 'date' },
            { key: 'aadhar_number', label: 'Aadhar Number', required: true, type: 'string', language_hint: 'Apna Aadhar Number batayein (12 digits):', english_hint: 'Please provide your 12-digit Aadhar Number:' }
        ]
    }
};

module.exports = {
    _Company_Templates
};
