export const config = {
  port: Number(process.env.PORT ?? 8080),
  dataDir: process.env.DATA_DIR ?? "./data",
  nvdApiKey: process.env.NVD_API_KEY,
};
