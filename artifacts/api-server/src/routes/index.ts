import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sbuRouter from "./sbu";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sbuRouter);

export default router;
