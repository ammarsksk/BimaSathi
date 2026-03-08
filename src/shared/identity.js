const { _Document_Types } = require('./constants');

const _NAME_KEY_PATTERNS = [
    'name',
    'full name',
    'farmer name',
    'name of farmer',
    'applicant name',
    'insured name',
    'name of insured',
    'claimant name',
    'customer name',
    'account holder',
    'card holder',
    'beneficiary name',
    'owner name',
    'name as per',
    'name on card',
];

const _NAME_COMPONENT_KEY_PATTERNS = [
    'first name',
    'middle name',
    'last name',
    'surname',
    'given name',
    'family name',
];

const _IGNORED_NAME_WORDS = new Set([
    'mr', 'mrs', 'ms', 'miss', 'shri', 'sri', 'smt', 'kumari', 'km',
    'name', 'farmer', 'insured', 'applicant', 'claimant', 'customer',
    'holder', 'government', 'india', 'of', 'dob', 'birth', 'year',
    'male', 'female', 'sex', 'address', 'uidai', 'aadhaar', 'account',
    'department', 'income', 'tax', 'govt', 'permanent', 'number',
    'signature', 'authority', 'card',
]);

const _IGNORED_LINE_PATTERNS = [
    /\bgovernment\b/i,
    /\bindia\b/i,
    /\bgovt\b/i,
    /\bincome tax\b/i,
    /\bdepartment\b/i,
    /\baddress\b/i,
    /\bdob\b/i,
    /\byear of birth\b/i,
    /\bmale\b/i,
    /\bfemale\b/i,
    /\buidai\b/i,
    /\baadhaar\b/i,
    /\baccount\b/i,
    /\bifsc\b/i,
    /\bbranch\b/i,
    /\bdistrict\b/i,
    /\bstate\b/i,
    /\bclaim\b/i,
    /\bpolicy\b/i,
    /\bpermanent account number\b/i,
    /\bsignature\b/i,
    /\bincome tax department\b/i,
    /\bgovt of india\b/i,
    /\bgovernment of india\b/i,
];

