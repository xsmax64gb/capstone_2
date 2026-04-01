/**
 * Seed sample learn maps / steps / achievement for local dev.
 * Usage: node scripts/seed-learn-maps.js
 */
import "dotenv/config";
import mongoose from "mongoose";

import connectDatabase from "../config/db.js";
import {
  LearnAchievement,
  Map,
  Step,
} from "../models/index.js";
import { recalculateMapTotalXP } from "../services/learn-map-progress.service.js";

const run = async () => {
  await connectDatabase();

  await LearnAchievement.findOneAndUpdate(
    { key: "first_boss_win" },
    {
      key: "first_boss_win",
      title: "First boss win",
      description: "Defeat your first boss battle.",
      iconUrl: "",
      trigger: "first_boss_win",
      xpReward: 100,
    },
    { upsert: true }
  );

  let map1 = await Map.findOne({ slug: "airport-101" });
  if (!map1) {
    map1 = await Map.create({
      title: "Airport 101",
      slug: "airport-101",
      description: "Check-in and gate conversation practice.",
      coverImageUrl: "",
      theme: "travel",
      level: 1,
      order: 1,
      prerequisiteMapId: null,
      isPublished: true,
      totalXP: 0,
      requiredXPToComplete: 0,
      bossXPReward: 60,
      unlocksMapId: null,
    });
  }

  let map2 = await Map.findOne({ slug: "city-explorer" });
  if (!map2) {
    map2 = await Map.create({
      title: "City explorer",
      slug: "city-explorer",
      description: "Directions and local transport.",
      coverImageUrl: "",
      theme: "city",
      level: 2,
      order: 2,
      prerequisiteMapId: map1._id,
      isPublished: true,
      totalXP: 0,
      requiredXPToComplete: 0,
      bossXPReward: 80,
      unlocksMapId: null,
    });
  }

  await Map.updateOne({ _id: map1._id }, { $set: { unlocksMapId: map2._id } });

  const existingSteps = await Step.countDocuments({ mapId: map1._id });
  if (existingSteps === 0) {
    await Step.insertMany([
      {
        mapId: map1._id,
        order: 1,
        title: "Check-in desk",
        type: "lesson",
        scenarioTitle: "Airport check-in",
        scenarioContext: "The learner is checking in for a flight and must talk with an airline agent.",
        scenarioScript:
          "AI plays a check-in agent. The learner should greet politely, confirm flight information, ask about baggage, and mention seat preference.",
        aiSystemPrompt:
          "You are a friendly airline staff member at check-in. Keep replies under 3 short sentences. Help the learner practice asking about baggage and seat preferences.",
        openingMessage:
          "Good morning! Welcome to Smart Airways. May I see your passport and booking reference?",
        xpReward: 25,
        minTurns: 2,
        gradingDifficulty: "easy",
        minimumPassScore: 55,
        passCriteria: ["baggage", "seat", "flight"],
        vocabularyFocus: ["check-in", "boarding pass"],
        grammarFocus: ["polite questions", "present simple"],
      },
      {
        mapId: map1._id,
        order: 2,
        title: "Security small talk",
        type: "lesson",
        scenarioTitle: "After check-in",
        scenarioContext: "The learner chats with another traveler while waiting in line.",
        scenarioScript:
          "AI plays another traveler. The learner should ask and answer questions about the gate, departure time, and travel destination.",
        aiSystemPrompt:
          "You are another traveler in line. Chat about flight time and gates casually.",
        openingMessage: "Hi! Long line today — are you flying international?",
        xpReward: 25,
        minTurns: 2,
        gradingDifficulty: "medium",
        minimumPassScore: 65,
        passCriteria: ["gate", "time"],
        vocabularyFocus: ["departure", "terminal"],
        grammarFocus: ["wh- questions", "present continuous"],
      },
      {
        mapId: map1._id,
        order: 3,
        title: "Gate Boss",
        type: "boss",
        scenarioTitle: "Final gate challenge",
        scenarioContext: "The learner must solve a high-pressure gate problem before boarding closes.",
        scenarioScript:
          "AI is a strict gate agent. The learner must ask about boarding time, request a seat change, and clarify a gate change clearly and confidently.",
        aiSystemPrompt:
          "You are a strict gate agent. Test the learner: they must ask about boarding time, request a seat change, and clarify gate changes. Stay in character.",
        openingMessage:
          "Final boarding for flight 204. How can I assist you? Please be quick.",
        xpReward: 30,
        minTurns: 3,
        gradingDifficulty: "hard",
        minimumPassScore: 75,
        passCriteria: ["boarding", "seat"],
        bossName: "Gate Captain",
        bossHPMax: 100,
        playerHPMax: 100,
        bossTasks: [
          { id: "t1", description: "Ask about boarding or departure time" },
          { id: "t2", description: "Request a seat or gate-related change" },
        ],
        vocabularyFocus: ["boarding", "gate"],
        grammarFocus: ["polite requests", "question forms"],
      },
    ]);
  }

  const existing2 = await Step.countDocuments({ mapId: map2._id });
  if (existing2 === 0) {
    await Step.create({
      mapId: map2._id,
      order: 1,
      title: "Ask for directions",
      type: "lesson",
      scenarioTitle: "On the street",
      scenarioContext: "The learner asks a local for directions around the city.",
      scenarioScript:
        "AI is a helpful local. The learner should ask for directions, confirm landmarks, and repeat the route naturally.",
      aiSystemPrompt: "You are a local. Give short helpful directions.",
      openingMessage: "Hey! You look lost — need help finding something?",
      xpReward: 30,
      minTurns: 2,
      gradingDifficulty: "medium",
      minimumPassScore: 65,
      passCriteria: ["station", "street"],
      vocabularyFocus: ["left", "right", "straight"],
      grammarFocus: ["imperatives", "prepositions of place"],
    });
  }

  await recalculateMapTotalXP(map1._id);
  await recalculateMapTotalXP(map2._id);

  console.log("Learn maps seed OK. Maps:", map1.slug, map2.slug);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
