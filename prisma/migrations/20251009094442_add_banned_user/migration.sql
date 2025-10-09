-- CreateTable
CREATE TABLE "BannedUser" (
    "id" SERIAL NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BannedUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BannedUser_telegramId_key" ON "BannedUser"("telegramId");
