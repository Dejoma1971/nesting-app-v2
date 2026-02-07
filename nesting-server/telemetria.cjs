// nesting-server/telemetria.js
const client = require("prom-client");
const winston = require("winston");
const { v4: uuidv4 } = require("uuid");

module.exports = function setupTelemetry(app) {
  // --- 1. Configuração do Winston ---
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
    defaultMeta: {
      service: "nesting-app",
      environment: process.env.NODE_ENV || "dev",
    },
    transports: [new winston.transports.Console()],
  });

  // --- 2. Configuração do Prometheus ---
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const httpRequestDurationMicroseconds = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "Duração das requisições HTTP em segundos",
    labelNames: ["method", "route", "status_code", "domain"], // 🔑 Incluindo Domain
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 10],
  });
  register.registerMetric(httpRequestDurationMicroseconds);

  // --- 3. Middleware Unificado (Logs + Métricas + Tamanho) ---
  app.use((req, res, next) => {
    const domain = req.headers.host || req.hostname;
    req.id = uuidv4();
    req.startTime = Date.now();
    const startHR = process.hrtime();

    // Captura tamanho do request
    const requestSize = Number(req.headers["content-length"]) || 0;
    let responseSize = 0;

    // Interceptação para medir o tamanho da resposta
    const oldWrite = res.write;
    const oldEnd = res.end;

    res.write = function (chunk) {
      if (chunk) responseSize += chunk.length;
      return oldWrite.apply(res, arguments);
    };

    res.end = function (chunk) {
      if (chunk) responseSize += chunk.length;
      oldEnd.apply(res, arguments);
    };

    res.on("finish", () => {
      // Cálculo de tempo
      const duration = Date.now() - req.startTime;
      const durationHR = process.hrtime(startHR);
      const durationSeconds = durationHR[0] + durationHR[1] / 1e9;

      const isError = res.statusCode >= 400;

      // 1. Atualiza Prometheus
      httpRequestDurationMicroseconds
        .labels(
          req.method,
          req.route ? req.route.path : req.path,
          res.statusCode,
          domain,
        )
        .observe(durationSeconds);

      // 2. Log Estruturado
      const logData = {
        correlation_id: req.id,
        domain: domain,
        client_ip: req.headers["cf-connecting-ip"] || req.ip,
        method: req.method,
        url: req.originalUrl || req.url,
        status: res.statusCode,
        duration: `${duration}ms`,
        latency: `${duration}ms`, // Para compatibilidade com buscas antigas
        request_body_size: requestSize,
        response_body_size: responseSize,
        user_id: req.user?.id || "anonymous",
      };

      if (isError) {
        logData.error = {
          type: res.statusMessage || "HTTP Error",
          stack_trace: req.lastErrorStack || null,
          validation_details: req.validationErrors || null,
        };
        logger.error(`Request failed with status ${res.statusCode}`, logData);
      } else {
        logger.info("HTTP Request processed", logData);
      }
    });

    next();
  });

  // --- 4. Endpoint de Métricas ---
  app.get("/metrics", async (req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });

  // --- 5. Error Handler (Captura de Stack) ---
  // Nota: Este deve ser o último middleware no server.cjs,
  // mas definimos a função aqui para centralizar o logger.
  app.useTelemetryError = (err, req, res, next) => {
    req.lastErrorStack = err.stack;
    logger.error("Unhandled Exception", {
      correlation_id: req.id,
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({
      error: "Internal Server Error",
      requestId: req.id,
    });
  };

  console.log("📊 Telemetria (Logs + Métricas) configurada com sucesso.");
};
