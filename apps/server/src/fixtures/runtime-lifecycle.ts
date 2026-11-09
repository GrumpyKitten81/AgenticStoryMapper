import { setTimeout } from "node:timers/promises";
import { writeFileSync } from "node:fs";
import { McpToolRegistry } from "@storymapper/mcp";

const call = McpToolRegistry.prototype.call;
McpToolRegistry.prototype.call = async function (...args: Parameters<typeof call>) {
  if (args[0] === "ListProjects") {
    process.send?.({ type: "call-entered" });
    if (process.env.STORYMAPPER_TEST_CALL_ENTERED) writeFileSync(process.env.STORYMAPPER_TEST_CALL_ENTERED, "entered");
    await setTimeout(2600);
  }
  return call.apply(this, args);
};
process.on("message", (message: unknown) => {
  if (message && typeof message === "object" && "type" in message && message.type === "fixture-signal" && "signal" in message && (message.signal === "SIGINT" || message.signal === "SIGTERM")) process.emit(message.signal);
});
await import("@storymapper/server/main");
