import readline from "node:readline";
import { handleMessage } from "./engine.js";

// Terminal chat: same engine as the web/SMS channels.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('DailyScheduler CLI — try "plan my day", then "book it!". Type "exit" to quit.\n');

function ask() {
  rl.question("> ", async (line) => {
    const text = line.trim();
    if (["exit", "quit"].includes(text.toLowerCase())) {
      rl.close();
      return;
    }
    try {
      const reply = await handleMessage("cli", text);
      console.log("\n" + reply + "\n");
    } catch (err) {
      console.error("\nError: " + err.message + "\n");
    }
    ask();
  });
}

ask();
