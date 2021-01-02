import fetch from 'node-fetch';
import AbortController from 'abort-controller';
import events from 'events';
import RiotEvent from './model/RiotEvent.mjs';
import PlayerLevelUp from './model/PlayerLevelUp.mjs';
import PlayerHealthChange from './model/PlayerHealthChange.mjs';
import {suppressTlsWarning} from './util/supress-tls-warning.mjs';

// ignore self signed cert errors, the riot client doesn't sign its
// local cert
suppressTlsWarning();
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

// where riot's game server lives. fairly undocumented, but /swagger/v2/swagger.json helps
const LOCAL_CLIENT_API_BASE = 'https://127.0.0.1:2999/';

// how often to refresh info when game is running
const GAME_INFO_REALTIME_MS = 50;
// how often to check if game is running
const GAME_INFO_WAITING_MS = 2 * 1000;
// how often to wait for response body from live game data server
// bc sometimes times out when it's offline
const TIMEOUT_CLIENT_API_MS = 1000;

const TFT_MAX_HEALTH = 100;

export default class RealtimeTftMonitor extends events.EventEmitter {
    constructor() {
        super();

        // start update loop
        this.refreshGameStateId = setTimeout(() => this.retrieveCurrentGameState(), GAME_INFO_REALTIME_MS);
        this.pastGameEvents = [];
        this.hasConnectedBefore = false;
        this.playerLastLevel = 0;
        this.playerLastHealth = 0;
        this.deadSummoners = [];
    }

    async retrieveCurrentGameState() {
        const controller = new AbortController();
        const requestTimeout = setTimeout(() => controller.abort(), TIMEOUT_CLIENT_API_MS);

        try {
            const currentGameInfo = await fetch(`${LOCAL_CLIENT_API_BASE}liveclientdata/allgamedata`, { signal: controller.signal })
                .then(res => res.json());

            // right now we're only supporting TFT
            if(currentGameInfo.gameData && currentGameInfo.gameData.gameMode === "TFT") {
                // we're in.
                let isFirstSession = !this.hasConnectedBefore;
                this.hasConnectedBefore = true;

                const activePlayer = currentGameInfo.activePlayer;
                const summonerName = activePlayer.summonerName;
                const level = activePlayer.level;
                const health = activePlayer.championStats.currentHealth;
                const gameTime = currentGameInfo.gameData.gameTime;
                const mapName = currentGameInfo.gameData.mapName;
                // todo: i'm not sure what this means. it doesn't seem to change as you move
                // between boards? maybe the whole map is treated as one object? "Map22"
                const mapNumber = currentGameInfo.gameData.mapNumber;
                // 22, see above note
                const allPlayers = currentGameInfo.allPlayers;

                const events = currentGameInfo.events.Events;

                if(isFirstSession) {
                    this.emit("sessionStart");
                    this.emit("summonerName", summonerName);
                }

                this.emit("gameTime", gameTime);

                for(let event of events) {
                    const riotEvent = new RiotEvent(event.EventID, event.EventName, event.EventTime);

                    // mash everything into a string so we can log it to a list of
                    // things that have happened, and if something new happens, emit an event
                    const identifier = Object.values(event).reduce((acc, cur) => acc + cur, "");

                    if(!this.pastGameEvents.includes(identifier)) {
                        this.pastGameEvents.push(identifier);
                        
                        // don't emit this event on the own player's death.
                        if(!(riotEvent.eventName === "ChampionKill" && event.VictimName === summonerName))
                            this.emit('RiotEvent', riotEvent);
                    }
                }

                if(level !== this.playerLastLevel && level > 1) {
                    this.emit("playerLevelUp", new PlayerLevelUp(this.playerLastLevel, level));
                    this.playerLastLevel = level;
                }
                
                if(health !== this.playerLastHealth && health < TFT_MAX_HEALTH) {
                    this.emit("playerHealthChange", new PlayerHealthChange(this.playerLastHealth, health));
                    this.playerLastHealth = health;
                }

                for(let player of allPlayers) {
                    const summonerName = player.summonerName;

                    if(player.isDead && !this.deadSummoners.includes(summonerName) && summonerName !== activePlayer.summonerName) {
                        this.deadSummoners.push(summonerName);
                        this.emit("championDeathEvent", summonerName);
                    }
                }
            }

            // game is running, schedule next request
            this.refreshGameStateId = setTimeout(() => this.retrieveCurrentGameState(), GAME_INFO_REALTIME_MS);
        } catch (error) {
            if (error.name === "AbortError" || error.errno === "ECONNREFUSED") {
                // game isn't running, refresh slowly...
                this.refreshGameStateId = setTimeout(() => this.retrieveCurrentGameState(), GAME_INFO_WAITING_MS);

                if(this.hasConnectedBefore) {
                    // game has ended.
                    // politely ask caller to destroy and recreate to maintain state
                    this.emit("expired");
                    clearTimeout(this.refreshGameStateId);
                }
            } else {
                // we fucked something up, assume it'll resolve itself and schedule
                // next one quickly
                console.log(error);

                this.refreshGameStateId = setTimeout(() => this.retrieveCurrentGameState(), GAME_INFO_REALTIME_MS);
            }
        } finally {
            clearTimeout(requestTimeout);
        }
    }
}
