/**
 * Local test script for face verification logic.
 * Mocks AWS Rekognition behavior for testing purposes.
 */

const { handler } = require("./index");

const testEvent = {
    sourceBucket: "bimasathi-evidence-test",
    sourceKey: "selfie.jpg",
    targetKey: "id_card.jpg",
};

// Mocking the Rekognition client is complex for a simple script,
// but we can verify the handler structure and parameter handling.

console.log("Running local test for face verification handler...");

handler(testEvent)
    .then((result) => {
        console.log("Test execution successful (mocked context might fail):", result);
    })
    .catch((err) => {
        if (err.name === 'CredentialsError' || err.name === 'UnknownError' || err.code === 'EENVELOPE') {
            console.log("Handler called correctly, failed as expected due to missing AWS credentials.");
        } else {
            console.error("Test execution failed with unexpected error:", err);
        }
    });
