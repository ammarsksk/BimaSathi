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
const { _Document_Types } = require('./constants');

const _Textract_Client = new TextractClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const _Bucket = process.env.EVIDENCE_BUCKET || 'bimasathi-evidence';


// ═════════════════════════════════════════════════════════════
//  TEXT EXTRACTION
// ═════════════════════════════════════════════════════════════

/**
 * Extract raw text from a document stored in S3 or provided as a Buffer using Textract
 * @param {string|Buffer} _Input — S3 object key or document bytes
 * @returns {string} Concatenated raw text from all pages
 */
async function _Extract_Text(_Input) {
    try {
        const _Response = await _Textract_Client.send(new DetectDocumentTextCommand({
            Document: _Textract_Document(_Input),
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
 * @param {string|Buffer} _Input — S3 object key or document bytes
 * @returns {Array<{ key: string, value: string, confidence: number }>} Extracted form fields
 */
async function _Extract_Key_Values(_Input) {
    try {
        const _Response = await _Textract_Client.send(new AnalyzeDocumentCommand({
            Document: _Textract_Document(_Input),
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
    const _Heuristic = _Classify_Document_Heuristically(_Extracted_Text);
    if (_Heuristic) return _Heuristic;

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

        if (_Valid_Types.includes(_Clean) && _Clean !== _Document_Types.UNKNOWN) return _Clean;
        return _Classify_Document_Heuristically(_Extracted_Text) || _Document_Types.UNKNOWN;
    } catch (_Error) {
        console.error('Document classification failed:', _Error.message);
        return _Classify_Document_Heuristically(_Extracted_Text) || _Document_Types.UNKNOWN;
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

function _Textract_Document(_Input) {
    if (Buffer.isBuffer(_Input)) {
        return { Bytes: _Input };
    }
    return {
        S3Object: { Bucket: _Bucket, Name: _Input },
    };
}

function _Classify_Document_Heuristically(_Extracted_Text = '') {
    const _Text = String(_Extracted_Text || '').toLowerCase();
    if (!_Text.trim()) return null;

    if (
        _Text.includes('income tax department')
        || _Text.includes('permanent account number')
        || /\b[a-z]{5}\d{4}[a-z]\b/i.test(_Extracted_Text || '')
        || _Text.includes('govt. of india')
        || _Text.includes('government of india')
        || _Text.includes('election commission')
        || _Text.includes('passport')
        || _Text.includes('driving licence')
        || _Text.includes('driving license')
        || _Text.includes('unique identification authority')
        || _Text.includes('aadhaar')
        || _Text.includes('uidai')
    ) {
        return _Document_Types.AADHAAR_OR_ID;
    }

    if (
        _Text.includes('account number')
        || _Text.includes('ifsc')
        || _Text.includes('branch')
        || _Text.includes('passbook')
        || _Text.includes('bank statement')
        || _Text.includes('account holder')
        || _Text.includes('bank of')
    ) {
        return _Document_Types.BANK_PASSBOOK;
    }

    if (
        _Text.includes('khasra')
        || _Text.includes('khatauni')
        || _Text.includes('khata')
        || _Text.includes('patta')
        || _Text.includes('survey number')
        || _Text.includes('land owner')
        || _Text.includes('record of rights')
    ) {
        return _Document_Types.LAND_RECORD;
    }

    if (
        _Text.includes('policy number')
        || _Text.includes('sum insured')
        || _Text.includes('insured crop')
        || _Text.includes('policy schedule')
        || _Text.includes('insurance policy')
        || _Text.includes('premium')
    ) {
        return _Document_Types.POLICY_DOCUMENT;
    }

    if (
        _Text.includes('claim form')
        || _Text.includes('application form')
        || _Text.includes('proposal form')
        || _Text.includes('farmer application')
        || _Text.includes('pmfby')
        || _Text.includes('pradhan mantri fasal bima')
    ) {
        return _Document_Types.INSURANCE_FORM_TEMPLATE;
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
