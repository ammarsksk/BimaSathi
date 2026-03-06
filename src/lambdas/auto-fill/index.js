/**
 * BimaSathi — Auto-Fill & Cross-Reference Agent (Agent 4)
 * 
 * Cross-references extracted document data against pending form fields:
 *   1. Load all stored documents for the claim
 *   2. Load current pending fields from form schema
 *   3. Use Bedrock AI for semantic matching with confidence scoring
 *   4. Apply high-confidence matches (>= 0.75) as auto-filled
 *   5. Flag medium-confidence matches (0.5–0.75) for human review
 *   6. Update form schema so the conversation engine skips auto-filled fields
 */

const _DB = require('../../shared/dynamodb');
const _Bedrock = require('../../shared/bedrock');
const { _Field_Status } = require('../../shared/constants');


exports.handler = async (_Event) => {
    const _Claim_Id = _Event.claimId;
    const _User_Id = _Event.userId;

    console.log(`Auto-Fill Agent: claimId=${_Claim_Id}`);

    try {
        if (!_Claim_Id || !_User_Id) {
            return _Error_Response('Missing claimId or userId');
        }

        // ── Step 1: Load claim and its form schema ──
        const _Claim = await _DB._Get_Claim_By_Id(_Claim_Id);
        if (!_Claim?.formSchema) {
            return _Error_Response('No form schema found on claim');
        }

        // ── Step 2: Get pending fields ──
        const _Pending = _Claim.formSchema.filter(_F => _F.status === _Field_Status.PENDING);
        if (_Pending.length === 0) {
            console.log('No pending fields — all fields are already filled');
            return {
                statusCode: 200,
                body: JSON.stringify({ success: true, autoFilledCount: 0, flaggedCount: 0 }),
            };
        }

        // ── Step 3: Collect all extracted document data ──
        const _Docs = _Claim.documentsReceived || [];
        if (_Docs.length === 0) {
            console.log('No documents received yet — nothing to cross-reference');
            return {
                statusCode: 200,
                body: JSON.stringify({ success: true, autoFilledCount: 0, flaggedCount: 0 }),
            };
        }

        // Flatten all key-value pairs and extracted text segments
        const _Document_Data = [];
        for (const _Doc of _Docs) {
            // Include structured key-values
            if (_Doc.keyValues) {
                for (const _KV of _Doc.keyValues) {
                    _Document_Data.push({
                        key: _KV.key,
                        value: _KV.value,
                        source: _Doc.type,
                        documentKey: _Doc.s3Key,
                    });
                }
            }
            // Include extracted text as a context block
            if (_Doc.extractedText && _Doc.extractedText.length > 20) {
                _Document_Data.push({
                    key: `full_text_from_${_Doc.type}`,
                    value: _Doc.extractedText.substring(0, 2000),
                    source: _Doc.type,
                    documentKey: _Doc.s3Key,
                });
            }
        }

        // ── Step 4: Use Bedrock AI for semantic matching ──
        console.log(`Matching ${_Pending.length} pending fields against ${_Document_Data.length} data points`);
        const _Matches = await _Bedrock._Auto_Fill_Fields(_Pending, _Document_Data);

        // ── Step 5: Apply matches by confidence level ──
        let _Auto_Filled_Count = 0;
        let _Flagged_Count = 0;
        const _Updated_Schema = [..._Claim.formSchema];

        for (const _Match of _Matches) {
            const _Idx = _Updated_Schema.findIndex(_F => _F.field_name === _Match.field_name);
            if (_Idx < 0) continue;
            if (_Updated_Schema[_Idx].status !== _Field_Status.PENDING) continue;

            if (_Match.confidence >= 0.75) {
                // High confidence → auto-fill
                _Updated_Schema[_Idx] = {
                    ..._Updated_Schema[_Idx],
                    status: _Field_Status.AUTO_FILLED,
                    value: _Match.value,
                    source: _Match.source,
                    autoFillConfidence: _Match.confidence,
                };
                _Auto_Filled_Count++;
                console.log(`Auto-filled ${_Match.field_name} = "${_Match.value}" (confidence: ${_Match.confidence})`);
            } else if (_Match.confidence >= 0.5) {
                // Medium confidence → flag for review but still fill
                _Updated_Schema[_Idx] = {
                    ..._Updated_Schema[_Idx],
                    status: _Field_Status.AUTO_FILLED,
                    value: _Match.value,
                    source: _Match.source,
                    autoFillConfidence: _Match.confidence,
                    needsReview: true,
                };
                _Flagged_Count++;
                console.log(`Flagged for review: ${_Match.field_name} = "${_Match.value}" (confidence: ${_Match.confidence})`);
            }
        }

        // ── Step 6: Store updated schema ──
        if (_Auto_Filled_Count > 0 || _Flagged_Count > 0) {
            await _DB._Update_Form_Schema(_Claim_Id, _User_Id, _Updated_Schema);
        }

        // ── Step 7: Audit log ──
        await _DB._Log_Audit({
            claimId: _Claim_Id,
            actor: 'auto-fill-agent',
            action: 'auto_fill_completed',
            metadata: {
                pendingBefore: _Pending.length,
                autoFilled: _Auto_Filled_Count,
                flaggedForReview: _Flagged_Count,
                documentsAnalyzed: _Docs.length,
            },
        });

        // ── Step 8: Return summary ──
        const _Remaining_Pending = _Updated_Schema.filter(_F =>
            _F.is_required && _F.status === _Field_Status.PENDING
        ).length;

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                autoFilledCount: _Auto_Filled_Count,
                flaggedCount: _Flagged_Count,
                remainingPending: _Remaining_Pending,
                totalFields: _Updated_Schema.length,
            }),
        };

    } catch (_Error) {
        console.error('Auto-fill error:', _Error.message, _Error.stack);
        return _Error_Response(_Error.message);
    }
};


function _Error_Response(_Message) {
    return {
        statusCode: 500,
        body: JSON.stringify({ success: false, reason: _Message }),
    };
}
