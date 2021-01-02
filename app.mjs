import RealtimeTftMonitor from './realtime-tft-monitor.mjs';
import log from './util/log.mjs';
import HueController from './hue-controller.mjs';

let tft = new RealtimeTftMonitor();
let hue = new HueController();

function registerHandlers() {
    let summonerName = null;
    let otherPlayersHaveDied = 0;
    let playerisAlive = true;

    log.info("Game", `waiting for connection.`);

    tft.on("sessionStart", () => {
        log.info("Game", `session started.`);
    });

    tft.on("summonerName", newSummonerName => {
        summonerName = newSummonerName;
        log.info("Game", `playing as: ${summonerName}`);
    });

    tft.on("RiotEvent", riotEvent => {
        log.info("Game", `riotEvent: ${riotEvent.eventName}`);

        switch(riotEvent.eventName) {
            case "GameStart":
                log.info("Game", `game started at: ${riotEvent.eventTime}`);
                hue.softHello();
                break;
            case "MinionsSpawning":
                log.info("Game", `1-4 reached at: ${riotEvent.eventTime}`);
                // fires at 1-4.
                break;
            case "ChampionKill":
                log.info("Game", `this summoner killed.`);
                playerisAlive = false;
                hue.ownDeath();
                break;
            case "GameEnd":
                // do we care abt this?
                break;
        }
    });

    tft.on("championDeathEvent", summonerName => {
        log.info("Game", `other summoner killed: ${summonerName}`);
        otherPlayersHaveDied++;

        // on top four or top six, play special animation
        if((otherPlayersHaveDied === 4 || otherPlayersHaveDied === 6) && playerisAlive) {
            // give a small delay in case game sends own death event right after
            setTimeout(() => playerisAlive ? hue.topFour() : null, 200);
        } else
            hue.otherPlayerDied();
    });

    tft.on("gameTime", gameTime => {
        // todo
        //log.info("Game", "game time: " + gameTime);

        // if(gameTime > 27 && gameTime < 28)
        //     return hue.pulseBeforeRound();
    });

    tft.on("playerLevelUp", playerLevelUp => {
        if(playerLevelUp.oldLevel === 0)
            return; // we're just loading in

        log.info("Game", `player has leveled up: ${playerLevelUp.oldLevel} -> ${playerLevelUp.newLevel}`);
        hue.levelUp();
    });

    tft.on("playerHealthChange", playerHealthChange => {
        if(playerHealthChange.oldHealth === 0)
            return; // we're just loading in

        log.info("Game", `player has new health value: ${playerHealthChange.oldHealth} -> ${playerHealthChange.newHealth}`);
        hue.ow();
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

process.stdin.resume(); // so the program will not close instantly

async function exitHandler(options, exitCode) {
    await hue.restoreState();
    if (options.exit) process.exit();
}

// do something when app is closing
process.on('exit', exitHandler.bind(null, {}));

process.on('SIGINT', exitHandler.bind(null, {exit:true}));

process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));
