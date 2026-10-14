"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const dashboard_js_1 = require("./routes/dashboard.js");
const expenditure_js_1 = require("./routes/expenditure.js");
const trend_js_1 = require("./routes/trend.js");
const logs_js_1 = require("./routes/logs.js");
const strategy_js_1 = require("./routes/strategy.js");
const profile_js_1 = require("./routes/profile.js");
const scaleWeight_js_1 = require("./routes/scaleWeight.js");
const auth_js_1 = require("./routes/auth.js");
const db_js_1 = require("./db.js");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 5001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// API Routes
app.use('/api/auth', auth_js_1.authRouter);
app.use('/api/dashboard', dashboard_js_1.dashboardRouter);
app.use('/api/expenditure', expenditure_js_1.expenditureRouter);
app.use('/api/trend', trend_js_1.trendRouter);
app.use('/api/scale-weight', scaleWeight_js_1.scaleWeightRouter);
app.use('/api/logs', logs_js_1.logsRouter);
app.use('/api/strategy', strategy_js_1.strategyRouter);
app.use('/api/profile', profile_js_1.profileRouter);
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});
const server = app.listen(port, () => {
    console.log(`MacroFactor API Server running on http://localhost:${port}`);
});
const shutdown = async (signal) => {
    server.close(async () => {
        try {
            await db_js_1.prisma.$disconnect();
        }
        catch {
            // ignore error on disconnect
        }
        process.exit(0);
    });
    // Fallback force exit after 1s if sockets remain open
    setTimeout(() => {
        process.exit(0);
    }, 1000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
