/**
 * BimaSathi — Appeal Generator Lambda
 * 
 * When a claim is rejected, this function:
 *   1. Uses Amazon Bedrock to draft a formal appeal letter
 *   2. Generates an Appeal Letter PDF
 *   3. Uploads to S3 and returns a pre-signed URL
 */

const { PDFDocument, StandardFonts, rgb } = require('../../vendor/pdf-lib');
const _Bedrock = require('../../shared/bedrock');
const _S3_Helper = require('../../shared/s3');
const _DB = require('../../shared/dynamodb');
const { _Sanitize_PDF_Text, _Wrap_PDF_Text } = require('../../shared/pdf-text');


exports.handler = async (_Event) => {
    const { claimId, claimData } = _Event;
    const _Result = await _Generate_Appeal(claimId, claimData);
    return { statusCode: 200, body: JSON.stringify(_Result) };
};


/**
 * Full appeal generation pipeline
 * @param {string} _Claim_Id — rejected claim
 * @param {Object} _Claim_Data — claim details including rejection reason
 * @returns {{ s3Key, presignedUrl, appealText }}
 */
async function _Generate_Appeal(_Claim_Id, _Claim_Data) {
    // Enrich from DynamoDB if data is incomplete
    let _Data = _Claim_Data || {};
    if (!_Data.farmerName) {
        const _Stored_Claim = await _DB._Get_Claim_By_Id(_Claim_Id);
        if (_Stored_Claim) _Data = { ..._Stored_Claim, ..._Data };
    }

    // Step 1: Generate appeal text via Bedrock
    let _Appeal_Text;
    try {
        _Appeal_Text = await _Bedrock._Generate_Appeal_Letter(_Data);
    } catch (_Err) {
        console.error('Bedrock appeal generation failed:', _Err);
        _Appeal_Text = _Build_Fallback_Appeal(_Data);
    }

    // Step 2: Build PDF
    const _PDF_Buffer = await _Build_Appeal_PDF(_Claim_Id, _Data, _Appeal_Text);

    // Step 3: Upload to S3
    const _S3_Key = await _S3_Helper._Upload_Document(_Claim_Id, 'appeal_letter.pdf', _PDF_Buffer);
    const _Presigned_URL = await _S3_Helper._Get_Presigned_URL(_S3_Key, 7 * 24 * 3600);

    // Step 4: Update claim and audit
    await _DB._Update_Claim(_Claim_Id, _Data.userId, { appealS3Key: _S3_Key });
    await _DB._Log_Audit({ claimId: _Claim_Id, actor: 'system', action: 'appeal_generated', metadata: { s3Key: _S3_Key } });

    return { s3Key: _S3_Key, presignedUrl: _Presigned_URL, appealText: _Appeal_Text };
}


async function _Build_Appeal_PDF(_Claim_Id, _Data, _Appeal_Text) {
    const _Doc = await PDFDocument.create();
    const _Font = await _Doc.embedFont(StandardFonts.TimesRoman);
    const _Bold = await _Doc.embedFont(StandardFonts.TimesRomanBold);
    const _Page = _Doc.addPage([595, 842]);
    _Wrap_Page_Text(_Page);
    const _C = rgb(0.1, 0.1, 0.1);
    const _Red = rgb(0.6, 0.0, 0.0);
    let _Y = 760;

    // Header
    _Page.drawText(_Sanitize_PDF_Text('FORMAL APPEAL LETTER'), { x: 180, y: _Y, size: 14, font: _Bold, color: _Red });
    _Y -= 10;
    _Page.drawLine({ start: { x: 50, y: _Y }, end: { x: 545, y: _Y }, thickness: 1.5, color: _Red });
    _Y -= 20;
    _Page.drawText(_Sanitize_PDF_Text(`Claim ID: ${_Claim_Id}`), { x: 50, y: _Y, size: 10, font: _Font, color: _C });
    _Page.drawText(_Sanitize_PDF_Text(`Date: ${new Date().toLocaleDateString('en-IN')}`), { x: 400, y: _Y, size: 10, font: _Font, color: _C });
    _Y -= 30;

    // Body text
    const _Lines = _Split_Text(_Appeal_Text, _Font, 11, 490);
    for (const _Line of _Lines) {
        if (_Y < 60) break;
        _Page.drawText(_Line, { x: 50, y: _Y, size: 11, font: _Font, color: _C });
        _Y -= 16;
    }

    _Page.drawText(_Sanitize_PDF_Text('Filed via BimaSathi - AI-Powered Crop Insurance Claim Assistant'), { x: 120, y: 30, size: 8, font: _Font, color: rgb(0.5, 0.5, 0.5) });

    return Buffer.from(await _Doc.save());
}


function _Build_Fallback_Appeal(_Data) {
    return [
        `To The Claims Manager,`,
        ``,
        `I, ${_Data.farmerName || 'the undersigned'}, from village ${_Data.village || 'N/A'}, ${_Data.district || ''}, ${_Data.state || ''}, submit this appeal against the rejection of claim ${_Data.claimId || 'N/A'}.`,
        ``,
        `Rejection reason: "${_Data.rejectionReason || 'Not specified'}"`,
        ``,
        `I request reconsideration because:`,
        `1. Evidence clearly shows crop damage`,
        `2. Claim was filed within the stipulated timeline`,
        `3. All photographic evidence has been AI-verified`,
        ``,
        `Yours faithfully,`,
        `${_Data.farmerName || 'Farmer'}`,
    ].join('\n');
}


function _Split_Text(_Text, _Font, _Size, _Max_Width) {
    return _Wrap_PDF_Text(_Text, _Font, _Size, _Max_Width);
}

function _Wrap_Page_Text(_Page) {
    if (_Page._bimaSafeTextWrapped) return _Page;
    const _Original_Draw_Text = _Page.drawText.bind(_Page);
    _Page.drawText = (_Text, _Options) => _Original_Draw_Text(_Sanitize_PDF_Text(_Text), _Options);
    _Page._bimaSafeTextWrapped = true;
    return _Page;
}


module.exports = { handler: exports.handler, _Generate_Appeal };
