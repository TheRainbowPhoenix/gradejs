import { Application, log } from "./deps.ts";
import router from "./routes.ts";

await log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler("INFO"),
  },
  loggers: {
    default: {
      level: "INFO",
      handlers: ["console"],
    },
  },
});

const app: Application = new Application();
const port = 8000;

// Logger
app.use(async (ctx, next) => {
  await next();
  const rt = ctx.response.headers.get("X-Response-Time");
  log.info(`${ctx.request.method} ${ctx.request.url} - ${rt}`);
});

app.use(router.routes());
app.use(router.allowedMethods());

log.info(`API server starting on http://localhost:${port}`);
await app.listen({ port });