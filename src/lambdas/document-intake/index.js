/**
 * BimaSathi — Document Intake & Classification Agent (Agent 1)
 * 
 * Processes incoming documents (PDFs, scanned images, ID cards, passbooks):
 *   1. Accept multimodal input from conversation engine
 *   2. Upload to S3 under the claim's documents folder
 *   3. Extract text using Amazon Textract
 *   4. Extract key-value pairs for form documents
 *   5. Classify document type via Bedrock AI (7 categories)
 *   6. Store classification + extracted data in DynamoDB
 *   7. Return classification + extracted text for downstream agents
 */

const _DB = require('../../shared/dynamodb');
const _S3 = require('../../shared/s3');
const _Textract = require('../../shared/textract');
const _WhatsApp = require('../../shared/whatsapp');
const _Identity = require('../../shared/identity');
const { _Document_Types } = require('../../shared/constants');
const { RekognitionClient, DetectModerationLabelsCommand } = require('@aws-sdk/client-rekognition');

const _Rekognition = new RekognitionClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const _Bucket = process.env.EVIDENCE_BUCKET || 'bimasathi-evidence';


exports.handler = async (_Event) => {
    const _Claim_Id = _Event.claimId;
    const _User_Id = _Event.userId;
    const _Media_Data = _Event.mediaData;       // { url, contentType }
    const _Language = _Event.language || 'hi';
    const _Context = _Event.context || {};

    console.log(`Document Intake: claimId=${_Claim_Id}, type=${_Media_Data?.contentType}`);

    try {
        if (!_Claim_Id || !_Media_Data?.id) {
            return _Error_Response('Missing claimId or media data');
        }

        const _Claim = await _DB._Get_Claim_By_Id(_Claim_Id);
        if (!_Claim?.farmerName) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: false,
                    reason: 'Please complete the farmer name first before uploading identity documents.',
                }),
            };
        }

        // ── Step 1: Download the document from Meta ──
        const { buffer: _Buffer, contentType: _Content_Type } = await _WhatsApp._Download_Media(_Media_Data.id);
        console.log(`Downloaded document: ${_Buffer?.length || 0} bytes, type=${_Content_Type || 'unknown'}`);

        if (!_Buffer || _Buffer.length === 0) {
            return _Error_Response('Unable to download document from Meta.');
        }

        // ── Step 2: Determine document category (image vs PDF) ──
        const _Is_Image = _Content_Type.startsWith('image/');
        const _Is_PDF = _Content_Type.includes('pdf');
        const _Doc_Index = _Context.documentIndex || ((_Context.documentCount || 0) + 1);

        // ── Step 4: Content moderation check (images only) ──
        if (_Is_Image) {
            const _Mod_Result = await _Check_Content_Moderation(_Buffer);
            if (_Mod_Result.flagged) {
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        success: false,
                        reason: 'Content moderation flagged inappropriate content',
                        moderationLabels: _Mod_Result.labels,
                    }),
                };
            }
        }

        // ── Step 5: Extract text using Textract ──
        const _Extracted_Text = await _Textract._Extract_Text(_Buffer);
        console.log(`Extracted text: ${_Extracted_Text.substring(0, 200)}...`);

        // ── Step 6: Extract key-value pairs (for structured forms) ──
        let _Key_Values = [];
        if (_Extracted_Text.length > 50) {
            _Key_Values = await _Textract._Extract_Key_Values(_Buffer);
            console.log(`Extracted ${_Key_Values.length} key-value pairs`);
        }

        // ── Step 7: Classify document type via Bedrock AI ──
        let _Classification = _Document_Types.UNKNOWN;
        if (_Extracted_Text.length > 10) {
            _Classification = await _Textract._Classify_Document(_Extracted_Text);
        } else if (_Is_Image) {
            // Minimal text on an image → likely a crop loss photo
            _Classification = _Document_Types.CROP_LOSS_PHOTO;
        }
        console.log(`Classification: ${_Classification}`);

        // ── Step 8: Verify farmer name from the uploaded document ──
        const _Identity_Result = _Identity._Assess_Name_Verification({
            claimedName: _Claim?.farmerName || null,
            keyValues: _Key_Values,
            extractedText: _Extracted_Text,
            documentType: _Classification,
            sourceDocumentKey: null,
        });
        const _Accepted_For_Upload = ['verified', 'matched_supporting_document'].includes(_Identity_Result.status);
        const _Fields_Found = _Format_Extracted_Fields(_Key_Values, _Identity_Result, _Extracted_Text);
        console.log(`Identity verification: status=${_Identity_Result.status}, extractedName=${_Identity_Result.extractedName || 'none'}, accepted=${_Accepted_For_Upload ? 'true' : 'false'}`);

        if (!_Accepted_For_Upload) {
            await _DB._Log_Audit({
                claimId: _Claim_Id,
                actor: _User_Id,
                action: 'document_rejected_preupload',
                metadata: {
                    classification: _Classification,
                    identityStatus: _Identity_Result.status,
                    identityCandidate: _Identity_Result.extractedName || null,
                    fieldsFound: _Fields_Found,
                },
            }).catch(() => null);

            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    accepted: false,
                    classification: _Classification,
                    documentType: _Classification,
                    reason: _Build_Rejection_Reason(_Identity_Result, _Claim),
                    identityVerification: _Identity_Result,
                    identityCandidate: _Identity_Result.extractedName || null,
                    identityCandidates: (_Identity_Result.candidateNames || []).slice(0, 5),
                    fieldsFound: _Fields_Found,
                }),
            };
        }

        // ── Step 9: Upload accepted documents to S3 ──
        let _S3_Key;
        if (_Is_Image) {
            const _Ext = _Content_Type.includes('png') ? 'png' : _Content_Type.includes('webp') ? 'webp' : 'jpg';
            _S3_Key = `claims/${_Claim_Id}/documents/doc_${String(_Doc_Index).padStart(3, '0')}.${_Ext}`;
        } else if (_Is_PDF) {
            _S3_Key = `claims/${_Claim_Id}/documents/doc_${String(_Doc_Index).padStart(3, '0')}.pdf`;
        } else {
            _S3_Key = `claims/${_Claim_Id}/documents/doc_${String(_Doc_Index).padStart(3, '0')}.bin`;
        }

        const _Filename = _S3_Key.split('/').pop();
        await _S3._Upload_Document(_Claim_Id, _Filename, _Buffer, _Content_Type || 'application/octet-stream');
        console.log(`Uploaded to S3: ${_S3_Key}`);

        const _Stored_Identity = { ..._Identity_Result, sourceDocumentKey: _S3_Key };
        const _Merged_Identity = _Identity._Merge_Identity_Verification(_Claim?.identityVerification || null, _Stored_Identity);

        // ── Step 10: Store document metadata in DynamoDB ──
        await _DB._Store_Document_Metadata(_Claim_Id, _User_Id, {
            type: _Classification,
            s3Key: _S3_Key,
            extractedText: _Extracted_Text.substring(0, 5000),  // Cap at 5KB for DynamoDB
            keyValues: _Key_Values.slice(0, 50),  // Cap at 50 fields
            contentType: _Content_Type,
            sizeBytes: _Buffer.length,
            identityCandidate: _Stored_Identity.extractedName || null,
            identityCandidates: (_Identity_Result.candidateNames || []).slice(0, 5),
            identityVerification: _Stored_Identity,
            fieldsFound: _Fields_Found,
        });

        if (_User_Id) {
            await _DB._Update_Claim(_Claim_Id, _User_Id, {
                identityVerification: _Merged_Identity,
            });
        }

        // ── Step 11: Audit log ──
        await _DB._Log_Audit({
            claimId: _Claim_Id,
            actor: _User_Id,
            action: 'document_received',
            metadata: {
                classification: _Classification,
                s3Key: _S3_Key,
                keyValueCount: _Key_Values.length,
                identityStatus: _Stored_Identity.status,
                identityCandidate: _Stored_Identity.extractedName || null,
                identityCandidates: (_Identity_Result.candidateNames || []).slice(0, 3),
                fieldsFound: _Fields_Found,
            },
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                classification: _Classification,
                documentType: _Classification,
                s3Key: _S3_Key,
                extractedText: _Extracted_Text,
                keyValues: _Key_Values,
                documentIndex: _Doc_Index,
                accepted: true,
                identityVerification: _Merged_Identity,
                identityCandidate: _Stored_Identity.extractedName || null,
                identityCandidates: (_Identity_Result.candidateNames || []).slice(0, 5),
                fieldsFound: _Fields_Found,
            }),
        };

    } catch (_Error) {
        console.error('Document intake error:', _Error.message, _Error.stack);
        return _Error_Response(_Error.message);
    }
};


