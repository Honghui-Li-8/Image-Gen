import { EventEmitter } from "events";

export const generationEmitter = new EventEmitter();
generationEmitter.setMaxListeners(0);
