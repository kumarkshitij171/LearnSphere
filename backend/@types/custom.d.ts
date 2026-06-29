import { Iuser } from "../interfaces/user.interface";
import { Course } from "@prisma/client";
import { Request } from "express";
// extra optional properties attached by auth/ownership middleware
declare global{
    namespace Express{
        interface Request{
            user?: Iuser
            course?: Course
        }
    }
}