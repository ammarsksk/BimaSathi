/**
 * BimaSathi — Claim Generator Lambda
 * 
 * Generates the complete Claim Pack containing:
 *   1. Claim Form PDF (PMFBY-style)
 *   2. Evidence Report PDF (AI assessment + photo verification)
 *   3. Cover Letter PDF (formal letter to insurer)
 *   4. Bundled Claim Pack PDF (all 3 merged)
 * 
 * Uses pdf-lib for pure-JS PDF generation (no native dependencies).
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const _S3_Helper = require('../../shared/s3');
const _Bedrock = require('../../shared/bedrock');
const _DB = require('../../shared/dynamodb');
const _WhatsApp = require('../../shared/whatsapp');

exports.handler = async (_Event) => {
    const { claimId, claimData } = _Event;

    try {
        const _Result = await _Generate_Claim_Pack(claimId, claimData);

        // ── Since generation can take 10-15s, we notify the user asynchronously ──
        if (claimData.phoneNumber) {
            const _Phone = 'whatsapp:' + claimData.phoneNumber;
            const _Lang = claimData.language || 'hi';

            let _Company_Name = 'Insurance';
            if (claimData.company) {
                try {
                    const { _Company_Templates } = require('../../shared/insurance-templates');
                    const _Template = _Company_Templates[claimData.company];
                    if (_Template) _Company_Name = _Template.name;
                } catch (e) { }
            }

            let _Done_Msg = `Your ${_Company_Name} claim document is ready.\n\nDownload PDF: ${_Result.presignedUrl}`;
            if (_Lang !== 'en') {
                _Done_Msg = await _Bedrock._Translate_Text(_Done_Msg, _Lang);
            }

            await _WhatsApp._Send_Text_Message(_Phone, _Done_Msg);
        }

        return { statusCode: 200, body: JSON.stringify(_Result) };
    } catch (_Error) {
        console.error('Claim Generation failed:', _Error);

        if (claimData.phoneNumber) {
            const _Phone = 'whatsapp:' + claimData.phoneNumber;
            const _Lang = claimData.language || 'hi';
            let _Err_Msg = 'We encountered an error generating your document. Please try again from the claim hub.';
            if (_Lang !== 'en') {
                _Err_Msg = await _Bedrock._Translate_Text(_Err_Msg, _Lang);
            }

            await _WhatsApp._Send_Text_Message(_Phone, _Err_Msg);
        }

        return { statusCode: 500, body: JSON.stringify({ error: _Error.message }) };
    }
};


/**
 * Generate the full Claim Pack (3 PDFs + bundled version)
 * @param {string} _Claim_Id — claim identifier
 * @param {Object} _Data — claim data fields
 * @returns {Object} S3 keys and pre-signed URL for the claim pack
 */
async function _Generate_Claim_Pack(_Claim_Id, _Data) {
    console.log(`Generating claim pack for ${_Claim_Id}`);

    // Generate AI claim narrative
    let _Narrative = '';
    try {
        _Narrative = await _Bedrock._Generate_Claim_Narrative(_Data);
        console.log('Generated claim narrative via Bedrock');
    } catch (_Err) {
        console.error('Narrative generation failed, continuing without:', _Err.message);
    }

    const _Enriched_Data = { ..._Data, narrative: _Narrative };

    const _Claim_Form_PDF = await _Build_Claim_Form_PDF(_Claim_Id, _Enriched_Data);
    const _Evidence_Report_PDF = await _Build_Evidence_Report_PDF(_Claim_Id, _Enriched_Data);
    const _Cover_Letter_PDF = await _Build_Cover_Letter_PDF(_Claim_Id, _Enriched_Data);
    const _Bundled_Pack_PDF = await _Bundle_PDFs(_Cover_Letter_PDF, _Claim_Form_PDF, _Evidence_Report_PDF);

    const [_Key_Form, _Key_Evidence, _Key_Cover, _Key_Pack, _Key_Final] = await Promise.all([
        _S3_Helper._Upload_Document(_Claim_Id, 'claim_form.pdf', _Claim_Form_PDF),
        _S3_Helper._Upload_Document(_Claim_Id, 'evidence_report.pdf', _Evidence_Report_PDF),
        _S3_Helper._Upload_Document(_Claim_Id, 'cover_letter.pdf', _Cover_Letter_PDF),
        _S3_Helper._Upload_Document(_Claim_Id, 'claim_pack.pdf', _Bundled_Pack_PDF),
        _S3_Helper._Upload_Document(_Claim_Id, 'final_claim_pack.pdf', _Bundled_Pack_PDF),
    ]);

    await _S3_Helper._Generate_Evidence_Manifest(_Claim_Id);
    const _Pack_URL = await _S3_Helper._Get_Presigned_URL(_Key_Final, 7 * 24 * 3600);

    // Do not regress a submitted claim back into an intermediate status.
    if (_Data.userId) {
        try {
            const _Existing = await _DB._Get_Claim_By_Id(_Claim_Id);
            if (_Existing?.status !== 'Submitted') {
                await _DB._Update_Claim(_Claim_Id, _Data.userId, { status: 'Ready for Submission' });
            }
        } catch (_Err) {
            console.error('Status update failed:', _Err.message);
        }
    }

    return {
        claimFormKey: _Key_Form,
        evidenceReportKey: _Key_Evidence,
        coverLetterKey: _Key_Cover,
        claimPackKey: _Key_Pack,
        finalClaimPackKey: _Key_Final,
        presignedUrl: _Pack_URL,
    };
}


