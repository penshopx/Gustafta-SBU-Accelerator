import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sbuRouter from "./sbu";
import ruangSimpanRouter from "./ruang-simpan";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sbuRouter);
router.use(ruangSimpanRouter);

export default router;
