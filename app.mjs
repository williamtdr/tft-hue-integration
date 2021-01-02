import RealtimeTftMonitor from './realtime-tft-monitor.mjs';
import log from './util/log.mjs';
import HueController from './hue-controller.mjs';

let tft = new RealtimeTftMonitor();
let hue = new HueController();

function registerHandlers() {
    log.info("Game", `waiting for connection.`);

    tft.on("sessionStart", () => {
        // todo
        log.info("Game", `session started.`);
    });

    tft.on("RiotEvent", riotEvent => {
        log.info("Game", `riotEvent: ${riotEvent.eventName}`);

        switch(riotEvent.eventName) {
            case "GameStart":
                log.info("Game", `game started at: ${riotEvent.eventTime}`);
                // todo: something cool w/ lights
                break;
            case "MinionsSpawning":
                log.info("Game", `1-4 reached at: ${riotEvent.eventTime}`);
                // fires at 1-4.
                break;
            case "ChampionKill":
                log.info("Game", `this summoner killed.`);
                // todo: lights
                break;
        }
    });

    tft.on("championDeathEvent", summonerName => {
        log.info("Game", `other summoner killed: ${summonerName}`);
        // todo: lights
    });

    tft.on("gameTime", gameTime => {
        // todo
        //log.info("Game", "game time: " + gameTime);
    });

    tft.on("playerLevelUp", playerLevelUp => {
        // todo: make lights blue

        if(playerLevelUp.oldLevel === 0)
            return; // we're just loading in

        log.info("Game", `player has leveled up: ${playerLevelUp.oldLevel} -> ${playerLevelUp.newLevel}`);
    });

    tft.on("playerHealthChange", playerHealthChange => {
        // todo: make lights blue
        if(playerHealthChange.oldHealth === 0)
            return; // we're just loading in

        log.info("Game", `player has new health value: ${playerHealthChange.oldHealth} -> ${playerHealthChange.newHealth}`);
    });

    tft.on("expired", () => {
        log.info("Game", "game has ended, resetting.");
        // recreate event emitter
        tft = new RealtimeTftMonitor();
        registerHandlers();
    });
}

log.setSourceColor("System", "blue");
log.setSourceColor("Hue", "cyan");
log.setSourceColor("Game", "green");

log.info("System", "hello world.");

registerHandlers();
hue.init();
