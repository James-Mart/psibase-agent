import { createApp } from "./app.js";
import { listenPort } from "./config.js";
import { startBuildReconciler } from "./services/builds.js";
import { startChainReconciler } from "./services/chains.js";
import { primePrCache } from "./services/pullRequests.js";

const app = createApp();

app.listen(listenPort, () => {
  console.log(`manage-agents server listening on http://localhost:${listenPort}`);
  void primePrCache();
  startBuildReconciler();
  startChainReconciler();
});
