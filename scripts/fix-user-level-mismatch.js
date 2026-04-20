// Script to fix UserLevel.currentLevel mismatch with User.exp
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/smartlingo";

// Level thresholds: level² × 500
const LEVEL_THRESHOLDS = {
  1: 500,    // 1² × 500
  2: 2000,   // 2² × 500
  3: 4500,   // 3² × 500
  4: 8000,   // 4² × 500
  5: 12500,  // 5² × 500
  6: 18000,  // 6² × 500
};

function getLevelFromXp(totalXp) {
  for (let level = 6; level >= 1; level--) {
    if (totalXp >= LEVEL_THRESHOLDS[level]) {
      return level;
    }
  }
  return 1;
}

function calculateLevelThreshold(levelNumber) {
  if (levelNumber < 1 || levelNumber > 6) {
    return null;
  }
  return levelNumber * levelNumber * 500;
}

async function fixUserLevelMismatch() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    const User = mongoose.model("User", new mongoose.Schema({
      exp: Number,
    }), "users");

    const UserLevel = mongoose.model("UserLevel", new mongoose.Schema({
      userId: mongoose.Schema.Types.ObjectId,
      currentLevel: Number,
      totalXp: Number,
      nextLevelThreshold: Number,
    }), "user_levels");

    // Get all users with their XP
    const users = await User.find({}).select("_id exp").lean();
    console.log(`Found ${users.length} users`);

    let fixedCount = 0;
    let alreadyCorrectCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        const totalXp = user.exp || 0;
        const correctLevel = getLevelFromXp(totalXp);

        // Get UserLevel
        const userLevel = await UserLevel.findOne({ userId: user._id });
        
        if (!userLevel) {
          // Create UserLevel if doesn't exist
          const nextLevelThreshold = calculateLevelThreshold(correctLevel + 1);
          await UserLevel.create({
            userId: user._id,
            currentLevel: correctLevel,
            totalXp,
            nextLevelThreshold,
            testAvailable: false,
          });
          console.log(`Created UserLevel for user ${user._id}: level=${correctLevel}, xp=${totalXp}`);
          fixedCount++;
          continue;
        }

        // Check if level matches
        if (userLevel.currentLevel !== correctLevel) {
          console.log(`Fixing mismatch for user ${user._id}: stored=${userLevel.currentLevel}, correct=${correctLevel}, xp=${totalXp}`);
          
          userLevel.currentLevel = correctLevel;
          userLevel.totalXp = totalXp;
          userLevel.nextLevelThreshold = correctLevel < 6 ? calculateLevelThreshold(correctLevel + 1) : null;
          
          await userLevel.save();
          fixedCount++;
        } else {
          // Update totalXp even if level is correct
          if (userLevel.totalXp !== totalXp) {
            userLevel.totalXp = totalXp;
            await userLevel.save();
          }
          alreadyCorrectCount++;
        }
      } catch (error) {
        console.error(`Error processing user ${user._id}:`, error.message);
        errorCount++;
      }
    }

    console.log("\n=== Migration Summary ===");
    console.log(`Total users: ${users.length}`);
    console.log(`Fixed: ${fixedCount}`);
    console.log(`Already correct: ${alreadyCorrectCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log("========================\n");

  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

fixUserLevelMismatch()
  .then(() => {
    console.log("Migration completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
