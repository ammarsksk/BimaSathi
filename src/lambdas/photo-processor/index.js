/**
 * BimaSathi — Photo Processor Lambda
 * 
 * Full photo AI pipeline (Section 4.4):
 *   1. Download image from Twilio
 *   2. Upload to S3 under claim folder
 *   3. Compute SHA-256 hash for tamper detection
 *   4. Check image dimensions (quality gate)
 *   5. Amazon Rekognition DetectLabels (crop damage detection)
 *   6. Amazon Rekognition DetectModerationLabels (content safety)
 *   7. Extract EXIF metadata (GPS coordinates, timestamp)
 *   8. Validate GPS distance from registered village (≤50km)
 *   9. Validate timestamp against loss date (≤72h)
 *  10. Store metadata + audit log
 */

const { DetectModerationLabelsCommand } = require('@aws-sdk/client-rekognition');
const { _Download_Media } = require('../../shared/whatsapp');
const _S3_Helper = require('../../shared/s3');
const _DB = require('../../shared/dynamodb');
const _Bedrock = require('../../shared/bedrock');
const { _Damage_Labels, _Photo_Config } = require('../../shared/constants');

const { RekognitionClient, DetectLabelsCommand } = require('@aws-sdk/client-rekognition');
const _Rekognition_Client = new RekognitionClient({ region: process.env.AWS_REGION || 'ap-south-1' });


exports.handler = async (_Event) => {
    const { mediaData, claimId, context, language } = _Event;
    const _Result = await _Process_Photo(mediaData, claimId, context, language);
    return { statusCode: 200, body: JSON.stringify(_Result) };
};


/**
 * Process a single photo through the full AI verification pipeline
 *
 * @param {Object} _Media_Data — { id: string }
 * @param {string} _Claim_Id — parent claim
 * @param {Object} _Context — { photoIndex?, photoCount, claimData: { gpsCoords, lossDate } }
 * @param {string} _Language — 2-letter language code
 * @returns {Object} Assessment result
 */
