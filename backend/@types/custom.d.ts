import { Iuser } from "../interfaces/user.interface";
import { Request } from "express";
// adding one extra optional property in the request from the express
declare global{
    namespace Express{
        interface Request{
            user?: Iuser
        }
    }
}