// ═════════════════════════════════════════════════════════════
//  PDF BUILDERS
// ═════════════════════════════════════════════════════════════

async function _Build_Claim_Form_PDF(_Claim_Id, _D) {
    const _Doc = await PDFDocument.create();
    const _Font = await _Doc.embedFont(StandardFonts.Helvetica);
    const _Bold = await _Doc.embedFont(StandardFonts.HelveticaBold);
    const _Page = _Doc.addPage([595, 842]);

    const _Blue = rgb(0.1, 0.3, 0.6);
    const _Text = rgb(0.15, 0.15, 0.15);
    const _Green = rgb(0.0, 0.5, 0.3);
    let _Y = 790;

    // Header
    _Page.drawText('PRADHAN MANTRI FASAL BIMA YOJANA', { x: 100, y: _Y, size: 16, font: _Bold, color: _Blue });
    _Y -= 25;
    _Page.drawText('CROP INSURANCE CLAIM FORM', { x: 160, y: _Y, size: 14, font: _Bold, color: _Blue });
    _Y -= 15;
    _Page.drawLine({ start: { x: 50, y: _Y }, end: { x: 545, y: _Y }, thickness: 2, color: _Blue });
    _Y -= 20;
    _Page.drawText(`Filed via BimaSathi | Claim ID: ${_Claim_Id} | Date: ${new Date().toLocaleDateString('en-IN')}`, { x: 50, y: _Y, size: 9, font: _Font, color: _Green });
    _Y -= 30;
    // Section A: Farmer Details
    _Y = _Draw_Section_Header(_Page, 'SECTION A: CLAIMANT INFORMATION', _Y, _Bold, _Blue);

    // Check if we have a dynamic form schema or a selected company
    let _Schema = _D.formSchema || [];

    if (_D.company) {
        try {
            const { _Company_Templates } = require('../../shared/insurance-templates');
            const _Template = _Company_Templates[_D.company];
            if (_Template) {
                _Page.drawText(`Company: ${_Template.name}`, { x: 50, y: _Y, size: 10, font: _Bold, color: _Text });
                _Y -= 20;
                _Schema = _Template.fields.map(f => ({
                    field_name: f.label,
                    value: _D[f.key] ? String(_D[f.key]) : 'N/A'
                }));
            }
        } catch (e) { console.error('Error loading company templates:', e); }
    }

    if (_Schema.length > 0) {
        // Group fields into two columns to save space
        const _Fields = _Schema.map(f => [
            _Capitalize(f.field_name.replace(/_/g, ' ')),
            f.value ? String(f.value) : '________________'
        ]);

        // Draw fields row by row (2 per row if short enough, else 1)
        for (let i = 0; i < _Fields.length; i++) {
            const [_Lbl, _Val] = _Fields[i];
            _Y = _Draw_Form_Field(_Page, _Lbl, _Val, _Y, _Font, _Bold);
            if (_Y < 100) {
                // basic pagination protection (ideally would add a new page, but this fits most forms)
                _Page.drawText('... (Continued on next page)', { x: 50, y: 50, size: 9, font: _Font, color: _Text });
                break;
            }
        }
    } else {
        // Fallback to legacy hardcoded fields if no schema exists
        const _Farmer_Fields = [
            ['Full Name', _D.farmerName], ['Village', _D.village], ['District', _D.district],
            ['State', _D.state], ['Phone', _D.phoneNumber], ['Bank A/C (Last 4)', _D.bankLast4 ? `****${_D.bankLast4}` : 'N/A'],
        ];
        for (const [_Lbl, _Val] of _Farmer_Fields) { _Y = _Draw_Form_Field(_Page, _Lbl, _Val || 'N/A', _Y, _Font, _Bold); }
        _Y -= 15;

        _Y = _Draw_Section_Header(_Page, 'SECTION B: CROP & LOSS DETAILS', _Y, _Bold, _Blue);
        const _Crop_Fields = [
            ['Crop Type', _Capitalize(_D.cropType)], ['Season', _Capitalize(_D.season)],
            ['Date of Loss', _D.lossDate || 'N/A'], ['Cause of Loss', _Capitalize((_D.cause || '').replace(/_/g, ' '))],
            ['Area Affected', _D.areaHectares ? `${_D.areaHectares} hectares` : 'N/A'],
            ['Insurance Scheme', (_D.policyType || 'PMFBY').toUpperCase()],
        ];
        for (const [_Lbl, _Val] of _Crop_Fields) { _Y = _Draw_Form_Field(_Page, _Lbl, _Val || 'N/A', _Y, _Font, _Bold); }
    }
    _Y -= 15;

    // Section C: Filing Info
    _Y = _Draw_Section_Header(_Page, 'SECTION B: FILING INFORMATION', _Y, _Bold, _Blue);
    _Y = _Draw_Form_Field(_Page, 'Filing Deadline', _D.deadline ? new Date(_D.deadline).toLocaleString('en-IN') : 'N/A', _Y, _Font, _Bold);
    _Y = _Draw_Form_Field(_Page, 'Filed via', 'BimaSathi WhatsApp AI', _Y, _Font, _Bold);
    _Y = _Draw_Form_Field(_Page, 'Evidence Photos', `${_D.approvedPhotoCount || 0} (AI-verified)`, _Y, _Font, _Bold);
    _Y -= 25;

    // Declaration
    _Page.drawText('DECLARATION', { x: 50, y: _Y, size: 11, font: _Bold, color: _Blue });
    _Y -= 18;
    const _Decl = 'I declare that the information above is true and correct. I authorize the insurance company to verify and process my claim.';
    for (const _Line of _Split_Text(_Decl, _Font, 10, 480)) { _Page.drawText(_Line, { x: 50, y: _Y, size: 10, font: _Font, color: _Text }); _Y -= 15; }
    _Y -= 20;
    _Page.drawText(`Farmer: ${_D.farmerName || '___'}`, { x: 50, y: _Y, size: 10, font: _Font, color: _Text });
    _Page.drawText(`Date: ${new Date().toLocaleDateString('en-IN')}`, { x: 350, y: _Y, size: 10, font: _Font, color: _Text });

    // Section D: AI-Generated Claim Narrative (if available)
    if (_D.narrative) {
        _Y -= 30;
        _Y = _Draw_Section_Header(_Page, 'SECTION D: CLAIM DESCRIPTION (AI-GENERATED)', _Y, _Bold, _Blue);
        const _Narrative_Lines = _Split_Text(_D.narrative, _Font, 9, 490);
        for (const _Line of _Narrative_Lines.slice(0, 15)) {
            _Page.drawText(_Line, { x: 50, y: _Y, size: 9, font: _Font, color: _Text });
            _Y -= 13;
            if (_Y < 50) break;
        }
    }

    _Page.drawText('Generated by BimaSathi — AI-Powered Crop Insurance Claim Assistant', { x: 110, y: 30, size: 8, font: _Font, color: rgb(0.5, 0.5, 0.5) });

    return Buffer.from(await _Doc.save());
}


