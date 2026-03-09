# BimaSathi

> **WhatsApp-first, voice-enabled AI crop insurance claim assistant for Indian farmers.**

BimaSathi is a comprehensive solution designed to simplify the crop insurance claim process (PMFBY) for Indian farmers. By utilizing familiar platforms like WhatsApp and advanced AI services, BimaSathi provides an accessible, automated, and auditable system for filing claims.

This project was created by **Team Rayquaza EX** for the **AWS AI for Bharat Hackathon**.

---

## Key Features

- **WhatsApp-First Interface:** Eliminates the need for new application installations by allowing farmers to interact through a familiar chat platform.
- **Voice-Enabled Interaction:** Supports voice inputs in multiple Indian languages, including Hindi, Marathi, Telugu, Tamil, Gujarati, Kannada, and English, powered by AWS Transcribe.
- **AI-Powered Evidence Verification:** 
  - **Image Analysis:** Leverages Amazon Rekognition to verify crop damage, identify crop types, and perform content moderation.
  - **Tamper Detection:** Ensures data integrity by computing SHA-256 hashes for all submitted evidence.
  - **Geospatial Awareness:** Validates GPS metadata and WhatsApp location data for accuracy.
- **Automated Claim Generation:** Utilizes AI to generate PMFBY-compliant PDF claim packages, including Cover Letters, Claim Forms, and Evidence Reports.
- **Operator Dashboard:** A professional React-based interface for CSC (Common Service Centre) operators to assist farmers, review claim details, and track submission progress.
- **AI Appeal Assistance:** Automatically generates formal appeal documentation for rejected claims.
- **Secure and Auditable:** Provides a robust audit trail for all transactions, manages digital consent, and utilizes secure S3 storage.

---

## Tech Stack

### Backend (Serverless Infrastructure)
- **Runtime:** Node.js 22.x
- **Framework:** AWS Serverless Application Model (SAM)
- **AI and Machine Learning Services:**
  - **Amazon Bedrock:** Powers the conversation engine and document extraction (utilizing Nova Pro).
  - **Amazon Rekognition:** Provides computer vision for crop and damage verification.
  - **Amazon Transcribe:** Enables multilingual speech-to-text capabilities.
  - **Amazon Polly:** Provides text-to-speech for guided user interactions.
- **Data and Storage:**
  - **Amazon DynamoDB:** A NoSQL database for managing users, claims, sessions, and audit logs.
  - **Amazon S3:** Secure object storage for evidence and generated documents.
- **Communication:** Twilio (WhatsApp Business API and Twilio Verify for OTP authentication).
- **Orchestration:** AWS Lambda & AWS Step Functions (for the Claim Submission Workflow).

### Frontend (Operator Interface)
- **Framework:** React + Vite
- **Styling:** Vanilla CSS (Modern, Professional Aesthetic)
- **Authentication:** Amazon Cognito

---

## Project Structure

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

## Getting Started

### Prerequisites
- Node.js 22.x or higher
- AWS CLI configured with appropriate administrative permissions
- AWS SAM CLI installed
- A Twilio Account with WhatsApp sandbox or production API access

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
    Copy `.env.example` to `.env` in the root directory and populate it with the required AWS and Twilio credentials.

### Deployment

Deploy the serverless infrastructure to AWS:
```bash
npm run deploy:guided
```

### Local Development (Dashboard)

To run the operator dashboard locally for development:
```bash
cd dashboard
npm run dev
```

---

## The Farmer's Workflow

1.  **Initial Contact:** The farmer initiates contact by messaging the BimaSathi WhatsApp number.
2.  **Authentication:** Identity is securely verified via an SMS-based OTP.
3.  **Data Collection:** An AI-driven conversation collects necessary farmer and crop information.
4.  **Evidence Submission:** The farmer uploads multiple photographs documenting the crop damage.
5.  **Automated Validation:** The AI system performs real-time verification of image quality, crop identification, and damage assessment.
6.  **Final Submission:** The system generates a comprehensive claim summary for user verification before final submission.
7.  **Post-Submission:** The farmer can monitor claim status or initiate an appeal if necessary.

---

## License

This project is licensed under the MIT License. See the `LICENSE` file for full details.

---

*Developed by Team Rayquaza EX for the AWS AI for Bharat Hackathon.*