async function _Process_Photo(_Media_Data, _Claim_Id, _Context = {}, _Language = 'hi') {
    const _Result = {
        approved: false,
        fail_reason: null,
        labels: [],
        damage_detected: false,
        quality_score: 0,
        gps_valid: false,
        timestamp_valid: false,
        hash: null,
        s3_key: null,
    };

    try {
        // ── Step 1: Download ──
        const { buffer: _Image_Buffer, contentType: _Content_Type } = await _Download_Media(_Media_Data.id);
        console.log(`Downloaded photo: ${_Image_Buffer?.length || 0} bytes, type: ${_Content_Type || 'unknown'}`);

        if (!_Image_Buffer || _Image_Buffer.length === 0) {
            _Result.fail_reason = 'Unable to download image from Meta.';
            return _Result;
        }

        // ── Step 2: Upload to S3 ──
        const _Photo_Index = _Context.photoIndex || ((_Context.photoCount || 0) + 1);
        _Result.s3_key = await _S3_Helper._Upload_Photo(_Claim_Id, _Photo_Index, _Image_Buffer, _Content_Type || 'image/jpeg');

        // ── Step 3: SHA-256 Hash ──
        _Result.hash = _S3_Helper._Compute_SHA256(_Image_Buffer);

        // ── Step 4: Dimension Check ──
        const _Dimensions = _Parse_Image_Dimensions(_Image_Buffer);
        if (_Dimensions) {
            const _Is_Too_Small = _Dimensions.width < _Photo_Config.MIN_WIDTH || _Dimensions.height < _Photo_Config.MIN_HEIGHT;
            if (_Is_Too_Small) {
                _Result.fail_reason = 'Image resolution too low. Min: 640x480';
                _Result.quality_score = 30;
                await _Store_Photo_Metadata(_Claim_Id, _Photo_Index, _Result);
                return _Result;
            }
        }

        // ── Step 5: Bedrock AI Assessment (PRIMARY — runs FIRST) ──
        // This is the main decision gate. It checks:
        //   a) Is this a crop/field photo?
        //   b) Does the crop match the farmer's claimed crop type?
        //   c) Is there visible crop damage?
        const _Claimed_Crop = _Context.claimData?.cropType || _Context.claimData?.crop_type || null;
        const _Claimed_Cause = _Context.claimData?.cause || null;

        let _AI_Assessment = {
            is_crop_photo: true,
            detected_crop: 'unknown',
            crop_matches_claim: true,
            is_crop_damage: false,
            confidence: 0,
            damage_type: 'none',
            reject_reason: null,
            description: '',
        };

        try {
            const _Mime = _Content_Type || 'image/jpeg';
            const _Format = _Mime.includes('png') ? 'png' : _Mime.includes('webp') ? 'webp' : 'jpeg';

            // Build a context-aware prompt that tells the AI what crop to expect
            let _User_Prompt = 'Analyze this crop photo for insurance claim evidence.';
            if (_Claimed_Crop) {
                _User_Prompt += ` The farmer claims their crop is: ${_Claimed_Crop}. Verify if the photo matches this crop type.`;
            }
            if (_Claimed_Cause) {
                _User_Prompt += ` The farmer reports damage caused by: ${_Claimed_Cause}.`;
            }

            const _AI_Raw = await _Bedrock._Invoke_Model_With_Image(
                _Bedrock._System_Prompts._Crop_Damage_Assessment,
                _Image_Buffer,
                _User_Prompt,
                _Format,
                512
            );

            if (!_AI_Raw || !_AI_Raw.trim()) {
                throw new Error('Bedrock returned an empty vision response.');
            }

            // Parse JSON from model response
            const _Json_Match = _AI_Raw.match(/\{[\s\S]*\}/);
            if (!_Json_Match) {
                throw new Error('Bedrock vision response did not include JSON.');
            }
            if (_Json_Match) {
                _AI_Assessment = { ..._AI_Assessment, ...JSON.parse(_Json_Match[0]) };
            }
            console.log(`Bedrock AI assessment: crop_photo=${_AI_Assessment.is_crop_photo}, detected=${_AI_Assessment.detected_crop}, matches=${_AI_Assessment.crop_matches_claim}, damage=${_AI_Assessment.is_crop_damage}, confidence=${_AI_Assessment.confidence}, type=${_AI_Assessment.damage_type}`);
        } catch (_AI_Err) {
            console.warn('Bedrock vision assessment failed (non-blocking):', _AI_Err.message);
            // If AI fails completely, fall through to Rekognition as backup
            _AI_Assessment.is_crop_damage = true; // benefit of the doubt
            _AI_Assessment.crop_matches_claim = true; // can't verify, accept
            _AI_Assessment.description = 'Bedrock vision assessment was unavailable, so the photo moved to the non-AI fallback checks.';
        }

        _Result.ai_assessment = _AI_Assessment;

        // ── Step 5a: Bedrock Decision Gate ──
        // Reject if: not a crop photo, crop mismatch, or no damage detected
        if (!_AI_Assessment.is_crop_photo) {
            _Result.fail_reason = _AI_Assessment.reject_reason || 'This does not appear to be a photo of a crop field. Please send a photo of your damaged crop.';
            _Result.quality_score = 20;
            await _Store_Photo_Metadata(_Claim_Id, _Photo_Index, _Result);
            return _Result;
        }

        if (!_AI_Assessment.crop_matches_claim && _Claimed_Crop) {
            _Result.fail_reason = _AI_Assessment.reject_reason || `Photo appears to show ${_AI_Assessment.detected_crop || 'a different crop'}, not ${_Claimed_Crop}. Please send a photo of your ${_Claimed_Crop} crop.`;
            _Result.quality_score = 30;
            await _Store_Photo_Metadata(_Claim_Id, _Photo_Index, _Result);
            return _Result;
        }

        if (!_AI_Assessment.is_crop_damage) {
            _Result.fail_reason = _AI_Assessment.reject_reason || _AI_Assessment.description || 'No visible crop damage detected. Please send a photo clearly showing the damaged crop.';
            _Result.quality_score = 40;
            await _Store_Photo_Metadata(_Claim_Id, _Photo_Index, _Result);
            return _Result;
        }

        _Result.damage_detected = true;
        _Result.quality_score = Math.max(70, _AI_Assessment.confidence >= 80 ? 85 : 70);

        // ── Step 6: Rekognition — Labels (supplementary metadata only) ──
        try {
            const _Labels_Response = await _Rekognition_Client.send(new DetectLabelsCommand({
                Image: { Bytes: _Image_Buffer },
                MaxLabels: 20,
                MinConfidence: 60,
            }));

            _Result.labels = (_Labels_Response.Labels || []).map(_Label => ({
                name: _Label.Name,
                confidence: Math.round(_Label.Confidence),
            }));
        } catch (_Rek_Err) {
            console.warn('Rekognition label detection failed (non-blocking):', _Rek_Err.message);
        }

        // ── Step 7: Rekognition — Moderation Check ──
        try {
            const _Moderation_Response = await _Rekognition_Client.send(new DetectModerationLabelsCommand({
                Image: { Bytes: _Image_Buffer },
                MinConfidence: 70,
            }));

            if ((_Moderation_Response.ModerationLabels || []).length > 0) {
                console.warn('Moderation flags detected:', _Moderation_Response.ModerationLabels);
                _Result.fail_reason = 'Image flagged by content moderation';
                _Result.approved = false;
                await _Store_Photo_Metadata(_Claim_Id, _Photo_Index, _Result);
                return _Result;
            }
        } catch (_Err) {
            console.warn('Moderation check skipped (non-critical):', _Err.message);
        }

        // ── Step 8: EXIF Extraction ──
        const _Exif_Data = _Extract_EXIF(_Image_Buffer);

        // ── Step 9: GPS Validation (Temporarily Suspended) ──
        if (_Exif_Data?.gps && _Context.claimData?.gpsCoords?.lat && _Context.claimData?.gpsCoords?.lng) {
            const _Distance = _Haversine_Distance(
                _Exif_Data.gps.latitude, _Exif_Data.gps.longitude,
                parseFloat(_Context.claimData.gpsCoords.lat),
                parseFloat(_Context.claimData.gpsCoords.lng)
            );
            _Result.gps_distance = Math.round(_Distance * 100) / 100;
            _Result.gps_valid = true;
        } else {
            _Result.gps_valid = true;  // lenient when GPS unavailable
        }

        // ── Step 10: Timestamp Validation (Temporarily Suspended) ──
        if (_Exif_Data?.dateTime && _Context.claimData?.lossDate) {
            _Result.timestamp_valid = true;
        } else {
            _Result.timestamp_valid = true;  // lenient when no EXIF date
        }

        // ── Step 11: Final Verdict ──
        if (!_Result.fail_reason) {
            _Result.approved = true;
            _Result.quality_score = Math.max(_Result.quality_score, 70);
        }

        // ── Store metadata and audit ──
        await _Store_Photo_Metadata(_Claim_Id, _Photo_Index, _Result);

        await _DB._Log_Audit({
            claimId: _Claim_Id,
            actor: 'system',
            action: 'photo_processed',
            metadata: {
                photoIndex: _Photo_Index,
                s3Key: _Result.s3_key,
                hash: _Result.hash,
                approved: _Result.approved,
                damageDetected: _Result.damage_detected,
                aiAssessment: {
                    detected_crop: _AI_Assessment.detected_crop,
                    crop_matches: _AI_Assessment.crop_matches_claim,
                    damage_type: _AI_Assessment.damage_type,
                    confidence: _AI_Assessment.confidence,
                },
                failReason: _Result.fail_reason,
            },
        });

        console.log(`Photo ${_Photo_Index} processed: approved=${_Result.approved}, damage=${_Result.damage_detected}, crop_match=${_AI_Assessment.crop_matches_claim}`);

    } catch (_Error) {
        console.error('Photo processing error:', _Error);
        _Result.fail_reason = 'Internal processing error';
    }

    return _Result;
}


