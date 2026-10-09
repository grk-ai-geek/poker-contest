-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "Street" AS ENUM ('PREFLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN');

-- CreateEnum
CREATE TYPE "HandActionType" AS ENUM ('POST_SB', 'POST_BB', 'POST_ANTE', 'FOLD', 'CHECK', 'CALL', 'BET', 'RAISE');

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "contestId" TEXT,
    "number" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "maxSeats" INTEGER NOT NULL,
    "status" "TableStatus" NOT NULL DEFAULT 'OPEN',
    "level" JSONB,
    "startingStack" INTEGER NOT NULL DEFAULT 10000,
    "actionSeconds" INTEGER NOT NULL DEFAULT 20,
    "timeBankSeconds" INTEGER NOT NULL DEFAULT 30,
    "handNo" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hand" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "contestId" TEXT,
    "handNo" INTEGER NOT NULL,
    "sb" INTEGER NOT NULL,
    "bb" INTEGER NOT NULL,
    "ante" INTEGER NOT NULL,
    "buttonSeat" INTEGER NOT NULL,
    "board" TEXT[],
    "deck" TEXT[],
    "totalPot" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandPlayer" (
    "handId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seatNo" INTEGER NOT NULL,
    "startStack" INTEGER NOT NULL,
    "endStack" INTEGER NOT NULL,
    "holeCards" TEXT[],
    "shown" BOOLEAN NOT NULL,
    "vpip" BOOLEAN NOT NULL,
    "pfr" BOOLEAN NOT NULL,
    "sawShowdown" BOOLEAN NOT NULL,
    "won" INTEGER NOT NULL,

    CONSTRAINT "HandPlayer_pkey" PRIMARY KEY ("handId","userId")
);

-- CreateTable
CREATE TABLE "HandAction" (
    "handId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "street" "Street" NOT NULL,
    "seatNo" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "HandActionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "toAmount" INTEGER NOT NULL,
    "allIn" BOOLEAN NOT NULL,
    "auto" BOOLEAN NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandAction_pkey" PRIMARY KEY ("handId","seq")
);

-- CreateIndex
CREATE INDEX "Table_status_idx" ON "Table"("status");

-- CreateIndex
CREATE INDEX "Table_contestId_idx" ON "Table"("contestId");

-- CreateIndex
CREATE INDEX "Hand_contestId_idx" ON "Hand"("contestId");

-- CreateIndex
CREATE UNIQUE INDEX "Hand_tableId_handNo_key" ON "Hand"("tableId", "handNo");

-- CreateIndex
CREATE INDEX "HandPlayer_userId_idx" ON "HandPlayer"("userId");

-- AddForeignKey
ALTER TABLE "Hand" ADD CONSTRAINT "Hand_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandPlayer" ADD CONSTRAINT "HandPlayer_handId_fkey" FOREIGN KEY ("handId") REFERENCES "Hand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandPlayer" ADD CONSTRAINT "HandPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandAction" ADD CONSTRAINT "HandAction_handId_fkey" FOREIGN KEY ("handId") REFERENCES "Hand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
