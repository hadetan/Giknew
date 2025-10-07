-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "githubUserHash" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'fast',
    "linked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installation" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "installationId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Secret" (
    "id" SERIAL NOT NULL,
    "installationId" INTEGER NOT NULL,
    "tokenCipher" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Secret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextMessage" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "threadRootId" BIGINT NOT NULL,
    "role" TEXT NOT NULL,
    "contentEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContextMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StalePrState" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "repoId" BIGINT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "lastNotifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StalePrState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubUserHash_key" ON "User"("githubUserHash");

-- CreateIndex
CREATE INDEX "Installation_installationId_idx" ON "Installation"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "Secret_installationId_key" ON "Secret"("installationId");

-- CreateIndex
CREATE INDEX "ContextMessage_userId_threadRootId_createdAt_idx" ON "ContextMessage"("userId", "threadRootId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_eventType_idx" ON "NotificationLog"("userId", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_userId_externalId_eventType_key" ON "NotificationLog"("userId", "externalId", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "StalePrState_userId_repoId_prNumber_key" ON "StalePrState"("userId", "repoId", "prNumber");

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Secret" ADD CONSTRAINT "Secret_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextMessage" ADD CONSTRAINT "ContextMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StalePrState" ADD CONSTRAINT "StalePrState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
