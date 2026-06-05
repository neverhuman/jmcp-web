import fs from "node:fs";

const file = "apps/cockpit/src/gen/jmcp-core.ts";
if (!fs.existsSync(file)) {
  throw new Error(`${file} is missing`);
}

const text = fs.readFileSync(file, "utf8");
for (const marker of ["CoreRuntime", "CoreContract", "fetchCoreRuntime", "fetchCoreContract"]) {
  if (!text.includes(marker)) {
    throw new Error(`${file} is missing ${marker}`);
  }
}

console.log("generated core client present");

