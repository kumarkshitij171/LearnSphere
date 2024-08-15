import dotenv from 'dotenv';
import { app } from "./app";
import { connectDB } from "./utils/db";
import rateLimit from 'express-rate-limit';
dotenv.config();

connectDB();

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
const PORT: any = process.env.PORT || 5000;

app.use(limiter);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})
