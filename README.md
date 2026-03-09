# 🌾 BimaSathi

> **WhatsApp-first, voice-enabled AI crop insurance claim assistant for Indian farmers.**

BimaSathi aims to bridge the gap between farmers and insurance providers by simplifying the complex process of filing crop insurance claims (PMFBY). By leveraging familiar platforms like WhatsApp and advanced AI, BimaSathi makes claim filing accessible, automated, and auditable.

---

## ✨ Key Features

- **📱 WhatsApp-First Interface:** No new apps to install. Farmers interact through a familiar chat interface.
- **🎙️ Voice-Enabled Interaction:** Supports voice notes in multiple Indian languages (Hindi, Marathi, Telugu, Tamil, Gujarati, Kannada, English) via AWS Transcribe.
- **🤖 AI-Powered Evidence Verification:** 
  - **Image Analysis:** Uses Amazon Rekognition to verify crop damage, detect crop types, and moderate content.
  - **Tamper Detection:** Computes SHA-256 hashes for all submitted evidence.
  - **Location Awareness:** Verifies GPS metadata and WhatsApp location shares.
- **📄 Automated Claim Generation:** Generates PMFBY-compliant PDF claim packs (Cover Letter, Claim Form, Evidence Report) using AI.
- **🖥️ Operator Dashboard:** A React-based dashboard for CSC (Common Service Centre) operators to assist farmers, review claims, and track submissions.
- **⚖️ AI Appeal Assistance:** Automatically generates formal appeal letters for rejected claims.
- **🔒 Secure & Auditable:** Full audit trail for every action, digital consent management, and secure S3 storage.

---

## 🛠️ Tech Stack

### Backend (Serverless)
- **Runtime:** Node.js 22.x
- **Framework:** AWS Serverless Application Model (SAM)
- **AI/ML:**
  - **Amazon Bedrock:** LLM-powered conversation engine and document extraction (Nova Pro).
  - **Amazon Rekognition:** Computer vision for crop and damage verification.
  - **Amazon Transcribe:** Multilingual speech-to-text.
  - **Amazon Polly:** Text-to-speech for voice-based guidance.
- **Storage:**
  - **Amazon DynamoDB:** NoSQL database for users, claims, sessions, and audit logs.
  - **Amazon S3:** Secure bucket for evidence and generated documents.
- **Messaging:** Twilio (WhatsApp API and Verify for OTP).
- **Compute:** AWS Lambda & AWS Step Functions (Claim Submission Workflow).

### Frontend (Dashboard)
- **Framework:** React + Vite
- **Styling:** Vanilla CSS (Modern, Premium Aesthetic)
- **Authentication:** Amazon Cognito

---

## 📂 Project Structure

```text
BimaSathi/
├── dashboard/              # React-based Operator Dashboard
│   ├── src/                # Frontend source code
│   └── public/             # Static assets
├── src/                    # Backend source code
│   ├── lambdas/            # AWS Lambda functions (Webhook, Engine, Processors)
│   ├── shared/             # Shared utilities (AWS SDK, Constants, Helpers)
│   └── vendor/             # Third-party integrations
├── statemachine/           # AWS Step Functions definitions (ASL)
├── scripts/                # Deployment and utility scripts
├── template.yaml           # AWS SAM Infrastructure as Code (IaC)
├── package.json            # Backend dependencies and scripts
└── .env.example            # Environment variable template
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js 22.x+](https://nodejs.org/)
- [AWS CLI](https://aws.amazon.com/cli/) configured with appropriate permissions.
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
- [Twilio Account](https://www.twilio.com/) with WhatsApp sandbox or production access.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-repo/BimaSathi.git
    cd BimaSathi
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    cd dashboard && npm install
    ```

3.  **Configure Environment Variables:**
    Copy `.env.example` to `.env` in the root and fill in your AWS and Twilio credentials.

### Deployment

Deploy the serverless stack to AWS:
```bash
npm run deploy:guided
```

### Running the Dashboard Locally

```bash
cd dashboard
npm run dev
```

---

## 🌾 The Farmer's Journey

1.  **Greeting:** Farmer sends "Hi" to the BimaSathi WhatsApp number.
2.  **OTP:** Securely verifies identity via SMS OTP.
3.  **Details:** AI-guided conversation to collect farmer and crop details.
4.  **Evidence:** Farmer uploads 3+ photos of the crop damage.
5.  **Validation:** AI instantly verifies quality, crop type, and damage.
6.  **Submission:** AI generates a summary for confirmation and then submits the claim.
7.  **Status:** Farmer can check status or appeal a rejection anytime.

---

## ⚖️ License

This project is licensed under the MIT License - see the `LICENSE` file for details.

---

*Built with ❤️ for Indian Farmers.*