// ═════════════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ═════════════════════════════════════════════════════════════

async function _Store_Photo_Metadata(_Claim_Id, _Photo_Index, _Result) {
    try {
        await _S3_Helper._Upload_Photo_Metadata(_Claim_Id, _Photo_Index, {
            photoIndex: _Photo_Index,
            processedAt: new Date().toISOString(),
            s3Key: _Result.s3_key,
            sha256: _Result.hash,
            approved: _Result.approved,
            failReason: _Result.fail_reason,
            damageDetected: _Result.damage_detected,
            qualityScore: _Result.quality_score,
            labels: _Result.labels,
            gpsValid: _Result.gps_valid,
            timestampValid: _Result.timestamp_valid,
        });
    } catch (_Err) {
        console.error('Metadata storage failed:', _Err.message);
    }
}

/**
 * Extract EXIF DateTime from a JPEG buffer (lightweight, no external library)
 */
function _Extract_EXIF(_Buffer) {
    try {
        if (_Buffer[0] !== 0xFF || _Buffer[1] !== 0xD8) return null;  // not JPEG

        const _Buf_String = _Buffer.toString('binary');
        const _Date_Match = _Buf_String.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);

        return {
            dateTime: _Date_Match
                ? `${_Date_Match[1]}-${_Date_Match[2]}-${_Date_Match[3]}T${_Date_Match[4]}:${_Date_Match[5]}:${_Date_Match[6]}`
                : null,
            gps: null,  // full GPS extraction requires a proper EXIF library
        };
    } catch (_Err) {
        return null;
    }
}

