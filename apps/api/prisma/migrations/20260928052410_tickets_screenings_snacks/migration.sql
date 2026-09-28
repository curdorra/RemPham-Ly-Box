/*
  Warnings:

  - You are about to drop the column `stripeCustomerId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Subscription` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('VIEWER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TicketTier" AS ENUM ('STANDARD', 'TOGETHER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DeliveryWhen" AS ENUM ('ASAP', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "SnackOrderStatus" AS ENUM ('AWAITING_PAYMENT', 'PLACED', 'ACCEPTED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELED');

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_userId_fkey";

-- DropIndex
DROP INDEX "User_stripeCustomerId_key";

-- AlterTable
ALTER TABLE "Title" ADD COLUMN     "pricePaise" INTEGER NOT NULL DEFAULT 7900,
ADD COLUMN     "rentalHours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "trailerUrl" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "stripeCustomerId",
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'VIEWER';

-- DropTable
DROP TABLE "Subscription";

-- DropEnum
DROP TYPE "SubscriptionStatus";

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "provider" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "holderId" TEXT,
    "tier" "TicketTier" NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "giftCode" TEXT,
    "screeningId" TEXT,
    "seat" TEXT,
    "firstPlayedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Screening" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "pricePaise" INTEGER,
    "rows" INTEGER NOT NULL DEFAULT 10,
    "seatsPerRow" INTEGER NOT NULL DEFAULT 14,
    "aisleAfter" INTEGER[] DEFAULT ARRAY[3, 11]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Screening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "userId" TEXT NOT NULL,
    "screeningId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("userId","screeningId")
);

-- CreateTable
CREATE TABLE "PlaybackSession" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybackSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kitchen" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Kitchen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnackItem" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kitchenId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SnackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnackOrder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kitchenId" TEXT NOT NULL,
    "status" "SnackOrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "when" "DeliveryWhen" NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SnackOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnackOrderLine" (
    "id" TEXT NOT NULL,
    "snackOrderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPaise" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "SnackOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_providerOrderId_key" ON "Order"("providerOrderId");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_paidAt_idx" ON "Order"("status", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_giftCode_key" ON "Ticket"("giftCode");

-- CreateIndex
CREATE INDEX "Ticket_holderId_titleId_idx" ON "Ticket"("holderId", "titleId");

-- CreateIndex
CREATE INDEX "Ticket_titleId_createdAt_idx" ON "Ticket"("titleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_screeningId_seat_key" ON "Ticket"("screeningId", "seat");

-- CreateIndex
CREATE INDEX "Screening_startsAt_idx" ON "Screening"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybackSession_ticketId_deviceId_key" ON "PlaybackSession"("ticketId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "SnackItem_slug_key" ON "SnackItem"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SnackOrder_orderId_key" ON "SnackOrder"("orderId");

-- CreateIndex
CREATE INDEX "SnackOrder_kitchenId_status_idx" ON "SnackOrder"("kitchenId", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_screeningId_fkey" FOREIGN KEY ("screeningId") REFERENCES "Screening"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screening" ADD CONSTRAINT "Screening_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_screeningId_fkey" FOREIGN KEY ("screeningId") REFERENCES "Screening"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnackItem" ADD CONSTRAINT "SnackItem_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnackOrder" ADD CONSTRAINT "SnackOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnackOrder" ADD CONSTRAINT "SnackOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnackOrder" ADD CONSTRAINT "SnackOrder_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnackOrderLine" ADD CONSTRAINT "SnackOrderLine_snackOrderId_fkey" FOREIGN KEY ("snackOrderId") REFERENCES "SnackOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnackOrderLine" ADD CONSTRAINT "SnackOrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SnackItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
