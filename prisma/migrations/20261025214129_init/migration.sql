-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OPERATORE', 'SOCCORRITORE', 'ISPETTORE');

-- CreateTable
CREATE TABLE "app_user" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle" (
    "id" SERIAL NOT NULL,
    "plate" TEXT NOT NULL,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_item" (
    "id" SERIAL NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_submission" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection" (
    "id" SERIAL NOT NULL,
    "submission_id" INTEGER NOT NULL,
    "inspector_id" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "inspected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_username_key" ON "app_user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_plate_key" ON "vehicle"("plate");

-- CreateIndex
CREATE INDEX "checklist_submission_vehicle_id_idx" ON "checklist_submission"("vehicle_id");

-- CreateIndex
CREATE INDEX "checklist_submission_user_id_idx" ON "checklist_submission"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_submission_id_key" ON "inspection"("submission_id");

-- CreateIndex
CREATE INDEX "inspection_inspector_id_idx" ON "inspection"("inspector_id");

-- AddForeignKey
ALTER TABLE "checklist_submission" ADD CONSTRAINT "checklist_submission_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_submission" ADD CONSTRAINT "checklist_submission_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "checklist_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
