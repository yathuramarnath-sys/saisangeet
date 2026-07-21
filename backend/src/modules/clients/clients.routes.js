const express = require("express");
const { listClientsHandler, resetClientPasswordHandler, setClientActiveHandler } = require("./clients.controller");

const clientsRouter = express.Router();

clientsRouter.get("/",                          listClientsHandler);
clientsRouter.post("/:tenantId/reset-password", resetClientPasswordHandler);
clientsRouter.put("/:tenantId/set-active",      setClientActiveHandler);

module.exports = { clientsRouter };
