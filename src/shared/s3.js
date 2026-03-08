/**
 * BimaSathi — S3 Evidence Storage Helper
 * 
 * Manages all file storage in the evidence S3 bucket:
 *   - Upload photos, audio, documents, metadata
 *   - Generate pre-signed URLs for secure access
 *   - Compute SHA-256 hashes for tamper detection
 *   - Organize files in per-claim folder structure:
 *       claims/{claimId}/photos/photo_001.jpg
 *       claims/{claimId}/audio/voice_001.ogg
 *       claims/{claimId}/documents/claim_pack.pdf
 *       claims/{claimId}/metadata/photo_001.json
 */

const { S3Client, PutObjectCommand, GetObjectCommand,
    ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

const _Bucket_Name = process.env.EVIDENCE_BUCKET || 'bimasathi-evidence';
const _S3_Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });


// ═════════════════════════════════════════════════════════════
//  UPLOAD FUNCTIONS
// ═════════════════════════════════════════════════════════════

/**
 * Upload a photo to the claim's photos folder
 * @param {string} _Claim_Id — parent claim
 * @param {number} _Photo_Index — 1-based photo number
 * @param {Buffer} _Buffer — image data
 * @param {string} _Content_Type — MIME type (e.g. image/jpeg)
 * @returns {string} S3 key of the uploaded object
 */
async function _Upload_Photo(_Claim_Id, _Photo_Index, _Buffer, _Content_Type = 'image/jpeg') {
    const _Extension = _Mime_To_Extension(_Content_Type);
    const _Key = `claims/${_Claim_Id}/photos/photo_${String(_Photo_Index).padStart(3, '0')}.${_Extension}`;
    const _Hash = _Compute_SHA256(_Buffer);

    await _S3_Client.send(new PutObjectCommand({
        Bucket: _Bucket_Name,
        Key: _Key,
        Body: _Buffer,
        ContentType: _Content_Type,
        ServerSideEncryption: 'aws:kms',
        Metadata: { sha256: _Hash, claimId: _Claim_Id, photoIndex: String(_Photo_Index) },
    }));

    return _Key;
}

/**
 * Upload photo metadata (Rekognition results, EXIF, GPS, etc.)
 * @param {string} _Claim_Id — parent claim
 * @param {number} _Photo_Index — matching photo index
 * @param {Object} _Metadata — metadata object to store as JSON
 * @returns {string} S3 key
 */
async function _Upload_Photo_Metadata(_Claim_Id, _Photo_Index, _Metadata) {
    const _Key = `claims/${_Claim_Id}/metadata/photo_${String(_Photo_Index).padStart(3, '0')}.json`;

    await _S3_Client.send(new PutObjectCommand({
        Bucket: _Bucket_Name,
        Key: _Key,
        Body: JSON.stringify(_Metadata, null, 2),
        ContentType: 'application/json',
        ServerSideEncryption: 'aws:kms',
    }));

    return _Key;
}

/**
 * Upload a voice note / audio recording
 * @param {string} _Claim_Id — parent claim
 * @param {number} _Audio_Index — 1-based audio number
 * @param {Buffer} _Buffer — audio data
 * @param {string} _Content_Type — MIME type (e.g. audio/ogg)
 * @returns {string} S3 key
 */
async function _Upload_Audio(_Claim_Id, _Audio_Index, _Buffer, _Content_Type = 'audio/ogg') {
    const _Extension = _Content_Type.includes('ogg') ? 'ogg' : 'mp3';
    const _Key = `claims/${_Claim_Id}/audio/voice_${String(_Audio_Index).padStart(3, '0')}.${_Extension}`;

    await _S3_Client.send(new PutObjectCommand({
        Bucket: _Bucket_Name,
        Key: _Key,
        Body: _Buffer,
        ContentType: _Content_Type,
        ServerSideEncryption: 'aws:kms',
    }));

    return _Key;
}

/**
 * Upload a generated document (PDF, etc.)
 * @param {string} _Claim_Id — parent claim
 * @param {string} _Filename — e.g. "claim_form.pdf"
 * @param {Buffer} _Buffer — file data
 * @param {string} _Content_Type — MIME type for the stored object
 * @returns {string} S3 key
 */
async function _Upload_Document(_Claim_Id, _Filename, _Buffer, _Content_Type = 'application/pdf') {
    const _Key = `claims/${_Claim_Id}/documents/${_Filename}`;

    await _S3_Client.send(new PutObjectCommand({
        Bucket: _Bucket_Name,
        Key: _Key,
        Body: _Buffer,
        ContentType: _Content_Type,
        ServerSideEncryption: 'aws:kms',
    }));

    return _Key;
}

/**
 * Upload a Polly-generated audio response
 * @param {string} _Folder — grouping folder (claimId or "responses")
 * @param {Buffer} _Buffer — MP3 audio data
 * @returns {string} S3 key
 */
