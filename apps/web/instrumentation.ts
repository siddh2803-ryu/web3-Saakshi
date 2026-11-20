export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkServerEnvironment } = await import("@/lib/config/env");
    checkServerEnvironment();
  }
}
