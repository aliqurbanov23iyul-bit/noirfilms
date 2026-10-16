import { randomBytes } from "node:crypto";
import { hashPassword } from "../server/auth.js";
import readline from "node:readline";
if (!process.stdin.isTTY)
  throw new Error(
    "Şifrəni gizli daxil etmək üçün interaktiv terminaldan istifadə edin.",
  );
process.stdout.write("Yeni admin şifrəsi (ən azı 14 simvol, giriş gizlidir): ");
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
let password = "";
await new Promise((resolve, reject) => {
  process.stdin.on("keypress", (str, key) => {
    if (key?.ctrl && key.name === "c") return reject(new Error("Ləğv edildi."));
    if (key?.name === "return") {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      return resolve();
    }
    if (key?.name === "backspace") password = password.slice(0, -1);
    else if (str && !key?.ctrl) password += str;
  });
});
if (password.length < 14) throw new Error("Şifrə ən azı 14 simvol olmalıdır.");
console.log(
  "\nAşağıdakı dəyərləri .env və Vercel server dəyişənlərinə əlavə edin:",
);
console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}`);
console.log(`ADMIN_SESSION_SECRET=${randomBytes(48).toString("base64url")}`);
password = "";
