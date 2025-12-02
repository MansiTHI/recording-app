import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import { getUserProfile, updateProfile } from "./controllers/authController.js";
import authMiddleware from "./middleware/authMiddleware.js";
import firefliesRoutes from "./routes/firefliesRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import recordingRoutes from "./routes/recordingRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import cors from 'cors';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// CORS for Replit
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// --- Register routes before server start ---
app.use("/api/auth", authRoutes);
app.get("/api/profile", authMiddleware, getUserProfile);
app.put("/api/profile", authMiddleware, updateProfile);
app.use("/api/fireflies", firefliesRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/recordings", recordingRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);

// --- FIX: Start server only AFTER DB connection ---
const startServer = async () => {
  try {
    await connectDB(); // ⬅ wait for MongoDB connection
    app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${port}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
  }
};

startServer();
