// Migration script to populate user_levels collection from existing User.exp data
import mongoose from "mongoose";
import dotenv from "dotenv";
import { User, UserLevel } from "../models/index.js";

dotenv.config();

// Level threshold calculation: threshold = level² × 500
const calculateLevelThreshold = (level) => {
  return level * level * 500;
};

// Determine current level from total XP
const getLevelFromXp = (totalXp) => {
  for (let level = 6; level >= 1; level--) {
    const threshold = calculateLevelThreshold(level);
    if (totalXp >= threshold) {
      return level;
    }
  }
  return 1; // Default to level 1
};

// Main migration function
const migrateUserLevels = async () => {
  try {
    console.log("🚀 Starting user levels migration...");

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Fetch all users
    const users = await User.find({}).select("_id exp");
    console.log(`📊 Found ${users.length} users to migrate`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Process each user
    for (const user of users) {
      try {
        const totalXp = user.exp || 0;
        const currentLevel = getLevelFromXp(totalXp);
        const nextLevelThreshold = calculateLevelThreshold(currentLevel + 1);

        // Check if UserLevel already exists
        const existingUserLevel = await UserLevel.findOne({ userId: user._id });

        if (existingUserLevel) {
          // Update existing record
          existingUserLevel.totalXp = totalXp;
          existingUserLevel.currentLevel = currentLevel;
          existingUserLevel.nextLevelThreshold = nextLevelThreshold;
          await existingUserLevel.save();
          console.log(`🔄 Updated UserLevel for user ${user._id}`);
        } else {
          // Create new UserLevel document
          await UserLevel.create({
            userId: user._id,
            currentLevel,
            totalXp,
            nextLevelThreshold,
            testAvailable: false,
            lastTestAttemptAt: null,
            xpAtLastFailedTest: null,
          });
          console.log(`✨ Created UserLevel for user ${user._id}`);
        }

        successCount++;
      } catch (error) {
        errorCount++;
        errors.push({
          userId: user._id,
          error: error.message,
        });
        console.error(`❌ Error migrating user ${user._id}:`, error.message);
      }
    }

    // Summary
    console.log("\n📈 Migration Summary:");
    console.log(`✅ Successfully migrated: ${successCount} users`);
    console.log(`❌ Failed: ${errorCount} users`);

    if (errors.length > 0) {
      console.log("\n⚠️  Errors:");
      errors.forEach((err) => {
        console.log(`  - User ${err.userId}: ${err.error}`);
      });
    }

    console.log("\n✅ Migration completed!");
  } catch (error) {
    console.error("💥 Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
  }
};

// Run migration
migrateUserLevels();
