# 🎨 Aquarelle-intel

Aquarelle-intel is a data intelligence and scraping platform built with Next.js. It leverages Puppeteer for web scraping and multiple API providers for data enrichment and intelligence.

## 🛠 Tech Stack

- **Framework:** Next.js 16 (React)
- **Database:** Prisma ORM with SQLite
- **Scraping:** Puppeteer
- **AI/LLM Integration:** Google Generative AI (Gemini)
- **Data Processing:** SheetJS (xlsx) for spreadsheet management
- **Styling:** CSS/Tailwind

## 🚀 Local Development Setup

Follow these instructions to get the **Aquarelle-intel** project up and running on your local machine.

### 1. Prerequisites
Ensure you have the following installed:
- **Node.js** (v18 or newer recommended)
- **npm** (comes with Node.js)
- **Git**

### 2. Clone and Install Dependencies
Clone the repository and install the required dependencies.

```bash
git clone <YOUR_GIT_REPO_URL_HERE>
cd Aquarelle-intel

# Install all Node.js dependencies
npm install
```

### 3. Configure Environment Variables
Create a new file named `.env` in the root directory of the project. Copy the template below and fill in the missing API keys provided by the team:

```env
# Database Configuration (Local SQLite)
DATABASE_URL="file:./prisma/dev.db"

# Generative AI Key
GEMINI_API_KEY="your_gemini_api_key_here"

# Scraper & Data Enrichment API Keys
HUNTER_API_KEY="your_hunter_api_key_here"
MEV_API_KEY="your_mev_api_key_here"
APOLLO_API_KEY="your_apollo_api_key_here"
FINDYMAIL_API_KEY="your_findymail_api_key_here"
DROPCONTACT_API_KEY="your_dropcontact_api_key_here"
PDL_API_KEY="your_pdl_api_key_here"
PROSPEO_API_KEY="your_prospeo_api_key_here"
SERPER_API_KEY="your_serper_api_key_here"
ROCKETREACH_API_KEY="your_rocketreach_api_key_here"

# Optional: Puppeteer Chrome executable overrides (Uncomment if needed on Linux/WSL)
# CHROME_BIN="/usr/bin/google-chrome"
# PUPPETEER_EXECUTABLE_PATH="/usr/bin/google-chrome"
```

### 4. Database Setup (Prisma)
This project uses Prisma as an ORM with a local SQLite database (`dev.db`). Initialize the database by running:

```bash
# Generate the Prisma Client
npx prisma generate

# Apply the schema to the database (creates dev.db inside the /prisma folder)
npx prisma db push
```

### 5. Start the Development Server
Once everything is installed and configured, start the local Next.js development server:

```bash
npm run dev
```

The application runs on port `3000` by default. 
Open [http://localhost:3000](http://localhost:3000) in your browser to view it.
