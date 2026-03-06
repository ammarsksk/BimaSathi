const { RekognitionClient, CompareFacesCommand } = require("@aws-sdk/client-rekognition");

const rekognitionClient = new RekognitionClient({ region: process.env.AWS_REGION || "us-east-1" });

/**
 * Compares faces in two images from S3.
 * @param {Object} event - The S3 event or direct payload containing image keys.
 * @param {string} event.sourceBucket - The S3 bucket name.
 * @param {string} event.sourceKey - The selfie image key.
 * @param {string} event.targetKey - The government ID image key.
 */
exports.handler = async (event) => {
    console.log("Starting face verification check...", JSON.stringify(event));

    const { sourceBucket, sourceKey, targetKey } = event;

    if (!sourceBucket || !sourceKey || !targetKey) {
        throw new Error("Missing required parameters: sourceBucket, sourceKey, or targetKey.");
    }

    const params = {
        SourceImage: {
            S3Object: {
                Bucket: sourceBucket,
                Name: sourceKey,
            },
        },
        TargetImage: {
            S3Object: {
                Bucket: sourceBucket, // Assuming both are in the same bucket
                Name: targetKey,
            },
        },
        SimilarityThreshold: 80, // High confidence threshold
    };

    try {
        const command = new CompareFacesCommand(params);
        const data = await rekognitionClient.send(command);

        const faceMatches = data.FaceMatches || [];
        const isMatch = faceMatches.length > 0;
        const similarity = isMatch ? faceMatches[0].Similarity : 0;

        console.log(`Face verification result: match=${isMatch}, similarity=${similarity}%`);

        return {
            isMatch,
            similarity,
            faceCount: faceMatches.length,
            message: isMatch ? "Faces matched successfully." : "Faces did not match.",
        };
    } catch (err) {
        console.error("Error during Rekognition Face Comparison:", err);
        throw err;
    }
};
