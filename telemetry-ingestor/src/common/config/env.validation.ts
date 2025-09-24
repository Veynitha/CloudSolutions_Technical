import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().port().default(3000),

  MONGO_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),

  //   ALERT_WEBHOOK_URL: Joi.string()
  //     .uri({ scheme: ['http', 'https'] })
  //     .allow('')
  //     .default(''),

  //   INGEST_TOKEN: Joi.string().allow('').default(''),

  LOG_LEVEL: Joi.string().default('log,error,warn'),
});
