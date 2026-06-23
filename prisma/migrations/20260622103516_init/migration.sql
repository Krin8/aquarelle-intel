-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "logoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "region" TEXT NOT NULL DEFAULT 'Global',
    "segment" TEXT,
    "priceRange" TEXT,
    "complianceNotes" TEXT,
    "description" TEXT,
    "lastScrapedAt" DATETIME,
    "dataFreshness" INTEGER NOT NULL DEFAULT 0,
    "matchScore" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "priceMin" REAL,
    "priceMax" REAL,
    "fit" TEXT,
    "material" TEXT,
    "season" TEXT,
    "imageUrl" TEXT,
    "sourceUrl" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "region" TEXT,
    "buyerType" TEXT NOT NULL DEFAULT 'unknown',
    "confidenceScore" REAL NOT NULL DEFAULT 0.3,
    "source" TEXT NOT NULL DEFAULT 'website',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Contact_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "analysisType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "structuredData" TEXT,
    "modelUsed" TEXT NOT NULL DEFAULT 'llama3.1:8b',
    "tokensUsed" INTEGER,
    "feedbackRating" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIAnalysis_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScrapeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'cheerio',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "contentHash" TEXT,
    "rawContentPath" TEXT,
    "errorMessage" TEXT,
    "pageTitle" TEXT,
    "metaDescription" TEXT,
    "contentLength" INTEGER,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScrapeLog_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Note_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT
);

-- CreateIndex
CREATE INDEX "Brand_status_idx" ON "Brand"("status");

-- CreateIndex
CREATE INDEX "Brand_region_idx" ON "Brand"("region");

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE INDEX "Contact_brandId_idx" ON "Contact"("brandId");

-- CreateIndex
CREATE INDEX "AIAnalysis_brandId_idx" ON "AIAnalysis"("brandId");

-- CreateIndex
CREATE INDEX "AIAnalysis_analysisType_idx" ON "AIAnalysis"("analysisType");

-- CreateIndex
CREATE INDEX "ScrapeLog_brandId_idx" ON "ScrapeLog"("brandId");

-- CreateIndex
CREATE INDEX "Note_brandId_idx" ON "Note"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");