async function _Upload_Polly_Audio(_Folder, _Buffer) {
    const _Timestamp = Date.now();
    const _Key = `polly/${_Folder}/response_${_Timestamp}.mp3`;

    await _S3_Client.send(new PutObjectCommand({
        Bucket: _Bucket_Name,
        Key: _Key,
        Body: _Buffer,
        ContentType: 'audio/mpeg',
    }));

    return _Key;
}


// ═════════════════════════════════════════════════════════════
//  RETRIEVAL FUNCTIONS
// ═════════════════════════════════════════════════════════════

/**
 * Get a pre-signed URL for secure temporary access to an S3 object
 * @param {string} _Key — S3 object key
 * @param {number} _Expires_In_Seconds — URL validity (default 3600 = 1 hour)
 * @returns {string} Pre-signed URL
 */
async function _Get_Presigned_URL(_Key, _Expires_In_Seconds = 3600) {
    const _Command = new GetObjectCommand({ Bucket: _Bucket_Name, Key: _Key });
    return getSignedUrl(_S3_Client, _Command, { expiresIn: _Expires_In_Seconds });
}

/**
 * Download an object from S3 and return its contents as a Buffer
 * @param {string} _Key — S3 object key
 * @returns {Buffer} Object contents
 */
async function _Get_Object(_Key) {
    const _Response = await _S3_Client.send(new GetObjectCommand({
        Bucket: _Bucket_Name,
        Key: _Key,
    }));

    const _Chunks = [];
    for await (const _Chunk of _Response.Body) {
        _Chunks.push(_Chunk);
    }
    return Buffer.concat(_Chunks);
}

/**
 * List all files under a claim's subfolder
 * @param {string} _Claim_Id — claim identifier
 * @param {string} _Subfolder — e.g. "photos/", "documents/", "metadata/"
 * @returns {Array} List of { key, size, lastModified }
 */
async function _List_Claim_Files(_Claim_Id, _Subfolder = '') {
    const _Prefix = `claims/${_Claim_Id}/${_Subfolder}`;

    const _Response = await _S3_Client.send(new ListObjectsV2Command({
        Bucket: _Bucket_Name,
        Prefix: _Prefix,
    }));

    return (_Response.Contents || []).map(_Item => ({
        key: _Item.Key,
        size: _Item.Size,
        lastModified: _Item.LastModified,
    }));
}


// ═════════════════════════════════════════════════════════════
//  INTEGRITY & MANIFEST
// ═════════════════════════════════════════════════════════════

/**
 * Compute SHA-256 hash of a buffer for tamper detection
 * @param {Buffer} _Buffer — data to hash
 * @returns {string} Hex-encoded SHA-256 hash
 */
function _Compute_SHA256(_Buffer) {
    return crypto.createHash('sha256').update(_Buffer).digest('hex');
}

/**
 * Generate and upload an evidence manifest listing all files in a claim
 * @param {string} _Claim_Id — claim identifier
 * @returns {string} S3 key of the manifest
 */
async function _Generate_Evidence_Manifest(_Claim_Id) {
    const _Photos = await _List_Claim_Files(_Claim_Id, 'photos/');
    const _Audio = await _List_Claim_Files(_Claim_Id, 'audio/');
    const _Documents = await _List_Claim_Files(_Claim_Id, 'documents/');
    const _Metadata = await _List_Claim_Files(_Claim_Id, 'metadata/');

    const _Manifest = {
        claimId: _Claim_Id,
        generatedAt: new Date().toISOString(),
        summary: {
            totalPhotos: _Photos.length,
            totalAudio: _Audio.length,
            totalDocuments: _Documents.length,
            totalMetadata: _Metadata.length,
        },
        files: {
            photos: _Photos,
            audio: _Audio,
            documents: _Documents,
            metadata: _Metadata,
        },
    };

    const _Key = `claims/${_Claim_Id}/manifest.json`;
    await _S3_Client.send(new PutObjectCommand({
        Bucket: _Bucket_Name,
        Key: _Key,
        Body: JSON.stringify(_Manifest, null, 2),
        ContentType: 'application/json',
    }));

    return _Key;
}


// ═════════════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ═════════════════════════════════════════════════════════════

/**
 * Map MIME type to file extension
 */
function _Mime_To_Extension(_Mime_Type) {
    const _Map = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'audio/ogg': 'ogg',
        'audio/mpeg': 'mp3',
        'application/pdf': 'pdf',
    };
    return _Map[_Mime_Type] || 'bin';
}


// ─────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────
module.exports = {
    _Upload_Photo,
    _Upload_Photo_Metadata,
    _Upload_Audio,
    _Upload_Document,
    _Upload_Polly_Audio,
    _Get_Presigned_URL,
    _Get_Object,
    _List_Claim_Files,
    _Compute_SHA256,
    _Generate_Evidence_Manifest,
};
