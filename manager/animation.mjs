import log from '../util/log.mjs';

export let ANIMATION_PRI_HIGH = 1;
export let ANIMATION_PRI_MED = 2;
export let ANIMATION_PRI_LOW = 3;

// how long it takes the lights to reset
const TIME_TO_RESET_MS = 600;
// cancel completion of current animation if newer, higher-priority one comes in
const ATTEMPT_MID_ANIMATION_TRANSITION = true;

export class AnimationManager {
    constructor() {
        this.epoch = Date.now();

        this.curPriority = null;
        this.curName = null;
        this.curNextTimeoutId = null;
        this.curCompletionTimeoutId = null;
    }

    /**
     * tries to play an animation. mutex to avoid flicker.
     *
     * @param name - for logging purposes
     * @param priority - lower is higher, to resolve conflicts
     * @param execute - function to call if the animation is going to play
     * @param next - function to call to complete animation
     * @param nextDelayMs - when to call next fn
     * @param completesInMs - how long for lights to reset as part of transition
     *
     * @returns boolean whether the animation was played.
     */
    run(name, priority, execute, next, nextDelayMs, completesInMs = TIME_TO_RESET_MS) {
        log.info("Animations", `trying to play animation ${name} with priority ${priority}.`);

        if((Date.now() - this.epoch) < 1000) { // 1s
            log.info("Animations", `not executing because startup was too recent.`);

            return;
        }

        // newer animation should be strictly higher priority. if current is running
        // of same priority, the current one gets to play.
        if(this.curPriority != null && this.curPriority <= priority) {
            log.info("Animations", `not executing because animation ${this.curName} with priority ${this.curPriority} is still running.`);

            return false;
        }

        if(this.curPriority != null && ATTEMPT_MID_ANIMATION_TRANSITION) {
            log.info("Animations", `newer priority is higher (${priority}) than existing animation ${this.curPriority} (${this.curPriority}.`);
            log.info("Animations", `cancelling and switching.`);

            clearTimeout(this.curNextTimeoutId);
            clearTimeout(this.curCompletionTimeoutId);
        }

        this.curPriority = priority;
        this.curName = name;
        this.curNextTimeoutId = setTimeout(next, nextDelayMs);

        this.curCompletionTimeoutId = setTimeout(() => {
            log.info("Animations", `animation ${this.curName} complete.`);

            this.curName = null;
            this.curPriority = null;
        }, nextDelayMs + completesInMs);

        execute();

        return true;
    }
}
