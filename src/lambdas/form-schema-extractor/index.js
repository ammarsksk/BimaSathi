/**
 * BimaSathi — Form Schema Extraction Agent (Agent 2)
 * 
 * Analyzes received documents to build a form field schema:
 *   1. Check if an insurance form template was received → extract fields via Bedrock
 *   2. If no template → use default PMFBY form schema
 *   3. Cross-reference extracted data from other documents (Aadhaar, passbook)
 *   4. Pre-fill matching fields with data already extracted
 *   5. Store completed schema on the claim record in DynamoDB
 */

const _DB = require('../../shared/dynamodb');
const _Bedrock = require('../../shared/bedrock');
const { _Default_PMFBY_Schema, _Field_Status, _Document_Types } = require('../../shared/constants');


exports.handler = async (_Event) => {
    const _Claim_Id = _Event.claimId;
    const _User_Id = _Event.userId;
    const _Document_Data = _Event.documentData || {};  // Output from Agent 1

    console.log(`Form Schema Extractor: claimId=${_Claim_Id}, docType=${_Document_Data.classification}`);

    try {
        if (!_Claim_Id || !_User_Id) {
            return _Error_Response('Missing claimId or userId');
        }

        // ── Step 1: Determine whether to extract schema from doc or use default ──
        let _Schema = [];
        const _Classification = _Document_Data.classification;

        if (_Classification === _Document_Types.INSURANCE_FORM_TEMPLATE ||
            _Classification === _Document_Types.POLICY_DOCUMENT) {
            // Attempt to extract form schema from the document text
            console.log('Extracting form schema from document text...');
            const _Extracted_Schema = await _Bedrock._Extract_Form_Schema(_Document_Data.extractedText || '');

            if (_Extracted_Schema.length > 0) {
                // Enrich each field with status tracking
                _Schema = _Extracted_Schema.map(_Field => ({
                    ..._Field,
                    status: _Field_Status.PENDING,
                    value: null,
                    source: null,
                }));
                console.log(`Extracted ${_Schema.length} fields from document`);
            }
        }

        // ── Step 2: Fallback to default PMFBY schema ──
        if (_Schema.length === 0) {
            console.log('Using default PMFBY form schema');
            _Schema = _Default_PMFBY_Schema.map(_Field => ({
                ..._Field,
                status: _Field_Status.PENDING,
                value: null,
                source: null,
            }));
        }

        // ── Step 3: Pre-fill from already-collected data ──
        const _Claim = await _DB._Get_Claim_By_Id(_Claim_Id);
        if (_Claim) {
            _Schema = _Prefill_From_Claim(_Schema, _Claim);
        }

        // ── Step 4: Pre-fill from received documents ──
        const _All_Docs = _Claim?.documentsReceived || [];
        if (_All_Docs.length > 0) {
            _Schema = await _Prefill_From_Documents(_Schema, _All_Docs);
        }

        // ── Step 5: Store schema on the claim ──
        await _DB._Update_Form_Schema(_Claim_Id, _User_Id, _Schema);

        // ── Step 6: Calculate completion stats ──
        const _Completed = _Schema.filter(_F => _F.status !== _Field_Status.PENDING).length;
        const _Required_Pending = _Schema.filter(_F => _F.is_required && _F.status === _Field_Status.PENDING).length;
        const _Total_Required = _Schema.filter(_F => _F.is_required).length;

        // ── Step 7: Audit log ──
        await _DB._Log_Audit({
            claimId: _Claim_Id,
            actor: 'form-schema-extractor',
            action: 'schema_created',
            metadata: {
                totalFields: _Schema.length,
                completedFields: _Completed,
                pendingRequired: _Required_Pending,
                source: _Schema.length === _Default_PMFBY_Schema.length ? 'default_pmfby' : 'extracted_from_document',
            },
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                schema: _Schema,
                stats: {
                    totalFields: _Schema.length,
                    totalRequired: _Total_Required,
                    completedFields: _Completed,
                    requiredPending: _Required_Pending,
                },
            }),
        };

    } catch (_Error) {
        console.error('Form schema extraction error:', _Error.message, _Error.stack);
        return _Error_Response(_Error.message);
    }
};


