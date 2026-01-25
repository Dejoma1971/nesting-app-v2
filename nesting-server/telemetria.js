// nesting-server/telemetria.js
const client = require("prom-client");
const winston = require("winston");
const { v4: uuidv4 } = require("uuid");

const isProduction =
  process.env.NODE_ENV === "nesting-dev" ||
  process.env.NODE_ENV === "production";

if (isProduction) {
  const uppercaseLevel = winston.format((info) => {
    info.level = info.level.toUpperCase();
    return info;
  });

  const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
      uppercaseLevel(),
      winston.format.timestamp({ format: "YYYY-MM-DDTHH:mm:ss.SSSZ" }),
      winston.format.json(),
    ),
    defaultMeta: { service: "nesting-app", environment: process.env.NODE_ENV },
    transports: [new winston.transports.Console()],
  });

  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const httpRequestDurationMicroseconds = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "Duração das requisições HTTP em segundos",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 10],
  });
  register.registerMetric(httpRequestDurationMicroseconds);

  // MIDDLEWARE ÚNICO E TURBINADO
  app.use((req, res, next) => {
    req.id = uuidv4();
    const startHR = process.hrtime();

    res.on("finish", () => {
      const durationHR = process.hrtime(startHR);
      const durationSeconds = durationHR[0] + durationHR[1] / 1e9;
      const durationInMs = (durationSeconds * 1000).toFixed(3);

      // 1. Atualiza métricas do Prometheus
      httpRequestDurationMicroseconds
        .labels(
          req.method,
          req.route ? req.route.path : req.path,
          res.statusCode,
        )
        .observe(durationSeconds);

      // 2. Gera o log rico para o Loki
      logger.info("HTTP Request processed", {
        correlation_id: req.id,
        method: req.method,
        status: res.statusCode,
        url: req.originalUrl || req.url,
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
        country: req.headers["cf-ipcountry"] || "Unknown",
        user_agent: req.headers["user-agent"],
        latency: `${durationInMs} ms`,
        response_time_ms: durationInMs,
      });
    });
    next();
  });

  app.get("/metrics", async (req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });
}

