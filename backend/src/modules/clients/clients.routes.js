const express = require("express");
const { listClientsHandler, resetClientPasswordHandler, setClientActiveHandler, getClientDetailsHandler, unlinkDeviceHandler, sendEmailToClientHandler } = require("./clients.controller");

const clientsRouter = express.Router();

clientsRouter.get("/",                                    listClientsHandler);
clientsRouter.get("/:tenantId",                           getClientDetailsHandler);
clientsRouter.post("/:tenantId/reset-password",           resetClientPasswordHandler);
clientsRouter.post("/:tenantId/send-email",               sendEmailToClientHandler);
clientsRouter.put("/:tenantId/set-active",                setClientActiveHandler);
clientsRouter.delete("/:tenantId/devices/:deviceId",      unlinkDeviceHandler);

module.exports = { clientsRouter };
