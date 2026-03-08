# BimaSathi Local Testing Platform

The Local Testing Platform allows you to rapidly test conversation flows, state jumps, and AI prompts directly from your terminal, without needing to use WhatsApp or deploy to AWS.

## Prerequisites
Ensure you have the root dependencies installed so the simulator can run the local lambdas:
```bash
npm install
```

## Running the Simulator
Start the interactive terminal session by running:
```bash
node scripts/chat-simulator.js
```

## Developer Commands
Inside the simulator, you can type normally to chat with the bot, or use these special developer commands:

### `1. /jump <STATE_NAME>`
Instantly teleport your conversation session to any specific state in the system. The simulator will automatically inject dummy data (Claim ID, Farmer Name, Crop Details) into your DynamoDB session to prevent the engine from crashing due to missing context.
**Example:**
```text
You: /jump DOCUMENT_INTAKE
System Injection Successful Teleported to state: DOCUMENT_INTAKE
BimaSathi: Please send a document...
```

### `2. /upload <absolute_or_relative_path>`
Simulate uploading a media file (Image or PDF) from your local computer directly to the BimaSathi bot. The simulator intercepts the AWS Lambda network calls, prevents it from hitting Meta Graph API, and routes your local file straight into the local Document Intake or Photo Processor Lambdas.
**Example:**
```text
You: /upload ./test_evidence.jpg
System: Simulating Media Fetch for C:\...\test_evidence.jpg
System: ⚡ Intercepting Document Intake Lambda (Running Locally)
```

### `3. /payload <JSON>`
Send raw text to simulate webhook interactive button or list replies.
**Example:**
```text
You: /payload RESUME_BMS-2024-1234
```

### `4. /exit`
Closes the simulator.

## Under the Hood
The simulator works by hot-patching `require.cache` to intercept functions inside `src/shared/whatsapp.js` and patching `LambdaClient.prototype.send` so that cross-lambda invocations execute locally in the exact same Node process, zeroing out cloud roundtrips for maximum speed.
