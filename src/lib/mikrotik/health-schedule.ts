/** Reserve telemetry separately: slow maintenance must not skip five-minute samples. */
export function createHealthSchedule(
  collect: () => Promise<void>,
  check: () => Promise<void>,
) {
  let collecting = false, checking = false;
  return (enqueue: (job: () => Promise<void>) => void): boolean => {
    const traffic = !collecting, health = !checking;
    if (!traffic && !health) return false;
    if (traffic) collecting = true;
    if (health) checking = true;
    try {
      enqueue(async () => {
        try {
          if (traffic) {
            try { await collect(); }
            finally { collecting = false; }
          }
          if (health) await check();
        } finally {
          if (health) checking = false;
        }
      });
    } catch (error) {
      if (traffic) collecting = false;
      if (health) checking = false;
      throw error;
    }
    return true;
  };
}
