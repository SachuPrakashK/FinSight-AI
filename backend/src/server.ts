import "dotenv/config";
import { config } from "./config.js";
import { app } from "./app.js";

const port = config.API_PORT;

app.listen(port, () => {
  console.info(`FinSight API listening on port ${port}`);
});