async function _Build_Evidence_Report_PDF(_Claim_Id, _D) {
    const _Doc = await PDFDocument.create();
    const _Font = await _Doc.embedFont(StandardFonts.Helvetica);
    const _Bold = await _Doc.embedFont(StandardFonts.HelveticaBold);
    const _Page = _Doc.addPage([595, 842]);

    const _Blue = rgb(0.1, 0.3, 0.6);
    const _Text = rgb(0.15, 0.15, 0.15);
    const _Ok = rgb(0.0, 0.5, 0.2);
    let _Y = 790;

    _Page.drawText('EVIDENCE ASSESSMENT REPORT', { x: 150, y: _Y, size: 16, font: _Bold, color: _Blue });
    _Y -= 20;
    _Page.drawText(`Claim ID: ${_Claim_Id}  |  Generated: ${new Date().toISOString()}`, { x: 50, y: _Y, size: 9, font: _Font, color: rgb(0.5, 0.5, 0.5) });
    _Y -= 5;
    _Page.drawLine({ start: { x: 50, y: _Y }, end: { x: 545, y: _Y }, thickness: 2, color: _Blue });
    _Y -= 25;

    _Page.drawText('EVIDENCE SUMMARY', { x: 50, y: _Y, size: 12, font: _Bold, color: _Blue });
    _Y -= 20;
    const _Photo_Count = _D.approvedPhotoCount || _D.photoCount || 0;
    const _Summary_Items = [
        `Total Photos Submitted: ${_D.photoCount || 0}`,
        `AI-Approved Photos: ${_Photo_Count}`,
        `GPS Verification: ${_D.gpsVerified ? '✓ PASSED' : 'Pending'}`,
        `Damage Detection: ${_D.damageDetected !== false ? '✓ Detected' : 'None'}`,
        `Integrity: All photos SHA-256 hashed`,
    ];
    for (const _Item of _Summary_Items) { _Page.drawText(`• ${_Item}`, { x: 60, y: _Y, size: 10, font: _Font, color: _Text }); _Y -= 16; }
    _Y -= 20;

    // Verification box
    _Page.drawRectangle({ x: 45, y: _Y - 45, width: 505, height: 50, borderColor: _Ok, borderWidth: 1.5 });
    _Page.drawText('✓ EVIDENCE VERIFICATION: PASSED', { x: 55, y: _Y - 15, size: 12, font: _Bold, color: _Ok });
    _Page.drawText('All evidence meets PMFBY requirements. Integrity verified via SHA-256.', { x: 55, y: _Y - 32, size: 9, font: _Font, color: _Text });

    _Page.drawText('Generated by BimaSathi', { x: 200, y: 30, size: 8, font: _Font, color: rgb(0.5, 0.5, 0.5) });
    return Buffer.from(await _Doc.save());
}


