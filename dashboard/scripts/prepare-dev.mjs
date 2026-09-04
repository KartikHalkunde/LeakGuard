import { createServer } from "node:net";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const server = createServer();

await new Promise((resolvePort, reject) => {
  server.once("error", () => reject(new Error(
    "Port 3000 is already in use. Stop the existing dashboard before starting another one.",
  )));
  server.listen(3000, () => server.close(resolvePort));
});

await rm(resolve(process.cwd(), ".next"), { force: true, recursive: true });
