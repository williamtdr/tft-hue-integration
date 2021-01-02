import nodeHue from 'node-hue-api';
import fs from 'fs';
import events from 'events';
import log from './util/log.mjs';

const v3 = nodeHue.v3;
const discovery = v3.discovery;
const hueApi = v3.api;

const appName = "dyn-tft-lght";
const deviceName = "tft";
const configFilename = "hue-credentials.json"
const POLLING_FREQ = 1000;

export default class HueController extends events.EventEmitter {
    constructor() {
        super();

        this.authenticatedApi = null;
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

        setInterval(() => {
            this.pollForBrightness();
        }, POLLING_FREQ);
    }

    pollForBrightness() {
        this.authenticatedApi.lights.getAll()
            .then(allLights => {
                let brightnesses = [];

                for(let light of allLights) {
                    let brightness = light.state.bri;

                    if(!light.state.on)
                        brightness = 0;

                    brightnesses.push(brightness);
                }

                // don't change anything if we haven't found any lights
                if(!brightnesses.length)
                    return;

                const avgBrightness = brightnesses.reduce((a, b) => a + b) / brightnesses.length;
                const isFirstResponse = !this.hasValue;
                const lastBrightnessWas = this.brightnessShouldBe;

                this.hasValue = true;

                if(isFirstResponse || lastBrightnessWas !== this.brightnessShouldBe) {
                    this.emit('brightnessShouldBe', this.brightnessShouldBe);
                }
            });
    }
}
