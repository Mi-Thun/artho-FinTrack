-- DropForeignKey
ALTER TABLE "Reminder" DROP CONSTRAINT "Reminder_userId_fkey";

-- DropTable
DROP TABLE "Reminder";

-- DropEnum
DROP TYPE "ReminderKind";
