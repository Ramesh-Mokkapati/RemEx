/**
 * runtimeEnv — resolve a NEXT_PUBLIC_RMX_* config value with the precedence:
 *
 *   1. process.env[`NEXT_PUBLIC_${key}`]  (baked at build time)
 *   2. fallback supplied by the caller
 *
 * NEXT_PUBLIC_* env vars are inlined into the JS bundle at build time.
 * Set them before running `npm run build` to retarget service hosts/ports.
 */

export function readRuntimeEnv(key, fallback) {
  const buildTime = BUILD_ENV[key];
  if (buildTime !== undefined && buildTime !== "") return buildTime;
  return fallback;
}

// NOTE: each entry below is replaced by Next.js with the literal env value at
// build time. They MUST be referenced as `process.env.NEXT_PUBLIC_*` directly
// (no string concatenation) for that replacement to happen.
const BUILD_ENV = {
  RMX_HOST: process.env.NEXT_PUBLIC_RMX_HOST,
  RMX_AMS_PORT: process.env.NEXT_PUBLIC_RMX_AMS_PORT,
  RMX_UGM_PORT: process.env.NEXT_PUBLIC_RMX_UGM_PORT,
  RMX_EMS_PORT: process.env.NEXT_PUBLIC_RMX_EMS_PORT,
  RMX_RMS_PORT: process.env.NEXT_PUBLIC_RMX_RMS_PORT,
  RMX_DMS_PORT: process.env.NEXT_PUBLIC_RMX_DMS_PORT,
  RMX_WMS_PORT: process.env.NEXT_PUBLIC_RMX_WMS_PORT,
  RMX_AEMS_PORT: process.env.NEXT_PUBLIC_RMX_AEMS_PORT,
  RMX_MMS_PORT: process.env.NEXT_PUBLIC_RMX_MMS_PORT,
  RMX_NMS_PORT: process.env.NEXT_PUBLIC_RMX_NMS_PORT,
  RMX_SMS_PORT: process.env.NEXT_PUBLIC_RMX_SMS_PORT,
  RMX_ALMS_PORT: process.env.NEXT_PUBLIC_RMX_ALMS_PORT,
  RMX_DSMS_PORT: process.env.NEXT_PUBLIC_RMX_DSMS_PORT,
  RMX_LMS_PORT: process.env.NEXT_PUBLIC_RMX_LMS_PORT,
  RMX_ASMS_PORT: process.env.NEXT_PUBLIC_RMX_ASMS_PORT,
  RMX_RSMS_PORT: process.env.NEXT_PUBLIC_RMX_RSMS_PORT,
  RMX_MEVI_PORT: process.env.NEXT_PUBLIC_RMX_MEVI_PORT,
  RMX_AVCMS_PORT: process.env.NEXT_PUBLIC_RMX_AVCMS_PORT,
  RMX_DRMS_PORT: process.env.NEXT_PUBLIC_RMX_DRMS_PORT,
  RMX_RTMS_PORT: process.env.NEXT_PUBLIC_RMX_RTMS_PORT,
  RMX_AMS_HOST: process.env.NEXT_PUBLIC_RMX_AMS_HOST,
  RMX_UGM_HOST: process.env.NEXT_PUBLIC_RMX_UGM_HOST,
  RMX_EMS_HOST: process.env.NEXT_PUBLIC_RMX_EMS_HOST,
  RMX_RMS_HOST: process.env.NEXT_PUBLIC_RMX_RMS_HOST,
  RMX_DMS_HOST: process.env.NEXT_PUBLIC_RMX_DMS_HOST,
  RMX_WMS_HOST: process.env.NEXT_PUBLIC_RMX_WMS_HOST,
  RMX_AEMS_HOST: process.env.NEXT_PUBLIC_RMX_AEMS_HOST,
  RMX_MMS_HOST: process.env.NEXT_PUBLIC_RMX_MMS_HOST,
  RMX_NMS_HOST: process.env.NEXT_PUBLIC_RMX_NMS_HOST,
  RMX_SMS_HOST: process.env.NEXT_PUBLIC_RMX_SMS_HOST,
  RMX_ALMS_HOST: process.env.NEXT_PUBLIC_RMX_ALMS_HOST,
  RMX_DSMS_HOST: process.env.NEXT_PUBLIC_RMX_DSMS_HOST,
  RMX_LMS_HOST: process.env.NEXT_PUBLIC_RMX_LMS_HOST,
  RMX_ASMS_HOST: process.env.NEXT_PUBLIC_RMX_ASMS_HOST,
  RMX_RSMS_HOST: process.env.NEXT_PUBLIC_RMX_RSMS_HOST,
  RMX_MEVI_HOST: process.env.NEXT_PUBLIC_RMX_MEVI_HOST,
  RMX_AVCMS_HOST: process.env.NEXT_PUBLIC_RMX_AVCMS_HOST,
  RMX_DRMS_HOST: process.env.NEXT_PUBLIC_RMX_DRMS_HOST,
  RMX_RTMS_HOST: process.env.NEXT_PUBLIC_RMX_RTMS_HOST,
  GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  RMXDATA: process.env.NEXT_PUBLIC_RMXDATA,
};
