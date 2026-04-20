import "dotenv/config";

import cors from "cors";
import express from "express";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";

import connectDatabase from "./config/db.js";
import swaggerSpec from "./config/swagger.js";
import apiRoutes from "./routes/index.js";
import { attachUserFromToken } from "./middleware/auth.middleware.js";
import { bootstrapPaymentSyncScheduler } from "./services/payment-sync-scheduler.service.js";

const app = express();
const PORT = process.env.PORT || 5000;

const defaultCorsOrigins = [
  "http://localhost:3000",
  "https://smartlingo-flax.vercel.app",
];

const configuredCorsOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const hasWildcardCorsOrigin = configuredCorsOrigins.includes("*");

const allowedCorsOrigins = [
  ...new Set([
    ...defaultCorsOrigins,
    ...configuredCorsOrigins.filter((origin) => origin !== "*"),
  ]),
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (hasWildcardCorsOrigin || allowedCorsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials:
    String(process.env.CORS_CREDENTIALS || "false").toLowerCase() === "true",
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use(attachUserFromToken);

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "ELapp backend is running",
  });
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/api", apiRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || "Internal server error",
  });
});

const startServer = async () => {
  try {
    await connectDatabase();
    const isSchedulerStarted = bootstrapPaymentSyncScheduler();

    if (isSchedulerStarted) {
      console.log("Payment sync scheduler started");
    }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