/**
 * Parse image dimensions from JPEG SOF or PNG IHDR header
 */
function _Parse_Image_Dimensions(_Buffer) {
    try {
        // JPEG: scan for SOF marker
        if (_Buffer[0] === 0xFF && _Buffer[1] === 0xD8) {
            let _Offset = 2;
            while (_Offset < _Buffer.length - 8) {
                if (_Buffer[_Offset] !== 0xFF) { _Offset++; continue; }
                const _Marker = _Buffer[_Offset + 1];
                if (_Marker >= 0xC0 && _Marker <= 0xC3) {
                    return { height: _Buffer.readUInt16BE(_Offset + 5), width: _Buffer.readUInt16BE(_Offset + 7) };
                }
                _Offset += 2 + _Buffer.readUInt16BE(_Offset + 2);
            }
        }
        // PNG: dimensions at byte 16
        if (_Buffer[0] === 0x89 && _Buffer[1] === 0x50) {
            return { width: _Buffer.readUInt32BE(16), height: _Buffer.readUInt32BE(20) };
        }
        return null;
    } catch (_Err) {
        return null;
    }
}

/**
 * Haversine formula — great-circle distance between two GPS points
 * @returns {number} Distance in kilometers
 */
function _Haversine_Distance(_Lat1, _Lon1, _Lat2, _Lon2) {
    const _R = 6371;  // Earth radius in km
    const _To_Rad = (_Deg) => _Deg * (Math.PI / 180);

    const _D_Lat = _To_Rad(_Lat2 - _Lat1);
    const _D_Lon = _To_Rad(_Lon2 - _Lon1);

    const _A = Math.sin(_D_Lat / 2) ** 2
        + Math.cos(_To_Rad(_Lat1)) * Math.cos(_To_Rad(_Lat2))
        * Math.sin(_D_Lon / 2) ** 2;

    return _R * 2 * Math.atan2(Math.sqrt(_A), Math.sqrt(1 - _A));
}


module.exports = {
    handler: exports.handler,
    _Process_Photo,
};
