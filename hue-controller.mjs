import nodeHue from 'node-hue-api';
import fs from 'fs';
import events from 'events';
import log from './util/log.mjs';
import {ANIMATION_PRI_HIGH, ANIMATION_PRI_LOW, ANIMATION_PRI_MED, AnimationManager} from './manager/animation.mjs';

const LightState = nodeHue.v3.lightStates.LightState;
const GroupLightState = nodeHue.v3.lightStates.GroupLightState;
const v3 = nodeHue.v3;
const discovery = v3.discovery;
const hueApi = v3.api;

const appName = "dyn-tft-lght";
const deviceName = "tft";
const configFilename = "hue-credentials.json"

const TRANSITION_INSTANT = 0;
const TRANSITION_V_FAST = 1;
const TRANSITION_FAST = 2;
const TRANSITION_MIDDLE = 4;
const TRANSITION_SLOW = 8;

// a nice warm white
const BASE_COLOR = [0.4578, 0.41];

export default class HueController extends events.EventEmitter {
    constructor() {
        super();

        this.authenticatedApi = null;
        this.lightsInitialState = [];
        this.restoredDefaultState = false;
        this.lightGroup = null;
        this.animations = new AnimationManager();
    }

    log(msg) {
        log.info("Hue", msg);
    }

    async init() {
        await this.discoverAndCreateUser();
    }

    async discoverBridge() {
        const discoveryResults = await discovery.nupnpSearch();

        if (discoveryResults.length === 0) {
            this.log('Failed to resolve any Hue Bridges');

            return null;
        } else {
            // Ignoring that you could have more than one Hue Bridge on a network as this is unlikely in 99.9% of users situations
            return discoveryResults[0].ipaddress;
        }
    }

    async discoverAndCreateUser() {
        const ipAddress = await this.discoverBridge();

        if(fs.existsSync(configFilename)) {
            this.log("Retrieving saved credentials from file.");

            const contents = JSON.parse(fs.readFileSync(configFilename).toString());

            this.authenticatedApi = await hueApi.createLocal(ipAddress).connect(contents.username);
        } else {
            // Create an unauthenticated instance of the Hue API so that we can create a new user
            const unauthenticatedApi = await hueApi.createLocal(ipAddress).connect();

            let createdUser;
            try {
                createdUser = await unauthenticatedApi.users.createUser(appName, deviceName);
                this.log('*******************************************************************************\n');
                this.log('User has been created on the Hue Bridge. The following username can be used to\n' +
                    'authenticate with the Bridge and provide full local access to the Hue Bridge.\n' +
                    'YOU SHOULD TREAT THIS LIKE A PASSWORD\n');
                this.log(`Hue Bridge User: ${createdUser.username}`);
                this.log(`Hue Bridge User Client Key: ${createdUser.clientkey}`);
                this.log('*******************************************************************************\n');

                // save username / key:
                fs.writeFileSync(configFilename, JSON.stringify({
                    username: createdUser.username,
                    clientkey: createdUser.clientkey
                }));

                this.log("Connecting...");

                // Create a new API instance that is authenticated with the new user we created
                this.authenticatedApi = await hueApi.createLocal(ipAddress).connect(createdUser.username);
            } catch(err) {
                if (err.getHueErrorType() === 101) {
                    this.log('The Link button on the bridge was not pressed. Please press the Link button and try again.');

                    return;
                } else {
                    this.log(`Unexpected Error: ${err.message}`);

                    return;
                }
            }
        }

        // Do something with the authenticated user/api
        const bridgeConfig = await this.authenticatedApi.configuration.getConfiguration();
        this.log(`Connected to Hue Bridge: ${bridgeConfig.name} :: ${bridgeConfig.ipaddress}`);

        this.storeInitialState();
    }

    storeInitialState() {
        this.authenticatedApi.groups.getRooms()
            .then(groups => {
                this.lightGroup = groups[0];
            });

        this.authenticatedApi.lights.getAll()
            .then(allLights => {
                for(let light of allLights) {
                    // record state of the world before we start making modifications
                    this.lightsInitialState.push({
                        id: light.id,
                        state: new LightState().populate(light.state)
                    });
                }
            });
    }

    setXY(xy, transition = TRANSITION_SLOW) {
        if(!this.authenticatedApi) {
            // we're still connecting...
            return;
        }

        let alertState = new GroupLightState()
            .xy(xy[0], xy[1])
            .transitiontime(transition);

        return this.authenticatedApi.groups.setGroupState(this.lightGroup.id, alertState);
    }

    async softHello() {
        const softBlue = [0.2976, 0.2348];
        const time = 12000 + 10000 + 3000; // 12s locked out of center, 10s choosing champ, 3s transition

        await this.animations.run(
            "softHello",
            ANIMATION_PRI_HIGH,
            () => this.setXY(softBlue, TRANSITION_SLOW),
            () => this.setXY(BASE_COLOR, TRANSITION_SLOW),
            time,
            1000
        );
    }

    async pulseBeforeRound() {
        if(this.isAnimating)
            return false;

        this.isAnimating = true;

        let alertState = new GroupLightState()
            .hue(43690)
            .alertLong();

        await this.authenticatedApi.groups.setGroupState(this.lightGroup.id, alertState);

        setTimeout(async () => {
            let alertState = new GroupLightState()
                .xy(BASE_COLOR)
                .alertNone()
                .transitiontime(TRANSITION_MIDDLE);

            await this.authenticatedApi.groups.setGroupState(this.lightGroup.id, alertState);
        }, 2800);
        setTimeout(() => this.isAnimating = false, 3300);
    }

    async ownDeath() {
        const red = [0.5081, 0.2384];

        await this.animations.run(
            "ownDeath",
            ANIMATION_PRI_HIGH,
            () => this.setXY(red, TRANSITION_INSTANT),
            () => this.setXY(BASE_COLOR, TRANSITION_MIDDLE),
            10000,
            800
        );
    }

    async ow() {
        const red = [0.479, 0.2748];

        await this.animations.run(
            "ow",
            ANIMATION_PRI_LOW,
            () => this.setXY(red, TRANSITION_INSTANT),
            () => this.setXY(BASE_COLOR, TRANSITION_INSTANT),
            20,
            400
        );
    }

    async levelUp() {
        const blue = [0.292, 0.2251];

        await this.animations.run(
            "levelUp",
            ANIMATION_PRI_MED,
            () => this.setXY(blue, TRANSITION_FAST),
            () => this.setXY(BASE_COLOR, TRANSITION_FAST),
            1500,
            400
        );
    }

    async otherPlayerDied() {
        const green = [0.311, 0.4989];

        await this.animations.run(
            "otherPlayerDied",
            ANIMATION_PRI_MED,
            () => this.setXY(green, TRANSITION_MIDDLE),
            () => this.setXY(BASE_COLOR, TRANSITION_MIDDLE),
            4000,
            800
        );
    }

    async topFour() {
        const orange = [0.5858, 0.3708];

        await this.animations.run(
            "topFour",
            ANIMATION_PRI_MED,
            () => this.setXY(orange, TRANSITION_MIDDLE),
            () => this.setXY(BASE_COLOR, TRANSITION_MIDDLE),
            4000,
            800
        );
    }

    restoreState() {
        if(this.restoredDefaultState)
           return;

        this.restoredDefaultState = true;
        log.info("Hue", "restoring default state...");
        return Promise.all(this.lightsInitialState.map(state => this.authenticatedApi.lights.setLightState(state.id, state.state.alertNone())));
    }
}
