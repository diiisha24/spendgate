/*
  Warnings:

  - Added the required column `approverRole` to the `Approval` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reference` to the `PurchaseRequest` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseRequestId" TEXT NOT NULL,
    "approverRole" TEXT NOT NULL,
    "approverName" TEXT,
    "approvalLevel" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "comments" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Approval_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Approval" ("approvalLevel", "approverName", "comments", "createdAt", "id", "purchaseRequestId", "status", "updatedAt") SELECT "approvalLevel", "approverName", "comments", "createdAt", "id", "purchaseRequestId", "status", "updatedAt" FROM "Approval";
DROP TABLE "Approval";
ALTER TABLE "new_Approval" RENAME TO "Approval";
CREATE INDEX "Approval_status_approverRole_idx" ON "Approval"("status", "approverRole");
CREATE UNIQUE INDEX "Approval_purchaseRequestId_approvalLevel_key" ON "Approval"("purchaseRequestId", "approvalLevel");
CREATE TABLE "new_PurchaseRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseRequest" ("amount", "category", "createdAt", "departmentId", "description", "id", "quantity", "requesterName", "status", "title", "updatedAt") SELECT "amount", "category", "createdAt", "departmentId", "description", "id", "quantity", "requesterName", "status", "title", "updatedAt" FROM "PurchaseRequest";
DROP TABLE "PurchaseRequest";
ALTER TABLE "new_PurchaseRequest" RENAME TO "PurchaseRequest";
CREATE UNIQUE INDEX "PurchaseRequest_reference_key" ON "PurchaseRequest"("reference");
CREATE INDEX "PurchaseRequest_departmentId_status_idx" ON "PurchaseRequest"("departmentId", "status");
CREATE INDEX "PurchaseRequest_status_idx" ON "PurchaseRequest"("status");
CREATE INDEX "PurchaseRequest_createdAt_idx" ON "PurchaseRequest"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
