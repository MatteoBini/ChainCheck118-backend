-- CreateTable
CREATE TABLE "inspection_report" (
    "id" SERIAL NOT NULL,
    "inspection_id" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inspection_report_inspection_id_key" ON "inspection_report"("inspection_id");

-- AddForeignKey
ALTER TABLE "inspection_report" ADD CONSTRAINT "inspection_report_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
