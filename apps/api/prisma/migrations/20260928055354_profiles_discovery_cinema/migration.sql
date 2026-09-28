-- DropForeignKey
ALTER TABLE "MyListItem" DROP CONSTRAINT "MyListItem_userId_fkey";

-- DropForeignKey
ALTER TABLE "WatchProgress" DROP CONSTRAINT "WatchProgress_userId_fkey";

-- DropIndex
DROP INDEX "WatchProgress_userId_mediaId_key";

-- DropIndex
DROP INDEX "WatchProgress_userId_updatedAt_idx";

-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "creditsStartSec" INTEGER,
ADD COLUMN     "introEndSec" INTEGER,
ADD COLUMN     "introStartSec" INTEGER;

-- AlterTable
ALTER TABLE "Title" ADD COLUMN     "altNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "creditsStartSec" INTEGER,
ADD COLUMN     "directors" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "introEndSec" INTEGER,
ADD COLUMN     "introStartSec" INTEGER,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'Mizo',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kids" BOOLEAN NOT NULL DEFAULT false,
    "avatar" TEXT NOT NULL DEFAULT 'oxblood',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_name_key" ON "Profile"("userId", "name");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: every existing account gets one profile that inherits its
-- history and My List.
INSERT INTO "Profile" ("id", "userId", "name")
SELECT 'prof_' || "id", "id", "name" FROM "User";

ALTER TABLE "MyListItem" ADD COLUMN "profileId" TEXT;
UPDATE "MyListItem" SET "profileId" = 'prof_' || "userId";
ALTER TABLE "MyListItem" DROP CONSTRAINT "MyListItem_pkey",
ALTER COLUMN "profileId" SET NOT NULL,
DROP COLUMN "userId",
ADD CONSTRAINT "MyListItem_pkey" PRIMARY KEY ("profileId", "titleId");

ALTER TABLE "WatchProgress" ADD COLUMN "profileId" TEXT;
UPDATE "WatchProgress" SET "profileId" = 'prof_' || "userId";
ALTER TABLE "WatchProgress" ALTER COLUMN "profileId" SET NOT NULL,
DROP COLUMN "userId";

-- CreateTable
CREATE TABLE "Rating" (
    "profileId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("profileId","titleId")
);

-- CreateTable
CREATE TABLE "Cinema" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "bookingUrlTemplate" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Cinema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Showtime" (
    "id" TEXT NOT NULL,
    "cinemaId" TEXT NOT NULL,
    "titleId" TEXT,
    "filmName" TEXT NOT NULL,
    "posterUrl" TEXT,
    "language" TEXT,
    "format" TEXT NOT NULL DEFAULT '2D',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Showtime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rating_titleId_idx" ON "Rating"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "Cinema_slug_key" ON "Cinema"("slug");

-- CreateIndex
CREATE INDEX "Showtime_cinemaId_startsAt_idx" ON "Showtime"("cinemaId", "startsAt");

-- CreateIndex
CREATE INDEX "WatchProgress_profileId_updatedAt_idx" ON "WatchProgress"("profileId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchProgress_profileId_mediaId_key" ON "WatchProgress"("profileId", "mediaId");

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchProgress" ADD CONSTRAINT "WatchProgress_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyListItem" ADD CONSTRAINT "MyListItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_cinemaId_fkey" FOREIGN KEY ("cinemaId") REFERENCES "Cinema"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE SET NULL ON UPDATE CASCADE;
