const path = require('path');
const express = require('express');
const env = require('./config/env');
const logger = require('./utils/logger');
const dashboardRoutes = require('./routes/dashboard.routes');
const scoringRoutes = require('./routes/scoring.routes');
const healthRoutes = require('./routes/health.routes');
const analysisRoutes = require('./routes/analysis.routes');
const macroRoutes = require('./routes/macro.routes');
const geopoliticsRoutes = require('./routes/geopolitics.routes');
const knowledgeRoutes = require('./routes/knowledge.routes');

const app = express();

app.set('trust proxy', true);
app.use(express.json());

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const consumer = {
    ip: req.ip,
    userAgent: req.get('user-agent') || 'unknown',
  };

  logger.info('http.request.start', {
    method: req.method,
    path: req.originalUrl,
    consumer,
  });

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info('http.request.finish', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      consumer,
    });
  });

  next();
});

app.use('/vendor/bootstrap', express.static(path.join(env.ROOT_DIR, 'node_modules/bootstrap/dist')));
app.use('/vendor/chart.js', express.static(path.join(env.ROOT_DIR, 'node_modules/chart.js/dist')));
app.use(express.static(path.join(env.ROOT_DIR, 'client')));

app.use('/api/health', healthRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/scoring', scoringRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/macro', macroRoutes);
app.use('/api/geopolitics', geopoliticsRoutes);
app.use('/api/knowledge', knowledgeRoutes);

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(env.ROOT_DIR, 'client/index.html'));
});

app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404,
    },
  });
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  const logPayload = {
    path: req.path,
    status,
    stack: env.NODE_ENV === 'development' ? error.stack : undefined,
  };

  if (status >= 500) {
    logger.error(error.message, logPayload);
  } else {
    logger.warn(error.message, logPayload);
  }

  res.status(status).json({
    error: {
      message: status === 500 ? 'Internal server error' : error.message,
      status,
      detail: env.NODE_ENV === 'development' ? error.message : undefined,
      supportedIntervals: error.supportedIntervals,
    },
  });
});

if (require.main === module) {
  app.listen(env.PORT, () => {
    logger.info(`Market intelligence dashboard listening on http://localhost:${env.PORT}`);
  });
}

module.exports = app;
