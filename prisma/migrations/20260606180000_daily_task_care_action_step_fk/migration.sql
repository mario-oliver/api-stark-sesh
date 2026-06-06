-- Add FK from DailyTask.careActionStepId to CareActionStep (relation used for media includes)
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_careActionStepId_fkey" FOREIGN KEY ("careActionStepId") REFERENCES "CareActionStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
