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
const _Twilio = require('../../shared/twilio');
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
        if (!_Claim_Id || !_Media_Data?.url) {
            return _Error_Response('Missing claimId or media data');
        }

        // ── Step 1: Download the document from Twilio ──
        const { buffer: _Buffer, contentType: _Content_Type } = await _Twilio._Download_Media(_Media_Data.url);
        console.log(`Downloaded document: ${_Buffer.length} bytes, type=${_Content_Type}`);

        // ── Step 2: Determine document category (image vs PDF) ──
        const _Is_Image = _Content_Type.startsWith('image/');
        const _Is_PDF = _Content_Type.includes('pdf');
        const _Doc_Index = (_Context.documentCount || 0) + 1;

        // ── Step 3: Upload to S3 ──
        let _S3_Key;
        if (_Is_Image) {
            const _Ext = _Content_Type.includes('png') ? 'png' : _Content_Type.includes('webp') ? 'webp' : 'jpg';
            _S3_Key = `claims/${_Claim_Id}/documents/doc_${String(_Doc_Index).padStart(3, '0')}.${_Ext}`;
        } else if (_Is_PDF) {
            _S3_Key = `claims/${_Claim_Id}/documents/doc_${String(_Doc_Index).padStart(3, '0')}.pdf`;
        } else {
            _S3_Key = `claims/${_Claim_Id}/documents/doc_${String(_Doc_Index).padStart(3, '0')}.bin`;
        }

        await _S3._Upload_Document(_Claim_Id, `doc_${String(_Doc_Index).padStart(3, '0')}.${_Is_PDF ? 'pdf' : 'jpg'}`, _Buffer);
        console.log(`Uploaded to S3: ${_S3_Key}`);

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
        const _Extracted_Text = await _Textract._Extract_Text(_S3_Key);
        console.log(`Extracted text: ${_Extracted_Text.substring(0, 200)}...`);

        // ── Step 6: Extract key-value pairs (for structured forms) ──
        let _Key_Values = [];
        if (_Extracted_Text.length > 50) {
            _Key_Values = await _Textract._Extract_Key_Values(_S3_Key);
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

        // ── Step 8: Store document metadata in DynamoDB ──
        await _DB._Store_Document_Metadata(_Claim_Id, _User_Id, {
            type: _Classification,
            s3Key: _S3_Key,
            extractedText: _Extracted_Text.substring(0, 5000),  // Cap at 5KB for DynamoDB
            keyValues: _Key_Values.slice(0, 50),  // Cap at 50 fields
            contentType: _Content_Type,
            sizeBytes: _Buffer.length,
        });

        // ── Step 9: Name Matching (for AADHAAR_OR_ID) ──
        let _Name_Match = { success: false, score: 0 };
        if (_Classification === _Document_Types.AADHAAR_OR_ID) {
            const _Provided_Name = _Event.context?.intake?.farmer_name || "";
            if (_Provided_Name) {
                _Name_Match = await _Match_Name_AI(_Provided_Name, _Extracted_Text);
            }
        }

        // ── Step 10: Audit log ──
        await _DB._Log_Audit({
            claimId: _Claim_Id,
            actor: _User_Id,
            action: 'document_received',
            metadata: {
                classification: _Classification,
                s3Key: _S3_Key,
                keyValueCount: _Key_Values.length,
                nameMatch: _Name_Match
            },
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                classification: _Classification,
                s3Key: _S3_Key,
                extractedText: _Extracted_Text,
                keyValues: _Key_Values,
                documentIndex: _Doc_Index,
                nameMatch: _Name_Match
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

/**
 * Perform fuzzy name matching using Bedrock
 * @param {string} _Provided - Name provided by the user
 * @param {string} _Extracted - Text extracted from the ID
 * @returns {Promise<{ success: boolean, score: number, reason: string }>}
 */
async function _Match_Name_AI(_Provided, _Extracted) {
    const _Bedrock = require('../../shared/bedrock');
    const _Prompt = `You are an identity verification assistant.
Compare the name provided by a user with the text extracted from their government ID card.
User provided name: "${_Provided}"
Extracted text from ID: "${_Extracted}"

Determine if the names match, considering variations in spelling, middle names, or titles.
Return a JSON object:
{
  "match": boolean,
  "score": number (0-100),
  "reason": "brief explanation"
}
Return ONLY the JSON.`;

    try {
        const _Response = await _Bedrock._Invoke_Model(_Prompt, "", 150);
        const _Result = JSON.parse(_Response.trim());
        return {
            success: _Result.match || _Result.score >= 80,
            score: _Result.score,
            reason: _Result.reason
        };
    } catch (_Error) {
        console.error('Name matching AI failed:', _Error.message);
        return { success: false, score: 0, reason: 'AI matching error' };
    }
}

function _Error_Response(_Message) {
    return {
        statusCode: 500,
        body: JSON.stringify({ success: false, reason: _Message }),
    };
}
