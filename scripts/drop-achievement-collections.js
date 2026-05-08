import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function dropAchievementCollections() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);

    const achievementCollections = ["achievements", "user_achievements"];
    let droppedCount = 0;

    for (const collectionName of achievementCollections) {
      if (collectionNames.includes(collectionName)) {
        console.log(`Dropping collection: ${collectionName}...`);
        await db.dropCollection(collectionName);
        console.log(`✓ Dropped ${collectionName}`);
        droppedCount++;
      } else {
        console.log(`Collection ${collectionName} does not exist, skipping.`);
      }
    }

    console.log("\n=== Migration Summary ===");
    console.log(`Collections dropped: ${droppedCount}`);
    console.log("========================");

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

dropAchievementCollections();
