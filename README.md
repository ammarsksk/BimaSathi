# BimaSathi 🌾🤖

**BimaSathi** is a WhatsApp-first, voice-enabled AI crop insurance claim assistant designed to empower Indian farmers. It simplifies the complex process of filing and tracking crop insurance claims through a familiar, multi-lingual, and intelligent interface.

---

## 🚀 Key Features

- **WhatsApp-First Interaction**: Meet farmers where they are. Full claim lifecycle via WhatsApp Chat.
- **Voice & Local Language Support**: Supports English, Hindi, Marathi, Telugu, Tamil, Gujarati, and Kannada with voice message processing.
- **AI-Driven Routing**: Uses LLMs (Claude 3 Haiku/Opus via Amazon Bedrock) for natural language understanding and intelligent conversation steering.
- **Document Intelligence**: Automated data extraction from government IDs and insurance documents using AWS Textract.
- **Face Verification**: Integrated face matching for identity verification using AWS Rekognition.
- **Seamless Evidence Collection**: Easy upload of field photos and documents directly through the chat.
- **Automated Claim Generation**: Generates structured claim reports and appeals automatically.
- **Real-time Status Tracking**: Farmers can track their claim status at any time via the bot.

---

## 🏗️ Technical Architecture

BimaSathi is built on a robust, scalable **AWS Serverless** stack:

- **Compute**: AWS Lambda (Node.js 18.x)
- **Orchestration**: AWS Step Functions for complex claim submission workflows.
- **AI/ML Services**:
  - **Amazon Bedrock**: LLM-powered conversation engine and intent classification.
  - **Amazon Rekognition**: Face verification and image analysis (field photos).
  - **Amazon Textract**: OCR and data extraction from documents.
  - **Amazon Transcribe & Polly**: Voice processing and speech synthesis.
- **Database**: Amazon DynamoDB (NoSQL) for high-performance state management and data storage.
- **Storage**: Amazon S3 for secure evidence (photos/documents) storage.
- **Messaging**: Twilio API for WhatsApp integration.
- **Authentication**: Amazon Cognito for dashboard access.

---

## 📂 Project Structure

```text
.
├── src/
│   ├── lambdas/              # AWS Lambda functions
│   │   ├── auth/             # OTP and Cognito authentication
│   │   ├── conversation-engine/ # Main LLM-driven bot logic
│   │   ├── document-intake/  # Document processing (OCR)
│   │   ├── face-verification/# Identity matching
│   │   ├── whatsapp-webhook/ # Twilio webhook handler
│   │   └── ...               # (status-poller, voice-processor, etc.)
│   └── shared/               # Shared utilities (Twilio, Bedrock, DynamoDB)
├── dashboard/                # Vite-based Operator Dashboard
├── faceVerification/         # Face verification standalone module
├── statemachine/             # Step Functions ASL definitions
└── template.yaml             # AWS SAM infrastructure template
```

---

## 🛠️ Setup & Installation

### Prerequisites
- [AWS CLI](https://aws.amazon.com/cli/) configured with appropriate permissions.
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html) installed.
- [Node.js 18.x](https://nodejs.org/) or later.
- A [Twilio Account](https://www.twilio.com/) with WhatsApp Sandbox or a verified number.

### Deployment
1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd BimaSathi
   ```
2. **Build the application**:
   ```bash
   sam build
   ```
3. **Deploy to AWS**:
   ```bash
   sam deploy --guided
   ```
   *Provide the Twilio Account Sid, Auth Token, and WhatsApp Number when prompted.*

---

## 🧪 Testing

The project includes an integration test suite to verify the end-to-end flow:

```bash
node test_integration.js
```

---

## 📜 License

This project is private and proprietary. All rights reserved.