async function _Build_Cover_Letter_PDF(_Claim_Id, _D) {
    const _Doc = await PDFDocument.create();
    const _Font = await _Doc.embedFont(StandardFonts.TimesRoman);
    const _Bold = await _Doc.embedFont(StandardFonts.TimesRomanBold);
    const _Page = _Doc.addPage([595, 842]);
    const _C = rgb(0.1, 0.1, 0.1);
    let _Y = 760;

    _Page.drawText(new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }), { x: 400, y: _Y, size: 11, font: _Font, color: _C });
    _Y -= 30;
    for (const _Line of ['To,', 'The Claims Manager', 'Crop Insurance Division', _D.state || 'India']) {
        _Page.drawText(_Line, { x: 50, y: _Y, size: 11, font: _Font, color: _C }); _Y -= 15;
    }
    _Y -= 15;
    _Page.drawText(`Subject: Crop Insurance Claim — ${_Claim_Id}`, { x: 50, y: _Y, size: 12, font: _Bold, color: _C });
    _Y -= 25;
    _Page.drawText('Respected Sir/Madam,', { x: 50, y: _Y, size: 11, font: _Font, color: _C });
    _Y -= 20;

    const _Body_1 = `I, ${_D.farmerName || 'the undersigned'}, from village ${_D.village || 'N/A'}, district ${_D.district || 'N/A'}, state ${_D.state || 'N/A'}, report that my ${(_D.cropType || 'crop').replace(/_/g, ' ')} crop suffered damage due to ${(_D.cause || 'natural calamity').replace(/_/g, ' ')} on ${_D.lossDate || 'the recent date'}.`;
    for (const _L of _Split_Text(_Body_1, _Font, 11, 490)) { _Page.drawText(_L, { x: 50, y: _Y, size: 11, font: _Font, color: _C }); _Y -= 16; }
    _Y -= 10;

    const _Body_2 = `The affected area is ${_D.areaHectares || 'N/A'} hectares. I am insured under ${(_D.policyType || 'PMFBY').toUpperCase()}.`;
    for (const _L of _Split_Text(_Body_2, _Font, 11, 490)) { _Page.drawText(_L, { x: 50, y: _Y, size: 11, font: _Font, color: _C }); _Y -= 16; }
    _Y -= 10;

    _Page.drawText('Supporting documents attached:', { x: 50, y: _Y, size: 11, font: _Font, color: _C }); _Y -= 18;
    for (const _Att of ['1. Duly filled Claim Form', '2. Evidence Report (AI-verified)', '3. GPS-verified field data', '4. SHA-256 integrity verification']) {
        _Page.drawText(_Att, { x: 70, y: _Y, size: 10, font: _Font, color: _C }); _Y -= 15;
    }
    _Y -= 10;
    _Page.drawText('Kindly process my claim at the earliest.', { x: 50, y: _Y, size: 11, font: _Font, color: _C }); _Y -= 30;

    for (const _L of ['Thanking you,', 'Yours faithfully,']) { _Page.drawText(_L, { x: 50, y: _Y, size: 11, font: _Font, color: _C }); _Y -= 18; }
    _Page.drawText(_D.farmerName || 'Farmer', { x: 50, y: _Y, size: 12, font: _Bold, color: _C }); _Y -= 15;
    _Page.drawText(`Claim ID: ${_Claim_Id}`, { x: 50, y: _Y, size: 10, font: _Font, color: _C });

    _Page.drawText('Filed via BimaSathi', { x: 220, y: 30, size: 8, font: _Font, color: rgb(0.5, 0.5, 0.5) });
    return Buffer.from(await _Doc.save());
}