// ═════════════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ═════════════════════════════════════════════════════════════

/**
 * Check image content using Rekognition moderation
 * @param {Buffer} _Buffer — image data
 * @returns {{ flagged: boolean, labels: string[] }}
 */
async function _Check_Content_Moderation(_Buffer) {
    try {
        const _Response = await _Rekognition.send(new DetectModerationLabelsCommand({
            Image: { Bytes: _Buffer },
            MinConfidence: 70,
        }));

        const _Labels = (_Response.ModerationLabels || []).map(_L => _L.Name);
        const _Blocked = ['Explicit Nudity', 'Violence', 'Drugs', 'Tobacco', 'Alcohol'];
        const _Flagged = _Labels.some(_L => _Blocked.some(_B => _L.includes(_B)));

        return { flagged: _Flagged, labels: _Labels };
    } catch (_Error) {
        console.error('Content moderation check failed:', _Error.message);
        return { flagged: false, labels: [] };
    }
}

function _Error_Response(_Message) {
    return {
        statusCode: 500,
        body: JSON.stringify({ success: false, reason: _Message }),
    };
}

function _Build_Rejection_Reason(_Identity_Result, _Claim) {
    if (_Identity_Result?.status === 'mismatch') {
        return `The name on this document${_Identity_Result.extractedName ? ` looks like "${_Identity_Result.extractedName}"` : ''}, which does not match the farmer name already entered${_Claim?.farmerName ? ` ("${_Claim.farmerName}")` : ''}. Please upload another photo of the correct document.`;
    }
    if (_Identity_Result?.status === 'review_required') {
        return 'I found a possible name on this document, but it is not clear enough to match the farmer name already entered. Please upload another clearer photo.';
    }
    return 'I could not find a clear farmer name in this document. Please upload another clearer photo.';
}

function _Format_Extracted_Fields(_Key_Values = [], _Identity_Result = {}, _Extracted_Text = '') {
    const _Fields = [];

    for (const _KV of _Key_Values || []) {
        const _Key = String(_KV?.key || '').trim();
        const _Value = String(_KV?.value || '').trim();
        if (!_Key || !_Value) continue;
        _Fields.push({ key: _Key, value: _Value });
    }

    if (!_Fields.length) {
        const _Lines = String(_Extracted_Text || '')
            .split(/\r?\n/)
            .map((_Line) => _Line.trim())
            .filter(Boolean)
            .slice(0, 8);
        for (let _Index = 0; _Index < _Lines.length; _Index += 1) {
            _Fields.push({ key: `Line ${_Index + 1}`, value: _Lines[_Index] });
        }
    }

    for (const _Candidate of _Identity_Result?.candidateNames || []) {
        if (_Fields.some((_Field) => _Field.value === _Candidate.name)) continue;
        _Fields.push({ key: `Candidate ${_Candidate.hint || _Candidate.source || 'name'}`, value: _Candidate.name });
    }

    return _Fields.slice(0, 10);
}
