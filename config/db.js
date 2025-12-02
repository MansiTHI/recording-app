import mongoose from "mongoose";
import dotenv from "dotenv";
import Session from "../models/sessionModel.js";

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected successfully");
    startSessionCleanup();
  } catch (error) {
    console.error("❌ Error connecting to MongoDB:", error.message);
    throw error; // ⬅ THIS IS CRITICAL
  }
};

const startSessionCleanup = () => {
  console.log("🔄 Session cleanup scheduler started (runs every 30 seconds)");

  const cleanupInterval = setInterval(async () => {
    try {
      const now = new Date();

      const result = await Session.updateMany(
        { isActive: true, expiresAt: { $lt: now } },
        { $set: { isActive: false } }
      );

      if (result.modifiedCount > 0) {
        console.log(
          `⏰ Revoked ${
            result.modifiedCount
          } expired session(s) at ${now.toISOString()}`
        );
      }
    } catch (error) {
      console.error("❌ Session cleanup error:", error.message);
    }
  }, 30000);

  process.on("SIGINT", () => {
    clearInterval(cleanupInterval);
    process.exit(0);
  });
};

export default connectDB;
