/**
 * PMFBY Premium Calculator Utility
 * Handles actuarial math and mocked 'Sum Insured' valuations for the chatbot.
 */

// Official PMFBY Farmer Subsidized Premium Rates
const _PMFBY_RATES = {
    KHARIF: 0.02,     // 2.0%
    RABI: 0.015,      // 1.5%
    COMMERCIAL: 0.05  // 5.0%
};

// Mock Data: Sum Insured per Hectare by State and Crop
// Using realistic figures for demonstration. Fallback is 40,000.
const _MOCK_SUM_INSURED = {
    'punjab': {
        'wheat': 65000,
        'rice': 70000,
        'cotton': 80000,
    },
    'haryana': {
        'wheat': 62000,
        'rice': 68000,
        'mustard': 45000,
    },
    'maharashtra': {
        'cotton': 55000,
        'soybean': 48000,
        'onion': 90000, // Commercial/Horticulture
        'sugarcane': 110000,
    },
    'gujarat': {
        'cotton': 60000,
        'groundnut': 52000,
    },
    'madhya pradesh': {
        'soybean': 45000,
        'wheat': 50000,
        'gram': 38000,
    },
    'uttar pradesh': {
        'wheat': 55000,
        'sugarcane': 100000,
        'potato': 75000,
    }
};

const _FALLBACK_SUM_INSURED = 40000;

/**
 * Normalizes input text for lookup
 */
function _Normalize(text) {
    if (!text) return '';
    return text.trim().toLowerCase().replace(/[^a-z ]/g, '');
}

/**
 * Determine if a crop is Kharif, Rabi, or Commercial based on keywords
 */
function _Determine_Season(cropName) {
    const _Normalized = _Normalize(cropName);

    const _Commercial = ['cotton', 'sugarcane', 'onion', 'potato', 'banana', 'mango', 'spices', 'tobacco'];
    const _Kharif = ['rice', 'paddy', 'soybean', 'groundnut', 'maize', 'bajra', 'jowar', 'tur', 'arhar', 'urad'];
    const _Rabi = ['wheat', 'barley', 'mustard', 'gram', 'chana', 'peas'];

    if (_Commercial.some(c => _Normalized.includes(c))) return 'COMMERCIAL';
    if (_Rabi.some(c => _Normalized.includes(c))) return 'RABI';
    // Defaulting to Kharif for standard food crops if unknown
    return 'KHARIF';
}

/**
 * Calculates the total PMFBY Premium details
 * @param {string} state - The farmer's state
 * @param {string} crop - The crop name
 * @param {number} areaHectares - Total land area cultivated in hectares
 * @returns {Object} Premium breakdown including sum insured, farmer share, and govt subsidy
 */
function _Calculate_Premium(state, crop, areaHectares) {
    const _State_Norm = _Normalize(state);
    const _Crop_Norm = _Normalize(crop);

    // Find matching state or fallback
    let _State_Matches = Object.keys(_MOCK_SUM_INSURED).filter(s => _State_Norm.includes(s) || s.includes(_State_Norm));
    let _Sum_Insured_Per_Ha = _FALLBACK_SUM_INSURED;

    if (_State_Matches.length > 0) {
        const _State_Data = _MOCK_SUM_INSURED[_State_Matches[0]];
        // Find matching crop or fallback
        const _Crop_Matches = Object.keys(_State_Data).filter(c => _Crop_Norm.includes(c) || c.includes(_Crop_Norm));
        if (_Crop_Matches.length > 0) {
            _Sum_Insured_Per_Ha = _State_Data[_Crop_Matches[0]];
        }
    }

    const _Season = _Determine_Season(crop);
    const _Rate = _PMFBY_RATES[_Season];

    const _Total_Sum_Insured = Math.round(_Sum_Insured_Per_Ha * areaHectares);
    const _Farmer_Premium = Math.round(_Total_Sum_Insured * _Rate);

    // Actuarial (Total) Premium is generally around 10-15% of Sum Insured depending on risk.
    // For this demonstration, we'll assume an average Actuarial Premium of 12%.
    // Government Subsidy = Total Actuarial Premium - Farmer Premium
    const _Actuarial_Rate = 0.12;
    const _Total_Premium = Math.round(_Total_Sum_Insured * _Actuarial_Rate);
    const _Govt_Subsidy = Math.max(0, _Total_Premium - _Farmer_Premium);

    return {
        state: _State_Matches.length > 0 ? _State_Matches[0] : _State_Norm,
        crop: _Crop_Norm,
        season: _Season,
        areaHectares: areaHectares,
        sumInsuredPerHectare: _Sum_Insured_Per_Ha,
        totalSumInsured: _Total_Sum_Insured,
        farmerPremiumRate: (_Rate * 100).toFixed(1) + '%',
        farmerPremiumAmount: _Farmer_Premium,
        govtSubsidyAmount: _Govt_Subsidy,
        totalPremiumCost: _Total_Premium
    };
}

module.exports = {
    _Calculate_Premium,
    _Determine_Season
};
