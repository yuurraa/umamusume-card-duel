import express from "express";
import cors from "cors";
import { gameData, MAX_BENCH, MAX_HAND, MAX_POINTS, OPENING_HAND } from "../../shared/src";
const app = express();
const port = Number(process.env.PORT || 8787);
app.use(cors());
app.use(express.json());
app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
});
app.get("/api/game-data", (_request, response) => {
    response.json({
        ...gameData,
        rules: {
            maxBench: MAX_BENCH,
            maxHand: MAX_HAND,
            maxPoints: MAX_POINTS,
            openingHand: OPENING_HAND,
            weaknessBonus: 20,
            noDeckOutLoss: true,
            firstPlayerSkipsDrawAndEnergy: true,
            supporterLimitPerTurn: 1,
            unlimitedTrainerTypes: ["item", "stadium"],
        },
    });
});
app.listen(port, () => {
    console.log(`Umamusume Pocket backend listening on http://127.0.0.1:${port}`);
});
