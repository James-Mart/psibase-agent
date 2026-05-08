import { createApp } from "./app.js";
import { listenPort } from "./config.js";

const app = createApp();

app.listen(listenPort, () => {
  console.log(`manage-agents server listening on http://localhost:${listenPort}`);
});
