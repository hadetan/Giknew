-- CreateTable
CREATE TABLE "LinkState" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkState_state_key" ON "LinkState"("state");

-- CreateIndex
CREATE INDEX "LinkState_userId_createdAt_idx" ON "LinkState"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "LinkState" ADD CONSTRAINT "LinkState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