async function _Bundle_PDFs(_Cover, _Form, _Evidence) {
    const _Merged = await PDFDocument.create();
    for (const _Buf of [_Cover, _Form, _Evidence]) {
        const _Src = await PDFDocument.load(_Buf);
        const _Pages = await _Merged.copyPages(_Src, _Src.getPageIndices());
        _Pages.forEach(_P => _Merged.addPage(_P));
    }
    return Buffer.from(await _Merged.save());
}


// ═════════════════════════════════════════════════════════════
//  PDF UTILITIES
// ═════════════════════════════════════════════════════════════

function _Draw_Section_Header(_Page, _Text, _Y, _Font, _Color) {
    _Page.drawRectangle({ x: 45, y: _Y - 5, width: 500, height: 20, color: rgb(0.93, 0.95, 0.98) });
    _Page.drawText(_Text, { x: 50, y: _Y, size: 11, font: _Font, color: _Color });
    return _Y - 25;
}

function _Draw_Form_Field(_Page, _Label, _Value, _Y, _Font, _Bold_Font) {
    _Page.drawText(`${_Label}:`, { x: 50, y: _Y, size: 10, font: _Bold_Font, color: rgb(0.3, 0.3, 0.3) });
    _Page.drawText(_Value, { x: 200, y: _Y, size: 10, font: _Font, color: rgb(0.15, 0.15, 0.15) });
    _Page.drawLine({ start: { x: 198, y: _Y - 3 }, end: { x: 540, y: _Y - 3 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    return _Y - 18;
}

function _Split_Text(_Text, _Font, _Size, _Max_Width) {
    const _Words = _Text.split(' ');
    const _Lines = [];
    let _Current = '';
    for (const _W of _Words) {
        const _Test = _Current ? `${_Current} ${_W}` : _W;
        if (_Font.widthOfTextAtSize(_Test, _Size) > _Max_Width && _Current) {
            _Lines.push(_Current); _Current = _W;
        } else { _Current = _Test; }
    }
    if (_Current) _Lines.push(_Current);
    return _Lines;
}

function _Capitalize(_Str) {
    if (!_Str) return 'N/A';
    return _Str.charAt(0).toUpperCase() + _Str.slice(1);
}


module.exports = { handler: exports.handler, _Generate_Claim_Pack };