function _Normalize_Name(_Name) {
    return String(_Name || '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function _Tokenize_Name(_Name) {
    return _Normalize_Name(_Name)
        .split(' ')
        .filter(Boolean)
        .filter((_Token) => !_IGNORED_NAME_WORDS.has(_Token));
}

function _Looks_Like_Person_Name(_Value) {
    const _Raw = String(_Value || '').trim();
    if (_Raw.length < 5 || _Raw.length > 60) return false;
    if ((_Raw.match(/\d/g) || []).length > 0) return false;
    if (_IGNORED_LINE_PATTERNS.some((_Pattern) => _Pattern.test(_Raw))) return false;
    const _Tokens = _Tokenize_Name(_Raw);
    return _Tokens.length >= 2 && _Tokens.length <= 5;
}

function _Looks_Like_Name_Fragment(_Value) {
    const _Raw = String(_Value || '').trim();
    if (_Raw.length < 2 || _Raw.length > 40) return false;
    if ((_Raw.match(/\d/g) || []).length > 0) return false;
    if (_IGNORED_LINE_PATTERNS.some((_Pattern) => _Pattern.test(_Raw))) return false;
    const _Tokens = _Tokenize_Name(_Raw);
    return _Tokens.length >= 1 && _Tokens.length <= 3;
}

function _Compare_Names(_Claimed_Name, _Extracted_Name) {
    const _Claimed = _Tokenize_Name(_Claimed_Name);
    const _Extracted = _Tokenize_Name(_Extracted_Name);

    if (!_Claimed.length || !_Extracted.length) {
        return { level: 'missing', score: 0, commonTokens: [] };
    }

    const _Claimed_Set = new Set(_Claimed);
    const _Common = _Extracted.filter((_Token) => _Claimed_Set.has(_Token));
    const _Common_Count = new Set(_Common).size;
    const _Max_Len = Math.max(_Claimed.length, _Extracted.length);
    const _Min_Len = Math.min(_Claimed.length, _Extracted.length);
    const _Exact = _Claimed.join(' ') === _Extracted.join(' ');
    const _Coverage = _Min_Len > 0 ? _Common_Count / _Min_Len : 0;
    const _Score = _Max_Len > 0 ? _Common_Count / _Max_Len : 0;

    if (_Exact) return { level: 'exact', score: 1, commonTokens: [...new Set(_Common)] };
    if (_Coverage === 1 && _Score >= 0.67) return { level: 'strong', score: 0.9, commonTokens: [...new Set(_Common)] };
    if (_Score >= 0.67 && _Common_Count >= 2) return { level: 'strong', score: _Score, commonTokens: [...new Set(_Common)] };
    if (_Score >= 0.5 && _Common_Count >= 1) return { level: 'weak', score: _Score, commonTokens: [...new Set(_Common)] };
    return { level: 'mismatch', score: _Score, commonTokens: [...new Set(_Common)] };
}

function _Score_Name_Candidate(_Candidate, _Claimed_Name) {
    const _Value = String(_Candidate || '').trim();
    if (!_Looks_Like_Person_Name(_Value)) return -1;

    let _Score = 40;
    const _Tokens = _Tokenize_Name(_Value);
    _Score += Math.min(_Tokens.length * 5, 20);

    if (_Claimed_Name) {
        const _Match = _Compare_Names(_Claimed_Name, _Value);
        _Score += Math.round(_Match.score * 60);
    }

    return _Score;
}

function _Is_Name_Key(_Key) {
    return _NAME_KEY_PATTERNS.some((_Pattern) => _Key.includes(_Pattern));
}

function _Is_Name_Component_Key(_Key) {
    return _NAME_COMPONENT_KEY_PATTERNS.some((_Pattern) => _Key.includes(_Pattern));
}

function _Extract_Name_Candidates_From_Key_Values(_Key_Values = [], _Claimed_Name = '') {
    const _Candidates = [];
    const _Components = [];

    for (const _KV of _Key_Values || []) {
        const _Key = _Normalize_Name(_KV?.key || '');
        const _Value = String(_KV?.value || '').trim();
        if (!_Value) continue;

        if (_Is_Name_Key(_Key)) {
            const _Base_Score = _Score_Name_Candidate(_Value, _Claimed_Name);
            if (_Base_Score > 0) {
                _Candidates.push({ name: _Value, score: _Base_Score + 25, source: 'key_values', key: _KV?.key || null });
            }
            continue;
        }

        if (_Is_Name_Component_Key(_Key) && _Looks_Like_Name_Fragment(_Value)) {
            _Components.push(_Value);
        }
    }

    if (_Components.length >= 2) {
        const _Combined = _Components.join(' ');
        const _Base_Score = _Score_Name_Candidate(_Combined, _Claimed_Name);
        if (_Base_Score > 0) {
            _Candidates.push({ name: _Combined, score: _Base_Score + 35, source: 'key_values_combined', key: 'name_components' });
        }
    }

    return _Candidates;
}

function _Extract_Name_Candidates_From_Text(_Text = '', _Document_Type, _Claimed_Name = '') {
    const _Lines = String(_Text || '')
        .split(/\r?\n/)
        .map((_Line) => _Line.trim())
        .filter(Boolean)
        .slice(0, 80);

    const _Candidates = [];

    for (let _Index = 0; _Index < _Lines.length; _Index += 1) {
        const _Line = _Lines[_Index];
        const _Score = _Score_Name_Candidate(_Line, _Claimed_Name);
        if (_Score <= 0) continue;

        let _Bonus = 0;
        const _Prev = _Lines[_Index - 1] || '';
        const _Next = _Lines[_Index + 1] || '';

        if (_Document_Type === _Document_Types.AADHAAR_OR_ID) {
            if (/\bdob\b|\byear of birth\b|\bmale\b|\bfemale\b|\bsignature\b/i.test(_Prev) || /\bdob\b|\byear of birth\b|\bmale\b|\bfemale\b|\bsignature\b/i.test(_Next)) {
                _Bonus += 20;
            }
        }

        if (_Document_Type === _Document_Types.LAND_RECORD && /\bfather\b|\bowner\b|\bholder\b/i.test(_Prev)) {
            _Bonus += 10;
        }

        _Candidates.push({ name: _Line, score: _Score + _Bonus, source: 'extracted_text', lineNumber: _Index + 1 });
    }

    return _Candidates;
}

function _Comparison_Rank(_Level) {
    return {
        exact: 4,
        strong: 3,
        weak: 2,
        mismatch: 1,
        missing: 0,
    }[_Level] || 0;
}

function _Decorate_Candidate(_Candidate, _Claimed_Name) {
    const _Comparison = _Claimed_Name
        ? _Compare_Names(_Claimed_Name, _Candidate.name)
        : { level: 'missing', score: 0, commonTokens: [] };
    return {
        ..._Candidate,
        comparison: _Comparison,
    };
}

function _Unique_Name_Candidates(_Candidates = []) {
    const _Map = new Map();
    for (const _Candidate of _Candidates) {
        if (!_Candidate?.name) continue;
        const _Key = _Normalize_Name(_Candidate.name);
        if (!_Key) continue;
        const _Current = _Map.get(_Key);
        if (!_Current || (_Candidate.score || 0) > (_Current.score || 0)) {
            _Map.set(_Key, _Candidate);
        }
    }
    return [..._Map.values()];
}

function _Extract_Name_Candidates_From_Document(_Doc = {}) {
    const _Claimed_Name = String(_Doc.claimedName || '').trim();
    return _Unique_Name_Candidates([
        ..._Extract_Name_Candidates_From_Key_Values(_Doc.keyValues, _Claimed_Name),
        ..._Extract_Name_Candidates_From_Text(_Doc.extractedText, _Doc.documentType, _Claimed_Name),
    ]).map((_Candidate) => _Decorate_Candidate(_Candidate, _Claimed_Name));
}

function _Extract_Name_From_Document(_Doc = {}) {
    const _Claimed_Name = String(_Doc.claimedName || '').trim();
    const _Candidates = _Extract_Name_Candidates_From_Document(_Doc);
    _Candidates.sort((_A, _B) => {
        if (_Claimed_Name) {
            const _Rank_Diff = _Comparison_Rank(_B.comparison?.level) - _Comparison_Rank(_A.comparison?.level);
            if (_Rank_Diff !== 0) return _Rank_Diff;
            const _Match_Diff = (_B.comparison?.score || 0) - (_A.comparison?.score || 0);
            if (_Match_Diff !== 0) return _Match_Diff;
        }
        return (_B.score || 0) - (_A.score || 0);
    });
    return _Candidates[0] || null;
}

function _Is_Trusted_Name_Document(_Document_Type) {
    return _Document_Type === _Document_Types.AADHAAR_OR_ID || _Document_Type === _Document_Types.LAND_RECORD;
}

function _Is_Close_Enough_Trusted_Match(_Candidate) {
    const _Comparison = _Candidate?.comparison || {};
    const _Common_Count = Array.isArray(_Comparison.commonTokens) ? _Comparison.commonTokens.length : 0;
    const _Score = Number(_Comparison.score || 0);
    return _Comparison.level === 'weak' && _Common_Count >= 2 && _Score >= 0.6;
}

function _Assess_Name_Verification(_Input = {}) {
    const _Claimed_Name = String(_Input.claimedName || '').trim();
    const _Candidates = _Extract_Name_Candidates_From_Document(_Input);
    const _Strong_Candidate = _Candidates
        .filter((_Candidate) => ['exact', 'strong'].includes(_Candidate.comparison?.level))
        .sort((_A, _B) => (_B.comparison?.score || 0) - (_A.comparison?.score || 0) || (_B.score || 0) - (_A.score || 0))[0] || null;
    const _Weak_Candidate = _Candidates
        .filter((_Candidate) => _Candidate.comparison?.level === 'weak')
        .sort((_A, _B) => (_B.comparison?.score || 0) - (_A.comparison?.score || 0) || (_B.score || 0) - (_A.score || 0))[0] || null;
    const _Mismatch_Candidate = _Candidates
        .filter((_Candidate) => _Candidate.comparison?.level === 'mismatch')
        .sort((_A, _B) => (_B.score || 0) - (_A.score || 0))[0] || null;
    const _Candidate = _Strong_Candidate || _Weak_Candidate || _Mismatch_Candidate || _Candidates[0] || null;
    const _Extracted_Name = _Candidate?.name || null;
    const _Trusted_Source = _Is_Trusted_Name_Document(_Input.documentType);
    const _Comparison = _Candidate?.comparison || (_Extracted_Name ? _Compare_Names(_Claimed_Name, _Extracted_Name) : { level: 'missing', score: 0, commonTokens: [] });

    let _Status = 'unverified';
    let _Verified = false;
    let _Needs_Government_Id = false;
    let _Review_Required = false;

    if (!_Claimed_Name) {
        _Status = 'claim_name_missing';
    } else if (!_Extracted_Name) {
        _Status = 'no_name_found';
        _Needs_Government_Id = true;
    } else if (_Strong_Candidate) {
        if (_Trusted_Source) {
            _Status = 'verified';
            _Verified = true;
        } else {
            _Status = 'matched_supporting_document';
            _Needs_Government_Id = true;
        }
    } else if (_Weak_Candidate) {
        if (_Trusted_Source && _Is_Close_Enough_Trusted_Match(_Weak_Candidate)) {
            _Status = 'verified';
            _Verified = true;
        } else {
            _Status = 'review_required';
            _Needs_Government_Id = true;
            _Review_Required = true;
        }
    } else if (_Mismatch_Candidate && (_Mismatch_Candidate.score || 0) >= 70) {
        _Status = 'mismatch';
        _Needs_Government_Id = true;
        _Review_Required = true;
    } else {
        _Status = 'no_name_found';
        _Needs_Government_Id = true;
    }

    return {
        status: _Status,
        verified: _Verified,
        reviewRequired: _Review_Required,
        needsGovernmentId: _Needs_Government_Id,
        trustedSource: _Trusted_Source,
        claimedName: _Claimed_Name || null,
        extractedName: _Extracted_Name,
        normalizedClaimedName: _Normalize_Name(_Claimed_Name) || null,
        normalizedExtractedName: _Normalize_Name(_Extracted_Name) || null,
        matchScore: _Comparison.score || 0,
        matchType: _Comparison.level,
        commonTokens: _Comparison.commonTokens || [],
        sourceDocumentType: _Input.documentType || null,
        sourceDocumentKey: _Input.sourceDocumentKey || null,
        extractionSource: _Candidate?.source || null,
        extractionHint: _Candidate?.key || _Candidate?.lineNumber || null,
        candidateNames: _Candidates.slice(0, 5).map((_Candidate_Value) => ({
            name: _Candidate_Value.name,
            source: _Candidate_Value.source,
            hint: _Candidate_Value.key || _Candidate_Value.lineNumber || null,
            score: _Candidate_Value.score || 0,
            matchType: _Candidate_Value.comparison?.level || 'missing',
            matchScore: _Candidate_Value.comparison?.score || 0,
        })),
        updatedAt: new Date().toISOString(),
    };
}

function _Merge_Identity_Verification(_Current, _Incoming) {
    if (!_Incoming) return _Current || null;
    if (!_Current) return _Incoming;
    if (_Current.verified) return _Current;
    if (_Incoming.verified) return _Incoming;

    const _Rank = {
        matched_supporting_document: 5,
        review_required: 4,
        mismatch: 3,
        no_name_found: 2,
        claim_name_missing: 1,
        unverified: 0,
        claim_name_changed: 0,
    };

    if ((_Rank[_Incoming.status] || 0) !== (_Rank[_Current.status] || 0)) {
        return (_Rank[_Incoming.status] || 0) > (_Rank[_Current.status] || 0) ? _Incoming : _Current;
    }

    if ((_Incoming.matchScore || 0) !== (_Current.matchScore || 0)) {
        return (_Incoming.matchScore || 0) > (_Current.matchScore || 0) ? _Incoming : _Current;
    }

    return _Incoming;
}

function _Reset_Identity_Verification(_Claimed_Name) {
    return {
        status: 'claim_name_changed',
        verified: false,
        reviewRequired: false,
        needsGovernmentId: true,
        trustedSource: false,
        claimedName: String(_Claimed_Name || '').trim() || null,
        extractedName: null,
        normalizedClaimedName: _Normalize_Name(_Claimed_Name) || null,
        normalizedExtractedName: null,
        matchScore: 0,
        matchType: 'missing',
        commonTokens: [],
        sourceDocumentType: null,
        sourceDocumentKey: null,
        extractionSource: null,
        extractionHint: null,
        updatedAt: new Date().toISOString(),
    };
}

module.exports = {
    _Normalize_Name,
    _Compare_Names,
    _Extract_Name_From_Document,
    _Assess_Name_Verification,
    _Merge_Identity_Verification,
    _Reset_Identity_Verification,
    _Is_Trusted_Name_Document,
};
