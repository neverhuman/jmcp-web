import fs from "node:fs";

const files = ["package.json", "package-lock.json", "apps/cockpit/package.json", "apps/cockpit/package-lock.json"];
const forbidden = ["three", "@react-three/fiber", "@react-three/drei", "@react-three/rapier"];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const name of forbidden) {
    if (text.includes(`"${name}"`)) {
      throw new Error(`${file} contains forbidden dependency ${name}`);
    }
  }
}

console.log("no forbidden three/@react-three dependencies found");

