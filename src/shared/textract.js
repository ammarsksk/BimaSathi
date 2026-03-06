/**
 * BimaSathi — Amazon Textract Document Extraction Helper
 * 
 * Wraps Textract APIs for document text extraction and form analysis:
 *   - DetectDocumentText: raw text extraction from PDFs/images
 *   - AnalyzeDocument: key-value pair extraction from forms
 *   - Document classification via Bedrock AI
 */

const { TextractClient, DetectDocumentTextCommand,
    AnalyzeDocumentCommand } = require('@aws-sdk/client-textract');
const _Bedrock = require('./bedrock');

const _Textract_Client = new TextractClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const _Bucket = process.env.EVIDENCE_BUCKET || 'bimasathi-evidence';


// ═════════════════════════════════════════════════════════════
//  TEXT EXTRACTION
// ═════════════════════════════════════════════════════════════

/**
 * Extract raw text from a document stored in S3 using Textract
 * @param {string} _S3_Key — S3 object key (must be in the evidence bucket)
 * @returns {string} Concatenated raw text from all pages
 */
async function _Extract_Text(_S3_Key) {
    try {
        const _Response = await _Textract_Client.send(new DetectDocumentTextCommand({
            Document: {
                S3Object: { Bucket: _Bucket, Name: _S3_Key },
            },
        }));

        const _Lines = (_Response.Blocks || [])
            .filter(_Block => _Block.BlockType === 'LINE')
            .map(_Block => _Block.Text || '')
            .filter(Boolean);

        return _Lines.join('\n');
    } catch (_Error) {
        console.error('Textract text extraction failed:', _Error.message);
        return '';
    }
}


/**
 * Extract key-value pairs from a form document using Textract AnalyzeDocument
 * @param {string} _S3_Key — S3 object key
 * @returns {Array<{ key: string, value: string, confidence: number }>} Extracted form fields
 */
async function _Extract_Key_Values(_S3_Key) {
    try {
        const _Response = await _Textract_Client.send(new AnalyzeDocumentCommand({
            Document: {
                S3Object: { Bucket: _Bucket, Name: _S3_Key },
            },
            FeatureTypes: ['FORMS'],
        }));

        const _Blocks = _Response.Blocks || [];
        const _Block_Map = {};
        const _Key_Blocks = [];

        for (const _Block of _Blocks) {
            _Block_Map[_Block.Id] = _Block;
            if (_Block.BlockType === 'KEY_VALUE_SET' && _Block.EntityTypes?.includes('KEY')) {
                _Key_Blocks.push(_Block);
            }
        }

        const _Key_Values = [];
        for (const _Key_Block of _Key_Blocks) {
            const _Key_Text = _Get_Block_Text(_Key_Block, _Block_Map);
            const _Value_Block = _Find_Value_Block(_Key_Block, _Block_Map);
            const _Value_Text = _Value_Block ? _Get_Block_Text(_Value_Block, _Block_Map) : '';

            if (_Key_Text) {
                _Key_Values.push({
                    key: _Key_Text,
                    value: _Value_Text,
                    confidence: _Key_Block.Confidence || 0,
                });
            }
        }

        return _Key_Values;
    } catch (_Error) {
        console.error('Textract form analysis failed:', _Error.message);
        return [];
    }
}


// ═════════════════════════════════════════════════════════════
//  DOCUMENT CLASSIFICATION
// ═════════════════════════════════════════════════════════════

/**
 * Classify a document based on its extracted text using Bedrock AI
 * @param {string} _Extracted_Text — raw text from Textract
 * @returns {string} One of the _Document_Types enum values
 */
async function _Classify_Document(_Extracted_Text) {
    const _System_Prompt = `You are a document classifier for an Indian crop insurance system.
Given the extracted text from a document, classify it into exactly ONE of these categories:

- INSURANCE_FORM_TEMPLATE: An insurance application form, claim form, or PMFBY form template
- CROP_LOSS_PHOTO: A photo of crop damage or agricultural field (usually minimal text)
- LAND_RECORD: A land ownership record, khasra/khatauni, or land registration document
- POLICY_DOCUMENT: An insurance policy certificate, policy schedule, or policy terms
- AADHAAR_OR_ID: An Aadhaar card, voter ID, PAN card, or any government identity document
- BANK_PASSBOOK: A bank passbook, bank statement, or account details document
- UNKNOWN: Cannot determine the document type

Return ONLY the classification label, nothing else.`;

    try {
        const _Result = await _Bedrock._Invoke_Model(_System_Prompt, _Extracted_Text, 30);
        const _Clean = _Result.trim().toUpperCase().replace(/[^A-Z_]/g, '');

        const _Valid_Types = [
            'INSURANCE_FORM_TEMPLATE', 'CROP_LOSS_PHOTO', 'LAND_RECORD',
            'POLICY_DOCUMENT', 'AADHAAR_OR_ID', 'BANK_PASSBOOK', 'UNKNOWN',
        ];

        return _Valid_Types.includes(_Clean) ? _Clean : 'UNKNOWN';
    } catch (_Error) {
        console.error('Document classification failed:', _Error.message);
        return 'UNKNOWN';
    }
}


// ═════════════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ═════════════════════════════════════════════════════════════

/**
 * Get concatenated text from a Textract block's child WORD blocks
 */
function _Get_Block_Text(_Block, _Block_Map) {
    const _Words = [];
    for (const _Relationship of _Block.Relationships || []) {
        if (_Relationship.Type === 'CHILD') {
            for (const _Id of _Relationship.Ids || []) {
                const _Child = _Block_Map[_Id];
                if (_Child?.BlockType === 'WORD') {
                    _Words.push(_Child.Text || '');
                }
            }
        }
    }
    return _Words.join(' ').trim();
}

/**
 * Find the VALUE block paired with a KEY block in a KEY_VALUE_SET
 */
function _Find_Value_Block(_Key_Block, _Block_Map) {
    for (const _Relationship of _Key_Block.Relationships || []) {
        if (_Relationship.Type === 'VALUE') {
            for (const _Id of _Relationship.Ids || []) {
                const _Block = _Block_Map[_Id];
                if (_Block?.BlockType === 'KEY_VALUE_SET' && _Block.EntityTypes?.includes('VALUE')) {
                    return _Block;
                }
            }
        }
    }
    return null;
}


// ─────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────
module.exports = {
    _Extract_Text,
    _Extract_Key_Values,
    _Classify_Document,
};