// ═════════════════════════════════════════════════════════════
//  PRE-FILL LOGIC
// ═════════════════════════════════════════════════════════════

/**
 * Pre-fill schema fields from data already on the claim record
 * @param {Array} _Schema — form schema array
 * @param {Object} _Claim — existing claim record
 * @returns {Array} Updated schema with pre-filled fields
 */
function _Prefill_From_Claim(_Schema, _Claim) {
    const _Mapping = {
        farmer_name: _Claim.farmerName,
        village: _Claim.village,
        district: _Claim.district,
        state: _Claim.state,
        crop_type: _Claim.cropType,
        season: _Claim.season,
        loss_date: _Claim.lossDate,
        cause: _Claim.cause,
        area_hectares: _Claim.areaHectares,
        phone_number: _Claim.phoneNumber,
        policy_number: _Claim.policyType,
    };

    return _Schema.map(_Field => {
        const _Existing = _Mapping[_Field.field_name];
        if (_Existing && _Field.status === _Field_Status.PENDING) {
            return {
                ..._Field,
                status: _Field_Status.PREFILLED,
                value: _Existing,
                source: 'claim_record',
            };
        }
        return _Field;
    });
}

/**
 * Pre-fill schema fields from extracted document data using Bedrock AI
 * @param {Array} _Schema — form schema array
 * @param {Array} _Docs — array of received document metadata
 * @returns {Array} Updated schema with pre-filled fields
 */
async function _Prefill_From_Documents(_Schema, _Docs) {
    // Collect all key-values from all documents
    const _All_KV = [];
    for (const _Doc of _Docs) {
        if (_Doc.keyValues && _Doc.keyValues.length > 0) {
            for (const _KV of _Doc.keyValues) {
                _All_KV.push({
                    key: _KV.key,
                    value: _KV.value,
                    source: _Doc.type || 'document',
                    confidence: _KV.confidence || 0.5,
                });
            }
        }
    }

    if (_All_KV.length === 0) return _Schema;

    // Quick direct matching first (before AI call)
    const _Direct_Map = {
        'name': 'farmer_name', 'naam': 'farmer_name', 'applicant name': 'farmer_name',
        'aadhaar': 'aadhaar_number', 'uid': 'aadhaar_number', 'aadhaar no': 'aadhaar_number',
        'account no': 'bank_account_number', 'a/c no': 'bank_account_number', 'bank account': 'bank_account_number',
        'ifsc': 'bank_ifsc', 'ifsc code': 'bank_ifsc',
        'khasra': 'land_survey_number', 'survey no': 'land_survey_number', 'khasra no': 'land_survey_number',
        'village': 'village', 'gaon': 'village', 'gram': 'village',
        'district': 'district', 'zila': 'district',
        'state': 'state', 'rajya': 'state',
    };

    for (const _KV of _All_KV) {
        const _Key_Lower = (_KV.key || '').toLowerCase().trim();
        const _Matched_Field = _Direct_Map[_Key_Lower];
        if (_Matched_Field) {
            const _Idx = _Schema.findIndex(_F => _F.field_name === _Matched_Field && _F.status === _Field_Status.PENDING);
            if (_Idx >= 0 && _KV.value) {
                _Schema[_Idx] = {
                    ..._Schema[_Idx],
                    status: _Field_Status.PREFILLED,
                    value: _KV.value,
                    source: _KV.source,
                };
            }
        }
    }

    return _Schema;
}


function _Error_Response(_Message) {
    return {
        statusCode: 500,
        body: JSON.stringify({ success: false, reason: _Message }),
    };
}
