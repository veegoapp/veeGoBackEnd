import {
  db,
  driversTable,
  driverBonusTargetsTable,
  driverBonusProgressTable,
  walletTransactionsTable,
  driverEarningsTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, lte, gte, sql } from "drizzle-orm";
import { getIO } from "../socket";

export async function updateBonusProgressAfterRide(
  driverId: number,
  rideServiceType: string,
  finalPrice: number,
): Promise<void> {
  try {
    const now = new Date();

    const activeTargets = await db
      .select()
      .from(driverBonusTargetsTable)
      .where(
        and(
          eq(driverBonusTargetsTable.isActive, true),
          eq(driverBonusTargetsTable.isDeleted, false),
          lte(driverBonusTargetsTable.startsAt, now),
          gte(driverBonusTargetsTable.endsAt, now),
        ),
      );

    const relevantTargets = activeTargets.filter((t) => {
      if (t.serviceType === "all") return true;
      if (t.serviceType === "ride") return ["car", "bike", "delivery", "scooter"].includes(rideServiceType);
      return t.serviceType === rideServiceType;
    });

    if (relevantTargets.length === 0) return;

    const [driver] = await db
      .select({ id: driversTable.id, userId: driversTable.userId, name: driversTable.name })
      .from(driversTable)
      .where(eq(driversTable.id, driverId));

    if (!driver) return;

    for (const target of relevantTargets) {
      const increment =
        target.targetType === "earnings_amount" ? finalPrice : 1;
      const targetValue = parseFloat(target.targetValue as string);
      const bonusAmount = parseFloat(target.bonusAmount as string);

      const [existing] = await db
        .select()
        .from(driverBonusProgressTable)
        .where(
          and(
            eq(driverBonusProgressTable.driverId, driverId),
            eq(driverBonusProgressTable.targetId, target.id),
          ),
        );

      if (existing?.isCompleted) continue;

      if (existing) {
        const newValue = parseFloat(existing.currentValue as string) + increment;

        await db
          .update(driverBonusProgressTable)
          .set({
            currentValue: String(newValue.toFixed(2)),
            ...(newValue >= targetValue && !existing.isCompleted
              ? { isCompleted: true, completedAt: now }
              : {}),
          })
          .where(eq(driverBonusProgressTable.id, existing.id));

        if (newValue >= targetValue) {
          await creditBonusToDriver(driver, target.id, target.name, bonusAmount);
        }
      } else {
        const currentValue = increment;
        const completed = currentValue >= targetValue;

        await db.insert(driverBonusProgressTable).values({
          driverId,
          targetId: target.id,
          currentValue: String(currentValue.toFixed(2)),
          isCompleted: completed,
          completedAt: completed ? now : undefined,
        });

        if (completed) {
          await creditBonusToDriver(driver, target.id, target.name, bonusAmount);
        }
      }
    }
  } catch (err) {
    console.error("[bonus-targets] updateBonusProgressAfterRide error:", err);
  }
}

async function creditBonusToDriver(
  driver: { id: number; userId: number; name: string },
  targetId: number,
  targetName: string,
  bonusAmount: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ walletBalance: sql`wallet_balance + ${bonusAmount}` })
      .where(eq(usersTable.id, driver.userId));

    await tx.insert(walletTransactionsTable).values({
      userId: driver.userId,
      amount: String(bonusAmount.toFixed(2)),
      type: "bonus",
      description: `Bonus: ${targetName}`,
    });

    await tx.insert(driverEarningsTable).values({
      driverId: driver.id,
      amount: String(bonusAmount.toFixed(2)),
      type: "milestone_bonus",
      status: "confirmed",
      notes: `Milestone bonus: ${targetName} (target #${targetId})`,
    });
  });

  const [notif] = await db
    .insert(notificationsTable)
    .values({
      userId: driver.userId,
      title: "🎉 Bonus Target Completed!",
      body: `You completed "${targetName}" and earned ${bonusAmount.toFixed(2)} EGP!`,
    })
    .returning();

  const io = getIO();
  if (io && notif) {
    io.to(`driver:${driver.userId}`).emit("driver:bonus:completed", {
      targetId,
      targetName,
      bonusAmount,
      notificationId: notif.id,
    });
  }
}
