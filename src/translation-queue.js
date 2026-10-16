export const TRANSLATION_PAUSE_SECONDS = 15;
export async function waitForTranslation(
  seconds,
  {
    stopped,
    onWait,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  const deadline = Date.now() + seconds * 1000;
  let remaining = seconds;
  while (remaining > 0) {
    if (stopped()) return false;
    onWait(Math.ceil(remaining));
    await sleep(Math.min(1000, remaining * 1000));
    remaining = Math.min(remaining - 1, (deadline - Date.now()) / 1000);
  }
  return !stopped();
}
export async function translateWithCooldown(translate, options) {
  if (options.stopped()) return false;
  try {
    await translate();
    return true;
  } catch (error) {
    // One retry for a short cooldown; never a known daily quota.
    if (
      error.status !== 429 ||
      error.code === "AI_DAILY_QUOTA" ||
      !Number.isFinite(error.retryAfter) ||
      error.retryAfter <= 0 ||
      error.retryAfter > 120
    )
      throw error;
    if (!(await waitForTranslation(Math.ceil(error.retryAfter), options)))
      return false;
    await translate();
    return true;
  }
}
